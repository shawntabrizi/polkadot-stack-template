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
| [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) | Phased build plan — no-ZK skeleton first, ZK added incrementally |
| [SKILLS.md](./SKILLS.md) | Skills database by phase — what to learn, difficulty, known risks |
| [EXTERNAL_DEPS.md](./EXTERNAL_DEPS.md) | Running log of external dependency failures and workarounds |

## Current Stage

Two-week MVP. Two-chain architecture: People Chain (identity) + Asset Hub (execution + settlement).
Off-chain Mixer Box bridges async identity to synchronous contract state.
Smart contracts via `pallet-revive`. Synthetic test data only.

## Open Questions (Unresolved)

1. **IPFS availability at fulfillment** — hash anchoring proves integrity, not availability. MVP recommendation: patient submits encrypted blob as calldata in `fulfill()`. Bond-based approach is V2. See `ARCHITECTURE.md`.
2. **Circuit constraint count** — must measure on Day 8 before writing `MedicalMarket.sol`. Target < 2M for browser proving. Fallback: split into two sequential proofs.
3. **Certifying Authority governance model** — multisig recommended for MVP. DAO is V2.
4. **GDPR / HIPAA compliance** — legal opinion required before real patient data.
5. **Dispute resolution** — out of scope for MVP.
