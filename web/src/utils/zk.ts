import * as snarkjs from "snarkjs";
import { LeanIMT } from "@zk-kit/lean-imt";
import { poseidon2 } from "poseidon-lite";
import { blake2b } from "blakejs";

const MAX_DEPTH = 8;
const WASM_URL = "/circuits/medical_disclosure.wasm";
const ZKEY_URL = "/circuits/medical_disclosure_final.zkey";

export interface MerklePackage {
	fields: Record<string, unknown>;
	merkleRoot: string;
	merkleTree: { leaves: string[]; depth: number };
	signature: { R8x: string; R8y: string; S: string };
	publicKey: { x: string; y: string };
	signedAt: string;
}

export interface SolidityProof {
	a: readonly [bigint, bigint];
	b: readonly [readonly [bigint, bigint], readonly [bigint, bigint]];
	c: readonly [bigint, bigint];
	pubSignals: readonly [bigint, bigint, bigint];
}

function stringToBigint(s: string): bigint {
	const bytes = new TextEncoder().encode(s);
	const hash = blake2b(bytes, undefined, 32);
	const hex = Array.from(hash.slice(0, 31))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
	return BigInt("0x" + hex);
}

export async function generateProofForField(
	pkg: MerklePackage,
	fieldKey: string,
): Promise<SolidityProof> {
	const fieldValue = String((pkg.fields as Record<string, unknown>)[fieldKey]);

	const hashFn = (a: bigint, b: bigint) => poseidon2([a, b]);
	const tree = new LeanIMT<bigint>(hashFn);
	tree.insertMany(pkg.merkleTree.leaves.map(BigInt));

	const targetLeaf = poseidon2([stringToBigint(fieldKey), stringToBigint(fieldValue)]);
	const leafIdx = pkg.merkleTree.leaves.findIndex((l) => BigInt(l) === targetLeaf);
	if (leafIdx === -1) throw new Error(`Field "${fieldKey}" not found in Merkle tree`);

	const proof = tree.generateProof(leafIdx);
	const depth = proof.siblings.length;
	const siblings = [...proof.siblings, ...Array(MAX_DEPTH - depth).fill(0n)];
	const indices = Array.from({ length: MAX_DEPTH }, (_, i) => (proof.index >> i) & 1);

	const input = {
		indices,
		merkleSiblings: siblings,
		depth,
		fieldKeyHash: stringToBigint(fieldKey),
		fieldValueHash: stringToBigint(fieldValue),
		sigR8x: BigInt(pkg.signature.R8x),
		sigR8y: BigInt(pkg.signature.R8y),
		sigS: BigInt(pkg.signature.S),
		merkleRoot: BigInt(pkg.merkleRoot),
		pubKeyX: BigInt(pkg.publicKey.x),
		pubKeyY: BigInt(pkg.publicKey.y),
	};

	const { proof: zkProof, publicSignals } = await snarkjs.groth16.fullProve(
		input,
		WASM_URL,
		ZKEY_URL,
	);

	// Sanity-check the proof *off-chain* before packing it for Solidity.
	// If this fails the proof generation is broken (input encoding, wrong
	// zkey/wasm). If it passes but the on-chain Verifier still rejects, the
	// bug is PVM-side (precompile semantics, compiled Verifier mismatch).
	try {
		// snarkjs types don't expose zKey.exportVerificationKey / groth16.verify
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const s = snarkjs as any;
		const vkey = await s.zKey.exportVerificationKey(ZKEY_URL);
		const offchainOk = await s.groth16.verify(vkey, publicSignals, zkProof);
		console.log("[zk] snarkjs offline verify =", offchainOk, { publicSignals });
	} catch (verifyErr) {
		console.warn("[zk] offline verify threw:", verifyErr);
	}

	const raw = await snarkjs.groth16.exportSolidityCallData(zkProof, publicSignals);
	const parsed = JSON.parse("[" + raw + "]") as [string[], string[][], string[], string[]];

	return {
		a: [BigInt(parsed[0][0]), BigInt(parsed[0][1])],
		b: [
			[BigInt(parsed[1][0][0]), BigInt(parsed[1][0][1])],
			[BigInt(parsed[1][1][0]), BigInt(parsed[1][1][1])],
		],
		c: [BigInt(parsed[2][0]), BigInt(parsed[2][1])],
		pubSignals: [BigInt(parsed[3][0]), BigInt(parsed[3][1]), BigInt(parsed[3][2])],
	};
}
