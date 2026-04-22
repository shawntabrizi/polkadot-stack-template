# Protocol Flows

End-to-end technical flows for every process in the protocol.
Each flow shows who does what, where it happens (on-chain / off-chain / client), and what data moves.

> **Phase status**: Flows 2, 3, 4, 5, 6 reflect **Phase 5.2 (current deployed state)** — no ZK
> proof, no Semaphore, Statement Store instead of IPFS. Flows 1 and 7 describe the
> **Phase 7 planned** People Chain identity architecture, not yet implemented.

---

## Flow 1: Medic Identity Registration (Phase 7 — Planned, not yet implemented)

**Actors**: Medic, Central Authority (off-chain), People Chain

```
MEDIC (browser)                      AUTHORITY (off-chain)       PEOPLE CHAIN
      |                                      |                        |
      | 1. Set identity on People Chain      |                        |
      |   set_identity({                     |                        |
      |     display: name,                   |                        |
      |     additional: [                    |                        |
      |       ("babyjub_pubkey", <pkX_hex>)  |                        |
      |     ]                                |                        |
      |   }) --------------------------------+----------------------->|
      |                                      |                        |
      | 2. Request judgement from registrar  |                        |
      |   request_judgement(registrarIndex) -+----------------------->|
      |                                      |                        |
      |             [Authority verifies medical license off-chain]    |
      |                                      |                        |
      |             3. Issue KnownGood       |                        |
      |                                      |--provide_judgement()-->|
      |                                      |   (KnownGood)          |
      |                                      |                        |
      | 4. Frontend reads judgement via PAPI |                        |
      |   identityOf(medic_account) ---------+----------------------->|
      |<-(judgements: [{registrarIndex, KnownGood}]) ----------------+|
      |                                      |                        |
      | Verified badge rendered in UI        |                        |
```

**What ends up on-chain (People Chain)**: `IdentityInfo` with name + `babyjub_pubkey` in
`additional`. The `KnownGood` judgement from the trusted registrar index.

**What the frontend checks**: `judgements` array contains `KnownGood` from the configured
`RegistrarIndex`. No Mixer Box, no commitments, no anonymous onboarding — the medic is
identified by their People Chain account.

---

## Flow 2: Record Listing (Phase 5.2 — Current)

**Actors**: Medic, Patient, Asset Hub

```
MEDIC (browser)                          PATIENT (browser)              ASSET HUB
      |                                        |                             |
      | 1. Enter record fields (clinical data) |                             |
      |                                        |                             |
      | 2. Encode header to 8 field elements   |                             |
      |    encodeHeaderToFieldElements()        |                             |
      |    → headerFields[8]                   |                             |
      |                                        |                             |
      | 3a. Compute headerCommit               |                             |
      |    Poseidon8(headerFields[8])           |                             |
      |                                        |                             |
      | 3b. Encode body to 32 field elements   |                             |
      |    encodeRecordToFieldElements()        |                             |
      |    → body_plaintext[32]               |                             |
      |                                        |                             |
      | 3c. Compute bodyCommit                 |                             |
      |    HashChain32(body_plaintext[32])      |                             |
      |    = poseidon2(poseidon16(first16),     |                             |
      |                poseidon16(last16))      |                             |
      |                                        |                             |
      | 4. Compute recordCommit + sign         |                             |
      |    recordCommit = Poseidon2(            |                             |
      |      headerCommit, bodyCommit)          |                             |
      |    EdDSA-Poseidon(medicSk, recordCommit)|                             |
      |    → { R8x, R8y, S }                   |                             |
      |    medicPk = derivePublicKey(medicSk)  |                             |
      |                                        |                             |
      | 5. Export signed package               |                             |
      |----(header, body_plaintext[32], -----→ |                             |
      |     headerCommit, bodyCommit,          |                             |
      |     recordCommit, medicPk, sig)         |                             |
      |                                        |                             |
      |             6. Import + save to localStorage / Host KV               |
      |                (key: "signed-pkg:<recordCommit>")                    |
      |                                        |                             |
      |             7. createListing           |                             |
      |                (header,                |                             |
      |                 headerCommit,          |                             |
      |                 bodyCommit,            |                             |
      |                 medicPkX, medicPkY,    |                             |
      |                 sigR8x, sigR8y, sigS,  |                             |
      |                 price) ----------------+------------------------→   |
      |                                        |                             |
      |             Listing is live.           |                             |
```

**What ends up on-chain**: `title`, `recordType`, `recordedAt`, `facility` (clear), `headerCommit`,
`bodyCommit`, `medicPkX`, `medicPkY`, `sigR8x`, `sigR8y`, `sigS`, `price`, `patient`, `active=true`.
The full medic signature is public — researchers can pre-verify "a known medic signed this" before
placing a buy order by recomputing `headerCommit` from the clear header fields.

**What stays off-chain**: `body_plaintext[32]` — stored in the patient's browser (localStorage or
Host KV). Required at fulfill time to encrypt the record for the buyer.

---

## Flow 3: Buy Order Placement

**Actors**: Researcher, Asset Hub

```
RESEARCHER (browser)                                              ASSET HUB
      |                                                               |
      | 1. Browse listings                                            |
      |---getListingCount() + getListing(i) + getListingHeader(i)--->|
      |<--[Listing{headerCommit, bodyCommit, medicPk, sig,           |
      |            title, recordType, recordedAt, facility, price}]--|
      |                                                               |
      | 2. Pre-verify listing (off-chain, before paying)             |
      |   ✓ Poseidon8(encodeHeader(header)) == listing.headerCommit  |
      |   ✓ EdDSA.verify(medicPk, sig, Poseidon2(hC, bC))           |
      |   (shown as ✓/✗ chips in listing card)                       |
      |                                                               |
      | 3. Generate BabyJubJub keypair (if not already done)         |
      |   (pkBuyer, skBuyer) — skBuyer stays in browser             |
      |                                                               |
      | 4. Place buy order                                            |
      |---placeBuyOrder(-------------------------------------------->|
      |       listingId,                                              |
      |       pkBuyerX, pkBuyerY  ← committed on-chain               |
      |   ) payable  ← native PAS locked in contract                 |
      |   (if a lower offer exists, this tx must exceed it           |
      |    — old order is auto-cancelled and refunded)               |
      |                                                               |
      | Order is on-chain. Funds locked. pkBuyer is public.          |
```

**What ends up on-chain**: `listingId`, `pkBuyerX`, `pkBuyerY`, `amount` (native PAS), `confirmed=false`.

**Why `pkBuyer` must be on-chain before the patient acts**: The patient reads `pkBuyer` from
the order and uses it as the ECDH target for the Poseidon stream cipher encryption. The
ciphertext is locked to this specific public key — only the holder of `skBuyer` can decrypt.

---

## Flow 4: Record Sale (Phase 5.2 — Off-chain Verification)

**Actors**: Patient, Researcher, Statement Store, Asset Hub

> Phase 5.2 relaxes atomicity: no Groth16 proof is generated or verified on-chain. Payment
> releases when the patient calls `fulfill()`; the buyer verifies correctness off-chain after
> decrypting. Phase 5.3 will add a reclaim window for buyers who detect a bad ciphertext.

**PATIENT — encrypt and fulfill:**
```
PATIENT (browser)                              STATEMENT STORE    ASSET HUB
      |                                               |                 |
      | 1. Read buy order                             |                 |
      |---getOrder(orderId) / getPendingOrderId()-----+--------------→ |
      |←-(listingId, pkBuyerX, pkBuyerY, amount)------+----------------|
      |                                               |                 |
      | 2. Load signed package from local storage     |                 |
      |    body_plaintext[32], header, commits,        |                 |
      |    medicPk, sig                               |                 |
      |    (stored as "signed-pkg:<recordCommit>")    |                 |
      |                                               |                 |
      | 3. ECDH + Poseidon stream cipher (off-chain)  |                 |
      |    ephSk       ← random BabyJubJub scalar     |                 |
      |    ephPk       ← mulPointEscalar(Base8, ephSk)|                 |
      |    sharedPt    ← mulPointEscalar(pkBuyer, ephSk)               |
      |    ct[i]       ← (pt[i] + poseidon4([shX, shY, nonce, i]))     |
      |                    % BN254_R                  |                 |
      |    ctHash      ← HashChain32(ct[32])          |                 |
      |                                               |                 |
      | 4. Upload ciphertext to Statement Store       |                 |
      |---(ct[32] as 32×32 bytes) ----------------->  |                 |
      |                                               |                 |
      | 5. fulfill(orderId, ephPkX, ephPkY, ctHash)---+--------------→ |
      |    Contract: releases listing.price to patient|                 |
      |             refunds excess to researcher      |                 |
      |             emits SaleFulfilled(orderId,      |                 |
      |               listingId, patient, researcher, |                 |
      |               ephPkX, ephPkY, ctHash)         |                 |
```

**RESEARCHER — fetch, decrypt, verify:**
```
RESEARCHER (browser)                           STATEMENT STORE    ASSET HUB
      |                                               |                 |
      | 1. Observe SaleFulfilled or poll              |                 |
      |    getFulfillment(orderId) -------------------+--------------→ |
      |←-(ephPkX, ephPkY, ciphertextHash) ------------+----------------|
      |                                               |                 |
      | 2. Fetch ciphertext from Statement Store      |                 |
      |---(ciphertextHash as lookup key) ----------→  |                 |
      |←-(ciphertext bytes 32×32) ------------------- |                 |
      |                                               |                 |
      | 3. Decrypt                                    |                 |
      |    sharedPt  ← mulPointEscalar(ephPk, skBuyer)|                 |
      |    pt[i]     ← (ct[i] - poseidon4([shX, shY, nonce, i])        |
      |                  + BN254_R) % BN254_R         |                 |
      |    body      ← decodeRecordFromFieldElements(pt)                |
      |                                               |                 |
      | 4. Off-chain verification                     |                 |
      |    ✓ HashChain32(pt) == listing.bodyCommit ?  |                 |
      |    ✓ Poseidon8(encodeHeader(header))           |                 |
      |        == listing.headerCommit ?              |                 |
      |    ✓ EdDSA.verify(medicPk, sig,               |                 |
      |        Poseidon2(headerCommit, bodyCommit)) ? |                 |
      |    (shown as ✓/✗ chips in ResearcherBuy.tsx)  |                 |
```

**What the researcher receives**: Decrypted body decoded to a JSON record via
`decodeRecordFromFieldElements()` in `web/src/utils/zk.ts`. Plus three off-chain verification
results (body commit match + header commit match + medic signature).

**What no one else can read**: The ciphertext requires `skBuyer` for ECDH decryption. Only
the holder of `skBuyer` can reconstruct the shared point and peel off the Poseidon pad.

---

## Flow 5: Patient Accesses Their Own Data (Phase 5.2 — Current)

**Actors**: Patient, Asset Hub

```
PATIENT (browser)                                                 ASSET HUB
      |                                                               |
      | 1. Load own listings                                          |
      |---getListingCount() + getListing(i)                          |
      |   + getListingHeader(i) for each i ----------------------→  |
      |←-[Listing{headerCommit, bodyCommit, medicPk, sig,           |
      |           title, recordType, recordedAt, facility, price,   |
      |           active}] (filter: listing.patient == own addr) ----|
      |                                                               |
      | 2. Read own plaintext                                         |
      |   Load signed package from localStorage / Host KV            |
      |   (key: "signed-pkg:<recordCommit>")                         |
      |   → body_plaintext[32] + header already in the package       |
      |   No on-chain or network fetch needed                         |
      |                                                               |
      | 3. Load sale history                                          |
      |---getOrderCount() + getOrder(i) + getFulfillment(i) ------→  |
      |←-[Order + Fulfillment structs for fulfilled listings] --------|
      |                                                               |
      | Dashboard shows:                                              |
      |   - Active listings (title, recordType, price, commits)      |
      |   - Fulfilled sales: researcher ephPk + ciphertextHash       |
      |   - Patient can re-read own plaintext from local storage      |
      |   - Total earnings from fulfilled orders                      |
```

**Key property**: The patient's signed package is never transferred or consumed by a sale.
Selling creates a buyer-specific ciphertext; the patient's local storage is unaffected.
The patient can always re-read their own records as long as the signed package file is in
their browser storage.

**Cross-device note**: The signed package lives in browser-local storage. If the patient
moves to a new device, they must re-import the signed package JSON. Phase 6 follow-up
(see `IMPLEMENTATION_PLAN.md`) discusses routing key storage through the Polkadot Host KV
API to survive IPFS CID redeploys on the same device.

---

## Flow 6: Patient→Doctor Direct Share (Phase 5.2 — Current)

**Actors**: Patient, Doctor, Statement Store, Asset Hub

> This flow is free — no escrow, no payment. The patient encrypts the record for the doctor's
> BabyJubJub pubkey using the same ECDH + Poseidon cipher as `fulfill()`, then emits a
> `RecordShared` event. The doctor reads their inbox by filtering logs on their own `pkX`.

**PATIENT — encrypt and share:**
```
PATIENT (browser)                              STATEMENT STORE    ASSET HUB
      |                                               |                 |
      | 1. Select doctor (from known-doctor list)     |                 |
      |    doctorPk = (pkX, pkY) read from contract  |                 |
      |    (discovered via doctor's own listings/     |                 |
      |     past RecordShared events they have sent)  |                 |
      |                                               |                 |
      | 2. Load signed package from local storage     |                 |
      |    body_plaintext[32], header, commits, sig   |                 |
      |                                               |                 |
      | 3. ECDH + Poseidon stream cipher              |                 |
      |    (same as fulfill — target = doctorPk)      |                 |
      |    ephSk, ephPk, ct[32], ctHash               |                 |
      |                                               |                 |
      | 4. Upload ciphertext to Statement Store       |                 |
      |---(ct[32]) ------------------------------>    |                 |
      |                                               |                 |
      | 5. shareRecord(header, headerCommit,          |                 |
      |      bodyCommit, medicPk, sig,                |                 |
      |      doctorPkX, doctorPkY,                    |                 |
      |      ephPkX, ephPkY, ctHash) -----------------+--------------→ |
      |    Contract: emits RecordShared (no storage,  |                 |
      |      no funds locked)                         |                 |
```

**DOCTOR — read inbox:**
```
DOCTOR (browser)                               STATEMENT STORE    ASSET HUB
      |                                               |                 |
      | 1. Fetch RecordShared events                  |                 |
      |   filter: doctorPkX == own pkX (indexed)      |                 |
      |   post-filter: doctorPkY == own pkY           |                 |
      |←-(RecordShared logs: header fields, commits,  |                 |
      |   medicPk, sig, ephPk, ctHash) ---------------+----------------|
      |                                               |                 |
      | 2. Fetch ciphertext                           |                 |
      |---(ctHash as lookup key) ----------------→    |                 |
      |←-(ciphertext bytes 32×32) --------------------|                 |
      |                                               |                 |
      | 3. Decrypt (skDoctor + ephPk via ECDH)        |                 |
      |                                               |                 |
      | 4. Verify (same 3 checks as ResearcherBuy)    |                 |
      |    ✓ HashChain32(body) == bodyCommit          |                 |
      |    ✓ Poseidon8(encodeHeader) == headerCommit  |                 |
      |    ✓ EdDSA.verify(medicPk, sig, recordCommit) |                 |
```

**What ends up on-chain**: `RecordShared` event log only — `doctorPkX` (indexed), `doctorPkY`,
all header fields, commits, medic sig, `ephPkX`, `ephPkY`, `ciphertextHash`. No storage slot consumed.

**What stays off-chain**: `body_plaintext[32]` in patient's browser. The ciphertext bytes in
the Statement Store (indexed by `ctHash`).

---

## Flow 7: Medic Credential Revocation (Phase 7 — Planned, not yet implemented)

**Actors**: Central Authority, People Chain

```
AUTHORITY (admin)                            PEOPLE CHAIN
      |                                           |
      | 1. Revoke judgement                       |
      |   kill_identity(medic_account)            |
      |   or provide_judgement(medic, Unknown) -->|
      |                                           |
      | Revocation is immediate and on-chain.     |
```

**What this does**: The medic's `KnownGood` judgement is removed from People Chain. The
frontend's PAPI read of `identityOf(medic_account)` no longer returns `KnownGood`, so:
- Newly browsed listings from this medic show as "unverified"
- The medic can no longer pass the identity gate in `MedicSign`

**What this does not do**: Invalidate past sales. Records already sold with this medic's
attestation remain valid — the commitment was made and the ciphertext already delivered.
Revocation is forward-only.

**Compared to the archived Semaphore approach**: The People Chain approach requires no
private `{address → commitment}` mapping and no `removeMember()` contract call. The
downside is that past listings from a revoked medic remain in the marketplace without an
on-chain flag — the frontend renders them as unverified, but researchers who don't
re-verify the medic badge may not notice.

---

## Summary: What Lives Where

### Phase 5.2 (current)

| Data | Location | Who can read it |
|---|---|---|
| `title`, `recordType`, `recordedAt`, `facility` | Asset Hub — Listing struct (public) | Anyone — browsable pre-purchase |
| `headerCommit` (Poseidon8 of header) | Asset Hub — Listing struct (public) | Anyone |
| `bodyCommit` (HashChain32 of body_plaintext[32]) | Asset Hub — Listing struct (public) | Anyone |
| `medicPkX/Y` + EdDSA signature | Asset Hub — Listing struct (public) | Anyone — researcher pre-verifies before paying |
| `pkBuyerX/Y` | Asset Hub — Order struct (public) | Anyone — pseudonymous |
| `ephPk` + `ciphertextHash` | Asset Hub — Fulfillment struct (public) | Anyone — ciphertext still needs `skBuyer` to decrypt |
| Ciphertext bytes | Statement Store (off-chain) | Anyone who knows the hash — but encrypted |
| Body plaintext | Patient's browser (localStorage / Host KV) | Patient only |
| Buyer private key `skBuyer` | Researcher's browser | Researcher only |
| Sale history | Asset Hub events (`SaleFulfilled`) | Anyone — buyer/patient addresses visible |

### Phase 7 (planned — adds People Chain identity)

| Data | Location | Who can read it |
|---|---|---|
| Medic real identity + BabyJubJub pubkey | People Chain (public) | Anyone |
| `KnownGood` judgement | People Chain (public) | Anyone — read via PAPI |
| Encrypted record blob | Statement Store (off-chain) | Anyone with hash — but encrypted |
| `headerCommit` / `bodyCommit` | Asset Hub contract (public) | Anyone |
| EdDSA signature | Asset Hub Listing (public) | Anyone — pre-verify before paying |
| Ciphertext (post-sale) | Asset Hub event log (public) | Buyer only (has `skBuyer`) |
