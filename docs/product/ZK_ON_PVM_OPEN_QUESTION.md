# On-chain ZK Verification on pallet-revive — Open Question

**Status:** open research. Not a blocker for Phase 5.2, but resolving this unlocks
stronger atomicity guarantees for Phase 6.

---

## Background

Phase 5.1 shipped a Groth16 verifier compiled to PVM:

- Circuit: `circuits/medical_disclosure.circom` — 12,791 R1CS constraints over BN254.
- Proves three bindings in one proof: medic's EdDSA-Poseidon signature,
  ECDH + Poseidon stream cipher encryption, and ciphertext hash.
- Browser proof generation (snarkjs + WASM): ~1.1s. Works.
- Verifier: `contracts/pvm/contracts/Verifier.sol` — pure-Solidity Groth16 verifier
  generated from `verification_key.json`. Compiles to PVM via `resolc`.

In Phase 5.2 we moved verification off-chain. The stated reason was that calls to
`Verifier.verifyProof(...)` from the browser hit `ref_time` / `ExhaustsResources`
failures on Paseo Asset Hub. The conclusion at the time was "BN254 pairing on PVM
is too expensive." That conclusion is almost certainly incomplete.

---

## What we measured

From the browser against Paseo Asset Hub (pallet-revive, `Revive.call`):

| `ref_time` supplied | Result |
|---|---|
| `3e9` | `ContractReverted` / OOG inside `ecPairing` loop |
| `30e9` | still OOG |
| `100e9` | `ExhaustsResources` (single extrinsic over block budget) |

The gap between "too low" and "over block budget" was narrow enough that tuning
became unreliable, and we pivoted to off-chain verification to ship Phase 5.2.

---

## Why the "no pairing on PVM" framing is probably wrong

PVM (PolkaVM) is a 64-bit RISC-V VM. The EVM is a 256-bit VM. Emulating 256-bit
`mulmod` (the heart of BN254 arithmetic) as a chain of 64-bit RISC-V ops is
estimated 20–30× slower than native EVM. So **pure-Solidity** BN254 math on
pallet-revive is indeed economically non-viable — which matches what we saw.

**However:** pallet-revive exposes **host functions** (a.k.a. precompiles) at the
same Ethereum-standard addresses that EVM code already calls:

- `0x06` — `ecAdd`
- `0x07` — `ecMul`
- `0x08` — `ecPairing`

When a Solidity contract on pallet-revive calls these addresses, the execution is
supposed to **leave the RISC-V VM entirely** and run as native Rust (e.g. via
`arkworks`) inside the Substrate node. Reported figures (public Polkadot
engineering blog posts, 2025/2026) put pairing cost in the `~0.05ms / ~2000 gas`
range when host functions are active — i.e. *faster* than Ethereum L1, not slower.

**Two possibilities explain our measurements:**

1. **Precompiles aren't enabled on Paseo Asset Hub's `pallet-revive` config** — the
   chain's runtime may not have wired `ecPairing` / `ecMul` as host functions, so
   the Solidity call falls through to the pure-RISC-V verifier. This would exactly
   reproduce our OOG pattern.
2. **Our verifier bytecode doesn't actually hit the precompile addresses** — e.g.
   `resolc` may inline the BN254 ops instead of emitting `staticcall 0x08`, or
   the snarkjs-generated verifier uses an older pairing layout that resolc
   doesn't recognize as a precompile call.

We haven't distinguished between these cases. That's the open question.

---

## How to resolve it

In rough order of cost:

1. **Read pallet-revive's runtime config for Paseo Asset Hub** — check which host
   functions are registered. Look in `blockchain/runtime/` and the upstream
   polkadot-sdk `pallet-revive` configuration. Key symbols to grep: `precompile`,
   `Precompiles`, `ecPairing`, `bn128`, `bn254`, `0x08`.
2. **Inspect compiled verifier bytecode** — `resolc`-compile `Verifier.sol` with
   verbose output, disassemble the PVM blob, and confirm whether the pairing call
   appears as a `staticcall(0x08, ...)` or as inlined bytecode. If inlined, the
   precompile is never reached regardless of chain config.
3. **Isolate test** — deploy a minimal contract whose only job is
   `ecPairing(0x08, ...)` on a known-valid pairing fixture, then call it from the
   browser and measure `ref_time`. If it's in the `2000` range, precompiles are
   live; if it's in the `1e9+` range, they aren't.
4. **Try a local node** — our local dev node may have different precompile config
   than Paseo. If the same test passes locally and fails on Paseo, we've
   isolated the problem to Paseo's runtime.
5. **Check benchmarks** — any public benchmark from Parity / Web3 Foundation on
   `pallet-revive` + Ethereum precompiles on Paseo specifically. The
   WHY_POLKADOT and POLKADOT_INTEGRATION_GOTCHAS docs may need updating once we
   have a definitive answer.

---

## Implications for the product

- **Phase 5.2 (shipped)**: off-chain verification + Phase 5.3 escrow dispute
  window is a reasonable posture regardless of the outcome — it's simpler and
  avoids the dependency on chain-specific precompile availability.
- **Phase 6**: if precompiles are live, we can re-enable the on-chain verifier for
  stronger atomicity. If they aren't, we have three options:
  - Wait for the parachain runtime to enable them (policy / upstream question).
  - Migrate to BLS12-381 and use pallet-revive's BLS host functions if those
    are enabled instead.
  - Accept off-chain verification permanently; rely on escrow + reputation for
    atomicity.

---

## Do not claim in external comms

Until this is resolved, **do not** state in pitch decks, blog posts, or public
writing any of the following:

- "PVM has no pairing precompile" (unverified — likely wrong).
- "PVM is 12× faster than Ethereum for pairing" (unverified — may be true with
  host functions, but we haven't measured).
- "On-chain ZK verification is impossible on pallet-revive" (overstatement of
  what we actually observed).

Acceptable phrasing for now: *"We moved ZK verification off-chain for Phase 5.2.
Re-enabling on-chain verification via pallet-revive host functions is an open
engineering question we're investigating."*
