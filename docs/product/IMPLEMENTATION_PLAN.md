# Implementation Plan

## Principle

Always have something that works. Each phase ends with a deployable, demonstrable system.
ZK complexity is added incrementally — never block on cryptography when the plumbing can be
proven first.

External dependency failures get logged immediately in `EXTERNAL_DEPS.md`. Do not spend more
than 2 hours fighting an external tool before logging it and finding a workaround.

---

## Phase 0a: Full Disclosure Skeleton (No Encryption, No ZK)

**Goal**: The economic flow works. Money moves. Data transfers. Nothing else matters yet.

Build the simplest possible marketplace: data is fully public, payment is manual, no
cryptography beyond wallet signatures. This validates the on-chain plumbing and the
data delivery mechanism before any privacy layer exists.

**What exists at the end of this phase:**
- A deployed `MedicalMarket.sol` on a local Asset Hub node
- A patient lists a record by uploading the raw JSON to the Statement Store (already in
  this template — zero setup cost) and posting the Statement Store key on-chain
- A researcher places a buy order and locks funds
- A patient confirms the order — funds release, researcher reads data directly from the
  Statement Store
- A basic frontend: connect wallet, list record, buy record, read data

**Contracts:**
```
MedicalMarket.sol (Phase 0a)
  - createListing(bytes32 statementKey, uint256 price)  // Statement Store key
  - placeBuyOrder(uint256 listingId)   // locks USDT/USDC
  - confirmSale(uint256 orderId)       // patient confirms → funds release
  - getListings()
```

**No:**
- Encryption of any kind
- Medic signatures
- Merkle trees
- Semaphore
- ZK proofs
- Atomic swap

**Statement Store note**: The template already has Statement Store wired into `start-all.sh`
and testable via `scripts/test-statement-store-smoke.sh`. Use it here as the data transport.
It is ephemeral by design — but that is not a problem. The Statement Store is a delivery
mechanism, not an archive. Once the researcher retrieves and exports the data, they own their
copy and the Statement Store entry can disappear without consequence. IPFS is introduced in
Phase 0b as the storage layer for the encrypted blob (which the patient needs to maintain),
not as a replacement for the delivery step.

**Milestone check**: Patient lists a JSON record. Researcher pays. Patient confirms. Researcher
reads the raw data. Funds are in the patient's wallet.

---

## Phase 0b: Add Encryption + Manual Key Release

**Goal**: Data is private. The economic flow still works. Key release is manual (no atomicity).

**What changes from Phase 0a:**
- Patient encrypts the record with a symmetric key before uploading to IPFS
- Patient stores the IPFS CID + data hash on-chain instead of a Statement Store key
- After the researcher pays, the patient manually submits the decryption key
- Contract releases funds when the key is submitted (two-step, not atomic)

**Contracts:**
```
MedicalMarket.sol (Phase 0b)
  - createListing(bytes32 dataHash, bytes32 ipfsCid, uint256 price)
  - placeBuyOrder(uint256 listingId)                    // locks USDT/USDC
  - fulfill(uint256 orderId, bytes32 decryptionKey)     // no ZK yet — patient just posts key
  - getListings()
```

**No:**
- Medic signatures
- Merkle trees
- Semaphore
- ZK proofs
- Atomic swap (patient still acts after payment — trust required)

**Milestone check**: Patient encrypts and uploads a record to IPFS. Researcher pays. Patient
posts the key. Researcher decrypts and reads the data. The only missing piece is atomicity —
a malicious patient could take the money and not post the key. That's what ZK fixes.

---

## Phase 1: Merkle Tree + EdDSA Signing

**Goal**: The data structure is correct. Medic signing works. The on-chain commitment is a
Merkle root, not a raw hash.

**What changes:**
- JSON-to-Merkle TypeScript utility (`@zk-kit/lean-imt`, Poseidon hash)
- Medic signing tool: computes Merkle root, signs with EdDSA BabyJubJub (`@zk-kit/eddsa-poseidon`)
- Contract stores `merkleRoot` instead of `dataHash`
- No on-chain signature verification yet — contract just stores the root

**What stays the same:**
- Manual key release (no ZK, no atomic swap)
- No Semaphore

**New tool:**
```
medic-sign.ts
  input:  JSON record fields
  output: Merkle tree, root, EdDSA signature (R, S)
  stores: signature off-chain (patient's device)
```

**Milestone check**: Medic signs a JSON record. Patient constructs Merkle tree. Root is stored
on-chain. Patient can later prove field inclusion against that root (needed for Phase 3).

---

## Phase 2: Mixer Box + Semaphore Group

**Goal**: Anonymous medic onboarding works. The Semaphore group exists on Asset Hub.

**What changes:**
- Deploy Semaphore group contract on Asset Hub (via `resolc`)
- Build Mixer Box backend (Node.js): receives commitment + People Chain signature, verifies
  `KnownGood`, calls `addMember()`
- Medic onboarding UI: generate Semaphore identity in browser, sign, submit to Mixer Box
- Mock People Chain registrar script (no real People Chain needed yet — a local Node.js script
  that simulates `KnownGood` responses)

**What stays the same:**
- Manual key release (no ZK, no atomic swap)
- No ZK proofs yet

**Milestone check**: A medic generates a Semaphore identity. The Mixer Box adds them to the
group on Asset Hub. A second medic can be added. Revocation removes them. All verifiable
on-chain.

**External dependency risk**: `resolc` compilation of the Semaphore verifier contract.
Log any issues immediately in `EXTERNAL_DEPS.md`.

---

## Phase 3: First ZK Circuit — Merkle Inclusion Only

**Goal**: A ZK proof is verified on PVM. This is the first real cryptographic gate.

**What changes:**
- Circom circuit: proves a field value is a leaf of a Merkle root signed by a valid EdDSA key
  (no Semaphore, no ECDH yet — just Merkle inclusion + EdDSA)
- snarkjs: browser-side proof generation
- Groth16 verifier contract compiled via `resolc` to PVM
- Contract verifies the proof before accepting a fulfillment

**What stays the same:**
- Manual key release (patient submits decryption key after proof verification)
- No ECDH encryption yet
- No Semaphore in circuit yet

**Milestone check**: Patient generates a ZK proof in the browser proving a specific field is
in the signed Merkle tree. Contract verifies it on PVM. Proof generation time measured.
Constraint count measured.

**If PVM compilation fails**: Fall back to EVM Hardhat network for circuit verification.
Log in `EXTERNAL_DEPS.md`. Continue Phase 3 on EVM. Do not block.

---

## Phase 4: Add Semaphore to Circuit

**Goal**: Medic anonymity is proven on-chain. The circuit now proves "a verified medic signed
this" without revealing which one.

**What changes:**
- Extend Circom circuit: add Semaphore group membership proof (medic's Semaphore identity is
  a private input; group root is a public input)
- Nullifier hash prevents double-use of same attestation
- Contract checks nullifier has not been used

**What stays the same:**
- Manual key release (patient still submits decryption key)
- No ECDH encryption yet

**Milestone check**: Patient generates proof that includes Semaphore group membership. Two
different Semaphore identities produce different nullifiers. Replaying the same proof is
rejected by the contract.

---

## Phase 5: Designated Buyer Encryption (Full ZKCP)

**Goal**: Atomic swap. Payment and encrypted data in one transaction. No trust required.

**What changes:**
- Extend circuit: add ECDH (`@zk-kit/poseidon-cipher` Ecdh) + Poseidon encryption of
  disclosed fields, using `PK_buyer` as public input
- Researcher `placeBuyOrder()` now includes `pk_buyer`
- Patient reads `pk_buyer` from order before generating proof
- `fulfill()` now accepts `ciphertext` instead of a raw decryption key
- Contract verifies proof + emits ciphertext atomically with payment release

**Milestone check**: Full flow — researcher places order with `PK_buyer`, patient generates
proof with encrypted ciphertext, contract verifies and swaps, researcher decrypts with
`sk_buyer`. No manual key release. No trust required between parties.

---

## Phase 6: Frontend + Testnet

**Goal**: Demonstrable end-to-end on Paseo testnet with a real UI.

**What changes:**
- v0-generated dashboards for medic, patient, researcher
- PAPI integration for chain reads
- snarkjs wired into frontend for browser proving
- Deployed to Paseo Asset Hub testnet

**Milestone check**: Demo flow completes on Paseo with test USDT.

---

## Phase Summary

| Phase | Adds | Working end state | Trust required? |
|---|---|---|---|
| 0a | Full disclosure skeleton | Money moves, data readable | Yes (fully open) |
| 0b | Encryption + manual key | Data private, manual release | Yes (patient must cooperate) |
| 1 | Merkle + EdDSA signing | Correct data structure | Yes |
| 2 | Mixer Box + Semaphore group | Anonymous medic onboarding | Yes |
| 3 | First ZK circuit (Merkle only) | ZK proof verified on PVM | Yes |
| 4 | Semaphore in circuit | Medic anonymity proven on-chain | Yes |
| 5 | ECDH + Poseidon (full ZKCP) | Atomic swap | **No** |
| 6 | Frontend + Paseo | Demonstrable product | No |

The trust column shows the honest story: phases 0a through 4 all require the patient to
cooperate after payment. Phase 5 is when the protocol becomes genuinely trustless. Every
phase before it is a shippable MVP — just with a different trust model.

Each phase is a shippable increment. If the sprint ends at Phase 3, there is still a
demonstrable ZK proof on PVM. If it ends at Phase 4, medic anonymity works. Phase 5 is
the full product. Phase 6 is the pitch.
