import { createPublicClient, http } from "viem";

async function main() {
	const client = createPublicClient({ transport: http("http://127.0.0.1:8645") });
	const addr = "0xc01ee7f10ea4af4673cfff62710e1d7792aba8f3" as const;
	const medic = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;

	const isMedic = await client.readContract({
		address: addr,
		abi: [
			{
				type: "function",
				name: "isVerifiedMedic",
				inputs: [{ name: "", type: "address" }],
				outputs: [{ name: "", type: "bool" }],
				stateMutability: "view",
			},
		],
		functionName: "isVerifiedMedic",
		args: [medic],
	});
	const owner = await client.readContract({
		address: addr,
		abi: [
			{
				type: "function",
				name: "owner",
				inputs: [],
				outputs: [{ name: "", type: "address" }],
				stateMutability: "view",
			},
		],
		functionName: "owner",
	});

	console.log("=== MedicAuthority on-chain state ===");
	console.log(`  Contract:              ${addr}`);
	console.log(`  owner:                 ${owner}`);
	console.log(`  isVerifiedMedic(${medic}): ${isMedic}`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
