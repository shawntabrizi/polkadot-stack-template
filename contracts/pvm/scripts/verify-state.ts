import { createPublicClient, http } from "viem";

async function main() {
	const client = createPublicClient({ transport: http("http://127.0.0.1:8645") });
	const addr = "0xc01ee7f10ea4af4673cfff62710e1d7792aba8f3" as const;
	const medic = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
	const multisigH160 = "0x9549ff5910afff47319cba6acd90c683278f267f" as const;

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
	const authCount = await client.readContract({
		address: addr,
		abi: [
			{
				type: "function",
				name: "authorityCount",
				inputs: [],
				outputs: [{ name: "", type: "uint256" }],
				stateMutability: "view",
			},
		],
		functionName: "authorityCount",
	});
	const isAuth = await client.readContract({
		address: addr,
		abi: [
			{
				type: "function",
				name: "isAuthority",
				inputs: [{ name: "", type: "address" }],
				outputs: [{ name: "", type: "bool" }],
				stateMutability: "view",
			},
		],
		functionName: "isAuthority",
		args: [multisigH160],
	});

	console.log("=== MedicAuthority on-chain state ===");
	console.log(`  Contract:       ${addr}`);
	console.log(`  authorityCount: ${authCount}`);
	console.log(`  isAuthority(${multisigH160}): ${isAuth}`);
	console.log(`  isVerifiedMedic(${medic}): ${isMedic}`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
