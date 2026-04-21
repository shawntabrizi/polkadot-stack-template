/**
 * Integration test for the header/body split — exercises the full
 * createListing → placeBuyOrder → fulfill cycle against a live
 * pallet-revive node via PAPI, then verifies header/body commits and
 * the encrypt/decrypt round-trip off-chain.
 *
 * Scope (what this catches that hardhat doesn't):
 *   - resolc-compiled PVM bytecode vs Hardhat EVM
 *   - PAPI marshalling of the new `HeaderInput` struct in Revive.call
 *   - Event emission + viem decoding on the real chain
 *
 * Out of scope:
 *   - Statement Store upload/retrieval (separate subsystem)
 *   - Medic EdDSA sig verification (dummy sig values, matches the
 *     hardhat test pattern — @zk-kit/eddsa-poseidon is not a pvm dep)
 *
 * Prerequisites:
 *   - Local node running (./scripts/start-local.sh or start-all.sh)
 *   - MedicalMarket deployed (npx hardhat run scripts/deploy-market.ts --network local)
 *
 * Run: npx ts-node --transpile-only scripts/integration-header-body.ts
 */

import { createClient, Binary, FixedSizeBinary } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws-provider/node";
import { withPolkadotSdkCompat } from "polkadot-api/polkadot-sdk-compat";
import { getPolkadotSigner } from "polkadot-api/signer";
import { stack_template } from "@polkadot-api/descriptors";
import {
	cryptoWaitReady,
	mnemonicToMiniSecret,
	sr25519PairFromSeed,
	keyExtractSuri,
	keyFromPath,
	sr25519Sign,
	encodeAddress,
	blake2AsU8a,
} from "@polkadot/util-crypto";
import { u8aToHex } from "@polkadot/util";
import {
	createPublicClient,
	http,
	keccak256,
	encodeFunctionData,
	parseEther,
	formatEther,
} from "viem";
import { mulPointEscalar, Base8, order as jubOrder } from "@zk-kit/baby-jubjub";
import { poseidon2, poseidon4, poseidon8, poseidon16 } from "poseidon-lite";
import { readDeployments } from "./_deployments";
import { submitExtrinsic } from "./_papi";

const WS_URL = process.env.SUBSTRATE_RPC_WS ?? "ws://127.0.0.1:9944";
const ETH_RPC_URL = process.env.ETH_RPC_HTTP ?? "http://127.0.0.1:8545";
const DEV_MNEMONIC = "bottom drive obey lake curtain smoke basket hold race lonely fit walk";
const SS58_PREFIX = 42;
const REVIVE_CALL_WEIGHT = { ref_time: 5_000_000_000n, proof_size: 524_288n };
const MAX_STORAGE_DEPOSIT = 100_000_000_000_000n;
const WEI_TO_PLANCK = 1_000_000n;

const BN254_R = BigInt(
	"21888242871839275222246405745257275088548364400416034343698204186575808495617",
);
const SUB_ORDER = jubOrder >> 3n;
const MAX_FIELDS = 32;
const HEADER_FIELDS = 8;
const BYTES_PER_SLOT = 31;
const HEADER_MAX_PAYLOAD = (HEADER_FIELDS - 1) * BYTES_PER_SLOT;
const MAX_PAYLOAD = (MAX_FIELDS - 1) * BYTES_PER_SLOT;
const RS = 0x1e;
const US = 0x1f;

// ---------- Encoding + commits (mirrors web/src/utils/zk.ts) ----------

function bytesToBigint(bytes: Uint8Array): bigint {
	let n = 0n;
	for (const b of bytes) n = (n << 8n) | BigInt(b);
	return n;
}

function bigintToBytes(n: bigint, len: number): Uint8Array {
	const out = new Uint8Array(len);
	for (let i = len - 1; i >= 0; i--) {
		out[i] = Number(n & 0xffn);
		n >>= 8n;
	}
	return out;
}

function encodeFieldsFixed(
	fields: Record<string, string>,
	slotCount: number,
	maxPayload: number,
): bigint[] {
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
	if (totalLen > maxPayload) {
		throw new Error(`record too large: ${totalLen} bytes (max ${maxPayload})`);
	}
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
		const end = Math.min(start + BYTES_PER_SLOT, totalLen);
		plaintext[i + 1] = bytesToBigint(bytes.subarray(start, end));
	}
	return plaintext;
}

function decodeBody(plaintext: bigint[]): Record<string, string> {
	const totalLen = Number(plaintext[0]);
	const bytes = new Uint8Array(totalLen);
	let remaining = totalLen;
	for (let i = 0; i < MAX_FIELDS - 1 && remaining > 0; i++) {
		const chunk = Math.min(BYTES_PER_SLOT, remaining);
		const slot = bigintToBytes(plaintext[i + 1], BYTES_PER_SLOT);
		bytes.set(slot.subarray(BYTES_PER_SLOT - chunk), i * BYTES_PER_SLOT);
		remaining -= chunk;
	}
	const dec = new TextDecoder("utf-8", { fatal: true });
	const fields: Record<string, string> = {};
	let start = 0;
	while (start < totalLen) {
		let end = start;
		while (end < totalLen && bytes[end] !== RS) end++;
		if (end === start) break;
		let us = start;
		while (us < end && bytes[us] !== US) us++;
		fields[dec.decode(bytes.subarray(start, us))] = dec.decode(bytes.subarray(us + 1, end));
		start = end + 1;
	}
	return fields;
}

function hashChain32(inputs: bigint[]): bigint {
	const h1 = poseidon16(inputs.slice(0, 16));
	const h2 = poseidon16(inputs.slice(16, 32));
	return poseidon2([h1, h2]);
}

interface MedicalHeader {
	title: string;
	recordType: string;
	recordedAt: number;
	facility: string;
}

function headerToFields(h: MedicalHeader): Record<string, string> {
	return {
		title: h.title,
		recordType: h.recordType,
		recordedAt: String(h.recordedAt),
		facility: h.facility,
	};
}

function computeHeaderCommit(h: MedicalHeader): bigint {
	return poseidon8(encodeFieldsFixed(headerToFields(h), HEADER_FIELDS, HEADER_MAX_PAYLOAD));
}

function computeRecordCommit(headerCommit: bigint, bodyCommit: bigint): bigint {
	return poseidon2([headerCommit, bodyCommit]);
}

// ---------- ECDH encrypt/decrypt (mirrors encryptRecordForBuyer) ----------

function randomScalar(): bigint {
	const buf = new Uint8Array(32);
	for (let i = 0; i < 32; i++) buf[i] = Math.floor(Math.random() * 256);
	let n = 0n;
	for (const b of buf) n = (n << 8n) | BigInt(b);
	return n % SUB_ORDER;
}

function encryptForBuyer(
	plaintext: bigint[],
	pkBuyer: { x: bigint; y: bigint },
	nonce: bigint,
): { ephPk: { x: bigint; y: bigint }; ciphertext: bigint[]; ciphertextBytes: Uint8Array } {
	const ephSk = randomScalar();
	const ephPkPt = mulPointEscalar(Base8, ephSk);
	const ephPk = { x: ephPkPt[0], y: ephPkPt[1] };
	const shared = mulPointEscalar([pkBuyer.x, pkBuyer.y], ephSk);
	const ciphertext = plaintext.map(
		(p, i) => (p + poseidon4([shared[0], shared[1], nonce, BigInt(i)])) % BN254_R,
	);
	const ciphertextBytes = new Uint8Array(MAX_FIELDS * 32);
	for (let i = 0; i < MAX_FIELDS; i++)
		ciphertextBytes.set(bigintToBytes(ciphertext[i], 32), i * 32);
	return { ephPk, ciphertext, ciphertextBytes };
}

function decryptForBuyer(
	ephPk: { x: bigint; y: bigint },
	ciphertext: bigint[],
	skBuyer: bigint,
	nonce: bigint,
): Record<string, string> {
	const shared = mulPointEscalar([ephPk.x, ephPk.y], skBuyer);
	const plaintext = ciphertext.map(
		(c, i) => (c - poseidon4([shared[0], shared[1], nonce, BigInt(i)]) + BN254_R) % BN254_R,
	);
	return decodeBody(plaintext);
}

// ---------- Dev keypair derivation (copied from bootstrap-demo-medic.ts) ----------

interface DevKeypair {
	publicKey: Uint8Array;
	address: string;
	sign: (msg: Uint8Array) => Uint8Array;
}

function deriveSr25519(path: string): DevKeypair {
	const miniSecret = mnemonicToMiniSecret(DEV_MNEMONIC);
	const seed = sr25519PairFromSeed(miniSecret);
	const { path: junctions } = keyExtractSuri(DEV_MNEMONIC + path);
	const pair = keyFromPath(seed, junctions, "sr25519");
	return {
		publicKey: pair.publicKey,
		address: encodeAddress(pair.publicKey, SS58_PREFIX),
		sign: (msg) => sr25519Sign(msg, pair),
	};
}

function keccakH160(accountId32: Uint8Array): `0x${string}` {
	const hex = keccak256(u8aToHex(accountId32) as `0x${string}`);
	return ("0x" + hex.slice(2 + 24)) as `0x${string}`;
}

function hexToBytes(hex: string): Uint8Array {
	const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
	const out = new Uint8Array(clean.length / 2);
	for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
	return out;
}

// ---------- Contract ABI (trimmed to what we need) ----------

const marketAbi = [
	{
		type: "function",
		name: "createListing",
		inputs: [
			{
				name: "header",
				type: "tuple",
				components: [
					{ name: "title", type: "string" },
					{ name: "recordType", type: "string" },
					{ name: "recordedAt", type: "uint64" },
					{ name: "facility", type: "string" },
				],
			},
			{ name: "headerCommit", type: "uint256" },
			{ name: "bodyCommit", type: "uint256" },
			{ name: "medicPkX", type: "uint256" },
			{ name: "medicPkY", type: "uint256" },
			{ name: "sigR8x", type: "uint256" },
			{ name: "sigR8y", type: "uint256" },
			{ name: "sigS", type: "uint256" },
			{ name: "price", type: "uint256" },
		],
		outputs: [],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "placeBuyOrder",
		inputs: [
			{ name: "listingId", type: "uint256" },
			{ name: "pkBuyerX", type: "uint256" },
			{ name: "pkBuyerY", type: "uint256" },
		],
		outputs: [],
		stateMutability: "payable",
	},
	{
		type: "function",
		name: "fulfill",
		inputs: [
			{ name: "orderId", type: "uint256" },
			{ name: "ephPkX", type: "uint256" },
			{ name: "ephPkY", type: "uint256" },
			{ name: "ciphertextHash", type: "uint256" },
		],
		outputs: [],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "getListing",
		inputs: [{ name: "id", type: "uint256" }],
		outputs: [
			{ name: "headerCommit", type: "uint256" },
			{ name: "bodyCommit", type: "uint256" },
			{ name: "medicPkX", type: "uint256" },
			{ name: "medicPkY", type: "uint256" },
			{ name: "sigR8x", type: "uint256" },
			{ name: "sigR8y", type: "uint256" },
			{ name: "sigS", type: "uint256" },
			{ name: "price", type: "uint256" },
			{ name: "patient", type: "address" },
			{ name: "active", type: "bool" },
		],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "getListingHeader",
		inputs: [{ name: "id", type: "uint256" }],
		outputs: [
			{ name: "title", type: "string" },
			{ name: "recordType", type: "string" },
			{ name: "recordedAt", type: "uint64" },
			{ name: "facility", type: "string" },
		],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "getListingCount",
		inputs: [],
		outputs: [{ name: "", type: "uint256" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "getOrderCount",
		inputs: [],
		outputs: [{ name: "", type: "uint256" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "getFulfillment",
		inputs: [{ name: "orderId", type: "uint256" }],
		outputs: [
			{ name: "ephPkX", type: "uint256" },
			{ name: "ephPkY", type: "uint256" },
			{ name: "ciphertextHash", type: "uint256" },
		],
		stateMutability: "view",
	},
] as const;

// ---------- Revive.call helper with map_account auto-register ----------

async function reviveCall(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	api: any,
	signer: ReturnType<typeof getPolkadotSigner>,
	senderH160: `0x${string}`,
	contract: `0x${string}`,
	functionName: string,
	args: readonly unknown[],
	valueWei: bigint = 0n,
): Promise<void> {
	const h160 = new FixedSizeBinary(hexToBytes(senderH160)) as FixedSizeBinary<20>;
	const existing = await api.query.Revive.OriginalAccount.getValue(h160);
	if (!existing) {
		await submitExtrinsic(api.tx.Revive.map_account(), signer, { mortal: false });
	}

	const calldata = encodeFunctionData({
		abi: marketAbi,
		functionName,
		args,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any);

	const tx = api.tx.Revive.call({
		dest: new FixedSizeBinary(hexToBytes(contract)) as FixedSizeBinary<20>,
		value: valueWei / WEI_TO_PLANCK,
		weight_limit: REVIVE_CALL_WEIGHT,
		storage_deposit_limit: MAX_STORAGE_DEPOSIT,
		data: Binary.fromHex(calldata as `0x${string}`),
	});
	await submitExtrinsic(tx, signer, { mortal: false });
}

// ---------- Main ----------

function assert(cond: unknown, msg: string): asserts cond {
	if (!cond) throw new Error(`ASSERT: ${msg}`);
}

async function main() {
	await cryptoWaitReady();
	const deployments = readDeployments();
	if (!deployments.medicalMarket) {
		throw new Error(
			"deployments.json missing 'medicalMarket' — run deploy-market.ts --network local first",
		);
	}
	const contract = deployments.medicalMarket as `0x${string}`;

	const alice = deriveSr25519("//Alice"); // medic + patient
	const bob = deriveSr25519("//Bob"); // researcher
	const aliceSigner = getPolkadotSigner(alice.publicKey, "Sr25519", (m) => alice.sign(m));
	const bobSigner = getPolkadotSigner(bob.publicKey, "Sr25519", (m) => bob.sign(m));
	const aliceH160 = keccakH160(alice.publicKey);
	const bobH160 = keccakH160(bob.publicKey);

	console.log(`Contract: ${contract}`);
	console.log(`Patient/medic (Alice): ${alice.address}  ${aliceH160}`);
	console.log(`Researcher (Bob):      ${bob.address}  ${bobH160}`);

	const client = createClient(withPolkadotSdkCompat(getWsProvider(WS_URL)));
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const api: any = client.getTypedApi(stack_template);
	const evm = createPublicClient({ transport: http(ETH_RPC_URL) });

	// ---- Build a sample record ----
	const header: MedicalHeader = {
		title: "Integration Test Panel",
		recordType: "CBC",
		recordedAt: 1_711_987_200, // 2024-04-01
		facility: "Integration Clinic",
	};
	const body: Record<string, string> = {
		patientId: "PAT-INT-0001",
		bloodType: "O+",
		hba1c: "6.1",
	};
	const bodyPlaintext = encodeFieldsFixed(body, MAX_FIELDS, MAX_PAYLOAD);
	const bodyCommit = hashChain32(bodyPlaintext);
	const headerCommit = computeHeaderCommit(header);
	const combinedCommit = computeRecordCommit(headerCommit, bodyCommit);
	console.log(`headerCommit: ${headerCommit}`);
	console.log(`bodyCommit:   ${bodyCommit}`);
	console.log(`combined:     ${combinedCommit}`);

	// Dummy sig — same pattern as hardhat test; contract only checks non-zero.
	const medicPkX = 1n;
	const medicPkY = 2n;
	const sigR8x = 3n;
	const sigR8y = 4n;
	const sigS = 5n;

	const price = parseEther("0.001");
	const listingCountBefore = (await evm.readContract({
		address: contract,
		abi: marketAbi,
		functionName: "getListingCount",
	})) as bigint;

	// ---- 1. Alice creates listing ----
	console.log(`\n[1] createListing (next listing id = ${listingCountBefore})...`);
	await reviveCall(api, aliceSigner, aliceH160, contract, "createListing", [
		{
			title: header.title,
			recordType: header.recordType,
			recordedAt: BigInt(header.recordedAt),
			facility: header.facility,
		},
		headerCommit,
		bodyCommit,
		medicPkX,
		medicPkY,
		sigR8x,
		sigR8y,
		sigS,
		price,
	]);
	const listingId = listingCountBefore;
	console.log(`    OK — listing #${listingId}`);

	// ---- Read back + verify ----
	const onchain = (await evm.readContract({
		address: contract,
		abi: marketAbi,
		functionName: "getListing",
		args: [listingId],
	})) as readonly [
		bigint,
		bigint,
		bigint,
		bigint,
		bigint,
		bigint,
		bigint,
		bigint,
		`0x${string}`,
		boolean,
	];
	assert(onchain[0] === headerCommit, "headerCommit mismatch on-chain");
	assert(onchain[1] === bodyCommit, "bodyCommit mismatch on-chain");
	assert(onchain[7] === price, `price mismatch (got ${onchain[7]})`);
	assert(onchain[8].toLowerCase() === aliceH160.toLowerCase(), "patient mismatch");
	assert(onchain[9] === true, "listing should be active");

	const onchainHeader = (await evm.readContract({
		address: contract,
		abi: marketAbi,
		functionName: "getListingHeader",
		args: [listingId],
	})) as readonly [string, string, bigint, string];
	assert(onchainHeader[0] === header.title, "title mismatch");
	assert(onchainHeader[1] === header.recordType, "recordType mismatch");
	assert(onchainHeader[2] === BigInt(header.recordedAt), "recordedAt mismatch");
	assert(onchainHeader[3] === header.facility, "facility mismatch");
	console.log(
		`    header stored: "${onchainHeader[0]}" / ${onchainHeader[1]} / ${onchainHeader[3]}`,
	);

	// ---- Pre-purchase UI check: recompute headerCommit from on-chain fields ----
	const recomputedHeaderCommit = computeHeaderCommit({
		title: onchainHeader[0],
		recordType: onchainHeader[1],
		recordedAt: Number(onchainHeader[2]),
		facility: onchainHeader[3],
	});
	assert(recomputedHeaderCommit === headerCommit, "headerCommit recomputation failed");
	console.log(`    ✓ headerCommit recomputation matches stored value`);

	// ---- 2. Bob generates BJJ keypair and places buy order ----
	console.log(`\n[2] placeBuyOrder (Bob, ${formatEther(price)} PAS)...`);
	const skBuyer = randomScalar();
	const pkBuyerPt = mulPointEscalar(Base8, skBuyer);
	const pkBuyer = { x: pkBuyerPt[0], y: pkBuyerPt[1] };
	const orderCountBefore = (await evm.readContract({
		address: contract,
		abi: marketAbi,
		functionName: "getOrderCount",
	})) as bigint;
	await reviveCall(
		api,
		bobSigner,
		bobH160,
		contract,
		"placeBuyOrder",
		[listingId, pkBuyer.x, pkBuyer.y],
		price,
	);
	const orderId = orderCountBefore;
	console.log(`    OK — order #${orderId}`);

	// ---- 3. Alice encrypts body for Bob's pk, fulfills ----
	console.log(`\n[3] encrypt + fulfill...`);
	const { ephPk, ciphertext, ciphertextBytes } = encryptForBuyer(bodyPlaintext, pkBuyer, orderId);
	const ciphertextHash32 = blake2AsU8a(ciphertextBytes, 256);
	const ciphertextHash = bytesToBigint(ciphertextHash32);

	await reviveCall(api, aliceSigner, aliceH160, contract, "fulfill", [
		orderId,
		ephPk.x,
		ephPk.y,
		ciphertextHash,
	]);
	console.log(`    OK — fulfill submitted`);

	const fulfillment = (await evm.readContract({
		address: contract,
		abi: marketAbi,
		functionName: "getFulfillment",
		args: [orderId],
	})) as readonly [bigint, bigint, bigint];
	assert(fulfillment[0] === ephPk.x && fulfillment[1] === ephPk.y, "ephPk mismatch");
	assert(fulfillment[2] === ciphertextHash, "ciphertextHash mismatch");
	console.log(`    ✓ fulfillment stored with ephPk + ciphertextHash`);

	// Listing should now be inactive.
	const afterFulfill = (await evm.readContract({
		address: contract,
		abi: marketAbi,
		functionName: "getListing",
		args: [listingId],
	})) as readonly [
		bigint,
		bigint,
		bigint,
		bigint,
		bigint,
		bigint,
		bigint,
		bigint,
		`0x${string}`,
		boolean,
	];
	assert(afterFulfill[9] === false, "listing should be inactive after fulfill");

	// ---- 4. Bob decrypts in-memory ciphertext, verifies bodyCommit ----
	console.log(`\n[4] decrypt + verify bodyCommit...`);
	const recovered = decryptForBuyer(ephPk, ciphertext, skBuyer, orderId);
	for (const k of Object.keys(body)) {
		assert(recovered[k] === body[k], `body field "${k}" mismatch after decrypt`);
	}
	const recoveredPlaintext = encodeFieldsFixed(recovered, MAX_FIELDS, MAX_PAYLOAD);
	const recomputedBodyCommit = hashChain32(recoveredPlaintext);
	assert(recomputedBodyCommit === afterFulfill[1], "bodyCommit recomputation failed");
	console.log(`    ✓ body decrypt round-trip matches + bodyCommit recomputes correctly`);

	console.log(`\nINTEGRATION TEST PASSED`);
	client.destroy();
}

main().catch((e) => {
	console.error("\nINTEGRATION TEST FAILED:", e instanceof Error ? e.message : e);
	process.exit(1);
});
