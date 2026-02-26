#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BINARY="$REPO_ROOT/target/release/brad-setup-ios-testing"

if ! command -v cargo &>/dev/null; then
  [ -f "$HOME/.cargo/env" ] && source "$HOME/.cargo/env"
fi

if [ ! -f "$BINARY" ] || [ "$(find "$REPO_ROOT/tools/dev-cli/src" -newer "$BINARY" -print -quit 2>/dev/null)" ]; then
  cargo build --manifest-path "$REPO_ROOT/tools/dev-cli/Cargo.toml" --release --bin brad-setup-ios-testing -q
fi

exec "$BINARY" "$@"
