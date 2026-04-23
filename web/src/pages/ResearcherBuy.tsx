import { useState, useEffect, useCallback } from "react";
import { type Address, formatEther, parseEther } from "viem";
import { medicalMarketAbi, getPublicClient } from "../config/evm";
import Spinner from "../components/Spinner";
import Toast from "../components/Toast";
import { getDeploymentForRpc } from "../config/network";
import { subscribeStatements, fetchStatementByHash } from "../hooks/useStatementStore";
import { useReviveCall } from "../hooks/useReviveCall";
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
import { verifySignature } from "@zk-kit/eddsa-poseidon";
import { blake2b } from "blakejs";

interface Listing {
	id: bigint;
	header: MedicalHeader;
	headerCommit: bigint;
	bodyCommit: bigint;
	piiCommit: bigint;
	medicPkX: bigint;
	medicPkY: bigint;
	sigR8x: bigint;
	sigR8y: bigint;
	sigS: bigint;
	price: bigint;
	patient: Address;
	active: boolean;
	pendingOrderId: bigint;
	// Off-chain pre-purchase verification: recompute headerCommit from on-chain
	// header fields and verify medic sig over Poseidon3(headerCommit, bodyCommit, piiCommit).
	headerMatch: boolean;
	sigValid: boolean;
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

interface PendingOffer {
	orderId: bigint;
	amount: bigint;
	researcher: Address;
}

interface DecryptedRecord {
	orderId: bigint;
	fields: Record<string, string>;
	bodyMatch: boolean;
	sigValid: boolean;
}

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

function verifyListingOffChain(
	header: MedicalHeader,
	headerCommit: bigint,
	bodyCommit: bigint,
	piiCommit: bigint,
	medicPk: { x: bigint; y: bigint },
	sig: { R8x: bigint; R8y: bigint; S: bigint },
): { headerMatch: boolean; sigValid: boolean } {
	let headerMatch = false;
	try {
		headerMatch = computeHeaderCommit(header) === headerCommit;
	} catch {
		headerMatch = false;
	}
	let sigValid = false;
	try {
		const combined = computeRecordCommit(headerCommit, bodyCommit, piiCommit);
		sigValid = verifySignature(combined, { R8: [sig.R8x, sig.R8y], S: sig.S }, [
			medicPk.x,
			medicPk.y,
		]);
	} catch {
		sigValid = false;
	}
	return { headerMatch, sigValid };
}

export default function ResearcherBuy() {
	const ethRpcUrl = useChainStore((s) => s.ethRpcUrl);
	const wsUrl = useChainStore((s) => s.wsUrl);

	const storageKey = `medical-market-address:${ethRpcUrl}`;
	const defaultAddress = getDeploymentForRpc(ethRpcUrl).medicalMarket;

	const accounts = useChainStore((s) => s.accounts);
	const selectedAccountIndex = useChainStore((s) => s.selectedAccountIndex);
	const [contractAddress, setContractAddress] = useState("");
	const [listings, setListings] = useState<Listing[]>([]);
	const [orders, setOrders] = useState<Order[]>([]);
	const [txStatus, setTxStatus] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [decryptedRecords, setDecryptedRecords] = useState<Record<string, DecryptedRecord>>({});
	const [stmtCache, setStmtCache] = useState<Map<string, Uint8Array>>(new Map());
	const [pendingOffers, setPendingOffers] = useState<Record<string, PendingOffer>>({});
	const [bidAmounts, setBidAmounts] = useState<Record<string, string>>({});

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

	const currentAccount = accounts[selectedAccountIndex] ?? accounts[0];

	const reviveCall = useReviveCall({
		account: currentAccount,
		contractAddress,
		wsUrl,
		onStatus: setTxStatus,
	});

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
					bigint,
					bigint,
					bigint,
					string,
					boolean,
				];
				const [
					headerCommit,
					bodyCommit,
					piiCommit,
					medicPkX,
					medicPkY,
					sigR8x,
					sigR8y,
					sigS,
					price,
					patient,
					active,
				] = result;

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

				const { headerMatch, sigValid } = verifyListingOffChain(
					header,
					headerCommit,
					bodyCommit,
					piiCommit,
					{ x: medicPkX, y: medicPkY },
					{ R8x: sigR8x, R8y: sigR8y, S: sigS },
				);

				const pendingOrderId = (await client.readContract({
					address: addr,
					abi: medicalMarketAbi,
					functionName: "getPendingOrderId",
					args: [i],
				})) as bigint;
				fetchedListings.push({
					id: i,
					header,
					headerCommit,
					bodyCommit,
					piiCommit,
					medicPkX,
					medicPkY,
					sigR8x,
					sigR8y,
					sigS,
					price,
					patient: patient as Address,
					active,
					pendingOrderId,
					headerMatch,
					sigValid,
				});
			}
			setListings(fetchedListings);

			const offersMap: Record<string, PendingOffer> = {};
			for (const listing of fetchedListings) {
				if (listing.pendingOrderId > 0n) {
					const offerResult = (await client.readContract({
						address: addr,
						abi: medicalMarketAbi,
						functionName: "getOrder",
						args: [listing.pendingOrderId - 1n],
					})) as [bigint, string, bigint, boolean, boolean, bigint, bigint];
					offersMap[listing.id.toString()] = {
						orderId: listing.pendingOrderId - 1n,
						amount: offerResult[2],
						researcher: offerResult[1] as Address,
					};
				}
			}
			setPendingOffers(offersMap);

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

	useEffect(() => {
		if (contractAddress) {
			loadAll();
		} else {
			setListings([]);
			setOrders([]);
			setTxStatus(null);
		}
	}, [contractAddress, ethRpcUrl, loadAll]);

	async function placeBuyOrder(listing: Listing, customAmountWei?: bigint) {
		if (!contractAddress) return;
		try {
			const amountWei = customAmountWei ?? listing.price;
			setTxStatus("Placing order...");
			const skStorageKey = `phase5-sk-buyer:${currentAccount.evmAddress}:${ethRpcUrl}:${listing.id}`;
			const { pk } = getOrCreateBuyerKey(skStorageKey);
			const { txHash } = await reviveCall(
				"placeBuyOrder",
				[listing.id, pk.x, pk.y],
				amountWei,
			);
			setBidAmounts((prev) => ({ ...prev, [listing.id.toString()]: "" }));
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
			let matchedData = stmtCache.get(targetHashHex);

			if (!matchedData) {
				setTxStatus("Cache miss — re-fetching from Statement Store...");
				const fresh = await fetchStatementByHash(wsUrl, targetHashHex);
				if (!fresh) {
					setTxStatus(
						"Patient hasn't uploaded the ciphertext yet — check back in a few blocks.",
					);
					return;
				}
				matchedData = fresh;
				setStmtCache((prev) => new Map(prev).set(targetHashHex, fresh));
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

			// Phase 5.2 off-chain verification after decrypt:
			// (1) bodyCommit recomputed from the decrypted body must match
			//     listing.bodyCommit (locked at listing time);
			// (2) medic's EdDSA-Poseidon signature validity over the combined
			//     recordCommit was already verified pre-purchase and stored on
			//     listing.sigValid — re-reading it here is free.
			setTxStatus("Verifying bodyCommit...");
			const recoveredPlaintext = encodeRecordToFieldElements(fields);
			const recomputedBody = computeBodyCommit(recoveredPlaintext);
			const bodyMatch = recomputedBody === listing.bodyCommit;

			setDecryptedRecords((prev) => ({
				...prev,
				[order.id.toString()]: {
					orderId: order.id,
					fields,
					bodyMatch,
					sigValid: listing.sigValid,
				},
			}));

			if (!bodyMatch) {
				setTxStatus(
					"WARNING: bodyCommit mismatch — patient delivered different data than what was committed at listing time.",
				);
			} else if (!listing.sigValid) {
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
					Browse active medical data listings — each carries a medic-signed header (title,
					type, date, facility) you can verify before paying. Confirmed orders can be
					decrypted via ECDH once the patient fulfills.
				</p>
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

				<div>
					<label className="label">Account (Researcher)</label>
					<div className="input-field w-full text-sm text-text-secondary">
						{accounts[selectedAccountIndex]?.name ?? "—"}{" "}
						<span className="font-mono text-xs text-text-muted">
							{accounts[selectedAccountIndex]?.evmAddress ?? ""}
						</span>
					</div>
				</div>

				<Toast message={txStatus} onClose={() => setTxStatus(null)} />
			</div>

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
							.map((listing) => {
								const medicVerified = listing.headerMatch && listing.sigValid;
								return (
									<div
										key={listing.id.toString()}
										className="rounded-lg border border-white/[0.04] bg-white/[0.02] p-3 text-sm space-y-1.5"
									>
										<div className="flex items-start justify-between gap-2">
											<div className="min-w-0">
												<div className="flex items-center gap-2 flex-wrap">
													<p className="text-text-primary font-medium">
														{listing.header.title}
													</p>
													<span
														className={`text-[10px] font-medium px-1.5 py-0.5 rounded whitespace-nowrap ${
															medicVerified
																? "bg-accent-green/10 text-accent-green"
																: "bg-accent-red/10 text-accent-red"
														}`}
														title={
															medicVerified
																? "headerCommit matches and medic sig valid"
																: !listing.headerMatch
																	? "headerCommit mismatch — header does not hash to what the medic signed"
																	: "medic signature invalid"
														}
													>
														{medicVerified
															? "✓ medic-verified"
															: "✗ unverified"}
													</span>
												</div>
												<div className="flex flex-wrap gap-1.5 mt-1 text-[10px]">
													<span className="px-1.5 py-0.5 rounded bg-polka-500/10 text-polka-400 font-medium">
														{listing.header.recordType}
													</span>
													<span className="px-1.5 py-0.5 rounded bg-white/[0.06] text-text-tertiary">
														{formatRecordedAt(
															listing.header.recordedAt,
														)}
													</span>
													<span className="px-1.5 py-0.5 rounded bg-white/[0.06] text-text-tertiary">
														{listing.header.facility}
													</span>
												</div>
												<p className="text-text-tertiary text-xs mt-1">
													Listing #{listing.id.toString()}
												</p>
											</div>
											{listing.pendingOrderId > 0n ? (
												<span className="px-2 py-0.5 rounded-full bg-accent-yellow/10 text-accent-yellow text-xs font-medium whitespace-nowrap">
													Best:{" "}
													{pendingOffers[listing.id.toString()]
														?.amount !== undefined
														? formatEther(
																pendingOffers[listing.id.toString()]
																	.amount,
															) + " PAS"
														: "?"}
												</span>
											) : (
												<button
													onClick={() => placeBuyOrder(listing)}
													disabled={loading || !medicVerified}
													title={
														!medicVerified
															? "Listing failed off-chain verification"
															: undefined
													}
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
														<>
															Buy for {formatEther(listing.price)} PAS
														</>
													)}
												</button>
											)}
										</div>
										<p className="font-mono text-xs text-text-muted break-all">
											body{" "}
											{listing.bodyCommit
												.toString(16)
												.slice(0, 12)
												.padStart(12, "0")}
											…
										</p>
										<p className="text-[10px] text-text-muted italic">
											PII sealed — identity not disclosed to researcher
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
										{(() => {
											const offer = pendingOffers[listing.id.toString()];
											const isMyOffer =
												offer &&
												offer.researcher.toLowerCase() ===
													currentAccount.evmAddress.toLowerCase();
											if (listing.pendingOrderId === 0n) return null;
											if (isMyOffer)
												return (
													<p className="text-xs text-accent-yellow">
														You hold the best offer — cancel it from My
														Orders below.
													</p>
												);
											return (
												<div className="flex gap-2 items-center flex-wrap">
													<input
														type="text"
														value={
															bidAmounts[listing.id.toString()] ?? ""
														}
														onChange={(e) =>
															setBidAmounts((prev) => ({
																...prev,
																[listing.id.toString()]:
																	e.target.value,
															}))
														}
														placeholder={`> ${offer ? formatEther(offer.amount) : "?"} PAS`}
														className="input-field w-28 text-xs py-1"
													/>
													<button
														onClick={() => {
															const raw =
																bidAmounts[listing.id.toString()];
															if (
																!raw ||
																isNaN(Number(raw)) ||
																Number(raw) <= 0
															)
																return;
															placeBuyOrder(listing, parseEther(raw));
														}}
														disabled={loading || !medicVerified}
														className="btn-accent text-xs px-3 py-1 whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed"
														style={{
															background:
																"linear-gradient(135deg, #4cc2ff 0%, #0090d4 100%)",
															boxShadow:
																"0 1px 2px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)",
														}}
													>
														{loading ? <Spinner /> : "Outbid"}
													</button>
												</div>
											);
										})()}
									</div>
								);
							})}
					</div>
				)}
			</div>

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
													className={`px-1.5 py-0.5 rounded ${decrypted.bodyMatch ? "bg-accent-green/10 text-accent-green" : "bg-accent-red/10 text-accent-red"}`}
												>
													{decrypted.bodyMatch ? "✓" : "✗"} bodyCommit
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
