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
		// When embedded in Nova Wallet, requests are proxied through the Host for Asset Hub.
		// Outside Nova Wallet (local dev / browser), the fallback WS provider is used.
		const provider = createPapiProvider(WellKnownChain.polkadotAssetHub, getWsProvider(url));
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
