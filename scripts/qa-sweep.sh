#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
QA_STATE_ROOT="${QA_STATE_ROOT:-/tmp/brad-os-qa}"

SESSION_ID="${SESSION_ID:-}"
START_ARGS=()

usage() {
  cat <<'USAGE'
Usage:
  bash scripts/qa-sweep.sh [options]

Options:
  --id <id>            Optional QA session identifier.
  --agent <id>         Backward-compatible alias for --id.
  --device <name|udid> Preferred simulator to lease.
  --fresh              Clear QA session data before start.
  --timeout <seconds>  Startup wait timeout for qa:start.
  --project-id <id>    Firebase project ID override.
  -h, --help           Show this help.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --id|--agent)
      SESSION_ID="${2:-}"
      START_ARGS+=("--id" "${2:-}")
      shift 2
      ;;
    --device|--timeout|--project-id)
      START_ARGS+=("$1" "${2:-}")
      shift 2
      ;;
    --fresh)
      START_ARGS+=("--fresh")
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
  START_ARGS+=("--id" "$SESSION_ID")
  echo "No --id provided. Using worktree session id: $SESSION_ID"
fi

SANITIZED_SESSION="$(sanitize_id "$SESSION_ID")"

echo "[1/4] Starting isolated QA environment (advanced:qa:env:start)..."
bash "$ROOT_DIR/scripts/qa-start.sh" "${START_ARGS[@]}"

echo "[2/4] Building iOS app..."
bash "$ROOT_DIR/scripts/qa-build.sh" --id "$SANITIZED_SESSION"

echo "[3/4] Launching app..."
bash "$ROOT_DIR/scripts/qa-launch.sh" --id "$SANITIZED_SESSION"

echo "[4/4] Basic health checks..."
STATE_FILE="$QA_STATE_ROOT/sessions/$SANITIZED_SESSION/state.env"
# shellcheck disable=SC1090
source "$STATE_FILE"
curl -sSf "http://127.0.0.1:${FUNCTIONS_PORT}/${PROJECT_ID}/us-central1/devHealth" >/dev/null

echo "QA sweep complete for session: $SANITIZED_SESSION"
