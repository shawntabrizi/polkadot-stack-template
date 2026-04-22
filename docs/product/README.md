# Product Design Documents

A ZK-based medical data marketplace on Polkadot. Patients sell verified health data to researchers
through atomic, privacy-preserving exchanges — without revealing their identity or raw records.

Read in this order:

| Document | What it answers |
|---|---|
| [PROBLEM.md](./PROBLEM.md) | What is broken and why existing solutions fail |
| [STAKEHOLDERS.md](./STAKEHOLDERS.md) | Who the actors are, what they want, and where they conflict |
| [USE_CASES.md](./USE_CASES.md) | Concrete scenarios from each stakeholder's perspective |
| [PRIVACY.md](./PRIVACY.md) | What the cryptography actually hides, the threat model, regulatory surface |
| [IMPACT.md](./IMPACT.md) | Scientific, economic, and social potential if this works |
| [WHY_POLKADOT.md](./WHY_POLKADOT.md) | Technical rationale and smart contracts vs. parachain decision |
| [RISKS.md](./RISKS.md) | Technical, regulatory, adoption, and trust risks with mitigations |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Two-chain design (People Chain + Asset Hub), blind registration pattern, sprint plan |
| [FLOWS.md](./FLOWS.md) | Step-by-step technical flows for every protocol process |
| [FRONTEND_SPEC.md](./FRONTEND_SPEC.md) | UI design spec — pages, components, design tokens, placeholder data |
| [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) | Phased build plan — no-ZK skeleton first, ZK added incrementally |
| [SKILLS.md](./SKILLS.md) | Skills database by phase — what to learn, difficulty, known risks |
| [EXTERNAL_DEPS.md](./EXTERNAL_DEPS.md) | Running log of external dependency failures and workarounds |

## Current Stage

**Phase 5.2 deployed (2026-04).** Asset Hub contract (`MedicalMarket.sol`) handles listing,
escrow, fulfillment, and patient→doctor direct share. Record is split into a browsable
medic-signed header (stored in the clear) and an encrypted body. Statement Store delivers
ciphertext; only the Poseidon hash lands on-chain. No ZK proof, no Semaphore, no IPFS.
People Chain identity (Phase 7) and on-chain ZK proof (Phase 6) are planned next steps.
Synthetic test data only.

## Open Questions (Unresolved)

1. **Certifying Authority governance model** — 2-of-3 pallet-multisig deployed for MVP. DAO is V2.
2. **GDPR / HIPAA compliance** — legal opinion required before real patient data.
3. **Dispute resolution** — out of scope for MVP. Phase 5.3 adds a buyer reclaim window for bad ciphertext.
