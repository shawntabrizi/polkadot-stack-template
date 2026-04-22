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
import {
	cryptoWaitReady,
	blake2AsHex,
	mnemonicToMiniSecret,
	sr25519PairFromSeed,
	keyExtractSuri,
	keyFromPath,
	sr25519Sign,
	encodeAddress,
} from "@polkadot/util-crypto";
import { u8aToHex } from "@polkadot/util";
import { createPublicClient, http, keccak256, encodeFunctionData } from "viem";
import { stack_template } from "@polkadot-api/descriptors";
import { readDeployments } from "./_deployments";
import { submitExtrinsic } from "./_papi";

const WS_URL = process.env.SUBSTRATE_RPC_WS ?? "ws://127.0.0.1:9944";
const ETH_RPC_URL = process.env.ETH_RPC_HTTP ?? "http://127.0.0.1:8545";
const DEV_MNEMONIC = "bottom drive obey lake curtain smoke basket hold race lonely fit walk";
const SS58_PREFIX = 42;
const FUND_AMOUNT_PLANCK = 10_000_000_000_000n; // 10 UNIT
const REVIVE_CALL_WEIGHT = { ref_time: 3_000_000_000n, proof_size: 1_048_576n };
const MAX_STORAGE_DEPOSIT = 100_000_000_000_000n;
const AS_MULTI_WEIGHT = { ref_time: 30_000_000_000n, proof_size: 2_000_000n };
const INTER_TX_DELAY_MS = 2_000; // Breathe between back-to-back signAndSubmit calls

const isVerifiedMedicAbi = [
	{
		type: "function",
		name: "isVerifiedMedic",
		inputs: [{ name: "", type: "address" }],
		outputs: [{ name: "", type: "bool" }],
		stateMutability: "view",
	},
] as const;

const medicAuthorityAbi = [
	{
		type: "function",
		name: "addMedic",
		inputs: [{ name: "medic", type: "address" }],
		outputs: [],
		stateMutability: "nonpayable",
	},
] as const;

interface DevKeypair {
	publicKey: Uint8Array;
	address: string;
	sign: (msg: Uint8Array) => Uint8Array;
}

/**
 * Derive an sr25519 dev keypair using the top-level @polkadot/util-crypto whose WASM
 * module is guaranteed initialized by our `cryptoWaitReady()` call. Avoids
 * @polkadot/keyring, which at v14.0.3 pulls its own nested @polkadot/util-crypto@14
 * whose WASM never gets initialized in our setup → sign() returns cryptographically
 * invalid 64-byte output and the node rejects with Invalid(BadProof).
 */
function deriveSr25519(path: string): DevKeypair {
	const miniSecret = mnemonicToMiniSecret(DEV_MNEMONIC);
	const seed = sr25519PairFromSeed(miniSecret);
	const { path: junctions } = keyExtractSuri(DEV_MNEMONIC + path);
	const pair = keyFromPath(seed, junctions, "sr25519");
	return {
		publicKey: pair.publicKey,
		address: encodeAddress(pair.publicKey, SS58_PREFIX),
		sign: (msg) => sr25519Sign(msg, pair),
	};
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function dispatchViaAsMulti(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	api: any,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	innerCall: any,
	threshold: number,
	multisigSs58: string,
	sortedSignatories: string[],
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	firstSigner: { ss58: string; polkadotSigner: any },
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	secondSigner: { ss58: string; polkadotSigner: any },
) {
	// Compute call hash — used to look up any existing pending multisig entry so we can
	// resume from the second-signer step instead of re-submitting the first approval
	// (which would fail with Multisig.NoTimepoint on an already-underway operation).
	const encoded = await innerCall.getEncodedData();
	const callHashHex = blake2AsHex(encoded.asBytes(), 256);
	const callHashBytes = FixedSizeBinary.fromHex(
		callHashHex as `0x${string}`,
	) as FixedSizeBinary<32>;

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let existing: any = undefined;
	try {
		existing = await api.query.Multisig.Multisigs.getValue(multisigSs58, callHashBytes);
	} catch {
		// Storage lookup failed — fall through to first-signer submission.
	}

	let timepoint: { height: number; index: number };
	if (existing) {
		console.log(
			`    (resume) pending multisig entry found at timepoint ${JSON.stringify(existing.when)}; skipping first-signer submit`,
		);
		timepoint = existing.when as { height: number; index: number };
	} else {
		const firstOther = sortedSignatories.filter((s) => s !== firstSigner.ss58);
		const firstTx = api.tx.Multisig.as_multi({
			threshold,
			other_signatories: firstOther,
			maybe_timepoint: undefined,
			call: innerCall.decodedCall,
			max_weight: AS_MULTI_WEIGHT,
		});
		// Immortal era: back-to-back signs from the same PAPI client otherwise risk
		// Invalid{BadProof} when the cached best-block drifts between signs. See
		// POLKADOT_INTEGRATION_GOTCHAS.md #12.
		const first = await submitExtrinsic(firstTx, firstSigner.polkadotSigner, {
			mortal: false,
		});
		timepoint = { height: first.blockNumber, index: first.blockIndex };
		console.log(
			`    first approval at block #${first.blockNumber} (tx index ${first.blockIndex})`,
		);
		// Give the chain time to finalize before the second signer picks up state.
		await sleep(INTER_TX_DELAY_MS);
	}

	const secondOther = sortedSignatories.filter((s) => s !== secondSigner.ss58);
	const secondTx = api.tx.Multisig.as_multi({
		threshold,
		other_signatories: secondOther,
		maybe_timepoint: timepoint,
		call: innerCall.decodedCall,
		max_weight: AS_MULTI_WEIGHT,
	});
	const second = await submitExtrinsic(secondTx, secondSigner.polkadotSigner, {
		mortal: false,
	});
	console.log(`    final approval at block #${second.blockNumber} (tx ${second.txHash})`);
}

async function main() {
	await cryptoWaitReady();
	const deployments = readDeployments();
	if (!deployments.multisig)
		throw new Error("deployments.json missing 'multisig' — run set-deployments first");
	if (!deployments.medicAuthority)
		throw new Error(
			"deployments.json missing 'medicAuthority' — run deploy-medic-authority first",
		);

	const { threshold, signatories, ss58: multisigSs58 } = deployments.multisig;
	const sortedSignatories = [...signatories].sort();

	const alice = deriveSr25519("//Alice");
	const bob = deriveSr25519("//Bob");
	const aliceSigner = getPolkadotSigner(alice.publicKey, "Sr25519", (m) => alice.sign(m));
	const bobSigner = getPolkadotSigner(bob.publicKey, "Sr25519", (m) => bob.sign(m));

	const aliceH160 = keccakH160(alice.publicKey);

	// Diagnostic: print both signers' material so we can detect any derivation / signing
	// weirdness that would explain BadProof on back-to-back asMulti submissions.
	console.log("-- Signers (diagnostic) --");
	console.log(`  Alice SS58:      ${alice.address}`);
	console.log(`  Alice publicKey: ${u8aToHex(alice.publicKey)}`);
	console.log(`  Bob SS58:        ${bob.address}`);
	console.log(`  Bob publicKey:   ${u8aToHex(bob.publicKey)}`);
	// Sanity-check by signing a trivial message with each keypair and verifying the
	// sig-pubkey pair is well-formed. If sign() throws or returns wrong length, we'd
	// know the keypair itself is broken.
	try {
		const aliceSig = alice.sign(new Uint8Array([1, 2, 3, 4]));
		const bobSig = bob.sign(new Uint8Array([1, 2, 3, 4]));
		console.log(`  Alice sig len:   ${aliceSig.length} bytes`);
		console.log(`  Bob sig len:     ${bobSig.length} bytes`);
	} catch (e) {
		console.log(`  [WARN] sign probe failed: ${(e as Error).message}`);
	}
	console.log("");

	// Fast path: if Alice is already verified, nothing to do. Lets re-running the script
	// against a fully-bootstrapped node return instantly instead of re-submitting asMulti
	// calls that will hit NoTimepoint / stale-state errors.
	const evmClient = createPublicClient({ transport: http(ETH_RPC_URL) });
	const alreadyVerified = await evmClient
		.readContract({
			address: deployments.medicAuthority as `0x${string}`,
			abi: isVerifiedMedicAbi,
			functionName: "isVerifiedMedic",
			args: [aliceH160],
		})
		.catch(() => false);
	if (alreadyVerified) {
		console.log(`Alice (${aliceH160}) is already a verified medic — nothing to bootstrap.`);
		return;
	}

	const client = createClient(withPolkadotSdkCompat(getWsProvider(WS_URL)));
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const api: any = client.getTypedApi(stack_template);

	console.log("[1/3] Funding multisig from Alice...");
	const fundTx = api.tx.Balances.transfer_keep_alive({
		dest: { type: "Id", value: multisigSs58 },
		value: FUND_AMOUNT_PLANCK,
	});
	try {
		const fundResult = await submitExtrinsic(fundTx, aliceSigner);
		console.log(`  [OK] Funded at block #${fundResult.blockNumber}`);
	} catch (e) {
		console.log(
			`  [WARN] transfer_keep_alive failed (multisig may already be funded): ${(e as Error).message}`,
		);
	}

	console.log("[2/3] Mapping multisig in pallet-revive via asMulti...");
	try {
		await dispatchViaAsMulti(
			api,
			api.tx.Revive.map_account(),
			threshold,
			multisigSs58,
			sortedSignatories,
			{ ss58: alice.address, polkadotSigner: aliceSigner },
			{ ss58: bob.address, polkadotSigner: bobSigner },
		);
		console.log("  [OK] map_account dispatched.");
	} catch (e) {
		console.log(`  [WARN] map_account asMulti failed: ${(e as Error).message}`);
	}

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
			multisigSs58,
			sortedSignatories,
			{ ss58: alice.address, polkadotSigner: aliceSigner },
			{ ss58: bob.address, polkadotSigner: bobSigner },
		);
		console.log(`  [OK] addMedic(${aliceH160}) dispatched.`);
	} catch (e) {
		console.log(`  [WARN] addMedic asMulti failed: ${(e as Error).message}`);
	}

	client.destroy();

	// Final verification: read isVerifiedMedic and report truthfully.
	const verifiedNow = await evmClient
		.readContract({
			address: deployments.medicAuthority as `0x${string}`,
			abi: isVerifiedMedicAbi,
			functionName: "isVerifiedMedic",
			args: [aliceH160],
		})
		.catch(() => false);

	if (verifiedNow) {
		console.log(`\n[OK] Bootstrap complete — Alice (${aliceH160}) is verified on-chain.`);
	} else {
		console.log(`\n[WARN] Alice (${aliceH160}) is NOT verified on-chain after bootstrap.`);
		console.log(
			`       Inner Revive.call likely reverted silently — map_account may not have taken effect.`,
		);
		console.log(`       Re-run: 'cd contracts/pvm && npm run bootstrap-demo-medic:local'`);
		console.log(
			`       If it still fails after a fresh start-all, dig into POLKADOT_INTEGRATION_GOTCHAS.md #6.`,
		);
		// Don't abort start-all — vite is still worth starting even if the badge is off.
	}
}

main().catch((err) => {
	console.error("\nFatal error during demo bootstrap:", err);
	process.exit(1);
});
