#!/bin/bash

set -euo pipefail

SCRIPT_DIR="${BASH_SOURCE[0]%/*}"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RELEASE_BIN="$ROOT_DIR/target/release/brad-doctor"
DEBUG_BIN="$ROOT_DIR/target/debug/brad-doctor"

if [ -x "$RELEASE_BIN" ]; then
  exec "$RELEASE_BIN" "$@"
fi

if [ -x "$DEBUG_BIN" ]; then
  exec "$DEBUG_BIN" "$@"
fi

if ! command -v cargo >/dev/null 2>&1; then
  echo "cargo is required to run brad doctor checks" >&2
  exit 1
fi

cd "$ROOT_DIR"
exec cargo run -q -p dev-cli --bin brad-doctor -- "$@"
