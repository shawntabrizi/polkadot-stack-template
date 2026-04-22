/**
 * One-off dev script: fund the multisig SS58 from Alice so it can pay
 * asMulti inner-call fees. Reads the multisig address from deployments.json.
 */

import { createClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws-provider/node";
import { withPolkadotSdkCompat } from "polkadot-api/polkadot-sdk-compat";
import { getPolkadotSigner } from "polkadot-api/signer";
import { cryptoWaitReady } from "@polkadot/util-crypto";
import { Keyring } from "@polkadot/keyring";
import { readDeployments } from "./_deployments";
import { submitExtrinsic } from "./_papi";

const WS_URL = process.env.SUBSTRATE_RPC_WS ?? "ws://127.0.0.1:10044";
const DEV_MNEMONIC = "bottom drive obey lake curtain smoke basket hold race lonely fit walk";
const AMOUNT_PLANCK = 10_000_000_000_000n; // 10 UNIT (assuming 12 decimals)

async function main() {
	await cryptoWaitReady();
	const deployments = readDeployments();
	if (!deployments.multisig) throw new Error("run set-deployments.ts first");

	const multisigSs58 = deployments.multisig.ss58;
	const keyring = new Keyring({ type: "sr25519", ss58Format: 42 });
	const alice = keyring.addFromUri(DEV_MNEMONIC + "//Alice");
	const aliceSigner = getPolkadotSigner(alice.publicKey, "Sr25519", (msg) => alice.sign(msg));

	const client = createClient(withPolkadotSdkCompat(getWsProvider(WS_URL)));
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const api: any = client.getUnsafeApi();

	const tx = api.tx.Balances.transfer_keep_alive({
		dest: { type: "Id", value: multisigSs58 },
		value: AMOUNT_PLANCK,
	});

	console.log(`Funding multisig ${multisigSs58} with ${AMOUNT_PLANCK} planck from Alice...`);
	const result = await submitExtrinsic(tx, aliceSigner);
	console.log(`[OK] Funded. Tx: ${result.txHash} in block #${result.blockNumber}`);

	client.destroy();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
