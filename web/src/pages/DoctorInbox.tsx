import { useState, useEffect, useCallback, useMemo } from "react";
import { type Address, parseAbiItem } from "viem";
import { getPublicClient } from "../config/evm";
import Toast from "../components/Toast";
import { deployments } from "../config/deployments";
import { subscribeStatements } from "../hooks/useStatementStore";
import { useChainStore } from "../store/chainStore";
import {
	getOrCreateBuyerKey,
	computeBodyCommit,
	computeHeaderCommit,
	computeRecordCommit,
	decryptRecord,
	encodeRecordToFieldElements,
	type MedicalHeader,
} from "../utils/zk";
import { verifySignature } from "@zk-kit/eddsa-poseidon";

// ---------------------------------------------------------------------------
// Helpers (mirror ResearcherBuy conventions — do not modify that file)
// ---------------------------------------------------------------------------

function uint256ToHashHex(n: bigint): string {
	return "0x" + n.toString(16).padStart(64, "0");
}

function formatRecordedAt(unixSeconds: number): string {
	return new Date(unixSeconds * 1000).toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

function truncate(addr: string): string {
	return `${addr.slice(0, 8)}...${addr.slice(-4)}`;
}

function truncateHex(hex: string): string {
	// Same first-6 / last-4 convention ResearcherBuy uses for long hexes.
	return `${hex.slice(0, 6)}...${hex.slice(-4)}`;
}

function verifyShareOffChain(
	header: MedicalHeader,
	headerCommit: bigint,
	bodyCommit: bigint,
	medicPk: { x: bigint; y: bigint },
	sig: { R8x: bigint; R8y: bigint; S: bigint },
): { headerMatch: boolean; sigValid: boolean } {
	let headerMatch = false;
	try {
		headerMatch = computeHeaderCommit(header) === headerCommit;
	} catch {
		headerMatch = false;
	}
	let sigValid = false;
	try {
		const combined = computeRecordCommit(headerCommit, bodyCommit);
		sigValid = verifySignature(combined, { R8: [sig.R8x, sig.R8y], S: sig.S }, [
			medicPk.x,
			medicPk.y,
		]);
	} catch {
		sigValid = false;
	}
	return { headerMatch, sigValid };
}

// ---------------------------------------------------------------------------
// Event parsing
// ---------------------------------------------------------------------------

const recordSharedEvent = parseAbiItem(
	"event RecordShared(address indexed patient, uint256 indexed doctorPkX, uint256 doctorPkY, uint256 headerCommit, uint256 bodyCommit, uint256 medicPkX, uint256 medicPkY, uint256 sigR8x, uint256 sigR8y, uint256 sigS, uint256 ephPkX, uint256 ephPkY, uint256 ciphertextHash, string title, string recordType, uint64 recordedAt, string facility)",
);

interface IncomingShare {
	patient: Address;
	doctorPkX: bigint;
	doctorPkY: bigint;
	headerCommit: bigint;
	bodyCommit: bigint;
	medicPkX: bigint;
	medicPkY: bigint;
	sigR8x: bigint;
	sigR8y: bigint;
	sigS: bigint;
	ephPkX: bigint;
	ephPkY: bigint;
	ciphertextHash: bigint;
	header: MedicalHeader;
	blockNumber: bigint;
	logIndex: number;
	txHash: string;
	// Off-chain pre-decrypt verification:
	headerMatch: boolean;
	sigValid: boolean;
}

interface DecryptedShare {
	fields: Record<string, string>;
	bodyMatch: boolean;
	sigValid: boolean;
}

// ---------------------------------------------------------------------------
// Chip component (inline — no new files)
// ---------------------------------------------------------------------------

function Chip({ ok, label }: { ok: boolean; label: string }) {
	return (
		<span
			className={`px-1.5 py-0.5 rounded text-xs ${
				ok ? "bg-accent-green/10 text-accent-green" : "bg-accent-red/10 text-accent-red"
			}`}
		>
			{ok ? "✓" : "✗"} {label}
		</span>
	);
}

// ---------------------------------------------------------------------------
// Per-share card (inline sub-component)
// ---------------------------------------------------------------------------

function IncomingShareCard({
	share,
	stmtCache,
	skDoctor,
	onDecrypted,
	decrypted,
}: {
	share: IncomingShare;
	stmtCache: Map<string, Uint8Array>;
	skDoctor: bigint;
	onDecrypted: (key: string, result: DecryptedShare) => void;
	decrypted: DecryptedShare | undefined;
}) {
	const [expanded, setExpanded] = useState(false);
	const [localStatus, setLocalStatus] = useState<string | null>(null);

	const medicVerified = share.headerMatch && share.sigValid;
	const cacheKey = useMemo(() => uint256ToHashHex(share.ciphertextHash), [share.ciphertextHash]);
	const storeKey = `${share.txHash}:${share.logIndex}`;

	const tryDecrypt = useCallback(() => {
		const matched = stmtCache.get(cacheKey);
		if (!matched) {
			setLocalStatus("Waiting for ciphertext in Statement Store…");
			return;
		}
		try {
			setLocalStatus("Decrypting record…");
			// Share-flow nonce is 0n (matches MedicalMarket.shareWithDoctor encryption path).
			const fields = decryptRecord({
				ephPk: { x: share.ephPkX, y: share.ephPkY },
				ciphertextBytes: matched,
				skBuyer: skDoctor,
				nonce: 0n,
			});
			const recoveredPlaintext = encodeRecordToFieldElements(fields);
			const recomputedBody = computeBodyCommit(recoveredPlaintext);
			const bodyMatch = recomputedBody === share.bodyCommit;
			onDecrypted(storeKey, {
				fields,
				bodyMatch,
				sigValid: share.sigValid,
			});
			setLocalStatus(null);
		} catch (e) {
			setLocalStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
		}
	}, [
		cacheKey,
		stmtCache,
		skDoctor,
		share.ephPkX,
		share.ephPkY,
		share.bodyCommit,
		share.sigValid,
		onDecrypted,
		storeKey,
	]);

	// If the user expanded before the Statement Store cache populated, retry when
	// the cache updates so "Waiting for ciphertext…" resolves automatically.
	useEffect(() => {
		if (!expanded) return;
		if (decrypted) return;
		if (!stmtCache.get(cacheKey)) return;
		tryDecrypt();
	}, [expanded, decrypted, stmtCache, cacheKey, tryDecrypt]);

	function onToggle() {
		const next = !expanded;
		setExpanded(next);
		if (next && !decrypted) {
			tryDecrypt();
		}
	}

	return (
		<div className="rounded-lg border border-white/[0.04] bg-white/[0.02] p-3 text-sm space-y-1.5">
			<div className="flex items-start justify-between gap-2">
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2 flex-wrap">
						<p className="text-text-primary font-medium">{share.header.title}</p>
						<span
							className={`text-[10px] font-medium px-1.5 py-0.5 rounded whitespace-nowrap ${
								medicVerified
									? "bg-accent-green/10 text-accent-green"
									: "bg-accent-red/10 text-accent-red"
							}`}
							title={
								medicVerified
									? "headerCommit matches and medic sig valid"
									: !share.headerMatch
										? "headerCommit mismatch — header does not hash to what the medic signed"
										: "medic signature invalid"
							}
						>
							{medicVerified ? "✓ medic-verified" : "✗ unverified"}
						</span>
					</div>
					<div className="flex flex-wrap gap-1.5 mt-1 text-[10px]">
						<span className="px-1.5 py-0.5 rounded bg-polka-500/10 text-polka-400 font-medium">
							{share.header.recordType}
						</span>
						<span className="px-1.5 py-0.5 rounded bg-white/[0.06] text-text-tertiary">
							{formatRecordedAt(share.header.recordedAt)}
						</span>
						<span className="px-1.5 py-0.5 rounded bg-white/[0.06] text-text-tertiary">
							{share.header.facility}
						</span>
					</div>
					<p className="text-text-tertiary text-xs mt-1">
						From:{" "}
						<span className="text-text-secondary font-mono">
							{truncate(share.patient)}
						</span>{" "}
						· Block #{share.blockNumber.toString()}
					</p>
				</div>
				<button
					onClick={onToggle}
					className="btn-secondary text-xs whitespace-nowrap self-start"
				>
					{expanded ? "Hide" : "Decrypt & View"}
				</button>
			</div>

			{expanded && (
				<div className="mt-2 space-y-1">
					{decrypted ? (
						<>
							<div className="flex flex-wrap gap-2 text-xs">
								<Chip ok={decrypted.bodyMatch} label="bodyCommit" />
								<Chip ok={decrypted.sigValid} label="medic signature" />
							</div>
							<p className="text-text-secondary text-xs font-medium pt-1">
								Decrypted record:
							</p>
							<table className="w-full text-xs border-collapse">
								<tbody>
									{Object.entries(decrypted.fields).map(([field, value]) => (
										<tr
											key={field}
											className="border-b border-white/[0.04] last:border-0"
										>
											<td className="py-1 pr-3 text-text-tertiary font-mono whitespace-nowrap align-top">
												{field}
											</td>
											<td className="py-1 text-text-primary break-all">
												{value}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</>
					) : (
						<p className="text-text-tertiary text-xs">
							{localStatus ?? "Waiting for ciphertext in Statement Store…"}
						</p>
					)}
				</div>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DoctorInbox() {
	const ethRpcUrl = useChainStore((s) => s.ethRpcUrl);
	const wsUrl = useChainStore((s) => s.wsUrl);

	const storageKey = `medical-market-address:${ethRpcUrl}`;
	const defaultAddress = (deployments as Record<string, string | null>).medicalMarket ?? null;

	const [contractAddress, setContractAddress] = useState("");
	const [shares, setShares] = useState<IncomingShare[]>([]);
	const [txStatus, setTxStatus] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [stmtCache, setStmtCache] = useState<Map<string, Uint8Array>>(new Map());
	const [decryptedByKey, setDecryptedByKey] = useState<Record<string, DecryptedShare>>({});
	const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

	// Doctor key is a cryptographic inbox identity, not tied to any wallet.
	// Storage namespace is global ("doctor-skey:default") — not per-EVM-account.
	const doctorKey = useMemo(() => getOrCreateBuyerKey("doctor-skey:default"), []);

	useEffect(() => {
		const { unsubscribe } = subscribeStatements(wsUrl, setStmtCache);
		return unsubscribe;
	}, [wsUrl]);

	useEffect(() => {
		const stored = localStorage.getItem(storageKey);
		setContractAddress(stored ?? defaultAddress ?? "");
	}, [storageKey, defaultAddress]);

	function saveAddress(address: string) {
		setContractAddress(address);
		if (address) {
			localStorage.setItem(storageKey, address);
		} else {
			localStorage.removeItem(storageKey);
		}
	}

	const loadShares = useCallback(async () => {
		if (!contractAddress) {
			setTxStatus("Error: Enter a contract address first");
			return;
		}
		try {
			setLoading(true);
			setTxStatus(null);
			const client = getPublicClient(ethRpcUrl);
			const addr = contractAddress as Address;

			const code = await client.getCode({ address: addr });
			if (!code || code === "0x") {
				setShares([]);
				setTxStatus(
					`Error: No contract found at ${addr} on ${ethRpcUrl}. Enter a deployed MedicalMarket address.`,
				);
				return;
			}

			// Filter by doctorPkX only; the indexed topic1 narrows the server-side scan,
			// then filter locally on doctorPkY (non-indexed) for the full pubkey match.
			const logs = await client.getLogs({
				address: addr,
				event: recordSharedEvent,
				args: { doctorPkX: doctorKey.pk.x },
				fromBlock: 0n,
				toBlock: "latest",
			});

			const mine: IncomingShare[] = [];
			for (const l of logs) {
				const args = l.args;
				if (!args) continue;
				if (args.doctorPkY !== doctorKey.pk.y) continue;
				if (
					args.patient === undefined ||
					args.doctorPkX === undefined ||
					args.doctorPkY === undefined ||
					args.headerCommit === undefined ||
					args.bodyCommit === undefined ||
					args.medicPkX === undefined ||
					args.medicPkY === undefined ||
					args.sigR8x === undefined ||
					args.sigR8y === undefined ||
					args.sigS === undefined ||
					args.ephPkX === undefined ||
					args.ephPkY === undefined ||
					args.ciphertextHash === undefined ||
					args.title === undefined ||
					args.recordType === undefined ||
					args.recordedAt === undefined ||
					args.facility === undefined
				) {
					continue;
				}

				const header: MedicalHeader = {
					title: args.title,
					recordType: args.recordType,
					recordedAt: Number(args.recordedAt),
					facility: args.facility,
				};

				const { headerMatch, sigValid } = verifyShareOffChain(
					header,
					args.headerCommit,
					args.bodyCommit,
					{ x: args.medicPkX, y: args.medicPkY },
					{ R8x: args.sigR8x, R8y: args.sigR8y, S: args.sigS },
				);

				mine.push({
					patient: args.patient as Address,
					doctorPkX: args.doctorPkX,
					doctorPkY: args.doctorPkY,
					headerCommit: args.headerCommit,
					bodyCommit: args.bodyCommit,
					medicPkX: args.medicPkX,
					medicPkY: args.medicPkY,
					sigR8x: args.sigR8x,
					sigR8y: args.sigR8y,
					sigS: args.sigS,
					ephPkX: args.ephPkX,
					ephPkY: args.ephPkY,
					ciphertextHash: args.ciphertextHash,
					header,
					blockNumber: l.blockNumber ?? 0n,
					logIndex: l.logIndex ?? 0,
					txHash: l.transactionHash ?? "0x",
					headerMatch,
					sigValid,
				});
			}

			mine.sort((a, b) =>
				a.blockNumber < b.blockNumber ? 1 : a.blockNumber > b.blockNumber ? -1 : 0,
			);
			setShares(mine);
			if (mine.length === 0) {
				setTxStatus("No incoming shares found for your doctor pubkey yet.");
			}
		} catch (e) {
			setTxStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
		} finally {
			setLoading(false);
		}
	}, [contractAddress, ethRpcUrl, doctorKey.pk.x, doctorKey.pk.y]);

	useEffect(() => {
		if (contractAddress) {
			loadShares();
		} else {
			setShares([]);
			setTxStatus(null);
		}
	}, [contractAddress, ethRpcUrl, loadShares]);

	const pkXHex = uint256ToHashHex(doctorKey.pk.x);
	const pkYHex = uint256ToHashHex(doctorKey.pk.y);

	async function copyPubkeyAsJson() {
		const payload = JSON.stringify({ x: pkXHex, y: pkYHex });
		try {
			await navigator.clipboard.writeText(payload);
			setCopyFeedback("Copied");
			setTimeout(() => setCopyFeedback(null), 2000);
		} catch {
			setCopyFeedback("Copy failed");
			setTimeout(() => setCopyFeedback(null), 2000);
		}
	}

	function handleDecrypted(key: string, result: DecryptedShare) {
		setDecryptedByKey((prev) => ({ ...prev, [key]: result }));
	}

	return (
		<div className="space-y-6 animate-fade-in">
			<div className="space-y-2">
				<h1 className="page-title text-accent-blue">Doctor inbox</h1>
				<p className="text-text-secondary">Incoming encrypted records shared with you.</p>
			</div>

			<div className="card space-y-4">
				<div>
					<label className="label">MedicalMarket Contract Address</label>
					<div className="flex gap-2">
						<input
							type="text"
							value={contractAddress}
							onChange={(e) => saveAddress(e.target.value)}
							placeholder="0x..."
							className="input-field w-full"
						/>
						{defaultAddress && contractAddress !== defaultAddress && (
							<button
								onClick={() => saveAddress(defaultAddress)}
								className="btn-secondary text-xs whitespace-nowrap"
							>
								Reset
							</button>
						)}
					</div>
				</div>

				<Toast message={txStatus} onClose={() => setTxStatus(null)} />
			</div>

			<div className="card space-y-3">
				<div className="flex items-center justify-between gap-2 flex-wrap">
					<h2 className="section-title">Your doctor pubkey (BabyJubJub)</h2>
					<div className="flex items-center gap-2">
						{copyFeedback && (
							<span className="text-xs text-accent-green">{copyFeedback}</span>
						)}
						<button
							onClick={copyPubkeyAsJson}
							className="btn-secondary text-xs whitespace-nowrap"
						>
							Copy as JSON
						</button>
					</div>
				</div>
				<div className="space-y-1">
					<p className="font-mono text-xs text-text-secondary break-all">
						<span className="text-text-tertiary">x:</span> {pkXHex}{" "}
						<span className="text-text-muted">({truncateHex(pkXHex)})</span>
					</p>
					<p className="font-mono text-xs text-text-secondary break-all">
						<span className="text-text-tertiary">y:</span> {pkYHex}{" "}
						<span className="text-text-muted">({truncateHex(pkYHex)})</span>
					</p>
				</div>
				<p className="text-text-tertiary text-xs">
					Send this to patients out-of-band (email/SMS/QR). Anyone with this key can send
					you encrypted records; only your browser can decrypt.
				</p>
				<p className="text-text-muted text-[10px]">
					Secret key stored in this browser at{" "}
					<span className="font-mono">doctor-skey:default</span>.
				</p>
			</div>

			<div className="card space-y-4">
				<div className="flex items-center justify-between">
					<h2 className="section-title">Incoming shares</h2>
					<button
						onClick={loadShares}
						disabled={loading}
						className="btn-secondary text-xs"
					>
						{loading ? "Loading..." : "Refresh"}
					</button>
				</div>

				{shares.length === 0 ? (
					<p className="text-text-secondary text-sm">
						No shares yet. When a patient shares a record with your pubkey, it will
						appear here.
					</p>
				) : (
					<div className="space-y-2">
						{shares.map((share) => {
							const key = `${share.txHash}:${share.logIndex}`;
							return (
								<IncomingShareCard
									key={key}
									share={share}
									stmtCache={stmtCache}
									skDoctor={doctorKey.sk}
									onDecrypted={handleDecrypted}
									decrypted={decryptedByKey[key]}
								/>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);
}
