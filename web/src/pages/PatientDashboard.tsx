import { useState, useCallback, useEffect } from "react";
import { type Address, parseEther, formatEther, encodeFunctionData } from "viem";
import { Binary, FixedSizeBinary, type TxBestBlocksState } from "polkadot-api";
import { filter, firstValueFrom } from "rxjs";
import { blake2b } from "blakejs";
import { medicalMarketAbi, getPublicClient } from "../config/evm";
import VerifiedBadge from "../components/VerifiedBadge";
import { deployments } from "../config/deployments";
import {
	submitStatement,
	checkStatementStoreAvailable,
	MARKETPLACE_ACCOUNT_ID,
} from "../hooks/useStatementStore";
import { devAccounts, getAccountsWithFallback, type AppAccount } from "../hooks/useAccount";
import { getClient } from "../hooks/useChain";
import { getStackTemplateDescriptor } from "../hooks/useConnection";
import { useChainStore } from "../store/chainStore";
import { formatDispatchError } from "../utils/format";
import FileDropZone from "../components/FileDropZone";
import { type MerklePackage } from "../utils/zk";

// Maximum native balance we're willing to spend on storage deposits (100 tokens in planck).
const MAX_STORAGE_DEPOSIT = 100_000_000_000_000n;
// Generous weight limit for contract calls.
const CALL_WEIGHT = { ref_time: 3_000_000_000n, proof_size: 1_048_576n };
// pallet-revive: 1 planck = 10^6 EVM wei (for 12-decimal chains).
const WEI_TO_PLANCK = 1_000_000n;

interface SignedPackage {
	fields: Record<string, unknown>;
	merkleRoot: string;
	merkleTree: { leaves: string[]; depth: number };
	signature: { R8x: string; R8y: string; S: string };
	publicKey: { x: string; y: string };
	signedAt: string;
}

interface Listing {
	id: bigint;
	merkleRoot: `0x${string}`;
	title: string;
	price: bigint;
	patient: string;
	active: boolean;
	pendingOrderId: bigint;
}

function bytesToHex(bytes: Uint8Array): `0x${string}` {
	return ("0x" +
		Array.from(bytes)
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("")) as `0x${string}`;
}

function hexToBytes(hex: string): Uint8Array {
	const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
	const out = new Uint8Array(clean.length / 2);
	for (let i = 0; i < out.length; i++) {
		out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
	}
	return out;
}

async function encryptData(
	plaintext: Uint8Array,
): Promise<{ encrypted: Uint8Array; keyHex: `0x${string}` }> {
	const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
		"encrypt",
		"decrypt",
	]);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const ciphertextBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
	const ciphertext = new Uint8Array(ciphertextBuf);
	const encrypted = new Uint8Array(iv.length + ciphertext.length);
	encrypted.set(iv, 0);
	encrypted.set(ciphertext, iv.length);
	const rawKey = new Uint8Array(await crypto.subtle.exportKey("raw", key));
	return { encrypted, keyHex: bytesToHex(rawKey) };
}

export default function PatientDashboard() {
	const ethRpcUrl = useChainStore((s) => s.ethRpcUrl);
	const wsUrl = useChainStore((s) => s.wsUrl);

	const storageKey = `medical-market-address:${ethRpcUrl}`;
	const defaultAddress = (deployments as Record<string, string | null>).medicalMarket ?? null;

	const [accounts, setAccounts] = useState<AppAccount[]>(devAccounts);
	const [selectedAccountIndex, setSelectedAccountIndex] = useState(0);
	const [contractAddress, setContractAddress] = useState("");
	const [fileBytes, setFileBytes] = useState<Uint8Array | null>(null);
	const [importedPackage, setImportedPackage] = useState<SignedPackage | null>(null);
	const [packageParseError, setPackageParseError] = useState<string | null>(null);
	const [statementStoreAvailable, setStatementStoreAvailable] = useState<boolean | null>(null);
	const [titleStr, setTitleStr] = useState("");
	const [priceStr, setPriceStr] = useState("");
	const [listings, setListings] = useState<Listing[]>([]);
	const [txStatus, setTxStatus] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [selectedField, setSelectedField] = useState<string>("");

	// Load accounts: Nova Wallet → browser extension → dev fallback
	useEffect(() => {
		getAccountsWithFallback()
			.then(setAccounts)
			.catch(() => setAccounts(devAccounts));
	}, []);

	useEffect(() => {
		const stored = localStorage.getItem(storageKey);
		setContractAddress(stored ?? defaultAddress ?? "");
	}, [storageKey, defaultAddress]);

	useEffect(() => {
		checkStatementStoreAvailable(wsUrl).then(setStatementStoreAvailable);
	}, [wsUrl]);

	useEffect(() => {
		if (contractAddress) {
			loadListings();
		} else {
			setListings([]);
		}
	}, [contractAddress, ethRpcUrl]); // eslint-disable-line react-hooks/exhaustive-deps

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
				"merkleRoot" in json &&
				"fields" in json &&
				"signature" in json
			) {
				setImportedPackage(json as SignedPackage);
			} else {
				setImportedPackage(null);
				setPackageParseError(
					"Not a valid signed record. Use the Medic Signing Tool to produce one.",
				);
			}
		} catch {
			setImportedPackage(null);
			setPackageParseError("Could not parse file as JSON.");
		}
	}, []);

	const currentAccount = accounts[selectedAccountIndex] ?? accounts[0];

	async function verifyContract(): Promise<boolean> {
		const client = getPublicClient(ethRpcUrl);
		const code = await client.getCode({ address: contractAddress as Address });
		if (!code || code === "0x") {
			setTxStatus(
				`Error: No contract found at ${contractAddress} on ${ethRpcUrl}. Deploy MedicalMarket first.`,
			);
			return false;
		}
		return true;
	}

	/** Submit a write call to MedicalMarket via pallet-revive extrinsic (sr25519 signing). */
	async function reviveCall(
		functionName: string,
		args: readonly unknown[],
		valueWei: bigint = 0n,
	): Promise<{ txHash: string }> {
		const calldata = encodeFunctionData({
			abi: medicalMarketAbi,
			functionName,
			args,
		} as Parameters<typeof encodeFunctionData>[0]);

		const client = getClient(wsUrl);
		const descriptor = await getStackTemplateDescriptor();
		const api = client.getTypedApi(descriptor);

		// pallet-revive requires an AccountId32 ↔ H160 mapping before a contract call.
		// Dev accounts are pre-mapped via deployment; Nova Wallet accounts are not.
		const h160 = new FixedSizeBinary(
			hexToBytes(currentAccount.evmAddress),
		) as FixedSizeBinary<20>;
		const existingMapping = await api.query.Revive.OriginalAccount.getValue(h160);
		if (!existingMapping) {
			setTxStatus("Registering account with pallet-revive (one-time)...");
			await firstValueFrom(
				api.tx.Revive.map_account()
					.signSubmitAndWatch(currentAccount.signer)
					.pipe(
						filter(
							(e): e is TxBestBlocksState & { found: true } =>
								e.type === "txBestBlocksState" && "found" in e && e.found === true,
						),
					),
			);
		}

		// Resolve on best-chain inclusion rather than finalization — signAndSubmit waits
		// for GRANDPA which can hang indefinitely if the WS subscription drops.
		const result = await firstValueFrom(
			api.tx.Revive.call({
				dest: new FixedSizeBinary(hexToBytes(contractAddress)) as FixedSizeBinary<20>,
				value: valueWei / WEI_TO_PLANCK,
				weight_limit: CALL_WEIGHT,
				storage_deposit_limit: MAX_STORAGE_DEPOSIT,
				data: Binary.fromHex(calldata),
			})
				.signSubmitAndWatch(currentAccount.signer)
				.pipe(
					filter(
						(e): e is TxBestBlocksState & { found: true } =>
							e.type === "txBestBlocksState" && "found" in e && e.found === true,
					),
				),
		);

		if (!result.ok) {
			throw new Error(formatDispatchError(result.dispatchError));
		}
		return { txHash: result.txHash };
	}

	async function loadListings() {
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
				setListings([]);
				setTxStatus(
					`Error: No contract found at ${addr} on ${ethRpcUrl}. Deploy MedicalMarket first.`,
				);
				return;
			}

			const count = await client.readContract({
				address: addr,
				abi: medicalMarketAbi,
				functionName: "getListingCount",
			});

			const result: Listing[] = [];
			for (let i = 0n; i < count; i++) {
				const rawTuple = (await client.readContract({
					address: addr,
					abi: medicalMarketAbi,
					functionName: "getListing",
					args: [i],
				})) as readonly [`0x${string}`, `0x${string}`, string, bigint, string, boolean];

				const [merkleRoot, , title, price, patient, active] = rawTuple;

				if (patient.toLowerCase() !== currentAccount.evmAddress.toLowerCase()) continue;

				const pendingOrderId = await client.readContract({
					address: addr,
					abi: medicalMarketAbi,
					functionName: "getPendingOrderId",
					args: [i],
				});

				result.push({ id: i, merkleRoot, title, price, patient, active, pendingOrderId });
			}
			setListings(result);
		} catch (e) {
			console.error("Failed to load listings:", e);
			setTxStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
		} finally {
			setLoading(false);
		}
	}

	async function createListing() {
		if (!contractAddress) {
			setTxStatus("Error: Enter a contract address first");
			return;
		}
		if (!fileBytes || !importedPackage) {
			setTxStatus("Error: Drop a medic-signed record first");
			return;
		}
		if (!titleStr.trim()) {
			setTxStatus("Error: Enter a title for the listing");
			return;
		}
		if (!priceStr || isNaN(Number(priceStr)) || Number(priceStr) <= 0) {
			setTxStatus("Error: Enter a valid price in PAS");
			return;
		}
		if (statementStoreAvailable === false) {
			setTxStatus("Error: Statement Store is not available. Start the local node first.");
			return;
		}

		try {
			if (!(await verifyContract())) return;

			setTxStatus("Encrypting signed record...");
			const { encrypted, keyHex } = await encryptData(fileBytes);

			const ciphertextHash32 = blake2b(encrypted, undefined, 32);
			const ciphertextHash = bytesToHex(ciphertextHash32);

			setTxStatus("Submitting encrypted data to Statement Store...");
			// Use localSigner when present — Nova Wallet's signRaw adds a <Bytes>
			// prefix that the substrate statement store rejects.
			const stmtSigner = currentAccount.localSigner ?? currentAccount.signer;
			await submitStatement(
				wsUrl,
				encrypted,
				ciphertextHash32,
				MARKETPLACE_ACCOUNT_ID,
				stmtSigner.publicKey, // ignored in Host mode
				stmtSigner.signBytes, // ignored in Host mode
			);

			setTxStatus("Creating listing on-chain...");
			const priceWei = parseEther(priceStr);
			const { txHash } = await reviveCall("createListing", [
				importedPackage.merkleRoot as `0x${string}`,
				ciphertextHash,
				titleStr.trim(),
				priceWei,
			]);
			setTxStatus(`Transaction submitted: ${txHash}`);

			const publicClient = getPublicClient(ethRpcUrl);
			const listingId =
				((await publicClient.readContract({
					address: contractAddress as Address,
					abi: medicalMarketAbi,
					functionName: "getListingCount",
				})) as bigint) - 1n;
			localStorage.setItem(`aes-key:${ethRpcUrl}:${listingId}`, keyHex);
			localStorage.setItem(
				`signed-pkg:${ethRpcUrl}:${listingId}`,
				JSON.stringify(importedPackage),
			);

			setTxStatus(
				"Listing created! Keep this tab open — you'll need to submit the key when a researcher pays.",
			);
			setFileBytes(null);
			setTitleStr("");
			setPriceStr("");
			loadListings();
		} catch (e) {
			console.error("createListing failed:", e);
			setTxStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	async function fulfillOrder(orderId: bigint, listingId: bigint) {
		if (!contractAddress) return;
		try {
			if (!(await verifyContract())) return;

			const keyHex = localStorage.getItem(`aes-key:${ethRpcUrl}:${listingId}`);
			if (!keyHex) {
				setTxStatus(
					`Error: No decryption key for listing #${listingId}. Was it created in another session?`,
				);
				return;
			}
			const pkgJson = localStorage.getItem(`signed-pkg:${ethRpcUrl}:${listingId}`);
			if (!pkgJson) {
				setTxStatus(
					`Error: Signed package not found for listing #${listingId}. Re-create the listing.`,
				);
				return;
			}
			const pkg = JSON.parse(pkgJson) as MerklePackage;
			const fieldKeys = Object.keys(pkg.fields);
			if (!selectedField || !fieldKeys.includes(selectedField)) {
				setTxStatus("Error: Select a field to prove first.");
				return;
			}

			setTxStatus("Generating ZK proof… (10–30s, browser may pause briefly)");
			const { generateProofForField } = await import("../utils/zk");
			const zkProof = await generateProofForField(pkg, selectedField);

			// ---- ZK fulfill diagnostic dump ---------------------------------------
			// Revive.ContractReverted swallows the Solidity revert reason, so we log
			// every value that fulfill() asserts on, to narrow down which `require`
			// tripped. Remove once the fulfill flow is reliably green.
			try {
				const publicClient = getPublicClient(ethRpcUrl);
				const addr = contractAddress as Address;
				const listingResult = (await publicClient.readContract({
					address: addr,
					abi: medicalMarketAbi,
					functionName: "getListing",
					args: [listingId],
				})) as [string, string, string, bigint, string, boolean];
				const [onChainMerkleRoot, statementHash, , , onChainPatient] = listingResult;
				const pubSignal0Hex = `0x${zkProof.pubSignals[0].toString(16).padStart(64, "0")}`;
				console.log("[fulfill] diagnostic dump", {
					orderId: orderId.toString(),
					listingId: listingId.toString(),
					caller_evmAddress: currentAccount.evmAddress,
					onChain_patient: onChainPatient,
					caller_matches_patient:
						currentAccount.evmAddress.toLowerCase() === onChainPatient.toLowerCase(),
					onChain_merkleRoot: onChainMerkleRoot,
					pubSignals_0_as_bytes32: pubSignal0Hex,
					merkleRoot_matches_pubSignal0:
						onChainMerkleRoot.toLowerCase() === pubSignal0Hex.toLowerCase(),
					pubSignals_raw: zkProof.pubSignals.map((x) => x.toString()),
					proof_a: zkProof.a.map((x) => x.toString()),
					proof_b: zkProof.b.map((row) => row.map((x) => x.toString())),
					proof_c: zkProof.c.map((x) => x.toString()),
					deployments_verifier: deployments.verifier,
					note:
						"medicalMarketAbi has no `verifier()` entry; compare deployments_verifier " +
						"manually via `cast call <MedicalMarket> 'verifier()(address)' --rpc-url ...`",
					statementHash,
					decryption_keyHex: keyHex,
				});
			} catch (diagErr) {
				console.warn("[fulfill] diagnostic dump failed:", diagErr);
			}
			// ------------------------------------------------------------------------

			setTxStatus("Submitting proof and decryption key on-chain...");
			const { txHash } = await reviveCall("fulfill", [
				orderId,
				keyHex as `0x${string}`,
				zkProof.a,
				zkProof.b,
				zkProof.c,
				zkProof.pubSignals,
			]);
			setTxStatus(`Transaction finalized: ${txHash}`);
			loadListings();
		} catch (e) {
			console.error("fulfill failed:", e);
			setTxStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	function getSignedPkgFields(listingId: bigint): string[] {
		try {
			const json = localStorage.getItem(`signed-pkg:${ethRpcUrl}:${listingId}`);
			if (!json) return [];
			return Object.keys((JSON.parse(json) as MerklePackage).fields);
		} catch {
			return [];
		}
	}

	async function cancelListing(listingId: bigint) {
		if (!contractAddress) return;
		try {
			if (!(await verifyContract())) return;
			setTxStatus("Submitting cancelListing transaction...");
			const { txHash } = await reviveCall("cancelListing", [listingId]);
			setTxStatus(`Listing cancelled. Tx: ${txHash}`);
			loadListings();
		} catch (e) {
			console.error("cancelListing failed:", e);
			setTxStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	return (
		<div className="space-y-6 animate-fade-in">
			<div className="space-y-2">
				<h1 className="page-title text-polka-500">Patient Dashboard</h1>
				<p className="text-text-secondary">
					Encrypt and list medical records for sale. The buyer receives the decryption key
					only after you confirm the sale — releasing their payment to you.
				</p>
			</div>

			{/* Contract + Account Setup */}
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
					<select
						value={selectedAccountIndex}
						onChange={(e) => setSelectedAccountIndex(parseInt(e.target.value))}
						className="input-field w-full"
					>
						{accounts.map((acc, i) => (
							<option key={acc.address} value={i}>
								{acc.name} ({acc.evmAddress})
							</option>
						))}
					</select>
				</div>
			</div>

			{/* Create Listing */}
			<div className="card space-y-4">
				<h2 className="section-title">Create Listing</h2>
				<p className="text-text-muted text-xs">
					Drop a medic-signed record (downloaded from the Medic Signing Tool). The signed
					package is encrypted with AES-256-GCM in your browser and uploaded to the
					Statement Store. The Merkle root is committed on-chain — the decryption key is
					released only when you confirm the sale.
				</p>

				<FileDropZone
					onFileHashed={() => {}}
					onFileBytes={onFileBytes}
					showUploadToggle={false}
					uploadToIpfs={false}
					onUploadToggle={() => {}}
					showStatementStoreToggle={false}
					uploadToStatementStore={false}
					onStatementStoreToggle={() => {}}
					statementStoreDisabled={statementStoreAvailable === false}
				/>

				{packageParseError && (
					<p className="text-accent-red text-xs">{packageParseError}</p>
				)}

				{importedPackage && (
					<div className="rounded-lg border border-accent-green/20 bg-accent-green/[0.04] p-3 space-y-1 text-xs">
						<p className="text-accent-green font-medium">Signed record loaded</p>
						<p className="text-text-secondary font-mono break-all">
							Root: {importedPackage.merkleRoot.slice(0, 18)}…
							{importedPackage.merkleRoot.slice(-8)}
						</p>
						<p className="text-text-muted">
							{Object.keys(importedPackage.fields).length} fields · signed{" "}
							{new Date(importedPackage.signedAt).toLocaleString()}
						</p>
					</div>
				)}

				{statementStoreAvailable === false && (
					<p className="text-accent-red text-xs">
						Statement Store unavailable — start the local node to enable listing
						creation.
					</p>
				)}

				<div>
					<label className="label">Title</label>
					<input
						type="text"
						value={titleStr}
						onChange={(e) => setTitleStr(e.target.value)}
						placeholder="e.g. Type 2 Diabetes Cohort — HbA1c + BMI"
						className="input-field w-full"
					/>
				</div>

				<div>
					<label className="label">Price (PAS)</label>
					<input
						type="text"
						value={priceStr}
						onChange={(e) => setPriceStr(e.target.value)}
						placeholder="e.g. 1.5"
						className="input-field w-full"
					/>
				</div>

				{importedPackage && fileBytes && (
					<button
						onClick={createListing}
						className="btn-accent"
						style={{
							background: "linear-gradient(135deg, #e6007a 0%, #bc0062 100%)",
							boxShadow:
								"0 1px 2px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)",
						}}
					>
						Encrypt &amp; List
					</button>
				)}

				{txStatus && (
					<p
						className={`text-sm font-medium ${
							txStatus.startsWith("Error") ? "text-accent-red" : "text-accent-green"
						}`}
					>
						{txStatus}
					</p>
				)}
			</div>

			{/* My Listings */}
			<div className="card space-y-4">
				<div className="flex items-center justify-between">
					<h2 className="section-title">My Listings</h2>
					<button
						onClick={loadListings}
						disabled={loading}
						className="btn-secondary text-xs"
					>
						{loading ? "Loading..." : "Refresh"}
					</button>
				</div>

				{listings.length === 0 ? (
					<p className="text-text-muted text-sm">
						No listings found for this account. Create one above.
					</p>
				) : (
					<div className="space-y-2">
						{listings.map((listing) => {
							const hasPendingOrder = listing.pendingOrderId > 0n;
							const orderIdForFulfill = listing.pendingOrderId - 1n;
							const hasKey = !!localStorage.getItem(
								`aes-key:${ethRpcUrl}:${listing.id}`,
							);

							return (
								<div
									key={listing.id.toString()}
									className="rounded-lg border border-white/[0.04] bg-white/[0.02] p-3 text-sm space-y-1.5"
								>
									<div className="flex items-center justify-between gap-2">
										<div>
											<p className="text-text-primary font-medium text-sm">
												{listing.title}
											</p>
											<p className="font-mono text-xs text-text-muted mt-0.5">
												{listing.merkleRoot.slice(0, 18)}…
												{listing.merkleRoot.slice(-8)}
											</p>
											<div className="mt-1">
												<VerifiedBadge
													address={listing.patient as `0x${string}`}
												/>
											</div>
										</div>
										<span
											className={`text-xs font-medium px-1.5 py-0.5 rounded whitespace-nowrap ${
												!listing.active
													? "bg-white/[0.06] text-text-muted"
													: hasPendingOrder
														? "bg-accent-yellow/10 text-accent-yellow"
														: "bg-accent-green/10 text-accent-green"
											}`}
										>
											{!listing.active
												? "Inactive"
												: hasPendingOrder
													? "Order Pending"
													: "Active"}
										</span>
									</div>

									<p className="text-text-tertiary">
										Price:{" "}
										<span className="text-text-secondary">
											{formatEther(listing.price)} PAS
										</span>{" "}
										| Listing #{listing.id.toString()}
										{!hasKey && listing.active && hasPendingOrder && (
											<span className="ml-2 text-accent-red text-xs">
												(key not found in this browser)
											</span>
										)}
									</p>

									{listing.active && hasPendingOrder && (
										<div>
											{getSignedPkgFields(listing.id).length > 0 && (
												<select
													value={selectedField}
													onChange={(e) =>
														setSelectedField(e.target.value)
													}
													className="w-full bg-[#1a1a2e] border border-gray-600 rounded px-2 py-1 text-sm text-white mb-2"
												>
													<option value="">Select field to prove…</option>
													{getSignedPkgFields(listing.id).map((k) => (
														<option key={k} value={k}>
															{k}
														</option>
													))}
												</select>
											)}
											<button
												onClick={() =>
													fulfillOrder(orderIdForFulfill, listing.id)
												}
												className="btn-accent text-xs px-3 py-1"
												style={{
													background:
														"linear-gradient(135deg, #e6007a 0%, #bc0062 100%)",
													boxShadow:
														"0 1px 2px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)",
												}}
											>
												Submit Key (Order #{orderIdForFulfill.toString()})
											</button>
										</div>
									)}

									{listing.active && !hasPendingOrder && (
										<button
											onClick={() => cancelListing(listing.id)}
											className="px-2 py-1 rounded-md bg-accent-red/10 text-accent-red text-xs font-medium hover:bg-accent-red/20 transition-colors"
										>
											Cancel Listing
										</button>
									)}
								</div>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);
}
