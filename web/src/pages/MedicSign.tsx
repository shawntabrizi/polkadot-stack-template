import { useState, useCallback } from "react";
import { signMessage, derivePublicKey } from "@zk-kit/eddsa-poseidon";
import { evmDevAccounts } from "../config/evm";
import { devAccounts } from "../hooks/useAccount";
import FileDropZone from "../components/FileDropZone";
import VerifiedBadge from "../components/VerifiedBadge";
import {
	encodeRecordToFieldElements,
	computeBodyCommit,
	computeHeaderCommit,
	computeRecordCommit,
	computePiiCommit,
	MAX_PAYLOAD_BYTES,
	type MedicalHeader,
	type MedicalPii,
	type SignedRecord,
} from "../utils/zk";

function bigintToHex(n: bigint): string {
	return "0x" + n.toString(16).padStart(64, "0");
}

function truncate(s: string): string {
	return s.slice(0, 10) + "…" + s.slice(-6);
}

type Step = 1 | 2 | 3;

const RECORD_TYPES = [
	"CBC",
	"Metabolic Panel",
	"MRI",
	"CT Scan",
	"X-Ray",
	"Genome/SNP Array",
	"Pathology",
	"ECG",
	"Other",
];

function todayISO(): string {
	const d = new Date();
	return d.toISOString().slice(0, 10);
}

function isoToUnixSeconds(iso: string): number {
	const t = Date.parse(iso);
	if (Number.isNaN(t)) throw new Error(`invalid date: ${iso}`);
	return Math.floor(t / 1000);
}

export default function MedicSign() {
	const [step, setStep] = useState<Step>(1);
	const [selectedAccount, setSelectedAccount] = useState(0);

	// Step 1 — body JSON + header fields
	const [fields, setFields] = useState<[string, string][] | null>(null);
	const [pii, setPii] = useState<MedicalPii>({ patientId: "", dateOfBirth: "" });
	const [parseError, setParseError] = useState<string | null>(null);
	const [title, setTitle] = useState("");
	const [recordType, setRecordType] = useState(RECORD_TYPES[0]);
	const [recordedAtISO, setRecordedAtISO] = useState(todayISO());
	const [facility, setFacility] = useState("");

	// Step 2
	const [encoding, setEncoding] = useState(false);
	const [encodeError, setEncodeError] = useState<string | null>(null);
	const [bodyPlaintext, setBodyPlaintext] = useState<bigint[] | null>(null);
	const [headerCommit, setHeaderCommit] = useState<bigint | null>(null);
	const [bodyCommit, setBodyCommit] = useState<bigint | null>(null);
	const [piiCommit, setPiiCommit] = useState<bigint | null>(null);
	const [recordCommit, setRecordCommit] = useState<bigint | null>(null);
	const [byteCount, setByteCount] = useState<number | null>(null);
	const [header, setHeader] = useState<MedicalHeader | null>(null);

	// Step 3
	const [sig, setSig] = useState<{ R8x: string; R8y: string; S: string } | null>(null);
	const [pubKey, setPubKey] = useState<{ x: string; y: string } | null>(null);

	const onFileBytes = useCallback((bytes: Uint8Array) => {
		setParseError(null);
		setEncodeError(null);
		setBodyPlaintext(null);
		setHeaderCommit(null);
		setBodyCommit(null);
		setPiiCommit(null);
		setRecordCommit(null);
		setByteCount(null);
		setHeader(null);
		setSig(null);
		setPubKey(null);
		setStep(1);
		try {
			const json: unknown = JSON.parse(new TextDecoder().decode(bytes));
			if (typeof json !== "object" || json === null || Array.isArray(json)) {
				setParseError("File must be a JSON object (not an array).");
				setFields(null);
				return;
			}
			const raw = json as Record<string, unknown>;

			// v4 structured format: { header, pii, body } — auto-populate all sections
			const isV4Structured =
				raw.header !== null &&
				typeof raw.header === "object" &&
				raw.pii !== null &&
				typeof raw.pii === "object" &&
				raw.body !== null &&
				typeof raw.body === "object";

			if (isV4Structured) {
				const h = raw.header as Record<string, unknown>;
				const p = raw.pii as Record<string, unknown>;
				const b = raw.body as Record<string, unknown>;
				if (h.title) setTitle(String(h.title));
				if (h.recordType) setRecordType(String(h.recordType));
				if (h.recordedAt) {
					const d = new Date(Number(h.recordedAt) * 1000);
					setRecordedAtISO(d.toISOString().slice(0, 10));
				}
				if (h.facility) setFacility(String(h.facility));
				setPii({
					patientId: p.patientId ? String(p.patientId) : "",
					dateOfBirth: p.dateOfBirth ? String(p.dateOfBirth) : "",
				});
				const entries = Object.entries(b).map(
					([k, v]) => [k, String(v)] as [string, string],
				);
				if (entries.length === 0) {
					setParseError("Body object has no fields.");
					setFields(null);
					return;
				}
				setFields(entries);
				return;
			}

			// Legacy flat format: extract PII keys, use everything else as body
			setPii({
				patientId: raw.patientId ? String(raw.patientId) : "",
				dateOfBirth: raw.dateOfBirth ? String(raw.dateOfBirth) : "",
			});
			const entries = Object.entries(raw).map(([k, v]) => [k, String(v)] as [string, string]);
			if (entries.length === 0) {
				setParseError("JSON object has no fields.");
				setFields(null);
				return;
			}
			setFields(entries);
		} catch {
			setParseError("Invalid JSON — drop a valid .json file.");
			setFields(null);
		}
	}, []);

	const headerReady = title.trim().length > 0 && facility.trim().length > 0;
	const canContinueStep1 = fields !== null && headerReady;

	async function encodeAndCommit() {
		if (!fields) return;
		setEncoding(true);
		setEncodeError(null);
		try {
			// Pass full body (including patientId/dateOfBirth) — zk.ts strips PII automatically
			const body = Object.fromEntries(fields);
			const pt = encodeRecordToFieldElements(body);
			const bCommit = computeBodyCommit(pt);

			const hdr: MedicalHeader = {
				title: title.trim(),
				recordType,
				recordedAt: isoToUnixSeconds(recordedAtISO),
				facility: facility.trim(),
			};
			const hCommit = computeHeaderCommit(hdr);
			const pCommit = computePiiCommit(pii);
			const combined = computeRecordCommit(hCommit, bCommit, pCommit);

			const enc = new TextEncoder();
			const keys = Object.keys(body).sort();
			let total = 0;
			for (const k of keys) {
				total += enc.encode(k).length + 1 + enc.encode(String(body[k])).length + 1;
			}

			setBodyPlaintext(pt);
			setBodyCommit(bCommit);
			setHeaderCommit(hCommit);
			setPiiCommit(pCommit);
			setRecordCommit(combined);
			setHeader(hdr);
			setByteCount(total);
		} catch (err) {
			setEncodeError(err instanceof Error ? err.message : String(err));
		} finally {
			setEncoding(false);
		}
	}

	function signWithWallet() {
		if (!recordCommit) return;
		const privKey = evmDevAccounts[selectedAccount].privateKey;
		const signature = signMessage(privKey, recordCommit);
		const pk = derivePublicKey(privKey);
		setSig({
			R8x: bigintToHex(signature.R8[0]),
			R8y: bigintToHex(signature.R8[1]),
			S: bigintToHex(signature.S),
		});
		setPubKey({ x: bigintToHex(pk[0]), y: bigintToHex(pk[1]) });
	}

	const packageJson =
		fields &&
		header &&
		headerCommit &&
		bodyCommit &&
		piiCommit &&
		recordCommit &&
		bodyPlaintext &&
		sig &&
		pubKey
			? JSON.stringify(
					{
						version: "v4-record",
						header,
						pii,
						body: bodyPlaintext.map((n) => n.toString()),
						headerCommit: headerCommit.toString(),
						bodyCommit: bodyCommit.toString(),
						piiCommit: piiCommit.toString(),
						recordCommit: recordCommit.toString(),
						signature: sig,
						medicPublicKey: pubKey,
						signedAt: new Date().toISOString(),
						bodyFieldsPreview: Object.fromEntries(fields),
					} satisfies SignedRecord,
					null,
					2,
				)
			: null;

	const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

	function downloadPackage() {
		if (!packageJson) return;
		const blob = new Blob([packageJson], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = "signed-record.json";
		a.click();
		URL.revokeObjectURL(url);
	}

	async function copyPackage() {
		if (!packageJson) return;
		try {
			await navigator.clipboard.writeText(packageJson);
			setCopyState("copied");
			setTimeout(() => setCopyState("idle"), 1500);
		} catch {
			setCopyState("failed");
			setTimeout(() => setCopyState("idle"), 2000);
		}
	}

	const stepDone = (n: Step) => step > n;
	const stepActive = (n: Step) => step === n;

	return (
		<div className="space-y-6 animate-fade-in">
			<div className="space-y-2">
				<h1 className="page-title text-polka-500">Medic Signing Tool</h1>
				<p className="text-text-secondary">
					Sign patient records with your professional key. The patient imports this signed
					package and lists it on the marketplace. You sign both the record body (the
					clinical payload) and a structured header (title, type, date, facility) so
					researchers can filter listings by medic-attested metadata before paying.
				</p>
			</div>

			{/* Account selector */}
			<div className="card space-y-3">
				<h2 className="section-title">Medic Account</h2>
				<select
					value={selectedAccount}
					onChange={(e) => {
						setSelectedAccount(parseInt(e.target.value));
						setSig(null);
						setPubKey(null);
					}}
					className="input-field w-full"
				>
					{evmDevAccounts.map((acc, i) => (
						<option key={i} value={i}>
							{acc.name} ({acc.account.address})
						</option>
					))}
				</select>
				<div className="flex items-center gap-2">
					<span className="text-text-muted text-xs font-mono">
						{evmDevAccounts[selectedAccount].account.address}
					</span>
					<VerifiedBadge address={devAccounts[selectedAccount].evmAddress} />
				</div>
			</div>

			{/* Step 1 — Upload Record + Header */}
			<div className="card space-y-4">
				<StepHeader
					number={1}
					title="Upload Record & Header"
					active={stepActive(1)}
					done={stepDone(1)}
				/>

				<FileDropZone
					onFileHashed={() => {}}
					onFileBytes={onFileBytes}
					showUploadToggle={false}
					uploadToIpfs={false}
					onUploadToggle={() => {}}
					showStatementStoreToggle={false}
					uploadToStatementStore={false}
					onStatementStoreToggle={() => {}}
				/>

				{parseError && <p className="text-accent-red text-sm">{parseError}</p>}

				{fields && (
					<>
						{(pii.patientId || pii.dateOfBirth) && (
							<div className="rounded-lg border border-polka-500/20 bg-polka-500/5 p-3 space-y-2">
								<p className="text-xs text-polka-400 font-medium uppercase tracking-wider">
									PII — committed on-chain, never sent to researchers
								</p>
								<div className="grid grid-cols-2 gap-2 text-sm">
									<div>
										<span className="text-text-muted text-xs">Patient ID</span>
										<p className="font-mono text-text-primary">
											{pii.patientId || "—"}
										</p>
									</div>
									<div>
										<span className="text-text-muted text-xs">
											Date of birth
										</span>
										<p className="font-mono text-text-primary">
											{pii.dateOfBirth || "—"}
										</p>
									</div>
								</div>
							</div>
						)}

						<table className="w-full text-sm">
							<thead>
								<tr className="text-text-tertiary text-xs uppercase tracking-wider">
									<th className="text-left pb-2">Body field</th>
									<th className="text-left pb-2">Value</th>
								</tr>
							</thead>
							<tbody>
								{fields.map(([k, v]) => (
									<tr key={k} className="border-t border-white/[0.04]">
										<td className="py-2 font-mono text-text-secondary pr-4">
											{k}
										</td>
										<td className="py-2 text-text-primary">{v}</td>
									</tr>
								))}
							</tbody>
						</table>

						<div className="border-t border-white/[0.06] pt-4 space-y-3">
							<p className="text-text-secondary text-sm">
								Header — medic-signed, publicly browsable on-chain. Researchers
								filter listings by these fields before deciding to buy.
							</p>

							<div>
								<label className="label">Title</label>
								<input
									type="text"
									value={title}
									onChange={(e) => setTitle(e.target.value)}
									disabled={stepDone(1)}
									placeholder="e.g. Complete Blood Count (Apr 2026)"
									className="input-field w-full"
								/>
							</div>

							<div className="grid grid-cols-2 gap-3">
								<div>
									<label className="label">Record type</label>
									<select
										value={recordType}
										onChange={(e) => setRecordType(e.target.value)}
										disabled={stepDone(1)}
										className="input-field w-full"
									>
										{RECORD_TYPES.map((t) => (
											<option key={t} value={t}>
												{t}
											</option>
										))}
									</select>
								</div>
								<div>
									<label className="label">Recorded at</label>
									<input
										type="date"
										value={recordedAtISO}
										onChange={(e) => setRecordedAtISO(e.target.value)}
										disabled={stepDone(1)}
										className="input-field w-full"
									/>
								</div>
							</div>

							<div>
								<label className="label">Facility</label>
								<input
									type="text"
									value={facility}
									onChange={(e) => setFacility(e.target.value)}
									disabled={stepDone(1)}
									placeholder="e.g. Clinica Polyclinic — Buenos Aires"
									className="input-field w-full"
								/>
							</div>
						</div>

						<button
							onClick={() => setStep(2)}
							className="btn-primary"
							disabled={stepDone(1) || !canContinueStep1}
						>
							Continue →
						</button>
					</>
				)}
			</div>

			{/* Step 2 — Encode & Commit */}
			{(step >= 2 || stepDone(1)) && (
				<div className="card space-y-4">
					<StepHeader
						number={2}
						title="Encode &amp; Commit"
						active={stepActive(2)}
						done={stepDone(2)}
					/>

					{encodeError && (
						<div className="rounded-lg border border-accent-red/30 bg-accent-red/10 p-4 space-y-1">
							<p className="text-accent-red text-sm font-medium">Encoding failed</p>
							<p className="text-accent-red/80 text-xs">{encodeError}</p>
							{encodeError.includes("too large") && (
								<p className="text-text-muted text-xs mt-1">
									Trim field values or reduce the number of fields so the
									canonicalised record fits within {MAX_PAYLOAD_BYTES} bytes.
								</p>
							)}
							{encodeError.includes("reserved control byte") && (
								<p className="text-text-muted text-xs mt-1">
									Remove any unit-separator (U+001F) or record-separator (U+001E)
									characters from your field keys and values.
								</p>
							)}
						</div>
					)}

					{!recordCommit ? (
						<button
							onClick={encodeAndCommit}
							disabled={encoding}
							className="btn-secondary"
						>
							{encoding ? "Encoding…" : "Encode & Compute Commits"}
						</button>
					) : (
						<div className="space-y-3">
							<div>
								<label className="label">Header commit</label>
								<div className="input-field font-mono text-xs text-text-secondary break-all">
									{headerCommit?.toString()}
								</div>
							</div>
							<div>
								<label className="label">Body commit</label>
								<div className="input-field font-mono text-xs text-text-secondary break-all">
									{bodyCommit?.toString()}
								</div>
								{byteCount !== null && (
									<p className="text-xs text-text-muted mt-1">
										Body: {byteCount} / {MAX_PAYLOAD_BYTES} bytes used
									</p>
								)}
							</div>
							<div>
								<label className="label">PII commit</label>
								<div className="input-field font-mono text-xs text-text-secondary break-all">
									{piiCommit?.toString()}
								</div>
								<p className="text-xs text-text-muted mt-1">
									Poseidon8(patientId, dateOfBirth) — on-chain proof of identity,
									plaintext never uploaded.
								</p>
							</div>
							<div>
								<label className="label">Record commit (signed)</label>
								<div className="input-field font-mono text-xs text-text-secondary break-all">
									{recordCommit.toString()}
								</div>
								<p className="text-xs text-text-muted mt-1">
									Poseidon3(headerCommit, bodyCommit, piiCommit) — what the medic
									signs.
								</p>
							</div>
							<button
								onClick={() => setStep(3)}
								className="btn-primary"
								disabled={stepDone(2)}
							>
								Continue →
							</button>
						</div>
					)}
				</div>
			)}

			{/* Step 3 — Sign & Export */}
			{(step >= 3 || stepDone(2)) && (
				<div className="card space-y-4">
					<StepHeader
						number={3}
						title="Sign &amp; Export"
						active={stepActive(3)}
						done={stepDone(3)}
					/>

					{!sig ? (
						<button onClick={signWithWallet} className="btn-primary">
							Sign Commit with Wallet
						</button>
					) : (
						<div className="space-y-3">
							<OutputField label="Signature R8x" value={sig.R8x} />
							<OutputField label="Signature R8y" value={sig.R8y} />
							<OutputField label="Signature S" value={sig.S} />
							{pubKey && (
								<OutputField
									label="Public Key"
									value={truncate(pubKey.x) + " / " + truncate(pubKey.y)}
								/>
							)}
						</div>
					)}

					{sig && packageJson && (
						<div className="space-y-2">
							<div className="flex gap-2">
								<button
									onClick={downloadPackage}
									className="btn-secondary flex-1"
									title="Triggers a file download. Blocked inside sandboxed iframes (e.g. DotNS Host) — use Copy as a fallback."
								>
									↓ Download (.json)
								</button>
								<button onClick={copyPackage} className="btn-secondary flex-1">
									{copyState === "copied"
										? "✓ Copied"
										: copyState === "failed"
											? "Copy failed"
											: "⧉ Copy JSON"}
								</button>
							</div>
							<details className="text-xs">
								<summary className="cursor-pointer text-text-tertiary hover:text-text-secondary">
									Show raw JSON (paste into a file if download is blocked)
								</summary>
								<textarea
									readOnly
									value={packageJson}
									className="input-field w-full mt-2 font-mono text-[10px] h-40 resize-y"
									onClick={(e) => (e.target as HTMLTextAreaElement).select()}
								/>
							</details>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

function StepHeader({
	number,
	title,
	active,
	done,
}: {
	number: number;
	title: string;
	active: boolean;
	done: boolean;
}) {
	return (
		<div className="flex items-center gap-3">
			<div
				className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
					done
						? "bg-accent-green/20 text-accent-green"
						: active
							? "bg-polka-500/20 text-polka-400"
							: "bg-white/[0.06] text-text-muted"
				}`}
			>
				{done ? "✓" : number}
			</div>
			<h2
				className={`section-title ${
					done ? "text-accent-green" : active ? "text-text-primary" : "text-text-muted"
				}`}
			>
				{title}
			</h2>
		</div>
	);
}

function OutputField({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<label className="label">{label}</label>
			<div className="input-field font-mono text-xs text-text-secondary break-all">
				{value}
			</div>
		</div>
	);
}
