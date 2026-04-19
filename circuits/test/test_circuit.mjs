import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import * as snarkjs from "snarkjs";
import { LeanIMT } from "@zk-kit/lean-imt";
import { poseidon2, poseidon4 } from "poseidon-lite";
import { mulPointEscalar, Base8, order as jubOrder } from "@zk-kit/baby-jubjub";

// eddsa-poseidon's ESM build does named imports on blakejs (CJS-only),
// which Node 22 ESM loader rejects. Load the CJS variant instead.
const require = createRequire(import.meta.url);
const { signMessage, derivePublicKey } = require("@zk-kit/eddsa-poseidon");
const { blake2b } = require("blakejs");

const __dirname = dirname(fileURLToPath(import.meta.url));
const WASM = join(__dirname, "../build/medical_disclosure_js/medical_disclosure.wasm");
const ZKEY = join(__dirname, "../build/medical_disclosure_final.zkey");
const VKEY = JSON.parse(readFileSync(join(__dirname, "../build/verification_key.json"), "utf8"));

const BN254_R = BigInt(
	"21888242871839275222246405745257275088548364400416034343698204186575808495617",
);
const MAX_DEPTH = 8;
const SUB_ORDER = jubOrder >> 3n;

function blake2bBigint(s, bytes) {
	const hash = blake2b(new TextEncoder().encode(s), undefined, 32);
	const hex = Array.from(hash.slice(0, bytes))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
	return BigInt("0x" + hex);
}

// For a field-sized hash, take 31 bytes so the result is always < 2^248 < BN254_R.
const fieldHash = (s) => blake2bBigint(s, 31);

// ----- Test record -----
const TEST_FIELDS = [
	["name", "Alice"],
	// The "value" for the field we're going to disclose is the AES key itself.
	// For other fields the value can still be a regular string.
	["age", "34"],
	["condition", "diabetes"],
	["bloodType", "A+"],
];

// ----- Choose the disclosed field -----
const FIELD_IDX = 1;
const [fieldKey] = TEST_FIELDS[FIELD_IDX];

// The AES key: 32 random bytes split into two 128-bit halves.
const aesKey = new Uint8Array(32);
crypto.getRandomValues(aesKey);
const aesHi = BigInt(
	"0x" +
		Array.from(aesKey.slice(0, 16))
			.map((b) => b.toString(16).padStart(2, "0"))
			.join(""),
);
const aesLo = BigInt(
	"0x" +
		Array.from(aesKey.slice(16, 32))
			.map((b) => b.toString(16).padStart(2, "0"))
			.join(""),
);
const fieldValueHash = poseidon2([aesHi, aesLo]);

// ----- Build Merkle tree: disclosed field's leaf commits to aes-key hash -----
const hashFn = (a, b) => poseidon2([a, b]);
const tree = new LeanIMT(hashFn);
for (let i = 0; i < TEST_FIELDS.length; i++) {
	const [k] = TEST_FIELDS[i];
	if (i === FIELD_IDX) {
		tree.insert(poseidon2([fieldHash(k), fieldValueHash]));
	} else {
		tree.insert(poseidon2([fieldHash(k), fieldHash(TEST_FIELDS[i][1])]));
	}
}

// ----- Medic EdDSA signature over root -----
const MEDIC_PRIV = "0x5fb92d6e98884f76de468fa3f6278f8807c48bebc13595d45af5bdc4da702133";
const signature = signMessage(MEDIC_PRIV, tree.root);
const pubKey = derivePublicKey(MEDIC_PRIV);

// ----- Buyer BabyJubJub keypair (researcher side) -----
const skBuyer = (() => {
	const buf = new Uint8Array(32);
	crypto.getRandomValues(buf);
	let n = 0n;
	for (const b of buf) n = (n << 8n) | BigInt(b);
	return n % SUB_ORDER;
})();
const pkBuyer = mulPointEscalar(Base8, skBuyer);

// ----- Patient ephemeral keypair -----
const ephSk = (() => {
	const buf = new Uint8Array(32);
	crypto.getRandomValues(buf);
	let n = 0n;
	for (const b of buf) n = (n << 8n) | BigInt(b);
	return n % SUB_ORDER;
})();
const ephPk = mulPointEscalar(Base8, ephSk);

// ----- ECDH + stream-cipher encrypt off-circuit -----
const shared = mulPointEscalar(pkBuyer, ephSk); // ephSk · pkBuyer
const nonce = 7n; // mimics orderId
const pad0 = poseidon4([shared[0], shared[1], nonce, 0n]);
const pad1 = poseidon4([shared[0], shared[1], nonce, 1n]);
const ciphertext = [(aesHi + pad0) % BN254_R, (aesLo + pad1) % BN254_R];

// ----- Witness -----
const proof = tree.generateProof(FIELD_IDX);
const siblings = [...proof.siblings, ...Array(MAX_DEPTH - proof.siblings.length).fill(0n)];
const indices = Array.from({ length: MAX_DEPTH }, (_, i) => (proof.index >> i) & 1);

const input = {
	indices,
	merkleSiblings: siblings,
	depth: proof.siblings.length,
	fieldKeyHash: fieldHash(fieldKey),
	fieldValueHash,
	sigR8x: signature.R8[0],
	sigR8y: signature.R8[1],
	sigS: signature.S,
	ephemeralSk: ephSk,
	plaintext: [aesHi, aesLo],
	merkleRoot: tree.root,
	pubKeyX: pubKey[0],
	pubKeyY: pubKey[1],
	pkBuyerX: pkBuyer[0],
	pkBuyerY: pkBuyer[1],
	ephemeralPkX: ephPk[0],
	ephemeralPkY: ephPk[1],
	ciphertext,
	nonce,
};

console.log(`Tree root:   ${tree.root}`);
console.log(`Proving:     ${fieldKey} = <AES key>`);
console.log(`Constraints: (see build output)`);

console.log("\n==> Generating proof...");
const t0 = Date.now();
const { proof: zkProof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM, ZKEY);
console.log(`Proof generated in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

const expected = [
	tree.root,
	pubKey[0],
	pubKey[1],
	pkBuyer[0],
	pkBuyer[1],
	ephPk[0],
	ephPk[1],
	ciphertext[0],
	ciphertext[1],
	nonce,
];
for (let i = 0; i < 10; i++) {
	const got = BigInt(publicSignals[i]);
	if (got !== expected[i]) {
		console.error(`pubSignal[${i}] mismatch: got ${got}, expected ${expected[i]}`);
		process.exit(1);
	}
}
console.log("✓ 10 public signals match expected layout");

const valid = await snarkjs.groth16.verify(VKEY, publicSignals, zkProof);
console.log(`Proof valid: ${valid}`);
if (!valid) process.exit(1);

// ----- Researcher-side decryption sanity check -----
const sharedR = mulPointEscalar(ephPk, skBuyer); // must equal `shared`
if (sharedR[0] !== shared[0] || sharedR[1] !== shared[1]) {
	console.error("ECDH mismatch: researcher-side shared secret differs");
	process.exit(1);
}
const recPad0 = poseidon4([sharedR[0], sharedR[1], nonce, 0n]);
const recPad1 = poseidon4([sharedR[0], sharedR[1], nonce, 1n]);
const recHi = (ciphertext[0] - recPad0 + BN254_R) % BN254_R;
const recLo = (ciphertext[1] - recPad1 + BN254_R) % BN254_R;
if (recHi !== aesHi || recLo !== aesLo) {
	console.error("AES-key recovery failed");
	process.exit(1);
}
console.log("✓ Researcher successfully decrypted AES key from ciphertext + ephPk + skBuyer");

const calldata = await snarkjs.groth16.exportSolidityCallData(zkProof, publicSignals);
console.log("\nSolidity calldata (first 200 chars):");
console.log(calldata.slice(0, 200) + "...");
