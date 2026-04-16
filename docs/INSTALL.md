# Installation Guide

This document covers all prerequisites and setup steps needed to build and run the Polkadot Stack Template.

## Docker Quick Start (no Rust required)

If you have **Docker** and **Node.js 22**, you can skip all the Rust/binary setup:

```bash
docker compose up -d          # builds the runtime in Docker (~10-20 min first time)
cd contracts/evm && npm install && npm run deploy:local
cd ../pvm && npm install && npm run deploy:local
cd ../../web && npm install && npm run dev
```

This starts the parachain node (port 9944) and Ethereum RPC adapter (port 8545) in Docker. Contracts and frontend run on the host. See the root `docker-compose.yml` for details.

If you prefer to install everything natively (faster iteration, required for runtime development), continue below.

## Prerequisites

### System Dependencies

The Rust build requires OpenSSL development headers and the Protocol Buffers compiler.

**Ubuntu/Debian:**
```bash
sudo apt-get install -y libssl-dev protobuf-compiler
```

**macOS:**
```bash
brew install openssl protobuf
```

### Rust

Install Rust via [rustup](https://rustup.rs/):

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

The project pins Rust stable via `rust-toolchain.toml`. The WASM compilation target is installed automatically.

Formatting uses nightly-only `rustfmt` options (e.g. `imports_granularity`), so install the nightly toolchain:

```bash
rustup toolchain install nightly
```

### Node.js

Required for the Solidity contracts (Hardhat) and the frontend (Vite + React).

- **Node.js**: 22.x LTS (`22.5+` recommended inside the 22.x line)
- **npm**: v10.9.0 or later

> Use Node 22 for the smoothest experience. Newer majors such as Node 25 currently trigger Hardhat compatibility warnings.

Install via [nvm](https://github.com/nvm-sh/nvm) (recommended) or [nodejs.org](https://nodejs.org/).

```bash
nvm use || nvm install
```

The repo root includes `.nvmrc`, and the JavaScript projects declare `engines.node` / `engines.npm`, so package managers and editors can surface version mismatches early.

### Polkadot SDK binaries (relay, workers, omni-node, eth-rpc)

Zombienet runs the **`polkadot`** relay binary; local dev uses **`polkadot-omni-node`**. Contract tooling expects **`eth-rpc`** (Ethereum JSON-RPC on port `8545` by default). All must match **[polkadot-stable2512-3](https://github.com/paritytech/polkadot-sdk/releases/tag/polkadot-stable2512-3)**.

**Primary supported path for this repo:** run from the repository root:

```bash
./scripts/download-sdk-binaries.sh
```

That fetches `polkadot`, `polkadot-prepare-worker`, `polkadot-execute-worker`, `polkadot-omni-node`, and `eth-rpc` into **`./bin/`** (gitignored). The stack scripts prepend `./bin` on `PATH` when **`STACK_DOWNLOAD_SDK_BINARIES=1`** (default). The relay binary requires the two **worker** binaries in the **same directory** as `polkadot`; the script places them together.

Platform support for the downloader matches the script today: macOS Apple Silicon and Linux x86_64. If your platform cannot use the downloader-managed binaries, see [Manual Binary Fallback (limited support)](#manual-binary-fallback-limited-support) at the end of this guide.

**Verify versions** (from the repository root, using the downloaded binaries):

```bash
./bin/polkadot --version
# polkadot 1.21.3-...

./bin/polkadot-omni-node --version
# polkadot-omni-node 1.21.3-...

./bin/eth-rpc --version
# pallet-revive-eth-rpc 0.12.0
```

If `./bin` is on your `PATH` (as when running `./scripts/start-all.sh` or after `export PATH="$(pwd)/bin:$PATH"`), you can call `polkadot --version` etc. without the prefix.

> **Warning**: Using an older omni-node (e.g. v1.18.5 from an older SDK) can crash with errors such as "Missing required set_validation_data inherent" or missing worker binaries.

### Chain Spec Builder

Used to generate the chain specification from the runtime WASM.

```bash
cargo install staging-chain-spec-builder
```

### Zombienet

The local dev scripts use `zombienet` to start the relay-chain + collator topology on fixed local ports.

One common install path is:

```bash
npm install -g @zombienet/cli
```

Verify:

```bash
zombienet version
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

### Lint & Format

The project uses `rustfmt` for Rust, ESLint + Prettier for TypeScript/React, and Prettier with `prettier-plugin-solidity` for Solidity.

**Rust:**
```bash
cargo +nightly fmt              # format all Rust code
cargo +nightly fmt --check      # check without modifying
cargo clippy --workspace        # lint
```

**Frontend:**
```bash
cd web
npm run fmt           # format TypeScript/React
npm run fmt:check     # check only
npm run lint          # ESLint
```

**Contracts:**
```bash
cd contracts/evm && npm run fmt     # format Solidity + TypeScript
cd contracts/pvm && npm run fmt     # format Solidity + TypeScript
```

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

This builds the runtime, generates a chain spec, starts the local Zombienet relay-chain + collator network, starts the eth-rpc adapter, compiles and deploys both contracts, and starts the frontend — all in one command.

- **Substrate RPC**: `ws://127.0.0.1:9944` by default
- **Ethereum RPC**: `http://127.0.0.1:8545` by default (via eth-rpc adapter)
- **Frontend**: `http://127.0.0.1:5173` by default

Press Ctrl+C to stop everything.

To run a second local stack or move the defaults, use:

```bash
STACK_PORT_OFFSET=100 ./scripts/start-all.sh
```

That shifts the main local endpoints to `10044`, `8645`, and `5273`, and the scripts also regenerate the matching Zombienet, `eth-rpc`, CLI, and frontend settings automatically. For explicit control, set `STACK_SUBSTRATE_RPC_PORT`, `STACK_ETH_RPC_PORT`, and `STACK_FRONTEND_PORT`.

### Running Components Individually

```bash
# Lightweight solo node only (no contracts, no frontend)
./scripts/start-dev.sh

# Relay-backed network only
./scripts/start-local.sh

# Frontend (requires node already running)
./scripts/start-frontend.sh
```

The Ethereum RPC endpoint is compatible with MetaMask, Hardhat, ethers.js, and all standard Ethereum tooling.

The repo ships two local modes:

- `start-dev.sh` uses `--dev-block-time 3000` for the fastest solo-node workflow. On `polkadot-sdk stable2512-3`, omni-node dev mode does **not** register Statement Store RPCs.
- `start-all.sh` and `start-local.sh` use Zombienet (relay chain + collator) when you need the full feature set, including Statement Store.

### CLI

```bash
cargo run -p stack-cli -- chain info
cargo run -p stack-cli -- pallet create-claim --file ./README.md
cargo run -p stack-cli -- pallet list-claims
cargo run -p stack-cli -- contract create-claim evm --file ./README.md
```

The CLI is part of the Rust workspace, so `cargo run -p stack-cli -- ...` works from the repo root.

When you launch the local stack through the scripts, the CLI also picks up `SUBSTRATE_RPC_WS` and `ETH_RPC_HTTP` from the environment automatically. You can still pass `--url` and `--eth-rpc-url` explicitly when you want to target another chain.

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

Your `polkadot-omni-node` version doesn't match the runtime. Re-run `./scripts/download-sdk-binaries.sh` to install the repo-supported binary set.

### "Failed to retrieve the parachain id"

The chain spec is missing or empty. Regenerate it:
```bash
chain-spec-builder \
    -c blockchain/chain_spec.json \
    --chain-name "Polkadot Stack Template" \
    --chain-id "polkadot-stack-template" \
    create -t development \
    --relay-chain rococo-local --para-id 1000 \
    --runtime target/release/wbuild/stack-template-runtime/stack_template_runtime.compact.compressed.wasm \
    named-preset development
```

### WASM build fails with arrayvec/serde_core errors

Make sure you're using the `polkadot-sdk` umbrella crate (not individual crate dependencies). The umbrella crate handles feature gating for `wasm32v1-none` correctly.

### pallet-revive-proc-macro compilation error

The `[patch.crates-io]` section in `Cargo.toml` pins `pallet-revive-proc-macro` to v0.7.1 from the polkadot-sdk stable2512-3 tag. If you regenerate `Cargo.lock`, this patch is applied automatically.

### TypeScript moduleResolution error in Hardhat

Each contract directory has a `tsconfig.json` that avoids the TypeScript 7.0 deprecation. Make sure you're using the `tsconfig.json` in the contract directory, not a global one.

### Statement Store RPCs not available

In polkadot-sdk stable2512-3, `--enable-statement-store` is silently ignored in dev mode (`--dev` or `--dev-block-time`). The dev code path returns early before the statement store configuration is consumed. Use `./scripts/start-all.sh` or `./scripts/start-local.sh` instead — those run a relay chain + collator where the statement store works correctly.

### "Worker binaries could not be found"

The `polkadot` binary requires `polkadot-prepare-worker` and `polkadot-execute-worker` in the **same directory** on your `PATH`. Without them, relay validators fail at startup. Re-run `./scripts/download-sdk-binaries.sh` so the repo-local `./bin/` directory contains all three matching binaries.

### Parachain stalls at block 0 on Zombienet

All binaries (`polkadot`, `polkadot-omni-node`, `eth-rpc`) must be from the same SDK release. A version mismatch (e.g., `polkadot` 1.15.0 with `polkadot-omni-node` 1.21.3) causes the collator to fail to advertise collations to relay chain validators. Verify with (repo root, after `./scripts/download-sdk-binaries.sh`):
```bash
./bin/polkadot --version
./bin/polkadot-omni-node --version
# Both should show 1.21.3
```

### Frontend builds but uses stale chain types

The frontend now fails fast if PAPI code generation fails. Regenerate the metadata and descriptors against a running chain:

```bash
cd web
npm run update-types
npm run codegen
```

## Manual Binary Fallback (limited support)

Use this section only if the downloader-managed binaries do not work for your platform or environment. The repo is primarily tested with `./scripts/download-sdk-binaries.sh`, and the stack scripts assume the repo-local `./bin/` toolchain by default.

If you use this fallback path:

- Keep every SDK binary on the same `polkadot-stable2512-3` release line.
- Keep `polkadot`, `polkadot-prepare-worker`, and `polkadot-execute-worker` in the same directory on `PATH`.
- Set `STACK_DOWNLOAD_SDK_BINARIES=0` before running the stack scripts so they use your manually managed binaries instead of trying to populate `./bin/`.

### Prebuilt release artifacts

If the [stable2512-3 release page](https://github.com/paritytech/polkadot-sdk/releases/tag/polkadot-stable2512-3) has assets for your platform, install matching copies of:

- `polkadot`
- `polkadot-prepare-worker`
- `polkadot-execute-worker`
- `polkadot-omni-node`
- `eth-rpc`

Place them together on your `PATH`, then verify:

```bash
polkadot --version
polkadot-omni-node --version
eth-rpc --version
```

### Build from source

If your platform does not have suitable release assets, you can build the binaries from source:

```bash
cargo install --git https://github.com/paritytech/polkadot-sdk --tag polkadot-stable2512-3 polkadot --locked
cargo install --git https://github.com/paritytech/polkadot-sdk --tag polkadot-stable2512-3 polkadot-omni-node --locked
cargo install --git https://github.com/paritytech/polkadot-sdk --tag polkadot-stable2512-3 pallet-revive-eth-rpc --locked
```

Building `polkadot` from source also produces the worker binaries alongside it. After installing everything, run the stack scripts with:

```bash
STACK_DOWNLOAD_SDK_BINARIES=0 ./scripts/start-all.sh
```
