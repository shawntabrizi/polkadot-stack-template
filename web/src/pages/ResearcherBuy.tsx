import { useState, useEffect, useCallback } from "react";
import { type Address, formatEther } from "viem";
import { medicalMarketAbi, evmDevAccounts, getPublicClient, getWalletClient } from "../config/evm";
import { deployments } from "../config/deployments";
import { fetchStatements } from "../hooks/useStatementStore";
import { useChainStore } from "../store/chainStore";

interface Listing {
	id: bigint;
	statementHash: `0x${string}`;
	price: bigint;
	patient: Address;
	active: boolean;
	pendingOrderId: bigint;
}

interface Order {
	id: bigint;
	listingId: bigint;
	researcher: Address;
	amount: bigint;
	confirmed: boolean;
	cancelled: boolean;
}

interface RetrievedData {
	orderId: bigint;
	json: string;
}

export default function ResearcherBuy() {
	const ethRpcUrl = useChainStore((s) => s.ethRpcUrl);
	const wsUrl = useChainStore((s) => s.wsUrl);

	const storageKey = `medical-market-address:${ethRpcUrl}`;
	const defaultAddress = (deployments as Record<string, string | null>).medicalMarket ?? null;

	const [contractAddress, setContractAddress] = useState("");
	const [selectedAccount, setSelectedAccount] = useState(0);
	const [listings, setListings] = useState<Listing[]>([]);
	const [orders, setOrders] = useState<Order[]>([]);
	const [txStatus, setTxStatus] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [retrievedData, setRetrievedData] = useState<Record<string, RetrievedData>>({});

	useEffect(() => {
		const stored = localStorage.getItem(storageKey);
		setContractAddress(stored ?? defaultAddress ?? "");
	}, [storageKey, defaultAddress]);

	useEffect(() => {
		if (contractAddress) {
			loadAll();
		} else {
			setListings([]);
			setOrders([]);
			setTxStatus(null);
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

	const currentAddress = evmDevAccounts[selectedAccount].account.address;

	const loadAll = useCallback(async () => {
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
				setOrders([]);
				setTxStatus(
					`Error: No contract found at ${addr} on ${ethRpcUrl}. Deploy MedicalMarket.sol and enter its address.`,
				);
				return;
			}

			// Load listings
			const listingCount = (await client.readContract({
				address: addr,
				abi: medicalMarketAbi,
				functionName: "getListingCount",
			})) as bigint;

			const fetchedListings: Listing[] = [];
			for (let i = 0n; i < listingCount; i++) {
				const result = (await client.readContract({
					address: addr,
					abi: medicalMarketAbi,
					functionName: "getListing",
					args: [i],
				})) as [string, bigint, string, boolean];
				const [statementHash, price, patient, active] = result;
				if (!active) continue;
				const pendingOrderId = (await client.readContract({
					address: addr,
					abi: medicalMarketAbi,
					functionName: "getPendingOrderId",
					args: [i],
				})) as bigint;
				fetchedListings.push({
					id: i,
					statementHash: statementHash as `0x${string}`,
					price,
					patient: patient as Address,
					active,
					pendingOrderId,
				});
			}
			setListings(fetchedListings);

			// Load orders filtered by current researcher address
			const orderCount = (await client.readContract({
				address: addr,
				abi: medicalMarketAbi,
				functionName: "getOrderCount",
			})) as bigint;

			const fetchedOrders: Order[] = [];
			for (let i = 0n; i < orderCount; i++) {
				const result = (await client.readContract({
					address: addr,
					abi: medicalMarketAbi,
					functionName: "getOrder",
					args: [i],
				})) as [bigint, string, bigint, boolean, boolean];
				const [listingId, researcher, amount, confirmed, cancelled] = result;
				if (researcher.toLowerCase() !== currentAddress.toLowerCase()) continue;
				fetchedOrders.push({
					id: i,
					listingId,
					researcher: researcher as Address,
					amount,
					confirmed,
					cancelled,
				});
			}
			setOrders(fetchedOrders);
		} catch (e) {
			console.error("Failed to load marketplace data:", e);
			setTxStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
		} finally {
			setLoading(false);
		}
	}, [contractAddress, ethRpcUrl, currentAddress]);

	async function placeBuyOrder(listing: Listing) {
		if (!contractAddress) return;
		try {
			setTxStatus(`Placing buy order for listing #${listing.id}...`);
			const walletClient = await getWalletClient(selectedAccount, ethRpcUrl);
			const hash = await walletClient.writeContract({
				address: contractAddress as Address,
				abi: medicalMarketAbi,
				functionName: "placeBuyOrder",
				args: [listing.id],
				value: listing.price,
			});
			setTxStatus(`Transaction submitted: ${hash}`);
			const publicClient = getPublicClient(ethRpcUrl);
			await publicClient.waitForTransactionReceipt({ hash });
			setTxStatus("Buy order placed successfully!");
			loadAll();
		} catch (e) {
			console.error("placeBuyOrder failed:", e);
			setTxStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	async function retrieveData(order: Order) {
		if (!contractAddress) return;
		try {
			setTxStatus(`Retrieving data for order #${order.id}...`);
			const client = getPublicClient(ethRpcUrl);
			const addr = contractAddress as Address;

			const listingResult = (await client.readContract({
				address: addr,
				abi: medicalMarketAbi,
				functionName: "getListing",
				args: [order.listingId],
			})) as [string, bigint, string, boolean];
			const statementHash = listingResult[0] as string;

			// Fetch the AES-256-GCM decryption key posted by the patient
			setTxStatus("Reading decryption key from contract...");
			const keyHex = (await client.readContract({
				address: addr,
				abi: medicalMarketAbi,
				functionName: "getDecryptionKey",
				args: [order.id],
			})) as `0x${string}`;

			if (keyHex === "0x0000000000000000000000000000000000000000000000000000000000000000") {
				setTxStatus(
					"Error: Decryption key not posted yet. Wait for the patient to submit the key.",
				);
				return;
			}

			setTxStatus("Fetching encrypted data from Statement Store...");
			const statements = await fetchStatements(wsUrl);
			const match = statements.find((s) => s.hash === statementHash);

			if (!match) {
				setTxStatus(
					`Error: No statement found with hash ${statementHash.slice(0, 10)}... in the Statement Store.`,
				);
				return;
			}
			if (!match.data) {
				setTxStatus("Error: Statement has no data payload.");
				return;
			}

			// Decrypt: data = [12-byte IV] + [AES-GCM ciphertext]
			setTxStatus("Decrypting...");
			const keyBytes = hexToBytes(keyHex);
			const cryptoKey = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, [
				"decrypt",
			]);
			const iv = match.data.slice(0, 12);
			const ciphertext = match.data.slice(12);
			const plaintextBuf = await crypto.subtle.decrypt(
				{ name: "AES-GCM", iv },
				cryptoKey,
				ciphertext,
			);
			const json = new TextDecoder().decode(plaintextBuf);
			setRetrievedData((prev) => ({
				...prev,
				[order.id.toString()]: { orderId: order.id, json },
			}));
			setTxStatus("Data decrypted successfully!");
		} catch (e) {
			console.error("retrieveData failed:", e);
			setTxStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	function hexToBytes(hex: string): Uint8Array {
		const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
		const out = new Uint8Array(clean.length / 2);
		for (let i = 0; i < out.length; i++) {
			out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
		}
		return out;
	}

	function truncate(addr: string) {
		return `${addr.slice(0, 8)}...${addr.slice(-4)}`;
	}

	function orderStatus(order: Order): string {
		if (order.cancelled) return "Cancelled";
		if (order.confirmed) return "Confirmed";
		return "Pending";
	}

	function orderStatusColor(order: Order): string {
		if (order.cancelled) return "text-accent-red";
		if (order.confirmed) return "text-accent-green";
		return "text-text-secondary";
	}

	return (
		<div className="space-y-6 animate-fade-in">
			<div className="space-y-2">
				<h1 className="page-title text-accent-blue">Researcher Dashboard</h1>
				<p className="text-text-secondary">
					Browse active medical data listings, place buy orders, and decrypt confirmed
					data using the key the patient posts on-chain.
				</p>
			</div>

			{/* Configuration */}
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

				<div>
					<label className="label">Dev Account (Researcher)</label>
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

				{txStatus && (
					<p
						className={`text-sm font-medium ${txStatus.startsWith("Error") ? "text-accent-red" : "text-accent-green"}`}
					>
						{txStatus}
					</p>
				)}
			</div>

			{/* Marketplace */}
			<div className="card space-y-4">
				<div className="flex items-center justify-between">
					<h2 className="section-title">Active Listings</h2>
					<button onClick={loadAll} disabled={loading} className="btn-secondary text-xs">
						{loading ? "Loading..." : "Refresh"}
					</button>
				</div>

				{listings.length === 0 ? (
					<p className="text-text-muted text-sm">
						No active listings found. Click Refresh to load.
					</p>
				) : (
					<div className="space-y-2">
						{listings.map((listing) => (
							<div
								key={listing.id.toString()}
								className="rounded-lg border border-white/[0.04] bg-white/[0.02] p-3 text-sm space-y-1.5"
							>
								<div className="flex items-center justify-between gap-2">
									<span className="text-text-tertiary font-medium">
										Listing #{listing.id.toString()}
									</span>
									{listing.pendingOrderId > 0n ? (
										<span className="px-2 py-0.5 rounded-full bg-white/[0.04] text-text-muted text-xs font-medium">
											Pending order
										</span>
									) : (
										<button
											onClick={() => placeBuyOrder(listing)}
											className="btn-accent text-xs px-3 py-1"
											style={{
												background:
													"linear-gradient(135deg, #4cc2ff 0%, #0090d4 100%)",
												boxShadow:
													"0 1px 2px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)",
											}}
										>
											Buy for {formatEther(listing.price)} PAS
										</button>
									)}
								</div>
								<p className="font-mono text-xs text-text-secondary break-all">
									Hash: {listing.statementHash}
								</p>
								<p className="text-text-tertiary">
									Patient:{" "}
									<span className="text-text-secondary font-mono">
										{truncate(listing.patient)}
									</span>{" "}
									| Price:{" "}
									<span className="text-text-secondary">
										{formatEther(listing.price)} PAS
									</span>
								</p>
							</div>
						))}
					</div>
				)}
			</div>

			{/* My Orders */}
			<div className="card space-y-4">
				<h2 className="section-title">My Orders</h2>

				{orders.length === 0 ? (
					<p className="text-text-muted text-sm">
						No orders placed yet. Buy a listing above to get started.
					</p>
				) : (
					<div className="space-y-2">
						{orders.map((order) => {
							const key = order.id.toString();
							const retrieved = retrievedData[key];
							return (
								<div
									key={key}
									className="rounded-lg border border-white/[0.04] bg-white/[0.02] p-3 text-sm space-y-1.5"
								>
									<div className="flex items-center justify-between gap-2">
										<span className="text-text-tertiary font-medium">
											Order #{order.id.toString()}
										</span>
										<span
											className={`text-xs font-medium ${orderStatusColor(order)}`}
										>
											{orderStatus(order)}
										</span>
									</div>
									<p className="text-text-tertiary">
										Listing:{" "}
										<span className="text-text-secondary">
											#{order.listingId.toString()}
										</span>{" "}
										| Paid:{" "}
										<span className="text-text-secondary">
											{formatEther(order.amount)} PAS
										</span>
									</p>
									{order.confirmed && !retrieved && (
										<button
											onClick={() => retrieveData(order)}
											className="btn-accent text-xs px-3 py-1 mt-1"
											style={{
												background:
													"linear-gradient(135deg, #4cc2ff 0%, #0090d4 100%)",
												boxShadow:
													"0 1px 2px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)",
											}}
										>
											Retrieve Data
										</button>
									)}
									{retrieved && (
										<div className="mt-2 space-y-1">
											<p className="text-text-secondary text-xs font-medium">
												Retrieved data:
											</p>
											<pre className="rounded-md bg-white/[0.03] border border-white/[0.04] p-2 text-xs font-mono text-text-primary overflow-x-auto whitespace-pre-wrap break-all">
												{retrieved.json}
											</pre>
										</div>
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
