/**
 * End-to-end test of the multisig add-medic flow against Paseo testnet.
 *
 * Steps:
 *   1. Preflight: multisig mapped? authority owner = multisig? already verified?
 *   2. Council1 proposes addMedic(medicH160) via as_multi
 *   3. Council2 approves via as_multi → threshold reached → Revive.call dispatches
 *   4. Verify isVerifiedMedic(medicH160) on the authority contract
 *
 * Required env vars:
 *   COUNCIL1_PASS, COUNCIL2_PASS — keystore passwords (keystores at --wallets-dir)
 *
 * Optional env vars:
 *   SUBSTRATE_RPC_WS — defaults to wss://testnet-passet-hub.polkadot.io
 *   ETH_RPC_HTTP    — defaults to https://services.polkadothub-rpc.com/testnet
 *   MEDIC_ADDRESS   — H160 to verify. Defaults to H160 derived from Medic.json.
 *
 * Usage:
 *   COUNCIL1_PASS=xxx COUNCIL2_PASS=yyy npx ts-node --transpile-only \
 *       scripts/test-paseo-medic-flow.ts [--wallets-dir ../../..]
 */

import * as fs from "fs";
import * as path from "path";
import { createPublicClient, http, keccak256 } from "viem";
import {
	cryptoWaitReady,
	decodeAddress,
	sortAddresses,
	createKeyMulti,
	encodeAddress,
} from "@polkadot/util-crypto";
import { u8aToHex } from "@polkadot/util";
import { Keyring } from "@polkadot/keyring";
import { createClient, FixedSizeBinary, Binary } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws-provider/node";
import { withPolkadotSdkCompat } from "polkadot-api/polkadot-sdk-compat";
import { getPolkadotSigner } from "polkadot-api/signer";
import { stack_template } from "@polkadot-api/descriptors";
import { encodeFunctionData } from "viem";
import { readDeployments } from "./_deployments";
import {
	proposeMultisigAuthorityAction,
	approveMultisigAuthorityAction,
	otherSignatoriesFor,
	REVIVE_CALL_WEIGHT,
	MAX_STORAGE_DEPOSIT,
} from "./_lib/medicAuthorityMultisig";

const WS_URL = process.env.SUBSTRATE_RPC_WS ?? "wss://asset-hub-paseo.dotters.network";
const ETH_RPC = process.env.ETH_RPC_HTTP ?? "https://services.polkadothub-rpc.com/testnet";
const DEFAULT_WALLETS_DIR = path.resolve(__dirname, "../../../..");

const ABI = [
	{
		type: "function",
		name: "addMedic",
		inputs: [{ name: "medic", type: "address" }],
		outputs: [],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "isVerifiedMedic",
		inputs: [{ name: "", type: "address" }],
		outputs: [{ name: "", type: "bool" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "owner",
		inputs: [],
		outputs: [{ name: "", type: "address" }],
		stateMutability: "view",
	},
] as const;

function hexToBytes(hex: string): Uint8Array {
	const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
	const out = new Uint8Array(clean.length / 2);
	for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
	return out;
}

function argValue(argv: string[], flag: string): string | undefined {
	const i = argv.indexOf(flag);
	return i !== -1 ? argv[i + 1] : undefined;
}

function substrateToH160(publicKey: Uint8Array): `0x${string}` {
	const hash = keccak256(u8aToHex(publicKey) as `0x${string}`);
	return ("0x" + hash.slice(2 + 24)) as `0x${string}`;
}

function loadKeystoreSigner(walletsDir: string, file: string, passEnv: string) {
	const p = path.join(walletsDir, file);
	if (!fs.existsSync(p)) throw new Error(`Keystore not found: ${p}`);
	const json = JSON.parse(fs.readFileSync(p, "utf-8"));
	const password = process.env[passEnv];
	if (!password)
		throw new Error(
			`${passEnv} not set. Export the keystore's password first: export ${passEnv}=...`,
		);
	const keyring = new Keyring({ type: "sr25519", ss58Format: 42 });
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const pair = keyring.addFromJson(json as any);
	try {
		pair.decodePkcs8(password);
	} catch {
		throw new Error(`Wrong password in ${passEnv} for ${file}`);
	}
	return {
		ss58: pair.address,
		publicKey: pair.publicKey,
		signer: getPolkadotSigner(pair.publicKey, "Sr25519", (msg) => pair.sign(msg)),
	};
}

function readKeystoreAddress(
	walletsDir: string,
	file: string,
): { ss58: string; h160: `0x${string}` } {
	const p = path.join(walletsDir, file);
	if (!fs.existsSync(p)) throw new Error(`Keystore not found: ${p}`);
	const json = JSON.parse(fs.readFileSync(p, "utf-8")) as { address: string };
	if (!json.address) throw new Error(`Keystore ${file} is missing 'address' field.`);
	const publicKey = decodeAddress(json.address);
	return { ss58: json.address, h160: substrateToH160(publicKey) };
}

async function main() {
	await cryptoWaitReady();

	const argv = process.argv.slice(2);
	const walletsDir = path.resolve(argValue(argv, "--wallets-dir") ?? DEFAULT_WALLETS_DIR);

	console.log("=== Paseo add-medic flow test ===");
	console.log(`  WS:    ${WS_URL}`);
	console.log(`  RPC:   ${ETH_RPC}`);
	console.log(`  Wallets: ${walletsDir}`);
	console.log("");

	const deployments = readDeployments("paseo");
	if (!deployments.multisig) throw new Error("deployments.paseo.multisig missing");
	if (!deployments.medicAuthority) throw new Error("deployments.paseo.medicAuthority missing");

	const { threshold, signatories, ss58: multiSs58, h160: multisigH160 } = deployments.multisig;
	const authorityAddr = deployments.medicAuthority as `0x${string}`;

	console.log(`  Multisig SS58:  ${multiSs58}`);
	console.log(`  Multisig H160:  ${multisigH160}`);
	console.log(`  Threshold:      ${threshold}-of-${signatories.length}`);
	console.log(`  Authority:      ${authorityAddr}`);
	console.log("");

	// Sanity-check: re-derive multisig from signatories to catch config drift.
	const sortedSignatories = sortAddresses(signatories, 42);
	const derivedMultisigSs58 = encodeAddress(createKeyMulti(sortedSignatories, threshold), 42);
	if (derivedMultisigSs58 !== multiSs58) {
		throw new Error(
			`Multisig mismatch: deployments says ${multiSs58} but signatories+threshold derives ${derivedMultisigSs58}`,
		);
	}

	// Medic target (override via MEDIC_ADDRESS env, else H160 from Medic.json).
	const medicH160 = (process.env.MEDIC_ADDRESS ??
		readKeystoreAddress(walletsDir, "Medic.json").h160) as `0x${string}`;
	console.log(`  Medic target:   ${medicH160}`);
	console.log("");

	// Load Council signers.
	console.log("[auth] Unlocking Council1.json + Council2.json…");
	const council1 = loadKeystoreSigner(walletsDir, "Council1.json", "COUNCIL1_PASS");
	const council2 = loadKeystoreSigner(walletsDir, "Council2.json", "COUNCIL2_PASS");
	console.log(`  Council1 SS58: ${council1.ss58}`);
	console.log(`  Council2 SS58: ${council2.ss58}`);
	if (!sortedSignatories.includes(council1.ss58))
		throw new Error(`Council1 (${council1.ss58}) is not a multisig signatory`);
	if (!sortedSignatories.includes(council2.ss58))
		throw new Error(`Council2 (${council2.ss58}) is not a multisig signatory`);
	console.log("");

	// --- Preflight ---
	console.log("[preflight] Reading chain state…");
	const evmClient = createPublicClient({ transport: http(ETH_RPC) });
	const owner = (await evmClient.readContract({
		address: authorityAddr,
		abi: ABI,
		functionName: "owner",
	})) as string;
	console.log(`  Authority owner:    ${owner}`);
	if (owner.toLowerCase() !== multisigH160.toLowerCase()) {
		throw new Error(
			`Authority owner ${owner} != multisig H160 ${multisigH160}. addMedic will revert with 'not owner'.`,
		);
	}
	console.log(`  ✓ Authority is owned by the multisig.`);

	const alreadyVerified = (await evmClient.readContract({
		address: authorityAddr,
		abi: ABI,
		functionName: "isVerifiedMedic",
		args: [medicH160],
	})) as boolean;
	if (alreadyVerified) {
		console.log(`  ✓ Medic ${medicH160} is already a verified medic. Nothing to do.`);
		return;
	}
	console.log(`  ✗ Medic ${medicH160} is not yet verified — proceeding with add flow.`);

	const client = createClient(withPolkadotSdkCompat(getWsProvider(WS_URL)));
	try {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const api: any = client.getTypedApi(stack_template);

		// Multisig mapping check.
		const multisigMapping = await api.query.Revive.OriginalAccount.getValue(
			new FixedSizeBinary(hexToBytes(multisigH160)) as FixedSizeBinary<20>,
		);
		// Ensure the multisig has funds — pallet-revive's map_account reserves a deposit
		// and the Revive.call storage_deposit is taken from the caller (multisig), so a
		// zero-balance multisig silently reverts every inner call.
		const multisigAccount = await api.query.System.Account.getValue(multiSs58);
		const multisigFree: bigint = multisigAccount.data.free;
		const FUND_THRESHOLD = 10_000_000_000_000n; // 10 PAS (12 decimals on Paseo Asset Hub)
		const FUND_AMOUNT = 20_000_000_000_000n; // 20 PAS
		console.log(`  Multisig balance:   ${multisigFree.toString()} planck`);
		if (multisigFree < FUND_THRESHOLD) {
			console.log(
				`  [fund] Multisig below ${FUND_THRESHOLD.toString()} planck — transferring ${FUND_AMOUNT.toString()} planck from Council1…`,
			);
			const fundTx = api.tx.Balances.transfer_keep_alive({
				dest: { type: "Id", value: multiSs58 },
				value: FUND_AMOUNT,
			});
			const { submitExtrinsic } = await import("./_papi");
			const fundResult = await submitExtrinsic(fundTx, council1.signer, { mortal: false });
			console.log(
				`  [fund] ✓ Funded at block #${fundResult.blockNumber} (tx ${fundResult.txHash})`,
			);
		} else {
			console.log("  ✓ Multisig is funded.");
		}

		if (!multisigMapping) {
			console.log("");
			console.log("[map] Multisig not mapped — dispatching Revive.map_account() first…");
			const mapInner = api.tx.Revive.map_account();
			const mapPropose = await proposeMultisigAuthorityAction({
				api,
				signer: council1.signer,
				threshold,
				innerCall: mapInner,
				otherSignatoriesSs58: otherSignatoriesFor(sortedSignatories, council1.ss58),
			});
			console.log(
				`  [map 1/2] Proposed at block #${mapPropose.blockNumber} (tx ${mapPropose.txHash})`,
			);
			await approveMultisigAuthorityAction({
				api,
				signer: council2.signer,
				threshold,
				innerCall: mapInner,
				timepoint: mapPropose.timepoint,
				otherSignatoriesSs58: otherSignatoriesFor(sortedSignatories, council2.ss58),
			});
			console.log("  [map 2/2] Approved.");
			// Re-check
			const mappedNow = await api.query.Revive.OriginalAccount.getValue(
				new FixedSizeBinary(hexToBytes(multisigH160)) as FixedSizeBinary<20>,
			);
			if (!mappedNow) {
				throw new Error(
					"map_account asMulti completed but mapping still absent — inner call reverted. Check tx on Subscan.",
				);
			}
			console.log("  ✓ Multisig mapped in pallet-revive.");
		} else {
			console.log(`  ✓ Multisig is already mapped in pallet-revive.`);
		}
		console.log("");

		// Build inner call: Revive.call(dest=authority, data=addMedic(medicH160)).
		const calldata = encodeFunctionData({
			abi: ABI,
			functionName: "addMedic",
			args: [medicH160],
		});
		const innerCall = api.tx.Revive.call({
			dest: new FixedSizeBinary(hexToBytes(authorityAddr)) as FixedSizeBinary<20>,
			value: 0n,
			weight_limit: REVIVE_CALL_WEIGHT,
			storage_deposit_limit: MAX_STORAGE_DEPOSIT,
			data: Binary.fromHex(calldata),
		});

		// --- Propose (Council1) ---
		console.log("[1/2] Council1 proposes addMedic…");
		const proposeResult = await proposeMultisigAuthorityAction({
			api,
			signer: council1.signer,
			threshold,
			innerCall,
			otherSignatoriesSs58: otherSignatoriesFor(sortedSignatories, council1.ss58),
		});
		console.log(`  ✓ Proposed at block #${proposeResult.blockNumber}`);
		console.log(`    callHash:  ${proposeResult.callHash}`);
		console.log(
			`    timepoint: { height: ${proposeResult.timepoint.height}, index: ${proposeResult.timepoint.index} }`,
		);
		console.log(`    tx:        ${proposeResult.txHash}`);
		console.log("");

		// --- Approve (Council2) — this reaches threshold and dispatches Revive.call ---
		console.log("[2/2] Council2 approves & executes…");
		const approveResult = await approveMultisigAuthorityAction({
			api,
			signer: council2.signer,
			threshold,
			innerCall,
			timepoint: proposeResult.timepoint,
			otherSignatoriesSs58: otherSignatoriesFor(sortedSignatories, council2.ss58),
		});
		console.log(`  ✓ Dispatched at block #${approveResult.blockNumber}`);
		console.log(`    tx: ${approveResult.txHash}`);
		console.log("");

		// --- Verify state change on contract ---
		// Outer extrinsic `ok` doesn't guarantee the inner Revive.call succeeded.
		// We must read contract storage to confirm addMedic ran end-to-end.
		console.log("[verify] Reading isVerifiedMedic from contract…");
		const verifiedNow = (await evmClient.readContract({
			address: authorityAddr,
			abi: ABI,
			functionName: "isVerifiedMedic",
			args: [medicH160],
		})) as boolean;

		if (verifiedNow) {
			console.log(`  ✓ SUCCESS — Medic ${medicH160} is now a verified medic on Paseo.`);
		} else {
			console.log(`  ✗ FAIL — Medic ${medicH160} is still NOT verified.`);
			console.log(
				`           Outer as_multi succeeded but inner Revive.call reverted silently.`,
			);
			console.log(
				`           Check the MultisigExecuted event on Subscan tx ${approveResult.txHash}`,
			);
			console.log(
				`           — its 'result' field holds the dispatch error from the inner call.`,
			);
			process.exit(1);
		}
	} finally {
		client.destroy();
	}
}

main().catch((e) => {
	console.error("");
	console.error("=== TEST FAILED ===");
	console.error((e as Error).message);
	process.exit(1);
});
