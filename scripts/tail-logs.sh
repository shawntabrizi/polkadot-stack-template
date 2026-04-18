#!/usr/bin/env bash
set -euo pipefail

TMP="${TMPDIR:-/tmp}"

usage() {
    cat <<EOF
Usage: $(basename "$0") [--dir <path>]

Tails logs from the most recent start-all.sh run, with colored per-service
prefixes on a single terminal.

Options:
  --dir <path>  Use a specific log directory instead of auto-detecting.
  -h, --help    Show this help.

Auto-detected paths in ${TMP}:
  polkadot-stack-zombienet.*  (from start-all.sh)
  polkadot-stack-node.*       (from start-dev.sh background variants)

Tails any of these files if present in the chosen directory:
  zombienet.log, node.log, eth-rpc.log, frontend.log
EOF
}

LOG_DIR=""
while [ $# -gt 0 ]; do
    case "$1" in
        --dir)
            [ $# -ge 2 ] || { echo "--dir requires a path" >&2; exit 1; }
            LOG_DIR="$2"
            shift 2
            ;;
        -h|--help) usage; exit 0 ;;
        *) echo "Unknown arg: $1" >&2; usage >&2; exit 1 ;;
    esac
done

find_latest_dir() {
    local candidate
    candidate="$(ls -td "$TMP"/polkadot-stack-zombienet.* 2>/dev/null | head -n1 || true)"
    if [ -z "$candidate" ]; then
        candidate="$(ls -td "$TMP"/polkadot-stack-node.* 2>/dev/null | head -n1 || true)"
    fi
    printf '%s' "$candidate"
}

if [ -z "$LOG_DIR" ]; then
    LOG_DIR="$(find_latest_dir)"
fi

if [ -z "$LOG_DIR" ] || [ ! -d "$LOG_DIR" ]; then
    echo "No log directory found. Is the stack running?" >&2
    echo "Expected e.g. ${TMP}/polkadot-stack-zombienet.XXXXXX" >&2
    exit 1
fi

echo "Tailing logs from: $LOG_DIR"
echo "Press Ctrl+C to stop."
echo ""

RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
BLUE=$'\033[0;34m'
YELLOW=$'\033[0;33m'
MAGENTA=$'\033[0;35m'
RESET=$'\033[0m'

pids=()
tail_with_prefix() {
    local file="$1"
    local label="$2"
    local color="$3"
    local prefix="${color}[${label}]${RESET}"
    tail -F -n 0 "$file" 2>/dev/null \
        | awk -v prefix="$prefix" '{ print prefix " " $0; fflush(); }' &
    pids+=($!)
}

launched=0
maybe_tail() {
    local file="$1" label="$2" color="$3"
    if [ -f "$file" ]; then
        tail_with_prefix "$file" "$label" "$color"
        launched=$((launched + 1))
        echo "  [$label] $file"
    fi
}

maybe_tail "$LOG_DIR/zombienet.log" "zombienet" "$BLUE"
maybe_tail "$LOG_DIR/node.log"      "node"      "$BLUE"
maybe_tail "$LOG_DIR/eth-rpc.log"   "eth-rpc"   "$GREEN"
maybe_tail "$LOG_DIR/frontend.log"  "frontend"  "$YELLOW"

if [ "$launched" -eq 0 ]; then
    echo "No known log files found in $LOG_DIR" >&2
    echo "Expected one of: zombienet.log, node.log, eth-rpc.log, frontend.log" >&2
    exit 1
fi

echo ""

cleanup() {
    for pid in "${pids[@]}"; do
        kill "$pid" 2>/dev/null || true
    done
}
trap cleanup EXIT INT TERM

wait
