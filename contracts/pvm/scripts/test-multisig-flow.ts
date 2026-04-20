/**
 * Integration test for the MedicAuthority multisig flow.
 *
 * Prerequisites:
 *   - Local node running: `./scripts/start-local.sh` (or the full `./scripts/start-all.sh`)
 *   - MedicAuthority deployed and the 2-of-3 multisig registered as an authority
 *     (start-all.sh does both via deploy-medic-authority + bootstrap-demo-medic).
 *
 * Run:
 *   cd contracts/pvm && npm run test:multisig-flow
 *
 * What it asserts:
 *   1. Fresh address starts NOT verified.
 *   2. Alice proposes addMedic via Multisig.as_multi(None) → pending entry appears in
 *      Multisig.Multisigs storage with depositor=Alice and 1 approval.
 *   3. Bob approves via Multisig.as_multi(Some(timepoint)) → pending entry clears and
 *      isVerifiedMedic becomes true on-chain.
 *   4. Same cycle for removeMedic to validate the inverse direction.
 *
 * On any failure the process exits 1 with a descriptive message.
 */

import { createClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws-provider/node";
import { withPolkadotSdkCompat } from "polkadot-api/polkadot-sdk-compat";
import { getPolkadotSigner, type PolkadotSigner } from "polkadot-api/signer";
import {
	cryptoWaitReady,
	encodeAddress,
	mnemonicToMiniSecret,
	sr25519PairFromSeed,
	keyExtractSuri,
	keyFromPath,
	sr25519Sign,
} from "@polkadot/util-crypto";
import { stack_template } from "@polkadot-api/descriptors";
import { createPublicClient, http } from "viem";
import { readDeployments } from "./_deployments";
import {
	type Api,
	buildReviveInnerTx,
	encodeAuthorityCall,
	getPendingForCall,
	otherSignatoriesFor,
	proposeMultisigAuthorityAction,
	approveMultisigAuthorityAction,
} from "./_lib/medicAuthorityMultisig";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const WS_URL = process.env.SUBSTRATE_RPC_WS ?? "ws://127.0.0.1:9944";
const ETH_RPC_URL = process.env.ETH_RPC_HTTP ?? "http://127.0.0.1:8545";
const SS58_PREFIX = 42;
const DEV_MNEMONIC = "bottom drive obey lake curtain smoke basket hold race lonely fit walk";
/** Settle time between back-to-back signAndSubmit calls — mirrors bootstrap-demo-medic.ts. */
const INTER_TX_DELAY_MS = 2_000;

// Read-only ABI fragment for isVerifiedMedic — used for eth-rpc assertions.
const isVerifiedMedicAbi = [
	{
		type: "function",
		name: "isVerifiedMedic",
		inputs: [{ name: "", type: "address" }],
		outputs: [{ name: "", type: "bool" }],
		stateMutability: "view",
	},
] as const;

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let passed = 0;
let failed = 0;

function assert(cond: unknown, msg: string): asserts cond {
	if (cond) {
		passed++;
		console.log(`  ✓ ${msg}`);
	} else {
		failed++;
		console.error(`  ✗ ${msg}`);
		throw new Error(`Assertion failed: ${msg}`);
	}
}

function assertEq<T>(actual: T, expected: T, msg: string): void {
	if (actual === expected) {
		passed++;
		console.log(`  ✓ ${msg}`);
	} else {
		failed++;
		console.error(`  ✗ ${msg}`);
		console.error(`      expected: ${String(expected)}`);
		console.error(`      actual:   ${String(actual)}`);
		throw new Error(`Assertion failed: ${msg}`);
	}
}

// ---------------------------------------------------------------------------
// Dev keypair derivation (Node-only; kept out of the module under test).
// Mirrors bootstrap-demo-medic.ts:82-93 — uses top-level util-crypto to avoid the
// keyring@14 WASM-init issue that yields BadProof on sr25519Sign.
// ---------------------------------------------------------------------------

interface DevSigner {
	ss58: string;
	signer: PolkadotSigner;
}

function deriveDevSigner(path: string): DevSigner {
	const miniSecret = mnemonicToMiniSecret(DEV_MNEMONIC);
	const seed = sr25519PairFromSeed(miniSecret);
	const { path: junctions } = keyExtractSuri(DEV_MNEMONIC + path);
	const pair = keyFromPath(seed, junctions, "sr25519");
	return {
		ss58: encodeAddress(pair.publicKey, SS58_PREFIX),
		signer: getPolkadotSigner(pair.publicKey, "Sr25519", (msg) => sr25519Sign(msg, pair)),
	};
}

function randomH160(): `0x${string}` {
	const bytes = new Uint8Array(20);
	for (let i = 0; i < 20; i++) bytes[i] = Math.floor(Math.random() * 256);
	let hex = "0x";
	for (const b of bytes) hex += b.toString(16).padStart(2, "0");
	return hex as `0x${string}`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function runCycle(opts: {
	api: Api;
	evmClient: ReturnType<typeof createPublicClient>;
	medicAuthority: `0x${string}`;
	multisigSs58: string;
	signatories: string[];
	threshold: number;
	alice: DevSigner;
	bob: DevSigner;
	method: "addMedic" | "removeMedic";
	target: `0x${string}`;
	expectedAfter: boolean;
}): Promise<void> {
	const {
		api,
		evmClient,
		medicAuthority,
		multisigSs58,
		signatories,
		threshold,
		alice,
		bob,
		method,
		target,
		expectedAfter,
	} = opts;

	console.log(`\n[${method}] ${target}`);

	const calldata = encodeAuthorityCall(method, target);
	const innerCall = buildReviveInnerTx(api, medicAuthority, calldata);
	const aliceOthers = otherSignatoriesFor(signatories, alice.ss58, SS58_PREFIX);
	const bobOthers = otherSignatoriesFor(signatories, bob.ss58, SS58_PREFIX);

	// --- Alice proposes --------------------------------------------------
	const propose = await proposeMultisigAuthorityAction({
		api,
		signer: alice.signer,
		otherSignatoriesSs58: aliceOthers,
		threshold,
		innerCall,
	});
	console.log(
		`    propose: block #${propose.blockNumber} ix ${propose.blockIndex}  callHash ${propose.callHash.slice(0, 14)}…`,
	);

	// Storage reads lag one block; let the chain settle.
	await sleep(INTER_TX_DELAY_MS);

	// --- Pending entry present ------------------------------------------
	const pending = await getPendingForCall(api, multisigSs58, propose.callHash);
	assert(pending !== null, `pending entry exists for ${method}`);
	assertEq(pending!.depositor, alice.ss58, `depositor is Alice`);
	assertEq(pending!.approvals.length, 1, `one approval recorded`);
	assertEq(pending!.approvals[0], alice.ss58, `Alice is the sole approver`);
	assertEq(pending!.when.height, propose.timepoint.height, `timepoint height matches propose`);
	assertEq(pending!.when.index, propose.timepoint.index, `timepoint index matches propose`);

	// --- Bob approves (reaches threshold, dispatches inner call) ---------
	const approve = await approveMultisigAuthorityAction({
		api,
		signer: bob.signer,
		otherSignatoriesSs58: bobOthers,
		threshold,
		innerCall,
		timepoint: propose.timepoint,
	});
	console.log(`    approve: block #${approve.blockNumber}  tx ${approve.txHash}`);

	// Dump events to diagnose silent inner-call reverts. Multisig.MultisigExecuted
	// carries a Result inside — if dispatch failed, the error type shows up here.
	for (const ev of approve.events ?? []) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const e = ev as any;
		const name = `${e?.type ?? "?"}.${e?.value?.type ?? "?"}`;
		if (
			name.includes("Multisig") ||
			name.includes("Revive") ||
			name.includes("Contracts") ||
			name.includes("ExtrinsicFailed")
		) {
			console.log(
				`      event: ${name}`,
				JSON.stringify(e.value, (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
			);
		}
	}

	await sleep(INTER_TX_DELAY_MS);

	// --- Pending cleared after threshold reached -------------------------
	const cleared = await getPendingForCall(api, multisigSs58, propose.callHash);
	assert(cleared === null, `pending entry cleared after ${method} approval`);

	// --- Effect visible via eth-rpc -------------------------------------
	const verified = (await evmClient.readContract({
		address: medicAuthority,
		abi: isVerifiedMedicAbi,
		functionName: "isVerifiedMedic",
		args: [target],
	})) as boolean;
	assertEq(verified, expectedAfter, `isVerifiedMedic(${target.slice(0, 10)}…) after ${method}`);
}

async function main() {
	await cryptoWaitReady();

	console.log("MedicAuthority multisig integration test");
	console.log(`  WS:       ${WS_URL}`);
	console.log(`  Eth RPC:  ${ETH_RPC_URL}`);

	const deployments = readDeployments();
	if (!deployments.multisig) {
		console.error(
			"deployments.json missing 'multisig' — run `npm run compute-multisig` first.",
		);
		process.exit(1);
	}
	if (!deployments.medicAuthority) {
		console.error(
			"deployments.json missing 'medicAuthority' — run `npm run deploy-medic-authority:local` first.",
		);
		process.exit(1);
	}

	const { ss58: multisigSs58, threshold, signatories } = deployments.multisig;
	const medicAuthority = deployments.medicAuthority as `0x${string}`;
	console.log(`  MedicAuthority: ${medicAuthority}`);
	console.log(`  Multisig:       ${multisigSs58} (${threshold}-of-${signatories.length})`);

	const alice = deriveDevSigner("//Alice");
	const bob = deriveDevSigner("//Bob");
	console.log(`  Alice SS58:     ${alice.ss58}`);
	console.log(`  Bob SS58:       ${bob.ss58}`);

	const client = createClient(withPolkadotSdkCompat(getWsProvider(WS_URL)));
	const api = client.getTypedApi(stack_template);
	const evmClient = createPublicClient({ transport: http(ETH_RPC_URL) });

	const freshMedic = randomH160();
	console.log(`  Fresh target:   ${freshMedic}`);

	try {
		// --- Precondition ---
		console.log("\n[precondition]");
		const preVerified = (await evmClient.readContract({
			address: medicAuthority,
			abi: isVerifiedMedicAbi,
			functionName: "isVerifiedMedic",
			args: [freshMedic],
		})) as boolean;
		assertEq(preVerified, false, `freshMedic starts unverified`);

		// --- addMedic cycle ---
		await runCycle({
			api,
			evmClient,
			medicAuthority,
			multisigSs58,
			signatories,
			threshold,
			alice,
			bob,
			method: "addMedic",
			target: freshMedic,
			expectedAfter: true,
		});

		// --- removeMedic cycle (cleanup + inverse check) ---
		await runCycle({
			api,
			evmClient,
			medicAuthority,
			multisigSs58,
			signatories,
			threshold,
			alice,
			bob,
			method: "removeMedic",
			target: freshMedic,
			expectedAfter: false,
		});
		client.destroy();

		console.log(`\nAll ${passed} assertions passed.`);
		process.exit(0);
	} catch (err) {
		console.error(
			`\n${passed} passed, ${failed} failed. Aborted with: ${err instanceof Error ? err.message : String(err)}`,
		);
		process.exit(1);
	}
}

main().catch((err) => {
	console.error("\nFatal:", err);
	process.exit(1);
});
