#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT_BINARY="$REPO_ROOT/target/debug/brad-setup-ios-testing"

if ! command -v cargo >/dev/null 2>&1; then
  echo "cargo must be installed and available on PATH." >&2
  exit 1
fi

if [ ! -f "$SCRIPT_BINARY" ] || [ "$REPO_ROOT/tools/dev-cli/src" -nt "$SCRIPT_BINARY" ]; then
  cargo build -p dev-cli --manifest-path "$REPO_ROOT/Cargo.toml" --bin brad-setup-ios-testing -q
fi

BRAD_OS_REPO_ROOT="$REPO_ROOT" "$SCRIPT_BINARY" "$@"
