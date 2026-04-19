import * as snarkjs from "snarkjs";
import { poseidon2, poseidon4, poseidon16 } from "poseidon-lite";
import { mulPointEscalar, Base8, order as jubOrder } from "@zk-kit/baby-jubjub";

const WASM_URL = "/circuits/medical_disclosure.wasm";
const ZKEY_URL = "/circuits/medical_disclosure_final.zkey";

const BN254_R = BigInt(
	"21888242871839275222246405745257275088548364400416034343698204186575808495617",
);
const SUB_ORDER = jubOrder >> 3n;
const BYTES_PER_SLOT = 31;

export const MAX_FIELDS = 32;
export const MAX_PAYLOAD_BYTES = (MAX_FIELDS - 1) * BYTES_PER_SLOT; // 961

const RS = 0x1e;
const US = 0x1f;

export interface SignedRecord {
	version: "v2-record";
	plaintext: string[];
	recordCommit: string;
	signature: { R8x: string; R8y: string; S: string };
	medicPublicKey: { x: string; y: string };
	signedAt: string;
	fieldsPreview: Record<string, string>;
}

export interface SolidityProof {
	a: readonly [bigint, bigint];
	b: readonly [readonly [bigint, bigint], readonly [bigint, bigint]];
	c: readonly [bigint, bigint];
	pubSignals: readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint];
}

function bytesToBigint(bytes: Uint8Array): bigint {
	let n = 0n;
	for (const b of bytes) n = (n << 8n) | BigInt(b);
	return n;
}

function bigintToBytes(n: bigint, len: number): Uint8Array {
	const out = new Uint8Array(len);
	for (let i = len - 1; i >= 0; i--) {
		out[i] = Number(n & 0xffn);
		n >>= 8n;
	}
	return out;
}

export function encodeRecordToFieldElements(fields: Record<string, string>): bigint[] {
	const keys = Object.keys(fields).sort();
	for (const k of keys) {
		if (k.includes("\x1f") || k.includes("\x1e"))
			throw new Error(`key "${k}" contains a reserved control byte`);
		const v = String(fields[k]);
		if (v.includes("\x1f") || v.includes("\x1e"))
			throw new Error(`value for "${k}" contains a reserved control byte`);
	}

	const enc = new TextEncoder();
	const parts: Uint8Array[] = [];
	for (const k of keys) {
		parts.push(enc.encode(k));
		parts.push(new Uint8Array([US]));
		parts.push(enc.encode(String(fields[k])));
		parts.push(new Uint8Array([RS]));
	}
	const totalLen = parts.reduce((s, p) => s + p.length, 0);
	if (totalLen > MAX_PAYLOAD_BYTES) {
		throw new Error(`record too large: ${totalLen} bytes (max ${MAX_PAYLOAD_BYTES})`);
	}
	const bytes = new Uint8Array(totalLen);
	let o = 0;
	for (const p of parts) {
		bytes.set(p, o);
		o += p.length;
	}

	const plaintext: bigint[] = new Array(MAX_FIELDS).fill(0n);
	plaintext[0] = BigInt(totalLen);
	for (let i = 0; i < MAX_FIELDS - 1; i++) {
		const start = i * BYTES_PER_SLOT;
		if (start >= totalLen) break;
		const end = Math.min(start + BYTES_PER_SLOT, totalLen);
		plaintext[i + 1] = bytesToBigint(bytes.subarray(start, end));
	}
	return plaintext;
}

export function decodeRecordFromFieldElements(plaintext: bigint[]): Record<string, string> {
	const totalLen = Number(plaintext[0]);
	if (totalLen < 0 || totalLen > MAX_PAYLOAD_BYTES) {
		throw new Error(`invalid length prefix: ${totalLen}`);
	}
	const bytes = new Uint8Array(totalLen);
	let remaining = totalLen;
	for (let i = 0; i < MAX_FIELDS - 1 && remaining > 0; i++) {
		const chunk = Math.min(BYTES_PER_SLOT, remaining);
		const slot = bigintToBytes(plaintext[i + 1], BYTES_PER_SLOT);
		bytes.set(slot.subarray(BYTES_PER_SLOT - chunk), i * BYTES_PER_SLOT);
		remaining -= chunk;
	}

	const dec = new TextDecoder("utf-8", { fatal: true });
	const result: Record<string, string> = {};
	let start = 0;
	while (start < totalLen) {
		let end = start;
		while (end < totalLen && bytes[end] !== RS) end++;
		if (end === start) break;
		let us = start;
		while (us < end && bytes[us] !== US) us++;
		if (us === end) throw new Error("missing unit separator");
		const key = dec.decode(bytes.subarray(start, us));
		const value = dec.decode(bytes.subarray(us + 1, end));
		result[key] = value;
		start = end + 1;
	}
	return result;
}

export function hashChain32(inputs: bigint[]): bigint {
	if (inputs.length !== MAX_FIELDS) throw new Error(`expected ${MAX_FIELDS} inputs`);
	const h1 = poseidon16(inputs.slice(0, 16));
	const h2 = poseidon16(inputs.slice(16, 32));
	return poseidon2([h1, h2]);
}

export const computeRecordCommit = hashChain32;
export const computeCiphertextHash = hashChain32;

export function randomScalar(): bigint {
	const buf = new Uint8Array(32);
	crypto.getRandomValues(buf);
	let n = 0n;
	for (const b of buf) n = (n << 8n) | BigInt(b);
	return n % SUB_ORDER;
}

export function getOrCreateBuyerKey(storageKey: string): {
	sk: bigint;
	pk: { x: bigint; y: bigint };
} {
	const stored = localStorage.getItem(storageKey);
	let sk: bigint;
	if (stored !== null) {
		sk = BigInt(stored);
	} else {
		sk = randomScalar();
		localStorage.setItem(storageKey, sk.toString());
	}
	const pkPoint = mulPointEscalar(Base8, sk);
	return { sk, pk: { x: pkPoint[0], y: pkPoint[1] } };
}

export function serializeCiphertext(ciphertext: bigint[]): Uint8Array {
	const out = new Uint8Array(MAX_FIELDS * 32);
	for (let i = 0; i < MAX_FIELDS; i++) {
		const slot = bigintToBytes(ciphertext[i], 32);
		out.set(slot, i * 32);
	}
	return out;
}

export function deserializeCiphertext(bytes: Uint8Array): bigint[] {
	const result: bigint[] = [];
	for (let i = 0; i < MAX_FIELDS; i++) {
		result.push(bytesToBigint(bytes.subarray(i * 32, i * 32 + 32)));
	}
	return result;
}

export async function generateProofFromRecord(args: {
	plaintext: bigint[];
	medicSignature: { R8x: string; R8y: string; S: string };
	medicPublicKey: { x: string; y: string };
	pkBuyer: { x: bigint; y: bigint };
	nonce: bigint;
}): Promise<{ proof: SolidityProof; ciphertextBytes: Uint8Array }> {
	const { plaintext, medicSignature, medicPublicKey, pkBuyer, nonce } = args;

	const recordCommit = hashChain32(plaintext);

	const ephSk = randomScalar();
	const ephPkPoint = mulPointEscalar(Base8, ephSk);
	const ephPk = { x: ephPkPoint[0], y: ephPkPoint[1] };
	const sharedPoint = mulPointEscalar([pkBuyer.x, pkBuyer.y], ephSk);
	const shared = [sharedPoint[0], sharedPoint[1]];

	const ciphertext = plaintext.map(
		(p, i) => (p + poseidon4([shared[0], shared[1], nonce, BigInt(i)])) % BN254_R,
	);
	const ciphertextHash = hashChain32(ciphertext);

	const input = {
		plaintext,
		sigR8x: BigInt(medicSignature.R8x),
		sigR8y: BigInt(medicSignature.R8y),
		sigS: BigInt(medicSignature.S),
		ephemeralSk: ephSk,
		recordCommit,
		medicPkX: BigInt(medicPublicKey.x),
		medicPkY: BigInt(medicPublicKey.y),
		pkBuyerX: pkBuyer.x,
		pkBuyerY: pkBuyer.y,
		ephemeralPkX: ephPk.x,
		ephemeralPkY: ephPk.y,
		ciphertextHash,
		nonce,
	};

	const { proof: zkProof, publicSignals } = await snarkjs.groth16.fullProve(
		input,
		WASM_URL,
		ZKEY_URL,
	);

	const raw = await snarkjs.groth16.exportSolidityCallData(zkProof, publicSignals);
	const parsed = JSON.parse("[" + raw + "]") as [string[], string[][], string[], string[]];

	const solidityProof: SolidityProof = {
		a: [BigInt(parsed[0][0]), BigInt(parsed[0][1])],
		b: [
			[BigInt(parsed[1][0][1]), BigInt(parsed[1][0][0])],
			[BigInt(parsed[1][1][1]), BigInt(parsed[1][1][0])],
		],
		c: [BigInt(parsed[2][0]), BigInt(parsed[2][1])],
		pubSignals: [
			BigInt(parsed[3][0]),
			BigInt(parsed[3][1]),
			BigInt(parsed[3][2]),
			BigInt(parsed[3][3]),
			BigInt(parsed[3][4]),
			BigInt(parsed[3][5]),
			BigInt(parsed[3][6]),
			BigInt(parsed[3][7]),
			BigInt(parsed[3][8]),
		],
	};

	return {
		proof: solidityProof,
		ciphertextBytes: serializeCiphertext(ciphertext),
	};
}

export function decryptRecord(args: {
	ephPk: { x: bigint; y: bigint };
	ciphertextBytes: Uint8Array;
	skBuyer: bigint;
	nonce: bigint;
}): Record<string, string> {
	const { ephPk, ciphertextBytes, skBuyer, nonce } = args;

	const sharedPoint = mulPointEscalar([ephPk.x, ephPk.y], skBuyer);
	const shared = [sharedPoint[0], sharedPoint[1]];

	const ciphertext = deserializeCiphertext(ciphertextBytes);
	const plaintext = ciphertext.map(
		(c, i) => (c - poseidon4([shared[0], shared[1], nonce, BigInt(i)]) + BN254_R) % BN254_R,
	);

	return decodeRecordFromFieldElements(plaintext);
}
