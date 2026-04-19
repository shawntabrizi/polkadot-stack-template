import { createKeyMulti, encodeAddress, cryptoWaitReady } from "@polkadot/util-crypto";
import { u8aToHex } from "@polkadot/util";
import { Keyring } from "@polkadot/keyring";
import { keccak256 } from "viem";
import { updateDeployments } from "./_deployments";

const DEV_MNEMONIC = "bottom drive obey lake curtain smoke basket hold race lonely fit walk";
const THRESHOLD = parseInt(process.env.THRESHOLD ?? "2", 10);
const SS58_PREFIX = parseInt(process.env.SS58_PREFIX ?? "42", 10);

async function main() {
	await cryptoWaitReady();

	// Derive canonical dev addresses from the well-known dev mnemonic so we can't
	// mistype them. Env vars SIG_1 / SIG_2 / SIG_3 override if custom signatories
	// are needed (e.g. for testnet deploys).
	const keyring = new Keyring({ type: "sr25519", ss58Format: SS58_PREFIX });
	const defaults = ["//Alice", "//Bob", "//Charlie"].map(
		(path) => keyring.addFromUri(DEV_MNEMONIC + path).address,
	);

	const signatories = [
		process.env.SIG_1 ?? defaults[0],
		process.env.SIG_2 ?? defaults[1],
		process.env.SIG_3 ?? defaults[2],
	].sort();

	const multiAccountId = createKeyMulti(signatories, THRESHOLD);
	const multiSs58 = encodeAddress(multiAccountId, SS58_PREFIX);

	// Derive H160: keccak256 of the raw 32-byte AccountId, take last 20 bytes.
	// Matches pallet-revive's msg.sender derivation (commit 7ebed6e).
	const hash = keccak256(u8aToHex(multiAccountId) as `0x${string}`);
	const h160 = ("0x" + hash.slice(2 + 24)) as `0x${string}`;

	updateDeployments({
		multisig: { ss58: multiSs58, h160, threshold: THRESHOLD, signatories },
	});

	console.log("Multisig address computed and written to deployments.json");
	console.log("");
	console.log(`  SS58 (prefix ${SS58_PREFIX}): ${multiSs58}`);
	console.log(`  H160 (msg.sender):            ${h160}`);
	console.log(`  Threshold:                    ${THRESHOLD}-of-${signatories.length}`);
	console.log(`  Signatories (sorted):`);
	for (const s of signatories) {
		console.log(`    - ${s}`);
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
