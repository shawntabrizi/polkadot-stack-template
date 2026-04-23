import { useState, useEffect, useCallback } from "react";
import { getDeploymentForRpc } from "../config/network";
import { getPublicClient } from "../config/evm";
import { getClient } from "../hooks/useChain";
import { getStackTemplateDescriptor } from "../hooks/useConnection";
import { useChainStore } from "../store/chainStore";
import CopyButton from "../components/CopyButton";
import Spinner from "../components/Spinner";
import Toast from "../components/Toast";
import {
	medicAuthorityFullAbi,
	buildInnerCallForAction,
	otherSignatoriesFor,
	propose,
	approve,
	getPendingForCall,
	listPending,
	submitHintProposal,
	ensureMapped,
	isMapped,
	isStaleProposalError,
	NO_TARGET,
	type GovernanceAction,
	type MultisigInfo,
	type Timepoint,
} from "../lib/multisigAuthority";

// LS key for storing proposal hints so the approver can see action + target labels
const HINTS_KEY = "medic-authority-pending";

interface PendingHint {
	action: GovernanceAction;
	target: `0x${string}`;
	proposedAt: number;
}

interface PendingEntry {
	callHash: `0x${string}`;
	info: MultisigInfo;
	hint?: PendingHint;
}

function loadHints(): Record<string, PendingHint> {
	try {
		return JSON.parse(localStorage.getItem(HINTS_KEY) ?? "{}");
	} catch {
		return {};
	}
}

function saveHint(callHash: string, hint: PendingHint) {
	const hints = loadHints();
	hints[callHash.toLowerCase()] = hint;
	localStorage.setItem(HINTS_KEY, JSON.stringify(hints));
}

function removeHint(callHash: string) {
	const hints = loadHints();
	delete hints[callHash.toLowerCase()];
	localStorage.setItem(HINTS_KEY, JSON.stringify(hints));
}

function lookupHint(hints: Record<string, PendingHint>, callHash: string): PendingHint | undefined {
	return hints[callHash.toLowerCase()];
}

function shortHash(h: string) {
	return `${h.slice(0, 10)}…${h.slice(-8)}`;
}

function actionLabel(method: GovernanceAction): string {
	return {
		addMedic: "Add Medic",
		removeMedic: "Remove Medic",
		transferOwnership: "Transfer Ownership",
		mapAccount: "Map Multisig (Revive.map_account)",
	}[method];
}

export default function GovernanceDashboard() {
	const ethRpcUrl = useChainStore((s) => s.ethRpcUrl);
	const wsUrl = useChainStore((s) => s.wsUrl);

	const deployment = getDeploymentForRpc(ethRpcUrl);
	const ms = deployment.multisig;
	const authorityAddr = deployment.medicAuthority as `0x${string}` | null;

	const accounts = useChainStore((s) => s.accounts);
	const signatoryAccounts = accounts.filter((a) => ms?.signatories.includes(a.address));
	const [proposerIdx, setProposerIdx] = useState(0);
	const [approverIdx, setApproverIdx] = useState(1);

	// Debug banners hidden by default. Enable via `?debug=1` in the URL or
	// `localStorage.governanceDebug = "1"`. Persists once set via URL so a hard reload keeps it.
	const [showDebug] = useState<boolean>(() => {
		if (typeof window === "undefined") return false;
		const fromUrl = new URLSearchParams(window.location.search).get("debug") === "1";
		if (fromUrl) localStorage.setItem("governanceDebug", "1");
		return fromUrl || localStorage.getItem("governanceDebug") === "1";
	});

	// Owner / medic status
	const [contractOwner, setContractOwner] = useState<string | null>(null);
	const [medicStatuses, setMedicStatuses] = useState<Record<string, boolean | null>>({});
	const [multisigMapped, setMultisigMapped] = useState<boolean | null>(null);

	// Proposal form
	const [actionMethod, setActionMethod] = useState<GovernanceAction>("addMedic");
	const [actionTarget, setActionTarget] = useState("");

	// Pending on-chain entries
	const [pendingEntries, setPendingEntries] = useState<PendingEntry[]>([]);

	// Per-entry guess for hintless pending entries (different browser / hint tx failed)
	const [guesses, setGuesses] = useState<
		Record<`0x${string}`, { action: GovernanceAction; target: string }>
	>({});

	const getGuess = (callHash: `0x${string}`) =>
		guesses[callHash] ?? { action: "addMedic" as GovernanceAction, target: "" };

	function setGuessField(callHash: `0x${string}`, field: "action" | "target", value: string) {
		setGuesses((prev) => ({
			...prev,
			[callHash]: {
				...(prev[callHash] ?? { action: "addMedic", target: "" }),
				[field]: value,
			},
		}));
	}

	// Medic lookup
	const [lookupAddr, setLookupAddr] = useState("");
	const [lookupResult, setLookupResult] = useState<boolean | null>(null);
	const [lookupLoading, setLookupLoading] = useState(false);

	const [txStatus, setTxStatus] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	const readStatuses = useCallback(async () => {
		if (!authorityAddr) return;
		const client = getPublicClient(ethRpcUrl);
		const addrs = accounts.map((a) => a.evmAddress);

		const [owner, medics] = await Promise.all([
			client
				.readContract({
					address: authorityAddr,
					abi: medicAuthorityFullAbi,
					functionName: "owner",
				})
				.then((r) => (r as string).toLowerCase())
				.catch(() => null),
			Promise.all(
				addrs.map((addr) =>
					client
						.readContract({
							address: authorityAddr,
							abi: medicAuthorityFullAbi,
							functionName: "isVerifiedMedic",
							args: [addr],
						})
						.then((r) => r as boolean)
						.catch(() => null),
				),
			),
		]);

		const medicMap: Record<string, boolean | null> = {};
		addrs.forEach((addr, i) => {
			medicMap[addr] = medics[i];
		});
		setContractOwner(owner);
		setMedicStatuses(medicMap);
	}, [ethRpcUrl, authorityAddr, accounts]);

	const readPending = useCallback(async () => {
		if (!ms || !authorityAddr) return;
		try {
			const client = getClient(wsUrl);
			const descriptor = await getStackTemplateDescriptor();
			const api = client.getTypedApi(descriptor);
			setMultisigMapped(await isMapped(api, ms.h160 as `0x${string}`));
			const entries = await listPending(api, ms.ss58);
			const hints = loadHints();

			// For entries without a cached localStorage hint, read the persistent
			// Proposal mapping on MedicAuthority. This is a deterministic view call
			// against contract storage — no log indexer, no archival-node dependency.
			const evmClient = getPublicClient(ethRpcUrl);
			const missingHashes = entries
				.filter((e) => !lookupHint(hints, e.callHash))
				.map((e) => e.callHash);

			if (missingHashes.length > 0) {
				const results = await Promise.all(
					missingHashes.map((callHash) =>
						evmClient
							.readContract({
								address: authorityAddr,
								abi: medicAuthorityFullAbi,
								functionName: "getProposal",
								args: [callHash],
							})
							.then((r) => ({ callHash, result: r as [string, string, bigint] }))
							.catch(() => null),
					),
				);
				for (const r of results) {
					if (!r) continue;
					const [action, target, proposedAt] = r.result;
					if (proposedAt === 0n || !action || !target) continue;
					const hint: PendingHint = {
						action: action as GovernanceAction,
						target: target as `0x${string}`,
						proposedAt: Number(proposedAt),
					};
					saveHint(r.callHash, hint);
					hints[r.callHash.toLowerCase()] = hint;
				}
			}

			setPendingEntries(entries.map((e) => ({ ...e, hint: lookupHint(hints, e.callHash) })));
		} catch (err) {
			console.error("[readPending]", err);
		}
	}, [wsUrl, ms, authorityAddr, ethRpcUrl]);

	useEffect(() => {
		readStatuses();
	}, [readStatuses]);

	useEffect(() => {
		readPending();
		const interval = setInterval(readPending, 6000);
		return () => clearInterval(interval);
	}, [readPending]);

	async function proposeAction(action: GovernanceAction, target: `0x${string}`) {
		if (!ms || !authorityAddr) return setTxStatus("Error: contracts not deployed");

		const proposer = signatoryAccounts[proposerIdx];
		if (!proposer)
			return setTxStatus(
				"Error: no multisig signatory loaded in your wallet. Import the keystore JSONs.",
			);

		setLoading(true);
		setTxStatus("Building inner call…");
		try {
			const client = getClient(wsUrl);
			const descriptor = await getStackTemplateDescriptor();
			const api = client.getTypedApi(descriptor);

			const innerCall = buildInnerCallForAction(api, action, target, authorityAddr);
			const others = otherSignatoriesFor(ms.signatories, proposer.address);

			setTxStatus("Submitting proposal…");
			const result = await propose(api, proposer.signer, others, ms.threshold, innerCall);

			saveHint(result.callHash, { action, target, proposedAt: Date.now() });

			// Emit hint on-chain so approvers in other sessions see action + target automatically
			try {
				setTxStatus("Emitting on-chain hint…");
				await submitHintProposal(
					api,
					proposer.signer,
					proposer.evmAddress,
					authorityAddr,
					result.callHash,
					action,
					target,
				);
			} catch (hintErr) {
				console.warn("[hintProposal] non-fatal:", hintErr);
			}

			setTxStatus(
				`Proposal submitted. CallHash: ${shortHash(result.callHash)}  (tx: ${result.txHash.slice(0, 14)}…)`,
			);
			await new Promise((r) => setTimeout(r, 3000));
			await readPending();
			await readStatuses();
		} catch (e) {
			setTxStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
		} finally {
			setLoading(false);
		}
	}

	/**
	 * Returns "changed" if the on-chain effect of `hint` is present, "unchanged" otherwise.
	 * Used after approve() to catch silent inner-call reverts (pallet-multisig reports the
	 * outer as_multi as ok even when the dispatched Revive.call reverts).
	 */
	async function verifyDispatchOutcome(
		hint: PendingHint,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		api: any,
	): Promise<"changed" | "unchanged"> {
		if (!authorityAddr || !ms) return "changed";
		try {
			if (hint.action === "mapAccount") {
				const mapped = await isMapped(api, ms.h160 as `0x${string}`);
				return mapped ? "changed" : "unchanged";
			}
			const client = getPublicClient(ethRpcUrl);
			if (hint.action === "addMedic") {
				const verified = (await client.readContract({
					address: authorityAddr,
					abi: medicAuthorityFullAbi,
					functionName: "isVerifiedMedic",
					args: [hint.target],
				})) as boolean;
				return verified ? "changed" : "unchanged";
			}
			if (hint.action === "removeMedic") {
				const verified = (await client.readContract({
					address: authorityAddr,
					abi: medicAuthorityFullAbi,
					functionName: "isVerifiedMedic",
					args: [hint.target],
				})) as boolean;
				return verified ? "unchanged" : "changed";
			}
			if (hint.action === "transferOwnership") {
				const owner = (await client.readContract({
					address: authorityAddr,
					abi: medicAuthorityFullAbi,
					functionName: "owner",
				})) as string;
				return owner.toLowerCase() === hint.target.toLowerCase() ? "changed" : "unchanged";
			}
			return "changed";
		} catch {
			return "changed";
		}
	}

	async function handleApprove(entry: PendingEntry) {
		if (!ms || !authorityAddr) return setTxStatus("Error: contracts not deployed");

		let hint = entry.hint;
		if (!hint) {
			const g = getGuess(entry.callHash);
			if (g.action === "mapAccount") {
				hint = { action: "mapAccount", target: NO_TARGET, proposedAt: 0 };
			} else {
				const target = g.target.trim();
				if (!/^0x[0-9a-fA-F]{40}$/.test(target))
					return setTxStatus("Error: enter a valid target H160 address");
				hint = { action: g.action, target: target as `0x${string}`, proposedAt: 0 };
			}
		}

		const approver = signatoryAccounts[approverIdx];
		if (!approver)
			return setTxStatus(
				"Error: no multisig signatory loaded in your wallet. Import the keystore JSONs.",
			);

		setLoading(true);
		setTxStatus("Fetching timepoint from chain…");
		try {
			const client = getClient(wsUrl);
			const descriptor = await getStackTemplateDescriptor();
			const api = client.getTypedApi(descriptor);

			// Auto-map the approver's H160 so the multisig-dispatched Revive.call
			// doesn't revert with "account unmapped" on their end. The multisig's
			// own H160 is checked separately (see multisigMapped banner) because
			// only the multisig itself can register its mapping.
			await ensureMapped(api, approver.signer, approver.evmAddress);

			// Fetch fresh timepoint from chain (source of truth)
			const pending = await getPendingForCall(api, ms.ss58, entry.callHash);
			if (!pending) {
				setTxStatus("Proposal already executed or cancelled — refreshing.");
				await readPending();
				await readStatuses();
				return;
			}
			const timepoint: Timepoint = pending.when;

			const innerCall = buildInnerCallForAction(api, hint.action, hint.target, authorityAddr);
			const others = otherSignatoriesFor(ms.signatories, approver.address);

			setTxStatus("Approving & executing…");
			const result = await approve(
				api,
				approver.signer,
				others,
				ms.threshold,
				innerCall,
				timepoint,
			);

			// Persist the guess as a hint so other sessions see it too
			if (!entry.hint) saveHint(entry.callHash, { ...hint, proposedAt: Date.now() });
			else removeHint(entry.callHash);

			setTxStatus(
				`Executed! ${actionLabel(hint.action)} for ${hint.target.slice(0, 10)}…  (tx: ${result.txHash.slice(0, 14)}…)`,
			);
			await new Promise((r) => setTimeout(r, 3000));
			await readPending();
			await readStatuses();

			// Verify the inner call actually changed state. Pallet-multisig's "ok" only
			// means threshold reached + dispatched; the dispatched Revive.call can still
			// revert silently (multisig unmapped, not owner, addMedic require-fail).
			const expectedChange = await verifyDispatchOutcome(hint, api);
			if (expectedChange === "unchanged") {
				const nowMapped = await isMapped(api, ms.h160 as `0x${string}`);
				const why = !nowMapped
					? "multisig H160 is not mapped in pallet-revive — propose Revive.map_account first"
					: hint.action === "mapAccount"
						? "Revive.map_account dispatch reverted inside as_multi"
						: "inner call reverted (likely wrong owner, or the target already matched / never matched the require)";
				setTxStatus(`Multisig executed but state didn't change: ${why}.`);
			}
		} catch (e) {
			if (isStaleProposalError(e)) {
				// Re-query so we can tell race (entry gone) from mismatch (entry still there).
				let stillPending = false;
				try {
					const client = getClient(wsUrl);
					const descriptor = await getStackTemplateDescriptor();
					const api = client.getTypedApi(descriptor);
					stillPending = Boolean(await getPendingForCall(api, ms.ss58, entry.callHash));
				} catch {
					// fall back to mismatch message below if we couldn't re-query
				}
				if (!stillPending) {
					setTxStatus("Proposal already executed or cancelled — refreshing.");
				} else {
					setTxStatus(
						"Action or target doesn't match the proposed call. Check your inputs and try again.",
					);
				}
				await readPending();
				await readStatuses();
			} else {
				setTxStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
			}
		} finally {
			setLoading(false);
		}
	}

	async function handleLookup() {
		if (!authorityAddr) return;
		const addr = lookupAddr.trim() as `0x${string}`;
		if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) {
			setLookupResult(null);
			return;
		}
		setLookupLoading(true);
		try {
			const client = getPublicClient(ethRpcUrl);
			const result = await client.readContract({
				address: authorityAddr,
				abi: medicAuthorityFullAbi,
				functionName: "isVerifiedMedic",
				args: [addr],
			});
			setLookupResult(result as boolean);
		} catch {
			setLookupResult(null);
		} finally {
			setLookupLoading(false);
		}
	}

	// Map sr25519-derived H160 addresses to account names
	const devAddrNames: Record<string, string> = {};
	accounts.forEach((a) => {
		devAddrNames[a.evmAddress.toLowerCase()] = a.name;
	});

	function statusDot(val: boolean | null | undefined) {
		if (val === null || val === undefined) return <span className="text-text-muted">—</span>;
		return val ? (
			<span className="text-accent-green font-medium">✓</span>
		) : (
			<span className="text-text-tertiary">✗</span>
		);
	}

	return (
		<div className="space-y-6">
			{/* Header */}
			<div>
				<h1 className="text-2xl font-bold text-text-primary font-display">Governance</h1>
				<p className="text-text-secondary text-sm mt-1">
					Manage medic authority via the {ms?.threshold ?? 2}-of-
					{ms?.signatories.length ?? 3} multisig
					{signatoryAccounts.length > 0 &&
						` (${signatoryAccounts.map((a) => a.name).join(" · ")} loaded in wallet)`}
				</p>
			</div>

			{/* No signatory loaded warning */}
			{ms && signatoryAccounts.length === 0 && (
				<div className="card border-red-500/30 bg-red-500/5 space-y-2">
					<p className="text-red-400 text-sm font-medium">
						None of the multisig signatories are loaded in your wallet.
					</p>
					<p className="text-text-secondary text-xs">
						Expected one of these SS58 accounts to be imported into Talisman /
						Polkadot.js extension:
					</p>
					<ul className="text-text-tertiary text-xs font-mono space-y-0.5">
						{ms.signatories.map((s) => (
							<li key={s}>{s}</li>
						))}
					</ul>
					<p className="text-text-secondary text-xs">
						For Paseo, import <code>Council1.json</code>, <code>Council2.json</code>,{" "}
						<code>Medic.json</code> keystores. For local, the deploy script reads the
						same keystore files to derive the multisig.
					</p>
				</div>
			)}

			{/* Multisig not mapped warning — debug-only, deploy script should map it. */}
			{showDebug && ms && multisigMapped === false && (
				<div className="card border-yellow-500/30 bg-yellow-500/5 space-y-3">
					<p className="text-yellow-400 text-sm">
						Multisig H160 <code className="text-text-primary font-mono">{ms.h160}</code>{" "}
						is not registered with pallet-revive. Any <code>Revive.call</code>{" "}
						dispatched via <code>as_multi</code> will revert with{" "}
						<b>"account unmapped"</b>. Fix: propose <code>Revive.map_account()</code>{" "}
						through the multisig ({ms.threshold}
						-of-{ms.signatories.length} approvals).
					</p>
					<button
						className="btn-primary text-xs px-3 py-1.5"
						onClick={() => proposeAction("mapAccount", NO_TARGET)}
						disabled={loading || signatoryAccounts.length === 0}
						title={
							signatoryAccounts.length === 0
								? "Import a multisig signatory keystore first"
								: undefined
						}
					>
						{loading ? "Submitting…" : "Propose Revive.map_account"}
					</button>
				</div>
			)}

			{/* Not deployed warning */}
			{!authorityAddr && (
				<div className="card border-yellow-500/30 bg-yellow-500/5">
					<p className="text-yellow-400 text-sm">
						MedicAuthority not deployed. Run{" "}
						<code className="text-text-primary">npm run deploy:medic-authority</code>{" "}
						first.
					</p>
				</div>
			)}

			{/* Section 1: Status */}
			<div className="card space-y-4">
				<div className="flex items-center justify-between">
					<h2 className="text-base font-semibold text-text-primary">
						Authority & Medic Status
					</h2>
					<button
						onClick={() => {
							readStatuses();
							readPending();
						}}
						className="btn-secondary text-xs px-2 py-1"
						disabled={loading}
					>
						Refresh
					</button>
				</div>

				{ms && (
					<div className="space-y-1 text-sm">
						<div className="flex items-center gap-2">
							<span className="text-text-tertiary w-28 shrink-0">Multisig SS58</span>
							<span className="text-text-secondary font-mono text-xs truncate">
								{ms.ss58}
							</span>
							<CopyButton value={ms.ss58} />
						</div>
						<div className="flex items-center gap-2">
							<span className="text-text-tertiary w-28 shrink-0">Multisig H160</span>
							<span className="text-text-secondary font-mono text-xs">{ms.h160}</span>
							<CopyButton value={ms.h160} />
						</div>
						<div className="flex items-center gap-2">
							<span className="text-text-tertiary w-28 shrink-0">Threshold</span>
							<span className="text-text-secondary">
								{ms.threshold}-of-{ms.signatories.length}
							</span>
						</div>
						{contractOwner !== null && (
							<div className="flex items-center gap-2">
								<span className="text-text-tertiary w-28 shrink-0">Owner</span>
								<span className="text-text-secondary font-mono text-xs">
									{contractOwner}
								</span>
								<CopyButton value={contractOwner} />
							</div>
						)}
					</div>
				)}

				<table className="w-full text-sm">
					<thead>
						<tr className="text-text-tertiary text-left">
							<th className="pb-2 font-medium w-20">Account</th>
							<th className="pb-2 font-medium w-36 text-xs">H160</th>
							<th className="pb-2 font-medium text-center">Owner</th>
							<th className="pb-2 font-medium text-center">Verified Medic</th>
						</tr>
					</thead>
					<tbody>
						{ms && (
							<tr className="border-t border-white/[0.04]">
								<td className="py-2 text-text-primary font-medium">Multisig</td>
								<td className="py-2 font-mono text-xs text-text-tertiary">
									{ms.h160.slice(0, 10)}…{ms.h160.slice(-6)}
								</td>
								<td className="py-2 text-center">
									{statusDot(
										contractOwner !== null
											? contractOwner === ms.h160.toLowerCase()
											: null,
									)}
								</td>
								<td className="py-2 text-center">
									{statusDot(medicStatuses[ms.h160 as `0x${string}`])}
								</td>
							</tr>
						)}
						{accounts.map((a) => {
							const addr = a.evmAddress;
							return (
								<tr key={addr} className="border-t border-white/[0.04]">
									<td className="py-2 text-text-primary font-medium">{a.name}</td>
									<td className="py-2 font-mono text-xs text-text-tertiary">
										{addr.slice(0, 10)}…{addr.slice(-6)}
									</td>
									<td className="py-2 text-center">
										{statusDot(
											contractOwner !== null
												? contractOwner === addr.toLowerCase()
												: null,
										)}
									</td>
									<td className="py-2 text-center">
										{statusDot(medicStatuses[addr])}
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>

			{/* Section 2: Propose Action */}
			<div className="card space-y-4">
				<h2 className="text-base font-semibold text-text-primary">Propose Action</h2>
				<p className="text-text-tertiary text-xs">
					First signer creates a pending multisig entry. Second signer approves below.
				</p>

				<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
					{/* Proposing account */}
					<div className="space-y-1">
						<label className="block text-xs text-text-tertiary">
							Proposing account
						</label>
						<select
							className="input w-full"
							value={proposerIdx}
							onChange={(e) => setProposerIdx(Number(e.target.value))}
						>
							{signatoryAccounts.map((acc, i) => (
								<option key={acc.address} value={i}>
									{acc.name} ({acc.evmAddress.slice(0, 8)}…)
								</option>
							))}
						</select>
					</div>

					{/* Action */}
					<div className="space-y-1">
						<label className="block text-xs text-text-tertiary">Action</label>
						<select
							className="input w-full"
							value={actionMethod}
							onChange={(e) => setActionMethod(e.target.value as GovernanceAction)}
						>
							<option value="addMedic">Add Medic</option>
							<option value="removeMedic">Remove Medic</option>
							<option value="transferOwnership">Transfer Ownership</option>
						</select>
					</div>
				</div>

				{/* Target address */}
				<div className="space-y-1">
					<label className="block text-xs text-text-tertiary">Target H160 address</label>
					<div className="flex gap-2">
						<input
							className="input flex-1 font-mono text-sm"
							placeholder="0x…"
							value={actionTarget}
							onChange={(e) => setActionTarget(e.target.value)}
						/>
					</div>
					{/* Quick-pick buttons */}
					<div className="flex gap-2 flex-wrap">
						{accounts.map((a) => (
							<button
								key={a.name}
								className="btn-secondary text-xs px-2 py-0.5"
								onClick={() => setActionTarget(a.evmAddress)}
							>
								{a.name}
							</button>
						))}
					</div>
				</div>

				<button
					className="btn-primary"
					onClick={() => {
						const target = actionTarget.trim();
						if (!/^0x[0-9a-fA-F]{40}$/.test(target))
							return setTxStatus("Error: target must be a valid H160 address (0x…)");
						proposeAction(actionMethod, target as `0x${string}`);
					}}
					disabled={loading || !authorityAddr || !ms || signatoryAccounts.length === 0}
					title={
						signatoryAccounts.length === 0
							? "Import a multisig signatory keystore first"
							: undefined
					}
				>
					{loading ? "Submitting…" : "Propose"}
				</button>
			</div>

			{/* Section 3: Pending Approvals */}
			<div className="card space-y-4">
				<h2 className="text-base font-semibold text-text-primary">Pending Approvals</h2>

				{/* Approving account */}
				<div className="space-y-1">
					<label className="block text-xs text-text-tertiary">Approving account</label>
					<select
						className="input w-full sm:w-64"
						value={approverIdx}
						onChange={(e) => setApproverIdx(Number(e.target.value))}
					>
						{signatoryAccounts.map((acc, i) => (
							<option key={acc.address} value={i}>
								{acc.name} ({acc.evmAddress.slice(0, 8)}…)
							</option>
						))}
					</select>
				</div>

				{pendingEntries.length === 0 ? (
					<p className="text-text-muted text-sm">No pending proposals on-chain.</p>
				) : (
					<div className="space-y-3">
						{pendingEntries.map((entry) => (
							<div
								key={entry.callHash}
								className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3 space-y-2"
							>
								<div className="flex items-start justify-between gap-3 flex-wrap">
									<div className="space-y-0.5">
										{entry.hint ? (
											<p className="text-text-primary font-medium text-sm">
												{actionLabel(entry.hint.action)}{" "}
												<span className="font-mono text-polka-400">
													{entry.hint.target.slice(0, 10)}…
													{entry.hint.target.slice(-6)}
												</span>
												{devAddrNames[entry.hint.target.toLowerCase()] && (
													<span className="ml-1 text-text-tertiary text-xs">
														(
														{
															devAddrNames[
																entry.hint.target.toLowerCase()
															]
														}
														)
													</span>
												)}
											</p>
										) : (
											<p className="text-accent-yellow text-sm font-medium">
												Proposal details unknown
											</p>
										)}
										<p className="text-text-tertiary text-xs font-mono">
											{shortHash(entry.callHash)}
										</p>
										<p className="text-text-muted text-xs">
											Block {entry.info.when.height} ·{" "}
											{entry.info.approvals.length} approval(s)
										</p>
									</div>
									<button
										className="btn-primary text-xs px-3 py-1.5 shrink-0"
										onClick={() => handleApprove(entry)}
										disabled={
											loading ||
											(!entry.hint &&
												getGuess(entry.callHash).action !== "mapAccount" &&
												!/^0x[0-9a-fA-F]{40}$/.test(
													getGuess(entry.callHash).target.trim(),
												))
										}
									>
										Approve & Execute
									</button>
								</div>
								{!entry.hint &&
									(() => {
										const g = getGuess(entry.callHash);
										return (
											<div className="pt-1 space-y-2">
												<p className="text-text-tertiary text-xs">
													Enter the action and target that was proposed.
													If they don't match, the chain rejects the
													approval and we'll tell you.
												</p>
												<div className="flex flex-wrap gap-2 items-end">
													<select
														className="input-field text-xs py-1 px-2"
														value={g.action}
														onChange={(e) =>
															setGuessField(
																entry.callHash,
																"action",
																e.target.value,
															)
														}
													>
														<option value="addMedic">Add Medic</option>
														<option value="removeMedic">
															Remove Medic
														</option>
														<option value="transferOwnership">
															Transfer Ownership
														</option>
														<option value="mapAccount">
															Map Multisig
														</option>
													</select>
													{g.action !== "mapAccount" && (
														<input
															className="input-field text-xs py-1 px-2 flex-1 min-w-[160px] font-mono"
															placeholder="0x… target H160"
															value={g.target}
															onChange={(e) =>
																setGuessField(
																	entry.callHash,
																	"target",
																	e.target.value,
																)
															}
														/>
													)}
													<div className="flex gap-1">
														{g.action !== "mapAccount" &&
															accounts.map((a) => (
																<button
																	key={a.evmAddress}
																	className="btn-outline text-xs px-2 py-1"
																	onClick={() =>
																		setGuessField(
																			entry.callHash,
																			"target",
																			a.evmAddress,
																		)
																	}
																>
																	{a.name}
																</button>
															))}
													</div>
												</div>
											</div>
										);
									})()}
							</div>
						))}
					</div>
				)}
			</div>

			<Toast message={txStatus} onClose={() => setTxStatus(null)} />

			{/* Section 4: Medic Lookup */}
			<div className="card space-y-4">
				<h2 className="text-base font-semibold text-text-primary">Medic Lookup</h2>
				<div className="flex gap-2">
					<input
						className="input flex-1 font-mono text-sm"
						placeholder="0x… H160 address"
						value={lookupAddr}
						onChange={(e) => {
							setLookupAddr(e.target.value);
							setLookupResult(null);
						}}
					/>
					<button
						className="btn-secondary"
						onClick={handleLookup}
						disabled={!authorityAddr || lookupLoading}
					>
						{lookupLoading ? (
							<>
								<Spinner />
								Checking…
							</>
						) : (
							"Check"
						)}
					</button>
				</div>
				<div className="flex gap-2 flex-wrap">
					{accounts.map((a) => (
						<button
							key={a.name}
							className="btn-secondary text-xs px-2 py-0.5"
							onClick={() => {
								setLookupAddr(a.evmAddress);
								setLookupResult(null);
							}}
						>
							{a.name}
						</button>
					))}
				</div>
				{lookupResult !== null && (
					<p
						className={`text-sm font-medium ${lookupResult ? "text-accent-green" : "text-text-muted"}`}
					>
						{lookupResult ? "✓ Verified medic" : "✗ Not a verified medic"}
					</p>
				)}
			</div>
		</div>
	);
}
