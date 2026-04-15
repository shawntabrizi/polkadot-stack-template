import { useState, useCallback, useEffect } from "react";
import { type Address, parseEther, formatEther } from "viem";
import { blake2b } from "blakejs";
import {
	medicalMarketAbi,
	evmDevAccounts,
	getPublicClient,
	getWalletClient,
} from "../config/evm";
import { deployments } from "../config/deployments";
import { submitToStatementStore, checkStatementStoreAvailable } from "../hooks/useStatementStore";
import { getDevKeypair } from "../hooks/useAccount";
import { useChainStore } from "../store/chainStore";
import FileDropZone from "../components/FileDropZone";

interface Listing {
	id: bigint;
	statementHash: `0x${string}`;
	price: bigint;
	patient: string;
	active: boolean;
	pendingOrderId: bigint; // 0 = none, else 1-based
}

function computeBlake2bHex(bytes: Uint8Array): `0x${string}` {
	const hash = blake2b(bytes, undefined, 32);
	return ("0x" +
		Array.from(hash)
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("")) as `0x${string}`;
}

export default function PatientDashboard() {
	const ethRpcUrl = useChainStore((s) => s.ethRpcUrl);
	const wsUrl = useChainStore((s) => s.wsUrl);

	const storageKey = `medical-market-address:${ethRpcUrl}`;

	const defaultAddress =
		(deployments as Record<string, string | null>).medicalMarket ?? null;

	const [contractAddress, setContractAddress] = useState("");
	const [selectedAccount, setSelectedAccount] = useState(0);
	const [fileBytes, setFileBytes] = useState<Uint8Array | null>(null);
	const [fileHash, setFileHash] = useState<`0x${string}` | null>(null);
	const [doUploadToStatementStore, setDoUploadToStatementStore] = useState(false);
	const [statementStoreAvailable, setStatementStoreAvailable] = useState<boolean | null>(null);
	const [priceStr, setPriceStr] = useState("");
	const [listings, setListings] = useState<Listing[]>([]);
	const [txStatus, setTxStatus] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	// Load contract address from localStorage / deployments on mount or URL change
	useEffect(() => {
		const stored = localStorage.getItem(storageKey);
		setContractAddress(stored ?? defaultAddress ?? "");
	}, [storageKey, defaultAddress]);

	// Check Statement Store availability
	useEffect(() => {
		checkStatementStoreAvailable(wsUrl).then(setStatementStoreAvailable);
	}, [wsUrl]);

	// Load listings whenever the contract address or chain changes
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

	const onFileHashed = useCallback((hash: `0x${string}`) => {
		setFileHash(hash);
	}, []);

	const onFileBytes = useCallback((bytes: Uint8Array) => {
		setFileBytes(bytes);
	}, []);

	const currentAddress = evmDevAccounts[selectedAccount].account.address;

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
				// getListing returns a tuple: [statementHash, price, patient, active]
				const rawTuple = (await client.readContract({
					address: addr,
					abi: medicalMarketAbi,
					functionName: "getListing",
					args: [i],
				})) as readonly [`0x${string}`, bigint, string, boolean];

				const [statementHash, price, patient, active] = rawTuple;

				// Only include listings belonging to the current account
				if (patient.toLowerCase() !== currentAddress.toLowerCase()) continue;

				const pendingOrderId = await client.readContract({
					address: addr,
					abi: medicalMarketAbi,
					functionName: "getPendingOrderId",
					args: [i],
				});

				result.push({
					id: i,
					statementHash,
					price,
					patient,
					active,
					pendingOrderId,
				});
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
		if (!fileBytes) {
			setTxStatus("Error: Drop a file first");
			return;
		}
		if (!priceStr || isNaN(Number(priceStr)) || Number(priceStr) <= 0) {
			setTxStatus("Error: Enter a valid price in PAS");
			return;
		}

		try {
			if (!(await verifyContract())) return;

			// Step 1: Submit to Statement Store if toggled
			if (doUploadToStatementStore) {
				setTxStatus("Submitting to Statement Store...");
				const keypair = getDevKeypair(selectedAccount);
				await submitToStatementStore(wsUrl, fileBytes, keypair.publicKey, keypair.sign);
				setTxStatus("Statement Store submission complete. Creating listing...");
			}

			// Step 2: Compute blake2b-256 hash from file bytes
			const statementHash = computeBlake2bHex(fileBytes);

			// Step 3: Call createListing on the contract
			setTxStatus("Submitting createListing transaction...");
			const walletClient = await getWalletClient(selectedAccount, ethRpcUrl);
			const txHash = await walletClient.writeContract({
				address: contractAddress as Address,
				abi: medicalMarketAbi,
				functionName: "createListing",
				args: [statementHash, parseEther(priceStr)],
			});
			setTxStatus(`Transaction submitted: ${txHash}`);
			const publicClient = getPublicClient(ethRpcUrl);
			await publicClient.waitForTransactionReceipt({ hash: txHash });
			setTxStatus("Listing created!");
			setFileHash(null);
			setFileBytes(null);
			setPriceStr("");
			loadListings();
		} catch (e) {
			console.error("createListing failed:", e);
			setTxStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	async function confirmSale(orderId: bigint) {
		if (!contractAddress) return;
		try {
			if (!(await verifyContract())) return;
			setTxStatus("Submitting confirmSale transaction...");
			const walletClient = await getWalletClient(selectedAccount, ethRpcUrl);
			const txHash = await walletClient.writeContract({
				address: contractAddress as Address,
				abi: medicalMarketAbi,
				functionName: "confirmSale",
				args: [orderId],
			});
			setTxStatus(`Transaction submitted: ${txHash}`);
			const publicClient = getPublicClient(ethRpcUrl);
			await publicClient.waitForTransactionReceipt({ hash: txHash });
			setTxStatus("Sale confirmed!");
			loadListings();
		} catch (e) {
			console.error("confirmSale failed:", e);
			setTxStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	async function cancelListing(listingId: bigint) {
		if (!contractAddress) return;
		try {
			if (!(await verifyContract())) return;
			setTxStatus("Submitting cancelListing transaction...");
			const walletClient = await getWalletClient(selectedAccount, ethRpcUrl);
			const txHash = await walletClient.writeContract({
				address: contractAddress as Address,
				abi: medicalMarketAbi,
				functionName: "cancelListing",
				args: [listingId],
			});
			setTxStatus(`Transaction submitted: ${txHash}`);
			const publicClient = getPublicClient(ethRpcUrl);
			await publicClient.waitForTransactionReceipt({ hash: txHash });
			setTxStatus("Listing cancelled!");
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
					Submit medical records to the Statement Store and list them for sale on the
					MedicalMarket contract. Researchers can place buy orders and you confirm the
					sale to release the data atomically.
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
					<label className="label">Dev Account (Patient)</label>
					<select
						value={selectedAccount}
						onChange={(e) => setSelectedAccount(parseInt(e.target.value))}
						className="input-field w-full"
					>
						{evmDevAccounts.map((acc, i) => (
							<option key={i} value={i}>
								{acc.name} ({acc.account.address})
							</option>
						))}
					</select>
				</div>
			</div>

			{/* Create Listing */}
			<div className="card space-y-4">
				<h2 className="section-title">Create Listing</h2>

				<FileDropZone
					onFileHashed={onFileHashed}
					onFileBytes={onFileBytes}
					showUploadToggle={false}
					uploadToIpfs={false}
					onUploadToggle={() => {}}
					showStatementStoreToggle={true}
					uploadToStatementStore={doUploadToStatementStore}
					onStatementStoreToggle={setDoUploadToStatementStore}
					statementStoreDisabled={statementStoreAvailable === false}
				/>

				{fileHash && (
					<p className="text-sm text-text-secondary">
						Blake2b-256:{" "}
						<code className="text-text-primary font-mono text-xs break-all">
							{fileHash}
						</code>
					</p>
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

				{fileBytes && (
					<button
						onClick={createListing}
						className="btn-accent"
						style={{
							background: "linear-gradient(135deg, #e6007a 0%, #bc0062 100%)",
							boxShadow:
								"0 1px 2px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)",
						}}
					>
						Create Listing
					</button>
				)}

				{txStatus && (
					<p
						className={`text-sm font-medium ${
							txStatus.startsWith("Error")
								? "text-accent-red"
								: "text-accent-green"
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
							// orderId passed to confirmSale is 0-based (pendingOrderId is 1-based)
							const orderIdForConfirm = listing.pendingOrderId - 1n;

							return (
								<div
									key={listing.id.toString()}
									className="rounded-lg border border-white/[0.04] bg-white/[0.02] p-3 text-sm space-y-1.5"
								>
									<div className="flex items-center justify-between gap-2">
										<p className="font-mono text-xs text-text-secondary break-all">
											{listing.statementHash.slice(0, 18)}…
											{listing.statementHash.slice(-8)}
										</p>
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

									{listing.active && hasPendingOrder && (
										<button
											onClick={() => confirmSale(orderIdForConfirm)}
											className="btn-accent text-xs px-3 py-1"
											style={{
												background:
													"linear-gradient(135deg, #e6007a 0%, #bc0062 100%)",
												boxShadow:
													"0 1px 2px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)",
											}}
										>
											Confirm Sale (Order #{orderIdForConfirm.toString()})
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
