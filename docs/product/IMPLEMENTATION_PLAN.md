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

## Phase 2: People Chain Identity Gate (supersedes Semaphore approach)

**Goal**: Medic verification via People Chain `pallet-identity`. The frontend reads
`KnownGood` judgements via PAPI before allowing signing or listing.

**What changes:**
- Deploy local People Chain (or chopsticks fork of `people-paseo`) with Alice as registrar
- Medic calls `set_identity` with BabyJubJub pubkey in `additional` field
- Authority (Alice) issues `KnownGood` via `provide_judgement`
- Frontend gate in `MedicSign` and listing browse: query `identityOf` via PAPI, reject
  medics without `KnownGood` from the trusted registrar index

**What stays the same:**
- Manual key release (no ZK, no atomic swap)
- No ZK proofs yet

**Milestone check**: A medic registers on the local People Chain fork and receives `KnownGood`.
The frontend reads the judgement via PAPI and renders the verified badge. A medic without
`KnownGood` is blocked from signing.

**External dependency risk**: `people-paseo` chopsticks fork availability.
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

## Phase 4: Circuit Tightening (Merkle + EdDSA + ECDH)

**Goal**: The circuit proves the full ZKCP: Merkle inclusion, medic EdDSA signature, and
designated-buyer ECDH encryption. Medic anonymity is not a circuit property — the medic is
identified by their People Chain account.

**What changes:**
- Extend Circom circuit: add ECDH (`@zk-kit/poseidon-cipher`) + Poseidon encryption of
  disclosed fields, binding ciphertext to `PK_buyer` as public input
- Nullifier (external, per buy-order) prevents replay
- Contract checks nullifier has not been used

**What stays the same:**
- Patient still calls `fulfill()` after proof generation
- No on-chain ECDH verification yet

**Milestone check**: Patient generates proof binding Merkle root + EdDSA sig + ciphertext
to the buyer's pubkey. The same proof cannot be replayed for a different order.

**Note**: Semaphore group membership was part of the earlier circuit design but is dropped
in favour of the People Chain identity gate (Phase 2 / Phase 7). The medic is not anonymous
on-chain; they are verifiable via People Chain `KnownGood`.

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

## Phase 5.2: Encrypted Off-Chain Verification (shipped — 2026-04)

**Goal**: Remove the on-chain ZK verifier (BN254 pairing on PVM exceeded the weight budget)
while preserving buyer-specific encrypted delivery. Atomicity is relaxed; Phase 5.3 adds a
reclaim window. See `docs/product/ZKCP_DESIGN_OPTIONS.md` for the decision record.

**What changed from Phase 5:**
- `fulfill()` takes `(orderId, ephPkX, ephPkY, ciphertextHash)` — no proof, no nullifier
- Record is split into **header** (public, browsable: `title`, `recordType`, `recordedAt`,
  `facility`) and **body** (encrypted). The medic signs
  `recordCommit = Poseidon2(headerCommit, bodyCommit)` where
  `headerCommit = Poseidon8(encodeHeader(header))` and
  `bodyCommit = HashChain32(body_plaintext[32])`
- The full medic signature is published **on-chain** with the listing; any researcher can
  pre-verify the medic before paying
- Ciphertext uploaded to **Statement Store** (`pallet-statement`); only
  `ciphertextHash = HashChain32(ciphertext[32])` lands on-chain
- Settlement in native PAS (not USDT/USDC)
- Governance: 2-of-3 pallet-multisig (Bob, Charlie, Alice; threshold=2) deployed and
  `map_account`-registered (see `deployments.json`)
- Encryption: ECDH(ephSk, pkBuyer) → shared point → Poseidon stream cipher
  (`ct[i] = (pt[i] + poseidon4([shX, shY, nonce, i])) % BN254_R`)
- New `shareRecord()` function: patient shares a medic-signed record directly with a
  doctor's BabyJubJub pubkey — pure event emission, no escrow. Doctor reads inbox via
  `RecordShared` logs filtered by their `pkX` (indexed)

**Trust model**: a dishonest patient can upload garbage ciphertext and collect payment.
Buyer detects this by recomputing `HashChain32(plaintext) != listing.recordCommit` or
failing EdDSA verification. Phase 5.3 will add an escrow / acknowledge / reclaim window.

**Milestone check**: Full flow functional — medic signs in browser, patient lists + fulfills,
researcher decrypts + verifies off-chain. All three frontend pages (`MedicSign`,
`PatientDashboard`, `ResearcherBuy`) operational on local Asset Hub and Paseo.

---

## Phase 5.3: Buyer Reclaim Window (planned)

**Goal**: Restore buyer protection without requiring on-chain ZK. After `fulfill()`, a
challenge window allows the buyer to submit proof of a bad ciphertext and reclaim payment.

**What changes:**
- `fulfill()` triggers a timelock (e.g. 24 hours)
- Buyer can call `challenge(orderId)` and supply decrypted plaintext; contract checks
  `HashChain32(plaintext) == listing.recordCommit`; if mismatch, refunds buyer
- After window expires without challenge, patient withdraws payment

**Milestone check**: Buyer receives refund after submitting a plaintext that doesn't match
`recordCommit`. Patient receives payment only after the challenge window expires.

---

## Phase 6: Frontend + Testnet

**Goal**: Demonstrable end-to-end on Paseo testnet with a real UI.

**What changes:**
- v0-generated dashboards for medic, patient, researcher
- PAPI integration for chain reads
- snarkjs wired into frontend for browser proving
- Deployed to Paseo Asset Hub testnet

**Milestone check**: Demo flow completes on Paseo with test USDT.

### Phase 6 follow-up: persist AES keys across IPFS redeploys via Host KV

**Problem**: `PatientDashboard.createListing` currently stores the AES-256-GCM key with
`localStorage.setItem(...)`, which is scoped to the page's origin. The app iframe is served
from `https://<ipfs-cid>.app.dot.li` — every `make deploy-frontend` publishes a new CID →
new iframe origin → empty localStorage → all previously stored AES keys are orphaned. The
on-chain listing survives but becomes undecryptable until the patient finds the key file
somewhere else.

**Fix**: route AES-key storage (and any other persistent small blobs) through the Polkadot
Host's KV API instead of `window.localStorage`. `@novasamatech/host-api` exposes:

```ts
hostApi.localStorageRead(key: string)  : Promise<Result<Option<Uint8Array>, StorageErr>>
hostApi.localStorageWrite(key, value)  : Promise<Result<void, StorageErr>>
hostApi.localStorageClear(key: string) : Promise<Result<void, StorageErr>>
```

Where the data lives:
- Browser storage on `host.dot.li`'s origin (IndexedDB or localStorage, Host implementation
  detail), not the app iframe's origin.
- Scoped per-app by `dotNsId` (e.g. `medical-sdk-staging42.dot`).
- **Survives IPFS CID changes** (app iframe origin changes; Host origin doesn't).
- Still browser-local — does **not** sync across devices.
- Deleted when user clears `host.dot.li` site data or switches browsers/devices.

**Implementation sketch**:
1. New wrapper `web/src/hooks/useHostStorage.ts` with `readKey` / `writeKey` / `clearKey`.
2. Inside Host (`isInHost()` true): call `hostApi.localStorageRead/Write/Clear`.
3. Outside Host (local dev): fall back to `window.localStorage` so the dev loop stays
   zero-friction.
4. Update call sites in `PatientDashboard.tsx` and `ResearcherBuy.tsx` that key off
   `aes-key:…` and `signed-pkg:…`.

**Does not fix — cross-device recovery**. This makes keys survive redeploys on the **same
device**. For "patient creates listing on phone, fulfills on laptop" you still need either:
- A **Download backup** UI button so the patient can save the key file and re-upload it
  elsewhere.
- The **in-circuit ECDH to buyer's pubkey** pattern from `ARCHITECTURE.md` Phase 5, which
  encrypts the listing's decryption key for the buyer at buy-order time so the patient
  never has to retain it. This is the long-term correct answer and aligns with the ZKCP
  design.

**Priority**: low-medium. Fine for single-session demos. Becomes required the moment a
deploy cycle churns CIDs while there are live listings — which is the state the staging
deploy is already in.

---

## Phase 7: Polkadot System-Chain Composition (Live Paseo)

**Goal**: Complete the People Chain identity integration on live Paseo testnet. Admin
governance uses the deployed Asset Hub multisig. The marketplace consumes both via PAPI.
Medics are identified by their People Chain account — no anonymity layer.

**What changes:**
- **Multisig Certifying Authority on Asset Hub (`pallet-multisig`)**: create an N-of-M multisig
  client-side via PAPI. Deploy `MedicalMarket.sol` with `owner = multisig_address`. Admin
  calls dispatch via `multisig.asMulti`. No contract logic changes beyond the owner.
- **Medic verification via People Chain (`pallet-identity`)**: medic registers on Paseo People
  Chain (`wss://sys.ibp.network/people-paseo`) with their BabyJubJub signing pubkey embedded
  in an `additional` field of `IdentityInfo` keyed as `"babyjub_pubkey"` (raw 32-byte
  compressed point). A trusted Registrar issues `KnownGood`; the judgement implicitly covers
  the key binding.
- **Frontend identity gate**: `MedicSign`, `PatientDashboard`, `ResearcherBuy` call
  `identityOf(medic_account)` via PAPI; accept the medic only if `judgements` contains
  `KnownGood` from a configured trusted `RegistrarIndex`. Render a verified-name badge next to
  records and listings.
- **Local dev via chopsticks**: fork `people-paseo` with sudo-added Alice registrar so the
  `set_identity` → `request_judgement` → `provide_judgement` flow can be demoed without
  waiting on live-Paseo governance.

**What stays the same:**
- Phase 3 circuit (Merkle + EdDSA BabyJubJub) — no changes
- `MedicalMarket.sol` escrow and Groth16 verification logic
- `createListing` / `placeBuyOrder` / `fulfill` signatures

**Stretch (optional, only if time):**
- **USDT/USDC settlement via `pallet-assets` on Asset Hub**: replace native PAS in
  `placeBuyOrder` / `fulfill` with an Asset Hub asset. Wires the contract to a real
  system-chain asset instead of the parachain-local token.

**Milestone check**: A medic registers on a chopsticks-forked Paseo People Chain and receives
`KnownGood`. The frontend reads the judgement via PAPI and renders the verified badge next to
the medic's records. The marketplace contract is owned by a multisig; an admin call dispatched
via `multisig.asMulti` succeeds. The full sign → list → buy → prove → fulfill flow works
unchanged.

---

## Phase Summary

| Phase | Adds | Working end state | Trust required? | Status |
|---|---|---|---|---|
| 0a | Full disclosure skeleton | Money moves, data readable | Yes (fully open) | Done |
| 0b | Encryption + manual key | Data private, manual release | Yes (patient must cooperate) | Done |
| 1 | Header/body split + EdDSA signing | Correct data structure | Yes | Done |
| 2 | People Chain identity gate | Verified medics via KnownGood | Yes | Planned |
| 3 | First ZK circuit (Merkle only) | ZK proof verified on PVM | Yes | Planned |
| 4 | Circuit: EdDSA + ECDH | Full ZKCP without anonymity layer | Yes | Planned |
| 5 | ECDH + Poseidon (full ZKCP) | Atomic swap | **No** | Planned |
| **5.2** | **Off-chain verification + doctor share** | **Encrypted delivery, relaxed atomicity** | **Yes (buyer trusts patient)** | **Shipped** |
| 5.3 | Buyer reclaim window | Off-chain trust backstop | Yes (time-bounded) | Planned |
| 6 | Frontend + Paseo | Demonstrable product | Inherits 5.2 | In progress |
| 7 | Multisig CA + People Chain identity | Verified medics via system chains | Inherits Phase 5.2 | Partial (multisig deployed) |

The trust column shows the honest story: phases 0a through 4 all require the patient to
cooperate after payment. Phase 5 is when the protocol becomes genuinely trustless. Every
phase before it is a shippable MVP — just with a different trust model.

Each phase is a shippable increment. If the sprint ends at Phase 3, there is still a
demonstrable ZK proof on PVM. If it ends at Phase 4, medic anonymity works. Phase 5 is
the full product. Phase 6 is the pitch.
