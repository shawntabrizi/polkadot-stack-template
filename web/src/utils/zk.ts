import * as snarkjs from "snarkjs";
import { LeanIMT } from "@zk-kit/lean-imt";
import { poseidon2, poseidon4 } from "poseidon-lite";
import { blake2b } from "blakejs";
import { mulPointEscalar, Base8, order as jubOrder } from "@zk-kit/baby-jubjub";

const MAX_DEPTH = 8;
const WASM_URL = "/circuits/medical_disclosure.wasm";
const ZKEY_URL = "/circuits/medical_disclosure_final.zkey";
const SUB_ORDER = jubOrder >> 3n;
const BN254_R = BigInt(
	"21888242871839275222246405745257275088548364400416034343698204186575808495617",
);

export interface MerklePackage {
	fields: Record<string, unknown>;
	merkleRoot: string;
	merkleTree: { leaves: string[]; depth: number };
	signature: { R8x: string; R8y: string; S: string };
	publicKey: { x: string; y: string };
	signedAt: string;
}

export interface SolidityProof {
	a: readonly [bigint, bigint];
	b: readonly [readonly [bigint, bigint], readonly [bigint, bigint]];
	c: readonly [bigint, bigint];
	/** pubSignals layout (see MedicalMarket.sol header). */
	pubSignals: readonly [
		bigint,
		bigint,
		bigint,
		bigint,
		bigint,
		bigint,
		bigint,
		bigint,
		bigint,
		bigint,
		bigint,
	];
}

function stringToBigint(s: string): bigint {
	const bytes = new TextEncoder().encode(s);
	const hash = blake2b(bytes, undefined, 32);
	const hex = Array.from(hash.slice(0, 31))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
	return BigInt("0x" + hex);
}

function u8ArrayToBigint(a: Uint8Array): bigint {
	let n = 0n;
	for (const b of a) n = (n << 8n) | BigInt(b);
	return n;
}

function bigintToU8Array(n: bigint, len: number): Uint8Array {
	const out = new Uint8Array(len);
	for (let i = len - 1; i >= 0; i--) {
		out[i] = Number(n & 0xffn);
		n >>= 8n;
	}
	return out;
}

/** Split a 32-byte AES key into two 128-bit field elements (hi, lo). */
export function splitAesKey(key: Uint8Array): [bigint, bigint] {
	if (key.length !== 32) throw new Error("AES key must be exactly 32 bytes");
	return [u8ArrayToBigint(key.slice(0, 16)), u8ArrayToBigint(key.slice(16, 32))];
}

/** Rejoin (hi, lo) field halves into a 32-byte AES key. */
export function joinAesKey(hi: bigint, lo: bigint): Uint8Array {
	const out = new Uint8Array(32);
	out.set(bigintToU8Array(hi, 16), 0);
	out.set(bigintToU8Array(lo, 16), 16);
	return out;
}

/** Poseidon commitment of an AES key — stored on-chain per listing and bound in the ZK proof. */
export function aesKeyToCommit(key: Uint8Array): bigint {
	const [hi, lo] = splitAesKey(key);
	return poseidon2([hi, lo]);
}

function randomScalar(): bigint {
	const buf = new Uint8Array(32);
	crypto.getRandomValues(buf);
	return u8ArrayToBigint(buf) % SUB_ORDER;
}

/** Get-or-create a persistent BabyJubJub secret scalar keyed by `storageKey`. */
export function getOrCreateBuyerKey(storageKey: string): {
	sk: bigint;
	pk: { x: bigint; y: bigint };
} {
	const stored = localStorage.getItem(storageKey);
	let sk: bigint;
	if (stored) {
		sk = BigInt(stored);
	} else {
		sk = randomScalar();
		localStorage.setItem(storageKey, sk.toString());
	}
	const p = mulPointEscalar(Base8, sk);
	return { sk, pk: { x: p[0], y: p[1] } };
}

/** Researcher-side decrypt: recover AES key from ciphertext + ephemeral pk + buyer sk. */
export function decryptCiphertext(
	ephPk: { x: bigint; y: bigint },
	c0: bigint,
	c1: bigint,
	skBuyer: bigint,
	nonce: bigint,
): Uint8Array {
	const shared = mulPointEscalar([ephPk.x, ephPk.y], skBuyer);
	const pad0 = poseidon4([shared[0], shared[1], nonce, 0n]);
	const pad1 = poseidon4([shared[0], shared[1], nonce, 1n]);
	const hi = (c0 - pad0 + BN254_R) % BN254_R;
	const lo = (c1 - pad1 + BN254_R) % BN254_R;
	return joinAesKey(hi, lo);
}

/**
 * Generate a Phase 5 Groth16 proof for atomic ZKCP fulfillment.
 *
 * The proof attests:
 *   1. `fieldKey` is a leaf of the medic-signed Merkle tree.
 *   2. Poseidon(aesKey_hi, aesKey_lo) == aesKeyCommit (per-listing, on-chain).
 *   3. The public ciphertext decrypts under ECDH(ephemeralSk, pkBuyer) to that AES key.
 */
export async function generateProofWithEncryption(
	pkg: MerklePackage,
	fieldKey: string,
	aesKey: Uint8Array,
	pkBuyer: { x: bigint; y: bigint },
	nonce: bigint,
): Promise<SolidityProof> {
	const fieldValue = String((pkg.fields as Record<string, unknown>)[fieldKey]);

	const hashFn = (a: bigint, b: bigint) => poseidon2([a, b]);
	const tree = new LeanIMT<bigint>(hashFn);
	tree.insertMany(pkg.merkleTree.leaves.map(BigInt));

	const targetLeaf = poseidon2([stringToBigint(fieldKey), stringToBigint(fieldValue)]);
	const leafIdx = pkg.merkleTree.leaves.findIndex((l) => BigInt(l) === targetLeaf);
	if (leafIdx === -1) throw new Error(`Field "${fieldKey}" not found in Merkle tree`);

	const merkleProof = tree.generateProof(leafIdx);
	const depth = merkleProof.siblings.length;
	const siblings = [...merkleProof.siblings, ...Array(MAX_DEPTH - depth).fill(0n)];
	const indices = Array.from({ length: MAX_DEPTH }, (_, i) => (merkleProof.index >> i) & 1);

	const [aesHi, aesLo] = splitAesKey(aesKey);
	const aesKeyCommit = poseidon2([aesHi, aesLo]);

	const ephemeralSk = randomScalar();
	const ephPk = mulPointEscalar(Base8, ephemeralSk);
	const shared = mulPointEscalar([pkBuyer.x, pkBuyer.y], ephemeralSk);
	const pad0 = poseidon4([shared[0], shared[1], nonce, 0n]);
	const pad1 = poseidon4([shared[0], shared[1], nonce, 1n]);
	const ciphertext = [(aesHi + pad0) % BN254_R, (aesLo + pad1) % BN254_R];

	const input = {
		indices,
		merkleSiblings: siblings,
		depth,
		fieldKeyHash: stringToBigint(fieldKey),
		fieldValueHash: stringToBigint(fieldValue),
		sigR8x: BigInt(pkg.signature.R8x),
		sigR8y: BigInt(pkg.signature.R8y),
		sigS: BigInt(pkg.signature.S),
		ephemeralSk,
		plaintext: [aesHi, aesLo],
		merkleRoot: BigInt(pkg.merkleRoot),
		pubKeyX: BigInt(pkg.publicKey.x),
		pubKeyY: BigInt(pkg.publicKey.y),
		pkBuyerX: pkBuyer.x,
		pkBuyerY: pkBuyer.y,
		ephemeralPkX: ephPk[0],
		ephemeralPkY: ephPk[1],
		ciphertext,
		nonce,
		aesKeyCommit,
	};

	const { proof: zkProof, publicSignals } = await snarkjs.groth16.fullProve(
		input,
		WASM_URL,
		ZKEY_URL,
	);

	const raw = await snarkjs.groth16.exportSolidityCallData(zkProof, publicSignals);
	const parsed = JSON.parse("[" + raw + "]") as [string[], string[][], string[], string[]];

	if (parsed[3].length !== 11) {
		throw new Error(`Expected 11 public signals, got ${parsed[3].length}`);
	}

	return {
		a: [BigInt(parsed[0][0]), BigInt(parsed[0][1])],
		b: [
			[BigInt(parsed[1][0][0]), BigInt(parsed[1][0][1])],
			[BigInt(parsed[1][1][0]), BigInt(parsed[1][1][1])],
		],
		c: [BigInt(parsed[2][0]), BigInt(parsed[2][1])],
		pubSignals: parsed[3].map((s) => BigInt(s)) as unknown as SolidityProof["pubSignals"],
	};
}
