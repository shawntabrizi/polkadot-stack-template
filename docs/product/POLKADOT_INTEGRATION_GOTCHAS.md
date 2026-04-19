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
