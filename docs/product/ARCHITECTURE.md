# Architecture

## Overview: Two-Chain Design

Execution and settlement live on Asset Hub. People Chain provides professional identity via
`pallet-identity` in Phase 7 — not yet in the runtime. No Semaphore, no Mixer Box, no BBS+.

```
┌──────────────────────────────────────────────────────────────────────┐
│                    PEOPLE CHAIN (Phase 7 — planned)                  │
│  pallet-identity                                                     │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  Medic identity (name, BabyJubJub pubkey in `additional`)      │  │
│  │  Central Authority = on-chain Registrar                        │  │
│  │  Judgement: "Known Good" issued per verified medic             │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────┬───────────────────────────────────────────────┘
                       │ PAPI read (frontend, async)
┌──────────────────────▼───────────────────────────────────────────────┐
│                    ASSET HUB (deployed — Phase 5.2)                  │
│  pallet-revive · Solidity → resolc → PVM (RISC-V)                   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │  MedicalMarket.sol                                               │ │
│  │  createListing(header, headerCommit, bodyCommit, medicSig, price)│ │
│  │  placeBuyOrder(listingId, pkBuyerX, pkBuyerY) payable           │ │
│  │  fulfill(orderId, ephPkX, ephPkY, ciphertextHash)               │ │
│  │  shareRecord(header, commits, medicSig, doctorPk, ephPk, ...)   │ │
│  │  → releases native PAS on fulfill; emits ephPk + ctHash         │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  2-of-3 pallet-multisig (Bob, Charlie, Alice; threshold=2)          │
│  medicAuthority contract                                             │
└──────────────────────┬───────────────────────────────────────────────┘
                       │ ciphertextHash lookup
                       ▼
              Statement Store (pallet-statement)
              (patient-uploaded ciphertext bytes)
```

> **Phase 5.2 is the current deployed runtime.** See [Current State (Phase 5.2)](#current-state-phase-52)
> below. Phase 7 wires People Chain `KnownGood` judgements into the medic browse/listing flow.

---

## Current State: Phase 5.2

Phase 5.2 is the deployed runtime as of 2026-04. **No on-chain ZK proof, no Semaphore, no IPFS.**
The record is split into a browsable medic-signed header (stored in the clear on-chain) and an
encrypted body. The medic signs `Poseidon2(headerCommit, bodyCommit)`. Atomicity is relaxed
(Phase 5.3 will add a reclaim window). The archived circuit + verifier live in `circuits/` and
`contracts/pvm/contracts/Verifier.sol`; see `docs/product/ZKCP_DESIGN_OPTIONS.md` for the
decision record.

**Deployed** (addresses in `deployments.json`): `MedicalMarket.sol` Phase 5.2, `medicAuthority`,
2-of-3 pallet-multisig (threshold=2, signatories: Bob, Charlie, Alice; `map_account` registered).

### Phase 5.2 Structs and Events

```solidity
struct Listing {
    // Header — stored in the clear; browsable before purchase
    string  title;
    string  recordType;
    uint64  recordedAt;
    string  facility;
    uint256 headerCommit; // Poseidon8(encodeHeader(header))
    uint256 bodyCommit;   // HashChain32(body_plaintext[32])
    // Medic attestation — signs Poseidon2(headerCommit, bodyCommit)
    uint256 medicPkX;
    uint256 medicPkY;
    uint256 sigR8x;
    uint256 sigR8y;
    uint256 sigS;
    uint256 price;        // minimum in wei (native PAS)
    address patient;
    bool    active;
}

struct Order {
    uint256 listingId;
    address researcher;
    uint256 amount;       // native PAS locked
    bool    confirmed;
    bool    cancelled;
    uint256 pkBuyerX;     // researcher's BabyJubJub pubkey for ECDH
    uint256 pkBuyerY;
}

struct Fulfillment {
    uint256 ephPkX;         // patient's ephemeral BabyJubJub pubkey
    uint256 ephPkY;
    uint256 ciphertextHash; // Statement Store key = HashChain32(ciphertext[32])
}
```

```solidity
event ListingCreated(
    address indexed patient,
    uint256 indexed listingId,
    uint256 headerCommit, uint256 bodyCommit,
    uint256 medicPkX, uint256 medicPkY,
    string title, string recordType, uint64 recordedAt, string facility,
    uint256 price
);
event OrderPlaced(
    uint256 indexed listingId, uint256 indexed orderId,
    address indexed researcher, uint256 amount, uint256 pkBuyerX, uint256 pkBuyerY
);
event SaleFulfilled(
    uint256 indexed orderId, uint256 indexed listingId,
    address patient, address researcher,
    uint256 ephPkX, uint256 ephPkY, uint256 ciphertextHash
);
event RecordShared(
    address indexed patient,
    uint256 indexed doctorPkX, uint256 doctorPkY,
    uint256 headerCommit, uint256 bodyCommit,
    uint256 medicPkX, uint256 medicPkY,
    uint256 sigR8x, uint256 sigR8y, uint256 sigS,
    uint256 ephPkX, uint256 ephPkY, uint256 ciphertextHash,
    string title, string recordType, uint64 recordedAt, string facility
);
```

### Phase 5.2 Contract Interface

```solidity
// Patient: publish listing. Header in clear; medic sig over Poseidon2(headerCommit, bodyCommit).
// Researchers recompute headerCommit off-chain and verify sig before placing an order.
createListing(
    HeaderInput calldata header,  // {title, recordType, recordedAt, facility}
    uint256 headerCommit,         // Poseidon8(encodeHeader(header))
    uint256 bodyCommit,           // HashChain32(body_plaintext[32])
    uint256 medicPkX, uint256 medicPkY,
    uint256 sigR8x, uint256 sigR8y, uint256 sigS,
    uint256 price
)

// Researcher: lock native PAS + register BabyJubJub pubkey (must send ≥ listing.price).
// Outbid: if a pending order exists, new offer must exceed it; old order auto-refunded.
placeBuyOrder(uint256 listingId, uint256 pkBuyerX, uint256 pkBuyerY) payable

// Patient: declare ephemeral key + ciphertext hash; releases listing.price to patient.
// No on-chain proof. Buyer verifies (bodyCommit, headerCommit, EdDSA sig) off-chain.
fulfill(uint256 orderId, uint256 ephPkX, uint256 ephPkY, uint256 ciphertextHash)

// Patient: share a medic-signed record directly with a doctor's BabyJubJub pubkey.
// Pure event emission — no storage, no escrow. Doctor reads RecordShared logs
// filtered by their own pkX (indexed).
shareRecord(
    HeaderInput calldata header,
    uint256 headerCommit, uint256 bodyCommit,
    uint256 medicPkX, uint256 medicPkY,
    uint256 sigR8x, uint256 sigR8y, uint256 sigS,
    uint256 doctorPkX, uint256 doctorPkY,
    uint256 ephPkX, uint256 ephPkY,
    uint256 ciphertextHash
)

cancelListing(uint256 listingId)   // only if no pending order
cancelOrder(uint256 orderId)       // researcher refunded in full

getListingHeader(uint256 id)       // returns (title, recordType, recordedAt, facility)
```

### Phase 5.2 Off-Chain Verification (buyer / doctor)

After fetching ciphertext from the Statement Store and decrypting via ECDH + Poseidon stream cipher:
1. `HashChain32(body_plaintext) == listing.bodyCommit` — proves the decrypted body matches what was signed
2. `Poseidon8(encodeHeader(header)) == listing.headerCommit` — proves the browsed header fields are intact
3. `EdDSA.verify(medicPk, sig, Poseidon2(headerCommit, bodyCommit))` — proves a known medic signed the combined record

All three checks render as ✓/✗ chips in `ResearcherBuy.tsx` and `DoctorInbox.tsx`.

`HashChain32(x[32]) = poseidon2(poseidon16(x[0..16]), poseidon16(x[16..32]))` — `computeBodyCommit` in `web/src/utils/zk.ts`.  
`Poseidon8` covers the 8-slot encoded header — `computeHeaderCommit` in `web/src/utils/zk.ts`.  
`recordCommit = Poseidon2(headerCommit, bodyCommit)` — `computeRecordCommit`; this is what the medic signs.

---

## Layer 1: People Chain (Professional Credentialing — Phase 7)

The Central Authority registers as an on-chain **Registrar** on the People Chain and issues
`KnownGood` judgements to verified medics after off-chain credential verification.

This replaces any custom registry contract. The People Chain identity system is battle-tested
and provides a globally recognizable professional credential. The medic embeds their BabyJubJub
signing pubkey in an `additional` field of `IdentityInfo` keyed as `"babyjub_pubkey"`. The
`KnownGood` judgement implicitly covers that key binding.

**No synchronous XCM queries**: The identity check happens in the frontend via PAPI when
researchers browse listings or medics prepare to sign. The verified-name badge is rendered
based on a `KnownGood` judgement from the configured trusted `RegistrarIndex`.

---

## Layer 2: Asset Hub (Execution and Settlement)

### Data Anchoring (Phase 5.2 — current)

> Ciphertext is uploaded to the **Statement Store** (`pallet-statement`), not IPFS. Only
> `ciphertextHash = HashChain32(ciphertext[32])` lands on-chain, in the `Fulfillment` struct.
> The researcher fetches the ciphertext from the Statement Store after observing `SaleFulfilled`.
> `recordCommit = Poseidon2(headerCommit, bodyCommit)` — what the medic signs; not stored
> directly, only `headerCommit` and `bodyCommit` are stored separately in the Listing.

**Availability note**: Hash anchoring proves integrity but not availability. Phase 5.3 adds an
escrow/acknowledge/reclaim window so a buyer who gets a bad ciphertext can recover payment.
A bond-based IPFS availability mechanism is V2.

### Cryptographic Primitive Stack

| Component | Logic | Tooling | Audit status |
|---|---|---|---|
| Trust | Verify doctor's license | People Chain pallet-identity (Phase 7, async via PAPI) | — |
| Header integrity | Browse-time verification | `poseidon-lite` Poseidon8 | Production-used |
| Body integrity | Post-decrypt verification | `poseidon-lite` HashChain32 | Production-used |
| Medic signature | EdDSA over Poseidon2(headerCommit, bodyCommit) | `@zk-kit/eddsa-poseidon` (BabyJubJub EdDSA) | Semaphore V4 audit (Mar 2024) |
| Designated encryption | Buyer/doctor-specific ciphertext | `@zk-kit/poseidon-cipher` (ECDH + Poseidon) | Production-used |
| Escrow + settlement | Payment release | `MedicalMarket.sol` on PVM | — |
| Anchoring | Hash storage | Asset Hub contract state | — |

**zk-kit** (`@privacy-scaling-explorations/zk-kit`) provides audited, browser-compatible implementations
of EdDSA, ECDH, Poseidon encryption, and Merkle trees — all in TypeScript with matching Circom
circuit packages. Use it directly rather than custom implementations.

### The ZK Circuit (Phase 6+ — archived, not in current runtime)

One Groth16 circuit (Circom) proves all of the following:

```
Private inputs:
  - All JSON record fields (leaves of the Merkle tree)
  - Merkle inclusion paths for the disclosed fields
  - Medic's EdDSA signature over the Merkle root
  - Patient's ephemeral BabyJubJub private key (for ECDH)

Public inputs:
  - Merkle root (matches the on-chain commitment)
  - Disclosed field values (what the researcher sees)
  - Buyer's BabyJubJub public key PK_buyer
  - Poseidon ciphertext (encrypted disclosed fields)
  - External nullifier (ties proof to this specific buy order)

The circuit proves:
  1. Signature: The medic's EdDSA sig is valid over the Merkle root.
  2. Inclusion: The disclosed fields are leaves of that Merkle root.
  3. Encryption: The ciphertext = PoseidonEncrypt(disclosed_fields,
                   ECDH(patient_ephemeral_key, PK_buyer))
```

Only the researcher holding the private key for `PK_buyer` can decrypt the ciphertext.

**Why this circuit is achievable**: All components use circomlib primitives
(`EdDSA`, `MerkleProof`, `Poseidon`). No BLS12-381 pairing operations.
Estimated constraint count: 200k–500k R1CS constraints — well within browser proving limits.

### Patient Data Ownership Layer

Patients are data owners, not just sellers. The system must make this real in the UX.

**What the patient always retains:**

- The signed package JSON (stored in browser localStorage / Host KV as `signed-pkg:<recordCommit>`),
  which contains `body_plaintext[32]` — the patient can re-read their own record at any time.
- The ability to read their own records in plaintext in the dashboard.

Note: in Phase 5.2 there is no IPFS blob. The patient's own plaintext lives entirely in
local browser storage. Selling creates a buyer-specific ciphertext; the patient's storage
is not affected.

**What the contract stores per listing (Phase 5.2 — queryable by the patient):**

```solidity
struct Listing {
    string  title;
    string  recordType;
    uint64  recordedAt;
    string  facility;
    uint256 headerCommit; // Poseidon8(encodeHeader(header))
    uint256 bodyCommit;   // HashChain32(body_plaintext[32])
    uint256 medicPkX;
    uint256 medicPkY;
    uint256 sigR8x;
    uint256 sigR8y;
    uint256 sigS;
    uint256 price;
    address patient;
    bool    active;
}
```

**What the contract emits on fulfillment (Phase 5.2):**

```solidity
event SaleFulfilled(
    uint256 indexed orderId,
    uint256 indexed listingId,
    address patient,
    address researcher,
    uint256 ephPkX,
    uint256 ephPkY,
    uint256 ciphertextHash  // Statement Store key; researcher fetches ciphertext by this hash
);
```

**Patient dashboard reads (Phase 5.2):**

1. All `Listing` structs where `listing.patient == own address` → active / sold listings.
2. `SaleFulfilled` events for those listing IDs → purchase history, earnings, buyer ephPk.
3. Plaintext is in local storage (`signed-pkg:<recordCommit>`) — no network fetch needed.

**Key ownership model**: Selling a record creates a ciphertext encrypted for `pkBuyer` using
ECDH + Poseidon stream cipher. The patient's signed package is never transferred. The buyer
can decrypt only the ciphertext produced for their `pkBuyer`; these are independent.

---

### Contract Interface (Phase 5.2 — current)

**Create listing** (patient):
```solidity
// Store header in clear + commits + medic sig. Medic signs Poseidon2(headerCommit, bodyCommit).
createListing(
    HeaderInput calldata header,  // {title, recordType, recordedAt, facility}
    uint256 headerCommit,         // Poseidon8(encodeHeader(header))
    uint256 bodyCommit,           // HashChain32(body_plaintext[32])
    uint256 medicPkX, uint256 medicPkY,
    uint256 sigR8x, uint256 sigR8y, uint256 sigS,
    uint256 price
)
```

**Place buy order** (researcher):
```solidity
// Lock native PAS; register BabyJubJub pubkey for ECDH. Must send ≥ listing.price.
// Outbid: if a pending order exists, new offer must exceed it; old order auto-refunded.
placeBuyOrder(
    uint256 listingId,
    uint256 pkBuyerX,
    uint256 pkBuyerY
) payable
```
Researcher commits `pkBuyer` on-chain. Patient reads it from the order to derive the ECDH
shared secret and produce the buyer-specific ciphertext.

**Fulfill order** (patient):
```solidity
// No on-chain proof. Patient declares ephemeral key + ciphertext hash.
fulfill(
    uint256 orderId,
    uint256 ephPkX,
    uint256 ephPkY,
    uint256 ciphertextHash  // HashChain32(ciphertext[32]); Statement Store lookup key
)
```
Contract:
1. Verifies caller is `listing.patient`.
2. Releases `listing.price` to patient; refunds excess to researcher.
3. Emits `SaleFulfilled`. No proof verification — buyer verifies off-chain.

**Share with doctor** (patient):
```solidity
// Pure event emission — no storage, no escrow.
// Doctor reads RecordShared logs filtered by their pkX (indexed).
shareRecord(
    HeaderInput calldata header,
    uint256 headerCommit, uint256 bodyCommit,
    uint256 medicPkX, uint256 medicPkY,
    uint256 sigR8x, uint256 sigR8y, uint256 sigS,
    uint256 doctorPkX, uint256 doctorPkY,
    uint256 ephPkX, uint256 ephPkY,
    uint256 ciphertextHash
)
```

> **Phase 6 target**: `fulfill()` will accept a Groth16 proof, verify against the on-chain
> verifier, and check the Merkle root. That makes the swap fully atomic.

---

## Two-Week Sprint Plan (historical — completed 2026-04)

### Week 1: Identity and JSON-Merkle Logic

| Day | Work | Risk |
|---|---|---|
| 1–2 | Scaffold template. Deploy local Asset Hub. Mock People Chain registrar with a Node.js script. Verify `KnownGood` judgement flow end-to-end. | Low |
| 3–4 | Deploy `medicAuthority` contract. Wire 2-of-3 pallet-multisig. Verify `asMulti` flow on local Asset Hub. **First critical checkpoint.** | Medium |
| 5–7 | JSON-to-field-element TypeScript utilities. Medic signing tool: encode header + body → compute commits → EdDSA sign `Poseidon2(headerCommit, bodyCommit)`. Unit tests. | Low–Medium |

### Week 2: Circuit and Marketplace

| Day | Work | Risk |
|---|---|---|
| 8–10 | Circom circuit: Merkle inclusion + EdDSA verification + ECDH + Poseidon encryption. Compile to `.wasm` + `.zkey`. **Measure constraint count before proceeding.** Compile Groth16 verifier to Solidity, then resolc to PVM. **Second critical checkpoint.** | High |
| 11–12 | `MedicalMarket.sol`: `placeBuyOrder`, `fulfill`, escrow, atomic swap. Integration test: full flow on local PVM node. | Medium |
| 13–14 | Frontend (v0 + PAPI + snarkjs): medic signing tool, patient listing + proving flow, researcher buy flow. End-to-end on Paseo testnet. | Medium |

### Critical checkpoints

| Checkpoint | Day | Pass condition | Fallback |
|---|---|---|---|
| PVM + Verifier | 4 | Contract deployment and admin call succeed on local Asset Hub | Mock authority for demo |
| Circuit constraint count | 8 | < 2M constraints for browser proving | Split into two sequential proofs verified by contract |
| End-to-end on Paseo | 13 | Full buy flow completes with test PAS | Demo on local node only |

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
