# ZKCP Binding: Design Options

## Problem

The medical marketplace needs a true atomic ZKCP (Zero-Knowledge Contingent
Payment): when the researcher pays and the patient fulfils, the researcher
must be **guaranteed** to recover the medic-signed record. Phase 5 on-chain
today falls short — the AES key's commitment is checked, but there's no
proof that the key actually decrypts to the data the medic signed. A
dishonest patient can commit a valid key and upload junk ciphertext; the
buyer pays and receives garbage.

Three binding properties must hold for full atomicity:

1. **P1 — Plaintext binding**: the data the circuit reasons about is the
   record the medic signed.
2. **P2 — Key binding**: the symmetric key delivered via ECDH is the key
   that was used to produce the on-chain/off-chain ciphertext.
3. **P3 — Ciphertext binding**: the ciphertext the researcher retrieves is
   the one the patient committed to at fulfillment.

The asymmetry: **P1 and P3 are cheap to enforce via Poseidon hashes**
inside the circuit. **P2 is the expensive one** — it requires proving
`Encrypt(plaintext, key) == ciphertext` inside the circuit, and AES-GCM
in-circuit is prohibitively expensive (millions of constraints per KB).

The design options below trade off circuit cost, contract size, storage
model, and atomicity guarantees.

---

## Option 1 — In-circuit Poseidon stream cipher (chosen for Phase 5.1)

### Shape

- Replace AES-GCM with a Poseidon-based stream cipher.
  `ciphertext[i] = plaintext[i] + Poseidon(sharedX, sharedY, nonce, i)`
- Plaintext is encoded as N=32 BN254 field elements (~961 bytes of
  canonicalised record).
- Circuit enforces all three bindings:
  - `Poseidon(plaintext) == recordCommit` (P1; medic's signed commitment)
  - ECDH derives `shared` from `ephemeralSk × pkBuyer`; pad is a
    deterministic function of `shared`; ciphertext is `plaintext + pad`.
    Stream cipher is SNARK-native, so encryption correctness is proved
    directly (combined P2 and P3).
  - `Poseidon(ciphertext) == ciphertextHash` (P3; committed to on-chain so
    the researcher knows which blob to retrieve).
- Ciphertext bytes live in the Substrate **Statement Store** on Asset Hub
  (already wired in `web/src/hooks/useStatementStore.ts` for both upload
  via `submitToStatementStore` and fetch via `fetchStatements`). Only the
  32-byte Poseidon hash appears in the proof's pubSignals.

### Properties

- **Atomicity**: full. An honest researcher who fetches the Statement
  Store blob and applies ECDH decryption is guaranteed to recover the
  medic-signed record.
- **Trust**: the only remaining risk is Statement Store availability
  (addressed below under "residual risks").

### Costs

- Circuit: ~48,000 constraints (Phase 5 is 21,460). Browser proof ~1.1s.
- ptau: 2^16 needed (Phase 5 uses 2^15).
- pubSignals: 9 (same order of magnitude as Phase 5's 11).
- Verifier.sol: ~200 lines, similar to Phase 5.
- Per-sale on-chain storage: 3 uint256 slots (ephPkX, ephPkY,
  ciphertextHash).
- Per-sale Statement Store: 1 KB (the 32 ciphertext elements).
- Statement Store per-account cap: 16 active statements
  (`MaxAllowedStatements` in `blockchain/runtime/src/configs/mod.rs`).
  A single patient manages at most 16 pending listings+fulfilments at
  once; fine for demo/MVP, can be lifted later via runtime config.

### Residual risks

- **Patient skips Statement Store upload.** Mitigated by upload-before-fulfill
  ordering in the UI: if `submitToStatementStore` throws, no on-chain tx
  is submitted. Post-fulfillment malice would require the patient to
  upload honestly then let the statement lapse — not something they're
  incentivised to do once payment is released, but not cryptographically
  prevented.
- **Statement Store data expiry.** Items live while the patient keeps
  paying the per-byte cost. Researcher should decrypt promptly after
  purchase. A stronger guarantee needs Phase 5.3's escrow primitive.
- **Circuit invariant gap**: if `encodeRecordToFieldElements` in JS
  drifts from the circuit's Poseidon chain, the patient can't produce a
  valid proof. Round-trip JS test guards this.

### Why Statement Store over Bulletin Chain for this option

Both work with the hash-commit design, but Statement Store is simpler:

| | Statement Store | Bulletin Chain |
|---|---|---|
| Upload helper | already wired | already wired |
| Fetch-by-hash helper | **already wired** (`fetchStatements` + filter) | not wired — needs tx-index lookup |
| Same chain as contract | yes (Asset Hub) | no (separate chain) |
| Authorisation | none | `TransactionStorage.Authorizations` preregistration required |
| Per-account cap | 16 statements | no explicit limit |
| Retention | pay-per-byte, account-lifecycle bound | ~weeks, chunked eviction |

Bulletin's longer retention doesn't pay off for a marketplace where
researchers decrypt shortly after purchase, and its authorisation
requirement is a real onboarding hurdle. Statement Store integration is
already complete in both directions in the web app; we only need to
redirect our flow to it.

---

## Option 2 — Three hashes + escrow window

### Shape

Keep AES-GCM + off-chain blob (Statement Store). Circuit enforces:

- `Poseidon(plaintext) == recordCommit` (P1)
- `Poseidon(aesKey) == aesKeyCommit` (key commitment)
- `Poseidon(ciphertext) == ciphertextHash` (P3)

Nothing links plaintext, key, and ciphertext inside the circuit
(AES-in-circuit would be required for that). The **escrow window** closes
the gap operationally:

- `fulfill()` moves payment into escrow, not to patient.
- Researcher has N blocks to call `acknowledge(orderId)` after verifying
  decryption succeeded (AES-GCM tag + `Poseidon(decrypted) == recordCommit`
  off-chain).
- If researcher calls `acknowledge` → payment releases to patient.
- If N blocks elapse without acknowledgement → `reclaim(orderId)` refunds
  the researcher.

### Properties

- **Atomicity**: economically atomic. A malicious patient can publish junk
  but they gain nothing — the researcher simply doesn't acknowledge and
  reclaims.
- **Trust**: honest researcher assumption at acknowledge time; researcher
  can withhold ack to grief, so some reputation mechanism may be needed
  long-term.

### Costs

- Circuit: smaller than Option 1 (~25k constraints — no in-circuit
  encryption, just the three hashes + EdDSA + ECDH).
- Verifier.sol: slightly larger (12 pubSignals vs 9) but still small.
- Per-sale on-chain storage: similar to Phase 5 + an escrow state.
- UX: two transactions per sale (fulfill → acknowledge) instead of one.
- **Griefing**: researcher can always `reclaim` to harass the patient.
  Needs a reputation or stake mechanism to discourage.

### Residual risks

- Researcher griefing (above).
- Still an AES-GCM dependency — if cryptographic assumptions on AES weaken,
  the scheme degrades.
- Requires an honest-researcher acknowledgement, which is why Option 1
  was preferred for Phase 5.1.

---

## Option 3 — Three hashes only, no escrow (detection-only)

### Shape

Same circuit as Option 2, minus the escrow. Payment releases immediately at
`fulfill()`. Researcher verifies off-chain after decrypt; if
`Poseidon(decrypted) != recordCommit` they have cryptographic proof of
patient fraud but money is gone.

### Properties

- **Atomicity**: none. Smallest delta from Phase 5 today.
- **Trust**: full patient-honesty assumption at encrypt time.
- **Forensics**: the researcher can prove fraud occurred (has a
  commit-vs-decrypt mismatch). Useful if there's an off-chain slashing
  mechanism or reputation system.

### Costs

- Circuit: smallest (same as Option 2 ~25k, or even less if we drop the
  ciphertextHash constraint).
- UX: unchanged from Phase 5 (one-transaction fulfillment).

### Residual risks

- No fraud prevention. Strictly better than Phase 5 only in that the
  researcher can *prove* the patient cheated; can't recover payment.

---

## Comparison table

| Property                | Phase 5 today  | Option 1 (5.1 choice)   | Option 2 (escrow)       | Option 3 (detection)    |
|-------------------------|----------------|-------------------------|-------------------------|-------------------------|
| P1 plaintext binding    | No (weak)      | **Yes** (in-circuit)    | **Yes** (hash)          | **Yes** (hash)          |
| P2 key↔ciphertext       | No             | **Yes** (in-circuit)    | No                      | No                      |
| P3 ciphertext binding   | No             | **Yes** (hash)          | **Yes** (hash)          | **Yes** (hash)          |
| Fraud prevention        | No             | **Yes**                 | **Economic (escrow)**   | No                      |
| Fraud detection         | Limited        | **Full**                | **Full**                | **Full**                |
| Ciphertext storage      | Statement Store| Statement Store         | Statement Store         | Statement Store         |
| AES-GCM retained        | Yes            | No                      | Yes                     | Yes                     |
| Circuit constraints     | ~21k           | ~48k                    | ~25k                    | ~25k                    |
| Txs per sale            | 1              | 1                       | 2 (fulfill + ack)       | 1                       |
| On-chain state/sale     | small          | 3 uint256               | small + escrow          | small                   |
| Extra chain dependency  | none           | none                    | none                    | none                    |

---

## Why AES-in-circuit was rejected

Implementing AES-GCM inside a Groth16 circuit would make Option 2 fully
atomic without an escrow, and keep the Statement Store as the sole storage
path. The constraint cost is the blocker:

- AES-128 single-block: ~10k constraints per block (byte-level S-box
  lookups dominate).
- A 1 KB record is 64 blocks → ~640k constraints just for the cipher core,
  before GCM's GHASH layer (similar cost again).
- Total for a modest record: >1M constraints. Proving time 30+ seconds on
  a desktop, much more on mobile. Trusted-setup ptau requirements jump to
  2^20.

Research SNARK-friendly AES (SNARK-AES, AES-TW) exists but is not
production-grade in any mainstream tool. Replacing the cipher entirely
(Option 1) is the practical path.

---

## Bulletin Chain considered as an alternative

The Polkadot Bulletin Chain (already wired in
`web/src/hooks/useBulletin.ts`) is a viable alternative storage layer
for this option — it offers longer retention (~weeks via
`pallet-transaction-storage`) and a larger per-upload cap (8 MiB). The
drawbacks that ruled it out for Phase 5.1:

- **Fetch path is not wired.** `useBulletin.ts` exposes upload but no
  fetch-by-hash; that would require scanning `TransactionStorage`
  history or threading `(blockNumber, txIndex)` coordinates through the
  contract.
- **Separate chain.** Extra RPC configuration, different signer
  lifecycle, cross-chain UX.
- **Authorisation onboarding.** Patients must acquire
  `TransactionStorage` authorisation before they can upload; a real
  first-time barrier.

Bulletin remains on the table if Statement Store retention turns out to
be insufficient at scale.

---

## What Phase 5.1 does NOT solve (out of scope, tracked as follow-ups)

Phase 5.1's guarantee is **atomic delivery of the record to the buyer's
pk** — the ZKCP property. It is explicitly *not* a privacy-preserving
design at the identity layer or at the field-granularity layer. The
following leaks remain open, each with a tracked phase.

### Identity exposure (Phase 6 — "Identity Privacy")

Every party's on-chain identity is publicly observable:

| Party      | Leak                                                                                                     |
|------------|----------------------------------------------------------------------------------------------------------|
| Patient    | `listing.patient = msg.sender` of `createListing()` — the patient's EVM address is public.               |
| Researcher | `order.researcher = msg.sender` of `placeBuyOrder()` — the researcher's address and purchase are public. |
| Medic      | `medicPkX/Y` is `pubSignals[1..2]` of the proof — the medic's BabyJubJub pubkey is in every ZK proof.    |

Mitigations, roughly ordered by cost:

- **Medic anonymity → Semaphore**. Replace the EdDSA-over-pk branch of the
  circuit with Semaphore group membership. Prove "some verified medic
  signed this" without revealing which one. This is what the original
  Phase 2/4 of `docs/product/IMPLEMENTATION_PLAN.md` specified and is the
  single biggest identity improvement. ~15–20k additional constraints,
  plus a Semaphore group contract on Asset Hub, plus the Mixer Box
  off-chain service that bridges People Chain `KnownGood` → group
  membership.
- **Patient anonymity → throwaway addresses** (cheap) or shielded
  escrow pool (heavy). Fresh address per listing is trivial; unlinkable
  shielded pool is a research-level project.
- **Researcher anonymity → throwaway addresses** (cheap) or stealth
  addresses (moderate). Same pattern.

### Field-level PII exposure (Phase 5.2 — "Header/Body Split")

Phase 5.1 encrypts the *entire* medic-signed record for the buyer. Any
PII fields the medic included — `name`, `dob`, `nationalId`, `address` —
are visible to the researcher after decryption.

**Decision (2026-04-19)**: ship Phase 5.1 with full-record delivery; fix
field-level PII exposure in Phase 5.2 rather than expanding the current
scope.

Phase 5.2 shape (sketched here for continuity; full plan lives in its
own doc when we pick it up):

- At sign time, medic tags each field as `header` (PII) or `body`
  (clinical). Encoder produces two plaintext arrays and two Poseidon
  chains: `headerCommit` and `bodyCommit`.
- Medic signs a **combined commit** `Poseidon(headerCommit, bodyCommit)`
  — this anchors the fact that both halves belong to the same record
  without forcing either half to be disclosed.
- **Research listing** sets `listing.recordCommit = bodyCommit`. The
  circuit takes the combined commit as a private input, re-derives it
  from `Poseidon(headerCommit, bodyCommit)` internally (medic EdDSA is
  checked against the combined commit), but only `bodyCommit` equals
  the listing's public commit. Only body fields are encrypted to the
  buyer; header never enters the ciphertext.
- **Medic-share listing** (later) uses a different contract entry
  point that accepts the combined commit and encrypts both halves.
- Cost in the circuit: one extra `Poseidon(2)`, one extra private
  input, a conditional on encryption length. Negligible constraints.

### Availability of the ciphertext (Phase 5.3 — "Escrow Window")

As noted under Option 1, Statement Store availability isn't verifiable
from the contract (no `pallet-revive` → `pallet-statement` chain
extension). A malicious or careless patient could skip the upload after
fulfillment, or the statement could lapse if the account stops paying
its per-byte fee before the researcher fetches. Phase 5.3 adds an
`acknowledge(orderId)` / `reclaim(orderId)` escrow window on top of the
Option 1 primitive to give economic recourse.

---

## Roadmap (at a glance)

| Phase   | Adds                                             | Solves                                       |
|---------|--------------------------------------------------|----------------------------------------------|
| 5.1     | In-circuit Poseidon cipher + Statement Store     | Atomic key delivery bound to buyer's pk      |
| 5.2     | Header/body split at sign time                   | PII fields not exposed to research buyers    |
| 5.3     | `acknowledge`/`reclaim` escrow window            | Researcher recourse if ciphertext unavailable|
| 6       | Semaphore group + throwaway/stealth addresses    | Anonymity for medic, patient, researcher     |

Each phase is a shippable increment. Identity preservation (Phase 6) is
the largest outstanding gap after 5.1–5.3 and should be planned as a
full phase of its own, not a patch.

---

## Decision record

- **2026-04-19**: Option 1 (in-circuit Poseidon cipher, Statement Store
  storage) chosen for Phase 5.1. Options 2 and 3 retained in this
  document as fallbacks if Option 1 hits implementation blockers.
  Bulletin Chain retained as an alternative storage layer if Statement
  Store retention proves insufficient.
- **2026-04-19**: Header/body split **not** folded into 5.1. Field-level
  PII remains exposed to researchers in this phase; Phase 5.2 is the
  fix. Rationale: keep 5.1 focused on the atomicity primitive; 5.2's
  sign-time partition UX is worth a dedicated phase.
- **Phase 5.3 follow-up** — `acknowledge`/`reclaim` escrow window for
  Bulletin-availability recourse.
- **Phase 6 follow-up** — identity privacy: Semaphore for medic
  anonymity, throwaway/stealth addresses for patient and researcher.

## References

- Phase 5 current implementation: commits `96afffa`, `ea9b1b6` on branch
  `phase5-ecdh-atomic-swap` (PR #11).
- Phase 5.1 plan: `~/.claude/plans/want-to-plan-the-polished-cray.md`.
- Circuit: `circuits/medical_disclosure.circom`.
- Statement Store helpers: `web/src/hooks/useStatementStore.ts` (upload + fetch).
- Bulletin upload helper (alternative): `web/src/hooks/useBulletin.ts`.

---

# Phase 5.2 — Decision to drop the on-chain circuit (relaxed atomicity)

> **Status:** decided 2026-04-19. Branch `phase5.2b`. Supersedes the on-chain
> Groth16 verification step from Phase 5.1.
>
> **Note for future readers:** the Phase 5.1 circuit + Verifier + ptau + zkey
> + proof fixture are intentionally **kept in the repo as archive** (under
> `circuits/`, `web/public/circuits/`, `contracts/pvm/contracts/Verifier.sol`,
> `contracts/pvm/test/fixtures/phase5_1_proof.json`). Nothing in the runtime
> imports them, but they remain as the working reference for any future ZKCP
> rebuild.

## What Phase 5.1 actually shipped

The Phase 5.1 Groth16 circuit (~47k constraints, ptau 2^16) bound four
properties in-circuit, exposed via 9 public signals:

1. `EdDSAPoseidonVerifier((medicPkX, medicPkY), (R8, S), recordCommit)` — the
   medic signed `recordCommit`.
2. `recordCommit == HashChain32(plaintext[32])` — the prover knows the
   plaintext that hashes to the commit.
3. `BabyPbk(ephemeralSk) == (ephPkX, ephPkY)` and
   `Ecdh(ephemeralSk, (pkBuyerX, pkBuyerY)) → shared` — a fresh ephemeral
   keypair was derived correctly and an ECDH shared secret was computed for
   the buyer's BabyJubJub pubkey.
4. For each of 32 slots: `c[i] == plaintext[i] + Poseidon(4)(sharedX, sharedY,
   nonce, i)` — the ciphertext is a Poseidon stream-cipher encryption of the
   plaintext under the ECDH-derived key, with `ciphertextHash =
   HashChain32(c[0..31])` exposed as `pubSignals[7]`.

`MedicalMarket.fulfill()` called a hand-rolled BN254 `Verifier.sol` to verify
the proof on PVM, asserted `pubSignals[0] == listing.recordCommit`,
`pubSignals[3..4] == order.pkBuyer`, `pubSignals[8] == orderId`, then stored
`(ephPk, ciphertextHash)` and released payment.

## What broke during local end-to-end testing

The verify path failed reliably from the browser:

- A direct `viem.writeContract` against the eth-rpc adapter SUCCEEDED — the
  proof is valid, the contract logic is correct.
- The browser path through PAPI `Revive.call` reverted with
  `ContractReverted` and **no debug message** surfaced by the pallet.
- `weight_limit` tuning sequence:
  - `3e9` ref_time → `ContractReverted` (out-of-gas).
  - `100e9` ref_time → `ExhaustsResources` (over per-extrinsic block budget).
  - `30e9` ref_time → `ContractReverted` (still OOG inside verify).
- Verifying the proof on PVM eats enormous `ref_time` (BN254 pairing in a
  pure-Solidity verifier with no native precompile assist on PVM). The
  window between "too low → contract OOG" and "too high → block budget"
  is tight and fragile.
- Each iteration cost ptau juggling, fixture regen, eth_call simulate
  instrumentation. The cost of debugging exceeded what the in-circuit
  binding actually buys us.

## Honest re-evaluation of what the circuit preserves

Walking through the four properties above:

- **#3 + #4 (in-circuit ciphertext binding to buyer pk)** is the only
  property that Solidity OR off-chain verification cannot replicate
  cheaply. We had already agreed to drop it (relaxed atomicity, with
  Phase 5.3 escrow planned as the fraud backstop).
- Once #3 + #4 are gone, properties #1 (medic sig) and #2 (preimage
  knowledge) become **busywork**: the buyer verifies the medic signature
  and recomputes `HashChain32(plaintext) == recordCommit` off-chain
  after decrypting anyway. Putting them in a circuit is compute, not
  security.
- The "ZKCP" framing weakens, but the user-visible value — "encrypted-
  data marketplace where the buyer cryptographically verifies the data
  they paid for" — survives intact.

## Decision

Remove the Groth16 stack from the active runtime. Encryption stays
(off-circuit ECDH + Poseidon stream cipher, **same construction** as
the in-circuit one — just runs in the browser). The medic public key +
EdDSA signature publish with the listing so any researcher can
pre-verify the medic before paying. The buyer verifies signature and
`recordCommit` off-chain after decryption.

### What is preserved

- **Plaintext privacy**: the record never appears on-chain or in any
  off-chain store except the buyer-pk-encrypted ciphertext.
- **Buyer-only decryption**: ECDH on BabyJubJub guarantees only the
  holder of `skBuyer` can derive the Poseidon stream-cipher key.
- **Medic accountability**: the EdDSA-Poseidon signature over
  `recordCommit` is publicly verifiable from the listing — researchers
  can filter "show me listings signed by medics whose public key I
  trust" before paying.
- **Tamper detection**: the buyer recomputes `HashChain32(plaintext)`
  after decryption and compares against `listing.recordCommit`. Any
  divergence (wrong bytes, swapped bytes, garbage) is detected
  immediately.

### What is lost (and why we accept the loss)

- **Atomicity between payment and correct-data delivery**. A dishonest
  patient could upload garbage to the Statement Store, then call
  `fulfill()`. Payment is released; the buyer detects the fraud on
  decrypt but cannot recover the funds in the same transaction. This
  is the gap Phase 5.3 (escrow / acknowledge / reclaim) is designed
  to close.
- **The "atomic ZKCP" framing on-chain.** The contract is now an
  encrypted-data marketplace with off-chain verification, not a
  zero-knowledge contingent payment.

## Concrete shape changes

### Contract — `MedicalMarket.sol`

- `Listing` struct grows: `recordCommit` + `medicPkX, medicPkY, sigR8x,
  sigR8y, sigS` + the existing title/price/patient/active fields.
- `createListing(recordCommit, medicPkX, medicPkY, sigR8x, sigR8y, sigS,
  title, price)`.
- `fulfill(orderId, ephPkX, ephPkY, ciphertextHash)` — no proof params,
  no Verifier call. Caller must be the patient; order must be pending.
- `IVerifier` interface and `verifier` constructor arg removed.
- `Verifier.sol` removed from active deployment but **kept in source**
  as archive (still compiles cleanly).

### Frontend

- `web/src/utils/zk.ts`: drop `snarkjs` import, `WASM_URL`/`ZKEY_URL`
  constants, `SolidityProof` type, `generateProofFromRecord`. Add
  synchronous `encryptRecordForBuyer({plaintext, pkBuyer, nonce}) →
  {ephPk, ciphertextBytes, ciphertextHash}`. All other helpers
  (encode/decode, hashChain32, randomScalar, ECDH decrypt) are reused
  unchanged.
- `PatientDashboard.tsx`: createListing form pulls medicPk + sig from
  the signed package; fulfill flow becomes
  `encryptRecordForBuyer → submitStatement → fulfill(orderId, ephPk.x,
  ephPk.y, ciphertextHash)`. All proof generation, eth_call simulation,
  weight_limit tuning, and `[fulfill]` debug instrumentation removed.
- `ResearcherBuy.tsx`: decrypt panel adds two off-chain checks after
  `decryptRecord`:
  1. `computeRecordCommit(encodeRecordToFieldElements(decrypted))` must
     equal `listing.recordCommit`.
  2. `verifySignature(listing.recordCommit, {R8, S}, [medicPkX, medicPkY])`
     from `@zk-kit/eddsa-poseidon` must return true.
  Both results render as ✓/✗ chips next to the decrypted fields.

### Tests

- Hardhat `MedicalMarket.test.ts` rewritten without the proof fixture.
  The full encrypt → fulfill → researcher-decrypt round-trip is
  simulated using `poseidon-lite` + `@zk-kit/baby-jubjub` directly
  (the same code paths the browser uses).
- The Phase 5.1 proof fixture file is kept in the repo as archive.

## Path back to a real ZKCP

If/when in-circuit binding is reintroduced, we should target
**Option 3** (three-hashes detection-only) from the comparison table
above rather than the heavy in-circuit ECDH+stream-cipher of Option 1.
Option 3 keeps the verifier dramatically smaller (no per-element
Poseidon pads), preserves the binding properties we care about, and
fits the PVM weight budget without contortions. The Phase 5.1 archive
in this repo contains a working Option-1 implementation that can be
referenced or extracted if needed.

## Decision record (Phase 5.2)

- **2026-04-19**: Drop the on-chain Groth16 verification entirely after
  the PVM weight-budget pain made the verify path unreliable from the
  browser. Encryption stays off-circuit; medic signature verification
  moves off-chain into the buyer's decrypt panel. Phase 5.3 escrow
  becomes the planned recourse for patient fraud. Phase 5.1 artifacts
  retained as archive.
