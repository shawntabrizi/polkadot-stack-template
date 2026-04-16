import { useState, useCallback, useEffect } from "react";
import { type Address, parseEther, formatEther } from "viem";
import { blake2b } from "blakejs";
import { medicalMarketAbi, evmDevAccounts, getPublicClient, getWalletClient } from "../config/evm";
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

function bytesToHex(bytes: Uint8Array): `0x${string}` {
	return ("0x" +
		Array.from(bytes)
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("")) as `0x${string}`;
}

/**
 * Encrypt plaintext bytes with AES-256-GCM.
 * Returns [12-byte IV || ciphertext] and the raw key as a 0x-prefixed hex string.
 */
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

	// Prepend IV so the researcher can extract it when decrypting
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

	const [contractAddress, setContractAddress] = useState("");
	const [selectedAccount, setSelectedAccount] = useState(0);
	const [fileBytes, setFileBytes] = useState<Uint8Array | null>(null);
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
		if (statementStoreAvailable === false) {
			setTxStatus("Error: Statement Store is not available. Start the local node first.");
			return;
		}

		try {
			if (!(await verifyContract())) return;

			// Step 1: Encrypt the file bytes with AES-256-GCM
			setTxStatus("Encrypting file...");
			const { encrypted, keyHex } = await encryptData(fileBytes);

			// Step 2: Compute blake2b-256 hash of the ciphertext (used as on-chain lookup key)
			const ciphertextHash = bytesToHex(blake2b(encrypted, undefined, 32));

			// Step 3: Upload encrypted bytes to Statement Store
			setTxStatus("Submitting encrypted data to Statement Store...");
			const keypair = getDevKeypair(selectedAccount);
			await submitToStatementStore(wsUrl, encrypted, keypair.publicKey, keypair.sign);

			// Step 4: Create listing on-chain with the ciphertext hash
			setTxStatus("Creating listing on-chain...");
			const walletClient = await getWalletClient(selectedAccount, ethRpcUrl);
			const txHash = await walletClient.writeContract({
				address: contractAddress as Address,
				abi: medicalMarketAbi,
				functionName: "createListing",
				args: [ciphertextHash, parseEther(priceStr)],
			});
			setTxStatus(`Transaction submitted: ${txHash}`);
			const publicClient = getPublicClient(ethRpcUrl);
			await publicClient.waitForTransactionReceipt({ hash: txHash });

			// Step 5: Store the AES key in localStorage (needed later to fulfill the order)
			const listingId =
				((await publicClient.readContract({
					address: contractAddress as Address,
					abi: medicalMarketAbi,
					functionName: "getListingCount",
				})) as bigint) - 1n;
			localStorage.setItem(`aes-key:${ethRpcUrl}:${listingId}`, keyHex);

			setTxStatus(
				"Listing created! Keep this tab open — you'll need to submit the key when a researcher pays.",
			);
			setFileBytes(null);
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

			// Retrieve the AES key stored at listing creation time
			const keyHex = localStorage.getItem(`aes-key:${ethRpcUrl}:${listingId}`);
			if (!keyHex) {
				setTxStatus(
					`Error: No decryption key found for listing #${listingId}. Was this listing created in a different browser or session?`,
				);
				return;
			}

			setTxStatus("Submitting decryption key on-chain...");
			const walletClient = await getWalletClient(selectedAccount, ethRpcUrl);
			const txHash = await walletClient.writeContract({
				address: contractAddress as Address,
				abi: medicalMarketAbi,
				functionName: "fulfill",
				args: [orderId, keyHex as `0x${string}`],
			});
			setTxStatus(`Transaction submitted: ${txHash}`);
			const publicClient = getPublicClient(ethRpcUrl);
			await publicClient.waitForTransactionReceipt({ hash: txHash });
			setTxStatus("Key submitted! Researcher can now decrypt the data.");
			loadListings();
		} catch (e) {
			console.error("fulfill failed:", e);
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
				<p className="text-text-muted text-xs">
					Your file will be encrypted with AES-256-GCM in your browser. Only the
					ciphertext hash is stored on-chain. The decryption key is released to the buyer
					only when you confirm the sale.
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

				{statementStoreAvailable === false && (
					<p className="text-accent-red text-xs">
						Statement Store unavailable — start the local node to enable listing
						creation.
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
							// orderId passed to fulfill is 0-based (pendingOrderId is 1-based)
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
										{!hasKey && listing.active && hasPendingOrder && (
											<span className="ml-2 text-accent-red text-xs">
												(key not found in this browser)
											</span>
										)}
									</p>

									{listing.active && hasPendingOrder && (
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
