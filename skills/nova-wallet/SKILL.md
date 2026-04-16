---
name: nova-wallet
description: >-
  Embed, maintain, and debug the dApp inside Nova Wallet (or Spektr) using
  @novasamatech/product-sdk. Covers PAPI provider proxying, the Spektr
  account fallback chain, Revive.call() extrinsics replacing viem write
  calls, and the wei→planck conversion for payable calls.
license: MIT
metadata:
  author: benja@terrace.fi
  version: '1.0'
  scope:
    - root
  auto_invoke:
    - nova wallet
    - nova embed
    - product sdk
    - spektr
    - revive call
    - papi extrinsic
    - substrate signing
    - wallet integration
    - signAndSubmit
---

## When to Use

Use this skill when:
- Adding or debugging Nova Wallet / Spektr embedding behaviour
- Writing a new contract write call on any marketplace page (must use `Revive.call`, not viem)
- Troubleshooting account resolution inside vs. outside Nova Wallet
- Understanding why `injectSpektrExtension()` returns `false` in a browser
- Porting a new page from viem `writeContract` to PAPI `Revive.call`

---

## Architecture: How Nova Wallet Embedding Works

Nova Wallet hosts the dApp in a **webview** (mobile) or **iframe** (desktop/Spektr). The
SDK intercepts PAPI JSON-RPC calls and reroutes them through the Host's existing node
connection. The dApp never opens its own WebSocket when running inside Nova Wallet.

```
dApp (browser/webview)
  └── @novasamatech/product-sdk
        ├── createPapiProvider()   ← detects Host via postMessage handshake
        │     ├── Inside Nova Wallet: chain requests → Host → node
        │     └── Outside (browser): falls back to plain WebSocket
        └── injectSpektrExtension() ← detects Host presence
              ├── Inside Nova Wallet: returns true, injects "spektr" signer
              └── Outside: returns false immediately
```

**Key invariant**: when `injectSpektrExtension()` returns `true`, `createPapiProvider`
will also be routing through the Host. The two always go together.

---

## package.json dependency

```json
"@novasamatech/product-sdk": "^0.6.12"
```

The published v0.6.12 API differs from the `triangle-js-sdks` monorepo README (which
describes a later version). Always check
`web/node_modules/@novasamatech/product-sdk/dist/papiProvider.d.ts` for the real signature.

---

## 1. PAPI Provider — `web/src/hooks/useChain.ts`

```ts
import { createPapiProvider, WellKnownChain } from "@novasamatech/product-sdk";
import { getWsProvider } from "polkadot-api/ws-provider/web";
import { withPolkadotSdkCompat } from "polkadot-api/polkadot-sdk-compat";
import { createClient } from "polkadot-api";

// WellKnownChain.polkadotAssetHub = genesis hash
// "0x68d56f15f85d3136970ec16946040bc1752654e906147f7e43e9d539d7c3de2f"
// For local dev, the fallback WS provider takes over automatically.
const provider = createPapiProvider(
  WellKnownChain.polkadotAssetHub,
  getWsProvider(url),   // fallback used outside Nova Wallet
);
const client = createClient(withPolkadotSdkCompat(provider));
```

**`createPapiProvider` v0.6.12 signature (positional, not options object):**

```ts
createPapiProvider(
  genesisHash: HexString,    // WellKnownChain enum value or raw hex
  __fallback?: JsonRpcProvider,
  internal?: InternalParams,
): JsonRpcProvider
```

---

## 2. Account Resolution — `web/src/hooks/useAccount.ts`

Priority chain: **Spektr (Nova Wallet) → browser extension → dev accounts**.

```ts
import { injectSpektrExtension, SpektrExtensionName } from "@novasamatech/product-sdk";
import { connectInjectedExtension, getInjectedExtensions } from "polkadot-api/pjs-signer";

export async function getAccountsWithFallback(): Promise<AppAccount[]> {
  // 1. Nova Wallet / Spektr
  try {
    const ready = await injectSpektrExtension();
    if (ready) {
      const ext = await connectInjectedExtension(SpektrExtensionName);
      const accounts = ext.getAccounts();
      if (accounts.length > 0) return accounts.map(toAppAccount);
    }
  } catch {}

  // 2. Browser extension (Polkadot.js, Talisman, SubWallet)
  try {
    const extensions = getInjectedExtensions().filter(n => n !== SpektrExtensionName);
    if (extensions.length > 0) {
      const ext = await connectInjectedExtension(extensions[0]);
      const accounts = ext.getAccounts();
      if (accounts.length > 0) return accounts.map(toAppAccount);
    }
  } catch {}

  // 3. Dev accounts (local only)
  return devAccounts;
}

function toAppAccount(acc: InjectedPolkadotAccount): AppAccount {
  return {
    name: acc.name ?? `${acc.address.slice(0, 6)}…${acc.address.slice(-4)}`,
    address: acc.address,
    signer: acc.polkadotSigner,
    evmAddress: substrateToH160(acc.polkadotSigner.publicKey),
  };
}
```

### `AppAccount` type

```ts
export type AppAccount = {
  name: string;
  /** SS58-encoded Substrate address */
  address: string;
  signer: PolkadotSigner;
  /** H160 as seen by pallet-revive DefaultAddressMapper */
  evmAddress: `0x${string}`;
};
```

### H160 derivation — `substrateToH160`

pallet-revive `DefaultAddressMapper` maps a 32-byte sr25519 public key to H160 by taking
the **last 20 bytes** (bytes 12–31). This is the H160 the contract sees for `msg.sender`.

```ts
export function substrateToH160(publicKey: Uint8Array): `0x${string}` {
  const last20 = publicKey.slice(12);
  return `0x${Array.from(last20).map(b => b.toString(16).padStart(2, "0")).join("")}` as `0x${string}`;
}
```

> **Do not confuse with `ss58ToH160`** in `AccountsPage.tsx` which uses Keccak256 — that
> is a display-only utility, not the actual on-chain address.

---

## 3. Contract Write Calls — `Revive.call()` pattern

All **write** calls (state-mutating) use PAPI `api.tx.Revive.call()` with sr25519 signing.
**Read** calls (view functions) still use viem `publicClient.readContract()` — no change.

### Constants

```ts
const MAX_STORAGE_DEPOSIT = 100_000_000_000_000n;  // 0.0001 DOT in planck
const CALL_WEIGHT = { ref_time: 3_000_000_000n, proof_size: 1_048_576n };

// Asset Hub is 12-decimal (planck). viem uses 18-decimal wei.
// Revive.call value is in planck: divide wei by 1_000_000.
const WEI_TO_PLANCK = 1_000_000n;
```

### `reviveCall` helper (copy into each page that needs it)

```ts
import { Binary, FixedSizeBinary } from "polkadot-api";
import { encodeFunctionData } from "viem";
import { hexToBytes } from "viem/utils";
import { getClient } from "../hooks/useChain";
import { getStackTemplateDescriptor } from "../hooks/useConnection";
import type { AppAccount } from "../hooks/useAccount";

async function reviveCall(
  functionName: string,
  args: unknown[],
  valueWei = 0n,
  currentAccount: AppAccount,
  contractAddress: `0x${string}`,
  wsUrl: string,
) {
  const calldata = encodeFunctionData({
    abi: medicalMarketAbi,
    functionName,
    args,
  } as Parameters<typeof encodeFunctionData>[0]);

  const api = getClient(wsUrl).getTypedApi(await getStackTemplateDescriptor());

  const result = await api.tx.Revive.call({
    dest: new FixedSizeBinary(hexToBytes(contractAddress)) as FixedSizeBinary<20>,
    value: valueWei / WEI_TO_PLANCK,
    weight_limit: CALL_WEIGHT,
    storage_deposit_limit: MAX_STORAGE_DEPOSIT,
    data: Binary.fromHex(calldata),
  }).signAndSubmit(currentAccount.signer);

  if (!result.ok) throw new Error(formatDispatchError(result.dispatchError));
  return { txHash: result.txHash };
}
```

### `signAndSubmit` return value

```ts
// Resolves when the tx is finalized (included in a block and events processed)
const result = await tx.signAndSubmit(signer);

result.ok          // boolean — false if pallet emitted a DispatchError
result.txHash      // `0x${string}` — always present
result.dispatchError  // defined when ok === false; use formatDispatchError()
```

`signAndSubmit` does **not** time out — it waits for finalization. This is correct for
contract calls; do not wrap in a manual timeout unless you detect a node disconnect.

### Payable calls — wei→planck conversion

```ts
// listing.price comes from getListing() which returns the value in wei (18-decimal)
await reviveCall("placeBuyOrder", [listing.id], listing.price, ...);
// Inside reviveCall: value = listing.price / 1_000_000n  → planck for Revive.call
```

Always pass the original wei value to `reviveCall` and let it divide. Never pre-divide
before calling or you'll double-divide.

### Revive.call parameter types (from PAPI descriptors)

```ts
// dest: FixedSizeBinary<20>  ← construct from Uint8Array
new FixedSizeBinary(hexToBytes("0xABCD...")) as FixedSizeBinary<20>

// data: Binary  ← use Binary.fromHex()
Binary.fromHex(calldata)   // calldata is `0x${string}` from encodeFunctionData

// weight_limit: { ref_time: bigint, proof_size: bigint }
// storage_deposit_limit: bigint
// value: bigint (planck)
```

---

## 4. Statement Store signing

The Statement Store RPC uses `signer.signBytes`, not `signer.sign`.

```ts
import { submitToStatementStore } from "../hooks/useStatementStore";

// ✓ correct
await submitToStatementStore(wsUrl, encrypted, currentAccount.signer.publicKey, currentAccount.signer.signBytes);

// ✗ wrong — PolkadotSigner has no .sign property
await submitToStatementStore(wsUrl, encrypted, currentAccount.signer.publicKey, currentAccount.signer.sign);
```

`PolkadotSigner` interface:
```ts
interface PolkadotSigner {
  publicKey: Uint8Array;
  signTx: (callData: Uint8Array, signedExtensions: ..., metadata: Uint8Array) => Promise<Uint8Array>;
  signBytes: (data: Uint8Array) => Promise<Uint8Array>;
}
```

---

## 5. What stays on viem

**Do not migrate read calls.** `publicClient.readContract()` is fine everywhere:

```ts
// ✓ keep as-is — no signing, no Nova Wallet restriction
const [merkleRoot, statHash, title, price, patient, active] =
  await client.readContract({
    address: contractAddress,
    abi: medicalMarketAbi,
    functionName: "getListing",
    args: [i],
  }) as [string, string, string, bigint, string, boolean];
```

`getWalletClient` in `web/src/config/evm.ts` is kept but deprecated — used only by
`ContractProofOfExistencePage`. All marketplace pages use `reviveCall` instead.

---

## 6. Testing Outside Nova Wallet

When running in a browser (not inside Nova Wallet):

- `injectSpektrExtension()` returns `false` → falls through to dev accounts
- `createPapiProvider` uses the WS fallback → connects to `ws://127.0.0.1:9944`
- All three dev accounts (Alice, Bob, Charlie) are available via dropdown
- Full `reviveCall` flow works identically — same PAPI path, just different signer source

**End-to-end smoke test:**
1. `./scripts/start-all.sh` — starts node + eth-rpc + deploys contracts
2. `cd web && npm run dev` — frontend on http://127.0.0.1:5173
3. Patient (Alice): import `examples/medical-record.json`, encrypt, list
4. Researcher (Bob): buy the listing
5. Patient (Alice): fulfill → releases AES key
6. Researcher (Bob): decrypt → verify original data is recovered

---

## 7. Key Files

| File | Purpose |
|---|---|
| `web/src/hooks/useChain.ts` | `getClient()` — PAPI client with product-sdk provider |
| `web/src/hooks/useAccount.ts` | `getAccountsWithFallback()`, `AppAccount`, `substrateToH160` |
| `web/src/hooks/useConnection.ts` | `getStackTemplateDescriptor()` — PAPI typed API descriptor |
| `web/src/pages/PatientDashboard.tsx` | Patient write calls: `createListing`, `fulfill`, `cancelListing` |
| `web/src/pages/ResearcherBuy.tsx` | Researcher write calls: `placeBuyOrder`, `cancelOrder` |
| `web/src/config/evm.ts` | ABI definitions + viem public client (read-only calls) |
| `web/.papi/descriptors/` | Generated PAPI descriptors — regenerate with `npx papi update` |

---

## 8. Common Errors

| Error | Cause | Fix |
|---|---|---|
| `Property 'sign' does not exist on type 'PolkadotSigner'` | Used `.sign` instead of `.signBytes` | Change to `signer.signBytes` |
| `InputValidationError: dest type mismatch` | Passed plain `Uint8Array` to `dest` | Wrap: `new FixedSizeBinary(bytes) as FixedSizeBinary<20>` |
| `tx result ok: false` | Contract reverted (e.g. wrong caller, already fulfilled) | Check `result.dispatchError` — call `formatDispatchError()` |
| `injectSpektrExtension` always `false` | Not inside Nova Wallet/Spektr | Expected in browser — dev accounts kick in |
| `createPapiProvider` called with options object `{ chainId, fallback }` | Using README API (v0.6.18+), not installed v0.6.12 | Use positional args: `createPapiProvider(genesisHash, fallbackProvider)` |

---

## 9. Upgrading `product-sdk`

When bumping to `>= 0.6.18`, verify `createPapiProvider` signature in the new
`dist/papiProvider.d.ts` before changing `useChain.ts`. The README describes the options-
object form; older releases use positional arguments.

After any `product-sdk` upgrade: `cd web && npx papi update` to regenerate descriptors.
