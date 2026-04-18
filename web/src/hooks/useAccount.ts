import { sr25519CreateDerive } from "@polkadot-labs/hdkd";
import {
	DEV_PHRASE,
	entropyToMiniSecret,
	mnemonicToEntropy,
	ss58Address,
} from "@polkadot-labs/hdkd-helpers";
import { getPolkadotSigner } from "polkadot-api/signer";
import { type PolkadotSigner } from "polkadot-api";
import { connectInjectedExtension, getInjectedExtensions } from "polkadot-api/pjs-signer";
import { injectSpektrExtension, SpektrExtensionName } from "@novasamatech/product-sdk";

// Dev accounts derived from the well-known dev seed phrase
const entropy = mnemonicToEntropy(DEV_PHRASE);
const miniSecret = entropyToMiniSecret(entropy);
const derive = sr25519CreateDerive(miniSecret);

/**
 * Derive the EVM H160 address from a 32-byte Substrate public key.
 * Uses pallet-revive DefaultAddressMapper: H160 = last 20 bytes of AccountId32.
 */
export function substrateToH160(publicKey: Uint8Array): `0x${string}` {
	const last20 = publicKey.slice(12);
	return `0x${Array.from(last20)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("")}` as `0x${string}`;
}

export type LocalSigner = {
	publicKey: Uint8Array;
	signBytes: (data: Uint8Array) => Promise<Uint8Array>;
};

export type AppAccount = {
	name: string;
	/** SS58-encoded Substrate address */
	address: string;
	signer: PolkadotSigner;
	/** H160 address as seen by pallet-revive contracts (DefaultAddressMapper) */
	evmAddress: `0x${string}`;
	/**
	 * Optional override for statement store signing.
	 * Used when the main signer (e.g. Nova Wallet) wraps raw bytes with <Bytes>
	 * prefix, which the substrate statement store doesn't expect.
	 */
	localSigner?: LocalSigner;
};

/** @deprecated Use AppAccount */
export type DevAccount = AppAccount;

function createDevAccount(name: string, path: string): AppAccount {
	const keypair = derive(path);
	return {
		name,
		address: ss58Address(keypair.publicKey),
		signer: getPolkadotSigner(keypair.publicKey, "Sr25519", keypair.sign),
		evmAddress: substrateToH160(keypair.publicKey),
		localSigner: {
			publicKey: keypair.publicKey,
			signBytes: (data: Uint8Array) => Promise.resolve(keypair.sign(data)),
		},
	};
}

export const devAccounts: AppAccount[] = [
	createDevAccount("Alice", "//Alice"),
	createDevAccount("Bob", "//Bob"),
	createDevAccount("Charlie", "//Charlie"),
];

/**
 * Resolve accounts via:
 *   1. Nova Wallet / Spektr (product-sdk) — when running in the Host webview/iframe
 *   2. QR-paired Nova Wallet session (host-papp) — persisted in localStorage
 *   3. Browser extension wallets (Polkadot.js, Talisman, SubWallet)
 *   4. Dev accounts (local only)
 */
export async function getAccountsWithFallback(): Promise<AppAccount[]> {
	// 1. Nova Wallet / Spektr
	try {
		const ready = await injectSpektrExtension();
		if (ready) {
			const ext = await connectInjectedExtension(SpektrExtensionName);
			const accounts = ext.getAccounts();
			if (accounts.length > 0) {
				return accounts.map((acc) => ({
					name: acc.name ?? `${acc.address.slice(0, 6)}…${acc.address.slice(-4)}`,
					address: acc.address,
					signer: acc.polkadotSigner,
					evmAddress: substrateToH160(acc.polkadotSigner.publicKey),
				}));
			}
		}
	} catch {
		// Not in Nova Wallet — fall through
	}

	// 2. QR-paired Nova Wallet session (persisted across reloads)
	try {
		// Dynamic import to avoid initialising the Paseo adapter unless needed.
		const { getPappAdapter, getAppAccountFromSession } = await import("./usePairing");
		const sessions = getPappAdapter().sessions.sessions.read();
		if (sessions.length > 0) {
			return sessions.map((s) => getAppAccountFromSession(s));
		}
	} catch {
		// no paired session — fall through
	}

	// 2. Browser extension wallets
	try {
		const extensions = getInjectedExtensions().filter((n) => n !== SpektrExtensionName);
		if (extensions.length > 0) {
			const ext = await connectInjectedExtension(extensions[0]);
			const accounts = ext.getAccounts();
			if (accounts.length > 0) {
				return accounts.map((acc) => ({
					name: acc.name ?? `${acc.address.slice(0, 6)}…${acc.address.slice(-4)}`,
					address: acc.address,
					signer: acc.polkadotSigner,
					evmAddress: substrateToH160(acc.polkadotSigner.publicKey),
				}));
			}
		}
	} catch {
		// No extension found — fall through
	}

	// 3. Dev accounts
	return devAccounts;
}

const devPaths = ["//Alice", "//Bob", "//Charlie"];

/**
 * Get the raw sr25519 keypair for a dev account by index.
 * @deprecated Prefer using AppAccount.signer for signing.
 */
export function getDevKeypair(index: number): {
	publicKey: Uint8Array;
	sign: (message: Uint8Array) => Uint8Array;
} {
	const keypair = derive(devPaths[index]);
	return { publicKey: keypair.publicKey, sign: keypair.sign };
}
