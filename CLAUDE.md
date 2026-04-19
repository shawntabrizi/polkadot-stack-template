# CLAUDE.md

This file provides context for AI agents working with this repository.

## Project Purpose

A **decentralized medical data marketplace** built on Polkadot. Patients sell medic-signed
health data to researchers through privacy-preserving exchanges — without revealing the
plaintext to anyone except the paying buyer.

**Core mechanism (Phase 5.2)**: a medic signs a Poseidon commitment of the record (EdDSA over
BabyJubJub). The patient lists the commit + medic signature on-chain. When a researcher
places a buy order with their BabyJubJub pubkey, the patient encrypts the plaintext for that
pubkey via ECDH + Poseidon stream cipher in the browser, uploads the ciphertext to the
Statement Store, and calls `fulfill(orderId, ephPk, ciphertextHash)`. Payment releases on
fulfill. The buyer fetches the ciphertext, decrypts, and verifies recordCommit + medic
signature off-chain.

**Why no on-chain ZK proof**: Phase 5.1 shipped a Groth16 circuit binding all of these
properties in-circuit, but the BN254 pairing verification on PVM consumed an unworkable
weight budget from the browser path. Phase 5.2 relaxes atomicity (patient could grief; Phase
5.3 escrow planned as backstop) and moves verification off-chain. The circuit + Verifier
remain in the repo as archive — see `docs/product/ZKCP_DESIGN_OPTIONS.md` for the full
decision record.

**Stack**: Asset Hub (contracts + settlement) + Statement Store (ciphertext bytes). Smart
contracts are Solidity compiled to PVM via `resolc` (`pallet-revive`). Browser-side
cryptography from `@zk-kit` (PSE) — `baby-jubjub`, `eddsa-poseidon` — and `poseidon-lite`.
People Chain identity + Semaphore-based medic anonymity are Phase 6.

Full product design documentation is in `docs/product/`.

---

## Component Map

| Component | Path | Tech | Status |
|---|---|---|---|
| Marketplace contract | `contracts/pvm/contracts/MedicalMarket.sol` | Solidity 0.8.28, resolc, PVM | Phase 5.2 |
| Semaphore group contract | `contracts/pvm/contracts/SemaphoreGroup.sol` | Solidity, Semaphore v4 | Phase 6 |
| ZK circuits (archive) | `circuits/`, `contracts/pvm/contracts/Verifier.sol` | Circom, snarkjs, Groth16 | Archived in Phase 5.2 — kept as reference for future ZKCP rebuild |
| Mixer Box backend | `mixer-box/` | Node.js, Express, polkadot.js | Phase 6 |
| Frontend | `web/` | React 18, Vite, TypeScript, Tailwind, PAPI | Phase 5.2 |
| PVM contract scaffold | `contracts/pvm/` | Solidity 0.8.28, Hardhat, resolc | Existing (PoE example) |
| Parachain runtime | `blockchain/runtime/` | Rust, Cumulus, pallet-revive | Existing |
| Scripts | `scripts/` | Bash | Existing |

---

## How the Layers Connect (Phase 5.2)

- **MedicalMarket contract**: `createListing(recordCommit, medicPk, sig, title, price)` stores
  the Poseidon-hash commitment of the medic-signed record plus the medic's BabyJubJub pubkey
  and EdDSA-Poseidon signature. `placeBuyOrder()` locks native PAS and registers the buyer's
  BabyJubJub pubkey for ECDH. `fulfill(orderId, ephPk, ciphertextHash)` is a pure escrow +
  signal — no on-chain proof — releases payment and stores the ephemeral pubkey + Statement
  Store lookup hash.
- **Off-chain encryption**: the patient encrypts the plaintext for the buyer using BabyJubJub
  ECDH + a Poseidon stream cipher (one-time pad keyed by `Poseidon(sharedX, sharedY, nonce, i)`),
  in the browser. The ciphertext bytes go to the Statement Store; only the Poseidon hash of the
  ciphertext lands on-chain.
- **Off-chain verification (buyer)**: after fetching from the Statement Store and decrypting
  with their stored skBuyer + ephPk via ECDH, the researcher recomputes
  `HashChain32(plaintext) == listing.recordCommit` and verifies the medic's EdDSA-Poseidon
  signature over `recordCommit` using the listing's published `medicPk`. Both checks render
  as ✓/✗ chips in the decrypt panel.
- **Frontend**: PAPI for chain extrinsics (Revive.call, Statement Store), viem for read-only
  EVM calls via the eth-rpc adapter. Browser-side cryptography uses `poseidon-lite`,
  `@zk-kit/baby-jubjub`, and `@zk-kit/eddsa-poseidon`.
- **Statement Store**: ephemeral signed storage for the encrypted ciphertext (~32 × 32 bytes).
  Lookup key is the Poseidon hash of the ciphertext (`ciphertextHash` in the on-chain
  Fulfillment).
- **Phase 5.1 ZK stack (archived, not in runtime)**: `circuits/medical_disclosure.circom` and
  `contracts/pvm/contracts/Verifier.sol` remain in the repo as a working Option-1 ZKCP
  reference. Dropped from runtime because the on-chain BN254 pairing verification on PVM
  exceeded a workable weight budget. See `docs/product/ZKCP_DESIGN_OPTIONS.md` "Phase 5.2 —
  Decision to drop the on-chain circuit" for the full record.
- **Phase 5.3 (planned)**: escrow / acknowledge / reclaim window so a buyer who detects a
  recordCommit mismatch on decrypt can recover their payment.
- **Phase 6 (planned)**: Semaphore-based medic anonymity. People Chain identity → Mixer Box →
  on-chain anonymous commitments. Not in 5.2.

---

## Key Files

### Product Design (read first)
- `docs/product/README.md` — index of all product docs
- `docs/product/PROBLEM.md` — what problem we are solving and why
- `docs/product/ARCHITECTURE.md` — two-chain design, circuit spec, sprint plan
- `docs/product/FLOWS.md` — step-by-step technical flows for every protocol process
- `docs/product/IMPLEMENTATION_PLAN.md` — phased build plan (no-ZK skeleton first)
- `docs/product/SKILLS.md` — skills needed by phase, difficulty, known risks
- `docs/product/EXTERNAL_DEPS.md` — running log of external dependency failures
- `docs/product/PRIVACY.md` — threat model, what ZK hides, regulatory surface
- `docs/product/RISKS.md` — technical, regulatory, adoption, governance risks

### Contracts (to be built in `contracts/pvm/`)
- `contracts/pvm/contracts/MedicalMarket.sol` — listing, escrow, atomic swap
- `contracts/pvm/contracts/SemaphoreGroup.sol` — medic anonymous group
- `contracts/pvm/hardhat.config.ts` — resolc compiler config for PVM

### Circuits (to be built in `circuits/`)
- `circuits/medical_disclosure.circom` — main circuit (Merkle + EdDSA + Semaphore + ECDH)
- `circuits/build/` — compiled `.wasm`, `.zkey`, verifier Solidity

### Mixer Box (to be built in `mixer-box/`)
- `mixer-box/index.ts` — Express server: verify People Chain judgement → addMember

### Frontend (to be built in `web/src/`)
- `web/src/pages/PatientDashboard.tsx` — list records, view purchases, manage listings
- `web/src/pages/MedicSign.tsx` — JSON → Merkle → EdDSA sign
- `web/src/pages/ResearcherBuy.tsx` — browse listings, place buy order, decrypt data

### Existing scaffold (PoE example — reference only)
- `contracts/pvm/contracts/ProofOfExistence.sol` — reference for PVM contract patterns
- `blockchain/pallets/template/src/lib.rs` — reference for pallet patterns

---

## Build Commands

```bash
# PVM contracts (compile via resolc to PVM)
cd contracts/pvm && npm ci && npx hardhat compile

# Frontend
cd web && npm ci && npm run build

# Circuits (once circuits/ exists)
cd circuits && circom medical_disclosure.circom --r1cs --wasm --sym
npx snarkjs groth16 setup medical_disclosure.r1cs pot12_final.ptau medical_disclosure_0000.zkey

# Mixer Box
cd mixer-box && npm ci && npm run build
```

---

## Test Commands

```bash
# PVM contract tests
cd contracts/pvm && npx hardhat test

# Frontend
cd web && npm run lint

# Circuit (verify a test proof)
npx snarkjs groth16 verify verification_key.json public.json proof.json
```

---

## Format & Lint

```bash
# Frontend
cd web && npm run fmt
cd web && npm run lint

# Contracts
cd contracts/pvm && npm run fmt
```

## Commit & CI Rules

**Always before committing**: the git pre-commit hook (`.git/hooks/pre-commit`) auto-formats
staged `.ts`, `.tsx`, `.sol` files with prettier and re-stages them. It only touches files
already staged — safe to use with partial commits.

**Always after pushing**: run `gh run list --limit 5` to check CI status. Fix failures before
moving on. CI runs: `ci-web` (lint + fmt + tsc), `ci-pvm` (fmt + compile + test), `ci-rust`.

---

## Running Locally

```bash
# Local Asset Hub node + eth-rpc (for contract development)
./scripts/start-local.sh
# Substrate RPC: ws://127.0.0.1:9944
# Ethereum RPC:  http://127.0.0.1:8545

# Frontend only
./scripts/start-frontend.sh

# Deploy contracts to Paseo testnet
./scripts/deploy-paseo.sh
```

---

## Version Pinning

- **polkadot-sdk**: stable2512-3 (umbrella crate v2512.3.3)
- **Rust**: stable (pinned via `rust-toolchain.toml`)
- **Node.js**: 22.x LTS (pinned via `.nvmrc`)
- **Solidity**: 0.8.28
- **resolc**: 1.0.0
- **Semaphore**: v4
- **@zk-kit**: latest (eddsa-poseidon, lean-imt, poseidon-cipher, baby-jubjub)
- **snarkjs**: latest stable
- **circom**: 2.x

---

## Notes for AI Agents

- **Implementation is phased** — see `docs/product/IMPLEMENTATION_PLAN.md`. Start with Phase 0
  (no ZK, no Merkle, no Semaphore). Do not add cryptographic complexity before the skeleton works.
- **External dependency failures** — log immediately in `docs/product/EXTERNAL_DEPS.md`. Do not
  spend more than 2 hours on an unlogged external tool problem.
- **resolc / pallet-revive**: Some Solidity patterns do not compile to PVM. Inline assembly and
  certain precompile calls behave differently. Always test compiled contracts on a local Asset Hub
  node, not just Hardhat EVM.
- **Circuit constraint count**: Measure after each addition to the Circom circuit. Target < 2M
  constraints for browser-side proving with snarkjs. If over limit, split into two sequential
  proofs verified by the contract.
- **Dev private keys** in `web/src/config/evm.ts` are well-known Substrate dev account keys
  (Alice, Bob, Charlie). Public test keys, not secrets.
- **The Mixer Box** is the only component with a private data store: the mapping of
  `{people_chain_address → semaphore_commitment}`. This must never be logged or published.
- **BBS+ signatures are not used** — the design uses EdDSA over BabyJubJub + Poseidon Merkle
  trees instead. BBS+ in-circuit is not production-ready.
- `web/.papi/` contains checked-in PAPI descriptors. Regenerate with `cd web && npx papi update`
  after modifying pallet storage or calls.
- `blockchain/chain_spec.json` is gitignored — generated at build/start time by scripts.

## Known Gaps / Open Questions

- **IPFS availability at fulfillment**: Current plan uses patient calldata in `fulfill()` to
  avoid IPFS dependency at swap time. Bond-based availability enforcement is V2.
- **Circuit constraint count**: Unknown until circuits are built. Measure on Day 1 of Phase 3.
- **Groth16 verifier on PVM**: Highest-risk compilation step. Must be tested before writing
  `MedicalMarket.sol`. Fallback: EVM Hardhat verifier for demo if PVM compilation fails.
- **People Chain on Paseo**: Testnet may not have full identity pallet support. Mock locally
  if needed (see `docs/product/EXTERNAL_DEPS.md`).
- **Certifying Authority governance**: Multisig for MVP. DAO migration is V2.
- **GDPR / HIPAA compliance**: Legal opinion required before processing real patient data.
  MVP uses synthetic test data only.
