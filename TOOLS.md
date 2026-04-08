# Polkadot Stack Tools

This document describes all the parts of the Polkadot technology stack exposed by this template.

## Required vs Optional

- **Required for the smallest local demo**: Rust, `polkadot-omni-node`, the runtime, the pallet, and optionally the CLI.
- **Required for contract examples**: add `eth-rpc`, `contracts/evm`, and/or `contracts/pvm`.
- **Required for the web app**: add `web/` plus the committed PAPI descriptors in `web/.papi/`.
- **Optional extras**: Bulletin Chain (IPFS uploads), Spektr host integration, and DotNS deployment. These are isolated so students can remove them without touching the core PoE flows.

## Polkadot SDK

The foundation for the entire blockchain layer. Polkadot SDK provides FRAME (the pallet development framework), Cumulus (parachain support), and all the runtime primitives.

- **Version**: stable2512-3 (umbrella crate v2512.3.3)
- **Used for**: Parachain runtime, pallet development, consensus, XCM
- **Source**: [`blockchain/runtime/`](blockchain/runtime/), [`blockchain/pallets/template/`](blockchain/pallets/template/)
- **Docs**: [paritytech.github.io/polkadot-sdk](https://paritytech.github.io/polkadot-sdk/master/)

The runtime includes core pallets (System, Balances, Aura, Session, Sudo, XCM) plus `pallet-revive` for smart contracts and the custom `TemplatePallet` for proof of existence.

## Statement Store

Statement Store is an omni-node feature for validating, storing, and gossiping signed statements over the network using a runtime-provided `validate_statement` API.

- **Used for**: Short-lived off-chain statement storage and propagation
- **Runtime pieces**: `pallet-statement` + `sp-statement-store` runtime API
- **Node flag**: `--enable-statement-store`
- **RPC methods**: `statement_submit`, `statement_dump`, plus the topic/key query variants
- **Local status in this template**: Enabled by default in the repo's local omni-node scripts

The local scripts intentionally do not use `--dev` for omni-node. On the `polkadot-omni-node` release paired with `stable2512-3`, Statement Store RPCs are exposed when using the explicit local-authority flags (`--tmp --alice --force-authoring`) but not when using `--dev`.

The current template integration is active in all three local entry points:

- CLI: signed submission and dump flows via `stack-cli chain statement-submit` / `statement-dump`
- Frontend: optional Statement Store submission on the pallet and contract claim pages
- Scripts: [`scripts/test-statement-store-smoke.sh`](scripts/test-statement-store-smoke.sh) runs an end-to-end local-node submission and dump check

## pallet-revive (EVM + PVM)

Enables both EVM and PolkaVM smart contract execution on the parachain. Contracts written in Solidity can be compiled to either target and deployed through the same Ethereum-compatible JSON-RPC interface.

- **Version**: v0.12.2
- **Compilers**: `solc` v0.8.28 (EVM bytecode), `resolc` v1.0.0 (PolkaVM/RISC-V bytecode)
- **RPC**: eth-rpc adapter bridges Ethereum JSON-RPC to pallet-revive
- **Used for**: `ProofOfExistence.sol` deployed to both EVM and PVM backends
- **Source**: [`contracts/evm/`](contracts/evm/), [`contracts/pvm/`](contracts/pvm/)
- **Docs**: [docs.polkadot.com/smart-contracts](https://docs.polkadot.com/smart-contracts/overview/)

### How it works

```
Solidity source (ProofOfExistence.sol)
  ├── solc  → EVM bytecode  → pallet-revive (REVM backend)
  └── resolc → PVM bytecode  → pallet-revive (PolkaVM backend)

Frontend / CLI
  → Ethereum JSON-RPC (eth_call, eth_sendTransaction)
  → eth-rpc adapter (http://127.0.0.1:8545)
  → pallet-revive on the parachain
```

Both targets use the same ABI, same tooling (Hardhat, viem, alloy), and the same frontend code. The only difference is the compiler and VM backend.

## Bulletin Chain (IPFS Storage)

The Polkadot Bulletin Chain is a system chain that provides on-chain data storage with IPFS integration. Files stored via the `TransactionStorage` pallet are automatically available through IPFS protocols (Bitswap, DHT) and gateways.

- **Pallet**: `TransactionStorage.store()` for uploading, `TransactionStorage.renew()` for extending retention
- **Hash**: blake2b-256 (same hash used for PoE claims)
- **CID**: CID v1 with raw codec (0x55) and blake2b-256 multihash (0xb220)
- **Paseo RPC**: `wss://paseo-bulletin-rpc.polkadot.io`
- **IPFS Gateway**: `https://paseo-ipfs.polkadot.io/ipfs/{cid}`
- **Authorization**: Required before uploading. On Bulletin Paseo, open [paritytech.github.io/polkadot-bulletin-chain](https://paritytech.github.io/polkadot-bulletin-chain/), go to `Faucet` -> `Authorize Account`, and request the transaction count and byte allowance you need for the Substrate account that will upload the file. The testing faucet grants a temporary allowance using the Alice dev account via sudo.
- **Data expiry**: ~7 days (100,800 blocks) unless renewed
- **Max file size**: 8 MiB per transaction
- **Used for**: Optional IPFS upload of files before claiming their hash on-chain
- **Source**: [`web/src/hooks/useBulletin.ts`](web/src/hooks/useBulletin.ts), [`cli/src/commands/mod.rs`](cli/src/commands/mod.rs)

Authorization on Bulletin Paseo is temporary. The allowance expires at a block roughly 100,000 blocks in the future, and the same UI exposes `Renew` if you need more time. If upload fails with an authorization error, first check that you authorized the same Substrate address that is signing `TransactionStorage.store()`.

This self-service faucet flow is specific to the current Bulletin Paseo/testing setup. Other Bulletin deployments may use a different authorization process.

### Upload flow

1. Frontend computes blake2b-256 hash of the file
2. (Optional) Upload file bytes to Bulletin Chain via `TransactionStorage.store()`
3. Claim the hash on the parachain pallet or contract
4. The IPFS link is reconstructed from the hash — resolves if the file was uploaded

## DotNS (Polkadot Naming System)

DotNS provides `.dot` domain names that resolve to IPFS content, enabling human-readable URLs for dApps deployed on IPFS.

- **Used for**: Frontend deployment to IPFS with a `.dot` domain
- **CI Workflow**: `.github/workflows/deploy-frontend.yml` uses `paritytech/dotns-sdk`
- **Domain registration**: Automatic via `register-base: true` in the workflow
- **Mode**: Manual workflow dispatch with an explicit `DOTNS_MNEMONIC` secret
- **Docs**: [dotns.app](https://dotns.app)

### Deployment

The GitHub Actions workflow builds the frontend, uploads to IPFS, and registers/updates the DotNS domain when you manually trigger it. The local script (`scripts/deploy-frontend.sh`) uploads to IPFS via the `w3` CLI and then prints the DotNS follow-up steps.

## PAPI (Polkadot API)

The JavaScript/TypeScript library for interacting with Substrate chains. PAPI provides type-safe extrinsic submission, storage queries, and runtime API calls using descriptors generated from chain metadata.

- **Version**: v1.23.3
- **Used for**: Frontend pallet interaction (create/revoke claims, query storage, block subscription)
- **Descriptors**: Stored in `web/.papi/`, regenerated from a running chain via `npm run update-types`
- **Source**: [`web/src/hooks/useChain.ts`](web/src/hooks/useChain.ts), [`web/src/hooks/useConnection.ts`](web/src/hooks/useConnection.ts)
- **Docs**: [papi.how](https://papi.how/)

### Key patterns

```typescript
// Connect
const client = createClient(withPolkadotSdkCompat(getWsProvider(wsUrl)));
const api = client.getTypedApi(stack_template);

// Query storage
const entries = await api.query.TemplatePallet.Claims.getEntries();

// Submit extrinsic
const result = await api.tx.TemplatePallet.create_claim({
  hash: Binary.fromHex(fileHash),
}).signAndSubmit(signer);
```

Also used for Bulletin Chain interaction via a separate client with the `bulletin` descriptor. The repo now fails fast if `papi generate` fails, which makes descriptor drift easier for students and AI agents to diagnose.

## subxt

The Rust library for interacting with Substrate chains. Used by the CLI for native Substrate RPC calls — querying storage, submitting extrinsics, and iterating storage entries.

- **Version**: 0.38
- **Used for**: CLI pallet commands (create-claim, revoke-claim, get-claim, list-claims)
- **Source**: [`cli/src/commands/pallet.rs`](cli/src/commands/pallet.rs)
- **Docs**: [github.com/parity-tech/subxt](https://github.com/parity-tech/subxt)

### Key patterns

```rust
// Dynamic storage query
let query = subxt::dynamic::storage("TemplatePallet", "Claims", vec![Value::from_bytes(hash)]);
let result = api.storage().at_latest().await?.fetch(&query).await?;

// Dynamic transaction
let tx = subxt::dynamic::tx("TemplatePallet", "create_claim", vec![("hash", Value::from_bytes(hash))]);
api.tx().sign_and_submit_then_watch_default(&tx, &signer).await?;
```

## alloy

The Rust library for interacting with Ethereum-compatible chains. Used by the CLI for EVM/PVM contract interaction through the eth-rpc adapter.

- **Version**: 1.8
- **Used for**: CLI contract commands (create-claim, revoke-claim, get-claim)
- **Source**: [`cli/src/commands/contract.rs`](cli/src/commands/contract.rs)
- **Docs**: [alloy.rs](https://alloy.rs)

### Key patterns

```rust
// Type-safe contract bindings via sol! macro
sol! {
    #[sol(rpc)]
    contract ProofOfExistence {
        function createClaim(bytes32 documentHash) external;
        function getClaim(bytes32 documentHash) external view returns (address, uint256);
    }
}

// Read
let result = contract.getClaim(hash).call().await?;

// Write (with signer)
let provider = ProviderBuilder::new().wallet(wallet).connect_http(url);
contract.createClaim(hash).send().await?.get_receipt().await?;
```

## viem

The JavaScript library for interacting with Ethereum-compatible chains. Used by the frontend for EVM/PVM contract interaction and by Hardhat for testing and deployment.

- **Version**: v2.x
- **Used for**: Frontend contract pages (create/revoke claims, query claims), Hardhat tests and deploy scripts
- **Source**: [`web/src/config/evm.ts`](web/src/config/evm.ts), [`web/src/components/ContractProofOfExistencePage.tsx`](web/src/components/ContractProofOfExistencePage.tsx)
- **Docs**: [viem.sh](https://viem.sh)

The frontend now exposes the Ethereum JSON-RPC endpoint on the home page, instead of hard-coding localhost. That keeps GitHub Pages/IPFS deployments usable against testnet contracts.

## Hardhat

The Ethereum development framework used for compiling, testing, and deploying Solidity contracts to both EVM and PVM targets.

- **Version**: v2.27+
- **Plugins**: `@nomicfoundation/hardhat-viem` (viem integration), `@parity/hardhat-polkadot` (PVM/resolc support), `@nomicfoundation/hardhat-verify` (Blockscout verification)
- **Source**: [`contracts/evm/`](contracts/evm/), [`contracts/pvm/`](contracts/pvm/)
- **Docs**: [hardhat.org](https://hardhat.org)

### Commands

```bash
npx hardhat compile          # Compile contracts
npx hardhat test             # Run tests (local Hardhat network)
npm run deploy:local         # Deploy to local node via eth-rpc
npm run deploy:testnet       # Deploy to Polkadot TestNet
```

## Polkadot Product SDK (Spektr)

The Nova Sama Technologies SDK for building products that run inside the Polkadot Triangle ecosystem (Desktop, Mobile, Web hosts). Enables Spektr wallet injection for accounts managed by the Polkadot app.

- **Package**: `@novasamatech/product-sdk`
- **Used for**: Spektr account detection and injection on the Accounts page
- **Source**: [`web/src/pages/AccountsPage.tsx`](web/src/pages/AccountsPage.tsx)

This integration is optional. If you do not need host-injected wallets, you can remove the Accounts page without affecting the pallet or contract demos.

### Host detection

```typescript
// Three-way environment detection
if ((window as any).__HOST_WEBVIEW_MARK__) → 'desktop-webview'
else if (window !== window.top) → 'web-iframe'
else → 'standalone'

// Spektr injection (host mode only)
await injectSpektrExtension();
const ext = await connectInjectedExtension(SpektrExtensionName);
```

## polkadot-omni-node

The unified Substrate parachain node binary. Runs the compiled runtime WASM without requiring a custom node binary.

- **Version**: v1.21.3 (stable2512-3)
- **Used for**: Running the local dev chain
- **Download**: [polkadot-sdk releases](https://github.com/paritytech/polkadot-sdk/releases/tag/polkadot-stable2512-3)

## eth-rpc

The Ethereum JSON-RPC adapter for pallet-revive. Translates standard Ethereum RPC calls (eth_call, eth_sendTransaction, etc.) into Substrate extrinsics.

- **Version**: v0.12.0
- **Used for**: Bridging Ethereum tooling (MetaMask, Hardhat, viem, alloy) to the parachain
- **Endpoint**: `http://127.0.0.1:8545` (local dev) or `https://services.polkadothub-rpc.com/testnet` (Polkadot Hub TestNet)
- **Download**: [polkadot-sdk releases](https://github.com/paritytech/polkadot-sdk/releases/tag/polkadot-stable2512-3)

## Zombienet

Multi-node testing framework for Polkadot/Cumulus networks. Spawns a local relay chain + parachain network for integration testing.

- **Config**: [`blockchain/zombienet.toml`](blockchain/zombienet.toml) (2 relay validators + 1 collator)
- **Docs**: [github.com/parity-tech/zombienet](https://github.com/paritytech/zombienet)

## Blockscout

Block explorer for the Polkadot TestNet. Used for contract verification and transaction inspection.

- **TestNet URL**: [blockscout-testnet.polkadot.io](https://blockscout-testnet.polkadot.io/)
- **Used for**: Contract verification via `npx hardhat verify`
