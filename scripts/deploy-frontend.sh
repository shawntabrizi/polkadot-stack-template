#!/usr/bin/env bash
# Deploy the frontend to Bulletin Chain and register a DotNS domain via
# playground-cli (the `dot` command). Wraps `dot deploy` so the workflow
# stays a single script invocation.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

DOMAIN=""
PUBLISH=0
while [[ $# -gt 0 ]]; do
    case "$1" in
        --domain|-d) DOMAIN="$2"; shift 2 ;;
        --playground|-p) PUBLISH=1; shift ;;
        -h|--help)
            cat <<'EOF'
Usage: scripts/deploy-frontend.sh [--domain <name>] [--playground]

Builds web/ and deploys it to the Polkadot Bulletin Chain, registering a
DotNS domain in one step. Runs `dot deploy` under the hood.

Options:
  -d, --domain <name>   DotNS label (default: polkadot-stack-template00.dot)
  -p, --playground      Also publish to the Playground registry

Environment:
  MNEMONIC   Optional Substrate URI (e.g. '//Alice' or a full 12-word
             mnemonic) passed to `dot deploy --suri`. When unset, the
             shared dev signer (`--signer dev`) is used.

Prerequisites:
  dot (playground-cli):
    curl -fsSL https://raw.githubusercontent.com/paritytech/playground-cli/main/install.sh | bash
  ipfs (Kubo):
    macOS: brew install ipfs && ipfs init
    Linux: https://docs.ipfs.tech/install/command-line/

First-run setup:
  dot init            # QR login, toolchain, account funding, H160 map
EOF
            exit 0
            ;;
        *) echo "Unknown argument: $1"; echo "Run '$0 --help' for usage."; exit 1 ;;
    esac
done

DOMAIN="${DOMAIN:-polkadot-stack-template00.dot}"

echo "=== Deploy Frontend via playground-cli (dot) ==="
echo "  Domain: $DOMAIN"
echo "  URL:    https://$DOMAIN.li"
echo ""

if ! command -v dot &>/dev/null; then
    echo "ERROR: 'dot' (playground-cli) not installed."
    echo "Install: curl -fsSL https://raw.githubusercontent.com/paritytech/playground-cli/main/install.sh | bash"
    exit 1
fi

if ! command -v ipfs &>/dev/null; then
    echo "ERROR: IPFS (Kubo) not installed (required by dot deploy)."
    echo "macOS: brew install ipfs && ipfs init"
    echo "Linux: see https://docs.ipfs.tech/install/command-line/"
    exit 1
fi

SIGNER_ARGS=(--signer dev)
if [ -n "${MNEMONIC:-}" ]; then
    SIGNER_ARGS+=(--suri "$MNEMONIC")
fi

DEPLOY_ARGS=(--domain "$DOMAIN" --buildDir dist "${SIGNER_ARGS[@]}")
if [ "$PUBLISH" -eq 1 ]; then
    DEPLOY_ARGS+=(--playground)
fi

cd "$ROOT_DIR/web"

echo "Running: dot deploy ${DEPLOY_ARGS[*]}"
dot deploy "${DEPLOY_ARGS[@]}"
