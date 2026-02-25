#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
QA_STATE_ROOT="${QA_STATE_ROOT:-/tmp/brad-os-qa}"

SESSION_ID="${SESSION_ID:-}"
DERIVED_DATA_PATH="${DERIVED_DATA_PATH:-$HOME/.cache/brad-os-derived-data}"
SKIP_XCODEGEN=false

usage() {
  cat <<'USAGE'
Usage:
  bash scripts/qa-build.sh [options]

Options:
  --id <id>             Optional QA session identifier.
  --agent <id>          Backward-compatible alias for --id.
  --derived-data <path> Derived data path (default: ~/.cache/brad-os-derived-data).
  --skip-xcodegen       Skip project generation step.
  -h, --help            Show this help.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --id|--agent)
      SESSION_ID="${2:-}"
      shift 2
      ;;
    --derived-data)
      DERIVED_DATA_PATH="${2:-}"
      shift 2
      ;;
    --skip-xcodegen)
      SKIP_XCODEGEN=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

sanitize_id() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9-' '-'
}

default_session_id() {
  local worktree hash
  worktree="$(basename "$ROOT_DIR")"
  hash="$(printf '%s' "$ROOT_DIR" | cksum | awk '{print $1}')"
  printf '%s-%s' "$(sanitize_id "$worktree")" "$((hash % 10000))"
}

if [[ -z "$SESSION_ID" ]]; then
  SESSION_ID="$(default_session_id)"
  echo "No --id provided. Using worktree session id: $SESSION_ID"
fi

SANITIZED_SESSION="$(sanitize_id "$SESSION_ID")"
STATE_FILE="$QA_STATE_ROOT/sessions/$SANITIZED_SESSION/state.env"

if [[ ! -f "$STATE_FILE" ]]; then
  echo "State file not found: $STATE_FILE" >&2
  echo "Run: npm run qa:env:start -- --id $SANITIZED_SESSION" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$STATE_FILE"
WORKTREE_ROOT="${WORKTREE_ROOT:-$ROOT_DIR}"

if [[ -z "${SIMULATOR_UDID:-}" ]]; then
  echo "No simulator UDID is set in $STATE_FILE" >&2
  exit 1
fi

if ! $SKIP_XCODEGEN; then
  (cd "$WORKTREE_ROOT/ios/BradOS" && xcodegen generate)
fi

xcodebuild -project "$WORKTREE_ROOT/ios/BradOS/BradOS.xcodeproj" \
  -scheme BradOS \
  -destination "id=${SIMULATOR_UDID}" \
  -derivedDataPath "$DERIVED_DATA_PATH" \
  -skipPackagePluginValidation \
  build
