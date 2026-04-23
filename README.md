# Medical Data Marketplace

Patients sell medic-signed health records to researchers without revealing plaintext to anyone except the paying buyer.

**Backend**: Solidity on PVM (pallet-revive, Asset Hub)  
**Frontend**: React + TypeScript (PAPI + viem)  
**Live**: https://own-your-medical-records42.dot.li

---

## How It Works

1. **Medic signs** — Poseidon-hashes the record (header + body + PII compartments), signs the commitment with EdDSA over BabyJubJub.
2. **Patient lists** — publishes commitment + medic signature on-chain, sets a PAS price. No plaintext touches the chain.
3. **Researcher buys** — locks PAS and registers their BabyJubJub public key for ECDH.
4. **Patient fulfills** — encrypts the record in the browser (BabyJubJub ECDH + Poseidon stream cipher), uploads ciphertext to the Statement Store, calls `fulfill()` to release escrow.
5. **Researcher verifies** — decrypts, then checks off-chain: Poseidon hash of plaintext matches on-chain commitment, medic EdDSA signature is valid.

---

## Paseo Contracts

| Contract       | Address                                      |
| -------------- | -------------------------------------------- |
| MedicalMarket  | `0xf9bdefc23b6dc2a71a8a97d43ebb45e0c86a1ef9` |
| MedicAuthority | `0x0c21366490d98141f04c00c31456aca803db758f` |

Statement Store lives on People Chain (`wss://paseo-people-next-rpc.polkadot.io`) — Asset Hub Paseo collator does not expose `statement_submit`; the hook resolves this automatically.

Frontend deploys to Bulletin Chain / DotNS automatically on push to `master` via `.github/workflows/deploy-frontend.yml`.

---

## Run Locally

Requires Node.js 22.x and Rust stable.

```bash
./scripts/download-sdk-binaries.sh   # fetch polkadot-omni-node, eth-rpc, zombienet
./scripts/start-all.sh               # relay + parachain + contracts + frontend
```

Frontend at http://127.0.0.1:5173. Bootstraps Alice/Bob/Charlie with PAS, deploys contracts, registers Alice as a verified medic.

Deploy contracts to Paseo:

```bash
cd contracts/pvm && npm run set-deployments
```

Compiles contracts, derives the multisig address from `Council1.json` / `Council2.json` / `Medic.json` keystores, deploys both contracts, and writes `web/src/config/deployments.ts`. Requires `VITE_ACCOUNT_0_PK` in `web/.env.local` (funded via faucet).

---

## What Works

- Full end-to-end flow locally and on Paseo
- Off-chain BabyJubJub ECDH + Poseidon encryption entirely in the browser
- Three-compartment Poseidon commitments (header / body / PII separated)
- Statement Store integration on People Chain (unstable) using local statement store works.
- 2-of-3 pallet-multisig governance for MedicAuthority
- Nova Wallet / Spektr mobile support

## Known Gaps

**Relaxed atomicity**: a patient could `fulfill()` with a garbage ciphertext and collect payment. The researcher detects the mismatch after decryption (commitment chips render ✗) but has no on-chain reclaim path. A time-locked dispute window is the planned fix.

**ZK verification is off-chain**: the circuit works and proofs generate in the browser — but on-chain verification was dropped (see Design Compromises). The buyer runs the checks themselves after decrypting.

**No on-chain physician identity**: medic registry is a multisig-owned contract. People Chain KnownGood identity integration is next.

**Statement Store asymmetry**: `statement_submit` is only available on the People Chain collator on Paseo, not Asset Hub. The resolver in `useStatementStore.ts` auto-routes around this, but it's a testnet gap worth filing upstream.

**Synthetic data only**: no real patients, no legal review. MVP uses test records only. GDPR / HIPAA legal opinion required before processing real health data.

**Ephemeral ciphertext storage**: encrypted records are stored in the Statement Store, which is ephemeral. Long-term the ciphertext should move to Bulletin Chain so patients can keep their records available without staying online — but Bulletin Chain's large-asset upload path hit size limits in testing (see Design Compromises).

---

## Design Compromises

**The original design was a ZK contingent payment.** We built a complete Groth16 circuit (`circuits/medical_disclosure.circom`) — 12.8k constraints — that bound three properties in a single proof: the medic's EdDSA signature over the record commitment, the ECDH encryption binding the ciphertext to the buyer's key, and the Poseidon hash chain linking plaintext to the on-chain commitment. Browser proof generation worked at ~1.1s with snarkjs. The Verifier contract compiled and deployed.

The bottleneck was on-chain verification: BN254 pairing on PVM consumed ~800M gas weight on Paseo, roughly 5–10× the block weight budget. There is no BN254 precompile on Asset Hub today. We filed this as an open question in `docs/product/ZK_ON_PVM_OPEN_QUESTION.md` and dropped the on-chain proof for now. The circuit, zkey, and Verifier are kept in the repo as a working reference for when the precompile lands. For sure we could took computation off-ciruit but for timing reasons we didn't explore that path.

**Why Poseidon instead of keccak256**: the commitment scheme uses Poseidon hashing because it was designed to be verified inside the Groth16 circuit — it costs ~300 constraints vs ~27,000 for keccak256. Now that verification is off-chain, the commitment could migrate to keccak256 (tracked as `TODO(ecdsa-migration)` throughout the frontend). The migration would also eliminate the `@zk-kit` bundle (643 kB) which currently causes Bulletin Chain deployment issues.

**Why multisig for medic authority**: a 2-of-3 pallet-multisig owns the `MedicAuthority` contract instead of a DAO or People Chain identity judgements. Simpler to bootstrap. The on-chain identity path requires the People Chain KnownGood integration which isn't done yet. And for curiosity i wanted to explore pallet-multisig as a governance primitive.

---

## Versions

|              |                                         |
| ------------ | --------------------------------------- |
| polkadot-sdk | stable2512-3 / pallet-revive 0.12.2     |
| Solidity     | 0.8.28 / resolc 1.0.0                   |
| PAPI         | 1.23.3 / viem 2.x                       |
| @zk-kit      | baby-jubjub 1.0.3, eddsa-poseidon 1.1.0 |
| Node.js      | 22.x LTS                                |
