import { useState, useCallback, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { type Address, hexToBytes, bytesToHex } from "viem";
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
import { type SignedRecord, encryptRecordForBuyer, pubKeyToAddress } from "../utils/zk";

function formatRecordedAt(unixSeconds: number): string {
	return new Date(unixSeconds * 1000).toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

function truncatePk(hex: string): string {
	return `${hex.slice(0, 8)}…${hex.slice(-4)}`;
}

// Parse the JSON copied from DoctorInbox "Copy as JSON": {address, pubKey}
// or a bare 0x-prefixed hex compressed pubkey (66 hex chars = 33 bytes).
function parseRecipientInput(raw: string): { pubKeyHex: `0x${string}` } | { error: string } {
	const trimmed = raw.trim();
	if (!trimmed) return { error: "" };

	// Try as JSON first
	if (trimmed.startsWith("{")) {
		let parsed: unknown;
		try {
			parsed = JSON.parse(trimmed);
		} catch {
			return { error: "Could not parse as JSON." };
		}
		if (typeof parsed !== "object" || parsed === null) {
			return { error: 'Expected {"address":"0x…","pubKey":"0x…"}.' };
		}
		const obj = parsed as Record<string, unknown>;
		const pubKeyRaw = obj.pubKey;
		if (typeof pubKeyRaw !== "string") {
			return { error: '"pubKey" field (string) is required.' };
		}
		return validatePubKeyHex(pubKeyRaw);
	}

	// Try as bare hex
	return validatePubKeyHex(trimmed);
}

function validatePubKeyHex(raw: string): { pubKeyHex: `0x${string}` } | { error: string } {
	const h = raw.startsWith("0x") || raw.startsWith("0X") ? raw.slice(2) : raw;
	if (!/^[0-9a-fA-F]{66}$/.test(h)) {
		return { error: "Expected a 33-byte compressed secp256k1 pubkey (0x + 66 hex chars)." };
	}
	const prefix = parseInt(h.slice(0, 2), 16);
	if (prefix !== 0x02 && prefix !== 0x03) {
		return { error: "Compressed pubkey must start with 02 or 03." };
	}
	return { pubKeyHex: `0x${h}` as `0x${string}` };
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
	const [pasteRaw, setPasteRaw] = useState("");
	const [pasteError, setPasteError] = useState<string | null>(null);
	const [selectedPubKeyHex, setSelectedPubKeyHex] = useState<`0x${string}` | null>(null);
	const [txStatus, setTxStatus] = useState<string | null>(null);
	const [sharing, setSharing] = useState(false);
	const [lastReceipt, setLastReceipt] = useState<{
		txHash: string;
		recipientPubKey: string;
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
				(json as Record<string, unknown>).version === "v4-record" &&
				"header" in json &&
				"body" in json &&
				"headerCommit" in json &&
				"bodyCommit" in json &&
				"recordCommit" in json &&
				"medicAddress" in json &&
				"medicSignature" in json
			) {
				setImportedPackage(json as SignedRecord);
			} else {
				setImportedPackage(null);
				setPackageParseError(
					"Not a valid v4 signed record. Use the Medic Signing Tool to produce one.",
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

	// Verify contract exists on load
	useEffect(() => {
		if (!contractAddress) return;
		const client = getPublicClient(ethRpcUrl);
		client.getCode({ address: contractAddress as Address }).then((code) => {
			if (!code || code === "0x") {
				setTxStatus(`Warning: No contract found at ${contractAddress} on ${ethRpcUrl}.`);
			} else {
				setTxStatus(null);
			}
		});
		void medicalMarketAbi;
	}, [contractAddress, ethRpcUrl]);

	function handlePasteChange(value: string) {
		setPasteRaw(value);
		if (!value.trim()) {
			setPasteError(null);
			setSelectedPubKeyHex(null);
			return;
		}
		const parsed = parseRecipientInput(value);
		if ("error" in parsed) {
			setPasteError(parsed.error || null);
			setSelectedPubKeyHex(null);
		} else {
			setPasteError(null);
			setSelectedPubKeyHex(parsed.pubKeyHex);
		}
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
		if (!selectedPubKeyHex) {
			setTxStatus("Error: Paste a valid doctor pubkey first");
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
			const buyerCompressedPubKey = hexToBytes(selectedPubKeyHex);
			const { ephPubKey, ciphertextBytes } = await encryptRecordForBuyer({
				plaintext,
				buyerCompressedPubKey,
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

			const doctorAddress = pubKeyToAddress(buyerCompressedPubKey);
			const ephPubKeyHex = bytesToHex(ephPubKey);

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
				BigInt(importedPackage.piiCommit ?? "0"),
				importedPackage.medicAddress as Address,
				importedPackage.medicSignature as `0x${string}`,
				doctorAddress,
				ephPubKeyHex,
				ciphertextHashBig,
			]);

			setTxStatus(`Shared. Tx: ${txHash}`);
			setLastReceipt({ txHash, recipientPubKey: selectedPubKeyHex });
			setSelectedPubKeyHex(null);
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
		!!selectedPubKeyHex &&
		statementStoreAvailable === true &&
		!!currentAccount &&
		!sharing;

	return (
		<div className="space-y-6 animate-fade-in">
			<div className="space-y-2">
				<h1 className="page-title text-polka-500">Share with a doctor</h1>
				<p className="text-text-secondary">
					Free, end-to-end-encrypted delivery of a medic-signed record to a doctor's
					secp256k1 pubkey — no payment, no listing. The doctor's inbox decrypts it with
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
					Drop a v4 medic-signed record (downloaded from the Medic Signing Tool). The
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
								<span className="text-text-tertiary">Medic</span>
								<span className="font-mono break-all">
									{importedPackage.medicAddress}
								</span>
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
				{fileBytes && null}
			</div>

			<div className="card space-y-4">
				<h2 className="section-title">Recipient</h2>
				<p className="text-text-muted text-xs">
					Paste the doctor's compressed secp256k1 pubkey (33 bytes, 0x + 66 hex chars) or
					the full JSON from their inbox "Copy as JSON" button.
				</p>

				<div className="space-y-2">
					<label className="label">Doctor pubkey</label>
					<textarea
						value={pasteRaw}
						onChange={(e) => handlePasteChange(e.target.value)}
						placeholder={'{"address":"0x…","pubKey":"0x02…"}\nor paste pubKey directly'}
						rows={3}
						className="input-field w-full font-mono text-xs"
					/>
					{pasteError && <p className="text-accent-red text-xs">{pasteError}</p>}
					{selectedPubKeyHex && !pasteError && (
						<div className="rounded-lg border border-accent-green/20 bg-accent-green/[0.04] p-2 text-xs text-accent-green">
							<p className="font-medium">Recipient parsed</p>
							<p className="font-mono text-text-secondary mt-1 break-all">
								pubKey: {truncatePk(selectedPubKeyHex)}
							</p>
							<p className="font-mono text-text-secondary break-all">
								address: {pubKeyToAddress(hexToBytes(selectedPubKeyHex))}
							</p>
						</div>
					)}
				</div>
			</div>

			<div className="card space-y-3">
				<h2 className="section-title">Share</h2>
				<p className="text-text-muted text-xs">
					Encrypts the body for the selected pubkey via ECDH + AES-256-GCM, uploads the
					ciphertext to the Statement Store, and emits an on-chain{" "}
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
							<span className="font-mono">
								{truncatePk(lastReceipt.recipientPubKey)}
							</span>
						</p>
					</div>
				)}
			</div>
		</div>
	);
}
