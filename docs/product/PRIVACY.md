# Privacy Model

## What This Document Covers

This document describes:
1. What the cryptographic design actually hides and what it does not.
2. The threat model — who might try to learn what about whom.
3. Known limitations and residual risks.
4. Regulatory surface (GDPR / HIPAA) — flagged honestly, not resolved.

This is not a legal opinion. The regulatory section identifies open questions that require counsel
before any real-world deployment.

---

## The Cryptographic Privacy Stack

### Layer 1: Selective Disclosure (Merkle + EdDSA)

The medic signs a Poseidon Merkle root over all record fields using EdDSA. The patient can then
prove any subset of fields without revealing others:

- "This record contains a Type 2 Diabetes diagnosis." (categorical)
- "The patient's age is between 40 and 65." (range)
- "The HbA1c value is above 7.5%." (threshold)

Each field is a leaf in the Merkle tree. Revealing a field proves it was part of the signed
record without exposing sibling leaves.

**What this hides**: All fields not explicitly included in the proof's public output.

**What this does not hide**: The structure of disclosed criteria — a researcher knows "this is a
diabetes record from a patient aged 40–65." If the patient is the only person matching that
combination, inference is still possible.

**Mitigation**: k-anonymity enforcement at the UI level — listings should not go live until k
other records share identical proof criteria. This is a UX rule, not a cryptographic one.

### Layer 1b: Designated Verifier Encryption (In-Circuit ECDH + Poseidon)

Rather than the patient releasing a decryption key *after* payment, the clinical data is
encrypted *to the buyer's public key inside the same ZK circuit*.

**Where `clinical_data` comes from**: The patient decrypts their IPFS record with their own
private key, getting the plaintext JSON. They select which fields to disclose. Those field
values are the private inputs to the Merkle inclusion proof in Layer 1 — and those same
values are what gets encrypted here. The circuit handles both in one pass: it proves the
fields are genuine (Merkle inclusion) and simultaneously encrypts them for the buyer (ECDH +
Poseidon). `clinical_data` is not a separate input — it is the disclosed Merkle leaf values.

**Flow**:
1. Researcher publishes their BabyJubJub public key (`PK_buyer`) in the buy order.
2. Patient decrypts their IPFS record → selects fields to disclose → these become both the
   Merkle leaf inputs (Layer 1) and `clinical_data` for encryption.
3. Circuit computes: `shared_secret = ECDH(patient_ephemeral_key, PK_buyer)`
4. Circuit encrypts: `ciphertext = PoseidonEncrypt(clinical_data, shared_secret)`
5. The ciphertext and ECDH derivation are part of the proof — the contract verifies the
   encryption was done correctly for exactly `PK_buyer`.

**What this guarantees**: Even if the contract is compromised, the ciphertext is only decryptable
by the holder of `PK_buyer`'s private key. The patient cannot later claim they encrypted for a
different buyer. The researcher cannot decrypt data they did not pay for.

**What the proof does not hide**: That a purchase of type X occurred, and that the ciphertext was
produced for `PK_buyer`.

### Layer 2: Medic Anonymity (Semaphore)

Semaphore is a ZK protocol for anonymous group signaling. A medic can prove:

"I am a member of the Verified Medics group, and I am signing this document hash."

Without revealing which member they are.

**What this hides**: Which specific licensed physician attested a record.

**What this does not hide**:
- That some member of the group signed. (Intended — this is the attestation value.)
- The timing of the signature (on-chain timestamp).
- Aggregate patterns: if one medic is highly active, the pattern of nullifiers over time may be
  linkable to them even without identity (timing correlation attack). This is a known Semaphore
  limitation.

**Mitigation**: Medics should batch submissions and introduce timing randomness. This is a
recommended practice, not enforced by the protocol.

### Layer 3: Encrypted Storage

The full medical record is encrypted with the patient's key before being stored on IPFS. The
on-chain commitment is only the encrypted blob's CID and the ZK proof — never the plaintext.

**What this hides**: The actual record content from anyone who does not hold the decryption key.

**What this does not hide**: That an encrypted record exists at this CID, and that it was listed
and (if purchased) that a decryption key was exchanged.

---

## Threat Model

| Adversary | Target | Attack | Protocol Defense | Residual Risk |
|---|---|---|---|---|
| Researcher | Patient identity | Re-identification from ZK proof criteria | Selective disclosure + k-anonymity enforcement | Rare profiles (unique conditions) remain risky |
| Researcher | Medic identity | Trace which medic signed which record | Semaphore group proof | Timing correlation if medic is high-volume |
| Central Authority | Medic identity on-chain | De-anonymize medics | Semaphore: commitments are unlinkable to signing | Off-chain knowledge (CA knows who it onboarded) |
| Third party | Purchased data | Intercept in transit | Atomic on-chain key exchange (not off-chain) | None if key exchange is on-chain |
| Malicious patient | Fabricate records | List fake records | Requires valid Semaphore attestation from a verified medic | CA compromise (see RISKS.md) |
| Malicious medic | Attest fraudulent data | Sign false records | CA revocation; nullifier prevents double-use | Revocation is not retroactive |
| Protocol | Patient/medic data | Access encrypted blobs | Protocol never holds decryption keys | Contract upgrade attack (see RISKS.md) |

---

## What the Protocol Leaks by Design

On-chain data is public. The following is always visible:

- That a listing exists (ZK proof + IPFS CID + criteria metadata).
- That a purchase occurred (buyer address, listing ID, timestamp, price).
- The Semaphore nullifier for each attestation (prevents double-signing, but is public).
- The Certifying Authority's registry of identity commitments (not linkable to real identities,
  but the set size and update history are public).

This is the standard blockchain transparency trade-off. It cannot be fully eliminated without
moving to a private chain (which introduces different trust assumptions).

---

## Regulatory Surface

### GDPR (EU)

**Key tensions**:

- **Article 17 (Right to Erasure)**: GDPR grants individuals the right to have their data deleted.
  Blockchain records are immutable. The current design stores only hashes, ZK proofs, and
  encrypted CIDs on-chain — not personal data in the traditional sense. Whether these constitute
  "personal data" under GDPR is not settled law.

- **Article 5(1)(c) (Data Minimisation)**: Selective disclosure is strongly aligned with this
  principle. The protocol reveals only what is necessary.

- **Article 25 (Privacy by Design)**: The ZK approach is a strong argument here.

- **Article 44+ (Data Transfers)**: A public blockchain with global nodes may constitute a
  transfer of personal data to third countries.

**Status**: Open legal question. No EU court has definitively ruled on whether ZK proofs of
personal data hashes constitute processing of personal data. Do not deploy to EU patients without
legal counsel.

### HIPAA (US)

**Key tensions**:

- HIPAA covers "covered entities" (healthcare providers, insurers, clearinghouses) and their
  business associates. Whether a decentralized protocol is a covered entity is unclear.

- The 18 HIPAA Safe Harbor identifiers include "any other unique identifying number." ZK proof
  nullifiers could potentially qualify.

- HIPAA requires a signed authorization for most non-treatment uses of PHI. The patient-initiated
  listing model may satisfy this, but the authorization format is not established for blockchain
  contexts.

**Status**: Open legal question. US deployment requires HIPAA counsel before handling real patient
data.

### Practical stance for MVP

The two-week MVP uses **synthetic test data only**. No real patient records are processed. This
sidesteps all regulatory concerns for the initial build and demo. Regulatory compliance is a
pre-launch requirement, not an MVP requirement.
