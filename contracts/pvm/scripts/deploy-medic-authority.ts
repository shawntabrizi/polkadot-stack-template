import hre from "hardhat";
import { polkadotHubTestnet } from "../hardhat.config";
import { readDeployments, updateDeployments } from "./_deployments";

async function deployContract(
	walletClient: Awaited<ReturnType<typeof hre.viem.getWalletClients>>[number],
	publicClient: Awaited<ReturnType<typeof hre.viem.getPublicClient>>,
	artifactName: string,
	args: unknown[] = [],
): Promise<string> {
	const artifact = await hre.artifacts.readArtifact(artifactName);
	const hash = await walletClient.deployContract({
		abi: artifact.abi,
		bytecode: artifact.bytecode as `0x${string}`,
		args,
		maxPriorityFeePerGas: 10n,
	});
	const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
	if (!receipt.contractAddress) {
		throw new Error(`Deploy tx ${hash} for ${artifactName} did not create a contract`);
	}
	return receipt.contractAddress;
}

async function main() {
	const deployments = readDeployments();
	if (!deployments.multisig) {
		throw new Error("Run compute-multisig.ts first to populate deployments.json.multisig");
	}
	const { h160: multisigH160 } = deployments.multisig;

	const isTestnet = hre.network.name === "polkadotTestnet";
	const chainOption = isTestnet ? { chain: polkadotHubTestnet } : {};

	const [walletClient] = await hre.viem.getWalletClients(chainOption);
	const publicClient = await hre.viem.getPublicClient(chainOption);

	console.log(`Deploying MedicAuthority with initial authority: ${multisigH160}`);
	const marketAddress = await deployContract(walletClient, publicClient, "MedicAuthority", [
		[multisigH160],
	]);
	console.log(`MedicAuthority deployed to: ${marketAddress}`);

	updateDeployments({ medicAuthority: marketAddress });
	console.log("Updated deployments.json and web/src/config/deployments.ts");
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
