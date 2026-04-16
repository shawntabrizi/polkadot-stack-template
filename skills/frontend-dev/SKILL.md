---
name: frontend-dev
description: >-
  Implement and maintain the medical marketplace frontend. Covers the three
  live pages (PatientDashboard, MedicSign, ResearcherBuy), the contract ABI
  wiring via viem, ZK-kit Poseidon/EdDSA utilities, and the dark Polkadot
  design system.
license: MIT
metadata:
  author: benja@terrace.fi
  version: '2.0'
  scope:
    - root
  auto_invoke:
    - implement patient dashboard
    - implement medic sign
    - implement researcher dashboard
    - build frontend
    - wire frontend
    - update ABI
    - zk kit
    - poseidon merkle
    - eddsa sign
---

## When to Use

Use this skill when:
- Modifying any of the three marketplace pages (PatientDashboard, MedicSign, ResearcherBuy)
- Updating the contract ABI in `web/src/config/evm.ts` after a Solidity change
- Adding ZK-kit utilities (Poseidon, EdDSA, LeanIMT) to the frontend
- Building shared UI components or updating the design system

---

## Current Page Status

All three pages are **fully implemented and wired to the live contract**.

| Page | Route | Role | Status |
|---|---|---|---|
| `PatientDashboard.tsx` | `/patient` | Patient (Alice) | Live — Phase 1 |
| `MedicSign.tsx` | `/medic` | Medic (any) | Live — Phase 1 |
| `ResearcherBuy.tsx` | `/researcher` | Researcher (Bob) | Live — Phase 1 |

---

## Phase 1 Data Flow

```
Medic (MedicSign)
  1. Drop clinical JSON → parse fields
  2. Build Poseidon LeanIMT over fields → merkleRoot
  3. Sign merkleRoot with EdDSA/BabyJubJub → {R8x, R8y, S}
  4. Download signed-record.json

Patient (PatientDashboard)
  1. Drop signed-record.json → validate {merkleRoot, fields, signature}
  2. AES-256-GCM encrypt the full package JSON in browser
  3. blake2b-256(ciphertext) → statementHash (Statement Store lookup key)
  4. Upload ciphertext to Statement Store via sr25519-signed RPC
  5. createListing(merkleRoot, statementHash, title, price) on-chain

Researcher (ResearcherBuy)
  1. Browse listings (see title + truncated merkleRoot)
  2. placeBuyOrder(listingId) → locks funds in contract
  3. cancelOrder(orderId) → full refund, listing unblocks (if not yet fulfilled)
  4. After patient fulfills: read AES key from contract, fetch ciphertext from
     Statement Store by statementHash, decrypt → get back signed-record.json
```

---

## ZK-Kit Patterns

### Poseidon Merkle tree (MedicSign Step 2)

```ts
import { LeanIMT } from "@zk-kit/lean-imt";
import { poseidon2 } from "poseidon-lite";
import { blake2b } from "blakejs";

// Convert a string to a BN254-safe bigint (< 2^248 via 31-byte blake2b slice)
function stringToBigint(s: string): bigint {
  const hash = blake2b(new TextEncoder().encode(s), undefined, 32);
  return BigInt("0x" + Array.from(hash.slice(0, 31))
    .map(b => b.toString(16).padStart(2, "0")).join(""));
}

const hashFn = (a: bigint, b: bigint) => poseidon2([a, b]);
const tree = new LeanIMT<bigint>(hashFn);

for (const [k, v] of fields) {
  tree.insert(poseidon2([stringToBigint(k), stringToBigint(v)]));
}

const merkleRoot = "0x" + tree.root.toString(16).padStart(64, "0");
// tree.size  → number of leaves
// tree.depth → tree depth
```

### EdDSA BabyJubJub signing (MedicSign Step 3)

```ts
import { signMessage, derivePublicKey } from "@zk-kit/eddsa-poseidon";
import { evmDevAccounts } from "../config/evm";

// Dev accounts expose .privateKey (32-byte hex) for BJJ key derivation
const privKey = evmDevAccounts[selectedAccount].privateKey;
const signature = signMessage(privKey, BigInt(merkleRoot));
// signature.R8: [bigint, bigint]  ← curve point (store both coords for Phase 3)
// signature.S:  bigint

const pk = derivePublicKey(privKey);
// pk: [bigint, bigint]
```

### Signed package format

```json
{
  "fields":    { "age": "42", "condition": "type2_diabetes", ... },
  "merkleRoot": "0x...",
  "merkleTree": { "leaves": ["0x..."], "depth": 4 },
  "signature": { "R8x": "0x...", "R8y": "0x...", "S": "0x..." },
  "publicKey": { "x": "0x...", "y": "0x..." },
  "signedAt":  "2026-04-16T14:00:00.000Z"
}
```

---

## Contract ABI Wiring

### Current `createListing` signature (Phase 1)

```ts
// web/src/config/evm.ts
args: [
  importedPackage.merkleRoot as `0x${string}`,  // Poseidon root
  ciphertextHash,                                 // blake2b of AES ciphertext
  titleStr.trim(),                               // human-readable label
  parseEther(priceStr),                          // minimum price in wei
]
```

### `getListing` return tuple (6 elements)

```ts
const result = await client.readContract({ functionName: "getListing", args: [i] })
  as [string, string, string, bigint, string, boolean];
//   ↑        ↑        ↑       ↑       ↑       ↑
//   merkleRoot statHash title  price  patient active
```

### Dev accounts

`evmDevAccounts` in `web/src/config/evm.ts` exposes three fields per entry:
- `.name` — "Alice" / "Bob" / "Charlie"
- `.privateKey` — raw 32-byte hex (used for BJJ key derivation in MedicSign)
- `.account` — viem Account object (used for EVM transactions)

Conventional role assignment: **Alice = Patient**, **Bob = Researcher**, **Charlie = spare**.

---

## Design System Patterns

Always use existing design tokens — never invent new ones.

```tsx
// ✓ correct
<div className="card space-y-4">
  <h2 className="section-title">Title</h2>
  <button className="btn-primary">Action</button>
  <button className="btn-secondary">Secondary</button>
  <p className="text-text-muted text-xs">Hint</p>
</div>

// Status badge pattern
<span className="bg-accent-green/10 text-accent-green text-xs font-medium px-1.5 py-0.5 rounded">
  Active
</span>

// Danger action pattern
<button className="px-2 py-1 rounded-md bg-accent-red/10 text-accent-red text-xs font-medium hover:bg-accent-red/20 transition-colors">
  Cancel
</button>
```

### StepHeader + OutputField (MedicSign inline components)

Both are defined at the bottom of `MedicSign.tsx` — copy the same pattern for other
multi-step pages rather than creating a shared component (used in only one page).

---

## Key Files

| File | Purpose |
|---|---|
| `web/src/pages/MedicSign.tsx` | 3-step signing tool — reference for LeanIMT + EdDSA patterns |
| `web/src/pages/PatientDashboard.tsx` | Signed package import, AES encrypt, Statement Store upload, listing |
| `web/src/pages/ResearcherBuy.tsx` | Browse listings, place/cancel orders, decrypt data |
| `web/src/config/evm.ts` | Contract ABI + dev accounts (including raw private keys) |
| `web/src/config/deployments.ts` | Deployed contract addresses |
| `web/src/hooks/useStatementStore.ts` | `submitToStatementStore`, `fetchStatements`, `checkStatementStoreAvailable` |
| `web/src/components/FileDropZone.tsx` | Reusable drop zone — `onFileBytes` callback returns raw `Uint8Array` |
| `web/src/index.css` | All custom utility classes |
| `docs/product/FRONTEND_SPEC.md` | Layout spec — read before redesigning any page |
| `examples/medical-record.json` | Test fixture for the MedicSign tool |

---

## Commands

```bash
cd web && npm run dev          # dev server on http://127.0.0.1:5173
cd web && npm run lint         # eslint
cd web && npm run fmt          # prettier format
cd web && npm run fmt:check    # CI format check
cd web && npx tsc --noEmit    # type check without build
```
