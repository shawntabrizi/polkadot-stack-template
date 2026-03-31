#!/usr/bin/env bash
set -euo pipefail

echo "=== Deploy Contracts to Polkadot TestNet ==="
echo ""
echo "Make sure you have set your private key:"
echo "  cd contracts/evm && npx hardhat vars set PRIVATE_KEY"
echo "  cd contracts/pvm && npx hardhat vars set PRIVATE_KEY"
echo ""
echo "Get testnet tokens at: https://faucet.polkadot.io/"
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Deploy EVM contract (solc)
echo "[1/2] Deploying ProofOfExistence via EVM (solc)..."
cd "$ROOT_DIR/contracts/evm"
npm install
npx hardhat compile
npm run deploy:testnet

# Deploy PVM contract (resolc)
echo "[2/2] Deploying ProofOfExistence via PVM (resolc)..."
cd "$ROOT_DIR/contracts/pvm"
npm install
npx hardhat compile
npm run deploy:testnet

echo ""
echo "=== Deployment complete ==="
