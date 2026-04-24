import { ss58Encode } from "@polkadot-apps/address";
import { createDevSigner, getDevPublicKey, type DevAccountName } from "@polkadot-apps/tx";
import type { PolkadotSigner } from "polkadot-api";

const DEV_NAMES: DevAccountName[] = ["Alice", "Bob", "Charlie"];

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
 * Returns publicKey and a sign function for use outside of PAPI transactions
 * (e.g., signing Statement Store statements).
 */
export function getDevKeypair(index: number): {
	publicKey: Uint8Array;
	sign: (message: Uint8Array) => Promise<Uint8Array>;
} {
	const signer = devAccounts[index].signer;
	return {
		publicKey: signer.publicKey,
		sign: (message) => signer.signBytes(message),
	};
}
