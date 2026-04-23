import {
	createStatementStore,
	type Statement,
	type SignedStatement,
} from "@novasamatech/product-sdk";
import { createLazyClient } from "@novasamatech/statement-store";
import { createStatementSdk, statementCodec } from "@novasamatech/sdk-statement";
import { getWsProvider } from "polkadot-api/ws-provider/web";
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
 *
 * Resolution order:
 *   1. `VITE_STATEMENT_STORE_WS_URL` env override — enables the "hybrid" demo
 *      (contracts on Paseo, Statement Store on a local node).
 *   2. Local wsUrl → same wsUrl (local dev: one node serves both).
 *   3. Non-local wsUrl → Paseo People chain (testnet Statement Store).
 */
function resolveStatementStoreUrl(wsUrl: string): string {
	const override = import.meta.env.VITE_STATEMENT_STORE_WS_URL;
	if (typeof override === "string" && override.length > 0) return override;

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
		// People chain exposes statement_submit + subscribeStatement but NOT statement_dump.
		// Checking only submit is sufficient — dump is not needed for our write path.
		return methods.includes("statement_submit");
	} catch {
		return false;
	}
}

/**
 * Fetch all statements from the node.
 *
 * Prefers `statement_dump` (HTTP POST) when the node exposes it — this is the
 * simpler, one-shot path the local template runtime ships with. Falls back to
 * the SDK's subscribe-based `getStatements` for nodes that only expose
 * `statement_subscribeStatement` (Paseo People chain).
 *
 * The SDK path is patched via `web/scripts/patch-sdk-statement.mjs` (postinstall)
 * to fix a TDZ bug in `getStatements`; see POLKADOT_INTEGRATION_GOTCHAS.md #15.
 */
async function _sdkFetch(wsUrl: string): Promise<DecodedStatement[]> {
	const storeUrl = resolveStatementStoreUrl(wsUrl);

	// 1) Try statement_dump — works on local template runtimes, absent on Paseo.
	const dumped = await _tryDump(storeUrl);
	if (dumped !== null) return dumped;

	// 2) Fall back to the SDK's subscribe-based getStatements.
	// WsJsonRpcProvider extends JsonRpcProvider structurally; cast resolves cross-package type mismatch.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const provider = getWsProvider(storeUrl) as any;
	const client = createLazyClient(provider);
	const sdk = createStatementSdk(client.getRequestFn(), client.getSubscribeFn());
	try {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const stmts = await (sdk.getStatements as (f: string) => Promise<any[]>)("any");
		return stmts
			.filter((s) => s.data instanceof Uint8Array && s.data.length > 0)
			.map((s) => {
				const data = s.data as Uint8Array;
				const hash = "0x" + bytesToHex(blake2b(data, undefined, 32));
				return {
					hash,
					signer: null,
					proofType: null,
					dataLength: data.length,
					data,
					topics: [],
					priority: null,
				} satisfies DecodedStatement;
			});
	} finally {
		client.disconnect();
	}
}

/**
 * Try `statement_dump` via HTTP JSON-RPC. Returns the decoded statements on
 * success, or `null` if the node doesn't expose the method (treat as signal
 * to fall back to the subscribe path). Network errors also return `null`.
 */
async function _tryDump(storeUrl: string): Promise<DecodedStatement[] | null> {
	const httpUrl = wsToHttp(storeUrl);
	let json: { result?: string[]; error?: { message?: string } };
	try {
		const r = await fetch(httpUrl, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "statement_dump", params: [] }),
		});
		json = await r.json();
	} catch {
		return null;
	}
	if (json.error) return null;
	const hexes: string[] = json.result ?? [];

	const out: DecodedStatement[] = [];
	for (const hex of hexes) {
		let stmt: { data?: Uint8Array };
		try {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			stmt = (statementCodec as any).dec(hex);
		} catch {
			continue;
		}
		if (!(stmt.data instanceof Uint8Array) || stmt.data.length === 0) continue;
		const data = stmt.data;
		const hash = "0x" + bytesToHex(blake2b(data, undefined, 32));
		out.push({
			hash,
			signer: null,
			proofType: null,
			dataLength: data.length,
			data,
			topics: [],
			priority: null,
		});
	}
	return out;
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
 * Uses the SDK subscription path (statement_subscribeStatement) which works
 * on both local nodes and People chain (no statement_dump needed).
 */
export async function fetchStatementByHash(
	wsUrl: string,
	hashHex: string,
): Promise<Uint8Array | null> {
	const stmts = await _sdkFetch(wsUrl);
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
		_sdkFetch(wsUrl).then((stmts) => {
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
