# Why Polkadot

## The Core Requirements

A ZK medical data marketplace needs a platform that satisfies four technical requirements
simultaneously:

1. **Cheap on-chain ZK proof verification** — pairing checks (BN254, BLS12-381) are the
   bottleneck. On the EVM, a single groth16 verification costs ~200k–500k gas (~$3–15 at moderate
   ETH prices). At that cost, a marketplace with hundreds of listings is economically broken.

2. **Native stablecoin access for payments** — medical data buyers need to pay in stable assets.
   Bridging introduces counterparty risk and friction. The payment rail should be native to the
   execution environment.

3. **Flexible runtime for future custom primitives** — selective disclosure circuits and medic
   registry logic may eventually need runtime-level support (e.g. ZK precompiles, custom storage
   layout, free transactions for medics). A smart contract platform has a ceiling; a custom
   runtime does not.

4. **Neutral, upgradeable, governed infrastructure** — no single company should own the chain.
   Protocol upgrades should be subject to governance. Security should not require bootstrapping
   a fresh validator set.

Polkadot satisfies all four. No other platform does simultaneously.

---

## Reason 1: PVM Execution Speed for ZK Verification

The Polkadot Virtual Machine (PVM) is a RISC-V register-based architecture. The EVM is a
stack-based 256-bit word machine — an architecture that predates ZK cryptography and is not
optimized for it.

ZK proof verification involves elliptic curve pairing operations. On the EVM, these are handled
by precompiles (0x08 for BN254 pairings). On PVM, the same operations run as native RISC-V
instructions with CPU-level optimization.

**Estimated difference**: 5–10x faster execution for pairing checks on PVM vs. EVM. This
translates directly to cheaper gas, which translates to a marketplace that is economically
viable at the price points patients and researchers can sustain.

This is not a theoretical advantage — it is why this system is being built on Polkadot rather
than Ethereum L2s, which inherit EVM's architectural constraints.

---

## Reason 2: The resolc / Revive Pipeline

Solidity is the dominant language for smart contract development. The cryptographic primitives
(Semaphore, ZKCP escrow, verifier contracts) are written in Solidity. Moving to Polkadot does not
require abandoning this tooling.

The `resolc` compiler (Parity's contribution to the Revive project) compiles Solidity through
Yul IR → LLVM IR → RISC-V ELF → PVM bytecode. Combined with `pallet-revive` on Asset Hub, this
means:

- Write Solidity with standard Hardhat/Foundry workflows.
- Deploy to PVM with the same deployment scripts (Ethereum RPC compatibility layer).
- Get RISC-V execution performance.

The two-week MVP leverages this pipeline directly. The `contracts/pvm/` directory in this
repository already has the scaffolding.

---

## Reason 3: Native Stablecoins Without Bridges

Asset Hub (Polkadot's system parachain for asset management) holds native USDC and USDT issued
by Circle and Tether respectively — not wrapped versions that depend on a bridge. Cross-chain
transfers within Polkadot use XCM, which is secured by the relay chain validators, not a
third-party bridge operator.

For the medical data marketplace, this means:
- Researchers deposit USDC into the escrow contract natively.
- Patients receive USDC directly without bridge withdrawal delays or fees.
- No bridge operator can freeze, delay, or censor payments.

This is not available on any L2 without bridge risk.

---

## Reason 4: Shared Security Without Bootstrapping

If this were an independent L1, it would need its own validator set. Recruiting, incentivizing,
and maintaining validators for a new chain is a multi-year project that has nothing to do with
building a medical data marketplace.

As a parachain on Polkadot:
- Security is inherited from Polkadot's validator set (~300 validators, ~$1B+ staked).
- The team builds the application logic; Polkadot handles consensus and finality.
- Parachain slot costs are a known, bounded expense.

For the MVP, the contracts run on a public testnet (Paseo) with no slot cost. The question of
parachain vs. smart contracts is a V2 decision (see below).

---

## Reason 5: Substrate's Flexibility as a Ceiling Raiser

Smart contracts on Asset Hub are the right starting point. But the ceiling matters.

If the marketplace grows and specific bottlenecks emerge — high gas costs for ZK verification,
need for custom medic authentication logic at the runtime level, need for a custom fee model
that makes medic attestations free — the Substrate framework allows moving from contracts to
custom pallets without changing the ecosystem, the assets, or the security model.

Polkadot is the only platform where "we started with smart contracts and then built a custom
pallet" is a natural upgrade path, not a full rewrite.

---

## Smart Contracts vs. Custom Parachain: The Decision Framework

This is the open architectural question. Here is how to decide:

### Start with smart contracts (MVP and V1) if:

- Time to ship is the primary constraint (it is, for a two-week MVP).
- Gas costs for ZK verification are acceptable (needs measurement).
- The medic registry and marketplace logic fit in contract storage.
- No custom fee model is required.

**Recommended path**: Deploy `MedicRegistry.sol`, `MedicalMarket.sol`, and ZK verifier contracts
via `resolc` to a Revive-enabled testnet. This is achievable in two weeks.

### Migrate to a custom parachain (V2+) if any of the following are true:

- Gas costs for ZK pairing checks are too high even on PVM (measure first).
- The marketplace needs native ZK precompiles (custom host functions in the runtime).
- The Certifying Authority governance model requires on-chain DAO mechanics at the runtime level.
- Free transactions for medic attestations are needed for adoption (custom fee model via
  `pallet-transaction-payment` customization).
- The system needs custom storage primitives for patient record indexing.

**Migration path**: The `blockchain/` directory in this repository is a Cumulus-based parachain
scaffold. Runtime pallets can implement the same logic as the contracts, with the ZK verifier
running as a host function for maximum efficiency.

---

## Reason 6: People Chain for Native Professional Identity

Polkadot's People Chain hosts the **Identity Pallet** — a purpose-built, battle-tested system for
on-chain identity with a **Registrar** model. Any organization can become a registrar and issue
judgements about identities.

For the medical marketplace, this means:
- The Central Authority registers as an Identity Registrar on People Chain.
- Medics set their professional identity (name, license number) on People Chain.
- The Authority issues `KnownGood` judgements after off-chain credential verification.
- No custom registry contract needs to be written or audited.

This is infrastructure Polkadot already provides. Ethereum has no equivalent native identity
system — you would need to deploy and maintain your own registry from scratch, with no ecosystem
recognition.

---

## Why Not Ethereum / L2s

| Requirement | Ethereum L2 | Polkadot (PVM) |
|---|---|---|
| ZK pairing cost | High (EVM architecture) | Low (RISC-V native) |
| Native stablecoins | Bridged (counterparty risk) | Native on Asset Hub |
| Custom runtime | Not possible | Substrate pallets |
| Governance for Authority | External multisig/DAO | On-chain governance (optional) |
| Smart contract tooling | Excellent (Solidity/Hardhat) | Good (via resolc pipeline) |
| Ecosystem maturity | Very high | High and growing |

The tooling trade-off is real — Ethereum's developer ecosystem is larger. The resolc pipeline
mitigates this by keeping Solidity as the authoring language. For a ZK-heavy application,
the execution architecture matters more than ecosystem size.
