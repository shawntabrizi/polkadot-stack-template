# Use Cases

Each scenario walks through the system from a specific stakeholder's perspective. All scenarios
assume the MVP smart contract deployment (not the full parachain).

---

## UC-1: Researcher Buys a Cohort of Diabetes Records

**Actor**: Pharmaceutical researcher at a mid-size biotech.

**Goal**: Acquire 50 verified Type 2 Diabetes records from patients aged 40–65, with HbA1c values
and treatment history, for use in a drug efficacy study.

**Flow**:

1. Researcher queries the marketplace contract for listings matching their criteria.
2. The marketplace returns a list of record commitments — ZK proofs that each record contains a
   T2D diagnosis, age in range, and HbA1c data. No raw values are visible.
3. Researcher escrows USDC into the marketplace contract for 50 records at the agreed price.
4. For each record, the patient provides the decryption key. The contract verifies the key matches
   the commitment, releases payment to the patient, and emits the key to the researcher.
5. Researcher decrypts and receives the verified record.

**What the researcher never sees**: Patient name, exact birthdate, treating physician identity,
geographic location beyond what was part of the ZK proof criteria.

**What guarantees data quality**: The Semaphore proof embedded in each listing proves a verified
medic attested the record. The ZK circuit proves the stated clinical values are present. Neither
can be faked without breaking the cryptography.

---

## UC-2: Medic Anonymously Attests a Lab Result

**Actor**: Licensed endocrinologist onboarded by the Certifying Authority.

**Goal**: Sign a patient's HbA1c lab result so it can be listed on the marketplace.

**Flow**:

1. The Certifying Authority has previously added the medic's Semaphore identity commitment to the
   `MedicRegistry` contract. The medic's real identity is never posted on-chain.
2. Patient uploads their encrypted record and requests attestation.
3. Medic reviews the record off-chain (standard clinical review).
4. Medic generates a Semaphore group membership proof off-chain: "I am a member of the Verified
   Medics group, and I am signing this document hash."
5. The proof is submitted to the contract. The contract verifies membership without knowing which
   medic signed.
6. Record is now marked as medic-attested in the marketplace.

**Key property**: No entity — not the Certifying Authority, not the researcher, not the protocol —
can determine which specific medic attested which record.

---

## UC-3: Patient Lists Their Record with Fine-Grained Consent

**Actor**: Patient with a Type 2 Diabetes diagnosis.

**Goal**: Monetize their health data while controlling exactly what is revealed.

**Flow**:

1. Patient receives their medical record from their medic (already attested, as in UC-2).
2. Patient uses the frontend to define disclosure rules:
   - Reveal: condition category (T2D), age bracket (40–50), HbA1c range (>7.5%)
   - Hide: exact age, exact HbA1c value, location, all other diagnoses
3. Patient or their client runs the Circom circuit locally to generate a selective disclosure proof.
4. Patient uploads the encrypted full record to IPFS and submits the ZK proof + IPFS CID to the
   marketplace contract.
5. Listing goes live. Patient sets a price and a revenue split (e.g. 95% to patient, 5% protocol).
6. Patient can delist at any time by withdrawing the listing (the on-chain proof remains but the
   decryption key is never released unless a sale completes).

---

## UC-4: Certifying Authority Onboards a New Medical Board

**Actor**: National Association of Endocrinologists (hypothetical).

**Goal**: Bring 200 member physicians into the Verified Medics registry.

**Flow**:

1. The association integrates with the Certifying Authority's onboarding portal.
2. Each physician generates a Semaphore identity locally (trapdoor + nullifier → identity
   commitment). The private parts never leave their device.
3. The association submits identity commitments in batch to the `MedicRegistry` contract via the
   Certifying Authority's admin key.
4. Physicians can now generate attestation proofs for patient records immediately.

**What changes if the authority is a DAO**: Step 3 becomes a governance vote to approve the
association as a trusted submitter. The admin key is replaced by a multisig or governance proposal.
This is the preferred long-term design.

---

## UC-5: Aggregate Study Without Individual Record Access

**Actor**: Public health agency running a population-level study.

**Goal**: Determine the prevalence of HbA1c > 9% among T2D patients aged 50–70 without purchasing
individual records.

**Flow**:

1. Agency submits a query to the marketplace: "how many listings match condition=T2D, age=50-70,
   HbA1c>9%?"
2. The marketplace contract counts matching listings by checking the ZK proof metadata.
3. Agency receives a count (and optionally aggregate statistics if the circuit supports it).
4. No individual records are purchased. No decryption keys are exchanged. No payment required
   for the count query.

**Note**: This use case requires extending the ZK circuits to support aggregate proofs. It is out
of scope for the two-week MVP but is a natural V2 feature.

---

## UC-6: Researcher Verifies Data Integrity Post-Purchase

**Actor**: Same researcher from UC-1, auditing their dataset before publication.

**Goal**: Confirm that records they purchased have not been tampered with and were genuinely
attested by a verified medic.

**Flow**:

1. Researcher re-verifies the ZK proof embedded in each purchased listing against the on-chain
   verifier contract.
2. Researcher checks the Semaphore nullifier to confirm it was generated by a current member of the
   Verified Medics group (not a revoked medic).
3. Researcher confirms the IPFS CID of the encrypted record matches what was committed on-chain.
4. Researcher can include the on-chain proof hash in their publication as a data provenance
   citation.

---

## UC-7: Patient Views and Manages Their Own Data

**Actor**: Patient who has uploaded records and listed some for sale.

**Goal**: See all their own health records, understand what data they have listed, track who
purchased it, and manage active listings.

**Flow — viewing own records:**

1. Patient opens the dashboard and connects their wallet.
2. The frontend reads all record entries associated with their address from the marketplace
   contract (listing CIDs + hashes they submitted).
3. For each CID, the frontend fetches the encrypted blob from IPFS.
4. The patient decrypts each blob client-side using their own private key — they always retain
   the decryption key for their own data regardless of whether it has been sold.
5. Patient sees their full, plaintext records in the dashboard.

**Key property**: The patient can always read their own data. Selling a record means the buyer
receives a ciphertext encrypted specifically for them — the patient's key is not transferred.
The patient's copy remains intact and accessible.

**Flow — managing listings:**

1. Dashboard reads all active listings from the contract for the patient's address.
2. For each listing, the patient sees:
   - Which fields were disclosed in the ZK proof (the Merkle paths committed on-chain).
   - Listing price.
   - Status: active, fulfilled (sold), or delisted.
   - If fulfilled: the buyer's `PK_buyer` (pseudonymous — an on-chain public key, not a name).
3. Patient can delist an active listing: the on-chain commitment remains but the listing is
   marked inactive and will not appear to researchers.

**Flow — purchase history:**

1. The marketplace contract emits an event on each `fulfill()` call containing: listing ID,
   buyer `PK_buyer`, amount received, timestamp.
2. The frontend indexes these events for the patient's listings.
3. Patient sees: total earnings, per-record sale history, and a timeline of purchases.

**What the patient sees about buyers**: Only the buyer's BabyJubJub public key (`PK_buyer`) —
a pseudonymous identifier. The patient does not learn the buyer's real-world identity. If the
researcher registered their buy order from an identifiable wallet, that is visible; if from an
anonymous account, it is not.

**What the patient cannot do after a sale**: Revoke the buyer's access to the ciphertext they
already received. The ciphertext was emitted as a contract event and is permanently public.
Delisting only prevents future sales; it does not undo completed ones.

---

## UC-8: Patient Lists a New Record Alongside Existing Ones

**Actor**: Patient who has a new medical record (follow-up visit, updated lab values, new
diagnosis) and wants to list it independently.

**Goal**: Add a new document to the marketplace without modifying or replacing existing ones.

**Flow:**

1. Patient obtains the new record from their medic — a fresh attestation, independent of any
   prior records.
2. Patient uploads it exactly as in UC-3: JSON → Merkle tree → encrypt → upload to IPFS →
   list on marketplace.
3. The new listing appears alongside the old ones in the patient's dashboard.
4. The old listing remains active, unchanged, and continues to be purchasable if the patient
   chooses.

**Why there is no "update" concept**: Each record is an independent medic attestation of a
specific fact at a specific time. A record from 2024 saying HbA1c was 8.2% and a record from
2025 saying it is 7.1% are both true — they describe different points in time. Neither
supersedes the other. Researchers may want either or both.

---

## Out of Scope for MVP

- Bulk batch purchases (50+ records in a single transaction).
- Aggregate/statistical queries without individual record access (UC-5).
- Secondary market resale of purchased records.
- Dispute resolution (e.g. researcher claims data did not match criteria).
- Cross-chain payments from Ethereum or other networks.
- Insurance or employment use cases (intentionally excluded — see `RISKS.md`).
