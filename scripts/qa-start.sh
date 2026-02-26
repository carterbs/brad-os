#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export ROOT_DIR
export QA_STATE_ROOT="${QA_STATE_ROOT:-/tmp/brad-os-qa}"

if ! command -v cargo >/dev/null 2>&1; then
  echo "cargo is required to run advanced QA environment start" >&2
  exit 1
fi

cd "$ROOT_DIR"
exec cargo run -q -p dev-cli --bin brad-qa-start -- "$@"
