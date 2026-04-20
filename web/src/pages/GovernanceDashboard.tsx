import { useState, useEffect, useCallback } from "react";
import { deployments } from "../config/deployments";
import { getPublicClient } from "../config/evm";
import { devAccounts, getAccountsWithFallback, type AppAccount } from "../hooks/useAccount";
import { getClient } from "../hooks/useChain";
import { getStackTemplateDescriptor } from "../hooks/useConnection";
import { useChainStore } from "../store/chainStore";
import CopyButton from "../components/CopyButton";
import Spinner from "../components/Spinner";
import Toast from "../components/Toast";
import {
	medicAuthorityFullAbi,
	encodeAuthorityCall,
	buildReviveInnerTx,
	otherSignatoriesFor,
	computeCallHash,
	propose,
	approve,
	getPendingForCall,
	listPending,
	type AuthorityMethod,
	type MultisigInfo,
	type Timepoint,
} from "../lib/multisigAuthority";

// LS key for storing proposal hints so the approver can see action + target labels
const HINTS_KEY = "medic-authority-pending";

interface PendingHint {
	action: AuthorityMethod;
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
	hints[callHash] = hint;
	localStorage.setItem(HINTS_KEY, JSON.stringify(hints));
}

function removeHint(callHash: string) {
	const hints = loadHints();
	delete hints[callHash];
	localStorage.setItem(HINTS_KEY, JSON.stringify(hints));
}

function shortHash(h: string) {
	return `${h.slice(0, 10)}…${h.slice(-8)}`;
}

function actionLabel(method: AuthorityMethod): string {
	return {
		addMedic: "Add Medic",
		removeMedic: "Remove Medic",
		addAuthority: "Add Authority",
		removeAuthority: "Remove Authority",
	}[method];
}

export default function GovernanceDashboard() {
	const ethRpcUrl = useChainStore((s) => s.ethRpcUrl);
	const wsUrl = useChainStore((s) => s.wsUrl);

	const ms = deployments.multisig;
	const authorityAddr = deployments.medicAuthority as `0x${string}` | null;

	// Accounts
	const [accounts, setAccounts] = useState<AppAccount[]>(devAccounts);
	const [proposerIdx, setProposerIdx] = useState(0);
	const [approverIdx, setApproverIdx] = useState(1);

	// Authority / medic status
	const [authStatuses, setAuthStatuses] = useState<Record<string, boolean | null>>({});
	const [medicStatuses, setMedicStatuses] = useState<Record<string, boolean | null>>({});
	const [authorityCount, setAuthorityCount] = useState<number | null>(null);

	// Proposal form
	const [actionMethod, setActionMethod] = useState<AuthorityMethod>("addMedic");
	const [actionTarget, setActionTarget] = useState("");

	// Pending on-chain entries
	const [pendingEntries, setPendingEntries] = useState<PendingEntry[]>([]);

	// Manual hint override for entries missing localStorage data
	const [overrideAction, setOverrideAction] = useState<AuthorityMethod>("addMedic");
	const [overrideTarget, setOverrideTarget] = useState("");

	// Medic lookup
	const [lookupAddr, setLookupAddr] = useState("");
	const [lookupResult, setLookupResult] = useState<boolean | null>(null);
	const [lookupLoading, setLookupLoading] = useState(false);

	const [txStatus, setTxStatus] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		getAccountsWithFallback()
			.then(setAccounts)
			.catch(() => setAccounts(devAccounts));
	}, []);

	const readStatuses = useCallback(async () => {
		if (!authorityAddr) return;
		const client = getPublicClient(ethRpcUrl);
		const multisigH160 = ms?.h160 as `0x${string}` | undefined;
		const addrs = [
			...(multisigH160 ? [multisigH160] : []),
			...devAccounts.map((a) => a.evmAddress),
		];

		const [auths, medics, count] = await Promise.all([
			Promise.all(
				addrs.map((addr) =>
					client
						.readContract({
							address: authorityAddr,
							abi: medicAuthorityFullAbi,
							functionName: "isAuthority",
							args: [addr],
						})
						.then((r) => r as boolean)
						.catch(() => null),
				),
			),
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
			client
				.readContract({
					address: authorityAddr,
					abi: medicAuthorityFullAbi,
					functionName: "authorityCount",
				})
				.then((r) => Number(r as bigint))
				.catch(() => null),
		]);

		const authMap: Record<string, boolean | null> = {};
		const medicMap: Record<string, boolean | null> = {};
		addrs.forEach((addr, i) => {
			authMap[addr] = auths[i];
			medicMap[addr] = medics[i];
		});
		setAuthStatuses(authMap);
		setMedicStatuses(medicMap);
		setAuthorityCount(count);
	}, [ethRpcUrl, authorityAddr]); // eslint-disable-line react-hooks/exhaustive-deps

	const readPending = useCallback(async () => {
		if (!ms) return;
		try {
			const client = getClient(wsUrl);
			const descriptor = await getStackTemplateDescriptor();
			const api = client.getTypedApi(descriptor);
			const entries = await listPending(api, ms.ss58);
			const hints = loadHints();
			setPendingEntries(entries.map((e) => ({ ...e, hint: hints[e.callHash] })));
		} catch (err) {
			console.error("[readPending]", err);
		}
	}, [wsUrl, ms]);

	useEffect(() => {
		readStatuses();
	}, [readStatuses]);

	useEffect(() => {
		readPending();
	}, [readPending]);

	async function handlePropose() {
		if (!ms || !authorityAddr) return setTxStatus("Error: contracts not deployed");
		const target = actionTarget.trim() as `0x${string}`;
		if (!/^0x[0-9a-fA-F]{40}$/.test(target))
			return setTxStatus("Error: target must be a valid H160 address (0x…)");

		const proposer = accounts[proposerIdx];
		if (!proposer) return setTxStatus("Error: no account selected");

		setLoading(true);
		setTxStatus("Building inner call…");
		try {
			const client = getClient(wsUrl);
			const descriptor = await getStackTemplateDescriptor();
			const api = client.getTypedApi(descriptor);

			const calldata = encodeAuthorityCall(actionMethod, target);
			const innerCall = buildReviveInnerTx(api, authorityAddr, calldata);
			const callHash = await computeCallHash(innerCall);
			const others = otherSignatoriesFor(ms.signatories, proposer.address);

			setTxStatus("Submitting proposal…");
			const result = await propose(api, proposer.signer, others, ms.threshold, innerCall);

			saveHint(result.callHash, {
				action: actionMethod,
				target,
				proposedAt: Date.now(),
			});
			setTxStatus(
				`Proposal submitted. CallHash: ${shortHash(callHash)}  (tx: ${result.txHash.slice(0, 14)}…)`,
			);
			await readPending();
			await readStatuses();
		} catch (e) {
			setTxStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
		} finally {
			setLoading(false);
		}
	}

	async function handleApprove(entry: PendingEntry) {
		if (!ms || !authorityAddr) return setTxStatus("Error: contracts not deployed");
		const hint = entry.hint ?? {
			action: overrideAction,
			target: overrideTarget.trim() as `0x${string}`,
			proposedAt: 0,
		};
		if (!hint.target || !/^0x[0-9a-fA-F]{40}$/.test(hint.target))
			return setTxStatus("Error: enter a valid target H160 address");
		entry = { ...entry, hint };

		const approver = accounts[approverIdx];
		if (!approver) return setTxStatus("Error: no approver selected");

		setLoading(true);
		setTxStatus("Fetching timepoint from chain…");
		try {
			const client = getClient(wsUrl);
			const descriptor = await getStackTemplateDescriptor();
			const api = client.getTypedApi(descriptor);

			// Fetch fresh timepoint from chain (source of truth)
			const pending = await getPendingForCall(api, ms.ss58, entry.callHash);
			if (!pending) {
				setTxStatus("Error: pending entry no longer exists on-chain");
				await readPending();
				return;
			}
			const timepoint: Timepoint = pending.when;

			const calldata = encodeAuthorityCall(hint.action, hint.target);
			const innerCall = buildReviveInnerTx(api, authorityAddr, calldata);
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

			removeHint(entry.callHash);
			setTxStatus(
				`Executed! ${actionLabel(hint.action)} for ${hint.target.slice(0, 10)}…  (tx: ${result.txHash.slice(0, 14)}…)`,
			);
			await readPending();
			await readStatuses();
		} catch (e) {
			setTxStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
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
	devAccounts.forEach((a) => {
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
					Manage medic authority via the 2-of-3 multisig (Alice · Bob · Charlie)
				</p>
			</div>

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
						{authorityCount !== null && (
							<div className="flex items-center gap-2">
								<span className="text-text-tertiary w-28 shrink-0">
									Authority count
								</span>
								<span className="text-text-secondary">{authorityCount}</span>
							</div>
						)}
					</div>
				)}

				<table className="w-full text-sm">
					<thead>
						<tr className="text-text-tertiary text-left">
							<th className="pb-2 font-medium w-20">Account</th>
							<th className="pb-2 font-medium w-36 text-xs">H160</th>
							<th className="pb-2 font-medium text-center">Authority</th>
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
									{statusDot(authStatuses[ms.h160 as `0x${string}`])}
								</td>
								<td className="py-2 text-center">
									{statusDot(medicStatuses[ms.h160 as `0x${string}`])}
								</td>
							</tr>
						)}
						{devAccounts.map((a) => {
							const addr = a.evmAddress;
							return (
								<tr key={addr} className="border-t border-white/[0.04]">
									<td className="py-2 text-text-primary font-medium">{a.name}</td>
									<td className="py-2 font-mono text-xs text-text-tertiary">
										{addr.slice(0, 10)}…{addr.slice(-6)}
									</td>
									<td className="py-2 text-center">
										{statusDot(authStatuses[addr])}
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
							{accounts.map((acc, i) => (
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
							onChange={(e) => setActionMethod(e.target.value as AuthorityMethod)}
						>
							<option value="addMedic">Add Medic</option>
							<option value="removeMedic">Remove Medic</option>
							<option value="addAuthority">Add Authority</option>
							<option value="removeAuthority">Remove Authority</option>
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
						{devAccounts.map((a) => (
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
					onClick={handlePropose}
					disabled={loading || !authorityAddr || !ms}
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
						{accounts.map((acc, i) => (
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
											<p className="text-text-secondary text-sm italic">
												Unknown action — fill in below
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
										disabled={loading}
									>
										Approve & Execute
									</button>
								</div>
								{!entry.hint && (
									<div className="pt-1 flex flex-wrap gap-2 items-end">
										<select
											className="input-field text-xs py-1 px-2"
											value={overrideAction}
											onChange={(e) =>
												setOverrideAction(e.target.value as AuthorityMethod)
											}
										>
											<option value="addMedic">Add Medic</option>
											<option value="removeMedic">Remove Medic</option>
											<option value="addAuthority">Add Authority</option>
											<option value="removeAuthority">
												Remove Authority
											</option>
										</select>
										<input
											className="input-field text-xs py-1 px-2 flex-1 min-w-[160px] font-mono"
											placeholder="0x… target H160"
											value={overrideTarget}
											onChange={(e) => setOverrideTarget(e.target.value)}
										/>
										<div className="flex gap-1">
											{devAccounts.map((a, i) => (
												<button
													key={a.evmAddress}
													className="btn-outline text-xs px-2 py-1"
													onClick={() => setOverrideTarget(a.evmAddress)}
												>
													{["Alice", "Bob", "Charlie"][i]}
												</button>
											))}
										</div>
									</div>
								)}
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
					{devAccounts.map((a) => (
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
