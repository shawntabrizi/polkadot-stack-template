---
name: zk-circuits
description: >-
  Build, test, and deploy Groth16 ZK circuits (Circom + snarkjs) for the medical
  marketplace. Covers circuit design, trusted setup, browser-side proof
  generation, and pure-Solidity verifier deployment on pallet-revive (PVM).

  Trigger: When working on circuits/, the Groth16 verifier contract, snarkjs
  proof generation in the frontend, or any ZK-related task including circuit
  compilation, trusted setup, proof testing, or wiring proofs into fulfill().
license: MIT
metadata:
  author: benja
  version: '1.0'
  scope:
    - root
  auto_invoke:
    - circuits/
    - snarkjs
    - groth16
    - Verifier.sol
    - medical_disclosure.circom
    - zk.ts
---

## When to Use

Use this skill when:
- Writing or modifying `circuits/medical_disclosure.circom`
- Running the build pipeline (`build.sh`) — compile, ptau, zkey, verifier export
- Writing `web/src/utils/zk.ts` (snarkjs proof generation in browser)
- Writing or deploying `contracts/pvm/contracts/Verifier.sol`
- Debugging proof generation or verification failures

---

## PVM Compatibility — What We Know

Read `docs/pvm-zk-research.md` for full details. Summary:

| Concern | Status |
|---|---|
| BN254 ecAdd/ecMul/ecPairing precompiles | ✅ All implemented in `pallet-revive` |
| snarkjs `Verifier.sol` (inline assembly) | ❌ Does NOT compile with `resolc` |
| Pure-Solidity verifier via `staticcall` | ✅ Works — precompiles are called fine |

**The snarkjs-generated `Verifier.sol` uses EVM-specific inline assembly for packing
curve points before staticcall. `resolc` (Yul→RISC-V) cannot compile this.**
Use a pure-Solidity verifier instead (see pattern below).

---

## Critical Patterns

### Pattern 1: Circuit inputs — `BinaryMerkleRoot` takes a BIT ARRAY for indices

From `@zk-kit/circuits` source (`binary-merkle-root.circom`):
```circom
signal input indices[MAX_DEPTH];  // BIT ARRAY — each element is 0 or 1
signal input siblings[MAX_DEPTH]; // zero-padded to MAX_DEPTH
signal input depth;               // actual tree depth (runtime)
```

**NOT** a single packed integer. Extract bits from `proof.index` in JS:
```typescript
const indices = Array.from({ length: MAX_DEPTH }, (_, i) => (proof.index >> i) & 1);
const siblings = [...proof.siblings, ...Array(MAX_DEPTH - proof.siblings.length).fill(0n)];
```

### Pattern 2: LeanIMT proof is sparse — must pad siblings

`LeanIMT.generateProof(leafIndex)` omits siblings where no hash occurs (odd tree levels).
`proof.siblings.length` equals the actual tree depth, not MAX_DEPTH.

```typescript
const proof = tree.generateProof(leafIdx);
// proof = { index: number, leaf: bigint, siblings: bigint[], root: bigint }
// proof.siblings.length === actual depth (sparse, not MAX_DEPTH)
const depth = proof.siblings.length;
const siblings = [...proof.siblings, ...Array(MAX_DEPTH - depth).fill(0n)];
const indices = Array.from({ length: MAX_DEPTH }, (_, i) => (proof.index >> i) & 1);
```

### Pattern 3: Reconstruct LeanIMT from stored leaves

The signed package stores `merkleTree: { leaves: string[], depth: number }` — NOT the
internal `_nodes` matrix. Cannot use `LeanIMT.import()`. Must rebuild:

```typescript
import { LeanIMT } from "@zk-kit/lean-imt";
import { poseidon2 } from "poseidon-lite";

const hashFn = (a: bigint, b: bigint) => poseidon2([a, b]);
const tree = new LeanIMT<bigint>(hashFn);
tree.insertMany(pkg.merkleTree.leaves.map(BigInt));
// tree.root should equal BigInt(pkg.merkleRoot)
```

### Pattern 4: EdDSAPoseidonVerifier — exact signal names

From `circomlib/circuits/eddsaposeidon.circom`:
```circom
signal input enabled;  // set to 1
signal input Ax;       // pubKey[0]
signal input Ay;       // pubKey[1]
signal input S;        // signature.S
signal input R8x;      // signature.R8[0]
signal input R8y;      // signature.R8[1]
signal input M;        // merkleRoot as bigint (single field element)
```

`M` is passed raw as the 5th input to `Poseidon(5)` — no pre-hashing. This matches
`@zk-kit/eddsa-poseidon`'s `signMessage(privKey, rootBigint)` exactly.

### Pattern 5: Pure-Solidity BN254 staticcall (no assembly)

```solidity
function _callBn128Pairing(bytes memory input) internal view returns (bool) {
    (bool success, bytes memory result) = address(0x08).staticcall(input);
    require(success && result.length > 0, "pairing precompile failed");
    return abi.decode(result, (bool));
}
```

Build input with `abi.encodePacked(g1_x, g1_y, g2_x0, g2_x1, g2_y0, g2_y1, ...)` for
each pairing pair. Hardcode verification key points as `uint256 constant`.

---

## Circuit Design (Phase 3)

File: `circuits/medical_disclosure.circom`

```circom
pragma circom 2.1.6;

include "node_modules/circomlib/circuits/eddsaposeidon.circom";
include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/@zk-kit/circuits/circuits/binary-merkle-root.circom";

template MedicalDisclosure(MAX_DEPTH) {
    // Private inputs
    signal input leafIndex;
    signal input indices[MAX_DEPTH];    // BIT ARRAY
    signal input merkleSiblings[MAX_DEPTH];
    signal input depth;
    signal input fieldKeyHash;
    signal input fieldValueHash;
    signal input sigR8x;
    signal input sigR8y;
    signal input sigS;

    // Public inputs (pubSignals[0..2] in Solidity)
    signal input merkleRoot;
    signal input pubKeyX;
    signal input pubKeyY;

    // 1. Compute leaf = poseidon2(fieldKeyHash, fieldValueHash)
    component leafHasher = Poseidon(2);
    leafHasher.inputs[0] <== fieldKeyHash;
    leafHasher.inputs[1] <== fieldValueHash;

    // 2. Verify Merkle inclusion
    component merkle = BinaryMerkleRoot(MAX_DEPTH);
    merkle.leaf <== leafHasher.out;
    merkle.depth <== depth;
    for (var i = 0; i < MAX_DEPTH; i++) {
        merkle.indices[i] <== indices[i];
        merkle.siblings[i] <== merkleSiblings[i];
    }
    merkleRoot === merkle.out;

    // 3. Verify EdDSA signature over merkleRoot
    component eddsa = EdDSAPoseidonVerifier();
    eddsa.enabled <== 1;
    eddsa.Ax <== pubKeyX;
    eddsa.Ay <== pubKeyY;
    eddsa.R8x <== sigR8x;
    eddsa.R8y <== sigR8y;
    eddsa.S <== sigS;
    eddsa.M <== merkleRoot;
}

component main { public [merkleRoot, pubKeyX, pubKeyY] } = MedicalDisclosure(8);
```

MAX_DEPTH = 8 → supports up to 256 fields. Estimated ~4,500 constraints (well under 2M).

---

## Decision Tree

```
Need to compile circuit?          → cd circuits && npm install && bash build.sh
Circuit compiles but proof fails? → Check LeanIMT sparse siblings (Pattern 2)
Verifier.sol won't compile?       → Use pure-Solidity verifier (Pattern 5), NOT snarkjs output
Wrong merkleRoot in proof?        → Check bytes32 vs uint256 cast in Solidity
Tree root doesn't match?          → Rebuild tree via insertMany, not LeanIMT.import()
```

---

## Build Pipeline

```bash
# Install deps (circomlib, @zk-kit/circuits, snarkjs)
cd circuits && npm install

# Full build: compile → ptau → zkey → Verifier.sol
bash build.sh

# Test circuit with real inputs (must print "Proof valid: true")
node test/test_circuit.mjs

# Copy artifacts to frontend
cp build/medical_disclosure_js/medical_disclosure.wasm ../web/public/circuits/
cp build/medical_disclosure_final.zkey ../web/public/circuits/

# Copy verifier to contracts (then write pure-Solidity wrapper around its key constants)
cp build/Verifier.sol ../contracts/pvm/contracts/Verifier.sol
```

---

## Frontend Proof Generation

```typescript
import snarkjs from "snarkjs";

const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    "/circuits/medical_disclosure.wasm",
    "/circuits/medical_disclosure_final.zkey"
);

// Parse for Solidity calldata
const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
// calldata = '["0x...","0x..."],[[...],[...]],["0x...","0x..."],["0x...","0x...","0x..."]'
```

The `.zkey` file (~5–15MB) is fetched at runtime from `/circuits/`. Preload it in
`index.html` when the patient navigates to their dashboard to avoid waiting on submit.

---

## Solidity Integration

`fulfill()` public signals order: `[merkleRoot, pubKeyX, pubKeyY]`

```solidity
require(bytes32(pubSignals[0]) == listing.merkleRoot, "merkleRoot mismatch");
require(IVerifier(verifier).verifyProof(a, b, c, pubSignals), "ZK proof invalid");
```

`bytes32(pubSignals[0])` reinterprets the uint256 as bytes32 big-endian — identical to
how `bigintToHex(tree.root)` stores the root (padStart 64, big-endian).

---

## Resources

- `docs/pvm-zk-research.md` — PVM precompile status, assembly limitation, constraints
- `circuits/build/verification_key.json` — generated verification key (after build)
- `@zk-kit/circuits` source: `node_modules/@zk-kit/circuits/circuits/binary-merkle-root.circom`
- `circomlib` source: `node_modules/circomlib/circuits/eddsaposeidon.circom`
