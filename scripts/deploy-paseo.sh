#!/usr/bin/env bash
set -euo pipefail

echo "=== Deploy Contracts to Paseo Asset Hub ==="
echo ""
echo "Required: export PRIVATE_KEY=0x<your-paseo-account-key>"
echo "Get testnet tokens at: https://faucet.polkadot.io/"
echo ""

if [[ -z "${PRIVATE_KEY:-}" ]]; then
	echo "Error: PRIVATE_KEY is not set."
	exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Build Rust PVM contract (uses contracts/pvm/.cargo/config.toml for the PolkaVM target)
echo "[1/2] Building DotTransfer (Rust → PolkaVM)..."
cd "$ROOT_DIR/contracts/pvm"
cargo build --release
echo "      Built: target/dot-transfer.release.polkavm"

# Deploy via viem (reads the .polkavm blob and the generated ABI)
echo "[2/2] Deploying to Paseo Asset Hub..."
npm ci --silent
npm run deploy:paseo

echo ""
echo "=== Deployment complete ==="
