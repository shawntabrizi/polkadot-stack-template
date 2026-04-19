import { useState, useCallback } from "react";
import { signMessage, derivePublicKey } from "@zk-kit/eddsa-poseidon";
import { evmDevAccounts } from "../config/evm";
import FileDropZone from "../components/FileDropZone";
import {
	encodeRecordToFieldElements,
	computeRecordCommit,
	MAX_PAYLOAD_BYTES,
	type SignedRecord,
} from "../utils/zk";

function bigintToHex(n: bigint): string {
	return "0x" + n.toString(16).padStart(64, "0");
}

function truncate(s: string): string {
	return s.slice(0, 10) + "…" + s.slice(-6);
}

type Step = 1 | 2 | 3;

export default function MedicSign() {
	const [step, setStep] = useState<Step>(1);
	const [selectedAccount, setSelectedAccount] = useState(0);

	// Step 1
	const [fields, setFields] = useState<[string, string][] | null>(null);
	const [parseError, setParseError] = useState<string | null>(null);

	// Step 2
	const [encoding, setEncoding] = useState(false);
	const [encodeError, setEncodeError] = useState<string | null>(null);
	const [plaintext, setPlaintext] = useState<bigint[] | null>(null);
	const [recordCommit, setRecordCommit] = useState<bigint | null>(null);
	const [byteCount, setByteCount] = useState<number | null>(null);

	// Step 3
	const [sig, setSig] = useState<{ R8x: string; R8y: string; S: string } | null>(null);
	const [pubKey, setPubKey] = useState<{ x: string; y: string } | null>(null);

	const onFileBytes = useCallback((bytes: Uint8Array) => {
		setParseError(null);
		setEncodeError(null);
		setPlaintext(null);
		setRecordCommit(null);
		setByteCount(null);
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
			const entries = Object.entries(json as Record<string, unknown>).map(
				([k, v]) => [k, String(v)] as [string, string],
			);
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

	async function encodeAndCommit() {
		if (!fields) return;
		setEncoding(true);
		setEncodeError(null);
		try {
			const record = Object.fromEntries(fields);
			const pt = encodeRecordToFieldElements(record);
			const commit = computeRecordCommit(pt);

			// Compute byte count by re-encoding (same logic as encodeRecordToFieldElements)
			const enc = new TextEncoder();
			const keys = Object.keys(record).sort();
			let total = 0;
			for (const k of keys) {
				total += enc.encode(k).length + 1 + enc.encode(String(record[k])).length + 1;
			}

			setPlaintext(pt);
			setRecordCommit(commit);
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

	function downloadPackage() {
		if (!fields || !recordCommit || !plaintext || !sig || !pubKey) return;
		const pkg: SignedRecord = {
			version: "v2-record",
			plaintext: plaintext.map((n) => n.toString()),
			recordCommit: recordCommit.toString(),
			signature: sig,
			medicPublicKey: pubKey,
			signedAt: new Date().toISOString(),
			fieldsPreview: Object.fromEntries(fields),
		};
		const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = "signed-record.json";
		a.click();
		URL.revokeObjectURL(url);
	}

	const stepDone = (n: Step) => step > n;
	const stepActive = (n: Step) => step === n;

	return (
		<div className="space-y-6 animate-fade-in">
			<div className="space-y-2">
				<h1 className="page-title text-polka-500">Medic Signing Tool</h1>
				<p className="text-text-secondary">
					Sign patient records with your professional key. The patient imports this signed
					package and lists it on the marketplace.
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
			</div>

			{/* Step 1 — Upload Record */}
			<div className="card space-y-4">
				<StepHeader
					number={1}
					title="Upload Record"
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
						<table className="w-full text-sm">
							<thead>
								<tr className="text-text-tertiary text-xs uppercase tracking-wider">
									<th className="text-left pb-2">Field</th>
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
						<button
							onClick={() => setStep(2)}
							className="btn-primary"
							disabled={stepDone(1)}
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
							{encoding ? "Encoding…" : "Encode & Compute Commit"}
						</button>
					) : (
						<div className="space-y-3">
							<div>
								<label className="label">Record Commit</label>
								<div className="input-field font-mono text-xs text-text-secondary flex items-center justify-between gap-2">
									<span className="truncate">{recordCommit.toString()}</span>
								</div>
								{byteCount !== null && (
									<p className="text-xs text-text-muted mt-1">
										{byteCount} / {MAX_PAYLOAD_BYTES} bytes used
									</p>
								)}
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

					{sig && (
						<button onClick={downloadPackage} className="btn-secondary w-full">
							↓ Download Signed Record (.json)
						</button>
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
