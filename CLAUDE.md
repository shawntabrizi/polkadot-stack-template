# CLAUDE.md

This file provides context for AI agents working with this repository.

## Project Purpose

A **decentralized ZK medical data marketplace** built on Polkadot. Patients sell verified health
data to researchers through atomic, privacy-preserving exchanges — without revealing their
identity or raw records.

**Core mechanism**: Zero-Knowledge Contingent Payment (ZKCP). A patient generates a ZK proof
that their data matches a researcher's criteria, encrypts it specifically for that buyer using
in-circuit ECDH, and submits it to a smart contract that atomically swaps payment for the
ciphertext. No trust required between parties.

**Stack**: People Chain (medic identity) + Asset Hub (contracts + settlement) + IPFS (storage).
Smart contracts are Solidity compiled to PVM via `resolc` (`pallet-revive`). ZK circuits use
Circom + Groth16 + snarkjs. Privacy primitives from `@zk-kit` (PSE).

Full product design documentation is in `docs/product/`.

---

## Component Map

| Component | Path | Tech | Status |
|---|---|---|---|
| Marketplace contract | `contracts/pvm/contracts/MedicalMarket.sol` | Solidity 0.8.28, resolc, PVM | To build |
| Semaphore group contract | `contracts/pvm/contracts/SemaphoreGroup.sol` | Solidity, Semaphore v4 | To build |
| ZK circuits | `circuits/` | Circom, snarkjs, Groth16 | To build |
| Mixer Box backend | `mixer-box/` | Node.js, Express, polkadot.js | To build |
| Frontend | `web/` | React 18, Vite, TypeScript, Tailwind, PAPI, snarkjs | To build |
| PVM contract scaffold | `contracts/pvm/` | Solidity 0.8.28, Hardhat, resolc | Existing (PoE example) |
| Parachain runtime | `blockchain/runtime/` | Rust, Cumulus, pallet-revive | Existing |
| Scripts | `scripts/` | Bash | Existing |

---

## How the Layers Connect

- **People Chain**: Medics register professional identity via the Identity Pallet. The Central
  Authority acts as an on-chain Registrar issuing `KnownGood` judgements.
- **Mixer Box**: Off-chain Node.js service. Verifies People Chain `KnownGood` status, then calls
  `addMember(commitment)` on the Semaphore group contract on Asset Hub — from the Authority
  admin account, not the medic's wallet. This is the privacy bridge.
- **Semaphore group contract**: Holds anonymous medic identity commitments on Asset Hub.
  `verifyProof()` confirms a verified medic signed a document without revealing which one.
- **MedicalMarket contract**: `createListing()` stores Merkle root + IPFS CID. `placeBuyOrder()`
  locks USDT/USDC and registers buyer's BabyJubJub public key. `fulfill()` verifies the Groth16
  proof and atomically releases payment + emits buyer-specific ciphertext.
- **ZK circuit**: One Groth16 circuit proving: EdDSA signature over Merkle root is valid,
  disclosed fields are Merkle leaves, signer is in Verified Medics Semaphore group, ciphertext
  is ECDH-encrypted for the buyer's public key.
- **Frontend**: PAPI for chain reads, snarkjs for browser-side proof generation, polkadot.js
  extension for wallet signing.
- **IPFS**: Encrypted record blobs stored off-chain. Hash + CID anchored in contract state.

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
