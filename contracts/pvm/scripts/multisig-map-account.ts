/**
 * One-off prep step: dispatch Revive.map_account() via pallet-multisig asMulti,
 * so the multisig account's AccountId↔H160 mapping gets registered in pallet-revive.
 * Without this, Revive.call dispatched via asMulti from the multisig reverts because
 * msg.sender doesn't map cleanly to the expected H160.
 *
 * Usage:
 *   npx ts-node --transpile-only scripts/multisig-map-account.ts --signer-index <0|1|2>
 */

import * as fs from "fs";
import * as path from "path";
import { createClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws-provider/node";
import { withPolkadotSdkCompat } from "polkadot-api/polkadot-sdk-compat";
import { getPolkadotSigner } from "polkadot-api/signer";
import { encodeAddress, cryptoWaitReady, blake2AsHex } from "@polkadot/util-crypto";
import { Keyring } from "@polkadot/keyring";
import { stack_template } from "@polkadot-api/descriptors";
import { readDeployments } from "./_deployments";
import { submitExtrinsic } from "./_papi";

const WS_URL = process.env.SUBSTRATE_RPC_WS ?? "ws://127.0.0.1:10044";
const SS58_PREFIX = 42;
const DEV_MNEMONIC = "bottom drive obey lake curtain smoke basket hold race lonely fit walk";
const DEV_PATHS = ["//Alice", "//Bob", "//Charlie"] as const;
const PENDING_FILE = path.resolve(__dirname, "../../../.multisig-pending-map.json");
const MAX_WEIGHT = { ref_time: 30_000_000_000n, proof_size: 2_000_000n };

function deriveDevKeypair(derivePath: string) {
	const keyring = new Keyring({ type: "sr25519", ss58Format: SS58_PREFIX });
	return keyring.addFromUri(DEV_MNEMONIC + derivePath);
}

async function main() {
	const args = process.argv.slice(2);
	const idxRaw = args[args.indexOf("--signer-index") + 1];
	const signerIndex = parseInt(idxRaw ?? "0", 10);
	if (![0, 1, 2].includes(signerIndex)) {
		console.error("--signer-index must be 0|1|2");
		process.exit(1);
	}

	await cryptoWaitReady();
	const deployments = readDeployments();
	if (!deployments.multisig) throw new Error("run compute-multisig first");
	const { threshold, signatories } = deployments.multisig;

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const keypair = deriveDevKeypair(DEV_PATHS[signerIndex]) as any;
	const signerSs58 = encodeAddress(keypair.publicKey, SS58_PREFIX);
	const signer = getPolkadotSigner(keypair.publicKey, "Sr25519", (msg) => keypair.sign(msg));

	const sortedSigs = [...signatories].sort();
	const otherSignatories = sortedSigs.filter((s) => s !== signerSs58);

	const client = createClient(withPolkadotSdkCompat(getWsProvider(WS_URL)));
	const api = client.getTypedApi(stack_template);

	const innerCall = api.tx.Revive.map_account();
	const encoded = await innerCall.getEncodedData();
	const callHash = blake2AsHex(encoded.asBytes(), 256);

	const existing = fs.existsSync(PENDING_FILE)
		? (JSON.parse(fs.readFileSync(PENDING_FILE, "utf-8")) as {
				callHash: string;
				timepoint: { height: number; index: number };
			})
		: null;

	const multisigTx = api.tx.Multisig.as_multi({
		threshold,
		other_signatories: otherSignatories,
		maybe_timepoint: existing ? existing.timepoint : undefined,
		call: innerCall.decodedCall,
		max_weight: MAX_WEIGHT,
	});

	console.log(`Signer: index=${signerIndex} (${signerSs58})`);
	console.log(`Multisig: ${deployments.multisig.ss58}`);
	console.log(`Call hash: ${callHash}`);
	console.log(`Mode: ${existing ? "second-signer (finalizing)" : "first-signer (initiating)"}`);

	const result = await submitExtrinsic(multisigTx, signer);
	if (!existing) {
		fs.writeFileSync(
			PENDING_FILE,
			JSON.stringify(
				{ callHash, timepoint: { height: result.blockNumber, index: result.blockIndex } },
				null,
				2,
			),
		);
		console.log(
			`[OK] First approval in block #${result.blockNumber}. Timepoint: { height: ${result.blockNumber}, index: ${result.blockIndex} }`,
		);
		console.log(`Next: run with a different --signer-index to finalize.`);
	} else {
		fs.unlinkSync(PENDING_FILE);
		console.log(`[OK] Threshold reached. Revive.map_account dispatched. Tx: ${result.txHash}`);
	}
	client.destroy();
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
