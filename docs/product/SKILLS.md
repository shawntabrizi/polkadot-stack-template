# Skills Database

Skills needed to build the protocol, organized by implementation phase.
For each skill: what it is, why we need it, where to learn it, difficulty, and known risks.

---

## Phase 0 Skills

### Solidity on pallet-revive (PVM)
- **Why**: All marketplace contracts are Solidity compiled to PVM via `resolc`
- **Difference from standard Solidity**: Some opcodes behave differently on PVM. `address.transfer()` and `address.call()` have differences. Check pallet-revive docs for opcode compatibility.
- **Resources**: [pallet-revive docs](https://docs.polkadot.com/develop/smart-contracts/), `contracts/pvm/` in this repo
- **Difficulty**: Medium — Solidity itself is easy; PVM quirks need testing
- **Risk**: Gas estimation differs from EVM. Test every function on local PVM node, not just Hardhat.

### resolc (Solidity → PVM compiler)
- **Why**: Compiles `.sol` files to RISC-V bytecode for PVM
- **Resources**: `contracts/pvm/` hardhat config in this repo, [resolc releases](https://github.com/paritytech/revive)
- **Difficulty**: Low to use, Medium to debug
- **Risk**: Not all Solidity patterns compile cleanly. Some libraries (especially those using inline assembly) will fail. Log failures in `EXTERNAL_DEPS.md`.

### PAPI (Polkadot API)
- **Why**: Frontend interacts with Asset Hub contracts and chain state
- **Resources**: [papi.how](https://papi.how/), `web/` in this repo
- **Difficulty**: Medium
- **Risk**: PAPI descriptors need to be regenerated when the runtime changes. `web/.papi/` has pre-generated ones.

### Asset Hub local node setup
- **Why**: Local development environment for contract deployment
- **Resources**: `scripts/start-local.sh`, `docker-compose.yml` in this repo
- **Difficulty**: Low

### IPFS basics (upload + fetch by CID)
- **Why**: Encrypted blobs are stored on IPFS; CID is anchored on-chain
- **Resources**: [ipfs-http-client](https://github.com/ipfs/js-kubo-rpc-client), Pinata or local IPFS node
- **Difficulty**: Low
- **Risk**: IPFS availability is not guaranteed. For MVP, use a pinning service or include the encrypted blob directly in contract calldata as fallback.

---

## Phase 1 Skills

### @zk-kit/lean-imt (Incremental Merkle Tree)
- **Why**: Constructs the Poseidon Merkle tree over JSON record fields
- **Resources**: [zk-kit GitHub](https://github.com/privacy-scaling-explorations/zk-kit), `@zk-kit/lean-imt` npm package
- **Difficulty**: Low
- **Key API**: `new LeanIMT(poseidon2)`, `.insert(leaf)`, `.generateProof(index)`
- **Risk**: Leaf ordering matters. The circuit must use the same field ordering as the TypeScript utility. Define and lock the JSON field order early.

### @zk-kit/eddsa-poseidon (EdDSA over BabyJubJub)
- **Why**: Medic signs the Merkle root; signature is later verified inside the ZK circuit
- **Resources**: [npm: @zk-kit/eddsa-poseidon](https://www.npmjs.com/package/@zk-kit/eddsa-poseidon)
- **Difficulty**: Low
- **Key API**: `eddsa.generatePrivKey()`, `eddsa.signMiMCSponge(privKey, msg)`, `eddsa.verifyMiMCSponge(msg, sig, pubKey)`
- **Risk**: The signature scheme must match what circomlib's EdDSA circuit expects. Use the same hashing function (MiMC or Poseidon) consistently.

---

## Phase 2 Skills

### Semaphore v4
- **Why**: Anonymous group membership proofs for medic attestation
- **Resources**: [semaphore.pse.dev](https://semaphore.pse.dev/), [@semaphore-protocol/core](https://www.npmjs.com/package/@semaphore-protocol/core)
- **Difficulty**: Medium
- **Key concepts**: Identity (trapdoor + nullifier → commitment), Group (Merkle tree of commitments), Proof (signal + nullifier hash + group root)
- **Risk**: Semaphore contracts must be compiled via `resolc` for PVM. Test the compiled verifier with a real proof before proceeding to Phase 3.

### Node.js backend (Mixer Box)
- **Why**: Off-chain service that bridges People Chain identity to Semaphore group
- **Difficulty**: Low — standard Express.js + polkadot.js
- **Key steps**: receive signature → verify on People Chain → call `addMember()` on Asset Hub
- **Risk**: People Chain testnet (Paseo) availability. Mock it locally first with a simple Node.js script that returns `KnownGood` for any address.

### People Chain Identity Pallet
- **Why**: Source of truth for verified medics
- **Resources**: [Polkadot Identity docs](https://wiki.polkadot.network/docs/learn-identity)
- **Difficulty**: Medium
- **Risk**: People Chain on Paseo testnet may not have full identity pallet support. Verify before depending on it. Mock locally if needed.

---

## Phase 3 Skills

### Circom (ZK circuit language)
- **Why**: Write the proof circuits for Merkle inclusion, EdDSA verification, Semaphore, ECDH + Poseidon encryption
- **Resources**: [docs.circom.io](https://docs.circom.io/), [circomlib](https://github.com/iden3/circomlib)
- **Difficulty**: High
- **Key circuits from circomlib**: `eddsa.circom`, `smt/smtverifier.circom`, `poseidon.circom`, `merkleProof.circom`
- **Risk**: Constraint count can explode with complex circuits. Measure after each addition. Target < 2M constraints for browser proving.

### snarkjs (Groth16 proof generation + verification)
- **Why**: Generate proofs in the browser and export Solidity verifier contracts
- **Resources**: [snarkjs GitHub](https://github.com/iden3/snarkjs)
- **Difficulty**: Medium
- **Key steps**: `circom compile` → `snarkjs groth16 setup` → `snarkjs groth16 prove` → `snarkjs generateverifier`
- **Risk**: Trusted setup (Powers of Tau). For MVP, use an existing ceremony (Hermez or Iden3). Do not run a custom ceremony.

### Groth16 Verifier on PVM
- **Why**: The snarkjs-generated Solidity verifier must be compiled via `resolc` to run on PVM
- **Difficulty**: Medium–High
- **Risk**: This is the highest-risk compilation step. The verifier uses `uint256` arithmetic and pairing precompile calls. PVM handles these differently from EVM. **Must be tested in Phase 3 before writing the marketplace contract.**
- **Fallback**: If `resolc` fails on the verifier, deploy on EVM (Hardhat) for demo. Log in `EXTERNAL_DEPS.md`.

---

## Phase 4–5 Skills

### @zk-kit/poseidon-cipher (ECDH + Poseidon encryption)
- **Why**: Encrypt disclosed fields for the buyer inside the ZK circuit
- **Resources**: [npm: @zk-kit/poseidon-cipher](https://www.npmjs.com/package/@zk-kit/poseidon-cipher)
- **Difficulty**: Low (TypeScript), Medium (in-circuit)
- **Key API**: `poseidonEncrypt(msg, key, nonce)`, `poseidonDecrypt(ciphertext, key, nonce, len)`
- **Risk**: The in-circuit version (Circom) must use the same parameters as the JS version. Use the `@zk-kit/poseidon-cipher` Circom package directly.

### BabyJubJub ECDH in Circom
- **Why**: Derive shared secret from buyer's public key inside the circuit
- **Resources**: [PSE zk-kit Circom packages](https://github.com/privacy-scaling-explorations/zk-kit/tree/main/packages), `Ecdh.circom`
- **Difficulty**: Medium
- **Risk**: Ephemeral key management on the patient's side. The patient generates an ephemeral BabyJubJub keypair per transaction. The ephemeral public key is a circuit public output — the buyer needs it to derive the shared secret for decryption.

---

## Phase 6 Skills

### v0 (UI scaffolding)
- **Why**: Generate dashboard UIs for medic, patient, and researcher flows
- **Resources**: [v0.dev](https://v0.dev/)
- **Difficulty**: Low
- **Note**: Use v0 for layout and component scaffolding. Wire blockchain interactions manually with PAPI + snarkjs.

### Paseo testnet deployment
- **Why**: Final demo environment
- **Resources**: `scripts/deploy-paseo.sh`, [Polkadot Faucet](https://faucet.polkadot.io/)
- **Difficulty**: Low
- **Risk**: Testnet instability. Have a local fallback demo ready.

---

## Skill Risk Summary

| Skill | Phase | Risk Level | Fallback |
|---|---|---|---|
| resolc compilation | 0+ | Medium | EVM Hardhat for local testing |
| Semaphore on PVM | 2 | High | Pure Solidity verifier without PVM |
| Circom circuit dev | 3 | High | Simplify circuit scope |
| Groth16 verifier on PVM | 3 | Very High | EVM fallback for demo |
| BabyJubJub ECDH in-circuit | 5 | Medium | Off-chain ECDH (weaker but functional) |
| People Chain on Paseo | 2 | Medium | Local mock script |
| IPFS availability | 0+ | Low | Calldata fallback |
