import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { deployments } from "../config/deployments";
import { useChainStore } from "../store/chainStore";
import {
	getTransfersByUploader,
	revokeTransfer,
	checkContractDeployed,
	type UploaderTransfer,
} from "../hooks/useTransferContract";
import { evmDevAccounts, getWalletClient } from "../config/evm";

function formatSize(bytes: bigint): string {
	const n = Number(bytes);
	if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MiB`;
	if (n >= 1024) return `${(n / 1024).toFixed(0)} KiB`;
	return `${n} B`;
}

function formatExpiry(expiresAt: bigint, expired: boolean, revoked: boolean): string {
	if (revoked) return "Revoked";
	if (expired) return "Expired";
	const nowSec = BigInt(Math.floor(Date.now() / 1000));
	const diff = Number(expiresAt - nowSec);
	const days = Math.floor(diff / 86400);
	const hours = Math.floor((diff % 86400) / 3600);
	const mins = Math.floor((diff % 3600) / 60);
	if (days > 0) return `${days}d ${hours}h`;
	if (hours > 0) return `${hours}h ${mins}m`;
	return `${mins}m`;
}

function StatusBadge({ expired, revoked }: { expired: boolean; revoked: boolean }) {
	if (revoked) {
		return (
			<span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-accent-red/10 text-accent-red border border-accent-red/20">
				Revoked
			</span>
		);
	}
	if (expired) {
		return (
			<span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-white/[0.05] text-text-muted border border-white/[0.06]">
				Expired
			</span>
		);
	}
	return (
		<span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-accent-green/10 text-accent-green border border-accent-green/20">
			Active
		</span>
	);
}

function getAppBaseUrl(): string {
	if (import.meta.env.VITE_APP_URL) {
		return (import.meta.env.VITE_APP_URL as string).replace(/\/$/, "");
	}
	const { origin, pathname } = window.location;
	if (origin.includes(".app.dot.li")) return origin.replace(".app.dot.li", ".dot.li");
	return origin + (pathname === "/" ? "" : pathname.replace(/\/$/, ""));
}

export default function MyTransfersPage() {
	const ethRpcUrl = useChainStore((s) => s.ethRpcUrl);
	const [selectedIndex, setSelectedIndex] = useState(0);

	const contractAddress = deployments.dotTransfer ?? "";
	const evmAddress = evmDevAccounts[selectedIndex].account.address;

	const [transfers, setTransfers] = useState<UploaderTransfer[]>([]);
	const [loading, setLoading] = useState(false);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [revoking, setRevoking] = useState<string | null>(null);
	const [revokeError, setRevokeError] = useState<string | null>(null);

	const loadTransfers = useCallback(async () => {
		if (!contractAddress) return;
		setLoading(true);
		setLoadError(null);
		try {
			const deployed = await checkContractDeployed(contractAddress, ethRpcUrl);
			if (!deployed) {
				setLoadError(`No DotTransfer contract found at ${contractAddress}.`);
				return;
			}
			const results = await getTransfersByUploader(contractAddress, evmAddress, ethRpcUrl);
			setTransfers(results);
		} catch (err) {
			setLoadError(err instanceof Error ? err.message : String(err));
		} finally {
			setLoading(false);
		}
	}, [evmAddress, contractAddress, ethRpcUrl]);

	useEffect(() => {
		loadTransfers();
	}, [loadTransfers]);

	async function handleRevoke(slug: string) {
		setRevoking(slug);
		setRevokeError(null);
		try {
			const walletClient = await getWalletClient(selectedIndex, ethRpcUrl);
			await revokeTransfer(contractAddress, slug, walletClient, ethRpcUrl);
			setTransfers((prev) =>
				prev.map((t) =>
					t.slug === slug ? { ...t, record: { ...t.record, revoked: true } } : t,
				),
			);
		} catch (err) {
			setRevokeError(err instanceof Error ? err.message : String(err));
		} finally {
			setRevoking(null);
		}
	}

	const appBase = getAppBaseUrl();

	return (
		<div className="space-y-6 animate-fade-in">
			<div className="flex items-start justify-between">
				<div className="space-y-1">
					<h1 className="page-title text-polka-400">My Files</h1>
					<p className="text-text-secondary">
						All transfers you&apos;ve uploaded, stored on Paseo Asset Hub.
					</p>
				</div>
				<Link to="/transfer" className="btn-secondary text-sm shrink-0">
					+ New Transfer
				</Link>
			</div>

			{/* Dev account selector */}
			<div className="card space-y-3">
				<div className="flex items-center justify-between">
					<div>
						<label className="label mb-0.5">Dev Account</label>
						<p className="font-mono text-xs text-text-muted">{evmAddress}</p>
					</div>
					<div className="flex items-center gap-2">
						<select
							value={selectedIndex}
							onChange={(e) => setSelectedIndex(parseInt(e.target.value))}
							className="input-field text-sm"
							disabled={loading}
						>
							{evmDevAccounts.map((acc, i) => (
								<option key={i} value={i}>
									{acc.name}
								</option>
							))}
						</select>
						<button
							onClick={loadTransfers}
							disabled={loading}
							className="btn-secondary text-xs"
						>
							{loading ? "Loading…" : "Refresh"}
						</button>
					</div>
				</div>
			</div>

			{loadError && (
				<div className="card space-y-2">
					<p className="text-sm text-accent-red">Failed to load transfers</p>
					<p className="text-xs text-text-secondary break-words">{loadError}</p>
					<button onClick={loadTransfers} className="btn-secondary text-xs">
						Retry
					</button>
				</div>
			)}

			{loading && (
				<div className="card text-center py-10">
					<div className="w-6 h-6 rounded-full border-2 border-polka-500/30 border-t-polka-500 animate-spin mx-auto mb-3" />
					<p className="text-text-secondary text-sm">Querying Paseo Asset Hub…</p>
				</div>
			)}

			{!loading && !loadError && transfers.length === 0 && (
				<div className="card text-center py-10 space-y-3">
					<p className="text-text-secondary text-sm">No transfers found for this address.</p>
					<Link to="/transfer" className="btn-secondary text-sm inline-block">
						Upload your first file
					</Link>
				</div>
			)}

			{revokeError && (
				<div className="rounded-lg bg-accent-red/10 border border-accent-red/20 px-3 py-2 text-xs text-accent-red">
					Revoke failed: {revokeError}
				</div>
			)}

			{!loading && transfers.length > 0 && (
				<div className="space-y-2">
					{transfers.map(({ slug, record }) => {
						const isActive = !record.expired && !record.revoked;
						const isBeingRevoked = revoking === slug;
						const shareLink = `${appBase}/#/download/${slug}`;

						return (
							<div key={slug} className="card space-y-3">
								<div className="flex items-start gap-3">
									<div className="w-8 h-8 rounded-lg bg-polka-500/10 border border-polka-500/20 flex items-center justify-center shrink-0 mt-0.5">
										<svg className="w-4 h-4 text-polka-400" viewBox="0 0 20 20" fill="none">
											<path
												d="M4 4a2 2 0 012-2h5l5 5v9a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"
												stroke="currentColor"
												strokeWidth="1.5"
											/>
											<path
												d="M11 2v5h5"
												stroke="currentColor"
												strokeWidth="1.5"
												strokeLinecap="round"
											/>
										</svg>
									</div>
									<div className="min-w-0 flex-1">
										<div className="flex items-center gap-2 flex-wrap">
											<p className="text-text-primary font-medium text-sm break-all">
												{record.fileName || `transfer-${slug}`}
											</p>
											<StatusBadge expired={record.expired} revoked={record.revoked} />
										</div>
										<p className="text-text-muted text-xs mt-0.5">
											{formatSize(record.fileSize)} ·{" "}
											{record.chunkCount > 1n ? `${record.chunkCount} chunks · ` : ""}
											{formatExpiry(record.expiresAt, record.expired, record.revoked)}
											{isActive && " remaining"}
										</p>
									</div>
								</div>

								<div className="flex items-center gap-2">
									<a
										href={shareLink}
										target="_blank"
										rel="noopener noreferrer"
										className="font-mono text-xs text-accent-blue hover:underline truncate flex-1"
									>
										#{slug}
									</a>
									<button
										onClick={() => navigator.clipboard.writeText(shareLink)}
										className="btn-secondary text-xs shrink-0"
									>
										Copy link
									</button>
									{isActive && (
										<button
											onClick={() => handleRevoke(slug)}
											disabled={isBeingRevoked}
											className="text-xs px-3 py-1.5 rounded-lg border border-accent-red/30 text-accent-red hover:bg-accent-red/10 transition-colors disabled:opacity-40 shrink-0"
										>
											{isBeingRevoked ? "Revoking…" : "Revoke"}
										</button>
									)}
								</div>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}
