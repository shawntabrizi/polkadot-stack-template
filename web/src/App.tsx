import { useEffect } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import { hostApi } from "@novasamatech/product-sdk";
import { enumValue } from "@novasamatech/host-api";
import { useChainStore } from "./store/chainStore";
import { useConnectionManagement } from "./hooks/useConnection";

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
	const pallets = useChainStore((s) => s.pallets);
	const connected = useChainStore((s) => s.connected);

	useConnectionManagement();

	// Request TransactionSubmit permission upfront from the Polkadot Host.
	// Without this, every signing operation (statement store createProof +
	// on-chain Revive.call) is silently rejected with SigningErr::PermissionDenied.
	// Matches the pattern in host-api-example/apps/web/src/provider.ts.
	useEffect(() => {
		if (!isInHost()) return;
		hostApi.permission(enumValue("v1", { tag: "TransactionSubmit", value: undefined })).match(
			() => {},
			(err) => console.warn("[host] TransactionSubmit permission denied:", err),
		);
	}, []);

	const isDev = import.meta.env.DEV || new URLSearchParams(window.location.search).has("dev");

	const navItems = [
		{ path: "/", label: "Home", enabled: true },
		// Marketplace (required order)
		{ path: "/researcher", label: "Researcher", enabled: true },
		{ path: "/patient", label: "Patient", enabled: true },
		{ path: "/medic", label: "Medic", enabled: true },
		// Template reference (PoE) — dev only
		...(isDev
			? [
					{
						path: "/pallet",
						label: "Pallet PoE",
						enabled: pallets.templatePallet === true,
					},
					{ path: "/evm", label: "EVM PoE", enabled: pallets.revive === true },
					{ path: "/pvm", label: "PVM PoE", enabled: pallets.revive === true },
					{ path: "/statements", label: "Statements", enabled: true },
					{ path: "/accounts", label: "Accounts", enabled: true },
				]
			: []),
	];

	return (
		<div className="min-h-screen bg-pattern relative">
			{/* Ambient gradient orbs */}
			<div
				className="gradient-orb"
				style={{ background: "#e6007a", top: "-150px", right: "-150px", opacity: 0.11 }}
			/>
			<div
				className="gradient-orb"
				style={{ background: "#4cc2ff", bottom: "-200px", left: "-200px", opacity: 0.07 }}
			/>
			<div
				className="gradient-orb"
				style={{
					background: "#7c3aed",
					top: "40%",
					left: "30%",
					opacity: 0.05,
					width: "900px",
					height: "900px",
				}}
			/>

			{/* Navigation */}
			<nav className="sticky top-0 z-50 border-b border-white/[0.08] backdrop-blur-2xl bg-surface-950/90">
				<div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-6">
					<Link to="/" className="flex items-center gap-3 shrink-0 group">
						<div className="w-9 h-9 rounded-xl bg-gradient-to-br from-polka-400 via-polka-600 to-[#7c3aed] flex items-center justify-center shadow-glow group-hover:shadow-glow-lg transition-all duration-300">
							<svg viewBox="0 0 20 20" className="w-5 h-5" fill="none">
								<circle cx="10" cy="10" r="2.5" fill="white" />
								<circle cx="10" cy="3" r="1.4" fill="white" opacity="0.9" />
								<circle cx="16" cy="6.5" r="1.4" fill="white" opacity="0.9" />
								<circle cx="16" cy="13.5" r="1.4" fill="white" opacity="0.9" />
								<circle cx="10" cy="17" r="1.4" fill="white" opacity="0.9" />
								<circle cx="4" cy="13.5" r="1.4" fill="white" opacity="0.9" />
								<circle cx="4" cy="6.5" r="1.4" fill="white" opacity="0.9" />
								<line
									x1="10"
									y1="7.5"
									x2="10"
									y2="4.4"
									stroke="white"
									strokeWidth="0.8"
									opacity="0.45"
								/>
								<line
									x1="10"
									y1="12.5"
									x2="10"
									y2="15.6"
									stroke="white"
									strokeWidth="0.8"
									opacity="0.45"
								/>
								<line
									x1="10"
									y1="7.8"
									x2="14.7"
									y2="7.9"
									stroke="white"
									strokeWidth="0.8"
									opacity="0.45"
								/>
								<line
									x1="10"
									y1="12.2"
									x2="14.7"
									y2="12.1"
									stroke="white"
									strokeWidth="0.8"
									opacity="0.45"
								/>
								<line
									x1="10"
									y1="7.8"
									x2="5.3"
									y2="7.9"
									stroke="white"
									strokeWidth="0.8"
									opacity="0.45"
								/>
								<line
									x1="10"
									y1="12.2"
									x2="5.3"
									y2="12.1"
									stroke="white"
									strokeWidth="0.8"
									opacity="0.45"
								/>
							</svg>
						</div>
						<div className="flex flex-col leading-none gap-0.5">
							<span className="text-sm font-bold text-text-primary font-display tracking-tight">
								Polkadot
							</span>
							<span
								className="font-medium tracking-widest uppercase text-polka-500"
								style={{ fontSize: "0.6rem" }}
							>
								Stack Template
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

					{/* Connection indicator */}
					<div className="ml-auto flex items-center gap-2 shrink-0">
						<span
							className={`w-2 h-2 rounded-full transition-colors duration-500 ${
								connected
									? "bg-accent-green shadow-[0_0_6px_rgba(52,211,153,0.5)]"
									: "bg-text-muted"
							}`}
						/>
						<span className="text-xs text-text-tertiary hidden sm:inline">
							{connected ? "Connected" : "Offline"}
						</span>
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
