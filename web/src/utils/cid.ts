import { cidExists, gatewayUrl, getGateway, hashToCid } from "@polkadot-apps/bulletin";

const GATEWAY = getGateway("paseo");

/**
 * Convert a blake2b-256 hash (as 0x hex string) to an IPFS CID string.
 * The CID wraps the same 32-byte hash: CID v1 + raw codec + blake2b-256 multihash.
 */
export function hexHashToCid(hexHash: string): string {
	const normalized: `0x${string}` = hexHash.startsWith("0x")
		? (hexHash as `0x${string}`)
		: `0x${hexHash}`;
	return hashToCid(normalized);
}

/**
 * Build an IPFS gateway URL from a CID string.
 */
export function ipfsUrl(cid: string): string {
	return gatewayUrl(cid, GATEWAY);
}

/**
 * Check if a CID is available on the IPFS gateway (HEAD request).
 * Returns false on network/CORS errors.
 */
export async function checkIpfsAvailable(cid: string): Promise<boolean> {
	return cidExists(cid, GATEWAY);
}
