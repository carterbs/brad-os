#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec cargo run --quiet --manifest-path "$REPO_ROOT/Cargo.toml" \
  -p dev-cli --bin brad-deploy-cloud-run -- "$@"
