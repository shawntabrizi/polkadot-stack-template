import hre from "hardhat";
import { updateDeployments } from "./deployments-utils";
import { polkadotHubTestnet } from "../hardhat.config";

async function main() {
	console.log("Deploying ProofOfExistence (EVM/solc)...");

	const isTestnet = hre.network.name === "polkadotTestnet";
	const chainOption = isTestnet ? { chain: polkadotHubTestnet } : {};

	const [walletClient] = await hre.viem.getWalletClients(chainOption);
	const publicClient = await hre.viem.getPublicClient(chainOption);
	const artifact = await hre.artifacts.readArtifact("ProofOfExistence");

	const hash = await walletClient.deployContract({
		abi: artifact.abi,
		bytecode: artifact.bytecode as `0x${string}`,
	});

	const receipt = await publicClient.waitForTransactionReceipt({
		hash,
		timeout: 120_000,
	});

	if (!receipt.contractAddress) {
		throw new Error(`Deploy tx ${hash} did not create a contract`);
	}

	console.log(`EVM ProofOfExistence deployed to: ${receipt.contractAddress}`);
	updateDeployments({ evm: receipt.contractAddress });
	console.log("Updated deployments.json");
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
