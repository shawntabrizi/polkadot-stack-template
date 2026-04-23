import { useState, useEffect, useRef, useCallback } from "react";
import { connectInjectedExtension, getInjectedExtensions } from "polkadot-api/pjs-signer";
import { SpektrExtensionName } from "@novasamatech/product-sdk";
import { useChainStore } from "../store/chainStore";
import {
	devAccounts,
	getOrCreateStatementSigner,
	substrateToH160,
	type AppAccount,
} from "../hooks/useAccount";
import Spinner from "./Spinner";

function shortenAddr(addr: string): string {
	return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function isLocalHost(): boolean {
	if (typeof window === "undefined") return true;
	return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
}

function mapExtAccount(acc: {
	name?: string;
	address: string;
	polkadotSigner: { publicKey: Uint8Array };
}): AppAccount {
	return {
		name: acc.name ?? shortenAddr(acc.address),
		address: acc.address,
		signer: acc.polkadotSigner as AppAccount["signer"],
		evmAddress: substrateToH160(acc.polkadotSigner.publicKey),
		localSigner: getOrCreateStatementSigner(acc.address),
	};
}

export default function WalletSelector() {
	const accounts = useChainStore((s) => s.accounts);
	const selectedIdx = useChainStore((s) => s.selectedAccountIndex);
	const connectedWallet = useChainStore((s) => s.connectedWallet);
	const setAccounts = useChainStore((s) => s.setAccounts);
	const setSelectedIdx = useChainStore((s) => s.setSelectedAccountIndex);
	const setConnectedWallet = useChainStore((s) => s.setConnectedWallet);

	const [open, setOpen] = useState(false);
	const [availableExtensions, setAvailableExtensions] = useState<string[]>([]);
	const [connecting, setConnecting] = useState<string | null>(null);
	const extUnsubRef = useRef<(() => void) | null>(null);
	const dropdownRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		return () => {
			extUnsubRef.current?.();
		};
	}, []);

	useEffect(() => {
		function handleMouseDown(e: MouseEvent) {
			if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
				setOpen(false);
			}
		}
		if (open) document.addEventListener("mousedown", handleMouseDown);
		return () => document.removeEventListener("mousedown", handleMouseDown);
	}, [open]);

	useEffect(() => {
		if (!open) return;
		try {
			const exts = getInjectedExtensions().filter((n) => n !== SpektrExtensionName);
			setAvailableExtensions(exts);
		} catch {
			setAvailableExtensions([]);
		}
	}, [open]);

	const buildAccountList = useCallback((extensionAccounts: AppAccount[]): AppAccount[] => {
		const base = isLocalHost() ? devAccounts : [];
		return [...base, ...extensionAccounts];
	}, []);

	const connectExtension = useCallback(
		async (name: string) => {
			setConnecting(name);
			try {
				let ext = null;
				for (let i = 0; i < 5; i++) {
					try {
						ext = await connectInjectedExtension(name);
						break;
					} catch {
						if (i < 4) await new Promise((r) => setTimeout(r, 800));
					}
				}
				if (!ext) throw new Error(`Could not connect to ${name}`);

				extUnsubRef.current?.();

				const extensionAccounts = ext.getAccounts().map(mapExtAccount);
				const merged = buildAccountList(extensionAccounts);
				setAccounts(merged);
				const firstExtIdx = isLocalHost() ? devAccounts.length : 0;
				setSelectedIdx(Math.min(firstExtIdx, merged.length - 1));
				setConnectedWallet(name);

				extUnsubRef.current = ext.subscribe((updated) => {
					const updatedAccounts = updated.map(mapExtAccount);
					setAccounts(buildAccountList(updatedAccounts));
				});
			} catch (e) {
				console.error("[WalletSelector] connect failed:", e);
			} finally {
				setConnecting(null);
			}
		},
		[buildAccountList, setAccounts, setConnectedWallet, setSelectedIdx],
	);

	const disconnectExtension = useCallback(() => {
		extUnsubRef.current?.();
		extUnsubRef.current = null;
		setConnectedWallet(null);
		setAccounts(devAccounts);
		setSelectedIdx(0);
		setOpen(false);
	}, [setAccounts, setConnectedWallet, setSelectedIdx]);

	const selectAccount = useCallback(
		(address: string) => {
			const idx = accounts.findIndex((a) => a.address === address);
			if (idx >= 0) {
				setSelectedIdx(idx);
				setOpen(false);
			}
		},
		[accounts, setSelectedIdx],
	);

	const current = accounts[selectedIdx] ?? accounts[0] ?? null;
	const devSection = accounts.filter((a) => devAccounts.some((d) => d.address === a.address));
	const extensionSection = accounts.filter(
		(a) => !devAccounts.some((d) => d.address === a.address),
	);
	const unconnectedExtensions = availableExtensions.filter((n) => n !== connectedWallet);

	return (
		<div className="relative shrink-0" ref={dropdownRef}>
			<button
				onClick={() => setOpen((v) => !v)}
				className={`flex items-center gap-2.5 px-4 py-2 rounded-xl border text-sm transition-all duration-200 ${
					open
						? "bg-white/[0.08] border-white/[0.16] text-text-primary"
						: "bg-white/[0.05] border-white/[0.08] text-text-secondary hover:bg-white/[0.08] hover:text-text-primary"
				}`}
			>
				{current ? (
					<>
						<span className="w-2 h-2 rounded-full bg-accent-green shrink-0" />
						<span className="font-medium max-w-[120px] truncate">{current.name}</span>
						<span className="font-mono text-xs text-text-muted hidden sm:inline">
							{shortenAddr(current.address)}
						</span>
					</>
				) : (
					<span>Connect Wallet</span>
				)}
				<svg
					className={`w-3.5 h-3.5 text-text-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`}
					fill="none"
					viewBox="0 0 12 12"
				>
					<path
						d="M2 4l4 4 4-4"
						stroke="currentColor"
						strokeWidth="1.5"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
			</button>

			{open && (
				<div className="absolute right-0 top-full mt-1.5 w-72 rounded-xl border border-white/[0.08] bg-surface-950/95 backdrop-blur-xl shadow-2xl z-50 py-2 overflow-hidden">
					{extensionSection.length > 0 && (
						<>
							<div className="flex items-center justify-between px-3.5 pt-1 pb-2">
								<p className="text-[10px] text-text-tertiary uppercase tracking-widest">
									{connectedWallet ?? "Extension"}
								</p>
								<button
									onClick={disconnectExtension}
									className="text-[10px] text-accent-red/70 hover:text-accent-red transition-colors"
								>
									Disconnect
								</button>
							</div>
							{extensionSection.map((acc) => (
								<AccountRow
									key={acc.address}
									account={acc}
									active={acc.address === current?.address}
									onClick={() => selectAccount(acc.address)}
								/>
							))}
						</>
					)}

					{devSection.length > 0 && (
						<>
							{extensionSection.length > 0 && (
								<div className="border-t border-white/[0.06] mt-1.5 mb-1.5" />
							)}
							<p className="px-3.5 pt-1 pb-2 text-[10px] text-text-tertiary uppercase tracking-widest">
								Dev accounts
							</p>
							{devSection.map((acc) => (
								<AccountRow
									key={acc.address}
									account={acc}
									active={acc.address === current?.address}
									onClick={() => selectAccount(acc.address)}
								/>
							))}
						</>
					)}

					{unconnectedExtensions.length > 0 && (
						<>
							<div className="border-t border-white/[0.06] mt-1.5 mb-1.5" />
							<p className="px-3.5 pb-2 text-[10px] text-text-tertiary uppercase tracking-widest">
								Connect wallet
							</p>
							{unconnectedExtensions.map((ext) => (
								<button
									key={ext}
									onClick={() => void connectExtension(ext)}
									disabled={connecting !== null}
									className="w-full text-left flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-text-secondary hover:bg-white/[0.04] hover:text-text-primary transition-colors disabled:opacity-60"
								>
									{connecting === ext ? (
										<>
											<Spinner />
											<span>Connecting…</span>
										</>
									) : (
										<>
											<span className="text-text-muted text-base leading-none">
												+
											</span>
											<span>{ext}</span>
										</>
									)}
								</button>
							))}
						</>
					)}

					{devSection.length === 0 &&
						extensionSection.length === 0 &&
						unconnectedExtensions.length === 0 && (
							<p className="px-3.5 py-3 text-sm text-text-muted">
								No wallets detected. Install Talisman or SubWallet.
							</p>
						)}
				</div>
			)}
		</div>
	);
}

function AccountRow({
	account,
	active,
	onClick,
}: {
	account: AppAccount;
	active: boolean;
	onClick: () => void;
}) {
	return (
		<button
			onClick={onClick}
			className={`w-full text-left flex items-center gap-3 px-3.5 py-2.5 transition-colors ${
				active
					? "bg-polka-500/[0.08] text-text-primary"
					: "text-text-secondary hover:bg-white/[0.04] hover:text-text-primary"
			}`}
		>
			<span
				className={`w-2 h-2 rounded-full shrink-0 ${active ? "bg-polka-400" : "bg-white/20"}`}
			/>
			<span className="text-sm font-medium truncate flex-1">{account.name}</span>
			<span className="font-mono text-xs text-text-muted shrink-0">
				{shortenAddr(account.address)}
			</span>
			{active && (
				<svg
					className="w-3.5 h-3.5 text-polka-400 shrink-0"
					fill="currentColor"
					viewBox="0 0 12 12"
				>
					<path
						d="M2 6l3 3 5-5"
						stroke="currentColor"
						strokeWidth="1.5"
						strokeLinecap="round"
						strokeLinejoin="round"
						fill="none"
					/>
				</svg>
			)}
		</button>
	);
}
