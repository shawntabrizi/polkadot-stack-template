# Installation Guide

This document covers all prerequisites and setup steps needed to build and run the Polkadot Stack Template.

## Prerequisites

### Rust

Install Rust via [rustup](https://rustup.rs/):

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

The project pins Rust stable via `rust-toolchain.toml`. The WASM compilation target is installed automatically.

### Node.js

Required for the Solidity contracts (Hardhat) and the frontend (Vite + React).

- **Node.js**: 22.x LTS (`22.5+` recommended inside the 22.x line)
- **npm**: v10.9.0 or later

> Use Node 22 for the smoothest experience. Newer majors such as Node 25 currently trigger Hardhat compatibility warnings.

Install via [nvm](https://github.com/nvm-sh/nvm) (recommended) or [nodejs.org](https://nodejs.org/).

```bash
nvm install 22
nvm use 22
```

### Polkadot Omni Node

The local dev chain runs on `polkadot-omni-node`. **You must use the version matching the SDK release (stable2512-3).**

Download the prebuilt binary for your platform from:

https://github.com/paritytech/polkadot-sdk/releases/tag/polkadot-stable2512-3

**macOS (Apple Silicon):**
```bash
curl -L https://github.com/paritytech/polkadot-sdk/releases/download/polkadot-stable2512-3/polkadot-omni-node-aarch64-apple-darwin -o polkadot-omni-node
chmod +x polkadot-omni-node
sudo mv polkadot-omni-node /usr/local/bin/
```

**Linux (x86_64):**
```bash
curl -L https://github.com/paritytech/polkadot-sdk/releases/download/polkadot-stable2512-3/polkadot-omni-node -o polkadot-omni-node
chmod +x polkadot-omni-node
sudo mv polkadot-omni-node /usr/local/bin/
```

### Ethereum RPC Adapter (eth-rpc)

Bridges Ethereum JSON-RPC (port 8545) to the Substrate node, enabling Hardhat/ethers.js/MetaMask to interact with pallet-revive contracts.

Download from the same release:

**macOS (Apple Silicon):**
```bash
curl -L https://github.com/paritytech/polkadot-sdk/releases/download/polkadot-stable2512-3/eth-rpc-aarch64-apple-darwin -o eth-rpc
chmod +x eth-rpc
sudo mv eth-rpc /usr/local/bin/
```

**Linux (x86_64):**
```bash
curl -L https://github.com/paritytech/polkadot-sdk/releases/download/polkadot-stable2512-3/eth-rpc -o eth-rpc
chmod +x eth-rpc
sudo mv eth-rpc /usr/local/bin/
```

Verify:
```bash
eth-rpc --version
# Should output: pallet-revive-eth-rpc 0.12.0
```

Verify the version:
```bash
polkadot-omni-node --version
# Should output: polkadot-omni-node 1.21.3-...
```

> **Warning**: Using an older omni-node version (e.g., v1.18.5 from stable2503) will crash with "Missing required set_validation_data inherent" errors.

### Chain Spec Builder

Used to generate the chain specification from the runtime WASM.

```bash
cargo install staging-chain-spec-builder
```

### Solidity Tooling (for smart contracts)

The EVM contracts use standard Hardhat. The PVM contracts use the Parity Hardhat plugin with `resolc`.

Dependencies are installed automatically via `npm install` in each contract directory. No global installs required.

## Building

### Build the Runtime

```bash
cargo build -p stack-template-runtime --release
```

This compiles the parachain runtime to both native and WASM. The WASM blob is output to:
```
target/release/wbuild/stack-template-runtime/stack_template_runtime.compact.compressed.wasm
```

### Build the Pallet (check only)

```bash
cargo check -p pallet-template
```

### Run Pallet Tests

```bash
cargo test -p pallet-template
```

With benchmarks:
```bash
SKIP_PALLET_REVIVE_FIXTURES=1 cargo test --workspace --features runtime-benchmarks
```

> The `SKIP_PALLET_REVIVE_FIXTURES` env var is needed because pallet-revive's test fixture compilation requires a nightly Rust toolchain.

### Compile Solidity Contracts

**EVM (solc):**
```bash
cd contracts/evm
npm install
npx hardhat compile
```

**PVM (resolc):**
```bash
cd contracts/pvm
npm install
npx hardhat compile
```

### Install Frontend Dependencies

```bash
cd web
npm install
```

The repo keeps `web/src/config/deployments.ts` as a checked-in stub so the frontend works in a fresh clone. Contract deploy scripts update that file and the root `deployments.json` automatically.

## Running Locally

### Quick Start

```bash
./scripts/start-all.sh
```

This builds the runtime, generates a chain spec, starts the omni-node and eth-rpc adapter, compiles and deploys both contracts, and starts the frontend — all in one command.

- **Substrate RPC**: `ws://127.0.0.1:9944`
- **Ethereum RPC**: `http://127.0.0.1:8545` (via eth-rpc adapter)
- **Frontend**: `http://localhost:5173`

Press Ctrl+C to stop everything.

### Running Components Individually

```bash
# Node only (no contracts, no frontend)
./scripts/start-dev.sh

# Node + compile and deploy contracts
./scripts/start-dev-with-contracts.sh

# Frontend (requires node already running)
./scripts/start-frontend.sh
```

The Ethereum RPC endpoint is compatible with MetaMask, Hardhat, ethers.js, and all standard Ethereum tooling.

### CLI

```bash
cargo run -p stack-cli -- chain info
cargo run -p stack-cli -- pallet create-claim --file ./README.md
cargo run -p stack-cli -- pallet list-claims
cargo run -p stack-cli -- contract create-claim evm --file ./README.md
```

The CLI is part of the Rust workspace, so `cargo run -p stack-cli -- ...` works from the repo root.

## Deploying to Polkadot TestNet

Target: **Polkadot Hub TestNet** (Chain ID: `420420417`)

RPC endpoint: `https://services.polkadothub-rpc.com/testnet`

Get testnet tokens: https://faucet.polkadot.io/

### Set your private key

```bash
cd contracts/evm && npx hardhat vars set PRIVATE_KEY
cd contracts/pvm && npx hardhat vars set PRIVATE_KEY
```

### Deploy

```bash
# EVM
cd contracts/evm
npm run deploy:testnet

# PVM
cd contracts/pvm
npm run deploy:testnet
```

Both commands update `deployments.json` and `web/src/config/deployments.ts` so the CLI and frontend stay in sync.

### Verify on Blockscout

```bash
cd contracts/evm
npx hardhat verify --network polkadotTestnet DEPLOYED_CONTRACT_ADDRESS
```

## Troubleshooting

### "Missing required set_validation_data inherent"

Your `polkadot-omni-node` version doesn't match the runtime. Download the correct version from the [stable2512-3 release](https://github.com/paritytech/polkadot-sdk/releases/tag/polkadot-stable2512-3).

### "Failed to retrieve the parachain id"

The chain spec is missing or empty. Regenerate it:
```bash
chain-spec-builder \
    -c blockchain/chain_spec.json \
    create -t development \
    --relay-chain paseo --para-id 1000 \
    --runtime target/release/wbuild/stack-template-runtime/stack_template_runtime.compact.compressed.wasm \
    named-preset development
```

### WASM build fails with arrayvec/serde_core errors

Make sure you're using the `polkadot-sdk` umbrella crate (not individual crate dependencies). The umbrella crate handles feature gating for `wasm32v1-none` correctly.

### pallet-revive-proc-macro compilation error

The `[patch.crates-io]` section in `Cargo.toml` pins `pallet-revive-proc-macro` to v0.7.1 from the polkadot-sdk stable2512-3 tag. If you regenerate `Cargo.lock`, this patch is applied automatically.

### TypeScript moduleResolution error in Hardhat

Each contract directory has a `tsconfig.json` that avoids the TypeScript 7.0 deprecation. Make sure you're using the `tsconfig.json` in the contract directory, not a global one.

### Frontend builds but uses stale chain types

The frontend now fails fast if PAPI code generation fails. Regenerate the metadata and descriptors against a running chain:

```bash
cd web
npm run update-types
npm run codegen
```
