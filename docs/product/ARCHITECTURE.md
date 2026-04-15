# Architecture

## Overview: Two-Chain Design

All execution and settlement lives on Asset Hub. People Chain handles professional identity
asynchronously via an off-chain Authority backend. No Bulletin Chain, no XCM synchronous reads,
no BBS+ pairing operations.

```
┌──────────────────────────────────────────────────────────────────────┐
│                         PEOPLE CHAIN                                 │
│  Identity Pallet                                                     │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  Medic on-chain identity (name, medical license ID)            │  │
│  │  Central Authority = on-chain Registrar                        │  │
│  │  Judgement: "Known Good" issued per verified medic             │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────┬───────────────────────────────────────────────┘
                       │ off-chain query
                       │ (async — no XCM precompile needed)
┌──────────────────────▼───────────────────────────────────────────────┐
│                    MIXER BOX (Authority Backend)                     │
│  Off-chain Node.js service                                           │
│  1. Medic submits: Semaphore commitment + People Chain signature     │
│  2. Backend verifies: KnownGood judgement on People Chain            │
│  3. Backend calls: addMember(commitment) on Asset Hub (admin key)    │
│  4. Maintains private: {address → commitment} for revocation         │
│                                                                      │
│  Result: on-chain, only the Authority account added a commitment.    │
│  No transaction links medic wallet to Semaphore commitment.          │
└──────────────────────┬───────────────────────────────────────────────┘
                       │ contract calls
┌──────────────────────▼───────────────────────────────────────────────┐
│                         ASSET HUB                                    │
│  pallet-revive · Solidity → resolc → PVM (RISC-V)                   │
│                                                                      │
│  ┌─────────────────────┐  ┌──────────────────────────────────────┐   │
│  │  Semaphore Group    │  │  MedicalMarket.sol                   │   │
│  │  addMember()        │  │  placeBuyOrder(criteria, price,      │   │
│  │  removeMember()     │  │               pk_buyer)              │   │
│  │  verifyProof()      │  │  fulfill(proof, ciphertext,          │   │
│  └─────────────────────┘  │           nullifier, ipfs_cid)      │   │
│                           │  → verify proof                      │   │
│  ┌─────────────────────┐  │  → release USDT/USDC to patient     │   │
│  │  ZK Verifier        │  │  → emit ciphertext + CID to buyer   │   │
│  │  (Groth16, via      │  └──────────────────────────────────────┘   │
│  │   resolc to PVM)    │                                             │
│  └─────────────────────┘  Contract state anchors:                   │
│                           - Blake2b/Poseidon hash of encrypted blob  │
│                           - IPFS CID                                 │
│                           - Buyer's PK_buyer (BabyJubJub)           │
└──────────────────────────────────────────────────────────────────────┘
                       │ read CID after purchase
                       ▼
                     IPFS
              (patient-maintained pin)
```

---

## Layer 1: People Chain (Professional Credentialing)

The Central Authority registers as an on-chain **Registrar** on the People Chain and issues
`KnownGood` judgements to verified medics after off-chain credential verification.

This replaces any custom registry contract. The People Chain identity system is battle-tested
and provides a globally recognizable professional credential.

**No synchronous XCM queries**: The identity check happens off-chain in the Mixer Box before
the medic is added to the Semaphore group. Once in the group, the marketplace contract verifies
credentials by checking the local Semaphore group root — a synchronous, cheap operation with
~500ms confirmation times.

---

## Layer 2: Mixer Box (Authority Backend)

An off-chain Node.js service that bridges asynchronous People Chain identity to synchronous
Asset Hub contract state.

**Blind Registration flow:**
1. Medic generates Semaphore identity locally (trapdoor + nullifier → commitment). Private
   keys never leave the device.
2. Medic signs: `"Registering Semaphore commitment [X]"` with their People Chain wallet.
3. Medic submits signature + commitment to Mixer Box via the frontend.
4. Mixer Box:
   - Verifies signature against the People Chain address.
   - Checks that address has `KnownGood` from the Authority registrar.
5. Mixer Box calls `addMember(commitment)` on the Semaphore contract **from the Authority
   admin account**. No on-chain link to the medic's wallet.

**Revocation flow:**
1. Authority revokes `KnownGood` on People Chain.
2. Mixer Box calls `removeMember(commitment)` using the private `{address → commitment}` mapping.
3. This mapping is the only link between identity and anonymity. Must never be published.

**Build estimate**: ~1–2 days. Express endpoint + polkadot.js query + contract call.

---

## Layer 3: Asset Hub (Execution and Settlement)

### Data Anchoring

When a record is listed, the patient stores two pieces of data in the marketplace contract:

1. **Hash**: Blake2b or Poseidon hash of the encrypted clinical blob.
2. **IPFS CID**: Content identifier for the blob stored on IPFS.

The ZK proof binds the buyer's `PK_buyer` to the specific hash stored in the contract. The
researcher is paying for the file whose hash is committed on-chain — not a different file.

**IPFS availability caveat**: Hash anchoring proves integrity but not availability. If the
patient unpins the IPFS file, the buyer receives a dead CID after paying. Two options:

- **Option A (recommended for MVP)**: Patient includes the encrypted blob in the `fulfill()`
  calldata. The contract emits it as an event. No IPFS dependency at fulfillment time.
  Downside: higher gas for large records.
- **Option B (V2)**: Patient deposits a bond at listing time, slashed if file is unretrievable
  within a challenge window.

### Cryptographic Primitive Stack

| Component | Logic | Tooling | Audit status |
|---|---|---|---|
| Trust | Verify doctor's license | People Chain (async via Mixer Box) | — |
| Integrity | Merkle root signature | `@zk-kit/eddsa-poseidon` (BabyJubJub EdDSA) | Semaphore V4 audit (Mar 2024) |
| Commitment | JSON field tree | `@zk-kit/lean-imt` (Poseidon Merkle tree) | Production-used |
| Anonymity | Signer privacy | Semaphore v4 (built on zk-kit) | Semaphore V4 audit |
| Designated encryption | Buyer-specific ciphertext | `@zk-kit/poseidon-cipher` (ECDH + Poseidon) | Production-used |
| Escrow + atomic swap | Settlement | `MedicalMarket.sol` on PVM | — |
| Anchoring | Hash/CID storage | Asset Hub contract state | — |

**zk-kit** (`@privacy-scaling-explorations/zk-kit`) provides audited, browser-compatible implementations
of EdDSA, ECDH, Poseidon encryption, and Merkle trees — all in TypeScript with matching Circom
circuit packages. Semaphore v4 is built on it. Use it directly rather than custom implementations.

**POD** (`pod.org`, 0xPARC) provides General Purpose Circuits for selective disclosure and has
native Semaphore integration. However, it is explicitly experimental with no security audit.
Consider for V2 if you want pre-built configurable circuits. Skip for MVP.

### The ZK Circuit

One Groth16 circuit (Circom) proves all of the following:

```
Private inputs:
  - All JSON record fields (leaves of the Merkle tree)
  - Merkle inclusion paths for the disclosed fields
  - Medic's EdDSA signature over the Merkle root
  - Patient's ephemeral BabyJubJub private key (for ECDH)
  - Semaphore identity (trapdoor, nullifier)

Public inputs:
  - Merkle root (matches the on-chain commitment)
  - Disclosed field values (what the researcher sees)
  - Semaphore group root (matches on-chain Semaphore state)
  - Semaphore nullifier hash (replay prevention)
  - Buyer's BabyJubJub public key PK_buyer
  - Poseidon ciphertext (encrypted disclosed fields)
  - External nullifier (ties proof to this specific buy order)

The circuit proves:
  1. Signature: The medic's EdDSA sig is valid over the Merkle root.
  2. Inclusion: The disclosed fields are leaves of that Merkle root.
  3. Anonymity: The signing medic is a member of the Semaphore group.
  4. Encryption: The ciphertext = PoseidonEncrypt(disclosed_fields,
                   ECDH(patient_ephemeral_key, PK_buyer))
```

Only the researcher holding the private key for `PK_buyer` can decrypt the ciphertext.

**Why this circuit is achievable in 2–3 days**: All four components use circomlib primitives
(`EdDSA`, `MerkleProof`, `Poseidon`, `Semaphore`). No BLS12-381 pairing operations.
No BBS+. Estimated constraint count: 200k–500k R1CS constraints — well within browser
proving limits.

### Patient Data Ownership Layer

Patients are data owners, not just sellers. The system must make this real in the UX.

**What the patient always retains:**

- Their private key (decrypts their own records at any time — selling does not transfer this key).
- The original encrypted blob on IPFS (until they choose to unpin it).
- The ability to read their own records in plaintext in the dashboard.

**What the contract stores per listing (queryable by the patient):**

```
struct Listing {
    bytes32 merkleRoot;       // commitment to the record's attribute tree
    bytes32 dataHash;         // hash of the encrypted blob
    bytes32 ipfsCid;          // where to fetch the encrypted blob
    bytes32[] disclosedFields; // which Merkle paths were committed
    uint256 price;
    address patient;
    ListingStatus status;     // Active | Fulfilled | Delisted
}
```

**What the contract emits on fulfillment (queryable as patient):**

```
event RecordSold(
    uint256 indexed listingId,
    bytes32 pkBuyer,          // buyer's BabyJubJub public key (pseudonymous)
    uint256 amount,           // USDT/USDC received
    uint256 timestamp
);
```

**Patient dashboard reads:**

1. All `Listing` structs where `listing.patient == msg.sender` → active listings.
2. All `RecordSold` events for those listing IDs → purchase history, earnings.
3. For each listing's `ipfsCid` → fetch encrypted blob → decrypt client-side → display plaintext.

**Key ownership model**: Selling a record creates a ciphertext encrypted for `PK_buyer` using
ECDH. The patient's own key is never transferred. The patient can decrypt their original blob
at any time. The buyer can decrypt only the ciphertext produced for their `PK_buyer`.
These are independent — one sale does not affect the patient's own access.

---

### Contract Interface

**Place buy order** (researcher):
```solidity
placeBuyOrder(
    bytes32 criteria,     // what condition/attributes are required
    uint256 price,        // USDT/USDC amount in escrow
    bytes32 pkBuyer       // researcher's BabyJubJub public key
)
```
Researcher commits `PK_buyer` on-chain before the patient runs the circuit. The patient reads
this value and uses it for the ECDH encryption step.

**Fulfill order** (patient):
```solidity
fulfill(
    bytes   proof,          // Groth16 proof
    bytes32 nullifier,      // Semaphore nullifier (replay prevention)
    bytes32[] ciphertext,   // Poseidon-encrypted disclosed fields
    bytes32 ipfsCid         // (optional if using calldata approach)
)
```
Contract:
1. Verifies the Groth16 proof against the on-chain verifier.
2. Checks nullifier has not been used (replay prevention).
3. Confirms Merkle root matches the on-chain listing commitment.
4. Atomically releases USDT/USDC to patient; emits ciphertext to researcher.

---

## Two-Week Sprint Plan (42 hours)

### Week 1: Identity and JSON-Merkle Logic

| Day | Work | Risk |
|---|---|---|
| 1–2 | Scaffold template. Deploy local Asset Hub. Mock People Chain registrar with a Node.js script. Verify `KnownGood` judgement flow end-to-end. | Low |
| 3–4 | Build Mixer Box: Express endpoint + People Chain judgement check + `addMember` call. Deploy Semaphore group contract on Asset Hub via resolc. Verify `addMember` + `verifyProof` on PVM. **First critical checkpoint.** | Medium |
| 5–7 | JSON-to-Merkle TypeScript utility. Medic signing tool: field → leaf → Merkle root → EdDSA signature with BabyJubJub. Unit tests for the Merkle construction. | Low–Medium |

### Week 2: Circuit and Marketplace

| Day | Work | Risk |
|---|---|---|
| 8–10 | Circom circuit: Merkle inclusion + EdDSA verification + Semaphore + ECDH + Poseidon encryption. Compile to `.wasm` + `.zkey`. **Measure constraint count before proceeding.** Compile Groth16 verifier to Solidity, then resolc to PVM. **Second critical checkpoint.** | High |
| 11–12 | `MedicalMarket.sol`: `placeBuyOrder`, `fulfill`, escrow, atomic swap. Integration test: full flow on local PVM node. | Medium |
| 13–14 | Frontend (v0 + PAPI + snarkjs): medic signing tool, patient listing + proving flow, researcher buy flow. End-to-end on Paseo testnet. | Medium |

### Critical checkpoints

| Checkpoint | Day | Pass condition | Fallback |
|---|---|---|---|
| PVM + Semaphore | 4 | `verifyProof` works on local Asset Hub with a test proof | Use pure Solidity verifier without PVM optimization for demo |
| Circuit constraint count | 8 | < 2M constraints for browser proving | Split into two sequential proofs verified by contract |
| End-to-end on Paseo | 13 | Full buy flow completes with test USDT | Demo on local node only |

---

## PVM Performance Advantage

The PVM's RISC-V architecture enables native-speed execution of cryptographic operations via
FFI calls to Rust-based verifiers. For the operations in this circuit:

| Operation | EVM cost | PVM cost (estimated) | Speedup |
|---|---|---|---|
| Groth16 pairing check | ~500k gas | ~40k gas | ~12x |
| Poseidon hash | ~700 gas/field | ~50 gas/field | ~14x |
| EdDSA verification | ~200k gas | ~15k gas | ~13x |

These estimates are directionally correct. Actual numbers require on-chain benchmarking.
The core point: ZK verification that is economically impractical on the EVM becomes
cheap enough for a real marketplace on PVM.

---

## Future: Homomorphic Research (V3)

Once individual record sales work, the system can support aggregate computation without
decryption using **Summa** (Parity's homomorphic encryption library for PVM). A researcher
could compute "average HbA1c across 1,000 patients" programmatically on encrypted on-chain
data with no individual record ever decrypted.

Out of scope for MVP. Requires no protocol changes — only additional circuit and contract work
on top of the existing encrypted storage model.
