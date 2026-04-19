import { useState, useCallback, useEffect } from "react";
import { type Address, parseEther, formatEther, encodeFunctionData } from "viem";
import { Binary, FixedSizeBinary, type TxBestBlocksState } from "polkadot-api";
import { filter, firstValueFrom } from "rxjs";
import { medicalMarketAbi, getPublicClient } from "../config/evm";
import { deployments } from "../config/deployments";
import { submitToStatementStore, checkStatementStoreAvailable } from "../hooks/useStatementStore";
import { devAccounts, getAccountsWithFallback, type AppAccount } from "../hooks/useAccount";
import { getClient } from "../hooks/useChain";
import { getStackTemplateDescriptor } from "../hooks/useConnection";
import { useChainStore } from "../store/chainStore";
import { formatDispatchError } from "../utils/format";
import FileDropZone from "../components/FileDropZone";
import { type SignedRecord, generateProofFromRecord } from "../utils/zk";

// Maximum native balance we're willing to spend on storage deposits (100 tokens in planck).
const MAX_STORAGE_DEPOSIT = 100_000_000_000_000n;
// Weight budget. fulfill() runs the Groth16 verifier (9 ecMul + 9 ecAdd
// + 1 BN254 pairing) and needs more headroom than cheap reads/writes;
// the per-extrinsic block budget caps us, so we sit a bit below it.
const CALL_WEIGHT = { ref_time: 30_000_000_000n, proof_size: 2_097_152n };
// pallet-revive: 1 planck = 10^6 EVM wei (for 12-decimal chains).
const WEI_TO_PLANCK = 1_000_000n;

interface Listing {
	id: bigint;
	recordCommit: bigint;
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

export default function PatientDashboard() {
	const ethRpcUrl = useChainStore((s) => s.ethRpcUrl);
	const wsUrl = useChainStore((s) => s.wsUrl);

	const storageKey = `medical-market-address:${ethRpcUrl}`;
	const defaultAddress = (deployments as Record<string, string | null>).medicalMarket ?? null;

	const [accounts, setAccounts] = useState<AppAccount[]>(devAccounts);
	const [selectedAccountIndex, setSelectedAccountIndex] = useState(0);
	const [contractAddress, setContractAddress] = useState("");
	const [fileBytes, setFileBytes] = useState<Uint8Array | null>(null);
	const [importedPackage, setImportedPackage] = useState<SignedRecord | null>(null);
	const [packageParseError, setPackageParseError] = useState<string | null>(null);
	const [statementStoreAvailable, setStatementStoreAvailable] = useState<boolean | null>(null);
	const [titleStr, setTitleStr] = useState("");
	const [priceStr, setPriceStr] = useState("");
	const [listings, setListings] = useState<Listing[]>([]);
	const [txStatus, setTxStatus] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

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
				"version" in json &&
				(json as Record<string, unknown>).version === "v2-record" &&
				"recordCommit" in json &&
				"plaintext" in json &&
				"signature" in json
			) {
				setImportedPackage(json as SignedRecord);
			} else {
				setImportedPackage(null);
				setPackageParseError(
					"Not a valid v2 signed record. Use the Medic Signing Tool to produce one.",
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
				// getListing returns 5 fields: recordCommit, title, price, patient, active
				const rawTuple = (await client.readContract({
					address: addr,
					abi: medicalMarketAbi,
					functionName: "getListing",
					args: [i],
				})) as readonly [bigint, string, bigint, string, boolean];

				const [recordCommit, title, price, patient, active] = rawTuple;

				if (patient.toLowerCase() !== currentAccount.evmAddress.toLowerCase()) continue;

				const pendingOrderId = await client.readContract({
					address: addr,
					abi: medicalMarketAbi,
					functionName: "getPendingOrderId",
					args: [i],
				});

				result.push({ id: i, recordCommit, title, price, patient, active, pendingOrderId });
			}
			setListings(result);
		} catch (e) {
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

		try {
			if (!(await verifyContract())) return;

			setTxStatus("Creating listing on-chain...");
			const recordCommit = BigInt(importedPackage.recordCommit);
			const priceWei = parseEther(priceStr);
			const { txHash } = await reviveCall("createListing", [
				recordCommit,
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
			localStorage.setItem(
				`signed-pkg:${ethRpcUrl}:${listingId}`,
				JSON.stringify(importedPackage),
			);

			setTxStatus("Listing created! Come back here when a researcher places a buy order.");
			setFileBytes(null);
			setImportedPackage(null);
			setTitleStr("");
			setPriceStr("");
			loadListings();
		} catch (e) {
			setTxStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	async function fulfillOrder(orderId: bigint, listingId: bigint) {
		if (!contractAddress) return;
		try {
			if (!(await verifyContract())) return;

			if (statementStoreAvailable === false) {
				setTxStatus("Error: Statement Store unavailable — start the local node first.");
				return;
			}

			const pkgJson = localStorage.getItem(`signed-pkg:${ethRpcUrl}:${listingId}`);
			if (!pkgJson) {
				setTxStatus(
					`Error: Signed package not found for listing #${listingId}. Re-create the listing in this browser.`,
				);
				return;
			}
			const pkg = JSON.parse(pkgJson) as SignedRecord;

			// 1. Read order's pkBuyer
			// getOrder returns: [listingId, researcher, amount, confirmed, cancelled, pkBuyerX, pkBuyerY]
			const order = (await getPublicClient(ethRpcUrl).readContract({
				address: contractAddress as Address,
				abi: medicalMarketAbi,
				functionName: "getOrder",
				args: [orderId],
			})) as unknown as readonly [bigint, string, bigint, boolean, boolean, bigint, bigint];
			const pkBuyer = { x: order[5], y: order[6] };

			// 2. Generate ZK proof + ciphertext
			setTxStatus("Generating ZK proof… (1–3s)");
			const { proof, ciphertextBytes } = await generateProofFromRecord({
				plaintext: pkg.plaintext.map(BigInt),
				medicSignature: pkg.signature,
				medicPublicKey: pkg.medicPublicKey,
				pkBuyer,
				nonce: orderId,
			});

			// 3. Upload ciphertext to Statement Store — abort if it fails
			setTxStatus("Uploading ciphertext to Statement Store…");
			const stmtSigner = currentAccount.localSigner ?? currentAccount.signer;
			await submitToStatementStore(
				wsUrl,
				ciphertextBytes,
				stmtSigner.publicKey,
				stmtSigner.signBytes,
			);

			// 4. Submit fulfill on-chain
			setTxStatus("Submitting fulfill on-chain…");
			// Debug: dump what we're about to submit so we can diff against chain state.
			const listing = (await getPublicClient(ethRpcUrl).readContract({
				address: contractAddress as Address,
				abi: medicalMarketAbi,
				functionName: "getListing",
				args: [listingId],
			})) as unknown as readonly [bigint, string, bigint, string, boolean];
			console.log("[fulfill] listingId=", listingId, "orderId=", orderId);
			console.log("[fulfill] chain listing.recordCommit =", listing[0].toString());
			console.log("[fulfill] chain listing.patient      =", listing[3]);
			console.log("[fulfill] chain order.pkBuyerX       =", order[5].toString());
			console.log("[fulfill] chain order.pkBuyerY       =", order[6].toString());
			console.log("[fulfill] msg.sender (evmAddress)     =", currentAccount.evmAddress);
			console.log(
				"[fulfill] proof.pubSignals           =",
				proof.pubSignals.map((v) => v.toString()),
			);
			console.log("[fulfill]   [0] recordCommit (proof)  =", proof.pubSignals[0].toString());
			console.log("[fulfill]   [3] pkBuyerX (proof)      =", proof.pubSignals[3].toString());
			console.log("[fulfill]   [4] pkBuyerY (proof)      =", proof.pubSignals[4].toString());
			console.log("[fulfill]   [8] nonce (proof)         =", proof.pubSignals[8].toString());
			const { txHash } = await reviveCall("fulfill", [
				orderId,
				proof.a,
				proof.b,
				proof.c,
				proof.pubSignals,
			]);
			setTxStatus(`Done. Tx: ${txHash}`);
			loadListings();
		} catch (e) {
			setTxStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
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
			setTxStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	return (
		<div className="space-y-6 animate-fade-in">
			<div className="space-y-2">
				<h1 className="page-title text-polka-500">Patient Dashboard</h1>
				<p className="text-text-secondary">
					List medic-signed records for sale. When a researcher pays, you generate a ZK
					proof and the encrypted record is delivered atomically — no trust required.
				</p>
			</div>

			{/* Statement Store banner */}
			{statementStoreAvailable === false && (
				<div className="rounded-lg border border-accent-red/30 bg-accent-red/[0.06] px-4 py-3 text-sm text-accent-red">
					Statement Store unavailable — start the local node. Fulfillment is disabled
					until the node is reachable.
				</div>
			)}

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
					Drop a v2 medic-signed record (downloaded from the Medic Signing Tool). The
					record commitment is committed on-chain. The ZK proof and encrypted payload are
					generated and uploaded at fulfillment time — nothing is uploaded now.
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
							Commit:{" "}
							{BigInt(importedPackage.recordCommit)
								.toString(16)
								.padStart(64, "0")
								.slice(0, 18)}
							…
						</p>
						<p className="text-text-muted">
							{Object.keys(importedPackage.fieldsPreview).length} fields · signed{" "}
							{new Date(importedPackage.signedAt).toLocaleString()}
						</p>
					</div>
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
						List Record
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
							const hasPackage = !!localStorage.getItem(
								`signed-pkg:${ethRpcUrl}:${listing.id}`,
							);
							const commitHex = listing.recordCommit.toString(16).padStart(64, "0");

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
												{bytesToHex(hexToBytes(commitHex)).slice(0, 18)}…
												{commitHex.slice(-8)}
											</p>
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
									</p>

									{listing.active && hasPendingOrder && !hasPackage && (
										<p className="text-accent-red text-xs">
											Signed package not found for listing #
											{listing.id.toString()} — open this page in the browser
											where you created the listing.
										</p>
									)}

									{listing.active && hasPendingOrder && hasPackage && (
										<button
											onClick={() =>
												fulfillOrder(orderIdForFulfill, listing.id)
											}
											disabled={statementStoreAvailable === false}
											className="btn-accent text-xs px-3 py-1 disabled:opacity-40 disabled:cursor-not-allowed"
											style={{
												background:
													"linear-gradient(135deg, #e6007a 0%, #bc0062 100%)",
												boxShadow:
													"0 1px 2px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)",
											}}
										>
											Fulfill with ZK Proof (Order #
											{orderIdForFulfill.toString()})
										</button>
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
