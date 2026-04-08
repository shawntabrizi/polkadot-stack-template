#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RPC_URL="${RPC_URL:-ws://127.0.0.1:9944}"
HTTP_URL="${RPC_URL/ws:\/\//http://}"
HTTP_URL="${HTTP_URL/wss:\/\//https://}"
CHAIN_SPEC="$ROOT_DIR/blockchain/chain_spec.json"
RUNTIME_WASM="$ROOT_DIR/target/release/wbuild/stack-template-runtime/stack_template_runtime.compact.compressed.wasm"

cleanup() {
  if [[ -n "${NODE_PID:-}" ]]; then
    kill "$NODE_PID" >/dev/null 2>&1 || true
    wait "$NODE_PID" >/dev/null 2>&1 || true
  fi
  rm -rf "${TMP_DIR:-}"
}

trap cleanup EXIT

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

TMP_DIR="$(mktemp -d)"
NODE_LOG="$TMP_DIR/node.log"
TEST_FILE="$TMP_DIR/statement.txt"

rpc_ready() {
  curl -s \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","id":1,"method":"system_chain","params":[]}' \
    "$HTTP_URL" >/dev/null 2>&1
}

echo "=== Statement Store Smoke Test ==="
echo ""

require_command cargo
require_command curl
require_command chain-spec-builder
require_command polkadot-omni-node

echo "[1/6] Building runtime..."
cargo build -p stack-template-runtime --release

echo "[2/6] Generating chain spec..."
chain-spec-builder \
  -c "$CHAIN_SPEC" \
  create \
  --chain-name "Polkadot Stack Template" \
  --chain-id "polkadot-stack-template" \
  -t development \
  --relay-chain paseo \
  --para-id 1000 \
  --runtime "$RUNTIME_WASM" \
  named-preset development

echo "[3/6] Starting omni-node with Statement Store enabled..."
polkadot-omni-node \
  --chain "$CHAIN_SPEC" \
  --tmp \
  --alice \
  --force-authoring \
  --no-prometheus \
  --unsafe-force-node-key-generation \
  --rpc-cors all \
  --enable-statement-store \
  -- \
  --no-prometheus \
  >"$NODE_LOG" 2>&1 &
NODE_PID=$!

echo "  Waiting for RPC at $RPC_URL..."
for _ in $(seq 1 60); do
  if rpc_ready; then
    break
  fi
  sleep 1
done

if ! rpc_ready; then
  echo "Node did not become ready. Recent log output:"
  tail -n 50 "$NODE_LOG" || true
  exit 1
fi

echo "[4/6] Verifying the store starts empty..."
EMPTY_DUMP="$(cargo run -q -p stack-cli -- --url "$RPC_URL" chain statement-dump)"
if ! grep -q "No statements in the store." <<<"$EMPTY_DUMP"; then
  echo "Expected an empty store, got:"
  echo "$EMPTY_DUMP"
  exit 1
fi

echo "[5/6] Submitting a signed statement..."
cat >"$TEST_FILE" <<'EOF'
statement-store-smoke
EOF

SUBMIT_OUTPUT="$(cargo run -q -p stack-cli -- --url "$RPC_URL" chain statement-submit --file "$TEST_FILE" --signer alice)"
STATEMENT_HASH="$(
  grep -E "Statement hash:|Hash:" <<<"$SUBMIT_OUTPUT" | awk '{print $NF}'
)"

if [[ -z "$STATEMENT_HASH" ]]; then
  echo "Could not parse statement hash from submit output:"
  echo "$SUBMIT_OUTPUT"
  exit 1
fi

echo "[6/6] Dumping statements and checking the submitted hash is present..."
DUMP_OUTPUT="$(cargo run -q -p stack-cli -- --url "$RPC_URL" chain statement-dump)"

if ! grep -q "$STATEMENT_HASH" <<<"$DUMP_OUTPUT"; then
  echo "Submitted statement hash $STATEMENT_HASH not found in dump:"
  echo "$DUMP_OUTPUT"
  exit 1
fi

if ! grep -q "proof=true" <<<"$DUMP_OUTPUT"; then
  echo "Expected the dumped statement to include a proof:"
  echo "$DUMP_OUTPUT"
  exit 1
fi

echo ""
echo "Smoke test passed."
