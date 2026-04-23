import { useState, useEffect, useCallback, useMemo } from "react";
import { type Address, parseAbiItem, verifyMessage, toBytes, hexToBytes } from "viem";
import { getPublicClient } from "../config/evm";
import Toast from "../components/Toast";
import { getDeploymentForRpc } from "../config/network";
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

// ---------------------------------------------------------------------------
// Helpers
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

async function verifyShareOffChain(
	header: MedicalHeader,
	headerCommit: bigint,
	bodyCommit: bigint,
	piiCommit: bigint,
	medicAddress: Address,
	medicSignature: `0x${string}`,
): Promise<{ headerMatch: boolean; sigValid: boolean }> {
	let headerMatch = false;
	try {
		headerMatch = computeHeaderCommit(header) === headerCommit;
	} catch {
		headerMatch = false;
	}
	let sigValid = false;
	try {
		const recordCommit = computeRecordCommit(headerCommit, bodyCommit, piiCommit);
		sigValid = await verifyMessage({
			address: medicAddress,
			message: { raw: toBytes(recordCommit, { size: 32 }) },
			signature: medicSignature,
		});
	} catch {
		sigValid = false;
	}
	return { headerMatch, sigValid };
}

// ---------------------------------------------------------------------------
// Event parsing
// ---------------------------------------------------------------------------

const recordSharedEvent = parseAbiItem(
	"event RecordShared(address indexed patient, address indexed doctorAddress, uint256 headerCommit, uint256 bodyCommit, uint256 piiCommit, address medicAddress, bytes medicSignature, bytes ephPubKey, uint256 ciphertextHash, string title, string recordType, uint64 recordedAt, string facility)",
);

interface IncomingShare {
	patient: Address;
	doctorAddress: Address;
	headerCommit: bigint;
	bodyCommit: bigint;
	piiCommit: bigint;
	medicAddress: Address;
	medicSignature: `0x${string}`;
	ephPubKey: `0x${string}`;
	ciphertextHash: bigint;
	header: MedicalHeader;
	blockNumber: bigint;
	logIndex: number;
	txHash: string;
	headerMatch: boolean;
	sigValid: boolean;
}

interface DecryptedShare {
	fields: Record<string, string>;
	bodyMatch: boolean;
	sigValid: boolean;
}

// ---------------------------------------------------------------------------
// Chip component
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
// Per-share card
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
	skDoctor: Uint8Array;
	onDecrypted: (key: string, result: DecryptedShare) => void;
	decrypted: DecryptedShare | undefined;
}) {
	const [expanded, setExpanded] = useState(false);
	const [localStatus, setLocalStatus] = useState<string | null>(null);

	const medicVerified = share.headerMatch && share.sigValid;
	const cacheKey = useMemo(() => uint256ToHashHex(share.ciphertextHash), [share.ciphertextHash]);
	const storeKey = `${share.txHash}:${share.logIndex}`;

	const tryDecrypt = useCallback(async () => {
		const matched = stmtCache.get(cacheKey);
		if (!matched) {
			setLocalStatus("Waiting for ciphertext in Statement Store…");
			return;
		}
		try {
			setLocalStatus("Decrypting record…");
			const ephCompressedPubKey = hexToBytes(share.ephPubKey);
			const fields = await decryptRecord({
				ephCompressedPubKey,
				ciphertextBytes: matched,
				skBuyer: skDoctor,
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
		share.ephPubKey,
		share.bodyCommit,
		share.sigValid,
		onDecrypted,
		storeKey,
	]);

	useEffect(() => {
		if (!expanded) return;
		if (decrypted) return;
		if (!stmtCache.get(cacheKey)) return;
		void tryDecrypt(); // eslint-disable-line react-hooks/set-state-in-effect
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
	const defaultAddress = getDeploymentForRpc(ethRpcUrl).medicalMarket;

	const [contractAddress, setContractAddress] = useState("");
	const [shares, setShares] = useState<IncomingShare[]>([]);
	const [txStatus, setTxStatus] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [stmtCache, setStmtCache] = useState<Map<string, Uint8Array>>(new Map());
	const [decryptedByKey, setDecryptedByKey] = useState<Record<string, DecryptedShare>>({});
	const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

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

			const logs = await client.getLogs({
				address: addr,
				event: recordSharedEvent,
				fromBlock: 0n,
				toBlock: "latest",
			});

			const mine: IncomingShare[] = [];
			for (const l of logs) {
				const args = l.args;
				if (!args) continue;
				if (args.doctorAddress?.toLowerCase() !== doctorKey.address.toLowerCase()) continue;
				if (
					args.patient === undefined ||
					args.doctorAddress === undefined ||
					args.headerCommit === undefined ||
					args.bodyCommit === undefined ||
					args.piiCommit === undefined ||
					args.medicAddress === undefined ||
					args.medicSignature === undefined ||
					args.ephPubKey === undefined ||
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

				const { headerMatch, sigValid } = await verifyShareOffChain(
					header,
					args.headerCommit,
					args.bodyCommit,
					args.piiCommit,
					args.medicAddress as Address,
					args.medicSignature as `0x${string}`,
				);

				mine.push({
					patient: args.patient as Address,
					doctorAddress: args.doctorAddress as Address,
					headerCommit: args.headerCommit,
					bodyCommit: args.bodyCommit,
					piiCommit: args.piiCommit,
					medicAddress: args.medicAddress as Address,
					medicSignature: args.medicSignature as `0x${string}`,
					ephPubKey: args.ephPubKey as `0x${string}`,
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
				setTxStatus("No incoming shares found for your doctor address yet.");
			}
		} catch (e) {
			setTxStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
		} finally {
			setLoading(false);
		}
	}, [contractAddress, ethRpcUrl, doctorKey.address]);

	useEffect(() => {
		if (contractAddress) {
			loadShares();
		} else {
			setShares([]);
			setTxStatus(null);
		}
	}, [contractAddress, ethRpcUrl, loadShares]);

	async function copyPubkeyAsJson() {
		const payload = JSON.stringify({ address: doctorKey.address, pubKey: doctorKey.pkHex });
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
					<h2 className="section-title">Your doctor key (secp256k1)</h2>
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
						<span className="text-text-tertiary">address:</span> {doctorKey.address}
					</p>
					<p className="font-mono text-xs text-text-secondary break-all">
						<span className="text-text-tertiary">pubKey:</span> {doctorKey.pkHex}
					</p>
				</div>
				<p className="text-text-tertiary text-xs">
					Send this to patients out-of-band (email/SMS/QR). Anyone with your pubKey can
					send you encrypted records; only your browser can decrypt.
				</p>
				<p className="text-text-muted text-[10px]">
					Secret key stored in this browser at{" "}
					<span className="font-mono">doctor-skey:default:secp256k1</span>.
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
