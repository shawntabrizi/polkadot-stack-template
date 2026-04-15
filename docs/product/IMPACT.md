# Impact

## What Changes If This Works

A functioning ZK medical data marketplace would not incrementally improve how medical research is
done today — it would restructure the incentive model that governs who benefits from health data
and under what conditions.

---

## Scientific Impact

### More Diverse Datasets

Current medical research is dominated by data from large hospital systems in wealthy countries,
skewed toward populations that seek care frequently. Patients outside those networks — rural,
uninsured, from underrepresented ethnic groups — are systematically underrepresented in clinical
data.

A marketplace with global participation lowers the barrier for any licensed medic anywhere to
attest records. A researcher in São Paulo can access verified diabetes records from patients in
Nigeria or Indonesia without a formal data-sharing agreement between institutions.

### Faster Iteration

Institutional data-sharing agreements take months to negotiate. IRB approvals add more time.
A marketplace where verified data is available on-demand compresses the front end of the research
pipeline. The limiting factor becomes research quality, not data access logistics.

### Better Data Provenance

Currently, datasets passed between institutions lose provenance — it becomes unclear whether
anonymization was applied consistently, whether records were modified. The ZK proof embedded in
each listing is a permanent, verifiable provenance record: this data was attested by a verified
medic, and these specific facts were true at attestation time.

---

## Economic Impact

### Patients as Direct Beneficiaries

In today's model, a hospital licenses a patient's data to a pharmaceutical company. The patient
sees none of that revenue. The marketplace redirects value directly to data owners. A patient with
a rare condition and well-documented treatment history possesses genuinely scarce data — and the
market will price it accordingly.

This is not extractive of patients. Participation is opt-in, data disclosure is controlled, and
the patient retains the encrypted record after sale. The data is not consumed — it can be sold
multiple times to different researchers, with each sale generating a new payment.

### Reduced Research Costs

Large pharma companies spend tens of millions on data acquisition. A transparent, competitive
marketplace for verified health data introduces price discovery. Small research teams and academic
labs — currently priced out of proprietary data — gain access to the same quality data at market
rates.

### Protocol Sustainability

A 1–2% protocol fee on each successful swap creates a sustainable revenue model proportional to
marketplace activity, with no single institutional dependency.

---

## Social Impact

### Patient Sovereignty Over Health Data

The current system treats patient health data as an institutional asset. The legal framework in
most jurisdictions gives individuals weak control after data is collected. This system inverts the
default: data is yours, you decide what is shared, you receive payment when it is used.

### Inclusion of Underserved Populations

The value of a rare condition record, or a record from an underrepresented demographic, is higher
to researchers than common presentations from over-studied populations. A market mechanism creates
a financial incentive to include populations that institutional research has historically ignored.

### Transparency in Data Use

When a researcher purchases data, it is recorded on a public chain (buyer address + listing ID,
not patient identity). Patients who list data can see in aggregate which types of researchers are
buying. Over time this creates accountability for how medical data is used that does not exist
today.

---

## Technical Impact

### Proving PVM Viability for ZK Applications

On-chain ZK proof verification has been prohibitively expensive on the EVM. The Polkadot Virtual
Machine's RISC-V architecture changes this calculus. This marketplace is a real-world stress test
of PVM for ZK-heavy applications. Success here establishes a playbook for any application
requiring on-chain ZK verification: credentials, identity, financial data attestation.

### Generalizable Pattern

The underlying design — selective disclosure + group attestation + atomic payment — is not
specific to medical data. The same architecture applies to:

- **Legal records**: Verified court judgments, notarized contracts
- **Financial data**: Income verification without exposing bank statements
- **Academic credentials**: Degree attestation without exposing transcripts
- **Supply chain**: Product provenance claims without exposing supplier relationships
- **AI training data**: Verified, consent-based datasets for machine learning (see below)

Medical records are the hardest instance of this problem (highest privacy stakes, most regulated).
Solving it here makes every other application easier.

### AI Training Data as a Natural Extension

The AI industry has an acute version of the same problem: models require large, high-quality
datasets, but sourcing them cleanly — with verified provenance, explicit consent, and fair
compensation to data owners — has no working solution today. Most training data is scraped
without consent, labeled by anonymous crowdworkers with no quality guarantee, and sold with
no payment to the original creators.

The protocol maps directly:

- **Attestation generalizes**: Instead of a licensed medic signing a health record, a certified
  radiologist attests a labeled scan, a lawyer attests a contract dataset, or a verified
  annotator attests a labeled image set. The buyer — an AI company — receives a ZK proof that
  the data was produced or labeled by qualified humans, not scraped and auto-labeled.

- **Selective disclosure for dataset statistics**: A seller can prove "this dataset has balanced
  classes, 95% inter-annotator agreement, and 10,000 samples" without exposing individual items
  before purchase. The AI company knows exactly what they are buying before funds are locked.

- **Designated buyer encryption prevents redistribution**: Training data is encrypted for a
  specific company's key. Since they received a ciphertext locked to their private key, any
  redistribution proves they shared their key — a strong deterrent against data laundering.

- **Consent and direct payment**: Every data owner is paid per use, at the protocol level, with
  no intermediary. This is the missing infrastructure for copyright-clean AI training data.

The near-term extension is **aggregate proofs**: proving dataset-level statistics (distribution,
size, label quality) without individual record access, enabling bulk purchase of entire training
corpora before committing funds.

A further extension is **federated learning integration**: instead of selling raw data, a data
owner receives the model, trains locally, and sells verified gradient updates back to the AI
company. ZK proofs attest the gradients were computed correctly on the claimed dataset. Payment
triggers on verified delivery. Data never leaves the owner's device. This is architecturally
compatible with the protocol but a meaningful extension beyond the MVP.

Note: fully homomorphic model training (training without ever decrypting data) is not
practically achievable today for non-trivial models. The protocol's value for AI training is
provenance, consent, and integrity — the buyer decrypts the data and trains normally.

Medical records is the harder regulatory environment. AI training data has a larger immediate
market, fewer jurisdiction-specific barriers, and buyers (every major AI lab) who are actively
paying for quality data today. The same deployed protocol serves both.

---

## What This Does Not Claim

- This system does not eliminate the need for IRB oversight of research studies.
- It does not replace clinical trials or randomized controlled studies.
- It does not guarantee data quality beyond what the medic attestation provides.
- It does not solve the "garbage in, garbage out" problem — a medic can attest an incorrect
  diagnosis, and the ZK proof will faithfully prove that incorrect fact.
- It does not provide anonymity for patients with rare conditions in small datasets.

Impact claims should be proportional to what the cryptography actually guarantees.
