---
name: polkadot-composition
description: >-
  Integration patterns and gotchas for composing Polkadot system-chain
  primitives (pallet-multisig, pallet-revive, pallet-identity) via PAPI from
  JS/TS and Solidity contracts on pallet-revive. Trigger: writing PAPI extrinsic
  scripts against Asset Hub / People Chain, wiring pallet-multisig asMulti
  flows, dispatching Revive.call from non-EOA origins, or hitting SCALE/PAPI
  errors like "Runtime entry Tx not found", "inner[tag] is not a function",
  "MaxWeightTooLow", or silent Revive.call reverts.

  Trigger: Load when writing or debugging PAPI-based scripts that submit
  extrinsics to a Polkadot/Asset Hub-like chain, when building pallet-multisig /
  pallet-revive / pallet-identity composition flows, or when the user asks about
  SS58/H160 derivation, Revive.map_account, asMulti weight tuning, or
  typed-vs-unsafe PAPI API.
license: MIT
metadata:
  author: benja
  version: '1.0'
  scope:
    - root
  auto_invoke:
    - Writing or debugging PAPI extrinsic scripts
    - Wiring pallet-multisig asMulti flows
    - Dispatching Revive.call from a multisig or other non-EOA origin
    - Resolving SCALE/PAPI encoding errors on nested RuntimeCall parameters
---

## When to Use

- Writing a Node/TS script that submits extrinsics via `polkadot-api` (PAPI).
- Composing `pallet-multisig.as_multi` or `Utility.batch` or `Sudo.sudo` with an inner call.
- Dispatching `Revive.call` from a non-EOA origin (multisig, proxy, scheduler).
- Debugging: "Runtime entry Tx not found", "inner[tag] is not a function", `MaxWeightTooLow`,
  `ExhaustsResources`, `BadProof`, or an asMulti that "succeeds" but the contract state
  doesn't change.

**Primary reference**: [`docs/product/POLKADOT_INTEGRATION_GOTCHAS.md`](../../docs/product/POLKADOT_INTEGRATION_GOTCHAS.md).
Read the specific finding when a symptom matches — numbered entries correspond to the items
below.

---

## Critical Patterns

### 1. Use `getTypedApi`, never `getUnsafeApi`, when nesting calls

`getUnsafeApi()` can't encode `RuntimeCall` enum parameters (fails with
`TypeError: inner[tag] is not a function`). Always generate local descriptors with
`npx papi add <chainName> -w <wsUrl>` and use the typed API:

```ts
import { createClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws-provider/node";
import { withPolkadotSdkCompat } from "polkadot-api/polkadot-sdk-compat";
import { stack_template } from "@polkadot-api/descriptors";

const client = createClient(withPolkadotSdkCompat(getWsProvider(WS_URL)));
const api = client.getTypedApi(stack_template);
```

### 2. Pass `tx.decodedCall` (not `tx`) when nesting extrinsics

```ts
const inner = api.tx.Revive.call({ dest, value, weight_limit, storage_deposit_limit, data });
const outer = api.tx.Multisig.as_multi({
  threshold,
  other_signatories,            // sorted SS58 array minus sender
  maybe_timepoint: undefined,   // undefined = None; { height, index } = Some
  call: inner.decodedCall,      // NOT inner — Transaction wrapper won't encode
  max_weight,
});
```

### 3. `Revive.map_account()` is required before any Revive.call from a new origin

Silent failure otherwise — the outer extrinsic succeeds, the inner contract call is a no-op,
and state doesn't update. Call `Revive.map_account()` (no args) from each origin that will
later invoke contracts. For a multisig, dispatch it via `asMulti` once as a prep step.

Pattern for a multisig: see `contracts/pvm/scripts/multisig-map-account.ts`.

### 4. Derive dev accounts, don't hardcode SS58

Hardcoded `5FLSigC9...`-style addresses get truncated in agent-generated code. Always derive:

```ts
import { Keyring } from "@polkadot/keyring";
import { cryptoWaitReady } from "@polkadot/util-crypto";

await cryptoWaitReady();
const keyring = new Keyring({ type: "sr25519", ss58Format: 42 });
const alice = keyring.addFromUri(
  "bottom drive obey lake curtain smoke basket hold race lonely fit walk//Alice"
);
```

`keyExtractSuri("//Alice")` alone throws — it needs the full mnemonic+path SURI. Use
`Keyring.addFromUri(mnemonic + path)` and avoid raw crypto primitives.

---

## Decision Tree

```
Composing an inner call into an outer extrinsic?  → getTypedApi + inner.decodedCall
Origin has never called Revive before?            → Revive.map_account() first
Dispatching to a contract from a multisig?        → fund multisig SS58 → map_account via
                                                    asMulti → contract call via asMulti
Hardcoded SS58 in the script?                     → replace with Keyring.addFromUri
Multiple worktrees of same project running nodes? → STACK_PORT_OFFSET=100 for second one
```

---

## Code Examples

### Submitting an extrinsic with a dev signer

```ts
import { getPolkadotSigner } from "polkadot-api/signer";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const kp = keyring.addFromUri(mnemonic + "//Alice") as any;
const signer = getPolkadotSigner(kp.publicKey, "Sr25519", (m) => kp.sign(m));
const result = await tx.signAndSubmit(signer);
// result has txHash, block, ok, events
```

### Tuning `max_weight` for asMulti with a Revive.call inner

Start at `{ ref_time: 30_000_000_000n, proof_size: 2_000_000n }`. If `MaxWeightTooLow`,
double. If `ExhaustsResources`, halve. Inner `REVIVE_CALL_WEIGHT` is ~3B ref_time; asMulti
max_weight must be comfortably above that to cover pallet overhead.

### Computing a multisig's SS58 + H160 (for pallet-revive msg.sender)

```ts
import { createKeyMulti, encodeAddress } from "@polkadot/util-crypto";
import { u8aToHex } from "@polkadot/util";
import { keccak256 } from "viem";

const sorted = [alice.address, bob.address, charlie.address].sort();
const accountId = createKeyMulti(sorted, THRESHOLD);        // 32 bytes
const ss58 = encodeAddress(accountId, 42);
const h160 = "0x" + keccak256(u8aToHex(accountId)).slice(2 + 24);  // last 20 bytes
```

---

## Commands

```bash
# Regenerate descriptors after a runtime change
cd web && npx papi update
# or, for a standalone scripts package:
npx papi add <chainName> -w ws://127.0.0.1:10044

# Start a second local node without colliding with another worktree
STACK_PORT_OFFSET=100 ./scripts/start-local.sh
./bin/eth-rpc --node-rpc-url ws://127.0.0.1:10044 --rpc-port 8645 --rpc-cors all &

# ts-node against a standalone script (skip strict types for one-off helpers)
npx ts-node --transpile-only scripts/<name>.ts
```

---

## Resources

- Gotchas log (symptom → cause → fix → upstream suggestion):
  [`docs/product/POLKADOT_INTEGRATION_GOTCHAS.md`](../../docs/product/POLKADOT_INTEGRATION_GOTCHAS.md)
- Canonical examples in this repo:
  - `contracts/pvm/scripts/compute-multisig.ts` — SS58 + H160 derivation
  - `contracts/pvm/scripts/fund-multisig.ts` — fund a derived SS58 from Alice
  - `contracts/pvm/scripts/multisig-map-account.ts` — prep step for contract calls
  - `contracts/pvm/scripts/multisig-add-medic.ts` — full asMulti → Revive.call flow
