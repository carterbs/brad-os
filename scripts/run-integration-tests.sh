#!/usr/bin/env bash
set -euo pipefail

run_rust_integration_tests() {
  local repo_root
  local binary

  repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  binary="$repo_root/target/release/brad-run-integration-tests"

  if ! command -v cargo >/dev/null 2>&1 && [ -f "$HOME/.cargo/env" ]; then
    # shellcheck disable=SC1091
    source "$HOME/.cargo/env"
  fi

  if ! command -v cargo >/dev/null 2>&1; then
    echo "cargo is required to run integration tests" >&2
    return 1
  fi

  cargo build \
    -p dev-cli \
    --release \
    --bin brad-run-integration-tests \
    --manifest-path "$repo_root/Cargo.toml" \
    -q

  cd "$repo_root"
  exec "$binary" "$@"
}

run_rust_integration_tests "$@"
