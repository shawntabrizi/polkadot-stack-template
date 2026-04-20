import { useState, useEffect, useCallback } from "react";
import { type Address, formatEther, encodeFunctionData } from "viem";
import { Binary, FixedSizeBinary, type TxBestBlocksState } from "polkadot-api";
import { filter, firstValueFrom } from "rxjs";
import { medicalMarketAbi, getPublicClient } from "../config/evm";
import VerifiedBadge from "../components/VerifiedBadge";
import Spinner from "../components/Spinner";
import Toast from "../components/Toast";
import { deployments } from "../config/deployments";
import { subscribeStatements } from "../hooks/useStatementStore";
import { devAccounts, getAccountsWithFallback, type AppAccount } from "../hooks/useAccount";
import { getClient } from "../hooks/useChain";
import { getStackTemplateDescriptor } from "../hooks/useConnection";
import { useChainStore } from "../store/chainStore";
import { formatDispatchError } from "../utils/format";
import {
	getOrCreateBuyerKey,
	computeRecordCommit,
	decryptRecord,
	encodeRecordToFieldElements,
} from "../utils/zk";
import { verifySignature } from "@zk-kit/eddsa-poseidon";
import { blake2b } from "blakejs";

// Maximum native balance we're willing to spend on storage deposits (100 tokens in planck).
const MAX_STORAGE_DEPOSIT = 100_000_000_000_000n;
// Phase 5.2 fulfill() is just a storage write + transfers; placeBuyOrder also
// modest. The previous 30 Bgas budget for the on-chain Groth16 verify is gone.
const CALL_WEIGHT = { ref_time: 5_000_000_000n, proof_size: 524_288n };
// pallet-revive: 1 planck = 10^6 EVM wei (for 12-decimal chains).
const WEI_TO_PLANCK = 1_000_000n;

interface Listing {
	id: bigint;
	recordCommit: bigint;
	medicPkX: bigint;
	medicPkY: bigint;
	sigR8x: bigint;
	sigR8y: bigint;
	sigS: bigint;
	title: string;
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
	pkBuyerX: bigint;
	pkBuyerY: bigint;
}

interface DecryptedRecord {
	orderId: bigint;
	fields: Record<string, string>;
	commitMatch: boolean;
	sigValid: boolean;
}

function hexToBytes(hex: string): Uint8Array {
	const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
	const out = new Uint8Array(clean.length / 2);
	for (let i = 0; i < out.length; i++) {
		out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
	}
	return out;
}

/** Convert a uint256 bigint to a 0x-prefixed 32-byte big-endian hex string (64 hex chars). */
function uint256ToHashHex(n: bigint): string {
	return "0x" + n.toString(16).padStart(64, "0");
}

export default function ResearcherBuy() {
	const ethRpcUrl = useChainStore((s) => s.ethRpcUrl);
	const wsUrl = useChainStore((s) => s.wsUrl);

	const storageKey = `medical-market-address:${ethRpcUrl}`;
	const defaultAddress = (deployments as Record<string, string | null>).medicalMarket ?? null;

	const [accounts, setAccounts] = useState<AppAccount[]>(devAccounts);
	const [selectedAccountIndex, setSelectedAccountIndex] = useState(0);
	const [contractAddress, setContractAddress] = useState("");
	const [listings, setListings] = useState<Listing[]>([]);
	const [orders, setOrders] = useState<Order[]>([]);
	const [txStatus, setTxStatus] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [decryptedRecords, setDecryptedRecords] = useState<Record<string, DecryptedRecord>>({});
	const [stmtCache, setStmtCache] = useState<Map<string, Uint8Array>>(new Map());

	// Subscribe to statement store (live in Host, one-shot dump in local dev)
	useEffect(() => {
		const { unsubscribe } = subscribeStatements(wsUrl, setStmtCache);
		return unsubscribe;
	}, [wsUrl]);

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

	function saveAddress(address: string) {
		setContractAddress(address);
		if (address) {
			localStorage.setItem(storageKey, address);
		} else {
			localStorage.removeItem(storageKey);
		}
	}

	const currentAccount = accounts[selectedAccountIndex] ?? accounts[0];

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

		const result = await api.tx.Revive.call({
			dest: new FixedSizeBinary(hexToBytes(contractAddress)) as FixedSizeBinary<20>,
			value: valueWei / WEI_TO_PLANCK, // EVM wei → chain planck
			weight_limit: CALL_WEIGHT,
			storage_deposit_limit: MAX_STORAGE_DEPOSIT,
			data: Binary.fromHex(calldata),
		}).signAndSubmit(currentAccount.signer);

		if (!result.ok) {
			throw new Error(formatDispatchError(result.dispatchError));
		}
		return { txHash: result.txHash };
	}

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
				})) as readonly [
					bigint,
					bigint,
					bigint,
					bigint,
					bigint,
					bigint,
					string,
					bigint,
					string,
					boolean,
				];
				const [
					recordCommit,
					medicPkX,
					medicPkY,
					sigR8x,
					sigR8y,
					sigS,
					title,
					price,
					patient,
					active,
				] = result;
				// Keep inactive listings in state too — decryptAndView() needs the
				// listing metadata (recordCommit, medicPk, …) for any fulfilled order
				// in My Orders, and fulfilled listings have `active=false`. The
				// Active Listings render loop filters on `listing.active` below.
				const pendingOrderId = (await client.readContract({
					address: addr,
					abi: medicalMarketAbi,
					functionName: "getPendingOrderId",
					args: [i],
				})) as bigint;
				fetchedListings.push({
					id: i,
					recordCommit,
					medicPkX,
					medicPkY,
					sigR8x,
					sigR8y,
					sigS,
					title,
					price,
					patient: patient as Address,
					active,
					pendingOrderId,
				});
			}
			setListings(fetchedListings);

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
				})) as [bigint, string, bigint, boolean, boolean, bigint, bigint];
				const [listingId, researcher, amount, confirmed, cancelled, pkBuyerX, pkBuyerY] =
					result;
				if (researcher.toLowerCase() !== currentAccount.evmAddress.toLowerCase()) continue;
				fetchedOrders.push({
					id: i,
					listingId,
					researcher: researcher as Address,
					amount,
					confirmed,
					cancelled,
					pkBuyerX,
					pkBuyerY,
				});
			}
			setOrders(fetchedOrders);
		} catch (e) {
			setTxStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
		} finally {
			setLoading(false);
		}
	}, [contractAddress, ethRpcUrl, currentAccount.evmAddress]);

	// Fetch listings + orders when contract address, RPC, or the connected
	// account changes. Previously this effect only depended on [contractAddress,
	// ethRpcUrl] and suppressed the ESLint warning — which meant the initial
	// fetch used the `devAccounts` fallback's evmAddress (Alice). After async
	// getAccountsWithFallback() resolved to the real wallet account, `orders`
	// state was never refreshed because those two deps hadn't changed, so users
	// saw Alice's leftover orders instead of their own.
	useEffect(() => {
		if (contractAddress) {
			loadAll();
		} else {
			setListings([]);
			setOrders([]);
			setTxStatus(null);
		}
	}, [contractAddress, ethRpcUrl, loadAll]);

	async function placeBuyOrder(listing: Listing) {
		if (!contractAddress) return;
		try {
			setTxStatus("Placing order...");
			const skStorageKey = `phase5-sk-buyer:${currentAccount.evmAddress}:${ethRpcUrl}:${listing.id}`;
			const { pk } = getOrCreateBuyerKey(skStorageKey);
			const { txHash } = await reviveCall(
				"placeBuyOrder",
				[listing.id, pk.x, pk.y],
				listing.price,
			);
			setTxStatus(`Buy order placed. Tx: ${txHash}`);
			loadAll();
		} catch (e) {
			setTxStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	async function cancelOrder(order: Order) {
		if (!contractAddress) return;
		try {
			setTxStatus(`Cancelling order #${order.id} and requesting refund...`);
			const { txHash } = await reviveCall("cancelOrder", [order.id]);
			setTxStatus(
				`Order #${order.id} cancelled — ${formatEther(order.amount)} PAS refunded. Tx: ${txHash}`,
			);
			loadAll();
		} catch (e) {
			setTxStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	async function decryptAndView(order: Order) {
		if (!contractAddress) return;
		try {
			setTxStatus("Reading fulfillment...");
			const client = getPublicClient(ethRpcUrl);
			const addr = contractAddress as Address;

			const fulfillment = (await client.readContract({
				address: addr,
				abi: medicalMarketAbi,
				functionName: "getFulfillment",
				args: [order.id],
			})) as [bigint, bigint, bigint];
			const [ephPkX, ephPkY, ciphertextHash] = fulfillment;

			if (ciphertextHash === 0n) {
				setTxStatus(
					"Patient hasn't uploaded the ciphertext yet — check back in a few blocks.",
				);
				return;
			}

			const listing = listings.find((l) => l.id === order.listingId);
			if (!listing) {
				setTxStatus(`Error: listing #${order.listingId} not loaded; click Refresh.`);
				return;
			}

			setTxStatus("Fetching from Statement Store...");
			const targetHashHex = uint256ToHashHex(ciphertextHash);
			const matchedData = stmtCache.get(targetHashHex);

			if (!matchedData) {
				setTxStatus(
					"Patient hasn't uploaded the ciphertext yet — check back in a few blocks.",
				);
				return;
			}

			setTxStatus("Verifying ciphertext hash...");
			const computed32 = blake2b(matchedData, undefined, 32);
			let computedBig = 0n;
			for (const b of computed32) computedBig = (computedBig << 8n) | BigInt(b);
			if (computedBig !== ciphertextHash) {
				setTxStatus("Error: ciphertext integrity failed (Statement Store bytes corrupt)");
				return;
			}

			setTxStatus("Decrypting record...");
			const skStorageKey = `phase5-sk-buyer:${currentAccount.evmAddress}:${ethRpcUrl}:${order.listingId}`;
			const { sk } = getOrCreateBuyerKey(skStorageKey);
			const fields = decryptRecord({
				ephPk: { x: ephPkX, y: ephPkY },
				ciphertextBytes: matchedData,
				skBuyer: sk,
				nonce: order.id,
			});

			// Phase 5.2 off-chain verification — these checks replace the
			// dropped in-circuit binding. If either fails the patient has griefed:
			// (1) recordCommit recomputed from the decrypted plaintext must equal
			//     the recordCommit the medic signed (locked at listing time);
			// (2) medic's EdDSA-Poseidon signature must be valid over recordCommit
			//     under the published medic pubkey.
			setTxStatus("Verifying recordCommit...");
			const recoveredPlaintext = encodeRecordToFieldElements(fields);
			const recomputedCommit = computeRecordCommit(recoveredPlaintext);
			const commitMatch = recomputedCommit === listing.recordCommit;

			setTxStatus("Verifying medic signature...");
			let sigValid = false;
			try {
				sigValid = verifySignature(
					listing.recordCommit,
					{
						R8: [listing.sigR8x, listing.sigR8y],
						S: listing.sigS,
					},
					[listing.medicPkX, listing.medicPkY],
				);
			} catch {
				sigValid = false;
			}

			setDecryptedRecords((prev) => ({
				...prev,
				[order.id.toString()]: {
					orderId: order.id,
					fields,
					commitMatch,
					sigValid,
				},
			}));

			if (!commitMatch) {
				setTxStatus(
					"WARNING: recordCommit mismatch — patient delivered different data than what was committed at listing time.",
				);
			} else if (!sigValid) {
				setTxStatus(
					"WARNING: medic signature invalid — published listing is not signed by the claimed medic pubkey.",
				);
			} else {
				setTxStatus("Decrypted and verified.");
			}
		} catch (e) {
			setTxStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
		}
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
					data via ECDH after the patient fulfills your order.
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
					<label className="label">Account (Researcher)</label>
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

				<Toast message={txStatus} onClose={() => setTxStatus(null)} />
			</div>

			{/* Marketplace */}
			<div className="card space-y-4">
				<div className="flex items-center justify-between">
					<h2 className="section-title">Active Listings</h2>
					<button onClick={loadAll} disabled={loading} className="btn-secondary text-xs">
						{loading ? "Loading..." : "Refresh"}
					</button>
				</div>

				{listings.filter((l) => l.active).length === 0 ? (
					<p className="text-text-secondary text-sm">
						No active listings found. Click Refresh to load.
					</p>
				) : (
					<div className="space-y-2">
						{listings
							.filter((l) => l.active)
							.map((listing) => (
								<div
									key={listing.id.toString()}
									className="rounded-lg border border-white/[0.04] bg-white/[0.02] p-3 text-sm space-y-1.5"
								>
									<div className="flex items-start justify-between gap-2">
										<div>
											<p className="text-text-primary font-medium">
												{listing.title}
											</p>
											<p className="text-text-tertiary text-xs mt-0.5">
												Listing #{listing.id.toString()}
											</p>
										</div>
										{listing.pendingOrderId > 0n ? (
											<span className="px-2 py-0.5 rounded-full bg-white/[0.04] text-text-muted text-xs font-medium whitespace-nowrap">
												Pending order
											</span>
										) : (
											<button
												onClick={() => placeBuyOrder(listing)}
												disabled={loading}
												className="btn-accent text-xs px-3 py-1 whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed"
												style={{
													background:
														"linear-gradient(135deg, #4cc2ff 0%, #0090d4 100%)",
													boxShadow:
														"0 1px 2px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)",
												}}
											>
												{loading ? (
													<>
														<Spinner />
														Placing order…
													</>
												) : (
													<>Buy for {formatEther(listing.price)} PAS</>
												)}
											</button>
										)}
									</div>
									<p className="font-mono text-xs text-text-muted break-all">
										Commit:{" "}
										{listing.recordCommit
											.toString(16)
											.slice(0, 12)
											.padStart(12, "0")}
										…
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
									<div>
										<VerifiedBadge address={listing.patient} />
									</div>
								</div>
							))}
					</div>
				)}
			</div>

			{/* My Orders */}
			<div className="card space-y-4">
				<h2 className="section-title">My Orders</h2>

				{orders.length === 0 ? (
					<p className="text-text-secondary text-sm">
						No orders placed yet. Buy a listing above to get started.
					</p>
				) : (
					<div className="space-y-2">
						{orders.map((order) => {
							const key = order.id.toString();
							const decrypted = decryptedRecords[key];
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
									{!order.confirmed && !order.cancelled && (
										<button
											onClick={() => cancelOrder(order)}
											disabled={loading}
											className="px-2 py-1 rounded-md bg-accent-red/10 text-accent-red text-xs font-medium hover:bg-accent-red/20 transition-colors mt-1 disabled:opacity-60 disabled:cursor-not-allowed"
										>
											{loading ? (
												<>
													<Spinner />
													Cancelling…
												</>
											) : (
												"Cancel & Refund"
											)}
										</button>
									)}
									{order.confirmed && !decrypted && (
										<button
											onClick={() => decryptAndView(order)}
											disabled={loading}
											className="btn-accent text-xs px-3 py-1 mt-1 disabled:opacity-60 disabled:cursor-not-allowed"
											style={{
												background:
													"linear-gradient(135deg, #4cc2ff 0%, #0090d4 100%)",
												boxShadow:
													"0 1px 2px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)",
											}}
										>
											{loading ? (
												<>
													<Spinner />
													{txStatus ?? "Decrypting…"}
												</>
											) : (
												"Decrypt & View"
											)}
										</button>
									)}
									{decrypted && (
										<div className="mt-2 space-y-1">
											<div className="flex flex-wrap gap-2 text-xs">
												<span
													className={`px-1.5 py-0.5 rounded ${decrypted.commitMatch ? "bg-accent-green/10 text-accent-green" : "bg-accent-red/10 text-accent-red"}`}
												>
													{decrypted.commitMatch ? "✓" : "✗"} recordCommit
												</span>
												<span
													className={`px-1.5 py-0.5 rounded ${decrypted.sigValid ? "bg-accent-green/10 text-accent-green" : "bg-accent-red/10 text-accent-red"}`}
												>
													{decrypted.sigValid ? "✓" : "✗"} medic signature
												</span>
											</div>
											<p className="text-text-secondary text-xs font-medium pt-1">
												Decrypted record:
											</p>
											<table className="w-full text-xs border-collapse">
												<tbody>
													{Object.entries(decrypted.fields).map(
														([field, value]) => (
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
														),
													)}
												</tbody>
											</table>
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
