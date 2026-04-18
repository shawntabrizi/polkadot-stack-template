import { createClient, type PolkadotClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws-provider/web";
import { withPolkadotSdkCompat } from "polkadot-api/polkadot-sdk-compat";
import { createPapiProvider, WellKnownChain } from "@novasamatech/product-sdk";
import { getDefaultWsUrl } from "../config/network";

let client: PolkadotClient | null = null;
let currentUrl: string | null = null;

export function getClient(wsUrl?: string): PolkadotClient {
	const url = wsUrl || currentUrl || getDefaultWsUrl();
	if (!client || currentUrl !== url) {
		if (client) {
			client.destroy();
		}
		// createPapiProvider routes through Nova Wallet's host when embedded in its webview/iframe.
		// Outside that environment it throws synchronously — fall back to a direct WS connection.
		let provider;
		try {
			provider = createPapiProvider(WellKnownChain.polkadotAssetHub, getWsProvider(url));
		} catch {
			provider = getWsProvider(url);
		}
		client = createClient(withPolkadotSdkCompat(provider));
		currentUrl = url;
	}
	return client;
}

export function disconnectClient() {
	if (client) {
		client.destroy();
		client = null;
		currentUrl = null;
	}
}
