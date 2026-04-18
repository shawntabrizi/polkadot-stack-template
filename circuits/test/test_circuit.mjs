import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import * as snarkjs from "snarkjs";
import { LeanIMT } from "@zk-kit/lean-imt";
import { poseidon2 } from "poseidon-lite";
import { blake2b } from "blakejs";
import { signMessage, derivePublicKey } from "@zk-kit/eddsa-poseidon";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WASM = join(__dirname, "../build/medical_disclosure_js/medical_disclosure.wasm");
const ZKEY = join(__dirname, "../build/medical_disclosure_final.zkey");
const VKEY = JSON.parse(readFileSync(join(__dirname, "../build/verification_key.json"), "utf8"));

const MAX_DEPTH = 8;

function stringToBigint(s) {
  const bytes = new TextEncoder().encode(s);
  const hash = blake2b(bytes, undefined, 32);
  const hex = Array.from(hash.slice(0, 31))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return BigInt("0x" + hex);
}

const TEST_FIELDS = [
  ["name", "Alice"],
  ["age", "34"],
  ["condition", "diabetes"],
  ["bloodType", "A+"],
];

const hashFn = (a, b) => poseidon2([a, b]);
const tree = new LeanIMT(hashFn);
for (const [k, v] of TEST_FIELDS) {
  tree.insert(poseidon2([stringToBigint(k), stringToBigint(v)]));
}

const PRIV_KEY = "0x5fb92d6e98884f76de468fa3f6278f8807c48bebc13595d45af5bdc4da702133";
const signature = signMessage(PRIV_KEY, tree.root);
const pubKey = derivePublicKey(PRIV_KEY);

const FIELD_IDX = 1;
const [fieldKey, fieldValue] = TEST_FIELDS[FIELD_IDX];
const proof = tree.generateProof(FIELD_IDX);

console.log(`Tree root:   ${tree.root}`);
console.log(`Proof depth: ${proof.siblings.length}`);
console.log(`Proving:     ${fieldKey} = ${fieldValue}`);

const siblings = [...proof.siblings, ...Array(MAX_DEPTH - proof.siblings.length).fill(0n)];
const indices = Array.from({ length: MAX_DEPTH }, (_, i) => (proof.index >> i) & 1);

const input = {
  indices,
  merkleSiblings: siblings,
  depth: proof.siblings.length,
  fieldKeyHash: stringToBigint(fieldKey),
  fieldValueHash: stringToBigint(fieldValue),
  sigR8x: signature.R8[0],
  sigR8y: signature.R8[1],
  sigS: signature.S,
  merkleRoot: tree.root,
  pubKeyX: pubKey[0],
  pubKeyY: pubKey[1],
};

console.log("\n==> Generating proof (10-30s)...");
const { proof: zkProof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM, ZKEY);

console.log("Public signals:", publicSignals);
console.log("merkleRoot match:", BigInt(publicSignals[0]) === tree.root);

const valid = await snarkjs.groth16.verify(VKEY, publicSignals, zkProof);
console.log(`\nProof valid: ${valid}`);
if (!valid) process.exit(1);

const calldata = await snarkjs.groth16.exportSolidityCallData(zkProof, publicSignals);
console.log("\nSolidity calldata:");
console.log(calldata);
