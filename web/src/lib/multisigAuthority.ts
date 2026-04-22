/**
 * Browser-safe multisig helpers for driving MedicAuthority via pallet-multisig + PAPI.
 * Uses the same signSubmitAndWatch pattern as PatientDashboard (no Node-only deps).
 */

import { Binary, FixedSizeBinary, type PolkadotSigner, type TxBestBlocksState } from "polkadot-api";
import { encodeFunctionData } from "viem";
import { filter, firstValueFrom } from "rxjs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyApi = any;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuthorityMethod = "addMedic" | "removeMedic" | "transferOwnership";

export interface Timepoint {
	height: number;
	index: number;
}

export interface MultisigInfo {
	when: Timepoint;
	deposit: bigint;
	depositor: string;
	approvals: string[];
}

export interface ProposeResult {
	callHash: `0x${string}`;
	timepoint: Timepoint;
	txHash: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const REVIVE_CALL_WEIGHT = { ref_time: 3_000_000_000n, proof_size: 1_048_576n } as const;
export const MAX_STORAGE_DEPOSIT = 100_000_000_000_000n;
export const DEFAULT_MULTISIG_MAX_WEIGHT = {
	ref_time: 30_000_000_000n,
	proof_size: 2_000_000n,
} as const;

// ---------------------------------------------------------------------------
// ABI — MedicAuthority full interface
// ---------------------------------------------------------------------------

export const medicAuthorityFullAbi = [
	{
		type: "function",
		name: "addMedic",
		inputs: [{ name: "medic", type: "address" }],
		outputs: [],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "removeMedic",
		inputs: [{ name: "medic", type: "address" }],
		outputs: [],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "transferOwnership",
		inputs: [{ name: "newOwner", type: "address" }],
		outputs: [],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "owner",
		inputs: [],
		outputs: [{ name: "", type: "address" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "isVerifiedMedic",
		inputs: [{ name: "", type: "address" }],
		outputs: [{ name: "", type: "bool" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "hintProposal",
		inputs: [
			{ name: "callHash", type: "bytes32" },
			{ name: "action", type: "string" },
			{ name: "target", type: "address" },
		],
		outputs: [],
		stateMutability: "nonpayable",
	},
	{
		type: "event",
		name: "ProposalHinted",
		inputs: [
			{ name: "callHash", type: "bytes32", indexed: true },
			{ name: "action", type: "string", indexed: false },
			{ name: "target", type: "address", indexed: false },
		],
	},
] as const;

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function hexToBytes(hex: string): Uint8Array {
	const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
	const out = new Uint8Array(clean.length / 2);
	for (let i = 0; i < out.length; i++) {
		out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
	}
	return out;
}

export function encodeAuthorityCall(method: AuthorityMethod, target: `0x${string}`): `0x${string}` {
	return encodeFunctionData({ abi: medicAuthorityFullAbi, functionName: method, args: [target] });
}

export function buildReviveInnerTx(api: AnyApi, contract: `0x${string}`, calldata: `0x${string}`) {
	return api.tx.Revive.call({
		dest: new FixedSizeBinary(hexToBytes(contract)) as FixedSizeBinary<20>,
		value: 0n,
		weight_limit: REVIVE_CALL_WEIGHT,
		storage_deposit_limit: MAX_STORAGE_DEPOSIT,
		data: Binary.fromHex(calldata),
	});
}

/** Returns sorted signatories excluding the current signer. */
export function otherSignatoriesFor(allSs58: string[], signerSs58: string): string[] {
	const sorted = [...allSs58].sort();
	const filtered = sorted.filter((s) => s !== signerSs58);
	if (filtered.length === sorted.length) {
		throw new Error(`${signerSs58} is not a signatory`);
	}
	return filtered;
}

export async function computeCallHash(innerCall: AnyApi): Promise<`0x${string}`> {
	const encoded = await innerCall.getEncodedData();
	const { blake2b } = await import("blakejs");
	const hash = blake2b(encoded.asBytes(), undefined, 32);
	return `0x${Array.from(hash)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("")}` as `0x${string}`;
}

// ---------------------------------------------------------------------------
// Multisig submission
// ---------------------------------------------------------------------------

export async function propose(
	api: AnyApi,
	signer: PolkadotSigner,
	otherSs58: string[],
	threshold: number,
	innerCall: AnyApi,
): Promise<ProposeResult> {
	const callHash = await computeCallHash(innerCall);

	const tx = api.tx.Multisig.as_multi({
		threshold,
		other_signatories: otherSs58,
		maybe_timepoint: undefined,
		call: innerCall.decodedCall,
		max_weight: DEFAULT_MULTISIG_MAX_WEIGHT,
	});

	type FoundState = TxBestBlocksState & {
		found: true;
		ok: boolean;
		txHash: string;
		blockNumber: number;
		txIndex: number;
		dispatchError?: unknown;
	};

	const result = (await firstValueFrom(
		tx
			.signSubmitAndWatch(signer)
			.pipe(
				filter(
					(e): e is FoundState =>
						(e as TxBestBlocksState).type === "txBestBlocksState" &&
						(e as { found?: boolean }).found === true,
				),
			),
	)) as FoundState;

	if (!result.ok) throw new Error(JSON.stringify(result.dispatchError));

	return {
		callHash,
		timepoint: { height: result.blockNumber, index: result.txIndex },
		txHash: result.txHash,
	};
}

export async function approve(
	api: AnyApi,
	signer: PolkadotSigner,
	otherSs58: string[],
	threshold: number,
	innerCall: AnyApi,
	timepoint: Timepoint,
): Promise<{ txHash: string }> {
	const tx = api.tx.Multisig.as_multi({
		threshold,
		other_signatories: otherSs58,
		maybe_timepoint: timepoint,
		call: innerCall.decodedCall,
		max_weight: DEFAULT_MULTISIG_MAX_WEIGHT,
	});

	type FoundState = TxBestBlocksState & {
		found: true;
		ok: boolean;
		txHash: string;
		dispatchError?: unknown;
	};

	const result = (await firstValueFrom(
		tx
			.signSubmitAndWatch(signer)
			.pipe(
				filter(
					(e): e is FoundState =>
						(e as TxBestBlocksState).type === "txBestBlocksState" &&
						(e as { found?: boolean }).found === true,
				),
			),
	)) as FoundState;

	if (!result.ok) throw new Error(JSON.stringify(result.dispatchError));
	return { txHash: result.txHash };
}

// ---------------------------------------------------------------------------
// Storage queries
// ---------------------------------------------------------------------------

export async function getPendingForCall(
	api: AnyApi,
	multisigSs58: string,
	callHash: `0x${string}`,
): Promise<MultisigInfo | null> {
	const key = FixedSizeBinary.fromHex(callHash) as FixedSizeBinary<32>;
	const value = await api.query.Multisig.Multisigs.getValue(multisigSs58, key);
	if (!value) return null;
	return {
		when: { height: value.when.height, index: value.when.index },
		deposit: value.deposit,
		depositor: value.depositor,
		approvals: value.approvals,
	};
}

function keyToHex(v: unknown): `0x${string}` {
	let hex: string;
	if (typeof v === "string") hex = v.startsWith("0x") ? v : "0x" + v;
	else if (v instanceof Uint8Array)
		hex =
			"0x" +
			Array.from(v)
				.map((b) => b.toString(16).padStart(2, "0"))
				.join("");
	else {
		const a = v as AnyApi;
		if (typeof a?.asHex === "function") hex = a.asHex() as string;
		else if (typeof a?.asBytes === "function") return keyToHex(a.asBytes());
		else {
			console.error("[keyToHex] unknown type:", typeof v, v);
			throw new Error(`Cannot convert storage key to hex: ${typeof v}`);
		}
	}
	return hex.toLowerCase() as `0x${string}`;
}

export async function cancelProposal(
	api: AnyApi,
	signer: PolkadotSigner,
	otherSs58: string[],
	threshold: number,
	timepoint: Timepoint,
	callHash: `0x${string}`,
): Promise<{ txHash: string }> {
	const tx = api.tx.Multisig.cancel_as_multi({
		threshold,
		other_signatories: otherSs58,
		timepoint,
		call_hash: FixedSizeBinary.fromHex(callHash),
	});

	type FoundState = TxBestBlocksState & {
		found: true;
		ok: boolean;
		txHash: string;
		dispatchError?: unknown;
	};

	const result = (await firstValueFrom(
		tx
			.signSubmitAndWatch(signer)
			.pipe(
				filter(
					(e): e is FoundState =>
						(e as TxBestBlocksState).type === "txBestBlocksState" &&
						(e as { found?: boolean }).found === true,
				),
			),
	)) as FoundState;

	if (!result.ok) throw new Error(JSON.stringify(result.dispatchError));
	return { txHash: result.txHash };
}

export async function listPending(
	api: AnyApi,
	multisigSs58: string,
): Promise<Array<{ callHash: `0x${string}`; info: MultisigInfo }>> {
	const entries = await api.query.Multisig.Multisigs.getEntries(multisigSs58);
	return entries.map((entry: AnyApi) => ({
		callHash: keyToHex(entry.keyArgs[1]),
		info: {
			when: { height: entry.value.when.height, index: entry.value.when.index },
			deposit: entry.value.deposit,
			depositor: entry.value.depositor,
			approvals: entry.value.approvals,
		},
	}));
}

// ---------------------------------------------------------------------------
// On-chain hint emission (direct Revive.call, not via multisig)
// ---------------------------------------------------------------------------

export function buildHintProposalTx(
	api: AnyApi,
	contract: `0x${string}`,
	callHash: `0x${string}`,
	action: AuthorityMethod,
	target: `0x${string}`,
) {
	const calldata = encodeFunctionData({
		abi: medicAuthorityFullAbi,
		functionName: "hintProposal",
		args: [callHash as `0x${string}`, action, target],
	});
	return buildReviveInnerTx(api, contract, calldata);
}

export async function submitHintProposal(
	api: AnyApi,
	signer: PolkadotSigner,
	contract: `0x${string}`,
	callHash: `0x${string}`,
	action: AuthorityMethod,
	target: `0x${string}`,
): Promise<{ txHash: string }> {
	const tx = buildHintProposalTx(api, contract, callHash, action, target);

	type FoundState = TxBestBlocksState & {
		found: true;
		ok: boolean;
		txHash: string;
		dispatchError?: unknown;
	};

	const result = (await firstValueFrom(
		tx
			.signSubmitAndWatch(signer)
			.pipe(
				filter(
					(e): e is FoundState =>
						(e as TxBestBlocksState).type === "txBestBlocksState" &&
						(e as { found?: boolean }).found === true,
				),
			),
	)) as FoundState;

	if (!result.ok) throw new Error(JSON.stringify(result.dispatchError));
	return { txHash: result.txHash };
}
