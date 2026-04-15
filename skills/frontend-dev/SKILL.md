---
name: frontend-dev
description: >-
  Implements the medical marketplace frontend pages following the design spec.
  Extends the existing dark Polkadot design system (polka-500, surface-950,
  card/btn-primary utilities). Pages: PatientDashboard, MedicSign, ResearcherBuy.
  All blockchain calls are stubs until contracts exist.
license: MIT
metadata:
  author: benja@terrace.fi
  version: '1.0'
  scope:
    - root
  auto_invoke:
    - implement patient dashboard
    - implement medic sign
    - implement researcher dashboard
    - build frontend
    - wire frontend
---

## When to Use

Use this skill when:
- Implementing any of the three marketplace pages (PatientDashboard, MedicSign, ResearcherBuy)
- Building shared UI components defined in the spec (StepHeader, StatCard, OutputField, etc.)
- Wiring blockchain calls (PAPI, snarkjs) into existing stub pages
- Updating the home page marketplace cards or nav

---

## Critical Patterns

### Pattern 1: Always use existing design tokens — never invent new ones

The design system lives in `web/src/index.css` and Tailwind config.
Only use classes already present in the codebase.

```tsx
// ✓ correct
<div className="card space-y-4">
  <h2 className="font-display text-text-primary">Title</h2>
  <button className="btn-primary">Action</button>
</div>

// ✗ wrong — inventing new tokens
<div className="bg-gray-900 rounded-xl p-6">
  <h2 className="text-white font-bold">Title</h2>
</div>
```

### Pattern 2: Blockchain calls are stubs — never block UI on missing contracts

```tsx
// ✓ correct — stub with TODO
async function createListing(data: ListingData) {
  // TODO: wire PAPI — MedicalMarket.createListing()
  console.log("createListing stub", data);
}

// ✗ wrong — importing contracts that don't exist yet
import { MedicalMarket } from "../contracts/MedicalMarket";
```

### Pattern 3: One file per page — keep components flat

Don't create deeply nested component trees. Inline small components in the page file.
Only extract to `web/src/components/` when shared across 2+ pages.

### Pattern 4: Placeholder data from mockData config

```tsx
import { mockListings, mockOrders } from "../config/mockData";
```

If `mockData.ts` doesn't exist yet, create it at `web/src/config/mockData.ts`
using the placeholder data defined in `docs/product/FRONTEND_SPEC.md`.

---

## Decision Tree

```
Implementing a new page?
  → Read FRONTEND_SPEC.md section for that page first
  → Check existing pages (PalletPage.tsx) for patterns
  → Use existing design tokens only

Need a new component?
  → Used in 1 page only?  → inline it in the page file
  → Used in 2+ pages?     → create in web/src/components/

Wiring a blockchain call?
  → Contract exists?  → use PAPI / viem pattern from existing pages
  → Contract missing? → stub with async fn + // TODO comment

Unsure about a design token?
  → grep web/src for the pattern before using
  → check web/src/index.css for custom utilities
```

---

## Key Files

| File | Purpose |
|---|---|
| `docs/product/FRONTEND_SPEC.md` | Full design spec — read before implementing any page |
| `web/src/pages/HomePage.tsx` | Reference for layout, FeatureCard, StatusItem patterns |
| `web/src/pages/PalletPage.tsx` | Reference for PAPI hooks, form patterns, card layout |
| `web/src/index.css` | All custom utility classes (card, btn-primary, etc.) |
| `web/src/config/evm.ts` | Reference for viem/contract wiring pattern |
| `web/src/hooks/useAccount.ts` | Wallet/account hook pattern |
| `web/src/pages/PatientDashboard.tsx` | Stub — implement this |
| `web/src/pages/MedicSign.tsx` | Stub — implement this |
| `web/src/pages/ResearcherBuy.tsx` | Stub — implement this |

---

## Commands

```bash
cd web && npm run dev      # start dev server on http://127.0.0.1:5173
cd web && npm run lint     # eslint check
cd web && npm run fmt      # prettier format
cd web && npm run build    # production build (check for type errors)
```

---

## Resources

- **Design spec**: `docs/product/FRONTEND_SPEC.md` — layouts, component props, placeholder data
- **Existing pages**: `web/src/pages/` — follow these patterns exactly
- **zk-kit docs**: https://github.com/privacy-scaling-explorations/zk-kit (for snarkjs wiring)
- **PAPI docs**: https://papi.how (for chain reads when contracts exist)
