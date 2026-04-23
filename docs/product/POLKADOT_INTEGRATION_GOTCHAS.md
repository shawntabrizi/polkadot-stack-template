# Polkadot Integration Gotchas

A running log of non-obvious issues we hit while composing Polkadot system-chain primitives
(pallet-multisig, pallet-revive, pallet-identity, Asset Hub) with PAPI and Solidity contracts
compiled via `resolc`. Written for future-us: skim this before debugging a weird
SCALE/PAPI/pallet-revive error, and add new findings as they surface.

Scope: issues that are *not* in the current official docs, or where the error message sends
you in the wrong direction. Routine bugs that are adequately documented elsewhere don't
belong here.

## How to use this doc

- **You just hit a confusing error**: `Ctrl-F` the symptom. Each entry leads with the exact
  error string where possible.
- **You figured something out the hard way**: add a new entry. Follow the template. Keep
  entries small and specific.
- **You want to raise an upstream improvement**: the "Upstream improvement" line at the end
  of each entry is the grep target. Collect those when opening issues / RFCs.

Entry template:

```
### N. One-line symptom (include the error text if any)

**Layer**: <pallet / PAPI / @polkadot-* / dev tooling / template>
**Hit on**: <date or commit>

**Symptom**: what you see.

**Cause**: what's actually going on.

**Fix / workaround**: concrete steps or code.

**Upstream improvement** (optional): what could change upstream to prevent this.
```

---

## Findings

### 1. `Runtime entry Tx(Multisig.as_multi) not found` — PAPI connected to the wrong node

**Layer**: dev tooling

**Symptom**: PAPI errors with `Runtime entry Tx(<Pallet>.<call>) not found` even though you
just added the pallet to the runtime and rebuilt.

**Cause**: another `zombienet` / `start-all.sh` process from a *different* worktree is still
listening on the default ports (9944 substrate RPC, 8545 eth-rpc). `papi update` and your
scripts silently connect to that node, which is running an older runtime without the new
pallet. The metadata you fetched is stale with respect to the branch you're building.

**Fix / workaround**:

- Before starting a second node, check: `ps aux | grep -E "polkadot-omni-node|zombienet"`
- Run the second node on an offset port: `STACK_PORT_OFFSET=100 ./scripts/start-local.sh` →
  substrate RPC on 10044, eth-rpc on 8645.
- Update `web/.papi/polkadot-api.json` `wsUrl` to match the offset port *before* running
  `npx papi update` — otherwise it still pulls from the old node.
- Pass `SUBSTRATE_RPC_WS=ws://127.0.0.1:10044` and `ETH_RPC_HTTP=http://127.0.0.1:8645` to any
  scripts that connect.

**Upstream improvement**: `start-local.sh` could detect port conflicts and abort with a clear
message instead of silently skipping. A `STACK_PORT_OFFSET=auto` mode that picks the first
free block would remove this class of bug.

---

### 2. `pallet-multisig::Config` requires `BlockNumberProvider` in stable2512-3

**Layer**: runtime (SDK version gotcha)

**Symptom**:
```
error[E0046]: not all trait items implemented, missing: `BlockNumberProvider`
```
when compiling a runtime that adds `impl pallet_multisig::Config for Runtime`.

**Cause**: `pallet-multisig` gained a `BlockNumberProvider` associated type somewhere between
stable2407 and stable2512. Older tutorials and copy-paste `Config` impls omit it.

**Fix / workaround**: add `type BlockNumberProvider = System;` to the `Config` impl.

**Upstream improvement**: the polkadot-sdk repo's `examples/` runtime could include
`pallet-multisig` with the current Config so copy-paste works. The SDK release notes could
also flag associated-type additions to public `Config` traits as a mild API break.

---

### 3. `start-local.sh` does not start `eth-rpc` — only `start-all.sh` does

**Layer**: dev tooling

**Symptom**: zombienet is up, substrate RPC responds on 9944/10044, but port 8545/8645 is
dead. Hardhat deploys fail with `connect ECONNREFUSED`.

**Cause**: `start-local.sh` is the "relay-backed network with no contracts or frontend" path
(its own banner says so). `start-all.sh` is the full-stack path that also spawns `eth-rpc`
and vite. If you only need the chain + contracts, you still need eth-rpc.

**Fix / workaround**: after `start-local.sh` is up, start eth-rpc manually pointing at the
right substrate RPC:

```bash
./bin/eth-rpc --node-rpc-url ws://127.0.0.1:10044 --rpc-port 8645 \
  --no-prometheus --rpc-cors all -d /tmp/eth-rpc-<session> &
```

**Upstream improvement**: `start-local.sh` could accept a `--with-eth-rpc` flag, or the
banner could link to a short "here's how to run eth-rpc yourself" snippet.

---

### 4. PAPI `getUnsafeApi()` can't SCALE-encode nested `RuntimeCall` enums

**Layer**: PAPI

**Symptom**:
```
TypeError: inner[tag] is not a function
  at scale-ts/src/codecs/Enum.ts:56
  at substrate-bindings/src/codecs/scale/Variant.ts:51
```
when submitting `Multisig.as_multi`, `Utility.batch`, `Sudo.sudo`, or any extrinsic that
takes another `RuntimeCall` as a parameter, via `client.getUnsafeApi()`.

**Cause**: `UnsafeApi` has no metadata-driven codec for the `RuntimeCall` enum. The generic
encoder expects a tagged-union shape it can't synthesize without the typed descriptor.

**Fix / workaround**: generate descriptors for your chain and use `client.getTypedApi(<desc>)`
instead:

```bash
npx papi add stack_template -w ws://127.0.0.1:10044
```

then in code:

```ts
import { stack_template } from "@polkadot-api/descriptors";
const api = client.getTypedApi(stack_template);
```

The typed API encodes nested calls correctly.

**Upstream improvement**: PAPI could either (a) make `UnsafeApi` fall back to a generic
SCALE-enum encoder keyed on metadata it already has, or (b) throw a much clearer error like
`"RuntimeCall encoding requires a typed descriptor — run papi add <chainName>"`.

---

### 5. Pass `tx.decodedCall`, not `tx`, when nesting extrinsics

**Layer**: PAPI

**Symptom**: after fixing #4, still get SCALE encoding errors — or the call hash you compute
doesn't match the one stored on-chain.

**Cause**: `api.tx.<Pallet>.<method>(...)` returns a `Transaction<...>` object. Extrinsics
that accept a `RuntimeCall` parameter want the *decoded call enum value*, not the Transaction
wrapper. PAPI exposes this on `.decodedCall`.

**Fix / workaround**:

```ts
const inner = api.tx.Revive.call({ ... });
const outer = api.tx.Multisig.as_multi({
  ...
  call: inner.decodedCall,  // not `inner`
  ...
});
```

**Upstream improvement**: PAPI could accept either a `Transaction` or its `decodedCall` at
call sites that take `RuntimeCall`, and internally coerce.

---

### 6. `pallet-revive` needs `map_account()` even when the H160 matches

**Layer**: pallet-revive

**Symptom**: `Multisig.as_multi` succeeds on-chain (outer tx included in a block), but the
inner `Revive.call(contract, addMedic, ...)` *silently* has no effect. Contract state doesn't
update. No revert error bubbles up. `System.Events` for the block shows the multisig
executed; the contract state read afterwards returns the pre-call values.

**Cause**: even though we derive the multisig's H160 off-chain as
`keccak256(AccountId32)[12..]` (matching pallet-revive's `msg.sender` derivation per commit
`7ebed6e`), the account must also be **registered** via `Revive.map_account()` before it can
originate a contract call. Without the mapping, `msg.sender` inside the contract is a different
address (or the call fails before reaching the EVM bytecode), so `onlyAuthority` checks fail.
Crucially: this failure is not surfaced as a dispatch error — the Revive.call extrinsic
succeeds from pallet-multisig's perspective, but the contract invocation is effectively a
no-op / silent revert.

**Fix / workaround**: dispatch `Revive.map_account()` via `asMulti` *once* before any
contract-calling asMulti. See
`contracts/pvm/scripts/multisig-map-account.ts` for the pattern:

```ts
const inner = api.tx.Revive.map_account();  // no args
const outer = api.tx.Multisig.as_multi({
  threshold, other_signatories, maybe_timepoint, call: inner.decodedCall, max_weight,
});
```

Fund the multisig account first (it needs balance to pay Revive + storage deposit). The
mapping is permanent; you only do this once per multisig (or per account you want to use as a
contract caller).

**Dev accounts follow the same rule**: Alice / Bob / Charlie each need `Revive.map_account()`
called once before the frontend can dispatch `Revive.call` as them from the dashboard.
Otherwise `eth_getBalance` returns zero for their H160 (substrate balance is hidden behind
the missing mapping), and any contract-side check against `msg.sender` sees a derivation
that doesn't match. The zombienet in `start-all.sh` is ephemeral — every restart wipes the
mapping. Since 2026-04-22, `contracts/pvm/scripts/set-deployments.ts::mapDevAccountsLocal`
(invoked by step [6/9] of `start-all.sh`) handles this automatically for all three dev
accounts; manually-run flows that skip set-deployments still need to map the accounts by
hand.

**Upstream improvement**:

- pallet-revive could auto-map on first call from an unmapped AccountId (it already knows the
  derivation rule), or emit an explicit event like
  `Revive.CallFromUnmappedAccount { account, derived_h160 }` so the failure is debuggable from
  block events.
- Better still: pallet-revive could surface an extrinsic-level error when the origin's
  msg.sender derivation wouldn't match its mapped H160, instead of silently dispatching a
  no-op.
- Docs on `wiki.polkadot.network` for pallet-revive / Asset Hub contracts should have a
  prominent "map_account first" section. This is the #1 footgun for anyone coming from EVM.

---

### 7. `pallet-multisig.as_multi` — `MaxWeightTooLow` vs. `ExhaustsResources` is a narrow window

**Layer**: pallet-multisig weight tuning

**Symptom**:
- Too low: `Multisig.MaxWeightTooLow` dispatch error on the second signer (the one reaching
  the threshold — the first signer never executes the inner call, so it doesn't check).
- Too high: `Invalid(ExhaustsResources)` — the transaction can't fit in a block's weight
  budget.

**Cause**: `max_weight` passed to `as_multi` is bounded below by pallet-multisig's estimated
weight for the inner call, and bounded above by the block weight limit. Inner `Revive.call`
weight includes pallet overhead plus the `gas_limit` you pass into Revive.call itself.

**Fix / workaround**: for a small Revive.call to a minimal contract function (e.g. a mapping
set + event emit), these values work on the stack-template runtime:

```ts
const MAX_WEIGHT = {
  ref_time: 30_000_000_000n,     // 30 billion picoseconds
  proof_size: 2_000_000n,        // 2 MB
};
```

The inner `REVIVE_CALL_WEIGHT` is smaller (around 3B ref_time) — `max_weight` needs to be
comfortably *above* that to account for pallet-multisig + pallet-revive extrinsic overhead.
Start at 30B; if you see `MaxWeightTooLow`, double; if you see `ExhaustsResources`, halve.

**Upstream improvement**: PAPI (or a companion tool) could expose a dry-run / weight-estimate
API that returns the required `max_weight` for a given inner call. Today you guess-and-check.

---

### 8. `createKeyMulti` silently accepts truncated SS58 addresses and produces a wrong multisig

**Layer**: @polkadot/util-crypto / dev ergonomics

**Symptom**: `Error: Decoding <addr>: Invalid decoded address length` when one of the
signatories is a copy-pasted SS58 that's a few characters short (e.g.
`5FLSigC9HGRKVhB8HqmzZFfvPeP7qUXMr2kfzpUkpisMVEM` — a truncated Charlie).

**Cause**: SS58 addresses are 48 chars for 32-byte AccountIds at prefix 42. Copy-paste from
tutorials/AI-agent output frequently truncates by a few chars. util-crypto *does* catch it,
but only when you feed the bad address into `createKeyMulti` — hardcoded constants pass
syntactic checks in code review.

**Fix / workaround**: don't hardcode dev SS58 addresses. Derive them from the canonical dev
mnemonic at script start:

```ts
import { Keyring } from "@polkadot/keyring";
import { cryptoWaitReady } from "@polkadot/util-crypto";

await cryptoWaitReady();
const keyring = new Keyring({ type: "sr25519", ss58Format: 42 });
const alice = keyring.addFromUri("bottom drive obey lake curtain smoke basket hold race lonely fit walk//Alice");
// alice.address is guaranteed correct
```

Corollary: `keyExtractSuri("//Alice")` on its own throws `Unable to match provided value to a
secret URI`. The full SURI (mnemonic + path) is required. Using `Keyring.addFromUri(mnemonic +
derivePath)` sidesteps this entirely.

**Upstream improvement**: `@polkadot/keyring` could export canonical dev-account constants
(`Keyring.devAlice`, etc.) so no script needs to hardcode or re-derive.

---

### 9. `@polkadot/keyring` pulls a mismatched `@polkadot/util` version

**Layer**: npm packaging

**Symptom**:
```
@polkadot/util has multiple versions, ensure that there is only one installed.
  cjs 13.5.9   node_modules/@polkadot/util/cjs
  cjs 14.0.3   node_modules/@polkadot/keyring/node_modules/@polkadot/util/cjs
```
printed on every invocation. Not fatal, just noisy.

**Cause**: `@polkadot/keyring` depends on `@polkadot/util@14.x`, but our project had
`@polkadot/util@13.x` pinned transitively via polkadot-api or similar. npm installs both,
nested, and the runtime detects the mismatch.

**Fix / workaround**:
- `npm dedupe` to consolidate where possible
- pin a compatible major across direct deps
- ignore the warning if WASM init still succeeds (it usually does)

**Upstream improvement**: `@polkadot/*` packages could relax peer-dep version ranges, or the
runtime check could be quieter when the mismatch is minor-version-only.

---

### 10. PAPI `getTypedApi` block queries hit `BlockNotPinnedError`

**Layer**: PAPI

**Symptom**:
```
BlockNotPinnedError: Block 0x... is not pinned (storage)
```
when calling `api.query.System.Events.getValue({ at: blockHash })` for a past block.

**Cause**: PAPI's default chain-head subscription only pins recent blocks. Querying a block
that's been "unpinned" requires using an archive RPC or re-requesting the block.

**Fix / workaround**: for event inspection scripts, query the **current** head instead (just
call `.getValue()` without `at:` right after a tx finalizes), or subscribe to
`client.finalizedBlock$` and read events off the subscription. For old-block inspection, use
`chain_getBlockHash` + `state_getStorage` via raw RPC.

**Upstream improvement**: a simple "get events from block hash" helper that handles
pinning/unpinning transparently would save everyone writing this from scratch.

---

### 11. Polkadot-stack-template's local runtime doesn't include `pallet-multisig` by default

**Layer**: template

**Symptom**: the local parachain is billed as "Asset Hub mirror" but is missing pallets that
ship in the real Asset Hub runtime (multisig being the obvious one).

**Cause**: the template started minimal; pallets were added as-needed.

**Fix / workaround**: add pallets to `blockchain/runtime/Cargo.toml` (via the `polkadot-sdk`
umbrella crate feature list — `"pallet-multisig"` is enough; std / benchmarks / try-runtime
flow through the umbrella) plus `impl Config` in `blockchain/runtime/src/configs/mod.rs` and
a `construct_runtime!` entry in `lib.rs`. Rebuild runtime, regenerate chain spec (delete
`blockchain/chain_spec.json`), restart zombienet, `cd web && npx papi update`.

**Upstream improvement**: the template could include `pallet-multisig`, `pallet-proxy`,
`pallet-utility`, `pallet-scheduler`, `pallet-preimage`, and `pallet-recovery` pre-wired —
these are all on Asset Hub and ubiquitously useful. A `--preset asset-hub-like` flag on the
template generator would be ideal.

---

### 12. Back-to-back `signAndSubmit` from the same PAPI client → `Invalid { BadProof }`

**Layer**: PAPI signing / mortal era

**Symptom**: scripts that submit multiple extrinsics from the same keypair in one process
(e.g. Alice proposes, Bob approves, Alice proposes again — or bootstrap's fund → approve →
propose sequence) get the first 1–2 submissions through, then fail with `{ type: "Invalid",
value: { type: "BadProof" } }` on a later submission. Keypair, nonce, and calldata all look
correct, and re-running the script a moment later usually gets further before failing at a
similar point. The `addMedic(Alice)` step in `bootstrap-demo-medic.ts` was hitting this
every run — explains why Alice was silently not being verified after `start-all`.

**Cause**: PAPI's default signing mode is **mortal era, period 64**, and `_papi.ts` signs
with `{ at: "best" }`. The era block hash is baked into the signed `additionalSigned` bytes.
On a single-node local chain, the "best" view occasionally drifts between consecutive signs
(chainHead subscription can briefly report a block that the node later supersedes), so by
the time the node validates the 2nd/3rd extrinsic, the era block hash no longer matches
what the node has canonically. The signature is rejected as `BadProof` — not because the
sr25519 signature itself is wrong, but because the payload the node reconstructs differs
from the one PAPI signed.

Not a nonce bug (`Invalid { Stale }` would surface instead), not a keyring WASM bug (see
#9; sigs verify fine in isolation), not a contract/Revive issue — strictly the extrinsic
extra.

**Fix / workaround**: sign with **immortal era** for back-to-back script submissions.
`scripts/_papi.ts::submitExtrinsic` accepts an `opts: { mortal?: boolean }` parameter; pass
`{ mortal: false }` from any caller that issues multiple signs in one process:

```ts
await submitExtrinsic(tx, signer, { mortal: false });
```

Immortal era skips the era-block-hash lookup entirely. The trade-off — an immortal tx is
replayable across the chain's lifetime — is fine for dev scripts but NOT for production /
end-user signing (Nova Wallet, browser-side patient flows). Production code stays on the
default mortal era; this workaround is for Node-side automation only.

**Where this bites**:
- `contracts/pvm/scripts/test-multisig-flow.ts` — the integration test; uses the helper via
  the module with `{ mortal: false }`. Green end-to-end with 17 assertions.
- `contracts/pvm/scripts/bootstrap-demo-medic.ts` — same root cause, one-line fix pending.
  Until it lands, re-running the test or `bootstrap-demo-medic:local` one more time after a
  failed run still advances the state (whatever was already approved stays approved).

**Upstream improvement**: PAPI's `signAndSubmit` could refetch the best-block reference
immediately before signing, or fall back to immortal when the user doesn't specify
mortality. As of polkadot-api@1.x the default is mortal+period-64 and the caller is
responsible for era management.

---

### 13. `papi generate` prints TS errors every startup and `generated.json` never updates

**Layer**: dev tooling (`@polkadot-api/cli@0.18.1`)

**Hit on**: 2026-04-20 (polkadot-api@1.23.3, @polkadot-api/cli@0.18.1, TypeScript 5.x)

**Symptom**:
```
Compilation started
error TS5107: Option 'moduleResolution=node10' is deprecated and will stop functioning
  in TypeScript 7.0. Specify compilerOption '"ignoreDeprecations": "6.0"' to silence.
.papi/descriptors/src/index.ts(13,18): error TS7053: Element implicitly has an 'any'
  type because expression of type 'string' can't be used to index type
  '{ "0xb50def...": IDescriptors; }'.
Compilation done with 2 errors
```

Appears on every `start-all.sh` run after the chain spec is regenerated (new genesis/code hash).

**Cause**: the CLI's internal `compileCodegen()` runs two steps:

1. **tsup bundle** (CJS + ESM) — succeeds; produces correct `dist/` files.
2. **tsc declaration pass** — fails with two bugs hardcoded in `@polkadot-api/cli/dist/chunk-UMZZTPR7.js`:
   - `moduleResolution: "node"` is the deprecated `node10` alias in TS 5.x; TS emits TS5107.
   - The generated `src/index.ts` template accesses `metadatas[codeHash]` where `metadatas`
     has a narrow literal-keyed type — TypeScript raises TS7053 with `noImplicitAny`.

When the declaration pass fails, `compileCodegen` returns `false` and the `tagGenerated()` call
that writes `generated.json` is skipped. On the next startup, papi sees the metadata hash has
changed (new chain spec) and regenerates again — same errors, same outcome, loop forever.

The bundles are correct and `papi generate` exits 0 regardless, so the web app works fine.
The sole practical impact is the noise + the ~200 ms regeneration on every startup.

**Fix / workaround**: patch the compiler option lines in the CLI bundle — replace
`moduleResolution: "node"` with `"bundler"` (compatible with `module: "esnext"`, allows bare
imports without `.js` extensions) and add `noImplicitAny: false`.
Do NOT use `"node16"`: it requires explicit `.js` extensions on every relative import, which
the papi-generated source doesn't have — trading two errors for sixteen.

`web/scripts/patch-papi-cli.mjs` applies this automatically; it is invoked by the
`postinstall` hook in `web/package.json` so it re-applies after every `npm install`:

```js
// web/package.json
"postinstall": "node scripts/patch-papi-cli.mjs && npm run codegen"
```

**Upstream improvement**: `@polkadot-api/cli` should switch to `moduleResolution: "bundler"`
and fix the generated `src/index.ts` template to cast
`metadatas[codeHash as keyof typeof metadatas]`. Fixed in CLI versions > 0.18.1 (verify
before removing the patch script when upgrading `polkadot-api`).

---

### 14. Blake2F precompile (0x09) exists on pallet-revive but is the compression function, not a full blake2b-256

**Layer**: pallet-revive precompiles
**Hit on**: 2026-04-22

**Symptom / question**: can a Solidity contract on PVM verify or derive `pallet-multisig`
addresses on-chain? The assumption is that blake2 is unavailable in EVM/PVM, making it impossible.

**Cause**: pallet-revive ships EIP-152 (`blake2F`) at precompile address `0x09`. It gives
you the **blake2b round compression function F**, not a ready-made `blake2b_256(data)`.
`pallet-multisig` derives its account ID as:

```
blake2_256( "modlpy/utilisuba" ++ SCALE::encode(sorted_AccountIds) ++ SCALE::encode(threshold) )
```

To reproduce this in Solidity you would also need:
- A Solidity wrapper that implements blake2b initialisation, padding, and iterates F — these
  exist (Zcash-era libs) but are non-trivial.
- A SCALE encoder for `Vec<[u8;32]>` built from byte buffers in Solidity.

**Fix / workaround**: avoid the computation entirely. Store the current multisig H160 as a
single `owner` address in the contract. To rotate signatories, compute the new multisig H160
off-chain, then have the current multisig call `transferOwnership(newH160)`. The contract
needs no knowledge of blake2 or SCALE.

**Upstream improvement**: a pallet-revive host function that exposes `blake2_256(bytes)` 
directly (not the F round) would make on-chain multisig address derivation trivial and unlock
other substrate-native hash use cases.

---

### 15. `@novasamatech/sdk-statement` `getStatements()` — TDZ bug: `Cannot access 'unsubscribe' before initialization`

**Layer**: @novasamatech/sdk-statement (`v0.6.0`)
**Hit on**: 2026-04-22

**Symptom**:
```
Error: Cannot access 'unsubscribe' before initialization
```
thrown from inside the Statement Store SDK when the researcher clicks **Decrypt & View**
(or any other path that resolves a statement by hash via `fetchStatementByHash`). The error
fires intermittently — warm caches / small statement counts make it more likely — and kills
the decrypt flow before any data is returned.

**Cause**: classic temporal-dead-zone bug in
`node_modules/@novasamatech/sdk-statement/dist/statement-sdk.js:11`:

```js
const unsubscribe = api.subscribeStatement(
  filter,
  (event) => {
    ...
    if (event.data.remaining === 0) {
      unsubscribe();   // ← TDZ if this runs before the const is assigned
      resolve(statements);
    }
  },
  (error) => { unsubscribe(); reject(error); },
);
```

The node flushes its cached batch the moment the subscription is registered. On local +
People chain with a small statement count, `onMessage` fires **synchronously during the
subscribe call**, before the `const unsubscribe = ...` assignment completes — so the
handler's `unsubscribe()` reference is still in TDZ and throws.

**Fix / workaround**: don't use `createStatementSdk(...).getStatements(...)`.

The first attempted fix — keeping `@novasamatech/statement-store`'s `createLazyClient` +
`getSubscribeFn()` and only hoisting the unsubscribe ref — dodges the TDZ bug but surfaces a
*different* failure: a `SyntaxError: "[object Object]" is not valid JSON` thrown from one of
the many `JSON.parse` layers inside the polkadot-api WS stack (`raw-client`, `follow-enhancer`)
when a notification payload doesn't match what they expect. The polkadot-api WS provider also
opens an unwanted `chainHead_v1_follow` side-subscription that's pure overhead for a one-shot
statement fetch.

The robust approach is to drive the subscription over a **plain `WebSocket`**, JSON-encode
requests by hand, and only decode batch payloads with the exported `statementCodec`. No
substrate-client, no lazyClient, no ws-provider.

**Status on master** (as of 2026-04-22, end of session):

- **TDZ bug is fixed via postinstall patch**: `web/scripts/patch-sdk-statement.mjs` rewrites
  `node_modules/@novasamatech/sdk-statement/dist/statement-sdk.js` at install time to hoist
  the unsubscribe through a ref object. Wired into `web/package.json` postinstall alongside
  `patch-papi-cli.mjs`. Sentinel-guarded (idempotent, fails loudly if upstream changes shape).
- **`_sdkFetch` prefers `statement_dump`** (HTTP POST) when the node exposes it and falls
  back to the patched SDK subscribe path otherwise — see entry #16 below for why this is
  required. The SDK submission path (`_rawSubmit`) is unchanged; it still uses the template's
  original `{proof, data}` 2-field shape, which works on local but gets silently dropped on
  Paseo (see "Raw `statement_submit` shape" below).
- **The raw-WebSocket submission rewrite remains parked** at
  `docs/product/parked/statement-store-raw-submit.patch` + `WalletSelector.with-localSigner.tsx`.
  It was verified to produce `{status: "ok"}` on Paseo for funded signers, but hits
  `noAllowance` for unfunded burner keys and the project chose to keep the `@novasamatech/*`
  library surface. The sketch below shows how that candidate looked:

```ts
import { statementCodec } from "@novasamatech/sdk-statement";

const ws = new WebSocket(storeUrl);
let subscriptionId: string | null = null;
const collected: any[] = [];

const decoded = await new Promise((resolve, reject) => {
  ws.addEventListener("open", () => {
    ws.send(JSON.stringify({
      jsonrpc: "2.0", id: 1,
      method: "statement_subscribeStatement", params: ["any"],
    }));
  });
  ws.addEventListener("message", (ev) => {
    if (typeof ev.data !== "string") return;
    let parsed; try { parsed = JSON.parse(ev.data); } catch { return; }

    if (parsed.id === 1) {
      if (parsed.error) return reject(new Error(parsed.error.message));
      if (typeof parsed.result === "string") subscriptionId = parsed.result;
      return;
    }
    if (parsed.method === "statement_statements"
        && parsed.params?.subscription === subscriptionId) {
      const event = parsed.params.result;
      if (event?.event !== "newStatements") return;
      for (const enc of event.data?.statements ?? []) {
        try { collected.push(statementCodec.dec(enc)); } catch {}
      }
      if (event.data?.remaining === 0 || event.data?.remaining === undefined) {
        // unsubscribe via statement_unsubscribeStatement, then resolve(collected)
      }
    }
  });
  ws.addEventListener("error", () => reject(new Error("WS error")));
  ws.addEventListener("close", () => resolve(collected));
});
```

Works on both local nodes and People chain (Paseo).

**Gotchas within the gotcha** (captured while building the parked implementation — anyone
rebuilding it from scratch will hit the same walls):

- **Method name is singular**: `statement_subscribeStatement` emits notifications under the
  method name `statement_statement` (singular), not `statement_statements` (plural). The
  adjacently-tagged event shape `{ event: "newStatements", data: { statements, remaining } }`
  is correct. Verified against `wss://paseo-people-next-rpc.polkadot.io` on 2026-04-22: node
  flushed all cached statements (950+) in a single batch with `remaining: 0`. Wrong method
  name fails silently — handler never matches, promise hangs until timeout, UI stuck at
  "Cache miss — re-fetching from Statement Store..." forever.
- **Raw `statement_submit` shape**: histogram of 961 live statements on Paseo showed 920 with
  `{channel, data, expiry, proof, topics}` and 41 with `{data, expiry, proof, topics}` —
  **zero** with just `{proof, data}`. The node silently drops 2-field statements; you must
  include at least `expiry` and `topics`. Build the statement via the exported `statementCodec`.
- **Signature payload**: the runtime hashes `Statement::encoded(for_signing=true)` which is
  the SCALE bytes of everything except the proof, **with the outer Vec compact-length prefix
  stripped**. The SDK's `getStatementSigner` (`@novasamatech/sdk-statement/dist/signer.js:11`)
  does `signFn(encoded.slice(compactLen))`. Skipping that slice yields `badProof` even when
  the signature is cryptographically valid.
- **Codec types**: `statementCodec.enc` expects **hex strings** (`0x…`) for the fixed-size
  fields (`signature`, `signer`, each `topic`), `bigint` for `expiry`, `Uint8Array` for
  `data`. Confirmed by round-tripping a live statement (`dec` → `enc` produced byte-identical
  output). Passing `Uint8Array` for signature/signer silently produces garbage bytes with no
  error from `enc`.
- **Silent RPC rejection**: `statement_submit` returns HTTP 200 with
  `{result: {status: "rejected", reason: "…"}}` when the runtime refuses the statement. The
  old raw path only guarded on `result.error`, so rejections looked like successes — the
  `fulfill` call then landed on-chain referencing bytes that never made it into the store.
  Any new raw path must also throw on non-`ok` status.
- **`noAllowance` is the wall** — the blocker that prompted the revert: submissions from an
  in-browser burner sr25519 keypair (no on-chain balance, no identity) are rejected as
  `{status: "rejected", reason: "noAllowance"}`. The statement store rate-limiter is priority-
  based. Three realistic paths forward if/when this is revisited: (a) fund the burner's SS58
  address on People chain once, (b) route through Nova Wallet Host (existing SDK path), or
  (c) keep statements on a local dev node (allowance check typically permissive).

**Upstream improvement**: one-line fix in `@novasamatech/sdk-statement` — hoist
`let unsubscribe` above the `subscribe` call and assign, or wrap the assignment with a
`queueMicrotask` so the handler can never see it in TDZ. File against
`novasamatech/papi-sdks`. Also worth asking upstream for a helper that wraps the
`sign + submit` flow correctly (stripping `compactLen`, serializing fixed-size fields as hex,
surfacing rejection status).

---

### 16. Statement Store RPC asymmetry: `statement_dump` on local, `statement_subscribeStatement` on Paseo People chain

**Layer**: pallet-statement-store runtime exposure
**Hit on**: 2026-04-22

**Symptom**: after fixing the TDZ bug from #15, decrypt on the local dev node throws
`SyntaxError: "[object Object]" is not valid JSON` instead. Zero statements in the cache.
The SDK's `getStatements` talks to `statement_subscribeStatement`, but the local node
doesn't expose that RPC — the node returns a "method not found" error and the polkadot-api
WS stack (raw-client + follow-enhancer) mangles it into the JSON parse error.

**Cause**: the two runtimes expose different subsets of the `statement_*` RPC surface:

- **Local template (zombienet)**: `statement_broadcasts`, `statement_broadcastsStatement`,
  `statement_dump`, `statement_posted`, `statement_postedClear`, `statement_postedClearStatement`,
  `statement_postedStatement`, `statement_remove`, `statement_submit`.
  **No `statement_subscribeStatement`.**
- **Paseo People chain**: `statement_submit` + `statement_subscribeStatement`.
  **No `statement_dump`.**

Confirmed 2026-04-22 via `rpc_methods` against both. The `@novasamatech/sdk-statement`
SDK only implements the subscribe path — so it works on Paseo and breaks on local, and
the template's original Univerify-baseline `useStatementStore.ts` (which only used
`statement_dump`) worked on local and wouldn't have worked on Paseo.

**Fix / workaround**: `web/src/hooks/useStatementStore.ts::_sdkFetch` now tries
`statement_dump` first (HTTP POST) and falls back to the SDK's patched subscribe path:

```ts
const dumped = await _tryDump(storeUrl);
if (dumped !== null) return dumped;
// fall through to createStatementSdk(...).getStatements(...) — patched for TDZ
```

Statements dumped via `statement_dump` are decoded with the same `statementCodec.dec` the
SDK uses internally; hash computation (`blake2b(data, 32)`) is identical on both paths, so
the cache format is unchanged.

**Upstream improvement**: ask Parity to include `statement_dump` in the People chain runtime
(cheap RPC, already implemented in the pallet), or ship `statement_subscribeStatement` in
the template runtime. Either one would eliminate the need for the fallback branch.

---

### 17. Patching `node_modules/*` doesn't invalidate Vite's `.vite/deps/` pre-bundle

**Layer**: Vite dev server (tested with Vite 6.x)
**Hit on**: 2026-04-22

**Symptom**: you write a postinstall script that patches a file inside
`node_modules/<pkg>/dist/...` (e.g. `patch-sdk-statement.mjs` from #15). You verify the
on-disk file has the patch. You reload the app. **The patch doesn't take effect** — the
browser still sees the old behavior. A `grep` inside the patched file finds the fix; a
`grep` inside `node_modules/.vite/deps/<pkg>.js` does not.

**Cause**: Vite pre-bundles optimized deps (ESM-friendly wrappers + esbuild-consolidated
chunks) into `node_modules/.vite/deps/` at dev-server startup. Once built, those artifacts
are served from disk until the dependency graph changes — and a `postinstall` mutation
inside the same `node_modules/<pkg>` does **not** invalidate that cache (the package
version in `package.json` hasn't changed, and Vite doesn't checksum transitive source files).

**Fix / workaround**:

- After changing a file inside `node_modules/`, restart Vite with `--force`:
  ```bash
  # kill the existing vite, then
  npx vite --host --port 5174 --force
  ```
- Or delete the pre-bundle and let Vite rebuild it on next page-load:
  ```bash
  rm -f node_modules/.vite/deps/<pkg>_<name>.js*
  rm -f node_modules/.vite/deps/_metadata.json
  ```
- **In CI / fresh clones**: postinstall runs before the first `vite dev`, so the first
  pre-bundle already contains the patched source — no extra step needed.

**Verification trick**: put a sentinel comment in your patch (e.g. `/* patched:xyz */`) and
check if it made it into the chunk file, not the raw source:

```bash
# esbuild strips block comments but keeps function structure;
# search for your new pattern instead
grep -l "ref\.unsubscribe" node_modules/.vite/deps/chunk-*.js
```

**Upstream improvement**: Vite could hash source files under known-patched paths (or let
users register paths to invalidate). Until then, document the `--force` requirement for
anyone adding postinstall patches.

---

## Open questions / things we noticed but didn't chase

- **How to estimate pallet-multisig `max_weight` deterministically**: we tuned by hand. A
  `client.runtimeApi.DryRunApi.dry_run_call(inner_call)` would let scripts pick the right
  value. Haven't verified which SDK version exposes this cleanly to PAPI.
- **Does a renamed Solidity function break the multisig's stored call hash?**: yes —
  `blake2_256(encoded_call)` is sensitive to calldata bytes including the function selector.
  Anything that changes the calldata (ABI drift, param reorder, Solidity recompile that
  nudges selectors) invalidates pending multisig approvals. Worth a prominent warning when
  coordinating an asMulti across a contract upgrade.
- **Revive account mapping permanence**: we assume `map_account` is one-shot. Should verify
  whether it can be unmapped and what that would mean for existing contract state referencing
  the mapped H160.
- **Frontend `VerifiedBadge` semantics**: the badge currently renders against
  `listing.patient`, not the medic who signed the record. The medic address is only in the
  signed-package JSON in localStorage. Fixing this cleanly needs either (a) adding a
  `medic` field to on-chain listings, or (b) extracting the medic from the signed package in
  the component. Documented in `docs/product/IMPLEMENTATION_PLAN.md` Phase 7 follow-ups.

## How this doc gets maintained

- Append new findings below the last entry; renumber only if you merge duplicates.
- When an upstream PR lands that fixes one of these, strike through the entry with a link to
  the PR / release — don't delete, so future devs searching for the old error still find the
  context.
- If the doc grows beyond ~20 entries, split by layer into `POLKADOT_INTEGRATION_GOTCHAS_<PAPI|REVIVE|TEMPLATE>.md`.
