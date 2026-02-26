#!/usr/bin/env bash
set -uo pipefail

run_rust_emulator_tests() {
  local repo_root
  local binary
  local source_dir

  repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  binary="$repo_root/target/release/brad-run-integration-tests"
  source_dir="$repo_root/tools/dev-cli/src"

  if ! command -v cargo >/dev/null 2>&1; then
    if [ -f "$HOME/.cargo/env" ]; then
      # shellcheck disable=SC1091
      source "$HOME/.cargo/env"
    fi
  fi

  if [ ! -f "$binary" ] || [ -n "$(find "$source_dir" -newer "$binary" 2>/dev/null -print -quit)" ]; then
    if ! cargo build -p dev-cli --release --manifest-path "$repo_root/Cargo.toml" -q; then
      return 1
    fi
  fi

  if [ -x "$binary" ]; then
    cd "$repo_root"
    exec "$binary"
  fi

  return 1
}

run_rust_emulator_tests "$@"
