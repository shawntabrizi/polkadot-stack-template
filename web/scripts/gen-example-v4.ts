/**
 * Generates a v4-record example JSON with real crypto values.
 * Run: npx ts-node --transpile-only scripts/gen-example-v4.ts
 */
import { poseidon2, poseidon3, poseidon8, poseidon16 } from "poseidon-lite";
import { mulPointEscalar, Base8, order as jubOrder } from "@zk-kit/baby-jubjub";
import { signMessage, derivePublicKey } from "@zk-kit/eddsa-poseidon";

const N = 32;
const HEADER_N = 8;
const BYTES_PER_SLOT = 31;
const RS = 0x1e;
const US = 0x1f;

function bytesToBigint(bytes: Uint8Array): bigint {
	let n = 0n;
	for (const b of bytes) n = (n << 8n) | BigInt(b);
	return n;
}

function encodeFieldsFixed(fields: Record<string, string>, slotCount: number): bigint[] {
	const keys = Object.keys(fields).sort();
	const enc = new TextEncoder();
	const parts: Uint8Array[] = [];
	for (const k of keys) {
		parts.push(enc.encode(k));
		parts.push(new Uint8Array([US]));
		parts.push(enc.encode(String(fields[k])));
		parts.push(new Uint8Array([RS]));
	}
	const totalLen = parts.reduce((s, p) => s + p.length, 0);
	const bytes = new Uint8Array(totalLen);
	let o = 0;
	for (const p of parts) {
		bytes.set(p, o);
		o += p.length;
	}
	const plaintext: bigint[] = new Array(slotCount).fill(0n);
	plaintext[0] = BigInt(totalLen);
	for (let i = 0; i < slotCount - 1; i++) {
		const start = i * BYTES_PER_SLOT;
		if (start >= totalLen) break;
		plaintext[i + 1] = bytesToBigint(
			bytes.subarray(start, Math.min(start + BYTES_PER_SLOT, totalLen)),
		);
	}
	return plaintext;
}

function hashChain32(inputs: bigint[]): bigint {
	const h1 = poseidon16(inputs.slice(0, 16));
	const h2 = poseidon16(inputs.slice(16, 32));
	return poseidon2([h1, h2]);
}

const bigintToHex = (n: bigint) => "0x" + n.toString(16).padStart(64, "0");

// --- Record data ---

const header = {
	title: "Complete Blood Count (Apr 2026)",
	recordType: "CBC",
	recordedAt: 1745452800, // 2026-04-24
	facility: "Clínica San Rafael — Buenos Aires",
};

const pii = {
	patientId: "PAT-2024-0047",
	dateOfBirth: "1982-03-15",
};

// Body: clinical fields only — NO patientId / dateOfBirth
const bodyFields = {
	bloodType: "A+",
	bmi: "28.3",
	cholesterol: "195",
	condition: "type2_diabetes",
	country: "FI",
	diagnosedAt: "2019-06-01",
	diastolicBP: "82",
	hba1c: "7.4",
	medicationInsulin: "false",
	medicationMetformin: "true",
	smoker: "false",
	systolicBP: "128",
};

// --- Commits ---

const headerFields = encodeFieldsFixed(
	{
		title: header.title,
		recordType: header.recordType,
		recordedAt: String(header.recordedAt),
		facility: header.facility,
	},
	HEADER_N,
);
const headerCommit = poseidon8(headerFields);

const piiFields = encodeFieldsFixed(
	{ patientId: pii.patientId, dateOfBirth: pii.dateOfBirth },
	HEADER_N,
);
const piiCommit = poseidon8(piiFields);

const bodyEncoded = encodeFieldsFixed(bodyFields, N);
const bodyCommit = hashChain32(bodyEncoded);

const recordCommit = poseidon3([headerCommit, bodyCommit, piiCommit]);

// --- Medic signature (using well-known dev key — Council-1 from .env.local) ---
const MEDIC_PK_HEX = "0x7d3bff86ad2d95cf68072655012579ea31732dc3f4e4a2e7bd0bcb0721c12614";
const sig = signMessage(MEDIC_PK_HEX, recordCommit);
const pk = derivePublicKey(MEDIC_PK_HEX);

// --- Output ---

const record = {
	version: "v4-record",
	header,
	pii,
	body: bodyEncoded.map(String),
	headerCommit: headerCommit.toString(),
	bodyCommit: bodyCommit.toString(),
	piiCommit: piiCommit.toString(),
	recordCommit: recordCommit.toString(),
	signature: {
		R8x: bigintToHex(sig.R8[0]),
		R8y: bigintToHex(sig.R8[1]),
		S: bigintToHex(sig.S),
	},
	medicPublicKey: {
		x: bigintToHex(pk[0]),
		y: bigintToHex(pk[1]),
	},
	signedAt: new Date().toISOString(),
	bodyFieldsPreview: bodyFields,
};

console.log(JSON.stringify(record, null, 2));
