import { createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getStoredEthRpcUrl } from "./network";

// MedicAuthority contract ABI — view-only, registry of verified medics
export const medicAuthorityAbi = [
	{
		inputs: [{ name: "", type: "address" }],
		name: "isVerifiedMedic",
		outputs: [{ name: "", type: "bool" }],
		stateMutability: "view",
		type: "function",
	},
] as const;

// MedicalMarket contract ABI — Phase 5.2 (off-chain crypto, no on-chain proof)
export const medicalMarketAbi = [
	{
		type: "function",
		name: "createListing",
		inputs: [
			{
				name: "header",
				type: "tuple",
				components: [
					{ name: "title", type: "string" },
					{ name: "recordType", type: "string" },
					{ name: "recordedAt", type: "uint64" },
					{ name: "facility", type: "string" },
				],
			},
			{ name: "headerCommit", type: "uint256" },
			{ name: "bodyCommit", type: "uint256" },
			{ name: "medicPkX", type: "uint256" },
			{ name: "medicPkY", type: "uint256" },
			{ name: "sigR8x", type: "uint256" },
			{ name: "sigR8y", type: "uint256" },
			{ name: "sigS", type: "uint256" },
			{ name: "price", type: "uint256" },
		],
		outputs: [],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "placeBuyOrder",
		inputs: [
			{ name: "listingId", type: "uint256" },
			{ name: "pkBuyerX", type: "uint256" },
			{ name: "pkBuyerY", type: "uint256" },
		],
		outputs: [],
		stateMutability: "payable",
	},
	{
		type: "function",
		name: "fulfill",
		inputs: [
			{ name: "orderId", type: "uint256" },
			{ name: "ephPkX", type: "uint256" },
			{ name: "ephPkY", type: "uint256" },
			{ name: "ciphertextHash", type: "uint256" },
		],
		outputs: [],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "getFulfillment",
		inputs: [{ name: "orderId", type: "uint256" }],
		outputs: [
			{ name: "ephPkX", type: "uint256" },
			{ name: "ephPkY", type: "uint256" },
			{ name: "ciphertextHash", type: "uint256" },
		],
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
			{ name: "headerCommit", type: "uint256" },
			{ name: "bodyCommit", type: "uint256" },
			{ name: "medicPkX", type: "uint256" },
			{ name: "medicPkY", type: "uint256" },
			{ name: "sigR8x", type: "uint256" },
			{ name: "sigR8y", type: "uint256" },
			{ name: "sigS", type: "uint256" },
			{ name: "price", type: "uint256" },
			{ name: "patient", type: "address" },
			{ name: "active", type: "bool" },
		],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "getListingHeader",
		inputs: [{ name: "id", type: "uint256" }],
		outputs: [
			{ name: "title", type: "string" },
			{ name: "recordType", type: "string" },
			{ name: "recordedAt", type: "uint64" },
			{ name: "facility", type: "string" },
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
			{ name: "pkBuyerX", type: "uint256" },
			{ name: "pkBuyerY", type: "uint256" },
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
			{ name: "headerCommit", type: "uint256", indexed: false },
			{ name: "bodyCommit", type: "uint256", indexed: false },
			{ name: "medicPkX", type: "uint256", indexed: false },
			{ name: "medicPkY", type: "uint256", indexed: false },
			{ name: "title", type: "string", indexed: false },
			{ name: "recordType", type: "string", indexed: false },
			{ name: "recordedAt", type: "uint64", indexed: false },
			{ name: "facility", type: "string", indexed: false },
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
			{ name: "pkBuyerX", type: "uint256", indexed: false },
			{ name: "pkBuyerY", type: "uint256", indexed: false },
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
			{ name: "ephPkX", type: "uint256", indexed: false },
			{ name: "ephPkY", type: "uint256", indexed: false },
			{ name: "ciphertextHash", type: "uint256", indexed: false },
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
	{
		type: "function",
		name: "shareRecord",
		inputs: [
			{
				name: "header",
				type: "tuple",
				components: [
					{ name: "title", type: "string" },
					{ name: "recordType", type: "string" },
					{ name: "recordedAt", type: "uint64" },
					{ name: "facility", type: "string" },
				],
			},
			{ name: "headerCommit", type: "uint256" },
			{ name: "bodyCommit", type: "uint256" },
			{ name: "medicPkX", type: "uint256" },
			{ name: "medicPkY", type: "uint256" },
			{ name: "sigR8x", type: "uint256" },
			{ name: "sigR8y", type: "uint256" },
			{ name: "sigS", type: "uint256" },
			{ name: "doctorPkX", type: "uint256" },
			{ name: "doctorPkY", type: "uint256" },
			{ name: "ephPkX", type: "uint256" },
			{ name: "ephPkY", type: "uint256" },
			{ name: "ciphertextHash", type: "uint256" },
		],
		outputs: [],
		stateMutability: "nonpayable",
	},
	{
		type: "event",
		name: "RecordShared",
		inputs: [
			{ name: "patient", type: "address", indexed: true },
			{ name: "doctorPkX", type: "uint256", indexed: true },
			{ name: "doctorPkY", type: "uint256", indexed: false },
			{ name: "headerCommit", type: "uint256", indexed: false },
			{ name: "bodyCommit", type: "uint256", indexed: false },
			{ name: "medicPkX", type: "uint256", indexed: false },
			{ name: "medicPkY", type: "uint256", indexed: false },
			{ name: "sigR8x", type: "uint256", indexed: false },
			{ name: "sigR8y", type: "uint256", indexed: false },
			{ name: "sigS", type: "uint256", indexed: false },
			{ name: "ephPkX", type: "uint256", indexed: false },
			{ name: "ephPkY", type: "uint256", indexed: false },
			{ name: "ciphertextHash", type: "uint256", indexed: false },
			{ name: "title", type: "string", indexed: false },
			{ name: "recordType", type: "string", indexed: false },
			{ name: "recordedAt", type: "uint64", indexed: false },
			{ name: "facility", type: "string", indexed: false },
		],
	},
] as const;

// Fallback private keys — well-known Substrate dev keys, safe for local nodes only.
// For Paseo or any public network set VITE_ACCOUNT_n_PK in web/.env.local instead.
const _DEV_PKS = [
	"0x5fb92d6e98884f76de468fa3f6278f8807c48bebc13595d45af5bdc4da702133",
	"0x8075991ce870b93a8870eca0c0f91913d12f47948ca0fd25b49c6fa7cdbeee8b",
	"0x0b6e18cafb6ed99687ec547bd28139cafbd3a4f28014f8640076aba0082bf262",
] as const;

function resolveAccount(
	envPk: string | undefined,
	envName: string | undefined,
	fallbackPk: string,
	fallbackName: string,
) {
	const pk = (envPk || fallbackPk) as `0x${string}`;
	return { name: envName || fallbackName, privateKey: pk, account: privateKeyToAccount(pk) };
}

export const evmDevAccounts = [
	resolveAccount(
		import.meta.env.VITE_ACCOUNT_0_PK,
		import.meta.env.VITE_ACCOUNT_0_NAME,
		_DEV_PKS[0],
		"Alice",
	),
	resolveAccount(
		import.meta.env.VITE_ACCOUNT_1_PK,
		import.meta.env.VITE_ACCOUNT_1_NAME,
		_DEV_PKS[1],
		"Bob",
	),
	resolveAccount(
		import.meta.env.VITE_ACCOUNT_2_PK,
		import.meta.env.VITE_ACCOUNT_2_NAME,
		_DEV_PKS[2],
		"Charlie",
	),
];

let publicClient: ReturnType<typeof createPublicClient> | null = null;
let publicClientUrl: string | null = null;
export function getPublicClient(ethRpcUrl = getStoredEthRpcUrl()) {
	if (!publicClient || publicClientUrl !== ethRpcUrl) {
		publicClient = createPublicClient({
			transport: http(ethRpcUrl),
		});
		publicClientUrl = ethRpcUrl;
	}
	return publicClient;
}
