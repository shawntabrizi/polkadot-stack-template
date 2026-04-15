import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-viem";
import "@nomicfoundation/hardhat-verify";
import { vars } from "hardhat/config";
import { defineChain } from "viem";

export const polkadotHubTestnet = defineChain({
	id: 420420417,
	name: "Polkadot Hub TestNet",
	nativeCurrency: { name: "Unit", symbol: "UNIT", decimals: 18 },
	rpcUrls: {
		default: { http: ["https://services.polkadothub-rpc.com/testnet"] },
	},
});

const config: HardhatUserConfig = {
	solidity: "0.8.28",
	networks: {
		local: {
			// Local node Ethereum RPC endpoint
			url: process.env.ETH_RPC_HTTP || "http://127.0.0.1:8545",
			accounts: [
				// Alice dev account private key
				"0x5fb92d6e98884f76de468fa3f6278f8807c48bebc13595d45af5bdc4da702133",
			],
		},
		polkadotTestnet: {
			url: "https://services.polkadothub-rpc.com/testnet",
			chainId: 420420417,
			accounts: [process.env.PRIVATE_KEY ?? vars.get("PRIVATE_KEY", "")].filter(Boolean),
		},
	},
	etherscan: {
		apiKey: {
			polkadotTestnet: "no-api-key-needed",
		},
		customChains: [
			{
				network: "polkadotTestnet",
				chainId: 420420417,
				urls: {
					apiURL: "https://blockscout-testnet.polkadot.io/api",
					browserURL: "https://blockscout-testnet.polkadot.io/",
				},
			},
		],
	},
};

export default config;
