/**
 * Shared PAPI extrinsic-submission helper for CLI scripts.
 *
 * Extracted from the `reviveCall` pattern in web/src/pages/ResearcherBuy.tsx:112-160.
 * Uses `signAndSubmit` (Promise-based) rather than the RxJS `signSubmitAndWatch` path
 * because CLI scripts don't need incremental progress events — they just need the result.
 */

import type { PolkadotSigner } from "polkadot-api";

// TxFinalizedPayload shape from polkadot-api — captured loosely to avoid importing
// internal types that may not be re-exported.
export type SubmitResult = {
	txHash: string;
	blockHash: string;
	blockNumber: number;
	/** Extrinsic index within the block — used as the `index` field in a pallet-multisig timepoint. */
	blockIndex: number;
	ok: boolean;
	events: unknown[];
};

/**
 * Submit a PAPI transaction and wait for finalization.
 *
 * @param tx   Any PAPI transaction object with a `signAndSubmit` method.
 *             Typed as `any` because:
 *             - Multisig is not yet in the PAPI descriptor (pallet added in Step 1).
 *             - This is a CLI helper, not production code.
 * @param signer  A `PolkadotSigner` from `polkadot-api/signer` (e.g. `getPolkadotSigner`).
 * @returns Resolved block hash + events on success; throws on dispatch error.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function submitExtrinsic(tx: any, signer: PolkadotSigner): Promise<SubmitResult> {
	// signAndSubmit waits for finalization and returns TxFinalizedPayload:
	//   { txHash, ok, events, block: { hash, number, index }, dispatchError? }
	// Using `{ at: "best" }` to target the best block instead of finalized —
	// faster for local dev nodes where finalization may lag.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const result: any = await tx.signAndSubmit(signer, { at: "best" });

	if (!result.ok) {
		const err = result.dispatchError;
		let msg = "Transaction failed";
		if (err?.type === "Module" && err?.value) {
			msg = `${err.value.type}.${err.value.value?.type ?? ""}`.replace(/:?\s*$/, "");
		} else if (err) {
			msg = JSON.stringify(err);
		}
		throw new Error(`Dispatch error: ${msg}`);
	}

	return {
		txHash: result.txHash as string,
		blockHash: result.block.hash as string,
		blockNumber: result.block.number as number,
		blockIndex: result.block.index as number,
		ok: true,
		events: result.events as unknown[],
	};
}
