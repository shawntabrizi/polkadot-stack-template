import { createPublicClient, createWalletClient, http, defineChain, type Chain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getStoredEthRpcUrl } from "./network";

// ProofOfExistence contract ABI — same for both EVM (solc) and PVM (resolc) deployments
export const proofOfExistenceAbi = [
	{
		type: "function",
		name: "createClaim",
		inputs: [{ name: "documentHash", type: "bytes32" }],
		outputs: [],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "revokeClaim",
		inputs: [{ name: "documentHash", type: "bytes32" }],
		outputs: [],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "getClaim",
		inputs: [{ name: "documentHash", type: "bytes32" }],
		outputs: [
			{ name: "owner", type: "address" },
			{ name: "blockNumber", type: "uint256" },
		],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "getClaimCount",
		inputs: [],
		outputs: [{ name: "", type: "uint256" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "getClaimHashAtIndex",
		inputs: [{ name: "index", type: "uint256" }],
		outputs: [{ name: "", type: "bytes32" }],
		stateMutability: "view",
	},
] as const;

// Well-known Substrate dev account Ethereum private keys
export const evmDevAccounts = [
	{
		name: "Alice",
		account: privateKeyToAccount(
			"0x5fb92d6e98884f76de468fa3f6278f8807c48bebc13595d45af5bdc4da702133",
		),
	},
	{
		name: "Bob",
		account: privateKeyToAccount(
			"0x8075991ce870b93a8870eca0c0f91913d12f47948ca0fd25b49c6fa7cdbeee8b",
		),
	},
	{
		name: "Charlie",
		account: privateKeyToAccount(
			"0x0b6e18cafb6ed99687ec547bd28139cafbd3a4f28014f8640076aba0082bf262",
		),
	},
];

let publicClient: ReturnType<typeof createPublicClient> | null = null;
let publicClientUrl: string | null = null;
let chainCache: Chain | null = null;
let chainCacheUrl: string | null = null;

function isLocalEthRpcUrl(url: string) {
	return url.includes("127.0.0.1") || url.includes("localhost");
}

export function getPublicClient(ethRpcUrl = getStoredEthRpcUrl()) {
	if (!publicClient || publicClientUrl !== ethRpcUrl) {
		publicClient = createPublicClient({
			transport: http(ethRpcUrl),
		});
		publicClientUrl = ethRpcUrl;
	}
	return publicClient;
}

async function getChain(ethRpcUrl = getStoredEthRpcUrl()): Promise<Chain> {
	if (!chainCache || chainCacheUrl !== ethRpcUrl) {
		const client = getPublicClient(ethRpcUrl);
		const chainId = await client.getChainId();
		chainCache = defineChain({
			id: chainId,
			name: isLocalEthRpcUrl(ethRpcUrl) ? "Local Parachain" : "Polkadot Hub TestNet",
			nativeCurrency: { name: "Unit", symbol: "UNIT", decimals: 18 },
			rpcUrls: { default: { http: [ethRpcUrl] } },
		});
		chainCacheUrl = ethRpcUrl;
	}
	return chainCache;
}

export async function getWalletClient(accountIndex: number, ethRpcUrl = getStoredEthRpcUrl()) {
	const chain = await getChain(ethRpcUrl);
	return createWalletClient({
		account: evmDevAccounts[accountIndex].account,
		chain,
		transport: http(ethRpcUrl),
	});
}
