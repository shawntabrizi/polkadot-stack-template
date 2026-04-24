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

- Open **Actions > Deploy Frontend to DotNS > Run workflow**
- Enter a unique DotNS basename (lowercase, 9+ letters followed by exactly 2 digits, e.g. `my-cool-project42`)
- The workflow uses Alice's dev account by default, which works for free registration on Paseo testnet. To use your own account, set the `DOTNS_MNEMONIC` secret in your repo settings.

**Local IPFS + DotNS deployment via `dot` (playground-cli):**

You can deploy locally without CI using [playground-cli](https://github.com/paritytech/playground-cli). `dot deploy` builds the frontend, uploads it to the Bulletin Chain, and registers a `.dot` domain in a single step.

```bash
# Install playground-cli (one-time)
curl -fsSL https://raw.githubusercontent.com/paritytech/playground-cli/main/install.sh | bash

# First-run setup (QR login, toolchain, account funding, H160 map)
dot init

# IPFS Kubo is also required (installed by `dot init`, or manually):
brew install ipfs && ipfs init   # macOS

# Deploy
./scripts/deploy-frontend.sh --domain polkadot-stack-template00.dot
```

The script wraps `dot deploy --signer dev --domain <name> --buildDir dist`. Set the `MNEMONIC` environment variable (a Substrate URI like `//Alice` or a 12-word phrase) to override the default dev signer. Pass `--playground` to also list the app in the Playground registry.

> Targets **Paseo testnet** only; mainnet is not yet supported by playground-cli.

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

Or deploy contracts manually against a running node:

```bash
# Start node (terminal 1)
./scripts/start-dev.sh

# Start eth-rpc against the local node (terminal 2)
eth-rpc --node-rpc-url "${SUBSTRATE_RPC_WS:-ws://127.0.0.1:9944}" --rpc-port "${STACK_ETH_RPC_PORT:-8545}" --rpc-cors all

# Deploy contracts (terminal 3)
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

This builds the runtime WASM, generates a chain spec, and starts the lightweight solo-node path. Endpoints:
- **Substrate RPC**: `ws://127.0.0.1:9944` by default
- **Ethereum RPC**: `http://127.0.0.1:8545` by default (requires `eth-rpc` running separately)

This solo-node mode is intentionally optimized for quick runtime and contract iteration. On the omni-node release paired with `polkadot-sdk stable2512-3`, Statement Store is **not** available in dev mode, so use the relay-backed scripts (`./scripts/start-all.sh` or `./scripts/start-local.sh`) when you need the Statement Store example working locally.

All local scripts also support `STACK_PORT_OFFSET` plus explicit `STACK_SUBSTRATE_RPC_PORT`, `STACK_ETH_RPC_PORT`, and `STACK_FRONTEND_PORT` overrides. When you use those scripts, the frontend dev server, CLI defaults, Hardhat local network, and PAPI refresh all follow the active port settings automatically.

### Local node flags

The local scripts currently start omni-node with the equivalent of:

```bash
polkadot-omni-node \
  --chain blockchain/chain_spec.json \
  --tmp \
  --alice \
  --force-authoring \
  --dev-block-time 3000 \
  --unsafe-force-node-key-generation \
  --rpc-cors all
```

What each flag is doing:

- `--chain blockchain/chain_spec.json`: run this template's generated chain spec instead of omni-node's built-in `dev` chain
- `--tmp`: use a temporary base path and delete chain data on shutdown
- `--alice`: use Alice's dev keys for authoring and signing
- `--force-authoring`: keep producing blocks even without peers
- `--dev-block-time 3000`: use omni-node's solo dev sealing mode so blocks keep authoring without a relay chain
- `--unsafe-force-node-key-generation`: allow omni-node to generate a temporary network key for this throwaway local authority
- `--rpc-cors all`: keep browser-based local tooling working without extra CORS setup

When you might change these later:

- Remove `--tmp` if you want local chain state to persist across restarts.
- If you remove `--tmp`, also set an explicit `--base-path` so you control where chain data is stored.
- If you remove `--tmp`, you should also stop relying on `--unsafe-force-node-key-generation` and generate a stable node key instead.
- Replace `--alice` with another dev account or your own key setup if you do not want Alice authoring blocks.
- Remove `--force-authoring` if you only want block production when the node is fully participating in a network.
- Remove `--dev-block-time` only if you are switching to a relay-backed environment such as Zombienet.

This repo now generates a repo-specific chain ID instead of the generic `custom` default. That reduces accidental collisions with other local projects. If you move to a persistent base path later, it is still a good idea to keep the base path unique per project.

### Docker

For **local development** (no Rust required):

```bash
docker compose up -d    # builds runtime in Docker, starts node + eth-rpc
```

The root `docker-compose.yml` compiles the runtime and generates the chain spec inside a multi-stage Docker build. First build takes ~10-20 minutes; subsequent builds use the Docker cache.

For **deploying a pre-built image** (e.g. to a cloud server):

```bash
./scripts/start-dev.sh                              # generates blockchain/chain_spec.json
cd blockchain && docker build -t stack-template-node .  # seconds — just copies chain spec
docker push your-registry/stack-template-node        # lightweight ~50MB image
```

[`blockchain/Dockerfile`](../blockchain/Dockerfile) packages a pre-generated chain spec into the polkadot-omni-node base image without any Rust compilation.

Both Docker setups mirror the lightweight solo-node mode. They use `--dev-block-time 3000` so the container keeps authoring blocks without a relay chain, but they do **not** expose Statement Store on stable2512-3. They include `--rpc-methods=unsafe` because the container exposes RPC externally via `--rpc-external`, and Substrate's default RPC safety policy only auto-allows unsafe RPCs on loopback addresses.

### Zombienet (multi-node)

```bash
./scripts/start-local.sh
```

Use `./scripts/start-all.sh` if you want the relay-backed network plus contract deployment and frontend startup in one command.

If you need a second relay-backed stack at the same time:

```bash
STACK_PORT_OFFSET=100 ./scripts/start-local.sh
```

## Bulletin Chain (IPFS Upload)

Both the frontend and CLI support optional file upload to the Polkadot Bulletin Chain, which makes files available via IPFS.

**Prerequisites:**
- Authorize the Substrate account that will sign the upload on [paritytech.github.io/polkadot-bulletin-chain](https://paritytech.github.io/polkadot-bulletin-chain/)
- Bulletin Chain RPC: `wss://paseo-bulletin-rpc.polkadot.io`

**Authorize an account on Bulletin Paseo:**
1. Open [paritytech.github.io/polkadot-bulletin-chain](https://paritytech.github.io/polkadot-bulletin-chain/) and connect the account you will use for uploads
2. Go to `Faucet` -> `Authorize Account`
3. Enter the number of transactions and total bytes you need
4. Submit the request; the testing faucet grants the allowance using the Alice dev account via sudo
5. Confirm the account now shows a current authorization and expiry block

The allowance is temporary and usually expires around 100,000 blocks later. Use the site's `Renew` flow if you still need the upload after that window.

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
- The authorized account must match the Substrate signer used for `TransactionStorage.store()`
- On Bulletin Paseo, authorization is self-service through the site's `Faucet` page; this is a testing flow and may differ on other Bulletin deployments
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
