#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
QA_STATE_ROOT="${QA_STATE_ROOT:-/tmp/brad-os-qa}"

SESSION_ID="${SESSION_ID:-}"
DERIVED_DATA_PATH="${DERIVED_DATA_PATH:-$HOME/.cache/brad-os-derived-data}"
BUNDLE_ID="com.bradcarter.brad-os"

usage() {
  cat <<'USAGE'
Usage:
  bash scripts/qa-launch.sh [options]

Options:
  --id <id>             Optional QA session identifier.
  --agent <id>          Backward-compatible alias for --id.
  --derived-data <path> Derived data path (default: ~/.cache/brad-os-derived-data).
  --bundle-id <id>      Bundle ID to launch (default: com.bradcarter.brad-os).
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
    --bundle-id)
      BUNDLE_ID="${2:-}"
      shift 2
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
  echo "Run: npm run qa:start -- --id $SANITIZED_SESSION" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$STATE_FILE"

if [[ -z "${SIMULATOR_UDID:-}" ]]; then
  echo "No simulator UDID is set in $STATE_FILE" >&2
  exit 1
fi

APP_PATH="$DERIVED_DATA_PATH/Build/Products/Debug-iphonesimulator/Brad OS.app"
if [[ ! -d "$APP_PATH" ]]; then
  APP_PATH="$DERIVED_DATA_PATH/Build/Products/Debug-iphonesimulator/BradOS.app"
fi

if [[ ! -d "$APP_PATH" ]]; then
  echo "App bundle not found at: $APP_PATH" >&2
  echo "Run: npm run qa:build -- --id $SANITIZED_SESSION" >&2
  exit 1
fi

xcrun simctl install "$SIMULATOR_UDID" "$APP_PATH"
xcrun simctl launch "$SIMULATOR_UDID" "$BUNDLE_ID"
