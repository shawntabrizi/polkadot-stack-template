# PVM ZK Research: Groth16 on Asset Hub (pallet-revive)

## Summary

Groth16 proofs (from Circom + snarkjs) can be verified on Asset Hub via pallet-revive, but
the standard snarkjs-generated `Verifier.sol` does NOT compile with `resolc` out of the box.
A pure-Solidity verifier is required.

---

## What Works

### BN254 Precompiles — CONFIRMED in polkadot-sdk source

All three BN254 precompiles are implemented as host functions in
`substrate/frame/revive/src/precompiles/builtin/bn128.rs`:

| Address | Operation    | Status      |
|---------|--------------|-------------|
| `0x06`  | Bn128Add     | ✅ Implemented |
| `0x07`  | Bn128Mul     | ✅ Implemented |
| `0x08`  | Bn128Pairing | ✅ Implemented |

When a contract calls `address(0x08).staticcall(...)`, the PVM traps to the Polkadot host
which runs the pairing check natively in Rust (arkworks/pairing crates).

---

## What Doesn't Work

### Inline Assembly in `resolc`

`resolc` is a Yul-to-RISC-V translator, not an EVM emulator. The snarkjs `Verifier.sol`
uses EVM-specific assembly to pack curve points before hitting the precompile:

```solidity
assembly {
    mstore(...)
    success := staticcall(sub(gas(), 2000), 8, ...)
}
```

These patterns use EVM-specific stack/memory assumptions that do not map 1:1 to the RISC-V
register machine. `resolc` compilation fails or produces incorrect results.

**Evidence**: Searched `polkadot-sdk` source — no assembly translation support found.
Confirmed by independent research (2026).

---

## The Fix: Pure-Solidity Groth16 Verifier

Replace every assembly block with `abi.encodePacked` + high-level `staticcall`.
The precompiles themselves work fine — only the assembly packing is the problem.

### Pairing wrapper pattern:
```solidity
function _pairing(bytes memory input) internal view returns (bool) {
    (bool success, bytes memory result) = address(0x08).staticcall(input);
    require(success && result.length > 0, "pairing call failed");
    return abi.decode(result, (bool));
}
```

### Key injection:
Copy G1/G2 verification key points from `verification_key.json` directly into Solidity
`constant` state variables (not storage — see Proof Size note below).

### Template approach:
Patch the snarkjs EJS template at `node_modules/snarkjs/templates/verifier_groth16.sol.ejs`
to strip all assembly blocks and replace with staticcall pattern. Reusable across circuits.

---

## Constraints to Keep in Mind

| Constraint | Detail |
|---|---|
| **Contract size** | resolc output can be larger than solc. Limit is 128KB–256KB depending on parachain. Use `--optimize` flag if needed. |
| **RefTime** | A single Groth16 verification uses ~10–20% of a block's weight limit. Fine for Phase 3, not batchable at scale. |
| **Proof Size** | Every state byte read adds to the block witness. Hardcode verification key as `constant` (code blob) not `mapping` (storage). |

---

## Sources

- `polkadot-sdk/substrate/frame/revive/src/precompiles/builtin/bn128.rs` — precompile source
- `polkadot-sdk/substrate/frame/revive/src/precompiles/builtin.rs` — precompile registry
- Independent technical confirmation, April 2026
