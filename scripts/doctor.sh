#!/bin/bash

set -euo pipefail

SCRIPT_DIR="${BASH_SOURCE[0]%/*}"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RELEASE_BIN="$ROOT_DIR/target/release/doctor"
DEBUG_BIN="$ROOT_DIR/target/debug/doctor"
FAST_MODE="${BRAD_DOCTOR_FAST:-1}"

check_version_major() {
  local tool="$1"
  local required_major="$2"
  local raw major
  raw="$("$tool" --version 2>/dev/null || true)"
  raw="${raw%%$'\n'*}"
  if [[ "$raw" =~ ([0-9]+)(\.[0-9]+)* ]]; then
    major="${BASH_REMATCH[1]}"
  else
    major=""
  fi
  if [ -z "$major" ] || [ "$major" != "$required_major" ]; then
    return 1
  fi
  return 0
}

run_shell_doctor() {
  local failed=0

  report_tool() {
    local name="$1"
    local command_name="$2"
    local install_hint="$3"
    local required_major="${4:-}"

    if ! command -v "$command_name" >/dev/null 2>&1; then
      printf "✗ %s missing\n" "$name"
      if [ -n "$install_hint" ]; then
        printf "%s\n" "$install_hint"
      fi
      failed=1
      return
    fi

    if [ "$FAST_MODE" = "1" ]; then
      printf "✓ %s installed (fast)\n" "$name"
      return
    fi

    if [ -n "$required_major" ] && ! check_version_major "$command_name" "$required_major"; then
      printf "✗ %s outdated major version\n" "$name"
      failed=1
      return
    fi

    printf "✓ %s installed\n" "$name"
  }

  report_tool "node" "node" "Install Node.js 22.x: https://nodejs.org/" "22"
  report_tool "npm" "npm" "Install npm: bundled with Node.js"
  report_tool "firebase" "firebase" "npm install -g firebase-tools"
  report_tool "cargo" "cargo" "Install Rust: https://rustup.rs/"
  report_tool "gitleaks" "gitleaks" "brew install gitleaks"
  report_tool "xcodegen" "xcodegen" "brew install xcodegen"

  local hooks_path
  hooks_path="$(git config core.hooksPath 2>/dev/null || true)"
  if [ "$hooks_path" = "hooks" ]; then
    printf "✓ git hooks configured\n"
  else
    printf "✗ git hooks not configured (got: '%s')\n" "$hooks_path"
    failed=1
  fi

  if [ -d "node_modules" ]; then
    printf "✓ node_modules installed\n"
  else
    printf "✗ node_modules missing\n"
    failed=1
  fi

  if [ "$failed" -eq 0 ]; then
    printf "PASS  All dependencies satisfied.\n"
    return 0
  fi

  printf "FAIL  Missing dependencies or setup drift detected.\n"
  return 1
}

if [ -x "$RELEASE_BIN" ]; then
  exec "$RELEASE_BIN" "$@"
fi

if [ -x "$DEBUG_BIN" ]; then
  exec "$DEBUG_BIN" "$@"
fi

if ! command -v cargo >/dev/null 2>&1; then
  run_shell_doctor "$@"
  exit $?
fi

cd "$ROOT_DIR"
if cargo run -q -p dev-cli --bin doctor -- "$@"; then
  exit 0
fi

run_shell_doctor "$@"
