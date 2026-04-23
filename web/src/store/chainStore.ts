import { create } from "zustand";
import { getStoredEthRpcUrl, getStoredWsUrl } from "../config/network";
import { devAccounts, type AppAccount } from "../hooks/useAccount";

export interface PalletAvailability {
	revive: boolean | null;
}

interface ChainState {
	wsUrl: string;
	ethRpcUrl: string;
	connected: boolean;
	blockNumber: number;
	selectedAccount: number;
	txStatus: string | null;
	pallets: PalletAvailability;
	accounts: AppAccount[];
	selectedAccountIndex: number;
	connectedWallet: string | null;
	setWsUrl: (url: string) => void;
	setEthRpcUrl: (url: string) => void;
	setConnected: (connected: boolean) => void;
	setBlockNumber: (blockNumber: number) => void;
	setSelectedAccount: (index: number) => void;
	setTxStatus: (status: string | null) => void;
	setPallets: (pallets: PalletAvailability) => void;
	setAccounts: (accounts: AppAccount[]) => void;
	setSelectedAccountIndex: (index: number) => void;
	setConnectedWallet: (name: string | null) => void;
}

export const useChainStore = create<ChainState>((set) => ({
	wsUrl: getStoredWsUrl(),
	ethRpcUrl: getStoredEthRpcUrl(),
	connected: false,
	blockNumber: 0,
	selectedAccount: 0,
	txStatus: null,
	pallets: { revive: null },
	accounts: devAccounts,
	selectedAccountIndex: 0,
	connectedWallet: null,
	setWsUrl: (wsUrl) => {
		localStorage.setItem("ws-url", wsUrl);
		set({ wsUrl });
	},
	setEthRpcUrl: (ethRpcUrl) => {
		localStorage.setItem("eth-rpc-url", ethRpcUrl);
		set({ ethRpcUrl });
	},
	setConnected: (connected) => set({ connected }),
	setBlockNumber: (blockNumber) => set({ blockNumber }),
	setSelectedAccount: (index) => set({ selectedAccount: index }),
	setTxStatus: (txStatus) => set({ txStatus }),
	setPallets: (pallets) => set({ pallets }),
	setAccounts: (accounts) => set({ accounts }),
	setSelectedAccountIndex: (index) => set({ selectedAccountIndex: index }),
	setConnectedWallet: (name) => set({ connectedWallet: name }),
}));
