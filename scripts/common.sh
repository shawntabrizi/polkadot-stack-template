#!/usr/bin/env bash
set -euo pipefail

# Shared helpers for the repo's two supported local topologies:
# - Solo dev mode (`start-dev.sh`) for the fastest runtime/pallet loop
# - Relay-backed Zombienet mode (`start-all.sh`, `start-local.sh`) for the full feature set

COMMON_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$COMMON_DIR/.." && pwd)"
CHAIN_SPEC="$ROOT_DIR/blockchain/chain_spec.json"
RUNTIME_WASM="$ROOT_DIR/target/release/wbuild/stack-template-runtime/stack_template_runtime.compact.compressed.wasm"
STACK_PORT_OFFSET="${STACK_PORT_OFFSET:-0}"
STACK_SUBSTRATE_RPC_PORT="${STACK_SUBSTRATE_RPC_PORT:-$((9944 + STACK_PORT_OFFSET))}"
STACK_ETH_RPC_PORT="${STACK_ETH_RPC_PORT:-$((8545 + STACK_PORT_OFFSET))}"
STACK_FRONTEND_PORT="${STACK_FRONTEND_PORT:-$((5173 + STACK_PORT_OFFSET))}"
STACK_COLLATOR_INTERNAL_RPC_PORT="$((9933 + STACK_PORT_OFFSET))"
STACK_COLLATOR_P2P_PORT="$((30333 + STACK_PORT_OFFSET))"
STACK_COLLATOR_PROMETHEUS_PORT="$((9615 + STACK_PORT_OFFSET))"
STACK_RELAY_ALICE_RPC_PORT="$((9949 + STACK_PORT_OFFSET))"
STACK_RELAY_ALICE_WS_PORT="$((9950 + STACK_PORT_OFFSET))"
STACK_RELAY_ALICE_P2P_PORT="$((30335 + STACK_PORT_OFFSET))"
STACK_RELAY_ALICE_PROMETHEUS_PORT="$((9617 + STACK_PORT_OFFSET))"
STACK_RELAY_BOB_RPC_PORT="$((9951 + STACK_PORT_OFFSET))"
STACK_RELAY_BOB_WS_PORT="$((9952 + STACK_PORT_OFFSET))"
STACK_RELAY_BOB_P2P_PORT="$((30336 + STACK_PORT_OFFSET))"
STACK_RELAY_BOB_PROMETHEUS_PORT="$((9618 + STACK_PORT_OFFSET))"
SUBSTRATE_RPC_HTTP="${SUBSTRATE_RPC_HTTP:-http://127.0.0.1:${STACK_SUBSTRATE_RPC_PORT}}"
SUBSTRATE_RPC_WS="${SUBSTRATE_RPC_WS:-ws://127.0.0.1:${STACK_SUBSTRATE_RPC_PORT}}"
ETH_RPC_HTTP="${ETH_RPC_HTTP:-http://127.0.0.1:${STACK_ETH_RPC_PORT}}"
FRONTEND_URL="${FRONTEND_URL:-http://127.0.0.1:${STACK_FRONTEND_PORT}}"

ZOMBIE_DIR="${ZOMBIE_DIR:-}"
ZOMBIE_LOG="${ZOMBIE_LOG:-}"
ZOMBIE_PID="${ZOMBIE_PID:-}"
ZOMBIE_CONFIG="${ZOMBIE_CONFIG:-}"
NODE_DIR="${NODE_DIR:-}"
NODE_LOG="${NODE_LOG:-}"
NODE_PID="${NODE_PID:-}"
ETH_RPC_PID="${ETH_RPC_PID:-}"

export STACK_PORT_OFFSET
export STACK_SUBSTRATE_RPC_PORT
export STACK_ETH_RPC_PORT
export STACK_FRONTEND_PORT
export SUBSTRATE_RPC_HTTP
export SUBSTRATE_RPC_WS
export ETH_RPC_HTTP
export FRONTEND_URL

log_info() {
    echo "INFO: $*"
}

log_warn() {
    echo "WARN: $*"
}

log_error() {
    echo "ERROR: $*" >&2
}

install_hint() {
    case "$1" in
        cargo)
            echo "Install Rust via rustup: https://rustup.rs/"
            ;;
        chain-spec-builder)
            echo "Install with: cargo install staging-chain-spec-builder"
            ;;
        zombienet)
            echo "Install with: npm install -g @zombienet/cli"
            ;;
        polkadot|polkadot-omni-node|eth-rpc)
            echo "See docs/INSTALL.md for the matching stable2512-3 binary install steps."
            ;;
        curl)
            echo "Install curl with your system package manager."
            ;;
        *)
            echo "See docs/INSTALL.md for setup guidance."
            ;;
    esac
}

require_command() {
    if ! command -v "$1" >/dev/null 2>&1; then
        log_error "Missing required command: $1"
        log_info "$(install_hint "$1")"
        exit 1
    fi
}

require_port_free() {
    local port="$1"
    if lsof -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
        log_error "Port $port is already in use."
        lsof -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | head -5 >&2
        log_info "Stop the process above or choose a different port before retrying."
        exit 1
    fi
}

require_ports_free() {
    local port
    for port in "$@"; do
        require_port_free "$port"
    done
}

require_distinct_ports() {
    local seen="|"
    local label
    local port

    while [ "$#" -gt 1 ]; do
        label="$1"
        port="$2"
        shift 2

        if [[ "$seen" == *"|$port|"* ]]; then
            log_error "Port assignment conflict detected for $label ($port)."
            log_info "Adjust STACK_PORT_OFFSET or the explicit STACK_*_PORT overrides and retry."
            exit 1
        fi

        seen="${seen}${port}|"
    done
}

validate_zombienet_ports() {
    require_distinct_ports \
        "Substrate RPC" "$STACK_SUBSTRATE_RPC_PORT" \
        "Relay Alice RPC" "$STACK_RELAY_ALICE_RPC_PORT" \
        "Relay Alice WS" "$STACK_RELAY_ALICE_WS_PORT" \
        "Relay Alice P2P" "$STACK_RELAY_ALICE_P2P_PORT" \
        "Relay Alice Prometheus" "$STACK_RELAY_ALICE_PROMETHEUS_PORT" \
        "Relay Bob RPC" "$STACK_RELAY_BOB_RPC_PORT" \
        "Relay Bob WS" "$STACK_RELAY_BOB_WS_PORT" \
        "Relay Bob P2P" "$STACK_RELAY_BOB_P2P_PORT" \
        "Relay Bob Prometheus" "$STACK_RELAY_BOB_PROMETHEUS_PORT" \
        "Collator internal RPC" "$STACK_COLLATOR_INTERNAL_RPC_PORT" \
        "Collator P2P" "$STACK_COLLATOR_P2P_PORT" \
        "Collator Prometheus" "$STACK_COLLATOR_PROMETHEUS_PORT"

    require_ports_free \
        "$STACK_SUBSTRATE_RPC_PORT" \
        "$STACK_RELAY_ALICE_RPC_PORT" \
        "$STACK_RELAY_ALICE_WS_PORT" \
        "$STACK_RELAY_ALICE_P2P_PORT" \
        "$STACK_RELAY_ALICE_PROMETHEUS_PORT" \
        "$STACK_RELAY_BOB_RPC_PORT" \
        "$STACK_RELAY_BOB_WS_PORT" \
        "$STACK_RELAY_BOB_P2P_PORT" \
        "$STACK_RELAY_BOB_PROMETHEUS_PORT" \
        "$STACK_COLLATOR_INTERNAL_RPC_PORT" \
        "$STACK_COLLATOR_P2P_PORT" \
        "$STACK_COLLATOR_PROMETHEUS_PORT"
}

validate_full_stack_ports() {
    require_distinct_ports \
        "Substrate RPC" "$STACK_SUBSTRATE_RPC_PORT" \
        "Ethereum RPC" "$STACK_ETH_RPC_PORT" \
        "Frontend" "$STACK_FRONTEND_PORT" \
        "Relay Alice RPC" "$STACK_RELAY_ALICE_RPC_PORT" \
        "Relay Alice WS" "$STACK_RELAY_ALICE_WS_PORT" \
        "Relay Alice P2P" "$STACK_RELAY_ALICE_P2P_PORT" \
        "Relay Alice Prometheus" "$STACK_RELAY_ALICE_PROMETHEUS_PORT" \
        "Relay Bob RPC" "$STACK_RELAY_BOB_RPC_PORT" \
        "Relay Bob WS" "$STACK_RELAY_BOB_WS_PORT" \
        "Relay Bob P2P" "$STACK_RELAY_BOB_P2P_PORT" \
        "Relay Bob Prometheus" "$STACK_RELAY_BOB_PROMETHEUS_PORT" \
        "Collator internal RPC" "$STACK_COLLATOR_INTERNAL_RPC_PORT" \
        "Collator P2P" "$STACK_COLLATOR_P2P_PORT" \
        "Collator Prometheus" "$STACK_COLLATOR_PROMETHEUS_PORT"

    require_ports_free \
        "$STACK_SUBSTRATE_RPC_PORT" \
        "$STACK_ETH_RPC_PORT" \
        "$STACK_FRONTEND_PORT" \
        "$STACK_RELAY_ALICE_RPC_PORT" \
        "$STACK_RELAY_ALICE_WS_PORT" \
        "$STACK_RELAY_ALICE_P2P_PORT" \
        "$STACK_RELAY_ALICE_PROMETHEUS_PORT" \
        "$STACK_RELAY_BOB_RPC_PORT" \
        "$STACK_RELAY_BOB_WS_PORT" \
        "$STACK_RELAY_BOB_P2P_PORT" \
        "$STACK_RELAY_BOB_PROMETHEUS_PORT" \
        "$STACK_COLLATOR_INTERNAL_RPC_PORT" \
        "$STACK_COLLATOR_P2P_PORT" \
        "$STACK_COLLATOR_PROMETHEUS_PORT"
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

    log_info "Waiting for local node RPCs..."
    local max_wait="${STACK_RPC_TIMEOUT:-180}"
    for _ in $(seq 1 "$max_wait"); do
        if [ -n "$NODE_PID" ] && basic_substrate_rpc_ready && substrate_block_producing; then
            log_info "Node ready at $SUBSTRATE_RPC_WS"
            return 0
        fi
        if [ -n "$ZOMBIE_PID" ] && substrate_statement_store_ready && substrate_block_producing; then
            log_info "Node ready at $SUBSTRATE_RPC_WS (Statement Store RPCs enabled)"
            return 0
        fi
        if startup_service_stopped; then
            log_error "Local node stopped during startup."
            if [ -n "$startup_log" ] && [ -f "$startup_log" ]; then
                log_info "Recent log output:"
                tail -n 100 "$startup_log" || true
            fi
            return 1
        fi
        sleep 1
    done

    log_error "Local node RPCs did not become ready in time."
    if [ -n "$startup_log" ] && [ -f "$startup_log" ]; then
        log_info "Recent log output:"
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

    log_info "Waiting for Ethereum RPC..."
    for _ in $(seq 1 120); do
        if eth_rpc_ready && { [ -n "$NODE_PID" ] || eth_rpc_block_producing; }; then
            log_info "Ethereum RPC ready at $ETH_RPC_HTTP"
            return 0
        fi
        if [ -n "$ETH_RPC_PID" ] && ! kill -0 "$ETH_RPC_PID" 2>/dev/null; then
            log_error "eth-rpc stopped during startup."
            if [ -f "$eth_rpc_log" ]; then
                log_info "Recent log output:"
                tail -n 100 "$eth_rpc_log" || true
            fi
            return 1
        fi
        sleep 1
    done

    log_error "Ethereum RPC did not become ready in time."
    if [ -f "$eth_rpc_log" ]; then
        log_info "Recent log output:"
        tail -n 100 "$eth_rpc_log" || true
    fi
    return 1
}

write_zombienet_config() {
    local config_path="$1"

    cat >"$config_path" <<EOF
[settings]
timeout = 1000

[relaychain]
chain = "rococo-local"
default_command = "polkadot"

  [[relaychain.nodes]]
  name = "alice"
  validator = true
  ws_port = $STACK_RELAY_ALICE_WS_PORT
  rpc_port = $STACK_RELAY_ALICE_RPC_PORT
  p2p_port = $STACK_RELAY_ALICE_P2P_PORT
  prometheus_port = $STACK_RELAY_ALICE_PROMETHEUS_PORT

  [[relaychain.nodes]]
  name = "bob"
  validator = true
  ws_port = $STACK_RELAY_BOB_WS_PORT
  rpc_port = $STACK_RELAY_BOB_RPC_PORT
  p2p_port = $STACK_RELAY_BOB_P2P_PORT
  prometheus_port = $STACK_RELAY_BOB_PROMETHEUS_PORT

[[parachains]]
id = 1000
chain = "./chain_spec.json"
cumulus_based = true

  [[parachains.collators]]
  name = "collator-01"
  validator = true
  ws_port = $STACK_SUBSTRATE_RPC_PORT
  rpc_port = $STACK_COLLATOR_INTERNAL_RPC_PORT
  p2p_port = $STACK_COLLATOR_P2P_PORT
  prometheus_port = $STACK_COLLATOR_PROMETHEUS_PORT
  command = "polkadot-omni-node"
  args = ["--enable-statement-store"]
EOF
}

write_papi_config() {
    local output_path="$1"

    node -e '
const fs = require("fs");
const [inputPath, outputPath, wsUrl] = process.argv.slice(1);
const config = JSON.parse(fs.readFileSync(inputPath, "utf8"));
config.entries.stack_template.wsUrl = wsUrl;
fs.writeFileSync(outputPath, `${JSON.stringify(config, null, 2)}\n`);
' "$ROOT_DIR/web/.papi/polkadot-api.json" "$output_path" "$SUBSTRATE_RPC_WS"
}

update_papi_descriptors() {
    require_command node

    local papi_config
    papi_config="$(mktemp "$ROOT_DIR/web/papi.local.XXXXXX.json")"
    write_papi_config "$papi_config"

    npm run update-types -- --config "$papi_config"
    npm run codegen -- --config "$papi_config"

    rm -f "$papi_config"
}

export_frontend_runtime_env() {
    export VITE_LOCAL_WS_URL="$SUBSTRATE_RPC_WS"
    export VITE_LOCAL_ETH_RPC_URL="$ETH_RPC_HTTP"
}

start_zombienet_background() {
    require_command zombienet
    require_command polkadot
    require_command polkadot-omni-node
    validate_zombienet_ports

    ZOMBIE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/polkadot-stack-zombienet.XXXXXX")"
    ZOMBIE_LOG="$ZOMBIE_DIR/zombienet.log"
    ZOMBIE_CONFIG="$ZOMBIE_DIR/zombienet.toml"
    cp "$CHAIN_SPEC" "$ZOMBIE_DIR/chain_spec.json"
    write_zombienet_config "$ZOMBIE_CONFIG"

    (
        cd "$ZOMBIE_DIR"
        zombienet -p native -f -l text -d "$ZOMBIE_DIR" spawn zombienet.toml >"$ZOMBIE_LOG" 2>&1
    ) &
    ZOMBIE_PID=$!

    log_info "Zombienet data dir: $ZOMBIE_DIR"
    log_info "Zombienet config: $ZOMBIE_CONFIG"
    log_info "Zombienet log: $ZOMBIE_LOG"
}

start_local_node_background() {
    require_command polkadot-omni-node
    require_port_free "$STACK_SUBSTRATE_RPC_PORT"

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
        --rpc-port "$STACK_SUBSTRATE_RPC_PORT" \
        -- >"$NODE_LOG" 2>&1 &
    NODE_PID=$!

    log_info "Node log: $NODE_LOG"
}

run_local_node_foreground() {
    require_command polkadot-omni-node
    require_port_free "$STACK_SUBSTRATE_RPC_PORT"

    polkadot-omni-node \
        --chain "$CHAIN_SPEC" \
        --tmp \
        --alice \
        --force-authoring \
        --dev-block-time 3000 \
        --no-prometheus \
        --unsafe-force-node-key-generation \
        --rpc-cors all \
        --rpc-port "$STACK_SUBSTRATE_RPC_PORT" \
        --
}

run_zombienet_foreground() {
    require_command zombienet
    require_command polkadot
    require_command polkadot-omni-node
    validate_zombienet_ports

    ZOMBIE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/polkadot-stack-zombienet.XXXXXX")"
    ZOMBIE_LOG="$ZOMBIE_DIR/zombienet.log"
    ZOMBIE_CONFIG="$ZOMBIE_DIR/zombienet.toml"
    cp "$CHAIN_SPEC" "$ZOMBIE_DIR/chain_spec.json"
    write_zombienet_config "$ZOMBIE_CONFIG"

    log_info "Zombienet data dir: $ZOMBIE_DIR"
    log_info "Zombienet config: $ZOMBIE_CONFIG"
    log_info "Zombienet log: $ZOMBIE_LOG"

    trap cleanup_zombienet EXIT INT TERM

    cd "$ZOMBIE_DIR"
    zombienet -p native -f -l text -d "$ZOMBIE_DIR" spawn zombienet.toml &
    ZOMBIE_PID=$!
    wait "$ZOMBIE_PID"
}

start_eth_rpc_background() {
    require_command eth-rpc
    require_port_free "$STACK_ETH_RPC_PORT"

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
        --rpc-port "$STACK_ETH_RPC_PORT" \
        --no-prometheus \
        --rpc-cors all \
        -d "$eth_rpc_dir" >"$eth_rpc_log" 2>&1 &
    ETH_RPC_PID=$!

    log_info "eth-rpc log: $eth_rpc_log"
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
