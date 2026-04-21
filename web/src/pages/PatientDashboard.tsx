import { useState, useCallback, useEffect } from "react";
import { type Address, parseEther, formatEther, encodeFunctionData } from "viem";
import { Binary, FixedSizeBinary, type TxBestBlocksState } from "polkadot-api";
import { filter, firstValueFrom } from "rxjs";
import { medicalMarketAbi, getPublicClient } from "../config/evm";
import VerifiedBadge from "../components/VerifiedBadge";
import Spinner from "../components/Spinner";
import Toast from "../components/Toast";
import { deployments } from "../config/deployments";
import {
	submitStatement,
	checkStatementStoreAvailable,
	MARKETPLACE_ACCOUNT_ID,
} from "../hooks/useStatementStore";
import { blake2b } from "blakejs";
import { devAccounts, getAccountsWithFallback, type AppAccount } from "../hooks/useAccount";
import { getClient } from "../hooks/useChain";
import { getStackTemplateDescriptor } from "../hooks/useConnection";
import { useChainStore } from "../store/chainStore";
import { formatDispatchError } from "../utils/format";
import FileDropZone from "../components/FileDropZone";
import { type SignedRecord, type MedicalHeader, encryptRecordForBuyer } from "../utils/zk";

// Maximum native balance we're willing to spend on storage deposits (100 tokens in planck).
const MAX_STORAGE_DEPOSIT = 100_000_000_000_000n;
// Weight budget. fulfill() is now a small storage write + 2 ETH transfers; no
// pairing math, so the previous 30 Bgas budget is overkill but harmless.
const CALL_WEIGHT = { ref_time: 5_000_000_000n, proof_size: 524_288n };
// pallet-revive: 1 planck = 10^6 EVM wei (for 12-decimal chains).
const WEI_TO_PLANCK = 1_000_000n;

interface Listing {
	id: bigint;
	header: MedicalHeader;
	headerCommit: bigint;
	bodyCommit: bigint;
	medicPkX: bigint;
	medicPkY: bigint;
	sigR8x: bigint;
	sigR8y: bigint;
	sigS: bigint;
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

function formatRecordedAt(unixSeconds: number): string {
	return new Date(unixSeconds * 1000).toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
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
	const [priceStr, setPriceStr] = useState("");
	const [listings, setListings] = useState<Listing[]>([]);
	const [expandedListings, setExpandedListings] = useState<Set<string>>(new Set());
	const [txStatus, setTxStatus] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

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

	useEffect(() => {
		if (contractAddress) {
			loadListings();
		} else {
			setListings([]);
		}
	}, [contractAddress, ethRpcUrl, currentAccount.evmAddress]); // eslint-disable-line react-hooks/exhaustive-deps

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
				// getListing returns: headerCommit, bodyCommit, medicPkX, medicPkY,
				//                     sigR8x, sigR8y, sigS, price, patient, active
				const rawTuple = (await client.readContract({
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

				const [
					headerCommit,
					bodyCommit,
					medicPkX,
					medicPkY,
					sigR8x,
					sigR8y,
					sigS,
					price,
					patient,
					active,
				] = rawTuple;

				if (patient.toLowerCase() !== currentAccount.evmAddress.toLowerCase()) continue;

				const headerTuple = (await client.readContract({
					address: addr,
					abi: medicalMarketAbi,
					functionName: "getListingHeader",
					args: [i],
				})) as readonly [string, string, bigint, string];

				const header: MedicalHeader = {
					title: headerTuple[0],
					recordType: headerTuple[1],
					recordedAt: Number(headerTuple[2]),
					facility: headerTuple[3],
				};

				const pendingOrderId = await client.readContract({
					address: addr,
					abi: medicalMarketAbi,
					functionName: "getPendingOrderId",
					args: [i],
				});

				result.push({
					id: i,
					header,
					headerCommit,
					bodyCommit,
					medicPkX,
					medicPkY,
					sigR8x,
					sigR8y,
					sigS,
					price,
					patient,
					active,
					pendingOrderId,
				});
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
		if (!priceStr || isNaN(Number(priceStr)) || Number(priceStr) <= 0) {
			setTxStatus("Error: Enter a valid price in PAS");
			return;
		}

		try {
			if (!(await verifyContract())) return;

			setTxStatus("Creating listing on-chain...");
			const headerCommit = BigInt(importedPackage.headerCommit);
			const bodyCommit = BigInt(importedPackage.bodyCommit);
			const medicPkX = BigInt(importedPackage.medicPublicKey.x);
			const medicPkY = BigInt(importedPackage.medicPublicKey.y);
			const sigR8x = BigInt(importedPackage.signature.R8x);
			const sigR8y = BigInt(importedPackage.signature.R8y);
			const sigS = BigInt(importedPackage.signature.S);
			const priceWei = parseEther(priceStr);
			const headerInput = {
				title: importedPackage.header.title,
				recordType: importedPackage.header.recordType,
				recordedAt: BigInt(importedPackage.header.recordedAt),
				facility: importedPackage.header.facility,
			};
			const { txHash } = await reviveCall("createListing", [
				headerInput,
				headerCommit,
				bodyCommit,
				medicPkX,
				medicPkY,
				sigR8x,
				sigR8y,
				sigS,
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

			const order = (await getPublicClient(ethRpcUrl).readContract({
				address: contractAddress as Address,
				abi: medicalMarketAbi,
				functionName: "getOrder",
				args: [orderId],
			})) as unknown as readonly [bigint, string, bigint, boolean, boolean, bigint, bigint];
			const pkBuyer = { x: order[5], y: order[6] };

			setTxStatus("Encrypting record for buyer…");
			const { ephPk, ciphertextBytes } = encryptRecordForBuyer({
				plaintext: pkg.body.map(BigInt),
				pkBuyer,
				nonce: orderId,
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

			setTxStatus("Submitting fulfill on-chain…");
			const { txHash } = await reviveCall("fulfill", [
				orderId,
				ephPk.x,
				ephPk.y,
				ciphertextHashBig,
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
					List medic-signed records for sale. The medic's header (title, type, date,
					facility) goes on-chain in the clear so researchers can filter listings; the
					body is encrypted at fulfillment time and delivered through the Statement Store.
					The buyer verifies both the medic signature and the body commitment off-chain
					after decryption.
				</p>
			</div>

			{statementStoreAvailable === false && (
				<div className="rounded-lg border border-accent-red/30 bg-accent-red/[0.06] px-4 py-3 text-sm text-accent-red">
					Statement Store unavailable — start the local node. Fulfillment is disabled
					until the node is reachable.
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

			<div className="card space-y-4">
				<h2 className="section-title">Create Listing</h2>
				<p className="text-text-muted text-xs">
					Drop a v3 medic-signed record (downloaded from the Medic Signing Tool). Title,
					record type, date, and facility come from the medic-signed header and go
					on-chain as-is. The encrypted body is uploaded at fulfillment — nothing is
					uploaded now.
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
							{Object.keys(importedPackage.bodyFieldsPreview).length} body fields ·
							signed {new Date(importedPackage.signedAt).toLocaleString()}
						</p>
					</div>
				)}

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
						disabled={loading}
						className="btn-accent disabled:opacity-60 disabled:cursor-not-allowed"
						style={{
							background: "linear-gradient(135deg, #e6007a 0%, #bc0062 100%)",
							boxShadow:
								"0 1px 2px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)",
						}}
					>
						{loading ? (
							<>
								<Spinner />
								Listing…
							</>
						) : (
							"List Record"
						)}
					</button>
				)}

				<Toast message={txStatus} onClose={() => setTxStatus(null)} />
			</div>

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
					<p className="text-text-secondary text-sm">
						No listings found for this account. Create one above.
					</p>
				) : (
					<div className="space-y-2">
						{listings.map((listing) => {
							const hasPendingOrder = listing.pendingOrderId > 0n;
							const orderIdForFulfill = listing.pendingOrderId - 1n;
							const pkgJson = localStorage.getItem(
								`signed-pkg:${ethRpcUrl}:${listing.id}`,
							);
							const hasPackage = !!pkgJson;
							const pkg = pkgJson ? (JSON.parse(pkgJson) as SignedRecord) : null;
							const isExpanded = expandedListings.has(listing.id.toString());
							const commitHex = listing.bodyCommit.toString(16).padStart(64, "0");

							return (
								<div
									key={listing.id.toString()}
									className="rounded-lg border border-white/[0.04] bg-white/[0.02] p-3 text-sm space-y-1.5"
								>
									<div className="flex items-center justify-between gap-2">
										<div>
											<p className="text-text-primary font-medium text-sm">
												{listing.header.title}
											</p>
											<div className="flex flex-wrap gap-1.5 mt-1 text-[10px]">
												<span className="px-1.5 py-0.5 rounded bg-polka-500/10 text-polka-400 font-medium">
													{listing.header.recordType}
												</span>
												<span className="px-1.5 py-0.5 rounded bg-white/[0.06] text-text-tertiary">
													{formatRecordedAt(listing.header.recordedAt)}
												</span>
												<span className="px-1.5 py-0.5 rounded bg-white/[0.06] text-text-tertiary">
													{listing.header.facility}
												</span>
											</div>
											<p className="font-mono text-xs text-text-muted mt-1">
												body{" "}
												{bytesToHex(hexToBytes(commitHex)).slice(0, 18)}…
												{commitHex.slice(-8)}
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
									</p>

									<button
										onClick={() =>
											setExpandedListings((prev) => {
												const next = new Set(prev);
												if (next.has(listing.id.toString()))
													next.delete(listing.id.toString());
												else next.add(listing.id.toString());
												return next;
											})
										}
										className="text-xs text-text-muted hover:text-text-secondary transition-colors"
									>
										{isExpanded ? "▲ Hide Record" : "▼ View Record"}
									</button>

									{isExpanded && (
										<div className="rounded-md border border-white/[0.04] bg-white/[0.02] p-2">
											{pkg ? (
												<table className="w-full text-xs border-collapse">
													<tbody>
														{Object.entries(pkg.bodyFieldsPreview).map(
															([k, v]) => (
																<tr
																	key={k}
																	className="border-b border-white/[0.04] last:border-0"
																>
																	<td className="py-1 pr-3 text-text-tertiary font-mono whitespace-nowrap align-top">
																		{k}
																	</td>
																	<td className="py-1 text-text-primary break-all">
																		{v}
																	</td>
																</tr>
															),
														)}
													</tbody>
												</table>
											) : (
												<p className="text-text-muted text-xs">
													Record data not available in this browser.
												</p>
											)}
										</div>
									)}

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
											disabled={loading || statementStoreAvailable === false}
											className="btn-accent text-xs px-3 py-1 disabled:opacity-40 disabled:cursor-not-allowed"
											style={{
												background:
													"linear-gradient(135deg, #e6007a 0%, #bc0062 100%)",
												boxShadow:
													"0 1px 2px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)",
											}}
										>
											{loading ? (
												<>
													<Spinner />
													{txStatus ?? "Processing…"}
												</>
											) : (
												<>
													Encrypt + Fulfill (Order #
													{orderIdForFulfill.toString()})
												</>
											)}
										</button>
									)}

									{listing.active && !hasPendingOrder && (
										<button
											onClick={() => cancelListing(listing.id)}
											disabled={loading}
											className="px-2 py-1 rounded-md bg-accent-red/10 text-accent-red text-xs font-medium hover:bg-accent-red/20 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
										>
											{loading ? (
												<>
													<Spinner />
													Cancelling…
												</>
											) : (
												"Cancel Listing"
											)}
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
