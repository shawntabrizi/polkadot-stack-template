import { useEffect } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import { hostApi } from "@novasamatech/product-sdk";
import { enumValue } from "@novasamatech/host-api";
import { useChainStore } from "./store/chainStore";
import { useConnectionManagement } from "./hooks/useConnection";
import WalletSelector from "./components/WalletSelector";

function isInHost(): boolean {
	if (typeof window === "undefined") return false;
	if ((window as { __HOST_WEBVIEW_MARK__?: boolean }).__HOST_WEBVIEW_MARK__) return true;
	try {
		return window !== window.top;
	} catch {
		return true;
	}
}

export default function App() {
	const location = useLocation();
	const connected = useChainStore((s) => s.connected);

	useConnectionManagement();

	// Request TransactionSubmit permission upfront from the Polkadot Host.
	useEffect(() => {
		if (!isInHost()) return;
		hostApi.permission(enumValue("v1", { tag: "TransactionSubmit", value: undefined })).match(
			() => {},
			(err) => console.warn("[host] TransactionSubmit permission denied:", err),
		);
	}, []);

	const navItems = [
		{ path: "/", label: "Home", enabled: true },
		{ path: "/researcher", label: "Researcher", enabled: true },
		{ path: "/patient", label: "Patient", enabled: true },
		{ path: "/medic", label: "Medic", enabled: true },
		{ path: "/share", label: "Share", enabled: true },
		{ path: "/inbox", label: "Inbox", enabled: true },
		{ path: "/governance", label: "Governance", enabled: true },
		{ path: "/accounts", label: "Accounts", enabled: true },
	];

	return (
		<div className="min-h-screen bg-pattern relative">
			{/* Ambient gradient orbs */}
			<div
				className="gradient-orb"
				style={{ background: "#e6007a", top: "-150px", right: "-150px", opacity: 0.09 }}
			/>
			<div
				className="gradient-orb"
				style={{ background: "#06b6d4", bottom: "-200px", left: "-200px", opacity: 0.1 }}
			/>
			<div
				className="gradient-orb"
				style={{
					background: "#0369a1",
					top: "40%",
					left: "30%",
					opacity: 0.06,
					width: "900px",
					height: "900px",
				}}
			/>

			{/* Navigation */}
			<nav className="sticky top-0 z-50 border-b border-white/[0.08] backdrop-blur-2xl bg-surface-950/90">
				<div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-6">
					<Link to="/" className="flex items-center gap-3 shrink-0 group">
						<div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#0891b2] via-polka-600 to-polka-400 flex items-center justify-center shadow-glow group-hover:shadow-glow-lg transition-all duration-300">
							<svg viewBox="0 0 20 20" className="w-5 h-5" fill="none">
								{/* Shield */}
								<path
									d="M10 1.8 C7.2 1.8 3.8 3.2 3.8 5.6 V10.8 C3.8 14.8 10 18.4 10 18.4 C10 18.4 16.2 14.8 16.2 10.8 V5.6 C16.2 3.2 12.8 1.8 10 1.8 Z"
									fill="white"
									fillOpacity="0.18"
									stroke="white"
									strokeWidth="1.1"
									strokeLinejoin="round"
								/>
								{/* Folder tab */}
								<path
									d="M6.8 7.8 L8.2 7.8 L9 7 L11.2 7 L11.2 7.8"
									stroke="white"
									strokeWidth="0.9"
									strokeLinejoin="round"
									strokeLinecap="round"
								/>
								{/* Folder body */}
								<rect
									x="6.8"
									y="7.8"
									width="6.4"
									height="5.2"
									rx="0.9"
									fill="white"
									fillOpacity="0.28"
									stroke="white"
									strokeWidth="0.9"
								/>
								{/* Medical cross — vertical */}
								<rect
									x="9.3"
									y="9.3"
									width="1.4"
									height="3.2"
									rx="0.5"
									fill="white"
								/>
								{/* Medical cross — horizontal */}
								<rect x="8" y="10.3" width="4" height="1.4" rx="0.5" fill="white" />
							</svg>
						</div>
						<div className="flex flex-col leading-none gap-0.5">
							<span className="text-sm font-bold text-text-primary font-display tracking-tight">
								OwnMed
							</span>
							<span
								className="font-medium tracking-widest uppercase"
								style={{ fontSize: "0.6rem", color: "#06b6d4" }}
							>
								Patient-Owned
							</span>
						</div>
					</Link>

					<div className="flex gap-0.5 overflow-x-auto">
						{navItems.map((item) =>
							item.enabled ? (
								<Link
									key={item.path}
									to={item.path}
									className={`relative px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap ${
										location.pathname === item.path
											? "text-white"
											: "text-text-secondary hover:text-text-primary hover:bg-white/[0.04]"
									}`}
								>
									{location.pathname === item.path && (
										<span className="absolute inset-0 rounded-lg bg-polka-500/15 border border-polka-500/25" />
									)}
									<span className="relative">{item.label}</span>
								</Link>
							) : (
								<span
									key={item.path}
									className="px-3 py-1.5 rounded-lg text-sm font-medium text-text-muted cursor-not-allowed whitespace-nowrap"
									title="Pallet not available on connected chain"
								>
									{item.label}
								</span>
							),
						)}
					</div>

					{/* Right side: wallet selector + connection dot */}
					<div className="ml-auto flex items-center gap-3 shrink-0">
						<WalletSelector />
						<span
							className={`w-2 h-2 rounded-full transition-colors duration-500 ${
								connected
									? "bg-accent-green shadow-[0_0_6px_rgba(52,211,153,0.5)]"
									: "bg-text-muted"
							}`}
							title={connected ? "Connected" : "Offline"}
						/>
					</div>
				</div>
			</nav>

			{/* Main content */}
			<main className="relative z-10 max-w-5xl mx-auto px-4 py-8">
				<Outlet />
			</main>
		</div>
	);
}
