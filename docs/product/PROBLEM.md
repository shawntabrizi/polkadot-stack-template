# The Problem

## The Core Paradox

Medical research depends on access to granular, high-fidelity patient data. A study on Type 2
Diabetes progression needs real lab values, real demographics, real outcomes — not statistical
summaries. But the same data that makes research meaningful is precisely what privacy law, ethics,
and patients themselves require to be protected.

This is not a new tension. What is new is that the cryptographic tools to resolve it finally exist.

---

## Why Current Solutions Fail

### Anonymization is Broken

The standard answer has been to strip names and identifiers from records before sharing. But
re-identification attacks have repeatedly shown that quasi-identifiers — age, ZIP code, diagnosis
date — are enough to pinpoint individuals in supposedly anonymized datasets. A 2019 study
demonstrated that 99.98% of Americans could be re-identified from a dataset with just 15 demographic
attributes. Anonymization offers the appearance of privacy, not the substance.

### Centralized Data Custodians Create New Problems

Hospital networks and health data brokers act as intermediaries, aggregating and licensing patient
data. This introduces:

- **Single points of failure**: Large breaches (Anthem 2015, Change Healthcare 2024) expose
  millions of records at once.
- **Asymmetric benefit**: Institutions monetize patient data; patients receive nothing.
- **Opaque consent**: Patients sign broad consent forms at the point of care with no visibility into
  downstream use.
- **Vendor lock-in**: Researchers must negotiate institutional agreements for every dataset.

### Consent Frameworks Are Coarse

Current consent is binary — you authorize a study or you don't. There is no mechanism for a patient
to say: "you can know my blood glucose ranges but not my exact values, you can know my age bracket
but not my birthdate, you can use my data for oncology research but not insurance underwriting."
Fine-grained consent is a UX problem that existing systems have never solved.

---

## The Specific Gap

No current system allows:

1. A patient to prove specific facts about their health record **without revealing the record**.
2. A researcher to verify that proof was signed by a **licensed, qualified physician** without
   knowing which physician.
3. An **atomic exchange** where payment and data access happen simultaneously with no counterparty
   risk.
4. All of this to occur on **neutral, auditable infrastructure** that no single institution
   controls.

Each piece exists in isolation. ZK proofs exist. Digital signatures exist. Smart contract escrow
exists. The medical data marketplace is the integration problem.

---

## Why Now

Three conditions converge in 2026:

1. **ZK tooling has matured.** Circom, SnarkJS, Semaphore, and groth16 verifiers are production-
   ready. Developers can write selective disclosure circuits without a PhD in cryptography.

2. **PVM execution makes on-chain ZK verification economically viable.** The Polkadot Virtual
   Machine runs ZK pairing checks (the expensive step in proof verification) at near-native CPU
   speed — estimated 10x faster than the EVM. What cost $50 in gas on Ethereum costs cents on PVM.

3. **Polkadot's cross-chain infrastructure is live.** Stablecoins on Asset Hub, Ethereum RPC
   compatibility via `pallet-revive`, and shared security from the relay chain mean the payment
   rail, the compute layer, and the trust layer are all available without building from scratch.

---

## Scope of This Document Set

These documents define the **medical data marketplace** as the primary application. The underlying
pattern — ZK-verified private data exchange with atomic payment — is intentionally generalizable to
legal records, financial data, academic credentials, and more. Where that generalization is
relevant, it will be noted.
