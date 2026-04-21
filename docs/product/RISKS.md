# Risks

Risks are grouped by category. Each entry states the risk, its likelihood and severity for the
MVP phase, and the current mitigation or open question.

---

## Technical Risks

### T1: ZK Circuit Soundness Bug

**Risk**: A bug in a Circom circuit allows a prover to generate a valid-looking proof for a false
statement (e.g., "patient age is 40–65" when it is 30).

**Likelihood**: Low if circuits are simple and audited. High if circuits are complex and
unaudited.

**Severity**: Critical — the entire trust model of the marketplace depends on circuit correctness.

**Mitigation**:
- Keep circuits minimal for MVP. Each circuit should prove exactly one thing.
- Use established libraries (circomlib) rather than custom implementations.
- Formal audit is required before real data is processed.
- Use a trusted setup ceremony (Powers of Tau) from an established source, not a custom one.

**MVP stance**: Use synthetic test data. Soundness bugs in a demo environment have no real-world
consequence.

---

### T2: Smart Contract Vulnerability

**Risk**: The escrow contract, registry contract, or marketplace contract contains a vulnerability
(reentrancy, access control bypass, integer overflow).

**Likelihood**: Moderate — contracts are complex and combine ZK verification with payment logic.

**Severity**: High — patient funds or decryption keys could be stolen.

**Mitigation**:
- Use OpenZeppelin primitives for access control and reentrancy guards.
- Follow checks-effects-interactions pattern strictly in escrow logic.
- Contract audit before mainnet deployment.

**MVP stance**: No real funds. Risk is informational only during demo.

---

### T2b: Combined Circuit Size

**Risk**: The single ZK circuit combining EdDSA Merkle verification + Semaphore + ECDH +
Poseidon encryption may produce a proving key too large for browser-side proof generation
(snarkjs has practical limits around 2^23 constraints before it becomes unusable in a browser).

**Likelihood**: Moderate — each primitive is manageable alone; combined they may exceed limits.

**Severity**: Medium — proof generation moves to a backend service, adding latency and a
centralized component.

**Mitigation**: Measure constraint count early (Day 8). If over ~4M constraints, split into
two proofs verified sequentially by the contract.

---

### T2c: BBS+ In-Circuit (If Chosen Over Merkle)

**Risk**: BBS+ signature verification inside a Circom circuit requires BLS12-381 pairing
operations in R1CS. No production-ready Circom implementation exists as of early 2026.

**Likelihood**: High — this is an active research problem.

**Severity**: Critical if chosen — the entire signature verification layer breaks.

**Mitigation**: Use Poseidon-Merkle + EdDSA for MVP (achieves same selective disclosure
property). Revisit BBS+ for V2 when PSE tooling matures.

---

### T2d: Outbid Griefing — Pull Payment Not Implemented

**Risk**: A researcher places an offer using a smart contract whose `receive()` / fallback
deliberately reverts. When a new researcher tries to outbid, the contract attempts to refund
the malicious bidder via `call{value: ...}("")`, which reverts, rolling back the entire
`placeBuyOrder` transaction. The listing is permanently locked with the malicious offer — no
one can outbid, the patient cannot cancel (pending order blocks it), and the marketplace entry
is bricked.

**Likelihood**: Low for MVP — all current researcher accounts are EOAs (dev accounts, Nova
Wallet). A contract-based bidder requires deliberate effort.

**Severity**: Medium — the affected listing is permanently bricked; the protocol itself is not
at risk and other listings continue to function normally.

**Current state**: `MedicalMarket.sol` uses CEI (checks-effects-interactions) order — all
state is written before the external refund call — but the `require(ok, ...)` on the refund
still allows griefing if `ok == false`.

**Fix for production (Phase 5.3)**: Replace the push-payment refund with a **pull payment**:
store `pendingWithdrawals[prevResearcher] += prevAmount` and add a `withdraw()` function.
The outbid succeeds regardless of whether the old bidder can receive ETH; they claim the
refund separately. This is the standard Solidity pattern for griefing-resistant refunds.

---

### T3: PVM / resolc Immaturity

**Risk**: The `resolc` compiler or `pallet-revive` has bugs that cause contract misbehavior on PVM
that would not occur on EVM.

**Likelihood**: Moderate — both are relatively new. Known issues exist in stable2512-3.

**Severity**: Medium — contracts may behave incorrectly in edge cases.

**Mitigation**:
- Test each contract on both EVM (via Hardhat) and PVM.
- Pin compiler versions (`resolc` v1.0.0 as specified in project).
- Monitor Parity's release notes for pallet-revive.

---

### T4: Patient Key Loss

**Risk**: A patient loses their private key and can no longer decrypt their own record or control
their listing.

**Likelihood**: High — key management is a persistent UX failure point in crypto systems.

**Severity**: High for the patient (permanent loss of access). Low for the marketplace integrity.

**Mitigation**:
- Recommend multi-device key backup in the UX.
- Explore social recovery options (out of scope for MVP).
- Make clear in UX that key loss is permanent and irreversible.

---

### T5: Semaphore Timing Correlation Attack

**Risk**: A high-volume medic generates many Semaphore proofs in a short time. On-chain timestamps
allow a determined adversary to correlate nullifier timing patterns with a specific physician's
known practice schedule.

**Likelihood**: Low in general; higher for specialists in rare conditions.

**Severity**: Low for protocol integrity; medium for individual medic privacy.

**Mitigation**:
- Recommend batching and randomized submission delay in medic client software.
- Cannot be enforced at the protocol level without introducing latency.

---

## Regulatory Risks

### R1: GDPR Right to Erasure

**Risk**: A patient exercises their GDPR Article 17 right to erasure. The on-chain ZK proofs and
commitments cannot be deleted.

**Likelihood**: Certain — if deployed to EU patients, erasure requests will occur.

**Severity**: High — potential regulatory fine and reputational damage.

**Mitigation**:
- Store only hashes and proofs on-chain (not personal data).
- Patient can delete the IPFS record (making the listing unresolvable).
- Legal opinion needed on whether hashes of personal data constitute personal data under GDPR.

**Status**: Open. Do not process real EU patient data without legal counsel.

---

### R2: Medical Liability for Anonymously Attested Records

**Risk**: A medic's Semaphore attestation is used as evidence that a record is medically valid.
If the record contains an error, who is liable?

**Likelihood**: Low in the short term (synthetic data). Certain to arise at scale.

**Severity**: High — medical liability is regulated in every jurisdiction.

**Mitigation**:
- Attestation terms must clearly state the medic is attesting to document authenticity, not
  providing medical advice or diagnosis.
- Terms of service must make this distinction explicit.
- The anonymity of the medic creates an accountability gap — this is an unresolved design tension.

---

### R3: Regulatory Classification of Data Sales as Processing

**Risk**: A jurisdiction rules that facilitating the sale of health data makes the protocol a
"data processor" or "covered entity" under GDPR or HIPAA, triggering compliance requirements the
protocol cannot meet.

**Likelihood**: Moderate — this is an actively evolving area of law.

**Severity**: High — could require shutting down operations in specific jurisdictions.

**Mitigation**: Legal opinion per jurisdiction before real deployment. MVP uses synthetic data only.

---

## Adoption Risks

### A1: Medic Onboarding Friction

**Risk**: Licensed physicians are not willing to generate Semaphore identities, manage blockchain
keys, or adopt new tooling.

**Likelihood**: High — medical professionals are conservative with technology adoption and have
high liability sensitivity.

**Severity**: High — without medic attestations, the marketplace has no supply.

**Mitigation**:
- Build onboarding that abstracts all cryptographic complexity.
- Partner with the Certifying Authority to handle bulk onboarding.
- Consider a "medic client" app (mobile-first) that handles key management invisibly.
- Pilot with tech-forward physicians in digital health communities.

---

### A2: Thin Markets

**Risk**: Not enough sellers (patients) or buyers (researchers) to make the marketplace liquid.

**Likelihood**: High in early stages — classic two-sided marketplace cold-start problem.

**Severity**: Medium — low liquidity means the marketplace is not useful, but does not break it.

**Mitigation**:
- Target a single condition (e.g. Type 2 Diabetes) for launch. Deep niche beats broad shallow.
- Pre-sign supply agreements with research institutions before launch.
- Consider synthetic dataset seeding for demo purposes (clearly labeled as synthetic).

---

### A3: Institutional Resistance

**Risk**: Hospitals and medical boards view the marketplace as a threat to their data licensing
revenue and actively discourage or block physician participation.

**Likelihood**: Moderate to high.

**Severity**: Medium — slows adoption but does not prevent it.

**Mitigation**:
- Frame as complementary to institutional data licensing, not competitive.
- Target independent physicians and clinics rather than hospital-employed physicians first.

---

## Trust / Governance Risks

### G1: Certifying Authority Compromise

**Risk**: The entity controlling the `MedicRegistry` is compromised, coerced, or acts maliciously —
adding fake medic identities to the registry.

**Likelihood**: Low technically; non-trivial socially (government pressure, internal fraud).

**Severity**: Critical — the entire trust chain of the marketplace depends on registry integrity.

**Mitigation**:
- Multi-party (multisig) control of the registry admin key from day one.
- Public audit log of all registry additions/removals.
- Timelocked operations: changes to the registry take effect only after a delay, giving time to
  detect and dispute.
- Long-term: migrate to DAO governance with staked, distributed control.

---

### G2: Contract Upgrade Attack

**Risk**: If contracts are upgradeable (proxy pattern), the upgrade key holder can modify contract
logic to steal funds or expose data.

**Likelihood**: Low with proper key management; higher if team is compromised.

**Severity**: Critical.

**Mitigation**:
- Minimize upgradeable surface. Core escrow and verifier contracts should be immutable.
- Governance-gated upgrades via timelock.
- Public upgrade announcements with community review period.

---

### G3: Perverse Incentives — Selling Data You Shouldn't

**Risk**: Patients, incentivized by payment, list data they do not have the right to list (e.g.,
records about dependents, fabricated conditions for rare-disease premium pricing).

**Likelihood**: Low — the medic attestation requirement makes fabrication hard. Dependent record
fraud depends on medic collusion.

**Severity**: Medium — data quality degrades; researchers may receive inaccurate datasets.

**Mitigation**:
- Medic attestation is the primary defense.
- Researcher dispute mechanism (V2 feature): if purchased data does not match proof, dispute
  resolution process triggers.

---

## Risk Summary Matrix

| Risk | Likelihood (MVP) | Severity | Blocking for Real Launch? |
|---|---|---|---|
| T1 Circuit soundness bug | Low | Critical | Yes — audit required |
| T2 Contract vulnerability | Moderate | High | Yes — audit required |
| T2d Outbid griefing (pull payment missing) | Low (EOA-only MVP) | Medium | No — fix in Phase 5.3 |
| T3 PVM/resolc immaturity | Moderate | Medium | No — testnet only |
| T4 Patient key loss | High | High (user) | No — UX mitigation sufficient |
| R1 GDPR erasure | Certain (EU) | High | Yes — legal opinion required |
| R2 Medical liability | Certain (at scale) | High | Yes — legal terms required |
| A1 Medic friction | High | High | Yes — requires UX investment |
| A2 Thin markets | High | Medium | No — expected early stage |
| G1 Authority compromise | Low | Critical | Yes — multisig from day one |
| G2 Contract upgrade attack | Low | Critical | Yes — immutable core contracts |
