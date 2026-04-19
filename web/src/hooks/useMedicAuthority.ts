import { useCallback } from "react";
import { type Address } from "viem";
import { medicAuthorityAbi, getPublicClient } from "../config/evm";
import { deployments } from "../config/deployments";
import { useChainStore } from "../store/chainStore";

export function useMedicAuthority() {
	const ethRpcUrl = useChainStore((s) => s.ethRpcUrl);

	const isVerifiedMedic = useCallback(
		async (address: `0x${string}`): Promise<boolean | null> => {
			const addr = deployments.medicAuthority;
			if (!addr) return null; // pre-deployment: graceful no-op
			try {
				const client = getPublicClient(ethRpcUrl);
				const result = await client.readContract({
					address: addr as Address,
					abi: medicAuthorityAbi,
					functionName: "isVerifiedMedic",
					args: [address],
				});
				return result as boolean;
			} catch {
				return null;
			}
		},
		[ethRpcUrl],
	);

	return { isVerifiedMedic, available: deployments.medicAuthority !== null };
}
