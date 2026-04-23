import { keccak256, encodePacked } from "viem";
import { secp256k1 } from "@noble/curves/secp256k1.js";

const BYTES_PER_SLOT = 31;

export const MAX_FIELDS = 32;
export const MAX_PAYLOAD_BYTES = (MAX_FIELDS - 1) * BYTES_PER_SLOT; // 961

export const HEADER_FIELDS = 8;
export const HEADER_MAX_PAYLOAD_BYTES = (HEADER_FIELDS - 1) * BYTES_PER_SLOT; // 217

export const PII_FIELDS = 8;

const RS = 0x1e;
const US = 0x1f;

export interface MedicalHeader {
	title: string;
	recordType: string;
	recordedAt: number;
	facility: string;
}

export interface MedicalPii {
	patientId: string;
	dateOfBirth: string;
}

export interface SignedRecord {
	version: "v4-record";
	header: MedicalHeader;
	pii: MedicalPii;
	body: string[]; // plaintext body as stringified bigints (length MAX_FIELDS)
	headerCommit: string;
	bodyCommit: string;
	piiCommit: string;
	recordCommit: string; // keccak256(headerCommit, bodyCommit, piiCommit) — what the medic signs
	medicAddress: string; // Ethereum H160 address of the signing medic
	medicSignature: string; // 65-byte EIP-191 ECDSA sig (hex)
	signedAt: string;
	bodyFieldsPreview: Record<string, string>;
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

function encodeFieldsFixed(
	fields: Record<string, string>,
	slotCount: number,
	maxPayload: number,
): bigint[] {
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
	if (totalLen > maxPayload) {
		throw new Error(`record too large: ${totalLen} bytes (max ${maxPayload})`);
	}
	const bytes = new Uint8Array(totalLen);
	let o = 0;
	for (const p of parts) {
		bytes.set(p, o);
		o += p.length;
	}

	const plaintext: bigint[] = new Array(slotCount).fill(0n);
	plaintext[0] = BigInt(totalLen);
	for (let i = 0; i < slotCount - 1; i++) {
		const start = i * BYTES_PER_SLOT;
		if (start >= totalLen) break;
		const end = Math.min(start + BYTES_PER_SLOT, totalLen);
		plaintext[i + 1] = bytesToBigint(bytes.subarray(start, end));
	}
	return plaintext;
}

const PII_KEYS: ReadonlySet<string> = new Set(["patientId", "dateOfBirth"]);

export function encodeRecordToFieldElements(fields: Record<string, string>): bigint[] {
	const clinical: Record<string, string> = {};
	for (const [k, v] of Object.entries(fields)) {
		if (!PII_KEYS.has(k)) clinical[k] = v;
	}
	return encodeFieldsFixed(clinical, MAX_FIELDS, MAX_PAYLOAD_BYTES);
}

function headerToFields(header: MedicalHeader): Record<string, string> {
	return {
		title: header.title,
		recordType: header.recordType,
		recordedAt: String(header.recordedAt),
		facility: header.facility,
	};
}

export function encodeHeaderToFieldElements(header: MedicalHeader): bigint[] {
	return encodeFieldsFixed(headerToFields(header), HEADER_FIELDS, HEADER_MAX_PAYLOAD_BYTES);
}

function piiToFields(pii: MedicalPii): Record<string, string> {
	return {
		dateOfBirth: pii.dateOfBirth,
		patientId: pii.patientId,
	};
}

export function encodePiiToFieldElements(pii: MedicalPii): bigint[] {
	return encodeFieldsFixed(piiToFields(pii), PII_FIELDS, HEADER_MAX_PAYLOAD_BYTES);
}

function hashFieldElements(inputs: bigint[]): bigint {
	const types = inputs.map(() => "uint256" as const);
	return BigInt(keccak256(encodePacked(types, inputs)));
}

export function computePiiCommit(pii: MedicalPii): bigint {
	return hashFieldElements(encodePiiToFieldElements(pii));
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
	return hashFieldElements(inputs);
}

export function hashChain8(inputs: bigint[]): bigint {
	if (inputs.length !== HEADER_FIELDS) throw new Error(`expected ${HEADER_FIELDS} inputs`);
	return hashFieldElements(inputs);
}

export const computeBodyCommit = hashChain32;

export function computeHeaderCommit(header: MedicalHeader): bigint {
	return hashChain8(encodeHeaderToFieldElements(header));
}

export function computeRecordCommit(
	headerCommit: bigint,
	bodyCommit: bigint,
	piiCommit: bigint,
): bigint {
	return BigInt(
		keccak256(
			encodePacked(["uint256", "uint256", "uint256"], [headerCommit, bodyCommit, piiCommit]),
		),
	);
}

// ---------------------------------------------------------------------------
// secp256k1 key management (synchronous — noble ops are sync)
// ---------------------------------------------------------------------------

export function getOrCreateBuyerKey(storageKey: string): {
	sk: Uint8Array; // 32-byte private key
	pk: Uint8Array; // 33-byte compressed secp256k1 public key
	pkHex: `0x${string}`; // hex of pk
	address: `0x${string}`; // Ethereum-style address derived from pk
} {
	const stored = localStorage.getItem(storageKey + ":secp256k1");
	let sk: Uint8Array;
	if (stored !== null) {
		sk = hexToU8(stored);
	} else {
		sk = secp256k1.utils.randomSecretKey();
		localStorage.setItem(storageKey + ":secp256k1", u8ToHex(sk));
	}
	const pk = secp256k1.getPublicKey(sk, true); // compressed 33 bytes
	const pkHex = u8ToHex(pk);
	const address = pubKeyToAddress(pk);
	return { sk, pk, pkHex, address };
}

export function pubKeyToAddress(compressedPk: Uint8Array): `0x${string}` {
	const uncompressed = secp256k1.Point.fromBytes(compressedPk).toBytes(false); // 65 bytes
	const hash = keccak256(uncompressed.slice(1)); // keccak256 of 64-byte coord bytes
	return `0x${hash.slice(-40)}` as `0x${string}`;
}

// ---------------------------------------------------------------------------
// Serialization helpers
// ---------------------------------------------------------------------------

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

function u8ToHex(bytes: Uint8Array): `0x${string}` {
	return ("0x" +
		Array.from(bytes)
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("")) as `0x${string}`;
}

function hexToU8(hex: string): Uint8Array {
	const h = hex.startsWith("0x") ? hex.slice(2) : hex;
	const out = new Uint8Array(h.length / 2);
	for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
	return out;
}

// ---------------------------------------------------------------------------
// ECIES encryption/decryption (secp256k1 ECDH + AES-256-GCM)
// ---------------------------------------------------------------------------

/**
 * Phase 5.2: encrypt the plaintext for a buyer's secp256k1 pubkey using ECDH +
 * AES-256-GCM. No proof is generated — atomicity is relaxed and the buyer
 * verifies (recordCommit, medic signature) off-chain after decryption.
 *
 * Ciphertext bytes layout: IV (12 bytes) || AES-GCM ciphertext (1024 + 16 bytes)
 * The ephemeral public key (33 bytes compressed) is stored on-chain via fulfill().
 */
export async function encryptRecordForBuyer(args: {
	plaintext: bigint[];
	buyerCompressedPubKey: Uint8Array; // 33-byte compressed secp256k1 pubkey
}): Promise<{
	ephPubKey: Uint8Array; // 33-byte compressed ephemeral pubkey (stored on-chain)
	ciphertextBytes: Uint8Array; // IV || AES-GCM ct (stored in Statement Store)
}> {
	const { plaintext, buyerCompressedPubKey } = args;

	const ephSk = secp256k1.utils.randomSecretKey();
	const ephPubKey = secp256k1.getPublicKey(ephSk, true); // 33 bytes compressed

	// x-coordinate of shared point: 32 bytes (shared secret)
	const sharedRaw = secp256k1.getSharedSecret(ephSk, buyerCompressedPubKey, true);
	const sharedX = sharedRaw.slice(1); // drop compression byte, keep 32-byte x

	const aesKey = await crypto.subtle.importKey("raw", sharedX, "AES-GCM", false, ["encrypt"]);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const plainBytes = serializeCiphertext(plaintext); // 32 * 32 = 1024 bytes

	const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, plainBytes);
	// encrypted: 1024 + 16 (auth tag) = 1040 bytes

	const ciphertextBytes = new Uint8Array(12 + encrypted.byteLength);
	ciphertextBytes.set(iv, 0);
	ciphertextBytes.set(new Uint8Array(encrypted), 12);

	return { ephPubKey, ciphertextBytes };
}

export async function decryptRecord(args: {
	ephCompressedPubKey: Uint8Array; // 33-byte compressed ephemeral pubkey from on-chain
	ciphertextBytes: Uint8Array; // IV(12) || AES-GCM ciphertext from Statement Store
	skBuyer: Uint8Array; // 32-byte buyer private key
}): Promise<Record<string, string>> {
	const { ephCompressedPubKey, ciphertextBytes, skBuyer } = args;

	const iv = ciphertextBytes.slice(0, 12);
	const ctBytes = ciphertextBytes.slice(12);

	const sharedRaw = secp256k1.getSharedSecret(skBuyer, ephCompressedPubKey, true);
	const sharedX = sharedRaw.slice(1); // 32-byte x-coordinate

	const aesKey = await crypto.subtle.importKey("raw", sharedX, "AES-GCM", false, ["decrypt"]);
	const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, aesKey, ctBytes);

	const plaintext = deserializeCiphertext(new Uint8Array(decrypted));
	return decodeRecordFromFieldElements(plaintext);
}
