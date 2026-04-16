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

// MedicalMarket contract ABI — Phase 1 listing + escrow + manual key release
export const medicalMarketAbi = [
	{
		type: "function",
		name: "createListing",
		inputs: [
			{ name: "merkleRoot", type: "bytes32" },
			{ name: "statementHash", type: "bytes32" },
			{ name: "title", type: "string" },
			{ name: "price", type: "uint256" },
		],
		outputs: [],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "placeBuyOrder",
		inputs: [{ name: "listingId", type: "uint256" }],
		outputs: [],
		stateMutability: "payable",
	},
	{
		type: "function",
		name: "fulfill",
		inputs: [
			{ name: "orderId", type: "uint256" },
			{ name: "decryptionKey", type: "bytes32" },
		],
		outputs: [],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "getDecryptionKey",
		inputs: [{ name: "orderId", type: "uint256" }],
		outputs: [{ name: "", type: "bytes32" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "cancelListing",
		inputs: [{ name: "listingId", type: "uint256" }],
		outputs: [],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "cancelOrder",
		inputs: [{ name: "orderId", type: "uint256" }],
		outputs: [],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "getListing",
		inputs: [{ name: "id", type: "uint256" }],
		outputs: [
			{ name: "merkleRoot", type: "bytes32" },
			{ name: "statementHash", type: "bytes32" },
			{ name: "title", type: "string" },
			{ name: "price", type: "uint256" },
			{ name: "patient", type: "address" },
			{ name: "active", type: "bool" },
		],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "getListingCount",
		inputs: [],
		outputs: [{ name: "", type: "uint256" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "getOrder",
		inputs: [{ name: "id", type: "uint256" }],
		outputs: [
			{ name: "listingId", type: "uint256" },
			{ name: "researcher", type: "address" },
			{ name: "amount", type: "uint256" },
			{ name: "confirmed", type: "bool" },
			{ name: "cancelled", type: "bool" },
		],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "getOrderCount",
		inputs: [],
		outputs: [{ name: "", type: "uint256" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "getPendingOrderId",
		inputs: [{ name: "listingId", type: "uint256" }],
		outputs: [{ name: "", type: "uint256" }],
		stateMutability: "view",
	},
	{
		type: "event",
		name: "ListingCreated",
		inputs: [
			{ name: "patient", type: "address", indexed: true },
			{ name: "listingId", type: "uint256", indexed: true },
			{ name: "merkleRoot", type: "bytes32", indexed: false },
			{ name: "statementHash", type: "bytes32", indexed: false },
			{ name: "title", type: "string", indexed: false },
			{ name: "price", type: "uint256", indexed: false },
		],
	},
	{
		type: "event",
		name: "OrderPlaced",
		inputs: [
			{ name: "listingId", type: "uint256", indexed: true },
			{ name: "orderId", type: "uint256", indexed: true },
			{ name: "researcher", type: "address", indexed: true },
			{ name: "amount", type: "uint256", indexed: false },
		],
	},
	{
		type: "event",
		name: "SaleFulfilled",
		inputs: [
			{ name: "orderId", type: "uint256", indexed: true },
			{ name: "listingId", type: "uint256", indexed: true },
			{ name: "patient", type: "address", indexed: false },
			{ name: "researcher", type: "address", indexed: false },
			{ name: "decryptionKey", type: "bytes32", indexed: false },
		],
	},
	{
		type: "event",
		name: "ListingCancelled",
		inputs: [
			{ name: "listingId", type: "uint256", indexed: true },
			{ name: "patient", type: "address", indexed: true },
		],
	},
	{
		type: "event",
		name: "OrderCancelled",
		inputs: [
			{ name: "orderId", type: "uint256", indexed: true },
			{ name: "listingId", type: "uint256", indexed: true },
			{ name: "researcher", type: "address", indexed: true },
			{ name: "amount", type: "uint256", indexed: false },
		],
	},
] as const;

// Well-known Substrate dev account Ethereum private keys.
// These are PUBLIC test keys from Substrate dev mnemonics — NEVER use for real funds.
export const evmDevAccounts = [
	{
		name: "Alice",
		privateKey: "0x5fb92d6e98884f76de468fa3f6278f8807c48bebc13595d45af5bdc4da702133" as const,
		account: privateKeyToAccount(
			"0x5fb92d6e98884f76de468fa3f6278f8807c48bebc13595d45af5bdc4da702133",
		),
	},
	{
		name: "Bob",
		privateKey: "0x8075991ce870b93a8870eca0c0f91913d12f47948ca0fd25b49c6fa7cdbeee8b" as const,
		account: privateKeyToAccount(
			"0x8075991ce870b93a8870eca0c0f91913d12f47948ca0fd25b49c6fa7cdbeee8b",
		),
	},
	{
		name: "Charlie",
		privateKey: "0x0b6e18cafb6ed99687ec547bd28139cafbd3a4f28014f8640076aba0082bf262" as const,
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
