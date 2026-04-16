import { useState, useEffect } from "react";
import { createPappAdapter, type UserSession, type PairingStatus } from "@novasamatech/host-papp";
import { createLocalStorageAdapter } from "@novasamatech/storage-adapter";
import { ss58Address } from "@polkadot-labs/hdkd-helpers";
import type { PolkadotSigner } from "polkadot-api";
import type { SigningPayloadRequest } from "@novasamatech/host-papp";
import { substrateToH160, type AppAccount } from "./useAccount";

// Singleton — one adapter per browser session.
// Uses host-papp's built-in Paseo Statement Store endpoints so the phone
// can reach the pairing handshake topic from anywhere.
let adapter: ReturnType<typeof createPappAdapter> | null = null;

export function getPappAdapter() {
	if (!adapter) {
		adapter = createPappAdapter({
			// MUST be stable across deploys — changing this invalidates existing sessions.
			appId: "polkadot-medical-marketplace",
			// Nova Wallet fetches name + icon from this URL during the pairing UI.
			metadata: `${window.location.origin}/nova-metadata.json`,
			adapters: {
				// Persist sessions across page reloads.
				// Statement store and lazyClient use host-papp defaults (Paseo) so the
				// phone can reach the handshake topic without a local node.
				storage: createLocalStorageAdapter("pmp:"),
			},
		});
	}
	return adapter;
}

/** React hook — subscribes to the SSO pairing state machine. */
export function usePairingStatus(): PairingStatus {
	const [status, setStatus] = useState<PairingStatus>(() =>
		getPappAdapter().sso.pairingStatus.read(),
	);

	useEffect(() => {
		return getPappAdapter().sso.pairingStatus.subscribe(setStatus);
	}, []);

	return status;
}

/** Build an AppAccount from a live UserSession after pairing completes. */
export function getAppAccountFromSession(session: UserSession): AppAccount {
	// remoteAccount.accountId is the 32-byte AccountId32 (sr25519 public key).
	const accountId = session.remoteAccount.accountId as unknown as Uint8Array;
	const address = ss58Address(accountId);
	return {
		name: "Nova Wallet",
		address,
		evmAddress: substrateToH160(accountId),
		signer: createHostPappSigner(session, address, accountId),
	};
}

/**
 * Wrap a live `UserSession` into the PAPI `PolkadotSigner` interface.
 *
 * `signTx`: decodes PAPI's binary signed-extension params back into the
 * polkadot.js `SignerPayloadJSON` format that Nova Wallet expects, then
 * requests `withSignedTransaction: true` so Nova Wallet returns the fully
 * assembled signed extrinsic — which is exactly what PAPI's `signTx` must
 * return.
 *
 * `signBytes`: used by the Statement Store upload (sr25519 raw signing).
 */
function createHostPappSigner(
	session: UserSession,
	ss58Addr: string,
	publicKey: Uint8Array,
): PolkadotSigner {
	// Inline SCALE decoders — avoids a SCALE dep just for three simple types.
	function readCompact(bytes: Uint8Array): bigint {
		if (!bytes.length) return 0n;
		const b0 = bytes[0];
		const mode = b0 & 0b11;
		if (mode === 0) return BigInt(b0 >>> 2);
		if (mode === 1) return BigInt(((b0 >>> 2) | ((bytes[1] ?? 0) << 6)) >>> 0);
		if (mode === 2) {
			const v =
				((b0 >>> 2) |
					((bytes[1] ?? 0) << 6) |
					((bytes[2] ?? 0) << 14) |
					((bytes[3] ?? 0) << 22)) >>>
				0;
			return BigInt(v);
		}
		// Big-int mode: next (b0 >>> 2) + 4 bytes, little-endian
		const len = (b0 >>> 2) + 4;
		let val = 0n;
		for (let i = 0; i < len; i++) val |= BigInt(bytes[i + 1] ?? 0) << BigInt(8 * i);
		return val;
	}

	function readU32LE(bytes: Uint8Array): number {
		if (bytes.length < 4) return 0;
		return (bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24)) >>> 0;
	}

	function toHex(bytes: Uint8Array): `0x${string}` {
		return `0x${Array.from(bytes)
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("")}` as `0x${string}`;
	}

	return {
		publicKey,

		signTx: async (callData, signedExtensions, _metadata, atBlockNumber) => {
			const ext = signedExtensions;

			// Extract values from PAPI's binary signed extensions.
			const nonce = readCompact(ext["CheckNonce"]?.value ?? new Uint8Array());
			const era = toHex(ext["CheckMortality"]?.value ?? new Uint8Array([0]));
			const tip = readCompact(
				(ext["ChargeTransactionPayment"] ?? ext["ChargeAssetTxPayment"])?.value ??
					new Uint8Array(),
			);
			const specV = readU32LE(ext["CheckSpecVersion"]?.additionalSigned ?? new Uint8Array(4));
			const txV = readU32LE(ext["CheckTxVersion"]?.additionalSigned ?? new Uint8Array(4));
			const genesis = toHex(ext["CheckGenesis"]?.additionalSigned ?? new Uint8Array(32));
			// For mortal era: block hash is CheckMortality.additionalSigned.
			// For immortal era: fall back to genesis hash.
			const blockH = toHex(
				ext["CheckMortality"]?.additionalSigned ??
					ext["CheckGenesis"]?.additionalSigned ??
					new Uint8Array(32),
			);

			const payload: SigningPayloadRequest = {
				address: ss58Addr,
				method: toHex(callData),
				blockHash: blockH,
				blockNumber: `0x${atBlockNumber.toString(16)}`,
				era,
				genesisHash: genesis,
				nonce: `0x${nonce.toString(16)}`,
				specVersion: `0x${specV.toString(16)}`,
				transactionVersion: `0x${txV.toString(16)}`,
				tip: `0x${tip.toString(16)}`,
				// Identifier names match what Nova Wallet will validate.
				signedExtensions: Object.values(signedExtensions).map((e) => e.identifier),
				version: 4,
				// Ask Nova Wallet to return the fully assembled signed extrinsic.
				withSignedTransaction: true,
				assetId: undefined,
				metadataHash: undefined,
				mode: undefined,
			};

			const result = await session.signPayload(payload);
			if (result.isErr()) throw new Error(`Nova Wallet signing failed: ${result.error}`);
			const { signedTransaction } = result.value;
			if (!signedTransaction) {
				throw new Error(
					"Nova Wallet did not return a signed transaction. Update Nova Wallet to a newer version.",
				);
			}
			return signedTransaction;
		},

		signBytes: async (data) => {
			// Used by the Statement Store upload (raw sr25519 signature).
			const result = await session.signRaw({
				address: ss58Addr,
				data: { tag: "Bytes", value: data },
			});
			if (result.isErr()) throw new Error(`Nova Wallet signing failed: ${result.error}`);
			return result.value.signature;
		},
	};
}
