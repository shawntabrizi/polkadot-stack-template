import { createPublicClient, createWalletClient, http, defineChain, type Chain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getStoredEthRpcUrl } from "./network";

// Well-known Substrate dev account Ethereum private keys.
// These are PUBLIC test keys from Substrate dev mnemonics — NEVER use for real funds.
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

// DotTransfer contract ABI — WeTransfer-style file sharing via Bulletin Chain IPFS.
// TransferIDs are client-generated random bytes32 slugs (7 ASCII chars, left-aligned).
export const dotTransferAbi = [
	{
		type: "function",
		name: "createTransfer",
		inputs: [
			{ name: "transferId", type: "bytes32" },
			{ name: "cids", type: "string" },
			{ name: "expiresAt", type: "uint256" },
			{ name: "fileSize", type: "uint256" },
			{ name: "fileName", type: "string" },
			{ name: "chunkCount", type: "uint256" },
		],
		outputs: [],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "revokeTransfer",
		inputs: [{ name: "transferId", type: "bytes32" }],
		outputs: [],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "getTransfer",
		inputs: [{ name: "transferId", type: "bytes32" }],
		outputs: [
			{ name: "cids", type: "string" },
			{ name: "uploader", type: "address" },
			{ name: "expiresAt", type: "uint256" },
			{ name: "fileSize", type: "uint256" },
			{ name: "fileName", type: "string" },
			{ name: "chunkCount", type: "uint256" },
			{ name: "expired", type: "bool" },
			{ name: "revoked", type: "bool" },
		],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "getTransfersByUploader",
		inputs: [{ name: "uploader", type: "address" }],
		outputs: [{ name: "", type: "bytes32[]" }],
		stateMutability: "view",
	},
	{ type: "error", name: "NotFound", inputs: [] },
	{ type: "error", name: "AlreadyTaken", inputs: [] },
	{ type: "error", name: "NotUploader", inputs: [] },
	{ type: "error", name: "AlreadyRevoked", inputs: [] },
	{ type: "error", name: "ExpiryInPast", inputs: [] },
	{ type: "error", name: "FileSizeZero", inputs: [] },
	{ type: "error", name: "EmptyCids", inputs: [] },
	{ type: "error", name: "ChunkCountZero", inputs: [] },
	{
		type: "event",
		name: "TransferCreated",
		inputs: [
			{ name: "transferId", type: "bytes32", indexed: true },
			{ name: "uploader", type: "address", indexed: true },
			{ name: "expiresAt", type: "uint256", indexed: false },
			{ name: "fileName", type: "string", indexed: false },
			{ name: "fileSize", type: "uint256", indexed: false },
		],
	},
	{
		type: "event",
		name: "TransferRevoked",
		inputs: [
			{ name: "transferId", type: "bytes32", indexed: true },
			{ name: "uploader", type: "address", indexed: true },
		],
	},
] as const;

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
