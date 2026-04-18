// End-to-end ZK flow test against the deployed local PVM contracts.
// No frontend, no Statement Store — just the on-chain ZK gate.
//
// Flow:
//   1. Alice (patient) builds a signed package in-memory
//   2. Alice calls createListing(merkleRoot, fakeStatementHash, title, price)
//   3. Bob (researcher) calls placeBuyOrder(listingId) with the price
//   4. Alice generates a Groth16 proof for one field
//   5. Alice calls fulfill(orderId, decryptionKey, a, b, c, pubSignals)
//   6. Verify: order confirmed, payment transferred, getDecryptionKey returns key
//
// Usage: node test/test_e2e.mjs

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import * as snarkjs from "snarkjs";
import { LeanIMT } from "@zk-kit/lean-imt";
import { poseidon2 } from "poseidon-lite";
import { blake2b } from "blakejs";
import { signMessage, derivePublicKey } from "@zk-kit/eddsa-poseidon";
import {
	createPublicClient,
	createWalletClient,
	http,
	parseEther,
	keccak256,
	toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");

// --- Config ------------------------------------------------------------------
const RPC_URL = process.env.ETH_RPC_HTTP || "http://127.0.0.1:8545";
const DEPLOYMENTS = JSON.parse(readFileSync(join(ROOT, "deployments.json"), "utf8"));
const ABI = JSON.parse(
	readFileSync(
		join(ROOT, "contracts/pvm/artifacts/contracts/MedicalMarket.sol/MedicalMarket.json"),
		"utf8",
	),
).abi;

const ALICE_PK = "0x5fb92d6e98884f76de468fa3f6278f8807c48bebc13595d45af5bdc4da702133";
const BOB_PK = "0x8075991ce870b93a8870eca0c0f91913d12f47948ca0fd25b49c6fa7cdbeee8b";

const WASM = join(__dirname, "../build/medical_disclosure_js/medical_disclosure.wasm");
const ZKEY = join(__dirname, "../build/medical_disclosure_final.zkey");
const MAX_DEPTH = 8;

// --- Helpers -----------------------------------------------------------------
function stringToBigint(s) {
	const bytes = new TextEncoder().encode(s);
	const hash = blake2b(bytes, undefined, 32);
	const hex = Array.from(hash.slice(0, 31))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
	return BigInt("0x" + hex);
}

function bigintToHex32(n) {
	return ("0x" + n.toString(16).padStart(64, "0"));
}

async function waitReceipt(publicClient, hash) {
	const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
	if (receipt.status !== "success") {
		throw new Error(`tx ${hash} reverted`);
	}
	return receipt;
}

// --- Main --------------------------------------------------------------------
async function main() {
	const marketAddress = DEPLOYMENTS.medicalMarket;
	if (!marketAddress) throw new Error("deployments.json has no medicalMarket address");

	console.log(`MedicalMarket: ${marketAddress}`);
	console.log(`Verifier:      ${DEPLOYMENTS.verifier}`);
	console.log(`RPC:           ${RPC_URL}\n`);

	const transport = http(RPC_URL);
	const publicClient = createPublicClient({ transport });
	const alice = createWalletClient({ account: privateKeyToAccount(ALICE_PK), transport });
	const bob = createWalletClient({ account: privateKeyToAccount(BOB_PK), transport });

	const chainId = await publicClient.getChainId();
	console.log(`Chain ID: ${chainId}`);

	// --- Step 1: Alice builds a signed package -----------------------------
	console.log("\n[1/6] Building signed medical record...");
	const FIELDS = [
		["patientId", "P-001"],
		["age", "34"],
		["condition", "diabetes"],
		["bloodType", "A+"],
	];
	const tree = new LeanIMT((a, b) => poseidon2([a, b]));
	const leaves = [];
	for (const [k, v] of FIELDS) {
		const leaf = poseidon2([stringToBigint(k), stringToBigint(v)]);
		tree.insert(leaf);
		leaves.push(leaf);
	}
	const signature = signMessage(ALICE_PK, tree.root);
	const pubKey = derivePublicKey(ALICE_PK);
	console.log(`    merkleRoot:  ${bigintToHex32(tree.root)}`);

	// --- Step 2: Alice creates a listing -----------------------------------
	console.log("\n[2/6] Alice: createListing...");
	const price = parseEther("0.01");
	const fakeStatementHash = keccak256(toHex("dummy-statement-" + Date.now()));
	const listTx = await alice.writeContract({
		address: marketAddress,
		abi: ABI,
		functionName: "createListing",
		args: [bigintToHex32(tree.root), fakeStatementHash, "Diabetes Record #1", price],
		maxPriorityFeePerGas: 10n,
	});
	await waitReceipt(publicClient, listTx);
	const listingCount = await publicClient.readContract({
		address: marketAddress,
		abi: ABI,
		functionName: "getListingCount",
	});
	const listingId = listingCount - 1n;
	console.log(`    Listing #${listingId} created. Tx: ${listTx}`);

	// --- Step 3: Bob places a buy order ------------------------------------
	console.log("\n[3/6] Bob: placeBuyOrder...");
	const buyTx = await bob.writeContract({
		address: marketAddress,
		abi: ABI,
		functionName: "placeBuyOrder",
		args: [listingId],
		value: price,
		maxPriorityFeePerGas: 10n,
	});
	await waitReceipt(publicClient, buyTx);
	const orderCount = await publicClient.readContract({
		address: marketAddress,
		abi: ABI,
		functionName: "getOrderCount",
	});
	const orderId = orderCount - 1n;
	console.log(`    Order #${orderId} placed. Tx: ${buyTx}`);

	// --- Step 4: Alice generates a ZK proof --------------------------------
	console.log("\n[4/6] Alice: generating Groth16 proof...");
	const FIELD_IDX = 1; // prove "age"
	const [fk, fv] = FIELDS[FIELD_IDX];
	const merkleProof = tree.generateProof(FIELD_IDX);
	const siblings = [
		...merkleProof.siblings,
		...Array(MAX_DEPTH - merkleProof.siblings.length).fill(0n),
	];
	const indices = Array.from({ length: MAX_DEPTH }, (_, i) => (merkleProof.index >> i) & 1);

	const input = {
		indices,
		merkleSiblings: siblings,
		depth: merkleProof.siblings.length,
		fieldKeyHash: stringToBigint(fk),
		fieldValueHash: stringToBigint(fv),
		sigR8x: signature.R8[0],
		sigR8y: signature.R8[1],
		sigS: signature.S,
		merkleRoot: tree.root,
		pubKeyX: pubKey[0],
		pubKeyY: pubKey[1],
	};

	const t0 = Date.now();
	const { proof: zkProof, publicSignals } = await snarkjs.groth16.fullProve(
		input,
		WASM,
		ZKEY,
	);
	console.log(`    Proof generated in ${Date.now() - t0}ms`);
	console.log(`    Proving field: ${fk} = ${fv}`);

	const raw = await snarkjs.groth16.exportSolidityCallData(zkProof, publicSignals);
	const parsed = JSON.parse("[" + raw + "]");
	const proofArgs = {
		a: [BigInt(parsed[0][0]), BigInt(parsed[0][1])],
		b: [
			[BigInt(parsed[1][0][0]), BigInt(parsed[1][0][1])],
			[BigInt(parsed[1][1][0]), BigInt(parsed[1][1][1])],
		],
		c: [BigInt(parsed[2][0]), BigInt(parsed[2][1])],
		pubSignals: [BigInt(parsed[3][0]), BigInt(parsed[3][1]), BigInt(parsed[3][2])],
	};

	// --- Step 5: Alice fulfills with the proof -----------------------------
	console.log("\n[5/6] Alice: fulfill(orderId, key, proof)...");
	const decryptionKey = keccak256(toHex("dummy-key-" + Date.now()));
	const aliceBalBefore = await publicClient.getBalance({ address: alice.account.address });

	const fulfillTx = await alice.writeContract({
		address: marketAddress,
		abi: ABI,
		functionName: "fulfill",
		args: [orderId, decryptionKey, proofArgs.a, proofArgs.b, proofArgs.c, proofArgs.pubSignals],
		maxPriorityFeePerGas: 10n,
	});
	await waitReceipt(publicClient, fulfillTx);
	console.log(`    Fulfilled! Tx: ${fulfillTx}`);

	// --- Step 6: Verify state ----------------------------------------------
	console.log("\n[6/6] Verifying final state...");
	const order = await publicClient.readContract({
		address: marketAddress,
		abi: ABI,
		functionName: "getOrder",
		args: [orderId],
	});
	const keyOnChain = await publicClient.readContract({
		address: marketAddress,
		abi: ABI,
		functionName: "getDecryptionKey",
		args: [orderId],
	});
	const aliceBalAfter = await publicClient.getBalance({ address: alice.account.address });

	console.log(`    order.confirmed:  ${order[3]}`);
	console.log(`    order.cancelled:  ${order[4]}`);
	console.log(`    keyOnChain match: ${keyOnChain.toLowerCase() === decryptionKey.toLowerCase()}`);
	console.log(`    Alice balance delta: +${aliceBalAfter - aliceBalBefore} wei (expected ~+price - gas)`);

	const confirmed = order[3] === true;
	const keyMatches = keyOnChain.toLowerCase() === decryptionKey.toLowerCase();
	if (!confirmed || !keyMatches) {
		console.error("\n❌ FAIL");
		process.exit(1);
	}
	console.log("\n✅ End-to-end ZK flow PASSED");
}

main().catch((e) => {
	console.error("\n❌", e);
	process.exit(1);
});
