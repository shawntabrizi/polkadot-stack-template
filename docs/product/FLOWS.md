# Protocol Flows

End-to-end technical flows for every process in the protocol.
Each flow shows who does what, where it happens (on-chain / off-chain / client), and what data moves.

---

## Flow 1: Medic Onboarding

**Actors**: Medic, Central Authority (Mixer Box backend), People Chain, Asset Hub

```
MEDIC (browser)                  MIXER BOX (backend)         PEOPLE CHAIN    ASSET HUB
      |                                  |                         |               |
      | 1. Register identity             |                         |               |
      |----------------------------------------setIdentity()------>|               |
      |   (name, license number)         |                         |               |
      |                                  |                         |               |
      |  [Authority verifies off-chain: checks license database]   |               |
      |                                  |                         |               |
      | 2. Authority issues judgement    |                         |               |
      |<------------------------------------------KnownGood--------|               |
      |                                  |                         |               |
      | 3. Generate Semaphore identity locally                     |               |
      |   trapdoor + nullifier → commitment                        |               |
      |   (private keys never leave device)                        |               |
      |                                  |                         |               |
      | 4. Sign commitment               |                         |               |
      |   msg = "Registering commitment [X]"                       |               |
      |   signed with People Chain wallet                          |               |
      |                                  |                         |               |
      | 5. Submit to Mixer Box           |                         |               |
      |---(signature + commitment)------>|                         |               |
      |                                  |                         |               |
      |                   6. Verify signature                      |               |
      |                   7. Query KnownGood --------query-------->|               |
      |                                  |<-------confirmed--------|               |
      |                                  |                         |               |
      |                   8. Add to group|                         |               |
      |                                  |-----addMember(commitment)-------------->|
      |                                  |   (from Authority admin account)        |
      |                                  |                         |               |
      | 9. Onboarding complete           |                         |               |
```

**What ends up on-chain (Asset Hub)**: An anonymous Semaphore commitment, added by the Authority
account. No link to the medic's wallet or real identity.

**What the Mixer Box stores privately**: `{ people_chain_address → commitment }` — needed for
revocation. Never published.

---

## Flow 2: Record Upload and Listing

**Actors**: Medic, Patient, IPFS, Asset Hub

```
MEDIC (local tool)                          PATIENT (browser)          IPFS    ASSET HUB
      |                                             |                    |           |
      | 1. Construct Merkle tree                    |                    |           |
      |   JSON fields → Poseidon leaves             |                    |           |
      |   @zk-kit/lean-imt → Merkle root            |                    |           |
      |                                             |                    |           |
      | 2. Sign Merkle root                         |                    |           |
      |   EdDSA(BabyJubJub private key, root)       |                    |           |
      |   → signature (R, S)                        |                    |           |
      |                                             |                    |           |
      | 3. Deliver to patient                       |                    |           |
      |---(JSON fields + Merkle tree + signature)-->|                    |           |
      |                                             |                    |           |
      |                        4. Encrypt full record                    |           |
      |                           Encrypt(JSON, patient_private_key)     |           |
      |                           → encrypted_blob                       |           |
      |                                             |                    |           |
      |                        5. Upload to IPFS    |                    |           |
      |                                             |---upload blob----->|           |
      |                                             |<------CID----------|           |
      |                                             |                    |           |
      |                        6. Compute hash      |                    |           |
      |                           Poseidon(encrypted_blob) → dataHash   |           |
      |                                             |                    |           |
      |                        7. Create listing    |                    |           |
      |                                             |--createListing(----+---------->|
      |                                             |   merkleRoot,      |           |
      |                                             |   dataHash,        |           |
      |                                             |   ipfsCid,         |           |
      |                                             |   price)           |           |
      |                                             |                    |           |
      |                        Listing is live. No ZK proof generated yet.          |
```

**What ends up on-chain**: `merkleRoot`, `dataHash`, `ipfsCid`, `price`, `patient address`,
`status = Active`. No field values. No medic identity. No signature.

**What stays off-chain**: Plaintext JSON, Merkle tree structure, EdDSA signature.
All needed later when the patient generates the sale proof.

---

## Flow 3: Buy Order Placement

**Actors**: Researcher, Asset Hub

```
RESEARCHER (browser)                                              ASSET HUB
      |                                                               |
      | 1. Browse listings                                            |
      |-------------------getListings(criteria)---------------------->|
      |<------------------[list of listings with merkleRoot, price]--|
      |                                                               |
      | 2. Generate BabyJubJub keypair (if not already done)         |
      |   (pk_buyer, sk_buyer) — sk_buyer stays in browser           |
      |                                                               |
      | 3. Place buy order                                            |
      |-------------------placeBuyOrder(----------------------------->|
      |                       listingId,                              |
      |                       pk_buyer,    ← committed on-chain      |
      |                       USDT amount  ← locked in escrow        |
      |                   )                                           |
      |                                                               |
      | Order is on-chain. Funds locked. pk_buyer is public.         |
```

**What ends up on-chain**: `listingId`, `pk_buyer`, `escrowed amount`, `status = Pending`.

**Why `pk_buyer` must be on-chain before the patient acts**: The patient reads `pk_buyer`
from the contract and uses it as a public input to the ZK circuit. The circuit encrypts
the disclosed fields specifically for this key. The order cannot be fulfilled for a
different buyer.

---

## Flow 4: Record Sale (Proof Generation + Atomic Swap)

**Actors**: Patient, Asset Hub

This is the heaviest step. The patient generates a Groth16 proof entirely in the browser
using snarkjs, then submits it to the contract.

```
PATIENT (browser)                                                 ASSET HUB
      |                                                               |
      | 1. Read buy order from contract                               |
      |-------------------getBuyOrder(orderId)----------------------->|
      |<---(listingId, pk_buyer, price)-------------------------------|
      |                                                               |
      | 2. Decrypt own record from IPFS                               |
      |   fetch(ipfsCid) → encrypted_blob                             |
      |   Decrypt(encrypted_blob, patient_private_key) → JSON fields  |
      |                                                               |
      | 3. Select fields to disclose                                  |
      |   (matches what was committed in merkleRoot)                  |
      |                                                               |
      | 4. Generate ZK proof (client-side, snarkjs)                   |
      |                                                               |
      |   Private inputs:                                             |
      |     - disclosed field values (Merkle leaves)                  |
      |     - Merkle inclusion paths for those fields                 |
      |     - EdDSA signature (R, S) from medic                       |
      |     - Semaphore identity (trapdoor, nullifier)                |
      |     - patient ephemeral BabyJubJub private key                |
      |                                                               |
      |   Public inputs:                                              |
      |     - merkleRoot (from on-chain listing)                      |
      |     - Semaphore group root (from on-chain Semaphore contract)  |
      |     - nullifierHash (replay prevention)                       |
      |     - pk_buyer (from on-chain buy order)                      |
      |     - ciphertext (output: ECDH-encrypted disclosed fields)    |
      |     - externalNullifier (ties proof to this order)            |
      |                                                               |
      |   Circuit proves:                                             |
      |     ✓ EdDSA signature is valid over merkleRoot                |
      |     ✓ Disclosed fields are leaves of merkleRoot               |
      |     ✓ Signer is a member of Verified Medics Semaphore group   |
      |     ✓ ciphertext = PoseidonEncrypt(fields, ECDH(eph, pk_buyer)|
      |                                                               |
      | 5. Submit to contract                                         |
      |-------------------fulfill(---------------------------------->  |
      |                       proof,                                  |
      |                       nullifierHash,                          |
      |                       ciphertext,                             |
      |                       orderId                                 |
      |                   )                                           |
      |                                                               |
      |   Contract:                                                   |
      |     ✓ Verifies Groth16 proof (on PVM verifier contract)       |
      |     ✓ Checks nullifier not reused                             |
      |     ✓ Confirms merkleRoot matches listing                     |
      |     → Releases USDT/USDC to patient                          |
      |     → Emits ciphertext (indexed by pk_buyer)                  |
      |                                                               |
      | Atomic: payment and ciphertext in the same transaction.       |
```

**What the researcher receives**: The ciphertext emitted by the contract, decryptable only
with `sk_buyer`. They decrypt off-chain: `PoseidonDecrypt(ciphertext, ECDH(sk_buyer, eph_pub))`.

**What no one else can read**: The ciphertext is locked to `pk_buyer`. Even the patient who
generated it cannot decrypt it (they don't have `sk_buyer`).

---

## Flow 5: Patient Accesses Their Own Data

**Actors**: Patient, IPFS, Asset Hub

```
PATIENT (browser)                                    IPFS        ASSET HUB
      |                                               |               |
      | 1. Load own listings                          |               |
      |------getListings(patient = msg.sender)------->|               |
      |                     (not IPFS, this is contract read) ------->|
      |<-----[Listing[], each with ipfsCid, status, price]-----------|
      |                                               |               |
      | 2. For each listing — fetch + decrypt         |               |
      |------fetch(ipfsCid)-------------------------->|               |
      |<-----encrypted_blob---------------------------|               |
      |   Decrypt(encrypted_blob, patient_private_key)                |
      |   → plaintext JSON fields                     |               |
      |   (patient's own key, always available)       |               |
      |                                               |               |
      | 3. Load purchase history                      |               |
      |------getEvents(RecordSold, listingIds)------->|               |
      |                                        ---------------------->|
      |<----[{ listingId, pk_buyer, amount, timestamp }]-------------|
      |                                               |               |
      | Dashboard shows:                              |               |
      |   - All records (plaintext, decrypted)        |               |
      |   - Active / fulfilled / delisted listings    |               |
      |   - Per-sale: buyer pk_buyer, amount, date    |               |
      |   - Total earnings                            |               |
```

**Key property**: The patient's decryption key is independent of the sale ciphertext.
Selling does not transfer or exhaust the patient's key. They can decrypt their IPFS blob
at any time, forever (as long as they have the key and the blob is available).

---

## Flow 6: Medic Revocation

**Actors**: Central Authority, People Chain, Mixer Box, Asset Hub

```
AUTHORITY (admin)           MIXER BOX (backend)       PEOPLE CHAIN    ASSET HUB
      |                            |                        |               |
      | 1. Revoke judgement        |                        |               |
      |--------revokeJudgement(medic_address)-------------->|               |
      |                            |                        |               |
      | 2. Trigger revocation      |                        |               |
      |--------notify(medic_address)-->|                    |               |
      |                            |                        |               |
      |             3. Look up commitment                   |               |
      |             private_map[medic_address] → commitment |               |
      |                            |                        |               |
      |             4. Remove from group                    |               |
      |                            |------removeMember(commitment)-------->|
      |                            |          (from Authority admin acct)  |
      |                            |                        |               |
      | Revocation complete.       |                        |               |
```

**What this does**: The medic's Semaphore commitment is removed from the group. Future proofs
using their Semaphore identity will fail the group membership check.

**What this does not do**: Invalidate past sales. Records already sold with this medic's
attestation remain valid — the nullifier was consumed and the ciphertext already emitted.
Revocation is forward-only.

**Risk**: If a medic's Semaphore key is compromised *before* revocation, they could generate
fraudulent attestations in the window between compromise and revocation. Mitigation: the
Mixer Box should support emergency revocation (fast path, no timelock).

---

## Summary: What Lives Where

| Data | Location | Who can read it |
|---|---|---|
| Medic real identity | People Chain (public) | Anyone |
| Semaphore commitment | Asset Hub contract (public) | Anyone — but not linkable to medic |
| `{address → commitment}` map | Mixer Box (private) | Authority only |
| Encrypted record blob | IPFS | Anyone with CID — but encrypted |
| Plaintext record | Off-chain (patient device) | Patient only (has decryption key) |
| Merkle root | Asset Hub contract (public) | Anyone — reveals nothing about field values |
| EdDSA signature | Off-chain (patient device) | Patient only — private input to circuit |
| Ciphertext (post-sale) | Asset Hub event log (public) | Buyer only (has `sk_buyer`) |
| Purchase history | Asset Hub event log (public) | Anyone — buyer is pseudonymous (`pk_buyer`) |
