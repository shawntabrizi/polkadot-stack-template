#!/usr/bin/env bash
set -euo pipefail
CIRCUIT=medical_disclosure
BUILD=build
PTAU=powersOfTau28_hez_final_15.ptau

mkdir -p ${BUILD}

echo "==> Compiling circuit..."
circom ${CIRCUIT}.circom --r1cs --wasm --sym -o ${BUILD} \
  -l node_modules/circomlib/circuits \
  -l node_modules/@zk-kit/circuits/circom

echo "==> Constraint count:"
npx snarkjs r1cs info ${BUILD}/${CIRCUIT}.r1cs

echo "==> Downloading ptau (~70MB, skipped if present)..."
[ -f "${PTAU}" ] || curl -L -o "${PTAU}" \
  "https://storage.googleapis.com/zkevm/ptau/${PTAU}"

echo "==> Groth16 setup..."
npx snarkjs groth16 setup \
  ${BUILD}/${CIRCUIT}.r1cs \
  ${PTAU} \
  ${BUILD}/${CIRCUIT}_0000.zkey

echo "==> Dev contribution (NOT for production)..."
npx snarkjs zkey contribute \
  ${BUILD}/${CIRCUIT}_0000.zkey \
  ${BUILD}/${CIRCUIT}_final.zkey \
  --name="Phase3Dev" \
  -e="$(openssl rand -hex 32)" \
  -v

echo "==> Exporting verification key..."
npx snarkjs zkey export verificationkey \
  ${BUILD}/${CIRCUIT}_final.zkey \
  ${BUILD}/verification_key.json

echo "==> Exporting snarkjs Solidity verifier (reference — needs pure-Solidity wrapper for PVM)..."
npx snarkjs zkey export solidityverifier \
  ${BUILD}/${CIRCUIT}_final.zkey \
  ${BUILD}/Verifier_snarkjs.sol

echo ""
echo "Done. Next steps:"
echo "  1. Copy artifacts to frontend:"
echo "     cp ${BUILD}/${CIRCUIT}_js/${CIRCUIT}.wasm ../web/public/circuits/"
echo "     cp ${BUILD}/${CIRCUIT}_final.zkey ../web/public/circuits/"
echo "  2. Fill VK constants in ../contracts/pvm/contracts/Verifier.sol from ${BUILD}/verification_key.json"
echo "  3. node test/test_circuit.mjs"
