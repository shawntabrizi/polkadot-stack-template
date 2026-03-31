#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== Polkadot Stack Template - Frontend ==="
echo ""

cd "$ROOT_DIR/web"
npm install

# Generate PAPI descriptors from the running chain
if curl -s -o /dev/null http://127.0.0.1:9944 2>/dev/null; then
    echo "Node detected at ws://127.0.0.1:9944 - updating PAPI descriptors..."
    npm run update-types
    npm run codegen
else
    echo "WARNING: Node not running at ws://127.0.0.1:9944"
    echo "  Start the node first: ./scripts/start-dev.sh"
    echo "  PAPI descriptors may be stale or missing."
    echo ""
fi

npm run dev
