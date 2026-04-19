/**
 * CLI demo: dispatch MedicAuthority.addMedic() via pallet-multisig asMulti.
 *
 * Usage (run from contracts/pvm/):
 *   npx ts-node scripts/multisig-add-medic.ts --medic <h160> --signer-index <0|1|2>
 *
 * Requirements:
 *   - Local node running at ws://127.0.0.1:9944 with pallet-multisig enabled.
 *   - deployments.json populated by compute-multisig.ts + deploy-medic-authority.ts.
 *   - Multisig SS58 account funded (needs native token for inner-call + deposit fees).
 *
 * Two-step flow (2-of-3 threshold):
 *   First signer  (--signer-index 0)
 *     → Submits asMulti with maybe_timepoint = None.
 *     → Writes { medic, callHash, timepoint } to .multisig-pending.json.
 *   Second signer (--signer-index 1)
 *     → Reads .multisig-pending.json; submits asMulti with maybe_timepoint = Some(timepoint).
 *     → Threshold reached → inner Revive.call fires → MedicAdded event emits.
 *     → Deletes .multisig-pending.json.
 */

import * as fs from "fs";
import * as path from "path";
import { createClient, Binary, FixedSizeBinary } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws-provider/node";
import { withPolkadotSdkCompat } from "polkadot-api/polkadot-sdk-compat";
import { getPolkadotSigner } from "polkadot-api/signer";
import { encodeAddress, cryptoWaitReady, blake2AsHex } from "@polkadot/util-crypto";
import { Keyring } from "@polkadot/keyring";
import { encodeFunctionData } from "viem";
import { stack_template } from "@polkadot-api/descriptors";
import { readDeployments } from "./_deployments";
import { submitExtrinsic } from "./_papi";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WS_URL = process.env.SUBSTRATE_RPC_WS ?? "ws://127.0.0.1:10044";
const SS58_PREFIX = 42; // Generic Substrate prefix used by the local stack_template chain.

// Pending state file — written by signer 0, consumed by signer 1.
// Lives at the worktree root (three levels up from contracts/pvm/scripts/).
const PENDING_FILE = path.resolve(__dirname, "../../../.multisig-pending.json");

// Well-known public Substrate dev mnemonic (NEVER use for real funds).
const DEV_MNEMONIC = "bottom drive obey lake curtain smoke basket hold race lonely fit walk";

// Derivation paths matching web/src/hooks/useAccount.ts createDevAccount() paths.
const DEV_PATHS = ["//Alice", "//Bob", "//Charlie"] as const;
const DEV_NAMES = ["Alice", "Bob", "Charlie"] as const;

// Minimal inline ABI for MedicAuthority.addMedic — avoids importing from contracts artifacts.
const medicAuthorityAbi = [
	{
		type: "function",
		name: "addMedic",
		inputs: [{ name: "medic", type: "address" }],
		outputs: [],
		stateMutability: "nonpayable",
	},
] as const;

// Weight passed to Multisig.as_multi as max_weight for the inner call.
// Must be >= the inner call's estimated weight (Revive.call + contract exec overhead).
// pallet-multisig rejects with MaxWeightTooLow if too small.
const MAX_WEIGHT = {
	ref_time: 30_000_000_000n,
	proof_size: 2_000_000n,
};

// Forwarded to the inner Revive.call (same as web/src/pages/ResearcherBuy.tsx CALL_WEIGHT).
const REVIVE_CALL_WEIGHT = { ref_time: 3_000_000_000n, proof_size: 1_048_576n };

// Maximum storage deposit we allow pallet-revive to charge for this call.
const MAX_STORAGE_DEPOSIT = 100_000_000_000_000n; // 100 tokens in planck

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PendingState {
	medic: string;
	callHash: string;
	timepoint: { height: number; index: number };
	initiatorIndex: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseArgs(): { medic: `0x${string}`; signerIndex: 0 | 1 | 2 } {
	const args = process.argv.slice(2);
	let medic: string | undefined;
	let signerIndexRaw: string | undefined;

	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--medic" && args[i + 1]) medic = args[++i];
		else if (args[i] === "--signer-index" && args[i + 1]) signerIndexRaw = args[++i];
	}

	if (!medic) {
		console.error("Error: --medic <h160> is required");
		process.exit(1);
	}
	if (!/^0x[0-9a-fA-F]{40}$/.test(medic)) {
		console.error(`Error: --medic must be 0x-prefixed 40-char hex, got: ${medic}`);
		process.exit(1);
	}
	if (signerIndexRaw === undefined) {
		console.error("Error: --signer-index <0|1|2> is required");
		process.exit(1);
	}
	const idx = parseInt(signerIndexRaw, 10);
	if (![0, 1, 2].includes(idx)) {
		console.error(`Error: --signer-index must be 0, 1, or 2; got: ${signerIndexRaw}`);
		process.exit(1);
	}

	return { medic: medic as `0x${string}`, signerIndex: idx as 0 | 1 | 2 };
}

function hexToBytes(hex: string): Uint8Array {
	const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
	const out = new Uint8Array(clean.length / 2);
	for (let i = 0; i < out.length; i++) {
		out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
	}
	return out;
}

/**
 * Derive a dev account keypair from the well-known dev mnemonic + a path like "//Alice".
 */
function deriveDevKeypair(derivePath: string) {
	const keyring = new Keyring({ type: "sr25519", ss58Format: SS58_PREFIX });
	return keyring.addFromUri(DEV_MNEMONIC + derivePath);
}

function readPending(): PendingState | null {
	try {
		return JSON.parse(fs.readFileSync(PENDING_FILE, "utf-8")) as PendingState;
	} catch {
		return null;
	}
}

function writePending(state: PendingState): void {
	fs.writeFileSync(PENDING_FILE, JSON.stringify(state, null, 2) + "\n");
}

function deletePending(): void {
	try {
		fs.unlinkSync(PENDING_FILE);
	} catch {
		// File already gone — no-op.
	}
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
	const { medic, signerIndex } = parseArgs();

	// Initialise sr25519 WASM (required before any @polkadot/util-crypto sr25519 call).
	await cryptoWaitReady();

	// Load deployments.
	const deployments = readDeployments();
	if (!deployments.multisig) {
		console.error(
			"Error: deployments.json is missing 'multisig'.\n  Run: npx ts-node scripts/compute-multisig.ts",
		);
		process.exit(1);
	}
	if (!deployments.medicAuthority) {
		console.error(
			"Error: deployments.json is missing 'medicAuthority'.\n  Run: npx hardhat run scripts/deploy-medic-authority.ts --network localhost",
		);
		process.exit(1);
	}

	const { multisig, medicAuthority } = deployments;
	const { threshold, signatories } = multisig;

	// Derive the signer keypair.
	const signerPath = DEV_PATHS[signerIndex];
	const signerName = DEV_NAMES[signerIndex];
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const keypair = deriveDevKeypair(signerPath) as any;
	const signerSs58 = encodeAddress(keypair.publicKey, SS58_PREFIX);
	const signer = getPolkadotSigner(keypair.publicKey, "Sr25519", (msg) => keypair.sign(msg));

	console.log(`\nSigner:         ${signerName} (index ${signerIndex})`);
	console.log(`  SS58:         ${signerSs58}`);
	console.log(`Medic to add:   ${medic}`);
	console.log(`MedicAuthority: ${medicAuthority}`);
	console.log(`Multisig SS58:  ${multisig.ss58}`);
	console.log(`Threshold:      ${threshold}-of-${signatories.length}`);

	// Build otherSignatories: full sorted list minus current signer.
	// pallet-multisig requires signatories to be sorted and to exclude the sender.
	const sortedSignatories = [...signatories].sort();
	const otherSignatories = sortedSignatories.filter((s) => s !== signerSs58);

	if (otherSignatories.length === signatories.length) {
		console.error(
			`\nError: signer ${signerName} SS58 (${signerSs58}) is not in the multisig signatories:`,
			signatories,
		);
		console.error(
			"Hint: check that --signer-index matches the accounts used in compute-multisig.ts.",
		);
		process.exit(1);
	}

	// Connect to local node.
	const client = createClient(withPolkadotSdkCompat(getWsProvider(WS_URL)));

	const api = client.getTypedApi(stack_template);

	// Encode the inner Revive.call calldata: MedicAuthority.addMedic(medic).
	const calldata = encodeFunctionData({
		abi: medicAuthorityAbi,
		functionName: "addMedic",
		args: [medic],
	});

	// Build the inner call: Revive.call targeting MedicAuthority.
	// This is what pallet-multisig will dispatch when the threshold is reached.
	const innerCall = api.tx.Revive.call({
		dest: new FixedSizeBinary(hexToBytes(medicAuthority)) as FixedSizeBinary<20>,
		value: 0n,
		weight_limit: REVIVE_CALL_WEIGHT,
		storage_deposit_limit: MAX_STORAGE_DEPOSIT,
		data: Binary.fromHex(calldata as `0x${string}`),
	});

	// Compute the call hash (blake2-256 of the SCALE-encoded inner call).
	// pallet-multisig stores and emits this hash for off-chain coordination.
	const encodedCallData = await innerCall.getEncodedData();
	// blake2AsHex(data, bitLength) — 256 bits = 32-byte hash, returned as 0x-prefixed hex.
	const callHash = blake2AsHex(encodedCallData.asBytes(), 256);

	// Check for pending state from a previous first-signer run.
	const pending = readPending();
	const hasPendingForThisMedic =
		pending !== null && pending.medic.toLowerCase() === medic.toLowerCase();

	if (!hasPendingForThisMedic) {
		// -------------------------------------------------------------------------
		// FIRST SIGNER PATH
		// Submit asMulti with maybe_timepoint = None (no existing timepoint).
		// -------------------------------------------------------------------------
		console.log("\n--- First signer path (initiating) ---");

		// UNCERTAINTY: The exact SCALE encoding for pallet-multisig's `maybe_timepoint: None`
		// vs `Some(timepoint)` depends on the descriptor type once Multisig is added to the
		// chain metadata. With UnsafeApi, PAPI accepts plain JS values:
		//   None → undefined (or omit the field)
		//   Some(x) → the value directly (PAPI's Enum handling wraps it automatically).
		// Review this after running `npx papi update` with the updated descriptor.
		const multisigTx = api.tx.Multisig.as_multi({
			threshold,
			other_signatories: otherSignatories,
			maybe_timepoint: undefined, // None — this is the first approval
			call: innerCall.decodedCall,
			max_weight: MAX_WEIGHT,
		});

		let result;
		try {
			result = await submitExtrinsic(multisigTx, signer);
		} catch (err) {
			console.error("\nTransaction failed:", err);
			client.destroy();
			process.exit(1);
		}

		// Timepoint = { height: blockNumber, index: extrinsicIndexInBlock }.
		// pallet-multisig uses this to locate the original approval on-chain.
		const timepoint = { height: result.blockNumber, index: result.blockIndex };

		const newPending: PendingState = {
			medic,
			callHash,
			timepoint,
			initiatorIndex: signerIndex,
		};
		writePending(newPending);

		console.log(`\n[OK] First approval submitted.`);
		console.log(`  TxHash:    ${result.txHash}`);
		console.log(`  Block:     #${result.blockNumber} (${result.blockHash})`);
		console.log(`  CallHash:  ${callHash}`);
		console.log(`  Timepoint: { height: ${timepoint.height}, index: ${timepoint.index} }`);
		console.log(`  Pending state written → .multisig-pending.json`);

		const nextIdx = signerIndex === 0 ? 1 : 0;
		console.log(`\nNext: run with a different --signer-index to provide the second approval.`);
		console.log(
			`  npx ts-node scripts/multisig-add-medic.ts --medic ${medic} --signer-index ${nextIdx}`,
		);
	} else {
		// -------------------------------------------------------------------------
		// SECOND SIGNER PATH
		// Submit asMulti with maybe_timepoint = Some(pending.timepoint).
		// Reaching the threshold causes pallet-multisig to dispatch the inner call.
		// -------------------------------------------------------------------------
		console.log("\n--- Second signer path (finalizing) ---");
		console.log(`  Loaded pending state for medic ${pending!.medic}`);
		console.log(`  CallHash:  ${pending!.callHash}`);
		console.log(
			`  Timepoint: { height: ${pending!.timepoint.height}, index: ${pending!.timepoint.index} }`,
		);

		// Sanity-check: warn if the computed call hash differs from the stored one.
		if (callHash !== pending!.callHash) {
			console.warn(
				`\nWARNING: computed callHash (${callHash}) differs from stored (${pending!.callHash}).`,
			);
			console.warn(
				"  This may indicate the inner call parameters changed. Proceeding anyway.",
			);
		}

		const multisigTx = api.tx.Multisig.as_multi({
			threshold,
			other_signatories: otherSignatories,
			maybe_timepoint: pending!.timepoint, // Some(timepoint) — triggers dispatch at threshold
			call: innerCall.decodedCall,
			max_weight: MAX_WEIGHT,
		});

		let result;
		try {
			result = await submitExtrinsic(multisigTx, signer);
		} catch (err) {
			console.error("\nTransaction failed:", err);
			console.error(
				"Hint: if you see 'AlreadyApproved', this signer already approved. Use a different index.",
			);
			console.error(
				"Hint: if you see 'NoTimepoint', the timepoint in .multisig-pending.json may be wrong.",
			);
			client.destroy();
			process.exit(1);
		}

		// Threshold reached and inner call dispatched — clean up pending state.
		deletePending();

		console.log(`\n[OK] Multisig threshold reached — inner call dispatched.`);
		console.log(`  TxHash: ${result.txHash}`);
		console.log(`  Block:  #${result.blockNumber} (${result.blockHash})`);
		console.log(`\n  MedicAuthority.addMedic(${medic}) fired on-chain.`);
		console.log(`  MedicAdded event should appear in the block events.`);
		console.log(`\nVerify:`);
		console.log(
			`  cast call ${medicAuthority} "isVerifiedMedic(address)(bool)" ${medic} --rpc-url http://127.0.0.1:8545`,
		);
		console.log(`\nPending state file deleted.`);
	}

	client.destroy();
}

main().catch((err) => {
	console.error("\nFatal error:", err);
	process.exit(1);
});
