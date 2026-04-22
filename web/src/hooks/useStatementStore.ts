import {
	createStatementStore,
	type Statement,
	type SignedStatement,
} from "@novasamatech/product-sdk";
import { Bytes, compact, u8 } from "@polkadot-api/substrate-bindings";
import { blake2b } from "blakejs";
import { STATEMENT_STORE_TESTNET_WS_URL } from "@/config/network";

// ---------------------------------------------------------------------------
// SDK constants
// ---------------------------------------------------------------------------

const MARKETPLACE_NS_ID = "own-your-medical-records42.dot";
export const MARKETPLACE_ACCOUNT_ID: [string, number] = [MARKETPLACE_NS_ID, 0];

function stringToTopic(s: string): Uint8Array {
	return blake2b(new TextEncoder().encode(s), undefined, 32);
}

const GLOBAL_TOPIC = stringToTopic("medical-marketplace-v1");
const LISTINGS_CHANNEL = stringToTopic("medical-marketplace-listings");

function isInHost(): boolean {
	if (typeof window === "undefined") return false;
	if ((window as { __HOST_WEBVIEW_MARK__?: boolean }).__HOST_WEBVIEW_MARK__) return true;
	try {
		return window !== window.top;
	} catch {
		return true;
	}
}

let _store: ReturnType<typeof createStatementStore> | null = null;
const getStore = () => (_store ??= createStatementStore());

// ---------------------------------------------------------------------------
// Raw-RPC SCALE helpers (local-dev path — kept verbatim)
// ---------------------------------------------------------------------------

const MAX_STATEMENT_STORE_ENCODED_SIZE = 1024 * 1024 - 1;
const FIELD_TAG_AUTH = 0;
const FIELD_TAG_PLAIN_DATA = 8;
const PROOF_VARIANT_SR25519 = 0;

// Field discriminants from sp_statement_store::Field (stable2512-3)
const FIELD_AUTHENTICITY_PROOF = 0;
const FIELD_DECRYPTION_KEY = 1;
const FIELD_PRIORITY = 2;
const FIELD_CHANNEL = 3;
const FIELD_TOPIC1 = 4;
const FIELD_TOPIC2 = 5;
const FIELD_TOPIC3 = 6;
const FIELD_TOPIC4 = 7;
const FIELD_DATA = 8;

// Proof variants
const PROOF_SR25519 = 0;
const PROOF_ED25519 = 1;

const encodeVecU8 = Bytes.enc();

function concatBytes(parts: Uint8Array[]): Uint8Array {
	const totalLen = parts.reduce((sum, part) => sum + part.length, 0);
	const result = new Uint8Array(totalLen);
	let offset = 0;

	for (const part of parts) {
		result.set(part, offset);
		offset += part.length;
	}

	return result;
}

function ensureFixedLength(value: Uint8Array, length: number, label: string): void {
	if (value.length !== length) {
		throw new Error(`${label} must be ${length} bytes, got ${value.length}`);
	}
}

function encodeSr25519Proof(publicKey: Uint8Array, signature: Uint8Array): Uint8Array {
	ensureFixedLength(publicKey, 32, "Statement Store public key");
	ensureFixedLength(signature, 64, "Statement Store signature");

	return concatBytes([u8.enc(PROOF_VARIANT_SR25519), signature, publicKey]);
}

function encodeDataField(data: Uint8Array): Uint8Array {
	return concatBytes([u8.enc(FIELD_TAG_PLAIN_DATA), encodeVecU8(data)]);
}

function encodeProofField(publicKey: Uint8Array, signature: Uint8Array): Uint8Array {
	return concatBytes([u8.enc(FIELD_TAG_AUTH), encodeSr25519Proof(publicKey, signature)]);
}

function buildStatementSignaturePayload(data: Uint8Array): Uint8Array {
	// Matches sp_statement_store::Statement::encoded(true) for a data-only statement.
	return encodeDataField(data);
}

function buildSignedStatement(
	data: Uint8Array,
	publicKey: Uint8Array,
	signature: Uint8Array,
): Uint8Array {
	return concatBytes([
		compact.enc(2),
		encodeProofField(publicKey, signature),
		encodeDataField(data),
	]);
}

function bytesToHex(bytes: Uint8Array): string {
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

function _toHex(bytes: Uint8Array): string {
	return bytesToHex(bytes);
}

/**
 * Convert a ws:// or wss:// URL to http:// or https:// for JSON-RPC POST.
 */
function wsToHttp(wsUrl: string): string {
	return wsUrl.replace(/^ws(s?):\/\//, "http$1://");
}

/**
 * Map an Asset Hub wsUrl to the correct Statement Store endpoint.
 * On local dev the same node serves both; on Paseo the Statement Store
 * runs on People chain, not Asset Hub.
 */
function resolveStatementStoreUrl(wsUrl: string): string {
	const isLocal =
		wsUrl.includes("localhost") || wsUrl.includes("127.0.0.1") || wsUrl.includes("192.168.");
	return isLocal ? wsUrl : STATEMENT_STORE_TESTNET_WS_URL;
}

// ---------------------------------------------------------------------------
// Private raw-RPC implementations (local-dev fallback)
// ---------------------------------------------------------------------------

async function _rawCheckRpc(wsUrl: string): Promise<boolean> {
	const httpUrl = wsToHttp(resolveStatementStoreUrl(wsUrl));
	try {
		const response = await fetch(httpUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "rpc_methods",
				params: [],
			}),
		});
		const result = await response.json();
		const methods: string[] = result?.result?.methods ?? [];
		return methods.includes("statement_submit") && methods.includes("statement_dump");
	} catch {
		return false;
	}
}

async function _rawSubmit(
	wsUrl: string,
	fileBytes: Uint8Array,
	publicKey: Uint8Array,
	sign: (message: Uint8Array) => Uint8Array | Promise<Uint8Array>,
): Promise<void> {
	const signaturePayload = buildStatementSignaturePayload(fileBytes);
	const signature = await sign(signaturePayload);
	const encoded = buildSignedStatement(fileBytes, publicKey, signature);

	if (encoded.length > MAX_STATEMENT_STORE_ENCODED_SIZE) {
		throw new Error(
			`Statement is too large for node propagation (${encoded.length} encoded bytes, max ${MAX_STATEMENT_STORE_ENCODED_SIZE}). Choose a smaller file.`,
		);
	}

	const httpUrl = wsToHttp(resolveStatementStoreUrl(wsUrl));
	const response = await fetch(httpUrl, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "statement_submit",
			params: [`0x${bytesToHex(encoded)}`],
		}),
	});

	const result = await response.json();
	if (result.error) {
		throw new Error(
			`Statement Store error: ${result.error.message}${result.error.data ? ` (${JSON.stringify(result.error.data)})` : ""}`,
		);
	}
}

export interface DecodedStatement {
	hash: string;
	signer: string | null;
	proofType: string | null;
	dataLength: number;
	data: Uint8Array | null;
	topics: string[];
	priority: number | null;
}

function hexToBytes(hex: string): Uint8Array {
	const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
	const bytes = new Uint8Array(clean.length / 2);
	for (let i = 0; i < bytes.length; i++) {
		bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
	}
	return bytes;
}

function readCompact(bytes: Uint8Array, offset: number): { value: number; bytesRead: number } {
	const first = bytes[offset];
	const mode = first & 0b11;
	if (mode === 0) return { value: first >> 2, bytesRead: 1 };
	if (mode === 1) {
		const value = ((bytes[offset + 1] << 8) | first) >> 2;
		return { value, bytesRead: 2 };
	}
	if (mode === 2) {
		const value =
			((bytes[offset + 3] << 24) |
				(bytes[offset + 2] << 16) |
				(bytes[offset + 1] << 8) |
				first) >>>
			2;
		return { value, bytesRead: 4 };
	}
	// Big-integer mode (mode === 3) — not expected for field counts
	throw new Error("Compact big-integer mode not supported");
}

function readVecU8(bytes: Uint8Array, offset: number): { data: Uint8Array; bytesRead: number } {
	const { value: len, bytesRead: prefixLen } = readCompact(bytes, offset);
	const data = bytes.slice(offset + prefixLen, offset + prefixLen + len);
	return { data, bytesRead: prefixLen + len };
}

function readU32LE(bytes: Uint8Array, offset: number): number {
	return (
		bytes[offset] |
		(bytes[offset + 1] << 8) |
		(bytes[offset + 2] << 16) |
		((bytes[offset + 3] << 24) >>> 0)
	);
}

function decodeStatement(encoded: Uint8Array): Omit<DecodedStatement, "hash"> {
	let offset = 0;
	const { value: numFields, bytesRead } = readCompact(encoded, offset);
	offset += bytesRead;

	let signer: string | null = null;
	let proofType: string | null = null;
	let data: Uint8Array | null = null;
	let dataLength = 0;
	const topics: string[] = [];
	let priority: number | null = null;

	for (let i = 0; i < numFields; i++) {
		const tag = encoded[offset];
		offset += 1;

		if (tag === FIELD_AUTHENTICITY_PROOF) {
			const variant = encoded[offset];
			offset += 1;
			if (variant === PROOF_SR25519) {
				proofType = "Sr25519";
				offset += 64; // signature
				signer = "0x" + bytesToHex(encoded.slice(offset, offset + 32));
				offset += 32;
			} else if (variant === PROOF_ED25519) {
				proofType = "Ed25519";
				offset += 64; // signature
				signer = "0x" + bytesToHex(encoded.slice(offset, offset + 32));
				offset += 32;
			} else {
				proofType = variant === 2 ? "Secp256k1Ecdsa" : "OnChain";
				break; // can't safely skip variable-length proof variants
			}
		} else if (tag === FIELD_DECRYPTION_KEY || tag === FIELD_CHANNEL) {
			// Both are fixed [u8; 32]
			offset += 32;
		} else if (tag === FIELD_PRIORITY) {
			priority = readU32LE(encoded, offset);
			offset += 4;
		} else if (
			tag === FIELD_TOPIC1 ||
			tag === FIELD_TOPIC2 ||
			tag === FIELD_TOPIC3 ||
			tag === FIELD_TOPIC4
		) {
			topics.push("0x" + bytesToHex(encoded.slice(offset, offset + 32)));
			offset += 32;
		} else if (tag === FIELD_DATA) {
			const result = readVecU8(encoded, offset);
			data = result.data;
			dataLength = result.data.length;
			offset += result.bytesRead;
		} else {
			break; // unknown field
		}
	}

	return { signer, proofType, data, dataLength, topics, priority };
}

async function _rawFetch(wsUrl: string): Promise<DecodedStatement[]> {
	const httpUrl = wsToHttp(resolveStatementStoreUrl(wsUrl));
	const response = await fetch(httpUrl, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "statement_dump",
			params: [],
		}),
	});

	const result = await response.json();
	if (result.error) {
		throw new Error(result.error.message);
	}

	const encoded: string[] = result.result ?? [];
	return encoded.map((hex) => {
		const bytes = hexToBytes(hex);
		const decoded = decodeStatement(bytes);
		// Hash the raw data payload — matches PatientDashboard.computeBlake2bHex(fileBytes)
		// which is what gets stored on-chain as the listing's statementHash.
		const hashSource = decoded.data ?? bytes;
		const hash = "0x" + bytesToHex(blake2b(hashSource, undefined, 32));
		return { hash, ...decoded };
	});
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check if the statement store is accessible.
 * Inside the Host shell this always returns true — the Host handles transport.
 */
export async function checkStatementStoreAvailable(wsUrl: string): Promise<boolean> {
	if (isInHost()) return true;
	return _rawCheckRpc(wsUrl);
}

/**
 * Submit encrypted data to the statement store.
 *
 * - Inside Host: uses SDK `createProof` + `submit` with a 10-second timeout.
 * - Outside Host (local dev): uses the raw JSON-RPC path (requires `publicKey` + `sign`).
 */
export async function submitStatement(
	wsUrl: string,
	encrypted: Uint8Array,
	ciphertextHash32: Uint8Array, // = blake2b(encrypted, 32) — caller precomputes
	accountId: [string, number], // MARKETPLACE_ACCOUNT_ID
	publicKey?: Uint8Array, // local-dev fallback
	sign?: (msg: Uint8Array) => Uint8Array | Promise<Uint8Array>,
): Promise<void> {
	// If a local signer is supplied, use raw RPC — even inside Host. The
	// Nova Wallet Host only signs for accounts it holds; dev keys like
	// //Alice aren't in the wallet, so the SDK path returns
	// StatementProofErr::UnableToSign. The raw path signs with the local
	// keypair directly and bypasses the Host's account lookup.
	if (publicKey && sign) {
		return _rawSubmit(wsUrl, encrypted, publicKey, sign);
	}

	if (!isInHost()) {
		throw new Error("publicKey and sign required outside Host");
	}

	const statement: Statement = {
		proof: undefined,
		decryptionKey: ciphertextHash32,
		expiry:
			(BigInt(Math.floor(Date.now() / 1000) + 31_536_000) << 32n) |
			BigInt(Date.now() % 0xffffffff),
		channel: LISTINGS_CHANNEL,
		topics: [GLOBAL_TOPIC],
		data: encrypted,
	};

	const proof = await Promise.race([
		getStore().createProof(accountId, statement),
		new Promise<never>((_, r) =>
			setTimeout(() => r(new Error("createProof timeout — Host unresponsive 10s")), 10_000),
		),
	]);

	await getStore().submit({ ...statement, proof });
}

/**
 * One-shot fetch of a single statement by its blake2b-32 hash hex.
 * Used as a cache-miss fallback in the decrypt flow so a stale mount-time
 * cache doesn't block decryption after a recent fulfill.
 */
export async function fetchStatementByHash(
	wsUrl: string,
	hashHex: string,
): Promise<Uint8Array | null> {
	const stmts = await _rawFetch(wsUrl);
	return stmts.find((s) => s.hash === hashHex)?.data ?? null;
}

/**
 * Subscribe to marketplace statements.
 *
 * - Inside Host: live subscription via SDK; `onUpdate` is called for each batch.
 * - Outside Host (local dev): one-shot dump via raw RPC; `onUpdate` called once then no-op.
 *
 * Returns `{ unsubscribe }` for cleanup (e.g. React useEffect return).
 */
export function subscribeStatements(
	wsUrl: string,
	onUpdate: (cache: Map<string, Uint8Array>) => void,
): { unsubscribe(): void } {
	const cache = new Map<string, Uint8Array>();

	if (!isInHost()) {
		_rawFetch(wsUrl).then((stmts) => {
			for (const s of stmts) {
				if (s.data) cache.set(s.hash, s.data);
			}
			onUpdate(new Map(cache));
		});
		return { unsubscribe() {} };
	}

	const sub = getStore().subscribe([GLOBAL_TOPIC], (stmts: SignedStatement[]) => {
		for (const s of stmts) {
			if (!s.data) continue;
			const hash = "0x" + _toHex(blake2b(s.data, undefined, 32));
			cache.set(hash, s.data);
		}
		onUpdate(new Map(cache)); // new ref so React rerenders
	});

	return sub;
}
