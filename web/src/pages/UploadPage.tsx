import { useState, useCallback, type DragEvent } from "react";
import { Link } from "react-router-dom";
import { devAccounts } from "../hooks/useAccount";
import { deployments } from "../config/deployments";
import { useChainStore } from "../store/chainStore";
import {
	checkTransferAuthorization,
	uploadFileToBulletin,
	MAX_TRANSFER_SIZE,
	type BulletinUploadProgress,
} from "../hooks/useBulletinUpload";
import { createTransferRecord, checkContractDeployed, generateSlug } from "../hooks/useTransferContract";
import { getWalletClient } from "../config/evm";

function getAppBaseUrl(): string {
	if (import.meta.env.VITE_APP_URL) {
		return (import.meta.env.VITE_APP_URL as string).replace(/\/$/, "");
	}
	const { origin, pathname } = window.location;
	if (origin.includes(".app.dot.li")) {
		return origin.replace(".app.dot.li", ".dot.li");
	}
	return origin + (pathname === "/" ? "" : pathname.replace(/\/$/, ""));
}

const EXPIRY_OPTIONS = [
	{ label: "1 hour", hours: 1 },
	{ label: "6 hours", hours: 6 },
	{ label: "24 hours", hours: 24 },
	{ label: "48 hours", hours: 48 },
	{ label: "7 days", hours: 7 * 24 },
	{ label: "14 days", hours: 14 * 24 },
];

type UploadStep =
	| { type: "idle" }
	| { type: "authorizing" }
	| { type: "uploading"; progress: BulletinUploadProgress }
	| { type: "signing" }
	| { type: "done"; slug: string }
	| { type: "error"; message: string };

function formatSize(bytes: number): string {
	if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
	if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KiB`;
	return `${bytes} B`;
}

function progressLabel(progress: BulletinUploadProgress): string {
	if (progress.phase === "reading") return "Reading file...";
	if (progress.phase === "uploading") {
		return `Uploading chunk ${progress.chunkIndex + 1} of ${progress.totalChunks} to Bulletin Chain...`;
	}
	return "Upload complete";
}

export default function UploadPage() {
	const ethRpcUrl = useChainStore((s) => s.ethRpcUrl);

	const contractAddress = deployments.dotTransfer ?? "";

	const [file, setFile] = useState<File | null>(null);
	const [dragging, setDragging] = useState(false);
	const [expiryHours, setExpiryHours] = useState(24);
	const [bulletinAccountIndex, setBulletinAccountIndex] = useState(0);
	const [step, setStep] = useState<UploadStep>({ type: "idle" });

	const processFile = useCallback((f: File) => {
		if (f.size > MAX_TRANSFER_SIZE) {
			setStep({
				type: "error",
				message: `File too large (${formatSize(f.size)}). Maximum is 50 MiB.`,
			});
			return;
		}
		setFile(f);
		setStep({ type: "idle" });
	}, []);

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		setDragging(false);
		const f = e.dataTransfer.files[0];
		if (f) processFile(f);
	}

	function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
		const f = e.target.files?.[0];
		if (f) processFile(f);
	}

	async function handleUpload() {
		if (!file || !contractAddress) return;
		setStep({ type: "authorizing" });

		try {
			const deployed = await checkContractDeployed(contractAddress, ethRpcUrl);
			if (!deployed) {
				setStep({
					type: "error",
					message: `No DotTransfer contract found at ${contractAddress}. Deploy it first.`,
				});
				return;
			}

			const substrateAddress = devAccounts[bulletinAccountIndex].address;
			const authorized = await checkTransferAuthorization(substrateAddress, file.size);
			if (!authorized) {
				setStep({
					type: "error",
					message:
						"Bulletin Chain account not authorized for storage. " +
						"Authorization requires an on-chain governance action by the Bulletin Chain administrators.",
				});
				return;
			}

			const substrateSigner = devAccounts[bulletinAccountIndex].signer;
			const uploadResult = await uploadFileToBulletin(file, substrateSigner, (progress) => {
				setStep({ type: "uploading", progress });
			});

			setStep({ type: "signing" });
			const expiresAt = Math.floor(Date.now() / 1000) + expiryHours * 3600;
			const slug = generateSlug();
			const walletClient = await getWalletClient(bulletinAccountIndex, ethRpcUrl);

			await createTransferRecord(
				contractAddress,
				slug,
				{
					cids: uploadResult.cids,
					expiresAt,
					fileSize: file.size,
					fileName: file.name,
					chunkCount: uploadResult.chunkCount,
				},
				walletClient,
				ethRpcUrl,
			);

			setStep({ type: "done", slug });
		} catch (err) {
			setStep({
				type: "error",
				message: err instanceof Error ? err.message : String(err),
			});
		}
	}

	const shareLink =
		step.type === "done" ? `${getAppBaseUrl()}/#/download/${step.slug}` : null;

	const isWorking =
		step.type === "authorizing" || step.type === "uploading" || step.type === "signing";

	const canUpload = file && contractAddress && !isWorking && step.type !== "done";

	return (
		<div className="space-y-6 animate-fade-in">
			<div className="space-y-1">
				<h1 className="page-title text-polka-400">StarDot</h1>
				<p className="text-text-secondary">
					Upload a file to the{" "}
					<a
						href="https://paritytech.github.io/polkadot-bulletin-chain/"
						target="_blank"
						rel="noopener noreferrer"
						className="text-accent-blue hover:underline"
					>
						Paseo Bulletin Chain
					</a>{" "}
					(IPFS) and record the CID in a PVM smart contract on Paseo Asset Hub. The
					recipient gets a shareable link — data auto-expires after ~14 days.
				</p>
			</div>

			{/* Upload settings */}
			<div className="card space-y-4">
				{/* Dev account selector */}
				<div>
					<label className="label">Dev Account</label>
					<p className="text-xs text-text-muted mb-1.5">
						Pre-authorized dev account used for Bulletin Chain storage and PVM contract signing.
					</p>
					<select
						value={bulletinAccountIndex}
						onChange={(e) => setBulletinAccountIndex(parseInt(e.target.value))}
						className="input-field w-full"
						disabled={isWorking}
					>
						{devAccounts.map((acc, i) => (
							<option key={i} value={i}>
								{acc.name} — {acc.address.slice(0, 12)}…
							</option>
						))}
					</select>
				</div>

				{/* Expiry selector */}
				<div>
					<label className="label">Expiration</label>
					<select
						value={expiryHours}
						onChange={(e) => setExpiryHours(parseInt(e.target.value))}
						className="input-field w-full"
						disabled={isWorking}
					>
						{EXPIRY_OPTIONS.map((opt) => (
							<option key={opt.hours} value={opt.hours}>
								{opt.label}
							</option>
						))}
					</select>
					<p className="mt-1 text-xs text-text-muted">
						Bulletin Chain data auto-drops after ~14 days regardless of this setting.
					</p>
				</div>

				{/* Drop zone */}
				<div>
					<label className="label">File (max 50 MiB)</label>
					<div
						onDrop={handleDrop}
						onDragOver={(e) => {
							e.preventDefault();
							setDragging(true);
						}}
						onDragLeave={() => setDragging(false)}
						className={`border-2 border-dashed rounded-xl p-8 text-center transition-all duration-300 ${
							isWorking
								? "border-white/[0.06] opacity-50 cursor-not-allowed"
								: dragging
								? "border-polka-500 bg-polka-500/[0.06] shadow-glow cursor-copy"
								: "border-white/[0.08] hover:border-white/[0.15] hover:bg-white/[0.02] cursor-pointer"
						}`}
					>
						<input
							type="file"
							id="dt-file-input"
							className="hidden"
							onChange={handleFileInput}
							disabled={isWorking}
						/>
						<label
							htmlFor="dt-file-input"
							className={isWorking ? "cursor-not-allowed" : "cursor-pointer"}
						>
							{file ? (
								<div className="space-y-1">
									<p className="text-text-primary font-medium">{file.name}</p>
									<p className="text-text-muted text-sm">{formatSize(file.size)}</p>
									{!isWorking && (
										<p className="text-text-muted text-xs">Drop another to replace</p>
									)}
								</div>
							) : (
								<div className="space-y-1">
									<p className="text-text-secondary font-medium">
										Drop a file here or click to select
									</p>
									<p className="text-text-muted text-xs">
										Up to 50 MiB · chunked into 8 MiB pieces
									</p>
								</div>
							)}
						</label>
					</div>
				</div>

				{/* Upload button */}
				{!isWorking && step.type !== "done" && (
					<button
						onClick={handleUpload}
						disabled={!canUpload}
						className="btn-accent w-full"
						style={{
							background: canUpload
								? "linear-gradient(135deg, #00c8ff 0%, #0098c4 100%)"
								: undefined,
							color: "#060b14",
							fontWeight: 600,
							opacity: canUpload ? 1 : 0.4,
						}}
					>
						Upload & Share
					</button>
				)}
			</div>

			{(isWorking || step.type === "error" || step.type === "done") && (
				<div className="card space-y-3">
					<StepIndicator step={step} />
				</div>
			)}

			{step.type === "done" && shareLink && (
				<div className="card space-y-4">
					<div className="flex items-center gap-2">
						<div className="w-5 h-5 rounded-full bg-accent-green/20 flex items-center justify-center shrink-0">
							<svg className="w-3 h-3 text-accent-green" viewBox="0 0 12 12" fill="none">
								<path
									d="M2 6l3 3 5-5"
									stroke="currentColor"
									strokeWidth="1.5"
									strokeLinecap="round"
									strokeLinejoin="round"
								/>
							</svg>
						</div>
						<h2 className="section-title text-accent-green mb-0">Transfer Created!</h2>
					</div>

					<div>
						<label className="label">Share this link</label>
						<div className="flex gap-2">
							<input
								type="text"
								value={shareLink}
								readOnly
								className="input-field w-full font-mono text-xs"
							/>
							<button
								onClick={() => navigator.clipboard.writeText(shareLink)}
								className="btn-secondary text-xs whitespace-nowrap"
							>
								Copy
							</button>
						</div>
					</div>

					<div className="grid grid-cols-2 gap-3 text-sm">
						<div className="rounded-lg border border-white/[0.04] bg-white/[0.02] p-3">
							<p className="text-text-muted text-xs mb-0.5">Transfer ID</p>
							<p className="text-text-primary font-mono">{step.slug}</p>
						</div>
						<div className="rounded-lg border border-white/[0.04] bg-white/[0.02] p-3">
							<p className="text-text-muted text-xs mb-0.5">Expires in</p>
							<p className="text-text-primary">
								{EXPIRY_OPTIONS.find((o) => o.hours === expiryHours)?.label}
							</p>
						</div>
					</div>

					<div className="flex gap-2">
						<button
							onClick={() => {
								setFile(null);
								setStep({ type: "idle" });
							}}
							className="btn-secondary flex-1 text-sm"
						>
							Upload another file
						</button>
						<Link to="/my-transfers" className="btn-secondary flex-1 text-sm text-center">
							My Files
						</Link>
					</div>
				</div>
			)}
		</div>
	);
}

function StepIndicator({ step }: { step: UploadStep }) {
	const steps = [
		{
			id: "authorizing",
			label: "Authorizing",
			detail: "Checking Bulletin Chain authorization...",
		},
		{
			id: "uploading",
			label: "Uploading to Bulletin Chain",
			detail:
				step.type === "uploading"
					? progressLabel(step.progress)
					: "Uploading file chunks via TransactionStorage...",
		},
		{
			id: "signing",
			label: "Recording on Asset Hub",
			detail: "Submitting PVM contract transaction to Paseo Asset Hub...",
		},
	];

	const currentIndex = steps.findIndex((s) => s.id === step.type);

	if (step.type === "error") {
		return (
			<div className="space-y-2">
				<p className="text-sm font-medium text-accent-red">Upload failed</p>
				<p className="text-xs text-text-secondary break-words">{step.message}</p>
			</div>
		);
	}

	return (
		<div className="space-y-2">
			{steps.map((s, i) => {
				const isDone = step.type === "done" || i < currentIndex;
				const isActive = s.id === step.type;

				return (
					<div key={s.id} className="flex items-start gap-3">
						<div
							className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold transition-colors ${
								isDone
									? "bg-accent-green/20 text-accent-green"
									: isActive
									? "bg-polka-500/20 text-polka-400"
									: "bg-white/[0.05] text-text-muted"
							}`}
						>
							{isDone ? (
								<svg viewBox="0 0 10 10" className="w-2.5 h-2.5" fill="none">
									<path
										d="M1.5 5l2.5 2.5 4.5-4"
										stroke="currentColor"
										strokeWidth="1.5"
										strokeLinecap="round"
										strokeLinejoin="round"
									/>
								</svg>
							) : (
								i + 1
							)}
						</div>
						<div className="min-w-0">
							<p
								className={`text-sm font-medium ${
									isDone
										? "text-text-secondary"
										: isActive
										? "text-text-primary"
										: "text-text-muted"
								}`}
							>
								{s.label}
								{isActive && (
									<span className="ml-2 inline-block w-1.5 h-1.5 rounded-full bg-polka-400 animate-pulse" />
								)}
							</p>
							{isActive && (
								<p className="text-xs text-text-tertiary mt-0.5">{s.detail}</p>
							)}
						</div>
					</div>
				);
			})}
		</div>
	);
}
