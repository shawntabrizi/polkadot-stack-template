#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== Deploy Frontend to IPFS ==="
echo ""

# Build the frontend
echo "[1/3] Building frontend..."
cd "$ROOT_DIR/web"
npm install --silent
npm run build
echo "  Build output: web/dist/"

# Check for w3 CLI (web3.storage)
if ! command -v w3 &>/dev/null; then
    echo ""
    echo "[2/3] w3 CLI not found. Install it to deploy to IPFS:"
    echo "  npm install -g @web3-storage/w3cli"
    echo "  w3 login your@email.com"
    echo "  w3 space create polkadot-stack-template"
    echo ""
    echo "Then re-run this script."
    echo ""
    echo "Alternatively, push to GitHub and use the CI workflow:"
    echo "  .github/workflows/deploy-frontend.yml"
    exit 1
fi

# Upload to IPFS via web3.storage
echo "[2/3] Uploading to IPFS via web3.storage..."
CID=$(w3 up "$ROOT_DIR/web/dist" --no-wrap 2>&1 | grep -oE 'bafy[a-zA-Z0-9]+' | head -1)

if [ -z "$CID" ]; then
    echo "  ERROR: Failed to upload to IPFS"
    exit 1
fi

echo "  IPFS CID: $CID"
echo "  Gateway:  https://$CID.ipfs.w3s.link"

# Optional DotNS follow-up
echo "[3/3] Optional: point a DotNS domain to this deployment"
echo ""
echo "  Option A: Use the DotNS UI"
echo "    1. Go to https://dotns.app"
echo "    2. Register or manage your .dot domain"
echo "    3. Set the content hash to: ipfs://$CID"
echo ""
echo "  Option B: Use the GitHub Actions workflow"
echo "    1. Set DOTNS_MNEMONIC secret in your repo settings"
echo "    2. Update the domain in .github/workflows/deploy-frontend.yml"
echo "    3. Push to main/master to trigger automatic deployment"
echo ""
echo "=== Frontend deployed to IPFS ==="
echo "  CID: $CID"
echo "  URL: https://$CID.ipfs.w3s.link"
