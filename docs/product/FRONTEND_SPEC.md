# Frontend Specification

## Design System (existing — match exactly)

From `web/src/App.tsx` and `web/src/pages/HomePage.tsx`. Do not introduce new design tokens.

### Colors
| Token | Usage |
|---|---|
| `polka-500` / `polka-400` / `polka-600` | Brand pink — primary actions, active states, gradients |
| `surface-950` | Page/nav background |
| `text-primary` | Main text |
| `text-secondary` | Descriptions, subtitles |
| `text-tertiary` | Labels, metadata |
| `text-muted` | Disabled, placeholder |
| `accent-green` | Success, connected, verified |
| `accent-blue` | Info, patient role |
| `accent-purple` | Medic role |
| `accent-yellow` | Warning, pending |
| `accent-red` | Error, rejected |

### Component classes (use as-is)
- `card` — standard card with border
- `card-hover` — card with hover state
- `btn-primary` — pink filled button
- `btn-secondary` — ghost/outlined button
- `input-field` — text input
- `label` — form label above input
- `page-title` — large heading
- `font-display` — heading font family
- `shadow-glow` / `shadow-glow-lg` — pink glow on elements
- `animate-fade-in` — page entry animation
- `animate-pulse-slow` — subtle pulse for status dots
- `gradient-orb` — ambient background orb (pink top-right, blue bottom-left)

### Layout
- Max width: `max-w-5xl mx-auto px-4`
- Page top padding: `py-8`
- Section spacing: `space-y-8`
- Nav: sticky, `backdrop-blur-xl bg-surface-950/80`, `border-b border-white/[0.06]`

---

## Navigation Changes (`App.tsx`)

Replace existing nav items with:

```tsx
const navItems = [
  { path: "/",          label: "Home",       enabled: true },
  { path: "/patient",   label: "Patient",    enabled: true },
  { path: "/medic",     label: "Medic",      enabled: true },
  { path: "/researcher",label: "Researcher", enabled: true },
  { path: "/accounts",  label: "Accounts",   enabled: true },
];
```

Keep the existing connection indicator (green dot + "Connected" text) in the nav.

---

## Home Page Changes (`HomePage.tsx`)

Replace the three FeatureCards with:

```tsx
<FeatureCard
  title="Patient"
  description="Upload attested health records, set disclosure rules, manage listings, track earnings."
  link="/patient"
  accentColor="text-accent-blue"
  borderColor="hover:border-accent-blue/20"
  available={true}
/>
<FeatureCard
  title="Medic"
  description="Sign patient records with your professional key. Construct Merkle trees and generate EdDSA signatures."
  link="/medic"
  accentColor="text-accent-purple"
  borderColor="hover:border-accent-purple/20"
  available={true}
/>
<FeatureCard
  title="Researcher"
  description="Browse verified listings, place buy orders, and decrypt purchased clinical data."
  link="/researcher"
  accentColor="text-accent-green"
  borderColor="hover:border-accent-green/20"
  available={true}
/>
```

Update the hero subtitle to describe the marketplace, not PoE.

---

## Page 1: Patient Dashboard (`/patient`)

File: `web/src/pages/PatientDashboard.tsx`

### Layout
```
page-title: "Patient Dashboard"
subtitle: "Manage your health records and marketplace listings."

[Wallet bar]        ← address + USDC balance + DOT balance

[Stats row]         ← 3 stat cards: Total Records | Active Listings | Total Earned (USDC)

[My Records]        ← section heading + "List New Record" button (right-aligned)
  [Records table]

[Purchase History]  ← section heading
  [History table]
```

### Wallet bar
```tsx
<div className="card flex items-center justify-between">
  <div className="flex items-center gap-3">
    <span className="w-2 h-2 rounded-full bg-accent-green shadow-[0_0_6px_rgba(52,211,153,0.5)]" />
    <span className="font-mono text-sm text-text-secondary">0x1234...abcd</span>
  </div>
  <div className="flex gap-6">
    <StatPill label="USDC" value="203.59" />
    <StatPill label="DOT"  value="12.40" />
  </div>
</div>
```

### Stats row (3 cards in a grid)
```tsx
<div className="grid grid-cols-3 gap-4">
  <StatCard label="Total Records"    value="4"        accent="text-accent-blue" />
  <StatCard label="Active Listings"  value="2"        accent="text-polka-400" />
  <StatCard label="Total Earned"     value="$48 USDC" accent="text-accent-green" />
</div>
```

### My Records table
Columns: `Record ID` | `Condition` | `Attested` | `Disclosed Fields` | `Price (USDC)` | `Status` | `Actions`

- **Record ID**: truncated hash, monospace
- **Condition**: plain text tag (e.g. "Type 2 Diabetes")
- **Attested**: date string
- **Disclosed Fields**: small pill tags for each field (e.g. "age-range", "hba1c-threshold")
- **Price**: number
- **Status**: colored badge
  - `Active` → `bg-accent-green/10 text-accent-green border border-accent-green/20`
  - `Fulfilled` → `bg-accent-blue/10 text-accent-blue border border-accent-blue/20`
  - `Delisted` → `bg-white/5 text-text-muted border border-white/10`
- **Actions**: "View" button (opens drawer) + "Delist" button (only if Active)

### "List New Record" modal
Opens on button click. Two steps:

**Step 1 — Upload**
```
Drag & drop area (reuse FileDropZone component)
  "Drop your signed record JSON here"
  Accepts: .json
Once uploaded → show parsed field preview table: Field | Value
[Next →] button
```

**Step 2 — Configure listing**
```
Section: "Fields to disclose"
  Checkbox list of parsed fields
  Each field: [ ✓ ] field_name  "value_preview"

Section: "Price"
  input-field  [USDC]

Section: "Storage"
  Radio: ○ Statement Store (fast, ephemeral)  ● IPFS (persistent)

[← Back]  [List Record]
```

### Purchase History table
Columns: `Buyer Key` | `Record` | `Amount (USDC)` | `Date`

- **Buyer Key**: truncated `pk_buyer` hex, monospace, copy-on-click
- **Record**: condition tag
- **Amount**: green text
- **Date**: relative ("2 days ago")

---

## Page 2: Medic Signing Tool (`/medic`)

File: `web/src/pages/MedicSign.tsx`

Single-purpose page. Three sequential steps shown as a vertical stepper.

### Layout
```
page-title: "Medic Signing Tool"
subtitle: "Sign patient records with your professional key."

[Stepper]
  Step 1: Upload Record       ← always visible
  Step 2: Merkle Tree         ← revealed after Step 1 complete
  Step 3: Sign & Export       ← revealed after Step 2 complete
```

### Step 1 — Upload Record
```tsx
<div className="card space-y-4">
  <StepHeader number={1} title="Upload Record" active={step === 1} done={step > 1} />
  <FileDropZone accept=".json" label="Drop clinical JSON record here" />
  {/* Once file loaded: */}
  <table className="w-full text-sm">
    <thead>
      <tr className="text-text-tertiary text-xs uppercase tracking-wider">
        <th className="text-left pb-2">Field</th>
        <th className="text-left pb-2">Value</th>
      </tr>
    </thead>
    <tbody>
      {fields.map(([k, v]) => (
        <tr key={k} className="border-t border-white/[0.04]">
          <td className="py-2 font-mono text-text-secondary">{k}</td>
          <td className="py-2 text-text-primary">{String(v)}</td>
        </tr>
      ))}
    </tbody>
  </table>
  <button className="btn-primary" onClick={next}>Continue →</button>
</div>
```

### Step 2 — Construct Merkle Tree
```tsx
<div className="card space-y-4">
  <StepHeader number={2} title="Construct Merkle Tree" active={step === 2} done={step > 2} />
  <button className="btn-secondary" onClick={buildTree} disabled={building}>
    {building ? "Building..." : "Build Poseidon Merkle Tree"}
  </button>
  {/* Once built: */}
  <div className="space-y-2">
    <label className="label">Merkle Root</label>
    <div className="input-field font-mono text-xs text-text-secondary flex items-center justify-between">
      <span className="truncate">{merkleRoot}</span>
      <CopyButton value={merkleRoot} />
    </div>
    <p className="text-xs text-text-muted">{leafCount} leaves · depth {depth}</p>
  </div>
  <button className="btn-primary" onClick={next}>Continue →</button>
</div>
```

### Step 3 — Sign & Export
```tsx
<div className="card space-y-4">
  <StepHeader number={3} title="Sign & Export" active={step === 3} done={step > 3} />
  <button className="btn-primary" onClick={signWithWallet}>
    Sign Merkle Root with Wallet
  </button>
  {/* Once signed: */}
  <div className="space-y-3">
    <OutputField label="Signature R" value={sig.R} />
    <OutputField label="Signature S" value={sig.S} />
    <OutputField label="Public Key"  value={pubKey} />
  </div>
  <button className="btn-secondary w-full" onClick={downloadPackage}>
    ↓ Download Signed Record (.json)
  </button>
</div>
```

The downloaded JSON package contains:
```json
{
  "fields": { ...original fields },
  "merkleRoot": "0x...",
  "merkleTree": { ...leaves and paths },
  "signature": { "R": "0x...", "S": "0x..." },
  "publicKey": "0x...",
  "signedAt": "ISO timestamp"
}
```

---

## Page 3: Researcher Dashboard (`/researcher`)

File: `web/src/pages/ResearcherBuy.tsx`

### Layout
```
page-title: "Researcher Dashboard"
subtitle: "Browse verified medical data listings."

[Wallet bar]        ← same pattern as Patient

[Filter bar]        ← condition filter + price range

[Listings grid]     ← card grid, 2 columns

[My Orders]         ← section heading
  [Orders table]
```

### Filter bar
```tsx
<div className="card flex gap-4 items-end">
  <div className="flex-1">
    <label className="label">Condition</label>
    <select className="input-field w-full">
      <option>All conditions</option>
      <option>Type 2 Diabetes</option>
      <option>Hypertension</option>
    </select>
  </div>
  <div className="w-40">
    <label className="label">Max price (USDC)</label>
    <input type="number" className="input-field w-full" placeholder="Any" />
  </div>
  <button className="btn-secondary">Filter</button>
</div>
```

### Listing card
```tsx
<div className="card-hover space-y-3">
  {/* Header */}
  <div className="flex items-start justify-between">
    <div>
      <h3 className="font-semibold text-text-primary font-display">Type 2 Diabetes</h3>
      <p className="text-xs text-text-muted font-mono mt-0.5">#{listingId.slice(0, 8)}</p>
    </div>
    <span className="flex items-center gap-1.5 text-xs text-accent-green">
      <span className="w-1.5 h-1.5 rounded-full bg-accent-green" />
      Verified Medic
    </span>
  </div>

  {/* Disclosed fields */}
  <div className="flex flex-wrap gap-1.5">
    {disclosedFields.map(f => (
      <span key={f} className="px-2 py-0.5 rounded-full text-xs bg-white/[0.05]
                               border border-white/[0.08] text-text-secondary">
        {f}
      </span>
    ))}
  </div>

  {/* Footer */}
  <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
    <span className="text-lg font-semibold text-text-primary">
      {price} <span className="text-sm text-text-muted font-normal">USDC</span>
    </span>
    <button className="btn-primary text-sm" onClick={() => openBuyModal(listing)}>
      Place Buy Order
    </button>
  </div>
</div>
```

### "Place Buy Order" modal
```
[Listing summary — condition, fields, price]

Section: "Your Encryption Key"
  Radio: ○ Generate new BabyJubJub keypair   ● Paste existing public key

  If generate:
    [Generate Key] button
    Public key output field (copyable)
    Warning: "Save your private key — you need it to decrypt the data."
    Private key output field (copyable, blurred by default, click to reveal)

  If paste:
    input-field for public key

Section: "Escrow"
  "You will lock [price] USDC until the seller fulfills."

[Cancel]  [Lock Funds & Place Order]
```

### My Orders table
Columns: `Order ID` | `Condition` | `Price (USDC)` | `Status` | `Date` | `Actions`

Status badges:
- `Pending` → yellow
- `Fulfilled` → green
- `Expired` → muted

Actions:
- Pending: "Cancel" (ghost button)
- Fulfilled: "Decrypt & Download" (primary button)

### "Decrypt & Download" drawer
Slides in from right when clicking fulfilled order.

```
Title: "Decrypt Purchased Data"
Subtitle: "Enter your private key to decrypt the ciphertext."

[Private key input — password type, monospace]
[Decrypt] button

→ On success:
  Field table (same as Medic step 1 preview)
  [Download JSON] button
  [Download CSV] button

→ On failure:
  Error card: "Decryption failed. Wrong private key?"
```

---

## Shared Components (new, to be created in `web/src/components/`)

| Component | Props | Notes |
|---|---|---|
| `StepHeader` | `number`, `title`, `active`, `done` | Step indicator with number badge + checkmark when done |
| `StatCard` | `label`, `value`, `accent` | Single metric card with colored value |
| `StatPill` | `label`, `value` | Inline label+value for wallet bar |
| `OutputField` | `label`, `value` | Monospace read-only field with copy button |
| `CopyButton` | `value` | Icon button, shows checkmark for 2s after copy |
| `StatusBadge` | `status` | Colored pill for Active/Fulfilled/Pending/etc. |

---

## Placeholder Data (for development before blockchain wiring)

```ts
// web/src/config/mockData.ts
export const mockListings = [
  {
    id: "0x3f2a...c891",
    condition: "Type 2 Diabetes",
    disclosedFields: ["age-range", "hba1c-threshold", "diagnosis-category"],
    price: 24,
    attested: "2025-03-15",
    status: "Active",
  },
  {
    id: "0x9b1d...f032",
    condition: "Hypertension",
    disclosedFields: ["age-range", "systolic-range", "medication-class"],
    price: 18,
    attested: "2025-02-28",
    status: "Active",
  },
]

export const mockOrders = [
  {
    id: "0x1e31...4138",
    condition: "Type 2 Diabetes",
    price: 24,
    status: "Fulfilled",
    date: "2025-04-10",
    pkBuyer: "0x4cc2...ff41",
  },
]
```

All blockchain calls (`createListing`, `placeBuyOrder`, `fulfill`, balance reads) are
stubbed as empty async functions with `// TODO: wire PAPI / snarkjs` comments until the
contract exists.
