#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
NODE_PID=""
ETH_RPC_PID=""
FRONTEND_PID=""

cleanup() {
    echo ""
    echo "Shutting down..."
    if [ -n "$FRONTEND_PID" ]; then
        kill "$FRONTEND_PID" 2>/dev/null || true
        wait "$FRONTEND_PID" 2>/dev/null || true
    fi
    if [ -n "$ETH_RPC_PID" ]; then
        kill "$ETH_RPC_PID" 2>/dev/null || true
        wait "$ETH_RPC_PID" 2>/dev/null || true
    fi
    if [ -n "$NODE_PID" ]; then
        kill "$NODE_PID" 2>/dev/null || true
        wait "$NODE_PID" 2>/dev/null || true
    fi
}
trap cleanup EXIT INT TERM

echo "=== Polkadot Stack Template - Full Dev Environment ==="
echo ""

# Build the runtime
echo "[1/7] Building runtime..."
cargo build -p stack-template-runtime --release

# Create the chain spec
echo "[2/7] Generating chain spec..."
chain-spec-builder \
    -c "$ROOT_DIR/blockchain/chain_spec.json" \
    create -t development \
    --relay-chain paseo \
    --para-id 1000 \
    --runtime "$ROOT_DIR/target/release/wbuild/stack-template-runtime/stack_template_runtime.compact.compressed.wasm" \
    named-preset development

# Install and compile contracts
echo "[3/7] Compiling contracts..."
cd "$ROOT_DIR/contracts/evm" && npm install --silent && npx hardhat compile
cd "$ROOT_DIR/contracts/pvm" && npm install --silent && npx hardhat compile
cd "$ROOT_DIR"

# Start the node in background
echo "[4/7] Starting omni-node..."
polkadot-omni-node --chain "$ROOT_DIR/blockchain/chain_spec.json" --dev &
NODE_PID=$!

echo "  Waiting for node..."
for i in $(seq 1 30); do
    if curl -s -o /dev/null http://127.0.0.1:9944 2>/dev/null; then
        echo "  Node ready (ws://127.0.0.1:9944)"
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo "  ERROR: Node did not start in time."
        kill $NODE_PID 2>/dev/null
        exit 1
    fi
    sleep 1
done

# Start eth-rpc adapter
echo "[5/7] Starting eth-rpc adapter..."
eth-rpc --dev &
ETH_RPC_PID=$!
sleep 3
echo "  Ethereum RPC ready (http://127.0.0.1:8545)"

# Deploy contracts
echo "[6/7] Deploying contracts..."
echo "  Deploying ProofOfExistence via EVM (solc)..."
cd "$ROOT_DIR/contracts/evm"
npm run deploy:local

echo "  Deploying ProofOfExistence via PVM (resolc)..."
cd "$ROOT_DIR/contracts/pvm"
npm run deploy:local

cd "$ROOT_DIR"

# Start frontend
echo "[7/7] Starting frontend..."
cd "$ROOT_DIR/web"
npm install

if curl -s -o /dev/null http://127.0.0.1:9944 2>/dev/null; then
    echo "  Updating PAPI descriptors..."
    npm run update-types
    npm run codegen
fi

npm run dev &
FRONTEND_PID=$!
echo "  Frontend starting (http://localhost:5173)"

cd "$ROOT_DIR"

echo ""
echo "=== Full dev environment running ==="
echo "  Substrate RPC: ws://127.0.0.1:9944"
echo "  Ethereum RPC:  http://127.0.0.1:8545"
echo "  Frontend:      http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop all."
wait $NODE_PID
