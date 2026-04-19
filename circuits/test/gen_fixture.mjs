// Regenerate contracts/pvm/test/fixtures/phase5_proof.json after rebuilding the circuit.
// Run:  cd circuits && node test/gen_fixture.mjs
//
// Emits a deterministic fixture: orderId=0, a fixed medic key, a fixed buyer key
// and a fixed ephemeral key. The hardhat test places orderId 0 with the same
// pkBuyerX/Y and the same listing merkleRoot, then submits this exact proof.

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import * as snarkjs from "snarkjs";
import { LeanIMT } from "@zk-kit/lean-imt";
import { poseidon2, poseidon4 } from "poseidon-lite";
import { mulPointEscalar, Base8, order as jubOrder } from "@zk-kit/baby-jubjub";

const require = createRequire(import.meta.url);
const { signMessage, derivePublicKey } = require("@zk-kit/eddsa-poseidon");
const { blake2b } = require("blakejs");

const __dirname = dirname(fileURLToPath(import.meta.url));
const WASM = join(__dirname, "../build/medical_disclosure_js/medical_disclosure.wasm");
const ZKEY = join(__dirname, "../build/medical_disclosure_final.zkey");
const OUT = join(__dirname, "../../contracts/pvm/test/fixtures/phase5_proof.json");

const BN254_R = BigInt(
	"21888242871839275222246405745257275088548364400416034343698204186575808495617",
);
const MAX_DEPTH = 8;
const SUB_ORDER = jubOrder >> 3n;

function fieldHash(s) {
	const hash = blake2b(new TextEncoder().encode(s), undefined, 32);
	const hex = Array.from(hash.slice(0, 31))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
	return BigInt("0x" + hex);
}

// Deterministic-ish values (fixed scalars so the fixture is reproducible)
const MEDIC_PRIV = "0x5fb92d6e98884f76de468fa3f6278f8807c48bebc13595d45af5bdc4da702133";
const SK_BUYER = 1234567890123456789n % SUB_ORDER;
const EPH_SK = 9876543210987654321n % SUB_ORDER;
const AES_HI = 0x0123456789abcdef0123456789abcdefn;
const AES_LO = 0xfedcba9876543210fedcba9876543210n;
const ORDER_ID = 0n;

// aesKeyCommit is stored on-chain per listing (no longer tied to a Merkle leaf).
const aesKeyCommit = poseidon2([AES_HI, AES_LO]);
const TEST_FIELDS = [
	["name", fieldHash("Alice")],
	["age", fieldHash("34")],
	["condition", fieldHash("diabetes")],
	["bloodType", fieldHash("A+")],
];
const FIELD_IDX = 1;

const tree = new LeanIMT((a, b) => poseidon2([a, b]));
for (const [k, v] of TEST_FIELDS) {
	tree.insert(poseidon2([fieldHash(k), v]));
}

const sig = signMessage(MEDIC_PRIV, tree.root);
const pubKey = derivePublicKey(MEDIC_PRIV);
const pkBuyer = mulPointEscalar(Base8, SK_BUYER);
const ephPk = mulPointEscalar(Base8, EPH_SK);
const shared = mulPointEscalar(pkBuyer, EPH_SK);
const pad0 = poseidon4([shared[0], shared[1], ORDER_ID, 0n]);
const pad1 = poseidon4([shared[0], shared[1], ORDER_ID, 1n]);
const ciphertext = [(AES_HI + pad0) % BN254_R, (AES_LO + pad1) % BN254_R];

const proof = tree.generateProof(FIELD_IDX);
const siblings = [...proof.siblings, ...Array(MAX_DEPTH - proof.siblings.length).fill(0n)];
const indices = Array.from({ length: MAX_DEPTH }, (_, i) => (proof.index >> i) & 1);

const input = {
	indices,
	merkleSiblings: siblings,
	depth: proof.siblings.length,
	fieldKeyHash: fieldHash("age"),
	fieldValueHash: TEST_FIELDS[FIELD_IDX][1],
	sigR8x: sig.R8[0],
	sigR8y: sig.R8[1],
	sigS: sig.S,
	ephemeralSk: EPH_SK,
	plaintext: [AES_HI, AES_LO],
	merkleRoot: tree.root,
	pubKeyX: pubKey[0],
	pubKeyY: pubKey[1],
	pkBuyerX: pkBuyer[0],
	pkBuyerY: pkBuyer[1],
	ephemeralPkX: ephPk[0],
	ephemeralPkY: ephPk[1],
	ciphertext,
	nonce: ORDER_ID,
	aesKeyCommit,
};

console.log("Generating fixture proof...");
const { proof: zkProof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM, ZKEY);
console.log("Done.");

// Solidity calldata: a = [pi_a[0], pi_a[1]]; b = [[pi_b[0][1], pi_b[0][0]], [pi_b[1][1], pi_b[1][0]]]; c = [pi_c[0], pi_c[1]]
const toHex = (x) => "0x" + BigInt(x).toString(16).padStart(64, "0");
const fixture = {
	// listing input
	merkleRoot: toHex(tree.root),
	statementHash: "0x" + "ab".repeat(32),
	aesKeyCommit: aesKeyCommit.toString(),
	// order input
	pkBuyerX: pkBuyer[0].toString(),
	pkBuyerY: pkBuyer[1].toString(),
	orderId: Number(ORDER_ID),
	// proof
	a: [toHex(zkProof.pi_a[0]), toHex(zkProof.pi_a[1])],
	b: [
		// Solidity BN254 pairing expects G2 in (imaginary, real) order; snarkjs emits (real, imaginary)
		[toHex(zkProof.pi_b[0][1]), toHex(zkProof.pi_b[0][0])],
		[toHex(zkProof.pi_b[1][1]), toHex(zkProof.pi_b[1][0])],
	],
	c: [toHex(zkProof.pi_c[0]), toHex(zkProof.pi_c[1])],
	pubSignals: publicSignals.map((s) => BigInt(s).toString()),
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(fixture, null, 2) + "\n");
console.log(`Wrote ${OUT}`);
