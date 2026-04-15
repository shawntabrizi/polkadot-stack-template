const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "192.168.50.65"]);

export const LOCAL_WS_URL = import.meta.env.VITE_LOCAL_WS_URL || "ws://localhost:9944";
export const LOCAL_ETH_RPC_URL = import.meta.env.VITE_LOCAL_ETH_RPC_URL || "http://localhost:8545";

export const TESTNET_WS_URL = "wss://asset-hub-paseo.dotters.network";
export const TESTNET_ETH_RPC_URL = "https://services.polkadothub-rpc.com/testnet";

export type NetworkPreset = "local" | "testnet";

function isLocalHost() {
	if (typeof window === "undefined") {
		return true;
	}

	return LOCAL_HOSTS.has(window.location.hostname);
}

export function getDefaultWsUrl() {
	return import.meta.env.VITE_WS_URL || (isLocalHost() ? LOCAL_WS_URL : TESTNET_WS_URL);
}

export function getDefaultEthRpcUrl() {
	return (
		import.meta.env.VITE_ETH_RPC_URL ||
		(isLocalHost() ? LOCAL_ETH_RPC_URL : TESTNET_ETH_RPC_URL)
	);
}

export function getNetworkPresetEndpoints(preset: NetworkPreset) {
	return preset === "local"
		? {
				wsUrl: LOCAL_WS_URL,
				ethRpcUrl: LOCAL_ETH_RPC_URL,
			}
		: {
				wsUrl: TESTNET_WS_URL,
				ethRpcUrl: TESTNET_ETH_RPC_URL,
			};
}

function getStoredUrl(storageKey: string, defaultKey: string, defaultValue: string) {
	const storedValue = localStorage.getItem(storageKey);
	const previousDefault = localStorage.getItem(defaultKey);
	localStorage.setItem(defaultKey, defaultValue);

	if (!storedValue || storedValue === previousDefault) {
		return defaultValue;
	}

	return storedValue;
}

export function getStoredWsUrl() {
	return getStoredUrl("ws-url", "default-ws-url", getDefaultWsUrl());
}

export function getStoredEthRpcUrl() {
	return getStoredUrl("eth-rpc-url", "default-eth-rpc-url", getDefaultEthRpcUrl());
}
