# Polkadot Stack Template

A developer starter template demonstrating the full Polkadot technology stack through a **Proof of Existence** system — the same concept implemented as a Substrate pallet, a Solidity EVM contract, and a Solidity PVM contract. Drop a file, claim its hash on-chain, and optionally upload it to IPFS via the Bulletin Chain.

Students do not need to use every part of this repo. The runtime, pallet, contracts, frontend, CLI, Bulletin integration, Spektr integration, and deployment workflows are intentionally separated so teams can keep only the slices they want.

## What's Inside

- **Polkadot SDK Blockchain** ([`blockchain/`](blockchain/)) — A Cumulus-based parachain compatible with `polkadot-omni-node`
  - **Substrate Pallet** ([`blockchain/pallets/template/`](blockchain/pallets/template/)) — FRAME pallet for creating and revoking Proof of Existence claims on-chain
  - **Parachain Runtime** ([`blockchain/runtime/`](blockchain/runtime/)) — Runtime wiring the pallet with smart contract support via `pallet-revive`
- **Smart Contracts** ([`contracts/`](contracts/)) — The same PoE example as Solidity, compiled to both EVM bytecode (solc) and PVM/RISC-V bytecode (resolc)
- **Frontend** ([`web/`](web/)) — React + TypeScript app using PAPI for pallet interactions and viem for contract calls
- **CLI** ([`cli/`](cli/)) — Rust CLI for chain queries, pallet operations, and contract calls via subxt and alloy
- **Dev Scripts** ([`scripts/`](scripts/)) — One-command scripts to build, start, and test the full stack locally

## Quick Start

### Docker (no Rust required)

```bash
# Start the parachain node + Ethereum RPC adapter (first build compiles the runtime ~10-20 min)
docker compose up -d

# Deploy contracts and start the frontend on the host
(cd contracts/evm && npm install && npm run deploy:local)
(cd contracts/pvm && npm install && npm run deploy:local)
(cd web && npm install && npm run dev)
# Frontend: http://127.0.0.1:5173
```

Only Node.js is needed on the host. The Docker build compiles the Rust runtime and generates the chain spec automatically. See [`contracts/README.md`](contracts/README.md) and [`web/README.md`](web/README.md) for the component-specific follow-up steps.

### Prerequisites (native)

- **OpenSSL** development headers (`libssl-dev` on Ubuntu, `openssl` on macOS)
- **protoc** Protocol Buffers compiler (`protobuf-compiler` on Ubuntu, `protobuf` on macOS)
- **Rust** (stable, installed via [rustup](https://rustup.rs/))
- **Node.js** 22.x LTS (`22.5+` recommended) and npm v10.9.0+
- **Polkadot SDK binaries** (stable2512-3): `polkadot`, `polkadot-prepare-worker`, `polkadot-execute-worker` (relay), `polkadot-omni-node`, `eth-rpc`, `chain-spec-builder`, and `zombienet`. Fetch them all into `./bin/` (gitignored) with:

  ```bash
  ./scripts/download-sdk-binaries.sh
  ```

  This is the primary supported native setup for this repo. The stack scripts (`start-all.sh`, `start-local.sh`, etc.) run the same step automatically unless you set `STACK_DOWNLOAD_SDK_BINARIES=0`. Versions match the **Key Versions** table below.

If your platform cannot use the downloader-managed binaries, see the limited-support fallback in [docs/INSTALL.md](docs/INSTALL.md#manual-binary-fallback-limited-support).

The repo includes [`.nvmrc`](.nvmrc) and `engines` fields in the JavaScript projects to keep everyone on the same Node major version.

### Run locally

```bash
# Start everything: node, contracts, and frontend in one command
./scripts/start-all.sh
# Substrate RPC: ws://127.0.0.1:9944
# Ethereum RPC:  http://127.0.0.1:8545
# Frontend:      http://127.0.0.1:5173
```

`start-all.sh` is the recommended full-feature local path. It uses Zombienet under the hood so the Statement Store example works on `polkadot-sdk stable2512-3`.

For the solo-node loop, relay-backed network, frontend-only startup, port overrides, or a second local stack, see [`scripts/README.md`](scripts/README.md).

For component-specific next steps, see:

- [`contracts/README.md`](contracts/README.md)
- [`web/README.md`](web/README.md)
- [`cli/README.md`](cli/README.md)

### Lint & format

```bash
# Rust (requires nightly for rustfmt config options)
cargo +nightly fmt              # format
cargo +nightly fmt --check      # check only
cargo clippy --workspace        # lint

# Frontend (web/)
cd web && npm run fmt           # format
cd web && npm run fmt:check     # check only
cd web && npm run lint          # eslint

# Contracts (contracts/evm/ and contracts/pvm/)
cd contracts/evm && npm run fmt
cd contracts/pvm && npm run fmt
```

### Run tests

```bash
# Pallet unit tests
cargo test -p pallet-template

# All tests including benchmarks
SKIP_PALLET_REVIVE_FIXTURES=1 cargo test --workspace --features runtime-benchmarks

# Statement Store runtime + CLI coverage
cargo test -p stack-template-runtime
cargo test -p stack-cli

# Relay-backed Statement Store smoke test
./scripts/test-statement-store-smoke.sh

# Solidity tests (local Hardhat network)
cd contracts/evm && npx hardhat test
cd contracts/pvm && npx hardhat test
```

## Documentation

- [docs/TOOLS.md](docs/TOOLS.md) - All Polkadot stack components used in this template
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) - Deployment guide (GitHub Pages, DotNS, contracts, runtime)
- [docs/INSTALL.md](docs/INSTALL.md) - Detailed setup instructions

## Using Only What You Need

- **Pallet only**: Keep [`blockchain/pallets/template/`](blockchain/pallets/template/), [`blockchain/runtime/`](blockchain/runtime/), and optionally [`cli/`](cli/). You can ignore `contracts/`, `web/src/components/ContractProofOfExistencePage.tsx`, and `eth-rpc`.
- **Contracts only**: Keep [`contracts/`](contracts/) plus the `Revive` runtime wiring in [`blockchain/runtime/`](blockchain/runtime/). The pallet and Bulletin integration are optional.
- **Frontend only**: The core PoE UI lives in [`web/src/pages/PalletPage.tsx`](web/src/pages/PalletPage.tsx), [`web/src/pages/EvmContractPage.tsx`](web/src/pages/EvmContractPage.tsx), and [`web/src/pages/PvmContractPage.tsx`](web/src/pages/PvmContractPage.tsx). The Accounts page, Spektr support, and Bulletin upload hook can be removed without affecting the basic claim flows.
- **Optional integrations**: Bulletin Chain, Spektr, and DotNS are isolated extras. They are documented locally in [docs/TOOLS.md](docs/TOOLS.md) and can be skipped entirely for workshops or hackathons.

## Key Versions

| Component | Version |
|---|---|
| polkadot-sdk | stable2512-3 (umbrella crate v2512.3.3) |
| polkadot | v1.21.3 (relay chain binary) |
| polkadot-omni-node | v1.21.3 (from stable2512-3 release) |
| eth-rpc | v0.12.0 (Ethereum JSON-RPC adapter) |
| chain-spec-builder | v16.0.0 |
| zombienet | v1.3.133 |
| pallet-revive | v0.12.2 (EVM + PVM smart contracts) |
| Node.js | 22.x LTS |
| Solidity | v0.8.28 |
| resolc | v1.0.0 |
| PAPI | v1.23.3 |
| React | v18.3 |
| viem | v2.x |
| alloy | v1.8 |
| Hardhat | v2.27+ |

## Resources

- [Polkadot Smart Contract Docs](https://docs.polkadot.com/smart-contracts/overview/)
- [Polkadot SDK Documentation](https://paritytech.github.io/polkadot-sdk/master/)
- [PAPI Documentation](https://papi.how/)
- [Polkadot Faucet](https://faucet.polkadot.io/) (TestNet tokens)
- [Blockscout Explorer](https://blockscout-testnet.polkadot.io/) (Polkadot TestNet)
- [Bulletin Chain Authorization](https://paritytech.github.io/polkadot-bulletin-chain/) - On Bulletin Paseo, use `Faucet` -> `Authorize Account` to request a temporary upload allowance for the Substrate account that will sign the upload.

## License

[MIT](LICENSE)
