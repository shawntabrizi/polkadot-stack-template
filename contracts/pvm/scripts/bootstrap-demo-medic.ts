/**
 * One-shot demo bootstrap run by start-all.sh after MedicAuthority deploys.
 *
 *   1. Fund the multisig SS58 from Alice (pays inner-call fees).
 *   2. Dispatch Revive.map_account() via asMulti (Alice → Bob) so the multisig's
 *      AccountId ↔ H160 binding is registered in pallet-revive.
 *   3. Dispatch MedicAuthority.addMedic(Alice's keccak256-H160) via asMulti so the
 *      frontend's VerifiedBadge lights up for listings that Alice (the dev default
 *      frontend signer) creates or owns.
 *
 * Each asMulti uses Alice as first signer (submits with maybe_timepoint = None),
 * then Bob as second signer (submits with Some(timepoint)) — threshold reached,
 * inner call dispatches. Runs sequentially in one process; no pending-state file.
 *
 * Idempotent: if the multisig is already mapped or the medic already added, the
 * corresponding asMulti still executes but the contract treats it as a no-op (or
 * reverts silently, in the case of a duplicate addMedic — acceptable for bootstrap).
 */

import { createClient, Binary, FixedSizeBinary } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws-provider/node";
import { withPolkadotSdkCompat } from "polkadot-api/polkadot-sdk-compat";
import { getPolkadotSigner } from "polkadot-api/signer";
import { cryptoWaitReady } from "@polkadot/util-crypto";
import { u8aToHex } from "@polkadot/util";
import { Keyring } from "@polkadot/keyring";
import { keccak256, encodeFunctionData } from "viem";
import { stack_template } from "@polkadot-api/descriptors";
import { readDeployments } from "./_deployments";
import { submitExtrinsic } from "./_papi";

const WS_URL = process.env.SUBSTRATE_RPC_WS ?? "ws://127.0.0.1:9944";
const DEV_MNEMONIC = "bottom drive obey lake curtain smoke basket hold race lonely fit walk";
const SS58_PREFIX = 42;
const FUND_AMOUNT_PLANCK = 10_000_000_000_000n; // 10 UNIT
const REVIVE_CALL_WEIGHT = { ref_time: 3_000_000_000n, proof_size: 1_048_576n };
const MAX_STORAGE_DEPOSIT = 100_000_000_000_000n;
const AS_MULTI_WEIGHT = { ref_time: 30_000_000_000n, proof_size: 2_000_000n };

const medicAuthorityAbi = [
	{
		type: "function",
		name: "addMedic",
		inputs: [{ name: "medic", type: "address" }],
		outputs: [],
		stateMutability: "nonpayable",
	},
] as const;

function deriveSr25519(path: string) {
	const keyring = new Keyring({ type: "sr25519", ss58Format: SS58_PREFIX });
	return keyring.addFromUri(DEV_MNEMONIC + path);
}

function keccakH160(accountId32: Uint8Array): `0x${string}` {
	const hex = keccak256(u8aToHex(accountId32) as `0x${string}`);
	return ("0x" + hex.slice(2 + 24)) as `0x${string}`;
}

function hexToBytes(hex: string): Uint8Array {
	const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
	const out = new Uint8Array(clean.length / 2);
	for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
	return out;
}

async function dispatchViaAsMulti(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	api: any,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	innerCall: any,
	threshold: number,
	sortedSignatories: string[],
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	firstSigner: { ss58: string; polkadotSigner: any },
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	secondSigner: { ss58: string; polkadotSigner: any },
) {
	const firstOther = sortedSignatories.filter((s) => s !== firstSigner.ss58);
	const firstTx = api.tx.Multisig.as_multi({
		threshold,
		other_signatories: firstOther,
		maybe_timepoint: undefined,
		call: innerCall.decodedCall,
		max_weight: AS_MULTI_WEIGHT,
	});
	const first = await submitExtrinsic(firstTx, firstSigner.polkadotSigner);
	const timepoint = { height: first.blockNumber, index: first.blockIndex };

	const secondOther = sortedSignatories.filter((s) => s !== secondSigner.ss58);
	const secondTx = api.tx.Multisig.as_multi({
		threshold,
		other_signatories: secondOther,
		maybe_timepoint: timepoint,
		call: innerCall.decodedCall,
		max_weight: AS_MULTI_WEIGHT,
	});
	await submitExtrinsic(secondTx, secondSigner.polkadotSigner);
}

async function main() {
	await cryptoWaitReady();
	const deployments = readDeployments();
	if (!deployments.multisig)
		throw new Error("deployments.json missing 'multisig' — run compute-multisig first");
	if (!deployments.medicAuthority)
		throw new Error(
			"deployments.json missing 'medicAuthority' — run deploy-medic-authority first",
		);

	const { threshold, signatories, ss58: multisigSs58 } = deployments.multisig;
	const sortedSignatories = [...signatories].sort();

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const alice = deriveSr25519("//Alice") as any;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const bob = deriveSr25519("//Bob") as any;
	const aliceSigner = getPolkadotSigner(alice.publicKey, "Sr25519", (m) => alice.sign(m));
	const bobSigner = getPolkadotSigner(bob.publicKey, "Sr25519", (m) => bob.sign(m));

	const client = createClient(withPolkadotSdkCompat(getWsProvider(WS_URL)));
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const api: any = client.getTypedApi(stack_template);

	console.log("[1/3] Funding multisig from Alice...");
	const fundTx = api.tx.Balances.transfer_keep_alive({
		dest: { type: "Id", value: multisigSs58 },
		value: FUND_AMOUNT_PLANCK,
	});
	const fundResult = await submitExtrinsic(fundTx, aliceSigner);
	console.log(`  [OK] Funded at block #${fundResult.blockNumber}`);

	console.log("[2/3] Mapping multisig in pallet-revive via asMulti...");
	try {
		await dispatchViaAsMulti(
			api,
			api.tx.Revive.map_account(),
			threshold,
			sortedSignatories,
			{ ss58: alice.address, polkadotSigner: aliceSigner },
			{ ss58: bob.address, polkadotSigner: bobSigner },
		);
		console.log("  [OK] map_account dispatched.");
	} catch (e) {
		console.log(`  [WARN] map_account failed (may already be mapped): ${(e as Error).message}`);
	}

	const aliceH160 = keccakH160(alice.publicKey);
	console.log(`[3/3] Adding Alice (${aliceH160}) as verified medic via asMulti...`);
	const calldata = encodeFunctionData({
		abi: medicAuthorityAbi,
		functionName: "addMedic",
		args: [aliceH160],
	});
	const addMedicCall = api.tx.Revive.call({
		dest: new FixedSizeBinary(hexToBytes(deployments.medicAuthority)) as FixedSizeBinary<20>,
		value: 0n,
		weight_limit: REVIVE_CALL_WEIGHT,
		storage_deposit_limit: MAX_STORAGE_DEPOSIT,
		data: Binary.fromHex(calldata as `0x${string}`),
	});
	try {
		await dispatchViaAsMulti(
			api,
			addMedicCall,
			threshold,
			sortedSignatories,
			{
				ss58: alice.address,
				polkadotSigner: aliceSigner,
			},
			{
				ss58: bob.address,
				polkadotSigner: bobSigner,
			},
		);
		console.log(`  [OK] addMedic(${aliceH160}) dispatched.`);
	} catch (e) {
		console.log(`  [WARN] addMedic failed (may already be verified): ${(e as Error).message}`);
	}

	client.destroy();
	console.log("\nDemo bootstrap complete. Alice will show ✓ Verified medic in the UI.");
}

main().catch((err) => {
	console.error("\nFatal error during demo bootstrap:", err);
	process.exit(1);
});
