import { useCallback } from "react";
import { encodeFunctionData } from "viem";
import { Binary, FixedSizeBinary, type TxBestBlocksState } from "polkadot-api";
import { filter, firstValueFrom } from "rxjs";
import { medicalMarketAbi } from "../config/evm";
import { getClient } from "./useChain";
import { getStackTemplateDescriptor } from "./useConnection";
import { formatDispatchError } from "../utils/format";
import type { AppAccount } from "./useAccount";

// Maximum native balance we're willing to spend on storage deposits (100 tokens in planck).
export const MAX_STORAGE_DEPOSIT = 100_000_000_000_000n;
// Weight budget. fulfill() is now a small storage write + 2 ETH transfers; no
// pairing math, so the previous 30 Bgas budget is overkill but harmless.
export const CALL_WEIGHT = { ref_time: 5_000_000_000n, proof_size: 524_288n };
// pallet-revive: 1 planck = 10^6 EVM wei (for 12-decimal chains).
export const WEI_TO_PLANCK = 1_000_000n;

/** Decode a hex string (with or without 0x prefix) to bytes. */
export function hexToBytes(hex: string): Uint8Array {
	const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
	const out = new Uint8Array(clean.length / 2);
	for (let i = 0; i < out.length; i++) {
		out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
	}
	return out;
}

export interface UseReviveCallOptions {
	account: AppAccount;
	/** H160 hex address of the deployed MedicalMarket contract. */
	contractAddress: string;
	/** Substrate WebSocket RPC URL. */
	wsUrl: string;
	/** Optional status callback for progress messages (e.g. for a toast). */
	onStatus?: (msg: string) => void;
}

export type ReviveCall = (
	functionName: string,
	args: readonly unknown[],
	valueWei?: bigint,
) => Promise<{ txHash: string; blockHash?: string }>;

/**
 * React hook returning a `reviveCall` function that submits a write call to
 * the MedicalMarket contract via a `pallet-revive` extrinsic (sr25519 signing).
 *
 * Handles one-time `Revive.map_account` registration on first use and watches
 * the transaction until it is included in a best block, surfacing dispatch
 * errors via `formatDispatchError`.
 */
export function useReviveCall(opts: UseReviveCallOptions): ReviveCall {
	const { account, contractAddress, wsUrl, onStatus } = opts;

	return useCallback<ReviveCall>(
		async (functionName, args, valueWei = 0n) => {
			const calldata = encodeFunctionData({
				abi: medicalMarketAbi,
				functionName,
				args,
			} as Parameters<typeof encodeFunctionData>[0]);

			const client = getClient(wsUrl);
			const descriptor = await getStackTemplateDescriptor();
			const api = client.getTypedApi(descriptor);

			const h160 = new FixedSizeBinary(hexToBytes(account.evmAddress)) as FixedSizeBinary<20>;
			const existingMapping = await api.query.Revive.OriginalAccount.getValue(h160);
			if (!existingMapping) {
				onStatus?.("Registering account with pallet-revive (one-time)...");
				await firstValueFrom(
					api.tx.Revive.map_account()
						.signSubmitAndWatch(account.signer)
						.pipe(
							filter(
								(e): e is TxBestBlocksState & { found: true } =>
									e.type === "txBestBlocksState" &&
									"found" in e &&
									e.found === true,
							),
						),
				);
			}

			const result = await firstValueFrom(
				api.tx.Revive.call({
					dest: new FixedSizeBinary(hexToBytes(contractAddress)) as FixedSizeBinary<20>,
					value: valueWei / WEI_TO_PLANCK,
					weight_limit: CALL_WEIGHT,
					storage_deposit_limit: MAX_STORAGE_DEPOSIT,
					data: Binary.fromHex(calldata),
				})
					.signSubmitAndWatch(account.signer)
					.pipe(
						filter(
							(e): e is TxBestBlocksState & { found: true } =>
								e.type === "txBestBlocksState" && "found" in e && e.found === true,
						),
					),
			);

			if (!result.ok) {
				throw new Error(formatDispatchError(result.dispatchError));
			}
			return { txHash: result.txHash, blockHash: result.block?.hash };
		},
		[account, contractAddress, wsUrl, onStatus],
	);
}
