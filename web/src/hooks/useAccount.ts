import { ss58Encode } from "@polkadot-apps/address";
import { createDevSigner, getDevPublicKey, type DevAccountName } from "@polkadot-apps/tx";
import { sr25519CreateDerive } from "@polkadot-labs/hdkd";
import { DEV_PHRASE, entropyToMiniSecret, mnemonicToEntropy } from "@polkadot-labs/hdkd-helpers";
import type { PolkadotSigner } from "polkadot-api";

const DEV_NAMES: DevAccountName[] = ["Alice", "Bob", "Charlie"];

// Raw sr25519 derivation — used for protocol-level signing (e.g. Statement
// Store) where we must sign raw SCALE bytes directly. PAPI's PolkadotSigner
// wraps payloads with <Bytes>...</Bytes> markers inside signBytes, which is
// correct for dapp message signing but breaks on-chain signature verification
// for raw protocol payloads. Dev accounts for PAPI transactions still use
// createDevSigner below.
const rawDerive = sr25519CreateDerive(entropyToMiniSecret(mnemonicToEntropy(DEV_PHRASE)));

export type DevAccount = {
	name: string;
	address: string;
	signer: PolkadotSigner;
};

export const devAccounts: DevAccount[] = DEV_NAMES.map((name) => ({
	name,
	address: ss58Encode(getDevPublicKey(name)),
	signer: createDevSigner(name),
}));

/**
 * Get the raw sr25519 keypair for a dev account by index.
 * Returns publicKey and a raw sign function (no <Bytes>...</Bytes> wrapping),
 * for protocol-level uses like Statement Store signature proofs.
 */
export function getDevKeypair(index: number): {
	publicKey: Uint8Array;
	sign: (message: Uint8Array) => Uint8Array;
} {
	const kp = rawDerive(`//${DEV_NAMES[index]}`);
	return { publicKey: kp.publicKey, sign: kp.sign };
}
