# Deployment Guide

This guide covers deploying the frontend, smart contracts, and parachain runtime.

## Frontend Deployment

The frontend is a static Vite app that works on any hosting platform. It uses hash-based routing (`HashRouter`) and relative asset paths (`base: "./"`) so it works correctly on IPFS gateways, GitHub Pages, and subdirectory deployments without configuration.

The app now exposes both the Substrate WebSocket endpoint and the Ethereum JSON-RPC endpoint on the home page. On `localhost` it defaults to local dev URLs; on hosted deployments it defaults to Polkadot Hub TestNet. You can also set build-time defaults with `VITE_WS_URL` and `VITE_ETH_RPC_URL` (see `web/.env.example`).

### GitHub Pages

The simplest option for public demos.

**Setup (one-time):**

1. Go to your repo **Settings > Pages**
2. Under **Source**, select **GitHub Actions**

**How it works:**

The workflow at `.github/workflows/deploy-github-pages.yml` runs automatically on push to `main`/`master`. It builds the frontend and deploys to GitHub Pages.

Your site will be available at:
```
https://<username>.github.io/<repo-name>/
```

**Manual trigger:**

Go to **Actions > Deploy to GitHub Pages > Run workflow** to trigger a deploy without pushing code.

### DotNS (IPFS + Polkadot naming)

Deploys the frontend to IPFS and registers a `.dot` domain that resolves to it via the Polkadot naming system.

**How it works:**

The workflow at `.github/workflows/deploy-frontend.yml` is manual on purpose. It:

1. Builds the frontend
2. Uploads to IPFS
3. Registers/updates the DotNS domain via `paritytech/dotns-sdk`

The domain basename is entered when you dispatch the workflow. Domain registration is automatic (`register-base: true`).

**Configuration:**

- Set the `DOTNS_MNEMONIC` secret in your repo settings before running the workflow
- Open **Actions > Deploy Frontend to DotNS > Run workflow**
- Enter the DotNS basename you want to register or update

**Local IPFS deployment:**

You can also deploy to IPFS locally without CI:

```bash
# Install web3.storage CLI (one-time)
npm install -g @web3-storage/w3cli
w3 login your@email.com
w3 space create polkadot-stack-template

# Deploy
./scripts/deploy-frontend.sh
```

This builds the frontend, uploads to IPFS, and prints the gateway URL plus the DotNS follow-up steps.

### Other platforms

Since the frontend is a static build, it works on any static hosting:

```bash
cd web && npm install && npm run build
# Output: web/dist/
```

Upload `web/dist/` to Vercel, Netlify, Cloudflare Pages, S3, or any static file server.

## Smart Contract Deployment

### Local dev node

The quickest way to get everything running (node, contracts, and frontend):

```bash
./scripts/start-all.sh
```

Or start the node and deploy contracts without the frontend:

```bash
./scripts/start-dev-with-contracts.sh
```

Or deploy contracts manually against a running node:

```bash
# Start node (terminal 1)
./scripts/start-dev.sh

# Deploy contracts (terminal 2)
cd contracts/evm && npm install && npm run deploy:local
cd contracts/pvm && npm install && npm run deploy:local
```

Deploy scripts automatically write contract addresses to `deployments.json` (for CLI) and `web/src/config/deployments.ts` (for frontend). The frontend contract pages auto-populate the address field from those shared files.

### Polkadot TestNet

```bash
# Set your private key in each contract directory
cd contracts/evm && npx hardhat vars set PRIVATE_KEY
cd contracts/pvm && npx hardhat vars set PRIVATE_KEY

# Get testnet tokens
# Visit: https://faucet.polkadot.io/

# Deploy both contracts
./scripts/deploy-paseo.sh
```

TestNet details:
- **RPC**: `https://services.polkadothub-rpc.com/testnet`
- **Chain ID**: `420420417`
- **Explorer**: [blockscout-testnet.polkadot.io](https://blockscout-testnet.polkadot.io/)

## Parachain Runtime

### Local development

```bash
# Build and start with polkadot-omni-node
./scripts/start-dev.sh
```

This builds the runtime WASM, generates a chain spec, and starts the node. Endpoints:
- **Substrate RPC**: `ws://127.0.0.1:9944`
- **Ethereum RPC**: `http://127.0.0.1:8545` (requires `eth-rpc --dev` running separately)

### Docker

```bash
cd blockchain
docker compose up
```

The Docker image copies [`blockchain/chain_spec.json`](blockchain/chain_spec.json) at build time. If you change the runtime, regenerate the chain spec first so the container does not boot with a stale file:

```bash
./scripts/start-dev.sh
# or run the build + chain-spec-builder steps from INSTALL.md manually
```

### Zombienet (multi-node)

```bash
zombienet spawn blockchain/zombienet.toml
```

## Bulletin Chain (IPFS Upload)

Both the frontend and CLI support optional file upload to the Polkadot Bulletin Chain, which makes files available via IPFS.

**Prerequisites:**
- Account must be authorized on the Bulletin Chain: [paritytech.github.io/polkadot-bulletin-chain](https://paritytech.github.io/polkadot-bulletin-chain/)
- Bulletin Chain RPC: `wss://paseo-bulletin-rpc.polkadot.io`

**Frontend:**
1. Toggle "Upload to IPFS (via Bulletin Chain)" in the file drop zone
2. The frontend checks account authorization via PAPI
3. File bytes are uploaded via `TransactionStorage.store()`
4. Then the hash is claimed on the parachain/contract
5. The IPFS link appears in the claims list (verified via gateway HEAD request)

**CLI:**
```bash
# Hash a file and upload to Bulletin Chain, then claim on pallet
cargo run -p stack-cli -- pallet create-claim --file ./document.pdf --upload

# Same for contracts
cargo run -p stack-cli -- contract create-claim evm --file ./document.pdf --upload
```

The CLI connects to the Bulletin Chain via subxt and submits `TransactionStorage.store()`.

For contract commands, `--upload` uses a Substrate signer for the Bulletin Chain and an Ethereum signer for the contract call. If you use a raw Ethereum private key with `--signer`, also pass `--bulletin-signer` explicitly.

**Notes:**
- Files expire after ~7 days unless renewed
- Maximum 8 MiB per file
- IPFS gateway: `https://paseo-ipfs.polkadot.io/ipfs/{cid}`

## CLI

The CLI reads contract addresses from `deployments.json` in the project root. After deploying contracts, it works immediately.

### Signer options

All write commands accept `--signer` (`-s`) which auto-detects the format:

```bash
# Pallet commands
--signer alice                              # dev account name
--signer "bottom drive obey lake ..."       # mnemonic phrase
--signer 0x5fb92d6e98884f76de468fa3f...     # raw secret seed

# Contract commands
--signer alice                              # dev account name
--signer 0x5fb92d6e98884f76de468fa3f...     # raw Ethereum private key
```

Default is `alice` if omitted.

### Commands

```bash
# Chain info
cargo run -p stack-cli -- chain info

# Pallet interaction (via Substrate RPC)
cargo run -p stack-cli -- pallet create-claim 0x0123...def                  # direct hash
cargo run -p stack-cli -- pallet create-claim --file ./doc.pdf              # hash a file
cargo run -p stack-cli -- pallet create-claim --file ./doc.pdf --upload     # hash + IPFS upload
cargo run -p stack-cli -- pallet create-claim --file ./doc.pdf -s bob       # custom signer
cargo run -p stack-cli -- pallet get-claim 0x0123...
cargo run -p stack-cli -- pallet list-claims
cargo run -p stack-cli -- pallet revoke-claim 0x0123... -s alice

# Contract interaction (via eth-rpc)
cargo run -p stack-cli -- contract info
cargo run -p stack-cli -- contract create-claim evm 0x0123...               # direct hash
cargo run -p stack-cli -- contract create-claim evm --file ./doc.pdf        # hash a file
cargo run -p stack-cli -- contract create-claim pvm --file ./doc.pdf --upload -s bob
cargo run -p stack-cli -- contract create-claim evm --file ./doc.pdf --upload --signer 0x... --bulletin-signer alice
cargo run -p stack-cli -- contract get-claim evm 0x0123...
cargo run -p stack-cli -- contract revoke-claim pvm 0x0123... -s bob
```

Use `--url` and `--eth-rpc-url` flags to target different endpoints:

```bash
cargo run -p stack-cli -- --url wss://your-node:9944 --eth-rpc-url https://your-eth-rpc:8545 contract get-claim evm 0x0123...
```
