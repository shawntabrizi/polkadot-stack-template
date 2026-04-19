import { useState, useCallback } from "react";
import { LeanIMT } from "@zk-kit/lean-imt";
import { poseidon2 } from "poseidon-lite";
import { signMessage, derivePublicKey } from "@zk-kit/eddsa-poseidon";
import { blake2b } from "blakejs";
import { evmDevAccounts } from "../config/evm";
import FileDropZone from "../components/FileDropZone";
import VerifiedBadge from "../components/VerifiedBadge";

interface MerklePackage {
	fields: Record<string, unknown>;
	merkleRoot: string;
	merkleTree: { leaves: string[]; depth: number };
	signature: { R8x: string; R8y: string; S: string };
	publicKey: { x: string; y: string };
	signedAt: string;
}

/** Hash a string to a bigint that fits within the BN254 scalar field (< 2^248). */
function stringToBigint(s: string): bigint {
	const bytes = new TextEncoder().encode(s);
	const hash = blake2b(bytes, undefined, 32);
	const hex = Array.from(hash.slice(0, 31))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
	return BigInt("0x" + hex);
}

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
	const [building, setBuilding] = useState(false);
	const [merkleRoot, setMerkleRoot] = useState<string | null>(null);
	const [leaves, setLeaves] = useState<string[]>([]);
	const [treeDepth, setTreeDepth] = useState(0);

	// Step 3
	const [sig, setSig] = useState<{ R8x: string; R8y: string; S: string } | null>(null);
	const [pubKey, setPubKey] = useState<{ x: string; y: string } | null>(null);

	const onFileBytes = useCallback((bytes: Uint8Array) => {
		setParseError(null);
		setMerkleRoot(null);
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

	async function buildTree() {
		if (!fields) return;
		setBuilding(true);
		try {
			const hashFn = (a: bigint, b: bigint) => poseidon2([a, b]);
			const tree = new LeanIMT<bigint>(hashFn);
			const treeLeaves: string[] = [];
			for (const [k, v] of fields) {
				const leaf = poseidon2([stringToBigint(k), stringToBigint(v)]);
				tree.insert(leaf);
				treeLeaves.push(bigintToHex(leaf));
			}
			setMerkleRoot(bigintToHex(tree.root));
			setLeaves(treeLeaves);
			setTreeDepth(tree.depth);
		} finally {
			setBuilding(false);
		}
	}

	function signWithWallet() {
		if (!merkleRoot) return;
		const privKey = evmDevAccounts[selectedAccount].privateKey;
		const rootBigint = BigInt(merkleRoot);
		const signature = signMessage(privKey, rootBigint);
		const pk = derivePublicKey(privKey);
		setSig({
			R8x: bigintToHex(signature.R8[0]),
			R8y: bigintToHex(signature.R8[1]),
			S: bigintToHex(signature.S),
		});
		setPubKey({ x: bigintToHex(pk[0]), y: bigintToHex(pk[1]) });
	}

	function downloadPackage() {
		if (!fields || !merkleRoot || !sig || !pubKey) return;
		const pkg: MerklePackage = {
			fields: Object.fromEntries(fields),
			merkleRoot,
			merkleTree: { leaves, depth: treeDepth },
			signature: sig,
			publicKey: pubKey,
			signedAt: new Date().toISOString(),
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
				<div className="flex items-center gap-2">
					<span className="text-text-muted text-xs font-mono">
						{evmDevAccounts[selectedAccount].account.address}
					</span>
					<VerifiedBadge address={evmDevAccounts[selectedAccount].account.address} />
				</div>
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

			{/* Step 2 — Construct Merkle Tree */}
			{(step >= 2 || stepDone(1)) && (
				<div className="card space-y-4">
					<StepHeader
						number={2}
						title="Construct Merkle Tree"
						active={stepActive(2)}
						done={stepDone(2)}
					/>

					{!merkleRoot ? (
						<button onClick={buildTree} disabled={building} className="btn-secondary">
							{building ? "Building…" : "Build Poseidon Merkle Tree"}
						</button>
					) : (
						<div className="space-y-3">
							<div>
								<label className="label">Merkle Root</label>
								<div className="input-field font-mono text-xs text-text-secondary flex items-center justify-between gap-2">
									<span className="truncate">{merkleRoot}</span>
								</div>
								<p className="text-xs text-text-muted mt-1">
									{leaves.length} leaves · depth {treeDepth}
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
							Sign Merkle Root with Wallet
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
