import { createPublicClient, http } from "viem";

const ETH_RPC = "https://services.polkadothub-rpc.com/testnet";
const MARKET = "0xddbaf6bec4c3a8fd4b2fadec23921f6d4b19d384" as const;

// Subset of the Phase 5.2 ABI — just the readers we need
const abi = [
	{
		type: "function",
		name: "getListingCount",
		inputs: [],
		outputs: [{ type: "uint256" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "getOrderCount",
		inputs: [],
		outputs: [{ type: "uint256" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "getListing",
		inputs: [{ name: "id", type: "uint256" }],
		outputs: [
			{ name: "recordCommit", type: "uint256" },
			{ name: "medicPkX", type: "uint256" },
			{ name: "medicPkY", type: "uint256" },
			{ name: "sigR8x", type: "uint256" },
			{ name: "sigR8y", type: "uint256" },
			{ name: "sigS", type: "uint256" },
			{ name: "title", type: "string" },
			{ name: "price", type: "uint256" },
			{ name: "patient", type: "address" },
			{ name: "active", type: "bool" },
		],
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
		name: "getPendingOrderId",
		inputs: [{ name: "listingId", type: "uint256" }],
		outputs: [{ type: "uint256" }],
		stateMutability: "view",
	},
] as const;

async function main() {
	const client = createPublicClient({ transport: http(ETH_RPC) });

	const listingCount = (await client.readContract({
		address: MARKET,
		abi,
		functionName: "getListingCount",
	})) as bigint;
	const orderCount = (await client.readContract({
		address: MARKET,
		abi,
		functionName: "getOrderCount",
	})) as bigint;

	console.log(`MedicalMarket on Paseo: ${MARKET}`);
	console.log(`Listing count: ${listingCount}`);
	console.log(`Order count:   ${orderCount}`);
	console.log("");

	for (let i = 0n; i < listingCount; i++) {
		const l = (await client.readContract({
			address: MARKET,
			abi,
			functionName: "getListing",
			args: [i],
		})) as readonly unknown[];
		const pending = (await client.readContract({
			address: MARKET,
			abi,
			functionName: "getPendingOrderId",
			args: [i],
		})) as bigint;
		console.log(`Listing #${i}`);
		console.log(`  title:          ${l[6]}`);
		console.log(`  price (wei):    ${l[7]}`);
		console.log(`  patient:        ${l[8]}`);
		console.log(`  active:         ${l[9]}`);
		console.log(`  pendingOrderId: ${pending} (0 = none; otherwise 1-based)`);
	}
	console.log("");

	for (let i = 0n; i < orderCount; i++) {
		const o = (await client.readContract({
			address: MARKET,
			abi,
			functionName: "getOrder",
			args: [i],
		})) as readonly unknown[];
		console.log(`Order #${i}`);
		console.log(`  listingId:  ${o[0]}`);
		console.log(`  researcher: ${o[1]}`);
		console.log(`  amount:     ${o[2]}`);
		console.log(`  confirmed:  ${o[3]}`);
		console.log(`  cancelled:  ${o[4]}`);
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
