---
name: stack-cli
description: >-
  Use, maintain, and debug the stack-cli Rust binary. Covers all subcommands
  (market, tx, contract, statement, account, chain), how to add new commands,
  and how to trace issues with transactions and contract state on the local
  Asset Hub node.
license: MIT
metadata:
  author: benja@terrace.fi
  version: '1.0'
  scope:
    - root
  auto_invoke:
    - debug transaction
    - inspect tx
    - market CLI
    - add cli command
    - check listing
    - place order
    - confirm sale
---

## When to Use

Use this skill when:
- Debugging a transaction hash from the frontend or contract deploy
- Inspecting MedicalMarket contract state (listings, orders)
- Adding a new subcommand to `cli/src/commands/`
- Testing the full marketplace flow end-to-end without the frontend

---

## Binary

```bash
# Build
cargo build -p stack-cli --release

# Run (from repo root — deployments.json must be present)
./target/release/stack-cli [SUBCOMMAND]
# or during development:
cargo run -p stack-cli -- [SUBCOMMAND]
```

Default `--eth-rpc` is `http://127.0.0.1:8545` (eth-rpc adapter port).

---

## Subcommand Reference

### `tx` — Transaction inspection

```bash
# Inspect any transaction: status, block, from/to, value, gas, fully decoded logs
stack-cli tx inspect <0xHASH>
```

Known events are fully ABI-decoded using alloy's `SolEvent::decode_raw_log` — named fields
with human-readable values. Unknown selectors fall back to raw topic hex.

**Example output for a confirmed sale:**
```
Transaction
===========
Hash:     0x743b1e...
Status:   Success
Block:    203
From:     0xf24ff3...
To:       0x3ed621...
Value:    0.000000000000000000 PAS
Gas Used: 51263

Logs (1)
========
[0] MedicalMarket.SaleConfirmed
    orderId:    0
    listingId:  0
    patient:    0xf24FF3...
    researcher: 0xf24FF3...
    address: 0x3ed621...
```

**Currently decoded events**: `MedicalMarket.ListingCreated`, `MedicalMarket.OrderPlaced`,
`MedicalMarket.SaleFulfilled`, `MedicalMarket.ListingCancelled`, `MedicalMarket.OrderCancelled`,
`ProofOfExistence.ProofSubmitted`.

**Adding a new event** — edit `cli/src/commands/tx.rs`:
1. Add the event signature to the `alloy::sol! { ... }` block at the top
2. Add an `if let Ok(e) = YourEvent::decode_raw_log(topics, data) { ... }` arm in `decode_log()`

---

### `market` — MedicalMarket contract

Contract address is read from `deployments.json` (`medicalMarket` key).
Must deploy first: `cd contracts/pvm && npm run deploy-market:local`

```bash
# Contract address, listing count, order count
stack-cli market info

# Show all listings with status
stack-cli market list-listings

# Show one listing
stack-cli market get-listing <ID>

# Show all orders
stack-cli market list-orders

# Show one order
stack-cli market get-order <ID>

# Create a listing — Phase 1: takes merkleRoot, statementHash, title, price
stack-cli market create-listing <0xMERKLE_ROOT> <PRICE_IN_PAS> [--signer alice]
# Note: CLI still takes a single hash arg; for Phase 1 pass the merkleRoot.
# statementHash and title are not yet exposed as CLI flags — use the frontend.

# Place a buy order (bob by default)
stack-cli market place-order <LISTING_ID> [--signer bob]

# Fulfill a sale — patient posts AES key, receives payment (alice by default)
stack-cli market fulfill <ORDER_ID> <0xAES_KEY_32BYTES> [--signer alice]

# Cancel a listing — only if no pending order
stack-cli market cancel-listing <LISTING_ID> [--signer alice]

# Cancel an order — researcher withdraws offer and gets full refund
stack-cli market cancel-order <ORDER_ID> [--signer bob]
```

**Signers**: `alice`, `bob`, `charlie` (dev accounts with known private keys) or `0x<HEX_PRIVATE_KEY>`.

**Listing status values**:
- `Active (no order)` — listing is open, nobody has placed an order yet
- `Active (order pending)` — a researcher has locked payment, waiting for patient to confirm
- `Inactive` — cancelled or sale confirmed

---

### `contract` — Generic EVM contract calls

```bash
stack-cli contract call --address <0xADDR> --abi-file <path.json> --fn <name> [--args ...]
```

---

### `statement` — Statement Store

```bash
# Submit a JSON file to the Statement Store (blake2b-256 hash returned)
stack-cli statement submit <file.json>

# List recent statements
stack-cli statement list
```

---

### `account` — Dev account info

```bash
stack-cli account show alice     # show address, balance
stack-cli account show bob
```

---

### `chain` — Node info

```bash
stack-cli chain info             # chain ID, latest block, sync status
```

---

## End-to-End Market Flow (CLI only)

Phase 1 flow. The signed-record.json package is produced by the MedicSign frontend page.

```bash
# 1. Ensure local node + eth-rpc are running
./scripts/start-all.sh

# 2. (Phase 1) Produce a signed package via the frontend MedicSign tool,
#    then use its merkleRoot as the listing commitment.
#    The full create-listing (with statementHash + title) is frontend-only for now.
#    For a quick CLI smoke test, pass any 32-byte value as the merkleRoot hash:
HASH=0x$(head -c 32 /dev/urandom | xxd -p | tr -d '\n')
stack-cli market create-listing $HASH 5 --signer alice

# 3. Verify listing created
stack-cli market list-listings

# 4. Place buy order as researcher (Bob)
stack-cli market place-order 0 --signer bob

# 5. Verify payment locked
stack-cli market get-listing 0    # should show "Active (order pending)"
stack-cli market get-order 0      # should show "Pending"

# 6. Patient fulfills (posts AES key, releases funds)
AES_KEY=0x$(head -c 32 /dev/urandom | xxd -p | tr -d '\n')
stack-cli market fulfill 0 $AES_KEY --signer alice

# 7. Verify final state
stack-cli market get-listing 0    # should show "Inactive"
stack-cli market get-order 0      # should show "Confirmed"
stack-cli account show alice      # balance increased by 5 PAS
stack-cli account show bob        # balance decreased by 5 PAS
```

---

## Adding a New Subcommand

1. Create `cli/src/commands/<name>.rs`:
   - Define an `enum <Name>Action` with `#[derive(Subcommand)]`
   - Implement `pub async fn run(action: <Name>Action, eth_rpc_url: &str) -> Result<(), Box<dyn std::error::Error>>`

2. Register in `cli/src/commands/mod.rs`:
   ```rust
   pub mod <name>;
   ```

3. Register in `cli/src/main.rs`:
   - Add variant to `Commands` enum
   - Add match arm calling `commands::<name>::run(action, &eth_rpc_url).await?`

4. Build: `cargo build -p stack-cli --release`

See `cli/src/commands/market.rs` as the reference implementation (alloy `sol!` macro for ABI, read-only + wallet providers, `deployments.json` loading).

---

## Key Files

| File | Purpose |
|---|---|
| `cli/src/main.rs` | Clap root + subcommand dispatch |
| `cli/src/commands/mod.rs` | Subcommand module registry + `rpc_call` helper |
| `cli/src/commands/market.rs` | MedicalMarket ABI + all market subcommands |
| `cli/src/commands/tx.rs` | Transaction inspection + event decoding |
| `cli/src/commands/contract.rs` | Dev signer resolution (`alice`/`bob`/`charlie`) |
| `deployments.json` | Contract addresses (generated by deploy scripts) |
| `cli/Cargo.toml` | Dependencies: alloy, subxt, clap, serde_json |

---

## Common Issues

| Symptom | Cause | Fix |
|---|---|---|
| `medicalMarket not found in deployments.json` | Contract not deployed | `cd contracts/pvm && npm run deploy-market:local` |
| `JSON-RPC error -32601: Method not found` | Wrong RPC method name | Check alloy's method spelling; use `eth_getTransactionByHash` not `eth_getTransaction` |
| `Listing already has a pending order` | `placeBuyOrder` called twice on same listing | Cancel order or use a different listing |
| `Only the patient can fulfill the order` | Wrong `--signer` for `fulfill` | Must sign with the same account that created the listing |
| `Insufficient payment` | `place-order` value < listing price | alloy reads price from contract automatically — check that listing price is correct |
| All listings show "Active (order pending)" even when fresh | Bug in sentinel check (was `== u64::MAX` instead of `== 0`) | Fixed in market.rs — `getPendingOrderId` returns 0 for "no order" (1-based) |
