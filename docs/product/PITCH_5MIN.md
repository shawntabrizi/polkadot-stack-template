# 5-Minute Hackathon Pitch — Own Your Medical Records

Builder-honest tone. No marketing fluff. Demo-centric. Flaws slide comes after the
demo so judges first see the working product, then hear the trade-offs.

---

## Slide Structure (5 min)

| # | Slide | ~Time |
|---|---|---|
| 1 | The Problem | 0:00–0:45 |
| 2 | The Solution | 0:45–1:30 |
| 3 | Why Polkadot | 1:30–2:00 |
| 4 | DEMO | 2:00–4:00 |
| 5 | Current Flaws | 4:00–4:30 |
| 6 | What's Next | 4:30–5:00 |

---

## Gamma Prompt

Paste the block below into Gamma's "Generate with AI". Dark theme, Polkadot pink
(`#E6007A`) accents.

````
Create a 6-slide hackathon pitch deck. Project: Own Your Medical Records.
Tone: honest builder, no marketing fluff. Short, punchy slides.
Dark theme, Polkadot pink (#E6007A) accents.

---

# Own Your Medical Records

## The problem

Your medical records live in hospitals, insurers, and tech platforms.
You don't control who sees them, sells them, or loses them.

- Anthem 2015. Change Healthcare 2024. Millions of records exposed from a single point of failure.
- Systems aren't always secure — and when they fail, you're the one affected.
- Your data gets shared and sold without your consent. You see none of the money.

And yet: medical research needs real patient data to move forward — and AI
models need it even more. Medical copilots, diagnostic assistants, and
autonomous clinical agents all train on health data. Today that data is
scraped, licensed by institutions, or assembled through opaque partnerships.
The patient is never in the loop, and never compensated.

The gap: no system exists where a patient owns their records, shares them in a
verified and private way, and gets paid — without trusting a centralized entity.

---

## The solution

The patient publishes a medic-signed health record on-chain.
The researcher pays. The patient encrypts the record specifically for that buyer.
Payment is released. The researcher decrypts and verifies.

Key properties:
- Plaintext never leaves the patient's browser
- The medic's EdDSA signature proves authenticity
- Smart contract escrow — no intermediary touches the data

Stack: Solidity on pallet-revive (Asset Hub) + Statement Store for the ciphertext.

**The flywheel:**
- Medics sign records — their attestation is the source of trust
- Patients publish encrypted listings — they own the supply and the upside
- Researchers and medical-AI teams buy verified data — demand side
- Payment flows back to patients — compensation closes the loop
- Better AI tools make medics more effective — more quality records get signed
- The supply grows, the data quality compounds, the patient stays in the loop

The same primitive that pays a patient for a research study is the one that
pays them when a medical-AI model trains on their record.

---

## Why Polkadot is the right home

- **Asset Hub + pallet-revive** — Solidity we already know, deployed on a chain
  with native token settlement and shared security
- **Statement Store** — native ephemeral storage for ciphertext. No IPFS dependency,
  no pinning service, no external infra
- **People Chain** — a real identity layer for physician credentialing
  (KnownGood judgements). We don't need to build that ourselves
- These aren't ports. They're primitives this ecosystem has together, and no other does.

---

## Live demo

Patient lists a signed record → Researcher buys → Patient fulfills →
Researcher decrypts and verifies.

[BLANK STAGE — screen share goes here]

Speaker notes:
1. PatientDashboard — show listing card: title, price, commitment hash. Body text not visible.
2. ResearcherBuy — place buy order, lock 10 PAS. Show tx hash.
3. PatientDashboard — Fulfill. Tx confirmed.
4. ResearcherBuy — Decrypt. Three chips appear: Body hash ✓  Header hash ✓  Medic sig ✓
Keep to 90 seconds.

---

## Honest flaws

What doesn't work yet:

- **We built the full ZK stack** — a 12.8k-constraint Groth16 circuit proving three
  bindings in one proof (medic's EdDSA signature, ECDH + Poseidon stream cipher
  encryption, ciphertext hash), with browser proof generation at ~1.1s. The circuit,
  verifier, zkey, and ptau are in the repo.
- **Verification is currently off-chain**: the buyer runs the three checks after
  decrypting. Moving verification on-chain is still an open engineering question
  we're investigating.
- **Relaxed atomicity**: because verification is off-chain, the patient could send
  garbage ciphertext and keep the money. Phase 5.3 escrow dispute window is the backstop.
- **No physician identity on-chain yet** — Phase 6, People Chain integration.
- **Synthetic data only** — no real patients, no legal review.

---

## What's next

- **Close the griefing gap** — buyer dispute window so a buyer who receives
  garbage ciphertext can reclaim their payment
- **On-chain physician identity** — wire up People Chain credentials so buyers
  can trust the medic key without an off-chain check
- **Re-enable on-chain verification** — revisit the Groth16 verifier using
  pallet-revive host functions for BN254 pairing
- **Pilot with real data** — synthetic today; partner with a research group
  to run a pilot on real, consented records

own-your-medical-records | benja@terrace.fi

---

DESIGN DIRECTIVES:
- Dark background (#111827), white text, Polkadot pink (#E6007A) for highlights.
- Slide 4 (Demo): large blank frame area for live screen share.
- No stock photos. Minimal icons only.
- Dense but scannable — one idea per slide.
````

---

## Demo Script

**Before going on stage:**
- `localhost:5173` open in the browser
- Alice (Patient) logged in on PatientDashboard, one listing ready: `Blood Glucose Panel — Jan 2026`, 10 PAS
- Bob (Researcher) ready on ResearcherBuy in a second tab

**On stage (90 second target):**

1. Show the listing card — point out: title and price are visible, commitment hash is
   on-chain, plaintext is not visible anywhere.
2. Switch to Bob → ResearcherBuy → click Buy → tx confirms.
   *"Payment locked in escrow."*
3. Switch back to Alice → Fulfill button is active → click it.
   *"Escrow released, ciphertext hash stored on-chain."*
4. Switch to Bob → Decrypt panel → click Decrypt → three chips appear. Read them
   out: `Body hash ✓`, `Header hash ✓`, `Medic signature ✓`. Show the decrypted text.
5. Say: *"The plaintext never left Alice's browser until she chose to sell it, to
   this specific buyer."*

**Fallback:** pre-recorded Loom at 1.5× speed if the local node is down.

---

## Related Docs

- [`ZK_ON_PVM_OPEN_QUESTION.md`](./ZK_ON_PVM_OPEN_QUESTION.md) — the open engineering
  question about on-chain ZK verification on pallet-revive (precompile host functions).
- [`ZKCP_DESIGN_OPTIONS.md`](./ZKCP_DESIGN_OPTIONS.md) — full ZKCP design record.
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — two-chain architecture.
