#!/usr/bin/env bash
set -euo pipefail

COMMON_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$COMMON_DIR/.." && pwd)"
CHAIN_SPEC="$ROOT_DIR/blockchain/chain_spec.json"
RUNTIME_WASM="$ROOT_DIR/target/release/wbuild/stack-template-runtime/stack_template_runtime.compact.compressed.wasm"
SUBSTRATE_RPC_HTTP="${SUBSTRATE_RPC_HTTP:-http://127.0.0.1:9944}"
SUBSTRATE_RPC_WS="${SUBSTRATE_RPC_WS:-ws://127.0.0.1:9944}"
ETH_RPC_HTTP="${ETH_RPC_HTTP:-http://127.0.0.1:8545}"

ZOMBIE_DIR="${ZOMBIE_DIR:-}"
ZOMBIE_LOG="${ZOMBIE_LOG:-}"
ZOMBIE_PID="${ZOMBIE_PID:-}"
NODE_DIR="${NODE_DIR:-}"
NODE_LOG="${NODE_LOG:-}"
NODE_PID="${NODE_PID:-}"
ETH_RPC_PID="${ETH_RPC_PID:-}"

require_command() {
    if ! command -v "$1" >/dev/null 2>&1; then
        echo "ERROR: Missing required command: $1" >&2
        exit 1
    fi
}

require_port_free() {
    local port="$1"
    if lsof -i :"$port" >/dev/null 2>&1; then
        echo "ERROR: Port $port is already in use." >&2
        lsof -i :"$port" 2>/dev/null | head -5 >&2
        echo "Kill the process above or choose a different port." >&2
        exit 1
    fi
}

build_runtime() {
    cargo build -p stack-template-runtime --release
}

generate_chain_spec() {
    chain-spec-builder \
        -c "$CHAIN_SPEC" \
        create \
        --chain-name "Polkadot Stack Template" \
        --chain-id "polkadot-stack-template" \
        -t development \
        --relay-chain rococo-local \
        --para-id 1000 \
        --runtime "$RUNTIME_WASM" \
        named-preset development
}

substrate_statement_store_ready() {
    curl -s \
        -H "Content-Type: application/json" \
        -d '{"jsonrpc":"2.0","id":1,"method":"rpc_methods","params":[]}' \
        "$SUBSTRATE_RPC_HTTP" | grep -q '"statement_submit"'
}

basic_substrate_rpc_ready() {
    curl -s \
        -H "Content-Type: application/json" \
        -d '{"jsonrpc":"2.0","id":1,"method":"chain_getHeader","params":[]}' \
        "$SUBSTRATE_RPC_HTTP" | grep -q '"result"'
}

substrate_block_producing() {
    curl -s \
        -H "Content-Type: application/json" \
        -d '{"jsonrpc":"2.0","id":1,"method":"chain_getHeader","params":[]}' \
        "$SUBSTRATE_RPC_HTTP" | grep -Eq '"number":"0x[1-9a-fA-F][0-9a-fA-F]*"'
}

startup_log_path() {
    if [ -n "$NODE_LOG" ]; then
        echo "$NODE_LOG"
    elif [ -n "$ZOMBIE_LOG" ]; then
        echo "$ZOMBIE_LOG"
    fi
}

startup_service_stopped() {
    if [ -n "$NODE_PID" ] && ! kill -0 "$NODE_PID" 2>/dev/null; then
        return 0
    fi
    if [ -n "$ZOMBIE_PID" ] && ! kill -0 "$ZOMBIE_PID" 2>/dev/null; then
        return 0
    fi
    return 1
}

wait_for_substrate_rpc() {
    local startup_log
    startup_log="$(startup_log_path)"

    echo "  Waiting for local node..."
    for _ in $(seq 1 120); do
        if [ -n "$NODE_PID" ] && basic_substrate_rpc_ready && substrate_block_producing; then
            echo "  Node ready ($SUBSTRATE_RPC_WS)"
            return 0
        fi
        if [ -n "$ZOMBIE_PID" ] && substrate_statement_store_ready && substrate_block_producing; then
            echo "  Node ready ($SUBSTRATE_RPC_WS, Statement Store RPCs enabled)"
            return 0
        fi
        if startup_service_stopped; then
            echo "  ERROR: Local node stopped during startup."
            if [ -n "$startup_log" ] && [ -f "$startup_log" ]; then
                tail -n 100 "$startup_log" || true
            fi
            return 1
        fi
        sleep 1
    done

    echo "  ERROR: Local node RPCs did not become ready in time."
    if [ -n "$startup_log" ] && [ -f "$startup_log" ]; then
        tail -n 100 "$startup_log" || true
    fi
    return 1
}

eth_rpc_ready() {
    curl -s \
        -H "Content-Type: application/json" \
        -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' \
        "$ETH_RPC_HTTP" >/dev/null 2>&1
}

eth_rpc_block_producing() {
    curl -s \
        -H "Content-Type: application/json" \
        -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}' \
        "$ETH_RPC_HTTP" | grep -Eq '"result":"0x[1-9a-fA-F][0-9a-fA-F]*"'
}

wait_for_eth_rpc() {
    local eth_rpc_log
    if [ -n "$NODE_DIR" ]; then
        eth_rpc_log="$NODE_DIR/eth-rpc.log"
    else
        eth_rpc_log="$ZOMBIE_DIR/eth-rpc.log"
    fi

    echo "  Waiting for Ethereum RPC..."
    for _ in $(seq 1 120); do
        if eth_rpc_ready && { [ -n "$NODE_PID" ] || eth_rpc_block_producing; }; then
            echo "  Ethereum RPC ready ($ETH_RPC_HTTP)"
            return 0
        fi
        if [ -n "$ETH_RPC_PID" ] && ! kill -0 "$ETH_RPC_PID" 2>/dev/null; then
            echo "  ERROR: eth-rpc stopped during startup."
            if [ -f "$eth_rpc_log" ]; then
                tail -n 100 "$eth_rpc_log" || true
            fi
            return 1
        fi
        sleep 1
    done

    echo "  ERROR: Ethereum RPC did not become ready in time."
    if [ -f "$eth_rpc_log" ]; then
        tail -n 100 "$eth_rpc_log" || true
    fi
    return 1
}

start_zombienet_background() {
    require_command zombienet
    require_command polkadot
    require_command polkadot-omni-node
    require_port_free 9944

    ZOMBIE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/polkadot-stack-zombienet.XXXXXX")"
    ZOMBIE_LOG="$ZOMBIE_DIR/zombienet.log"

    (
        cd "$ROOT_DIR/blockchain"
        zombienet -p native -f -l text -d "$ZOMBIE_DIR" spawn zombienet.toml >"$ZOMBIE_LOG" 2>&1
    ) &
    ZOMBIE_PID=$!

    echo "  Zombienet dir: $ZOMBIE_DIR"
    echo "  Zombienet log: $ZOMBIE_LOG"
}

start_local_node_background() {
    require_command polkadot-omni-node
    require_port_free 9944

    NODE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/polkadot-stack-node.XXXXXX")"
    NODE_LOG="$NODE_DIR/node.log"

    polkadot-omni-node \
        --chain "$CHAIN_SPEC" \
        --tmp \
        --alice \
        --force-authoring \
        --dev-block-time 3000 \
        --no-prometheus \
        --unsafe-force-node-key-generation \
        --rpc-cors all \
        --rpc-port 9944 \
        --enable-statement-store \
        -- >"$NODE_LOG" 2>&1 &
    NODE_PID=$!

    echo "  Node log: $NODE_LOG"
}

run_local_node_foreground() {
    require_command polkadot-omni-node
    require_port_free 9944

    polkadot-omni-node \
        --chain "$CHAIN_SPEC" \
        --tmp \
        --alice \
        --force-authoring \
        --dev-block-time 3000 \
        --no-prometheus \
        --unsafe-force-node-key-generation \
        --rpc-cors all \
        --rpc-port 9944 \
        --enable-statement-store \
        --
}

run_zombienet_foreground() {
    require_command zombienet
    require_command polkadot
    require_command polkadot-omni-node
    require_port_free 9944

    ZOMBIE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/polkadot-stack-zombienet.XXXXXX")"
    ZOMBIE_LOG="$ZOMBIE_DIR/zombienet.log"

    echo "  Zombienet dir: $ZOMBIE_DIR"
    echo "  Zombienet log: $ZOMBIE_LOG"

    trap cleanup_zombienet EXIT INT TERM

    cd "$ROOT_DIR/blockchain"
    zombienet -p native -f -l text -d "$ZOMBIE_DIR" spawn zombienet.toml &
    ZOMBIE_PID=$!
    wait "$ZOMBIE_PID"
}

start_eth_rpc_background() {
    require_command eth-rpc
    require_port_free 8545

    local eth_rpc_log
    local eth_rpc_dir
    if [ -n "$NODE_DIR" ]; then
        eth_rpc_dir="$NODE_DIR/eth-rpc"
        eth_rpc_log="$NODE_DIR/eth-rpc.log"
    else
        eth_rpc_dir="$ZOMBIE_DIR/eth-rpc"
        eth_rpc_log="$ZOMBIE_DIR/eth-rpc.log"
    fi

    eth-rpc \
        --node-rpc-url "$SUBSTRATE_RPC_WS" \
        --no-prometheus \
        --rpc-cors all \
        -d "$eth_rpc_dir" >"$eth_rpc_log" 2>&1 &
    ETH_RPC_PID=$!

    echo "  eth-rpc log: $eth_rpc_log"
}

cleanup_local_node() {
    if [ -n "$NODE_PID" ]; then
        kill "$NODE_PID" 2>/dev/null || true
        wait "$NODE_PID" 2>/dev/null || true
    fi
    if [ -n "$NODE_DIR" ]; then
        rm -rf "$NODE_DIR"
    fi
}

cleanup_zombienet() {
    if [ -n "$ZOMBIE_DIR" ]; then
        pkill -INT -f "$ZOMBIE_DIR" 2>/dev/null || true
        sleep 1
        pkill -KILL -f "$ZOMBIE_DIR" 2>/dev/null || true
    fi
    if [ -n "$ZOMBIE_PID" ]; then
        wait "$ZOMBIE_PID" 2>/dev/null || true
    fi
}
