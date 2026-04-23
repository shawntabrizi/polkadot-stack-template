# Running the marketplace demo

Three flavors, depending on how real you want the on-chain part to feel:

| Mode | Chain + contracts | Statement Store | Funding | When to use |
|---|---|---|---|---|
| **Pure local** | zombienet | same zombienet | zero (dev accounts pre-funded) | Fastest iteration; verify crypto stack end-to-end without internet. |
| **Hybrid** | Paseo testnet | local zombienet | Paseo faucet for contract-side accounts; none for Statement Store | Public-chain theatrics for demo (Subscan links, real finality) without Paseo People Chain's `noAllowance` wall. |
| **Pure Paseo** | Paseo testnet | Paseo People Chain | Paseo faucet + `noAllowance` fix | Not fully working today — see `POLKADOT_INTEGRATION_GOTCHAS.md` #15. |

The flow itself (Medic → Patient → Researcher) is identical across modes. Only the backends differ.

---

## Prerequisites (one-time)

```bash
git clone <your fork> && cd polkadot-stack-template
( cd web && npm install )               # applies patch-papi-cli + patch-sdk-statement
( cd contracts/pvm && npm install )
./scripts/download-sdk-binaries.sh      # polkadot-omni-node, zombienet, eth-rpc, chain-spec-builder
```

Node 22 LTS. Linux or macOS. 10–15 GB free disk for the zombienet data dir.

---

## Mode 1 — Pure local (recommended for first run)

Everything on the template's zombienet. Dev accounts (Alice / Bob / Charlie) are pre-funded and auto-mapped.

### Important: `.env.local` overrides the frontend

`start-all.sh` brings up the backends locally, but the frontend reads `web/.env.local`
at **build/dev-server startup**. If that file contains `VITE_WS_URL` or `VITE_ETH_RPC_URL`
pointing at Paseo (the template ships `.env.local.example` wired for Paseo), the browser
will talk to Paseo regardless of what the local node is doing. That's Mode 2 (hybrid), not
Mode 1.

**For pure-local, comment out or delete** the Paseo overrides before running `start-all.sh`:

```bash
# web/.env.local — for pure-local mode, these MUST be unset/commented
# VITE_WS_URL=wss://asset-hub-paseo.dotters.network
# VITE_ETH_RPC_URL=https://services.polkadothub-rpc.com/testnet
# VITE_STATEMENT_STORE_WS_URL=ws://127.0.0.1:9944
```

With those commented out, `getDefaultWsUrl()` falls back to `ws://localhost:9944` on any
localhost hostname — which is what Mode 1 needs.

### Start

```bash
./scripts/start-all.sh
```

The script takes ~2 min on a warm machine. It does, in order:

1. Build the runtime
2. Generate the chain spec
3. Compile contracts via resolc
4. Start zombienet (relay + parachain collator on `ws://127.0.0.1:9944`)
5. Start eth-rpc on `http://127.0.0.1:8545`
6. **`set-deployments --local`** — deploys `MedicalMarket` + `MedicAuthority`, maps the multisig, **maps Alice/Bob/Charlie** so the frontend can dispatch `Revive.call` as them
7. **`bootstrap-demo-medic`** — adds Alice to the verified-medic set via the multisig so the `✓ medic-verified` chip lights up
8. Build the CLI
9. Start Vite on `http://localhost:5173`

Open the frontend at `http://localhost:5173`. The account picker will show `Alice / Bob / Charlie` — no wallet extension needed.

Walk through the demo flow (see "[Demo flow](#demo-flow)" below).

### Reset

```bash
Ctrl-C          # stop start-all.sh (tears down zombienet)
./scripts/start-all.sh   # re-run — fresh state
```

Every restart wipes chain state including the dev-account `map_account`. `set-deployments --local` re-maps them automatically on each start-all.

---

## Mode 2 — Hybrid (Paseo contracts + local Statement Store)

Contracts on Paseo testnet, ciphertext delivery via your local zombienet. Requires:

- Paseo-funded accounts imported into Talisman / SubWallet (for the contract-side wallet).
- A running local zombienet for the Statement Store backend.

### Set up `web/.env.local`

```bash
VITE_WS_URL=wss://asset-hub-paseo.dotters.network
VITE_ETH_RPC_URL=https://services.polkadothub-rpc.com/testnet
VITE_STATEMENT_STORE_WS_URL=ws://127.0.0.1:9944   # hybrid mode: routes Statement Store RPCs to local

# Demo accounts on Paseo — fund these H160s at https://faucet.polkadot.io
#   Council-1: 0xF3c5cf6761F625128503b9F2Cc7374679E313a48
#   Council-2: 0x4CEDA1d715B350D29ea42C040aD3462c41756410
#   Medic:     0xFE3aaB5fA283a6EC603452c3669282cf1dEC0C0C
VITE_ACCOUNT_0_PK=0x7d3bff86ad2d95cf68072655012579ea31732dc3f4e4a2e7bd0bcb0721c12614
VITE_ACCOUNT_0_NAME=Council-1
VITE_ACCOUNT_1_PK=0x4686fa95211cb57d0b0c5455948562f8d5b549d94d398114e22b6312e4673fe7
VITE_ACCOUNT_1_NAME=Council-2
VITE_ACCOUNT_2_PK=0x9179b06adb3d28648053fd8fa53b96a03ec40042e58744ba2b7aa6371d4498ae
VITE_ACCOUNT_2_NAME=Medic
```

### Start the two backends

Terminal 1 — local Statement Store backend only:

```bash
./scripts/start-local.sh
# → ws://127.0.0.1:9944 with statement_dump + statement_submit
```

Terminal 2 — frontend:

```bash
cd web && npm run dev
# → http://localhost:5173
```

### Do you need to run `set-deployments -- --testnet`?

Depends on which contracts you want on Paseo:

- **Use the contracts already committed in `web/src/config/deployments.ts`** — skip. The frontend reads the Paseo entry (`medicalMarket: 0xc04f616c…`) directly. Works as long as those contracts still exist on-chain. The marketplace flow (`createListing`, `placeBuyOrder`, `fulfill`) doesn't touch the multisig, so the signatory mismatch with your keystore JSONs doesn't matter — you interact as plain EOAs via `Revive.call` with your funded `.env.local` keys.
- **Deploy your own contracts** (e.g. the committed ones were redeployed elsewhere, or you want to own the `MedicAuthority` admin): run
  ```bash
  npm --prefix contracts/pvm run set-deployments -- --testnet
  ```
  once. Requires keystore JSONs (`Council1.json`, `Council2.json`, `Medic.json`) next to the repo root + a funded deployer account (`VITE_ACCOUNT_0_PK`). Rewrites both `deployments.json` and `web/src/config/deployments.ts`.

For a first-run demo, just skip it and use the committed addresses.

### Each Paseo account needs `Revive.map_account()` once

Either click the **Propose Revive.map_account** button on the governance dashboard (needs 2-of-3 signatures for the multisig; run `npm run set-deployments -- --testnet` first to register the multisig), or submit any `Revive.call` from that account — pallet-revive auto-triggers on first use. Without this, the contract's `msg.sender` derivation is wrong and listings/orders misattribute.

### Notes

- Both participants (patient + researcher) must reach the same local Statement Store. For a two-machine demo, run `start-local.sh` on one machine and tunnel port 9944 with Cloudflare Tunnel / ngrok, then point the other machine's `VITE_STATEMENT_STORE_WS_URL` at the tunnel URL.
- Local Statement Store state is ephemeral — restart the local node and past ciphertext is gone. The on-chain `ciphertextHash` in the Paseo contract is then orphaned; the decrypt flow shows "patient hasn't uploaded yet". You'd re-fulfill (same Paseo contract, fresh local statement) — the contract's `fulfill` is single-shot per order, so only an unfulfilled order can be re-fulfilled. Phase 5.3 will add a reclaim window to recover stuck escrows.

---

## Mode 3 — Pure Paseo (not working today)

Kept here for honesty. Trying to run the full flow against Paseo People Chain hits
`{status: "rejected", reason: "noAllowance"}` on `statement_submit`. Resolution paths and
the parked raw-WebSocket rewrite are in `POLKADOT_INTEGRATION_GOTCHAS.md` entry #15.

---

## Demo flow

Independent of mode. Each step lives on its own page of the frontend.

### 1. Medic signs a record (`/medic`)

- Account picker on this page (top card) chooses which sr25519-derived EVM key acts as "the medic".
- Drop a flat JSON record. Example:
  ```json
  { "hemoglobin": "14.2", "whiteBloodCells": "6.0", "platelets": "245", "hematocrit": "41", "note": "annual checkup" }
  ```
- Fill the header (title, record type, date, facility) — these become the *public* on-chain listing metadata researchers filter by.
- **Continue → Encode & Compute Commits** — computes Poseidon header/body/record commits.
- **Continue → Sign Commit with Wallet** — EdDSA-Poseidon over BabyJubJub. Pure local crypto; no chain interaction yet.
- **Download (.json)** — the signed package. Give it to the patient (email / copy-paste).

### 2. Patient creates a listing (`/patient`)

- Switch to a patient account (`Alice` in local mode; the "Medic" EVM account in hybrid if you funded that one).
- Drop the signed JSON from step 1.
- Set a price in PAS (e.g. `0.5`).
- **List Record** — signs + submits `MedicalMarket.createListing(headerInput, headerCommit, bodyCommit, medicPk, sig, price)`. Takes ~20–40s on local (parachain finality), maybe 30s on Paseo.

The listing appears under **My Listings** once the tx lands.

### 3. Researcher places a buy order (`/researcher`)

- Switch account to a researcher (`Bob` in local mode; a different funded account on Paseo).
- Refresh the listings. The one you just created shows `✓ medic-verified` because the off-chain pre-purchase check (recompute `headerCommit` + verify medic EdDSA signature against the listed `medicPk`) passed.
- **Buy for N PAS** — pays the price into contract escrow and registers the buyer's BabyJubJub pubkey for ECDH.
- The order shows under **My Orders** as `Pending`.

### 4. Patient fulfills (`/patient`)

- Switch back to the patient account.
- Each active listing with a pending order shows an **Encrypt + Fulfill (Order #N)** button.
- Click it. The flow:
  1. Read the buyer's ECDH pubkey from the on-chain order.
  2. ECDH + Poseidon stream cipher encrypts the record body in-browser.
  3. `statement_submit` pushes the 32×32-byte ciphertext to the Statement Store (local in pure-local + hybrid modes).
  4. `MedicalMarket.fulfill(orderId, ephPk, ciphertextHash)` releases the escrowed payment on-chain.

Takes 15–40s total. The order flips to `Confirmed`.

### 5. Researcher decrypts (`/researcher`)

- Switch back to the researcher account.
- The order card now shows **Decrypt & View** instead of "Cancel & Refund".
- Click it. The flow:
  1. Read the on-chain `Fulfillment` (ephPk + ciphertextHash).
  2. Fetch ciphertext bytes from the Statement Store by hash (`statement_dump` on local, `statement_subscribeStatement` on Paseo).
  3. Verify blake2b-256 of the bytes matches the on-chain hash.
  4. ECDH shared secret + Poseidon stream cipher decode.
  5. Re-compute `bodyCommit` from the recovered plaintext and check equality with the listing's on-chain `bodyCommit`. If they match, `✓ bodyCommit` green.
  6. Medic EdDSA signature validity is carried over from the listing's pre-purchase check; shown as `✓ medic signature`.

The decrypted record renders as a table. Byte-identical to the JSON the medic signed in step 1.

---

## Troubleshooting

If something goes wrong mid-flow, these are the knobs:

- **"Cache miss — re-fetching from Statement Store..." stuck forever** → SDK TDZ bug, should be patched by `postinstall`. On an existing install, restart Vite with `--force` (entry #17 in the gotchas doc).
- **"patient hasn't uploaded the ciphertext yet" on decrypt** → either the patient hasn't fulfilled, or the local Statement Store was restarted between fulfill and decrypt. Re-fulfill if the order is still pending; if `Confirmed`, you've hit the orphaned-hash case (Phase 5.3 will fix).
- **`✗ Error: { type: "Invalid", value: { type: "Payment" } }`** on any extrinsic → signer has zero PAS on the target chain. Top up at https://faucet.polkadot.io for Paseo. On local, pre-funded dev accounts only work after `map_account` has landed (auto-run by `start-all.sh` step 6).
- **Medic-verified chip shows `✗ unverified`** → either the header bytes don't hash to the listed `headerCommit` (frontend / contract ABI drift), or the published `medicPk` isn't actually what signed the record. Re-sign in the medic page with the same account and re-create the listing.
- **Contract address field shows the wrong deployment** → `web/src/config/deployments.ts` is auto-written by `set-deployments.ts`. Re-run it to recompute. For Paseo that's `npm --prefix contracts/pvm run set-deployments -- --testnet`; for local it's invoked by `start-all.sh`.

Everything else — SCALE errors, `BadProof`, `MaxWeightTooLow`, `AccountAlreadyMapped`, etc. — see `POLKADOT_INTEGRATION_GOTCHAS.md`. Every symptom we've hit during development has a numbered entry there.
