import { useState, useCallback, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { type Address } from "viem";
import { medicalMarketAbi, getPublicClient } from "../config/evm";
import Spinner from "../components/Spinner";
import Toast from "../components/Toast";
import { getDeploymentForRpc } from "../config/network";
import {
	submitStatement,
	checkStatementStoreAvailable,
	MARKETPLACE_ACCOUNT_ID,
} from "../hooks/useStatementStore";
import { blake2b } from "blakejs";
import { useReviveCall } from "../hooks/useReviveCall";
import { useChainStore } from "../store/chainStore";
import FileDropZone from "../components/FileDropZone";
import { type SignedRecord, encryptRecordForBuyer } from "../utils/zk";

// BN254 scalar-field prime — upper bound for BabyJubJub point coordinates.
const BN254_R = BigInt(
	"21888242871839275222246405745257275088548364400416034343698204186575808495617",
);

interface KnownDoctor {
	pkX: bigint;
	pkY: bigint;
	firstListingId: bigint;
	firstListingTitle: string;
}

function formatRecordedAt(unixSeconds: number): string {
	return new Date(unixSeconds * 1000).toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

function truncatePk(x: bigint): string {
	const hex = x.toString(16).padStart(64, "0");
	return `0x${hex.slice(0, 6)}…${hex.slice(-4)}`;
}

function parseScalar(raw: string): bigint | null {
	const trimmed = raw.trim();
	if (!trimmed) return null;
	try {
		const n =
			trimmed.startsWith("0x") || trimmed.startsWith("0X")
				? BigInt(trimmed)
				: BigInt(trimmed);
		if (n < 0n || n >= BN254_R) return null;
		return n;
	} catch {
		return null;
	}
}

function parseRecipientJson(raw: string): { x: bigint; y: bigint } | { error: string } {
	const trimmed = raw.trim();
	if (!trimmed) return { error: "" };
	let parsed: unknown;
	try {
		parsed = JSON.parse(trimmed);
	} catch {
		return { error: "Could not parse as JSON." };
	}
	if (typeof parsed !== "object" || parsed === null) {
		return { error: 'Expected an object like {"x":"0x…","y":"0x…"}.' };
	}
	const obj = parsed as Record<string, unknown>;
	const xRaw = obj.x;
	const yRaw = obj.y;
	if (typeof xRaw !== "string" || typeof yRaw !== "string") {
		return { error: "Both x and y must be strings (hex or decimal)." };
	}
	const x = parseScalar(xRaw);
	const y = parseScalar(yRaw);
	if (x === null || y === null) {
		return { error: "x and y must be valid scalars in [0, BN254_R)." };
	}
	return { x, y };
}

type RecipientMode = "known" | "paste";

interface KnownDoctorsListProps {
	doctors: KnownDoctor[];
	loading: boolean;
	selected: { x: bigint; y: bigint } | null;
	onSelect: (doctor: KnownDoctor) => void;
	onRefresh: () => void;
}

function KnownDoctorsList({
	doctors,
	loading,
	selected,
	onSelect,
	onRefresh,
}: KnownDoctorsListProps) {
	if (doctors.length === 0) {
		return (
			<div className="space-y-2">
				<p className="text-text-secondary text-sm">
					{loading
						? "Loading doctors from on-chain listings…"
						: "No medic pubkeys discovered on-chain yet. Use Paste pubkey instead, or click Refresh after the medic signs a listing."}
				</p>
				<button onClick={onRefresh} disabled={loading} className="btn-secondary text-xs">
					{loading ? "Loading..." : "Refresh"}
				</button>
			</div>
		);
	}
	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between">
				<p className="text-text-tertiary text-xs">
					{doctors.length} unique medic pubkey{doctors.length === 1 ? "" : "s"} found
					on-chain
				</p>
				<button onClick={onRefresh} disabled={loading} className="btn-secondary text-xs">
					{loading ? "Loading..." : "Refresh"}
				</button>
			</div>
			<div className="space-y-1.5">
				{doctors.map((d) => {
					const isSelected =
						selected !== null && selected.x === d.pkX && selected.y === d.pkY;
					return (
						<button
							key={d.pkX.toString()}
							onClick={() => onSelect(d)}
							className={`w-full text-left rounded-lg border p-3 text-sm transition-colors ${
								isSelected
									? "border-polka-500/60 bg-polka-500/[0.08]"
									: "border-white/[0.04] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.04]"
							}`}
						>
							<div className="flex items-center justify-between gap-2">
								<p className="font-mono text-xs text-text-primary">
									{truncatePk(d.pkX)}
								</p>
								{isSelected && (
									<span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-polka-500/10 text-polka-400">
										selected
									</span>
								)}
							</div>
							<p className="text-text-muted text-xs mt-1">
								Signed listing #{d.firstListingId.toString()}: {d.firstListingTitle}
							</p>
						</button>
					);
				})}
			</div>
		</div>
	);
}

export default function ShareWithDoctor() {
	const location = useLocation();
	const ethRpcUrl = useChainStore((s) => s.ethRpcUrl);
	const wsUrl = useChainStore((s) => s.wsUrl);

	const storageKey = `medical-market-address:${ethRpcUrl}`;
	const defaultAddress = getDeploymentForRpc(ethRpcUrl).medicalMarket;

	const accounts = useChainStore((s) => s.accounts);
	const selectedAccountIndex = useChainStore((s) => s.selectedAccountIndex);
	const [contractAddress, setContractAddress] = useState("");
	const [fileBytes, setFileBytes] = useState<Uint8Array | null>(null);
	const [importedPackage, setImportedPackage] = useState<SignedRecord | null>(null);
	const [packageParseError, setPackageParseError] = useState<string | null>(null);
	const [statementStoreAvailable, setStatementStoreAvailable] = useState<boolean | null>(null);
	const [recipientMode, setRecipientMode] = useState<RecipientMode>("known");
	const [pasteRaw, setPasteRaw] = useState("");
	const [pasteError, setPasteError] = useState<string | null>(null);
	const [selectedRecipient, setSelectedRecipient] = useState<{ x: bigint; y: bigint } | null>(
		null,
	);
	const [knownDoctors, setKnownDoctors] = useState<KnownDoctor[]>([]);
	const [loadingDoctors, setLoadingDoctors] = useState(false);
	const [txStatus, setTxStatus] = useState<string | null>(null);
	const [sharing, setSharing] = useState(false);
	const [lastReceipt, setLastReceipt] = useState<{
		txHash: string;
		recipient: { x: bigint; y: bigint };
	} | null>(null);

	useEffect(() => {
		const state = location.state as { signedRecord?: SignedRecord; listingId?: string } | null;
		if (state?.signedRecord) setImportedPackage(state.signedRecord);
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

	useEffect(() => {
		const stored = localStorage.getItem(storageKey);
		setContractAddress(stored ?? defaultAddress ?? "");
	}, [storageKey, defaultAddress]);

	useEffect(() => {
		checkStatementStoreAvailable(wsUrl).then(setStatementStoreAvailable);
	}, [wsUrl]);

	function saveAddress(address: string) {
		setContractAddress(address);
		if (address) {
			localStorage.setItem(storageKey, address);
		} else {
			localStorage.removeItem(storageKey);
		}
	}

	const onFileBytes = useCallback((bytes: Uint8Array) => {
		setFileBytes(bytes);
		setPackageParseError(null);
		try {
			const json: unknown = JSON.parse(new TextDecoder().decode(bytes));
			if (
				typeof json === "object" &&
				json !== null &&
				"version" in json &&
				(json as Record<string, unknown>).version === "v3-record" &&
				"header" in json &&
				"body" in json &&
				"headerCommit" in json &&
				"bodyCommit" in json &&
				"recordCommit" in json &&
				"signature" in json
			) {
				setImportedPackage(json as SignedRecord);
			} else {
				setImportedPackage(null);
				setPackageParseError(
					"Not a valid v3 signed record. Use the Medic Signing Tool to produce one.",
				);
			}
		} catch {
			setImportedPackage(null);
			setPackageParseError("Could not parse file as JSON.");
		}
	}, []);

	const currentAccount = accounts[selectedAccountIndex] ?? accounts[0];

	const reviveCall = useReviveCall({
		account: currentAccount,
		contractAddress,
		wsUrl,
		onStatus: setTxStatus,
	});

	const loadKnownDoctors = useCallback(async () => {
		if (!contractAddress) return;
		try {
			setLoadingDoctors(true);
			const client = getPublicClient(ethRpcUrl);
			const addr = contractAddress as Address;

			const code = await client.getCode({ address: addr });
			if (!code || code === "0x") {
				setKnownDoctors([]);
				return;
			}

			const listingCount = (await client.readContract({
				address: addr,
				abi: medicalMarketAbi,
				functionName: "getListingCount",
			})) as bigint;

			const seen = new Map<string, KnownDoctor>();
			for (let i = 0n; i < listingCount; i++) {
				const result = (await client.readContract({
					address: addr,
					abi: medicalMarketAbi,
					functionName: "getListing",
					args: [i],
				})) as readonly [
					bigint,
					bigint,
					bigint,
					bigint,
					bigint,
					bigint,
					bigint,
					bigint,
					string,
					boolean,
				];
				const medicPkX = result[2];
				const medicPkY = result[3];
				const key = medicPkX.toString();
				if (seen.has(key)) continue;

				const headerTuple = (await client.readContract({
					address: addr,
					abi: medicalMarketAbi,
					functionName: "getListingHeader",
					args: [i],
				})) as readonly [string, string, bigint, string];

				seen.set(key, {
					pkX: medicPkX,
					pkY: medicPkY,
					firstListingId: i,
					firstListingTitle: headerTuple[0],
				});
			}
			setKnownDoctors(Array.from(seen.values()));
		} catch (e) {
			setTxStatus(`Error loading doctors: ${e instanceof Error ? e.message : String(e)}`);
		} finally {
			setLoadingDoctors(false);
		}
	}, [contractAddress, ethRpcUrl]);

	useEffect(() => {
		if (contractAddress) {
			loadKnownDoctors();
		} else {
			setKnownDoctors([]);
		}
	}, [contractAddress, loadKnownDoctors]);

	function handleSelectKnown(doctor: KnownDoctor) {
		setSelectedRecipient({ x: doctor.pkX, y: doctor.pkY });
	}

	function handlePasteChange(value: string) {
		setPasteRaw(value);
		if (!value.trim()) {
			setPasteError(null);
			setSelectedRecipient(null);
			return;
		}
		const parsed = parseRecipientJson(value);
		if ("error" in parsed) {
			setPasteError(parsed.error);
			setSelectedRecipient(null);
		} else {
			setPasteError(null);
			setSelectedRecipient(parsed);
		}
	}

	function switchMode(mode: RecipientMode) {
		setRecipientMode(mode);
		setSelectedRecipient(null);
		setPasteError(null);
		if (mode === "known") setPasteRaw("");
	}

	async function shareRecordWithDoctor() {
		if (!contractAddress) {
			setTxStatus("Error: Enter a contract address first");
			return;
		}
		if (!importedPackage) {
			setTxStatus("Error: Drop a medic-signed record first");
			return;
		}
		if (!selectedRecipient) {
			setTxStatus("Error: Select or paste a recipient pubkey");
			return;
		}
		if (statementStoreAvailable !== true) {
			setTxStatus(
				"Error: Statement Store unavailable. Switch the network to a local node (ws://localhost:9944) or use Nova Wallet.",
			);
			return;
		}

		try {
			setSharing(true);
			setLastReceipt(null);

			const client = getPublicClient(ethRpcUrl);
			const code = await client.getCode({ address: contractAddress as Address });
			if (!code || code === "0x") {
				setTxStatus(
					`Error: No contract found at ${contractAddress} on ${ethRpcUrl}. Deploy MedicalMarket first.`,
				);
				return;
			}

			setTxStatus("Encrypting record for doctor…");
			const plaintext = importedPackage.body.map(BigInt);
			const { ephPk, ciphertextBytes } = encryptRecordForBuyer({
				plaintext,
				pkBuyer: selectedRecipient,
				nonce: 0n,
			});

			const ciphertextHash32 = blake2b(ciphertextBytes, undefined, 32);
			let ciphertextHashBig = 0n;
			for (const b of ciphertextHash32)
				ciphertextHashBig = (ciphertextHashBig << 8n) | BigInt(b);

			setTxStatus("Uploading ciphertext to Statement Store…");
			const stmtSigner = currentAccount.localSigner;
			await submitStatement(
				wsUrl,
				ciphertextBytes,
				ciphertextHash32,
				MARKETPLACE_ACCOUNT_ID,
				stmtSigner?.publicKey,
				stmtSigner?.signBytes,
			);

			setTxStatus("Submitting shareRecord on-chain…");
			const headerInput = {
				title: importedPackage.header.title,
				recordType: importedPackage.header.recordType,
				recordedAt: BigInt(importedPackage.header.recordedAt),
				facility: importedPackage.header.facility,
			};
			const { txHash } = await reviveCall("shareRecord", [
				headerInput,
				BigInt(importedPackage.headerCommit),
				BigInt(importedPackage.bodyCommit),
				BigInt(importedPackage.medicPublicKey.x),
				BigInt(importedPackage.medicPublicKey.y),
				BigInt(importedPackage.signature.R8x),
				BigInt(importedPackage.signature.R8y),
				BigInt(importedPackage.signature.S),
				selectedRecipient.x,
				selectedRecipient.y,
				ephPk.x,
				ephPk.y,
				ciphertextHashBig,
			]);

			setTxStatus(`Shared. Tx: ${txHash}`);
			setLastReceipt({ txHash, recipient: selectedRecipient });
			// Clear the recipient so the patient can share again with someone else,
			// but keep the imported package in state for one-shot reuse.
			setSelectedRecipient(null);
			setPasteRaw("");
			setPasteError(null);
		} catch (e) {
			setTxStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
		} finally {
			setSharing(false);
		}
	}

	const canShare =
		!!contractAddress &&
		!!importedPackage &&
		!!selectedRecipient &&
		statementStoreAvailable === true &&
		!!currentAccount &&
		!sharing;

	return (
		<div className="space-y-6 animate-fade-in">
			<div className="space-y-2">
				<h1 className="page-title text-polka-500">Share with a doctor</h1>
				<p className="text-text-secondary">
					Free, end-to-end-encrypted delivery of a medic-signed record to a doctor's
					BabyJubJub pubkey — no payment, no listing. The doctor's inbox decrypts it with
					their private key.
				</p>
			</div>

			{statementStoreAvailable === null && (
				<div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-text-muted">
					Checking Statement Store availability…
				</div>
			)}
			{statementStoreAvailable === false && (
				<div className="rounded-lg border border-accent-red/30 bg-accent-red/[0.06] px-4 py-3 text-sm text-accent-red">
					Statement Store unavailable on this network. Sharing requires a local node
					(switch to ws://localhost:9944 in network settings) or Nova Wallet.
				</div>
			)}

			<div className="card space-y-4">
				<h2 className="section-title">Contract Setup</h2>

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

				<div>
					<label className="label">Account (Patient)</label>
					<div className="input-field w-full text-sm text-text-secondary">
						{accounts[selectedAccountIndex]?.name ?? "—"}{" "}
						<span className="font-mono text-xs text-text-muted">
							{accounts[selectedAccountIndex]?.evmAddress ?? ""}
						</span>
					</div>
				</div>
			</div>

			<div className="card space-y-4">
				<h2 className="section-title">Record</h2>
				<p className="text-text-muted text-xs">
					Drop a v3 medic-signed record (downloaded from the Medic Signing Tool). The
					record stays local until you pick a recipient and click Share.
				</p>

				{(location.state as { listingId?: string } | null)?.listingId &&
					importedPackage && (
						<p className="text-xs text-polka-400 font-medium">
							Pre-loaded from Listing #
							{(location.state as { listingId: string }).listingId}
						</p>
					)}

				{!importedPackage ? (
					<>
						<FileDropZone
							onFileHashed={() => {}}
							onFileBytes={onFileBytes}
							showUploadToggle={false}
							uploadToIpfs={false}
							onUploadToggle={() => {}}
							showStatementStoreToggle={false}
							uploadToStatementStore={false}
							onStatementStoreToggle={() => {}}
							statementStoreDisabled={statementStoreAvailable !== true}
						/>
						{packageParseError && (
							<p className="text-accent-red text-xs">{packageParseError}</p>
						)}
					</>
				) : (
					<div className="space-y-2">
						<div className="rounded-lg border border-accent-green/20 bg-accent-green/[0.04] p-3 space-y-1.5 text-xs">
							<p className="text-accent-green font-medium">Signed record loaded</p>
							<div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-text-secondary">
								<span className="text-text-tertiary">Title</span>
								<span className="text-text-primary">
									{importedPackage.header.title}
								</span>
								<span className="text-text-tertiary">Type</span>
								<span>{importedPackage.header.recordType}</span>
								<span className="text-text-tertiary">Date</span>
								<span>{formatRecordedAt(importedPackage.header.recordedAt)}</span>
								<span className="text-text-tertiary">Facility</span>
								<span>{importedPackage.header.facility}</span>
							</div>
							<p className="text-text-muted">
								{Object.keys(importedPackage.bodyFieldsPreview).length} body fields
								· signed {new Date(importedPackage.signedAt).toLocaleString()}
							</p>
						</div>
						<button
							onClick={() => {
								setImportedPackage(null);
								setFileBytes(null);
								setPackageParseError(null);
							}}
							className="btn-secondary text-xs"
						>
							Change record
						</button>
					</div>
				)}
				{/* fileBytes is tracked only so we can clear it alongside importedPackage; keep
				    a harmless reference to satisfy strict unused-var checks when present. */}
				{fileBytes && null}
			</div>

			<div className="card space-y-4">
				<h2 className="section-title">Recipient</h2>

				<div className="flex gap-2">
					<button
						onClick={() => switchMode("known")}
						className={`btn-secondary text-xs ${
							recipientMode === "known"
								? "ring-1 ring-polka-500/50 text-text-primary"
								: ""
						}`}
					>
						Known doctors
					</button>
					<button
						onClick={() => switchMode("paste")}
						className={`btn-secondary text-xs ${
							recipientMode === "paste"
								? "ring-1 ring-polka-500/50 text-text-primary"
								: ""
						}`}
					>
						Paste pubkey
					</button>
				</div>

				{recipientMode === "known" ? (
					<KnownDoctorsList
						doctors={knownDoctors}
						loading={loadingDoctors}
						selected={selectedRecipient}
						onSelect={handleSelectKnown}
						onRefresh={loadKnownDoctors}
					/>
				) : (
					<div className="space-y-2">
						<label className="label">
							Doctor pubkey JSON (from the doctor's inbox &quot;Copy as JSON&quot;)
						</label>
						<textarea
							value={pasteRaw}
							onChange={(e) => handlePasteChange(e.target.value)}
							placeholder='{"x":"0x...","y":"0x..."}'
							rows={4}
							className="input-field w-full font-mono text-xs"
						/>
						{pasteError && <p className="text-accent-red text-xs">{pasteError}</p>}
						{selectedRecipient && !pasteError && (
							<div className="rounded-lg border border-accent-green/20 bg-accent-green/[0.04] p-2 text-xs text-accent-green">
								<p className="font-medium">Recipient parsed</p>
								<p className="font-mono text-text-secondary mt-1 break-all">
									x: {truncatePk(selectedRecipient.x)}
								</p>
								<p className="font-mono text-text-secondary break-all">
									y: {truncatePk(selectedRecipient.y)}
								</p>
							</div>
						)}
					</div>
				)}
			</div>

			<div className="card space-y-3">
				<h2 className="section-title">Share</h2>
				<p className="text-text-muted text-xs">
					Encrypts the body for the selected pubkey via ECDH + Poseidon stream cipher,
					uploads the ciphertext to the Statement Store, and emits an on-chain{" "}
					<span className="font-mono">RecordShared</span> event so the doctor's inbox can
					find it.
				</p>

				<button
					onClick={shareRecordWithDoctor}
					disabled={!canShare}
					className="btn-accent disabled:opacity-60 disabled:cursor-not-allowed"
					style={{
						background: "linear-gradient(135deg, #e6007a 0%, #bc0062 100%)",
						boxShadow: "0 1px 2px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)",
					}}
				>
					{sharing ? (
						<>
							<Spinner />
							{txStatus ?? "Sharing…"}
						</>
					) : (
						"Share encrypted"
					)}
				</button>

				<Toast message={txStatus} onClose={() => setTxStatus(null)} />

				{lastReceipt && (
					<div className="rounded-lg border border-accent-green/20 bg-accent-green/[0.04] p-3 text-xs space-y-1">
						<p className="text-accent-green font-medium">Shared successfully</p>
						<p className="text-text-secondary break-all">
							<span className="text-text-tertiary">Tx:</span>{" "}
							<span className="font-mono">{lastReceipt.txHash}</span>
						</p>
						<p className="text-text-secondary">
							<span className="text-text-tertiary">Recipient pubkey:</span>{" "}
							<span className="font-mono">{truncatePk(lastReceipt.recipient.x)}</span>
						</p>
					</div>
				)}
			</div>
		</div>
	);
}
