/**
 * Signer-agnostic helpers for driving MedicAuthority via pallet-multisig over PAPI.
 *
 * Pure functions of (api, args). No filesystem, no mnemonic derivation, no connection
 * management — the caller supplies a connected `TypedApi<typeof stack_template>` and
 * a `PolkadotSigner`. Usable from Node (scripts / tests) and the browser (UI) with the
 * same surface.
 *
 * Flow overview (2-of-N):
 *   1. propose() — first signer submits `Multisig.as_multi` with maybe_timepoint=None;
 *      the pending entry lands in `Multisig.Multisigs[multisigSs58, callHash]`.
 *   2. getPendingForCall() — read the timepoint.
 *   3. approve() — second signer submits `Multisig.as_multi` with maybe_timepoint=Some
 *      and the full inner call; threshold is reached and pallet-multisig dispatches the
 *      inner Revive.call which runs the contract write.
 *
 * See docs/product/POLKADOT_INTEGRATION_GOTCHAS.md entries #6 and #7 for weight / map_account
 * prerequisites — those are deploy-time concerns, not this module's responsibility.
 */

import { Binary, FixedSizeBinary, type PolkadotSigner, type TypedApi } from "polkadot-api";
import { encodeFunctionData } from "viem";
import { createKeyMulti, encodeAddress, sortAddresses } from "@polkadot/util-crypto";
import { u8aToHex } from "@polkadot/util";
import { keccak256 } from "viem";
import type { stack_template } from "@polkadot-api/descriptors";
import { submitExtrinsic, type SubmitResult } from "../_papi";

export type Api = TypedApi<typeof stack_template>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedApi = any;

// ---------------------------------------------------------------------------
// Constants — exposed so UIs can display them alongside tx confirmation prompts.
// ---------------------------------------------------------------------------

/** Weight forwarded to the inner `Revive.call` — mirrors PatientDashboard CALL_WEIGHT. */
export const REVIVE_CALL_WEIGHT = { ref_time: 3_000_000_000n, proof_size: 1_048_576n } as const;

/** Maximum storage deposit pallet-revive may charge for the inner call (100 tokens in planck). */
export const MAX_STORAGE_DEPOSIT = 100_000_000_000_000n;

/**
 * `max_weight` for the outer `Multisig.as_multi` wrapping `Revive.call`. Must exceed the
 * inner call's measured weight; gotcha #7 documents 30B ref_time as the safe budget.
 */
export const DEFAULT_MULTISIG_MAX_WEIGHT = {
	ref_time: 30_000_000_000n,
	proof_size: 2_000_000n,
} as const;

export type Weight = { ref_time: bigint; proof_size: bigint };
export type Timepoint = { height: number; index: number };

export interface MultisigInfo {
	when: Timepoint;
	deposit: bigint;
	depositor: string;
	approvals: string[];
}

// ---------------------------------------------------------------------------
// ABI — MedicAuthority write functions.
// ---------------------------------------------------------------------------

export const medicAuthorityAbi = [
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
		name: "addAuthority",
		inputs: [{ name: "newAuth", type: "address" }],
		outputs: [],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "removeAuthority",
		inputs: [{ name: "auth", type: "address" }],
		outputs: [],
		stateMutability: "nonpayable",
	},
] as const;

export type AuthorityMethod = "addMedic" | "removeMedic" | "addAuthority" | "removeAuthority";

export function encodeAuthorityCall(method: AuthorityMethod, target: `0x${string}`): `0x${string}` {
	return encodeFunctionData({ abi: medicAuthorityAbi, functionName: method, args: [target] });
}

// ---------------------------------------------------------------------------
// Multisig account derivation — mirrors compute-multisig.ts.
// ---------------------------------------------------------------------------

/**
 * Derive the Substrate multisig address + its pallet-revive H160 msg.sender from the
 * signatory SS58 list. `signatoriesSs58` does not need to be pre-sorted — we sort it
 * ourselves (pallet-multisig's `createKeyMulti` requires sorted input).
 */
export function deriveMultisig(
	signatoriesSs58: string[],
	threshold: number,
	ss58Prefix: number = 42,
): { ss58: string; h160: `0x${string}`; sortedSignatories: string[] } {
	const sortedSignatories = sortAddresses(signatoriesSs58, ss58Prefix);
	const accountId = createKeyMulti(sortedSignatories, threshold);
	const ss58 = encodeAddress(accountId, ss58Prefix);
	const hash = keccak256(u8aToHex(accountId) as `0x${string}`);
	const h160 = ("0x" + hash.slice(2 + 24)) as `0x${string}`;
	return { ss58, h160, sortedSignatories };
}

// ---------------------------------------------------------------------------
// Inner call construction.
// ---------------------------------------------------------------------------

function hexToBytes(hex: string): Uint8Array {
	const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
	const out = new Uint8Array(clean.length / 2);
	for (let i = 0; i < out.length; i++) {
		out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
	}
	return out;
}

/**
 * Build the inner `Revive.call` extrinsic that the multisig will dispatch.
 * Returns the PAPI tx object, which exposes both `.decodedCall` (for `as_multi.call`)
 * and `.getEncodedData()` (for the call-hash computation).
 */
export function buildReviveInnerTx(
	api: Api,
	contract: `0x${string}`,
	calldata: `0x${string}`,
	weightLimit: Weight = REVIVE_CALL_WEIGHT,
	storageDepositLimit: bigint = MAX_STORAGE_DEPOSIT,
) {
	return api.tx.Revive.call({
		dest: new FixedSizeBinary(hexToBytes(contract)) as FixedSizeBinary<20>,
		value: 0n,
		weight_limit: weightLimit,
		storage_deposit_limit: storageDepositLimit,
		data: Binary.fromHex(calldata),
	});
}

// ---------------------------------------------------------------------------
// Multisig submission + storage queries.
// ---------------------------------------------------------------------------

export interface ProposeArgs {
	api: Api;
	signer: PolkadotSigner;
	/** Sorted SS58 list with `signer`'s own address removed. Use `otherSignatoriesFor()`. */
	otherSignatoriesSs58: string[];
	threshold: number;
	/** Inner call to dispatch once threshold is reached (e.g. buildReviveInnerTx(...)). */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	innerCall: any;
	maxWeight?: Weight;
}

export interface ApproveArgs extends ProposeArgs {
	/** Timepoint returned by a prior propose() or read from getPendingForCall().when. */
	timepoint: Timepoint;
}

export interface ProposeResult extends SubmitResult {
	/** blake2-256 of the SCALE-encoded inner call — the pallet-multisig storage key. */
	callHash: `0x${string}`;
	/** Timepoint to feed to the next signer's approve(). */
	timepoint: Timepoint;
}

/**
 * Helper: given the full signatory list and the current signer's SS58, return the
 * `other_signatories` array pallet-multisig expects (sorted, excluding the signer).
 * Throws if the signer isn't actually a signatory.
 */
export function otherSignatoriesFor(
	allSignatoriesSs58: string[],
	signerSs58: string,
	ss58Prefix: number = 42,
): string[] {
	const sorted = sortAddresses(allSignatoriesSs58, ss58Prefix);
	const filtered = sorted.filter((s) => s !== signerSs58);
	if (filtered.length === sorted.length) {
		throw new Error(
			`Signer ${signerSs58} is not in the multisig signatories ${JSON.stringify(sorted)}`,
		);
	}
	return filtered;
}

async function computeCallHashHex(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	innerCall: any,
): Promise<`0x${string}`> {
	const encoded = await innerCall.getEncodedData();
	const { blake2AsHex } = await import("@polkadot/util-crypto");
	return blake2AsHex(encoded.asBytes(), 256) as `0x${string}`;
}

/**
 * First-signer path. Submits `Multisig.as_multi` with `maybe_timepoint: undefined`.
 * Resolves with the inclusion result plus the callHash + timepoint that later signers
 * need to approve the same pending multisig entry.
 */
export async function proposeMultisigAuthorityAction(args: ProposeArgs): Promise<ProposeResult> {
	const { api, signer, otherSignatoriesSs58, threshold, innerCall, maxWeight } = args;
	const callHash = await computeCallHashHex(innerCall);

	const tx = (api as UntypedApi).tx.Multisig.as_multi({
		threshold,
		other_signatories: otherSignatoriesSs58,
		maybe_timepoint: undefined,
		call: innerCall.decodedCall,
		max_weight: maxWeight ?? DEFAULT_MULTISIG_MAX_WEIGHT,
	});

	const result = await submitExtrinsic(tx, signer, { mortal: false });
	return {
		...result,
		callHash,
		timepoint: { height: result.blockNumber, index: result.blockIndex },
	};
}

/**
 * Subsequent-signer path. Submits `Multisig.as_multi` with `maybe_timepoint: Some(timepoint)`
 * and the full inner call bytes — when threshold is reached, pallet-multisig dispatches
 * the inner call in the same extrinsic.
 *
 * For thresholds > 2 where intermediate approvals want to save weight, swap `as_multi` for
 * `approve_as_multi` (call hash only) — not needed for the current 2-of-3 setup.
 */
export async function approveMultisigAuthorityAction(args: ApproveArgs): Promise<SubmitResult> {
	const { api, signer, otherSignatoriesSs58, threshold, innerCall, timepoint, maxWeight } = args;

	const tx = (api as UntypedApi).tx.Multisig.as_multi({
		threshold,
		other_signatories: otherSignatoriesSs58,
		maybe_timepoint: timepoint,
		call: innerCall.decodedCall,
		max_weight: maxWeight ?? DEFAULT_MULTISIG_MAX_WEIGHT,
	});

	return submitExtrinsic(tx, signer, { mortal: false });
}

/**
 * Read a pending multisig entry by (multisig, callHash). Returns null if no entry exists.
 * UIs can use this to detect whether a proposal has already been made and, if so, display
 * current approvals + timepoint.
 */
export async function getPendingForCall(
	api: Api,
	multisigSs58: string,
	callHash: `0x${string}` | Uint8Array,
): Promise<MultisigInfo | null> {
	const key =
		typeof callHash === "string"
			? (FixedSizeBinary.fromHex(callHash) as FixedSizeBinary<32>)
			: (new FixedSizeBinary(callHash) as FixedSizeBinary<32>);
	const value = await (api as UntypedApi).query.Multisig.Multisigs.getValue(multisigSs58, key);
	if (!value) return null;
	return {
		when: value.when as Timepoint,
		deposit: value.deposit as bigint,
		depositor: value.depositor as string,
		approvals: value.approvals as string[],
	};
}

/**
 * List all pending multisig entries for a given multisig address. Intended for the
 * Authority tab's "pending approvals" view; not used by the core two-signer flow.
 */
export async function listPendingForMultisig(
	api: Api,
	multisigSs58: string,
): Promise<Array<{ callHash: `0x${string}`; info: MultisigInfo }>> {
	const entries: Array<{
		keyArgs: [string, FixedSizeBinary<32>];
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		value: any;
	}> = await (api as UntypedApi).query.Multisig.Multisigs.getEntries(multisigSs58);
	return entries.map((e) => ({
		callHash: ("0x" + bytesToHex(e.keyArgs[1].asBytes())) as `0x${string}`,
		info: {
			when: e.value.when as Timepoint,
			deposit: e.value.deposit as bigint,
			depositor: e.value.depositor as string,
			approvals: e.value.approvals as string[],
		},
	}));
}

function bytesToHex(bytes: Uint8Array): string {
	let out = "";
	for (const b of bytes) out += b.toString(16).padStart(2, "0");
	return out;
}
