/**
 * One-shot demo setup: compile contracts, compute multisig, deploy both contracts to
 * Paseo testnet, and write deployments.json + web/src/config/deployments.ts.
 *
 * Usage:
 *   npm run set-deployments                  # compile + deploy to Paseo testnet
 *   npm run set-deployments -- --local       # compile + deploy to local node (http://127.0.0.1:8545)
 *   npm run set-deployments -- --skip-deploy # only recompute multisig, keep existing contract addresses
 *   npm run set-deployments -- --threshold 2 --ss58-prefix 42
 *   npm run set-deployments -- --wallets-dir ../other-keystores
 *
 * Signatories (multisig members) are read from Polkadot.js keystore JSONs
 * (`Council1.json`, `Council2.json`, `Medic.json`) sitting next to the repo root
 * (default: `../` relative to project root). These match the accounts imported
 * into Talisman / Polkadot.js extension and are what pallet-multisig checks at
 * sign time.
 *
 * Deployer (pays gas, no on-chain role) — VITE_ACCOUNT_0_PK from web/.env.local
 * on testnet; Alice's well-known dev key on --local.
 */

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { createWalletClient, createPublicClient, http, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
	createKeyMulti,
	encodeAddress,
	cryptoWaitReady,
	sortAddresses,
} from "@polkadot/util-crypto";
import { u8aToHex } from "@polkadot/util";
import { keccak256 } from "viem";
import { Keyring } from "@polkadot/keyring";
import { createClient, FixedSizeBinary } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws-provider/node";
import { withPolkadotSdkCompat } from "polkadot-api/polkadot-sdk-compat";
import { getPolkadotSigner } from "polkadot-api/signer";
import { stack_template } from "@polkadot-api/descriptors";
import {
	proposeMultisigAuthorityAction,
	approveMultisigAuthorityAction,
	otherSignatoriesFor,
} from "./_lib/medicAuthorityMultisig";
import { updateDeployments } from "./_deployments";

const ENV_FILE = path.resolve(__dirname, "../../../web/.env.local");
const ARTIFACTS_DIR = path.resolve(__dirname, "../artifacts/contracts");
const DEFAULT_WALLETS_DIR = path.resolve(__dirname, "../../../..");
const SIGNATORY_FILES = ["Council1.json", "Council2.json", "Medic.json"] as const;
const PASSWORD_ENV: Record<(typeof SIGNATORY_FILES)[number], string> = {
	"Council1.json": "COUNCIL1_PASS",
	"Council2.json": "COUNCIL2_PASS",
	"Medic.json": "MEDIC_PASS",
};

const TESTNET_RPC = "https://services.polkadothub-rpc.com/testnet";
const LOCAL_RPC = process.env.ETH_RPC_HTTP ?? "http://127.0.0.1:8545";
const TESTNET_WS = process.env.SUBSTRATE_RPC_WS ?? "wss://asset-hub-paseo.dotters.network";
const LOCAL_WS = process.env.SUBSTRATE_RPC_WS ?? "ws://127.0.0.1:10044";

// Well-known Substrate dev account (Alice). Pre-funded on a fresh local chain.
// Same value as contracts/pvm/hardhat.config.ts and web/src/config/evm.ts.
// On --local we deploy from Alice (who has balance). Council PKs are still used
// to derive the multisig address — but the deployer has no on-chain role in
// either contract (MedicalMarket is ownerless, MedicAuthority's owner is passed
// to the constructor), so deploying from Alice is equivalent.
const ALICE_ETH_KEY = "0x5fb92d6e98884f76de468fa3f6278f8807c48bebc13595d45af5bdc4da702133";

const paseoTestnet = defineChain({
	id: 420420417,
	name: "Polkadot Hub TestNet",
	nativeCurrency: { name: "Unit", symbol: "UNIT", decimals: 18 },
	rpcUrls: { default: { http: [TESTNET_RPC] } },
});

const localChain = defineChain({
	id: 420420421,
	name: "Polkadot Hub Local",
	nativeCurrency: { name: "Unit", symbol: "UNIT", decimals: 18 },
	rpcUrls: { default: { http: [LOCAL_RPC] } },
});

function parseEnvFile(filePath: string): Record<string, string> {
	if (!fs.existsSync(filePath)) return {};
	const vars: Record<string, string> = {};
	for (const line of fs.readFileSync(filePath, "utf-8").split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const eq = trimmed.indexOf("=");
		if (eq === -1) continue;
		const key = trimmed.slice(0, eq).trim();
		const val = trimmed
			.slice(eq + 1)
			.trim()
			.replace(/^["']|["']$/g, "");
		vars[key] = val;
	}
	return vars;
}

function readSignatoryAddresses(walletsDir: string): string[] {
	return SIGNATORY_FILES.map((name) => {
		const p = path.join(walletsDir, name);
		if (!fs.existsSync(p)) {
			throw new Error(
				`Signatory keystore not found: ${p}. Export the account from Polkadot.js / Talisman as a JSON keystore and drop it here, or pass --wallets-dir to point at the directory.`,
			);
		}
		const raw = JSON.parse(fs.readFileSync(p, "utf-8")) as { address?: string };
		if (!raw.address || typeof raw.address !== "string") {
			throw new Error(`Keystore ${p} is missing an 'address' field.`);
		}
		return raw.address;
	});
}

function argValue(argv: string[], flag: string): string | undefined {
	const i = argv.indexOf(flag);
	return i !== -1 ? argv[i + 1] : undefined;
}

function readArtifact(contractName: string): { abi: unknown[]; bytecode: `0x${string}` } {
	const p = path.join(ARTIFACTS_DIR, `${contractName}.sol`, `${contractName}.json`);
	if (!fs.existsSync(p))
		throw new Error(`Artifact not found: ${p}. Run 'npm run compile' first.`);
	const raw = JSON.parse(fs.readFileSync(p, "utf-8")) as {
		abi: unknown[];
		bytecode: string;
	};
	return { abi: raw.abi, bytecode: raw.bytecode as `0x${string}` };
}

function hexToBytes(hex: string): Uint8Array {
	const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
	const out = new Uint8Array(clean.length / 2);
	for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
	return out;
}

/**
 * Load a Polkadot.js keystore JSON and decrypt it with the configured env var.
 * Returns null if the password is missing or wrong, so the caller can fall through
 * to the dashboard-based manual flow without aborting the deploy.
 */
function loadSigner(walletsDir: string, file: (typeof SIGNATORY_FILES)[number]) {
	const filePath = path.join(walletsDir, file);
	if (!fs.existsSync(filePath)) return null;
	const json = JSON.parse(fs.readFileSync(filePath, "utf-8"));
	const password = process.env[PASSWORD_ENV[file]] ?? "";
	const keyring = new Keyring({ type: "sr25519", ss58Format: 42 });
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const pair = keyring.addFromJson(json as any);
	try {
		pair.decodePkcs8(password);
	} catch {
		return null;
	}
	return {
		ss58: pair.address,
		signer: getPolkadotSigner(pair.publicKey, "Sr25519", (msg) => pair.sign(msg)),
	};
}

// Pallet-revive charges a reservation deposit against the caller (the multisig)
// when creating the H160 mapping. A zero-balance multisig silently reverts the
// inner Revive.call inside as_multi — the outer extrinsic reports ok, but the
// mapping never lands. Fund the multisig to at least FUND_THRESHOLD first.
const FUND_THRESHOLD_PLANCK = 10_000_000_000_000n; // 10 PAS at 12 decimals
const FUND_AMOUNT_PLANCK = 20_000_000_000_000n; // 20 PAS

/**
 * Dispatch `Revive.map_account()` via pallet-multisig asMulti so the multisig's
 * H160 gets registered with pallet-revive. Without this, any later `Revive.call`
 * dispatched through the multisig reverts with "account unmapped". Idempotent:
 * returns early when the mapping already exists.
 *
 * Funds the multisig from the first unlocked signer before the map if the multisig
 * is below FUND_THRESHOLD_PLANCK — pallet-revive's mapping deposit would otherwise
 * revert the inner call silently.
 */
async function mapMultisigViaAsMulti(args: {
	wsUrl: string;
	multisigSs58: string;
	multisigH160: `0x${string}`;
	sortedSignatories: string[];
	threshold: number;
	walletsDir: string;
}): Promise<void> {
	const { wsUrl, multisigSs58, multisigH160, sortedSignatories, threshold, walletsDir } = args;
	const client = createClient(withPolkadotSdkCompat(getWsProvider(wsUrl)));
	try {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const api: any = client.getTypedApi(stack_template);
		const key = new FixedSizeBinary(hexToBytes(multisigH160)) as FixedSizeBinary<20>;
		const existing = await api.query.Revive.OriginalAccount.getValue(key);
		if (existing) {
			console.log("  Multisig is already mapped in pallet-revive. Skipping.");
			return;
		}

		// Try to unlock enough keystores to meet threshold.
		const signers: Array<NonNullable<ReturnType<typeof loadSigner>>> = [];
		for (const file of SIGNATORY_FILES) {
			const s = loadSigner(walletsDir, file);
			if (s) signers.push(s);
			if (signers.length >= threshold) break;
		}
		if (signers.length < threshold) {
			const need = SIGNATORY_FILES.map((f) => PASSWORD_ENV[f]).join(", ");
			console.log(
				`  [SKIP] Only ${signers.length}/${threshold} keystore(s) unlocked. Set env vars ${need} to auto-map, or click "Propose Revive.map_account" on the governance dashboard (needs ${threshold} signer approvals).`,
			);
			return;
		}

		// Fund the multisig if needed — pallet-revive deposit is taken from the multisig.
		const { submitExtrinsic } = await import("./_papi");
		const multisigAccount = await api.query.System.Account.getValue(multisigSs58);
		const multisigFree: bigint = multisigAccount.data.free;
		if (multisigFree < FUND_THRESHOLD_PLANCK) {
			console.log(
				`  [fund] Multisig balance ${multisigFree.toString()} < ${FUND_THRESHOLD_PLANCK.toString()} planck — transferring ${FUND_AMOUNT_PLANCK.toString()} planck from ${signers[0].ss58}…`,
			);
			const fundTx = api.tx.Balances.transfer_keep_alive({
				dest: { type: "Id", value: multisigSs58 },
				value: FUND_AMOUNT_PLANCK,
			});
			const fundResult = await submitExtrinsic(fundTx, signers[0].signer, {
				mortal: false,
			});
			console.log(`  [fund] ✓ Funded at block #${fundResult.blockNumber}`);
		} else {
			console.log(`  Multisig funded: ${multisigFree.toString()} planck. Skipping transfer.`);
		}

		const [proposer, approver] = signers;
		const innerCall = api.tx.Revive.map_account();

		console.log(`  [1/2] Proposing map_account via ${proposer.ss58}…`);
		const proposeResult = await proposeMultisigAuthorityAction({
			api,
			signer: proposer.signer,
			threshold,
			innerCall,
			otherSignatoriesSs58: otherSignatoriesFor(sortedSignatories, proposer.ss58),
		});

		console.log(`  [2/2] Approving via ${approver.ss58}…`);
		await approveMultisigAuthorityAction({
			api,
			signer: approver.signer,
			threshold,
			innerCall,
			timepoint: proposeResult.timepoint,
			otherSignatoriesSs58: otherSignatoriesFor(sortedSignatories, approver.ss58),
		});

		// Verify
		const mappedNow = await api.query.Revive.OriginalAccount.getValue(key);
		if (mappedNow) console.log("  ✓ Multisig mapped in pallet-revive.");
		else
			console.log(
				"  [WARN] map_account dispatched but mapping still absent — inner call may have reverted silently.",
			);
	} catch (e) {
		console.log(`  [WARN] map_account flow failed: ${(e as Error).message}`);
		console.log(
			'  Use the "Propose Revive.map_account" button on the governance dashboard instead.',
		);
	} finally {
		client.destroy();
	}
}

/**
 * One-off: map Alice/Bob/Charlie in pallet-revive. Required for the frontend's
 * dev-account flows (patient createListing, researcher placeBuyOrder, patient
 * fulfill, etc.) — those dispatch `Revive.call` directly from the sr25519
 * signer, and pallet-revive refuses calls whose caller AccountId has no
 * registered H160. Idempotent: AccountAlreadyMapped is treated as success.
 *
 * Local-only: on a public network, real users import their own keys via wallet
 * and map themselves on first interaction.
 */
async function mapDevAccountsLocal(wsUrl: string): Promise<void> {
	const DEV_MNEMONIC = "bottom drive obey lake curtain smoke basket hold race lonely fit walk";
	const DEV_PATHS = ["//Alice", "//Bob", "//Charlie"] as const;
	const keyring = new Keyring({ type: "sr25519", ss58Format: 42 });

	const client = createClient(withPolkadotSdkCompat(getWsProvider(wsUrl)));
	try {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const api: any = client.getTypedApi(stack_template);
		const { submitExtrinsic } = await import("./_papi");

		for (const path of DEV_PATHS) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const kp = keyring.addFromUri(DEV_MNEMONIC + path) as any;
			const signer = getPolkadotSigner(kp.publicKey, "Sr25519", (m: Uint8Array) =>
				kp.sign(m),
			);
			try {
				const r = await submitExtrinsic(api.tx.Revive.map_account(), signer, {
					mortal: false,
				});
				console.log(`  ${path} mapped. Tx: ${r.txHash}`);
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				if (/Already\s*Mapped|AccountAlready/i.test(msg)) {
					console.log(`  ${path} already mapped.`);
				} else {
					console.log(`  [WARN] ${path} map failed: ${msg}`);
				}
			}
		}
	} finally {
		client.destroy();
	}
}

async function deployContract(
	walletClient: ReturnType<typeof createWalletClient>,
	publicClient: ReturnType<typeof createPublicClient>,
	contractName: string,
	args: unknown[] = [],
): Promise<`0x${string}`> {
	const { abi, bytecode } = readArtifact(contractName);
	console.log(`  Deploying ${contractName}...`);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const hash = await (walletClient as any).deployContract({
		abi,
		bytecode,
		args,
		maxPriorityFeePerGas: 10n,
	});
	const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
	if (!receipt.contractAddress) throw new Error(`Deploy tx ${hash} produced no contract address`);
	console.log(`  ${contractName} → ${receipt.contractAddress}`);
	return receipt.contractAddress;
}

async function main() {
	await cryptoWaitReady();

	const argv = process.argv.slice(2);
	const isLocal = argv.includes("--local");
	const skipDeploy = argv.includes("--skip-deploy");
	const threshold = parseInt(argValue(argv, "--threshold") ?? "2", 10);
	const ss58Prefix = parseInt(argValue(argv, "--ss58-prefix") ?? "42", 10);
	const walletsDir = path.resolve(argValue(argv, "--wallets-dir") ?? DEFAULT_WALLETS_DIR);

	const env = parseEnvFile(ENV_FILE);

	// --- Signatories come from keystore JSONs (Polkadot.js / Talisman exports) ---
	// These are the accounts that will actually sign asMulti calls, so they must
	// match what your wallet reports — not a derivation of .env.local private keys.
	const signatories = readSignatoryAddresses(walletsDir);

	if (signatories.length < threshold) {
		console.error(
			`Need at least ${threshold} keystore files in ${walletsDir} (${SIGNATORY_FILES.join(", ")}). Found ${signatories.length}.`,
		);
		process.exit(1);
	}

	const sorted = sortAddresses(signatories, ss58Prefix);
	const multiAccountId = createKeyMulti(sorted, threshold);
	const multiSs58 = encodeAddress(multiAccountId, ss58Prefix);
	const multisigH160 = ("0x" +
		keccak256(u8aToHex(multiAccountId) as `0x${string}`).slice(2 + 24)) as `0x${string}`;

	console.log("=== Multisig ===");
	console.log(`  SS58:      ${multiSs58}`);
	console.log(`  H160:      ${multisigH160}`);
	console.log(`  Threshold: ${threshold}-of-${sorted.length}`);
	for (const s of sorted) console.log(`    - ${s}`);
	console.log("");

	const network = isLocal ? "local" : "paseo";

	// --- Ensure dev accounts are mapped in pallet-revive (local only) ---
	// Required for the frontend's direct `Revive.call` flows from Alice/Bob/Charlie.
	// On Paseo, real users map themselves on first interaction via their wallet.
	// Idempotent — runs even under --skip-deploy so zombienet restarts recover cleanly.
	if (isLocal) {
		console.log("");
		console.log("=== Mapping dev accounts in pallet-revive ===");
		await mapDevAccountsLocal(LOCAL_WS);
	}

	if (skipDeploy) {
		updateDeployments(network, {
			multisig: { ss58: multiSs58, h160: multisigH160, threshold, signatories: sorted },
		});
		console.log(
			`--skip-deploy: multisig updated for ${network}, contract addresses unchanged.`,
		);
		return;
	}

	// --- Compile contracts ---
	console.log("=== Compiling contracts ===");
	execSync("npx hardhat compile", { stdio: "inherit", cwd: path.resolve(__dirname, "..") });
	console.log("");

	// --- Deploy ---
	const networkLabel = isLocal ? "local" : "Paseo testnet";
	const rpc = isLocal ? LOCAL_RPC : TESTNET_RPC;
	const chain = isLocal ? localChain : paseoTestnet;
	// Local: Alice (pre-funded dev account). Paseo: VITE_ACCOUNT_0_PK (user-funded via faucet).
	// Deployer identity has no on-chain role (MedicalMarket is ownerless, MedicAuthority owner
	// is passed to the constructor) — it only pays gas.
	const envPk = env.VITE_ACCOUNT_0_PK;
	if (!isLocal && (!envPk || envPk === "0x" || envPk.length <= 2)) {
		console.error(
			"VITE_ACCOUNT_0_PK is required in web/.env.local to deploy to Paseo. Fund its H160 at https://faucet.polkadot.io.",
		);
		process.exit(1);
	}
	const deployerPk = (isLocal ? ALICE_ETH_KEY : envPk) as `0x${string}`;

	console.log(`=== Deploying to ${networkLabel} (${rpc}) ===`);
	console.log(`  Deployer: ${privateKeyToAccount(deployerPk).address}`);
	console.log("");

	const account = privateKeyToAccount(deployerPk);
	const walletClient = createWalletClient({ account, chain, transport: http(rpc) });
	const publicClient = createPublicClient({ chain, transport: http(rpc) });

	const marketAddress = await deployContract(walletClient, publicClient, "MedicalMarket");
	const authorityAddress = await deployContract(walletClient, publicClient, "MedicAuthority", [
		multisigH160,
	]);

	console.log("");

	// --- Write all deployment files ---
	updateDeployments(network, {
		medicalMarket: marketAddress,
		medicAuthority: authorityAddress,
		multisig: { ss58: multiSs58, h160: multisigH160, threshold, signatories: sorted },
	});

	// --- Ensure multisig is mapped in pallet-revive ---
	// Required for any future `Revive.call` dispatched via asMulti to not revert with
	// "account unmapped". Auto-runs when enough keystore passwords are in env;
	// otherwise prints instructions so the user can complete it in the dashboard.
	console.log("");
	console.log("=== Mapping multisig in pallet-revive ===");
	await mapMultisigViaAsMulti({
		wsUrl: isLocal ? LOCAL_WS : TESTNET_WS,
		multisigSs58: multiSs58,
		multisigH160,
		sortedSignatories: sorted,
		threshold,
		walletsDir,
	});
	console.log("");

	console.log("=== Done ===");
	console.log(`  MedicalMarket:  ${marketAddress}`);
	console.log(`  MedicAuthority: ${authorityAddress}`);
	console.log(`  Multisig SS58:  ${multiSs58}`);
	console.log(`  Multisig H160:  ${multisigH160}`);
	console.log("");
	console.log("  deployments.json and web/src/config/deployments.ts updated.");
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
