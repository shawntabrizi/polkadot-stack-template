# Stakeholders

## Overview

Five distinct actors participate in the marketplace. Their goals are not always aligned, and the
protocol design exists precisely to manage those tensions without requiring trust between parties.

---

## 1. Patients (Data Owners)

**Who they are**: Individuals whose health records exist in the system.

**What they want**:
- Control over which facts about their health are shared and with whom.
- Compensation when their data is used.
- Confidence that buying their data does not expose their identity.
- The ability to revoke a listing or update a record.

**What they fear**:
- Re-identification by researchers or third parties who purchase their data.
- Data being used for purposes they did not authorize (insurance underwriting, employment screening).
- Key loss resulting in permanent loss of access to their own records.

**How the protocol serves them**:
- Selective disclosure circuits expose only what the patient explicitly permits.
- Payment flows directly to the patient's address at swap time.
- **Patients always retain access to their own records**: selling a record produces a ciphertext
  encrypted for the buyer's public key. The patient's own decryption key is never transferred.
  They can read their full plaintext records in the dashboard at any time.
- The dashboard shows: all records, all active listings, purchase history, and total earnings.
- Selling is not irrevocable access loss — it is producing a new, buyer-specific copy.

---

## 2. Medics (Attestors)

**Who they are**: Licensed medical professionals who validate the authenticity of health records.

**What they want**:
- To sign documents professionally without creating a permanent on-chain paper trail linking them
  to specific patients.
- Confidence that their professional credentials are not exposed in aggregate
  (pattern analysis of which medics certify which conditions).
- Clear liability boundaries — the signature attests to document authenticity, not medical advice.

**What they fear**:
- Loss of professional license due to privacy violations.
- Being coerced into signing fraudulent records.
- Technical complexity preventing adoption.

**How the protocol serves them**:
- Semaphore group membership proofs: the chain verifies "a verified medic signed this" without
  revealing which medic.
- The Central Authority handles credential verification off-chain; the medic never posts their
  identity on-chain.

---

## 3. Researchers (Buyers)

**Who they are**: Academic institutions, pharmaceutical companies, public health agencies, and
independent scientists purchasing verified health data.

**What they want**:
- Datasets matching specific clinical criteria (condition, age range, treatment history, geography).
- Confidence that data is authentic and not fabricated.
- Bulk access — not one record at a time.
- Reasonable price and fast settlement.

**What they fear**:
- Buying fabricated or low-quality records.
- Regulatory exposure for handling identified patient data.
- Paying before verifying (counterparty risk).

**How the protocol serves them**:
- ZK proofs guarantee the record matches the stated criteria before purchase.
- Medic attestation (via Semaphore) guarantees a licensed professional validated the data.
- Atomic swap (ZKCP) eliminates counterparty risk: payment and decryption key transfer
  simultaneously.

---

## 4. Certifying Authority (Trust Root)

**Who they are**: An organization with the authority to determine who counts as a licensed medic
within the system. In the current design, this role maps to two concrete on-chain/off-chain
responsibilities.

**What they might be**:
- A national medical board or professional association.
- A DAO of healthcare institutions that collectively manage the registry.
- A permissioned multisig operated by a non-profit foundation initially, transitioning to DAO
  governance.

**Two concrete responsibilities**:

1. **People Chain Registrar** — The Authority registers as an on-chain Identity Registrar on
   Polkadot's People Chain. They issue `KnownGood` judgements to verified medics using the
   Identity Pallet. This is the public, accountable layer.

2. **Blind Registration Bridge** — The Authority operates an off-chain backend server that
   receives a medic's signed Semaphore commitment, verifies the People Chain judgement, and calls
   `addMember()` on the Asset Hub Semaphore contract from the Authority's admin account. This
   creates the on-chain anonymity: the contract only sees the Authority adding a commitment, not
   the specific medic's wallet.

**What they control**:
- People Chain: issuing and revoking `KnownGood` judgements for medics.
- Asset Hub: calling `addMember` / `removeMember` on the Semaphore group contract.
- Privately: a mapping of `{people_chain_address → semaphore_commitment}` required for
  revocation. This mapping must never be published — it is the only link between identity and
  anonymity.

**What they must not be able to do**:
- Publish the address-to-commitment mapping (would break medic anonymity).
- Access patient records or decryption keys.
- Capture protocol fees or block specific researchers.

**Open question**: The right governance model is not yet resolved. A multisig of 3–5 recognized
medical orgs is the recommended MVP approach. DAO migration is V2. See `RISKS.md` for the
Authority compromise risk.

---

## 5. Protocol (Developers / Foundation)

**Who they are**: The team that builds and maintains the smart contracts, ZK circuits, and
(eventually) the parachain.

**What they control**:
- Contract upgrades (critical risk if not governed carefully).
- Circuit updates and verifier re-deployment.
- Documentation and tooling for medic/patient onboarding.

**Sustainability model**:
- Protocol fees on successful swaps (e.g. 1–2%).
- Grant funding during MVP phase (Web3 Foundation, Decentralized Futures).
- Potentially: governance token for future DAO operations (out of scope for MVP).

---

## Tension Map

| Tension | Parties | Resolution |
|---|---|---|
| Privacy vs. data fidelity | Patients ↔ Researchers | Selective disclosure circuits: researchers get what they need, nothing more |
| Anonymity vs. accountability | Medics ↔ Certifying Authority | Semaphore: authority knows a medic is valid; chain doesn't reveal which one |
| Decentralization vs. regulatory compliance | All parties | Certifying Authority is the off-chain compliance layer; protocol is neutral |
| Immutability vs. right to erasure | Patients ↔ Protocol | Only hashes/proofs on-chain; encrypted blobs can be deleted by patient |
| Fast MVP vs. trustless upgrades | Protocol ↔ Users | Upgradeable contracts in MVP; migrate to immutable or governance-controlled in V2 |
