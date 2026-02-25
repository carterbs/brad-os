#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
QA_STATE_ROOT="${QA_STATE_ROOT:-/tmp/brad-os-qa}"

SESSION_ID="${SESSION_ID:-}"
SHUTDOWN_SIMULATOR=false

usage() {
  cat <<'USAGE'
Usage:
  bash scripts/qa-stop.sh [options]

Options:
  --id <id>            Optional QA session identifier.
  --agent <id>         Backward-compatible alias for --id.
  --shutdown-simulator Shut down this session's simulator after cleanup.
  -h, --help           Show this help.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --id|--agent)
      SESSION_ID="${2:-}"
      shift 2
      ;;
    --shutdown-simulator)
      SHUTDOWN_SIMULATOR=true
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

stop_pid_file() {
  local pid_file="$1"
  local name="$2"

  if [[ ! -f "$pid_file" ]]; then
    echo "$name: no pid file at $pid_file"
    return 0
  fi

  local pid
  pid="$(cat "$pid_file" 2>/dev/null || true)"
  if [[ -z "$pid" ]]; then
    rm -f "$pid_file"
    echo "$name: pid file was empty, removed."
    return 0
  fi

  if kill -0 "$pid" 2>/dev/null; then
    kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
    sleep 1
    if kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" 2>/dev/null || true
    fi
    echo "$name: stopped pid $pid"
  else
    echo "$name: process $pid was already stopped"
  fi

  rm -f "$pid_file"
}

SANITIZED_SESSION="$(sanitize_id "$SESSION_ID")"
SESSION_DIR="$QA_STATE_ROOT/sessions/$SANITIZED_SESSION"
STATE_FILE="$SESSION_DIR/state.env"
LOCKS_DIR="$QA_STATE_ROOT/device-locks"

if [[ -f "$STATE_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$STATE_FILE"
else
  FIREBASE_PID_FILE="$SESSION_DIR/pids/firebase.pid"
  OTEL_PID_FILE="$SESSION_DIR/pids/otel.pid"
fi

stop_pid_file "${OTEL_PID_FILE:-$SESSION_DIR/pids/otel.pid}" "OTel collector"
stop_pid_file "${FIREBASE_PID_FILE:-$SESSION_DIR/pids/firebase.pid}" "Firebase emulator"

for port in "${FUNCTIONS_PORT:-}" "${FIRESTORE_PORT:-}" "${HOSTING_PORT:-}" "${UI_PORT:-}" "${HUB_PORT:-}" "${LOGGING_PORT:-}" "${OTEL_PORT:-}"; do
  [[ -n "$port" ]] || continue
  lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null || true
done

if [[ -n "${SIMULATOR_UDID:-}" ]]; then
  xcrun simctl spawn "$SIMULATOR_UDID" launchctl unsetenv BRAD_OS_API_URL || true
  xcrun simctl spawn "$SIMULATOR_UDID" launchctl unsetenv BRAD_OS_OTEL_BASE_URL || true
  xcrun simctl spawn "$SIMULATOR_UDID" launchctl unsetenv BRAD_OS_QA_ID || true
  xcrun simctl spawn "$SIMULATOR_UDID" launchctl unsetenv USE_EMULATOR || true

  if $SHUTDOWN_SIMULATOR; then
    xcrun simctl shutdown "$SIMULATOR_UDID" || true
    echo "Simulator: shut down $SIMULATOR_UDID"
  fi
fi

if [[ -n "${SIMULATOR_LOCK_DIR:-}" && -d "${SIMULATOR_LOCK_DIR:-}" ]]; then
  rm -f "${SIMULATOR_LOCK_DIR}/session" || true
  rmdir "${SIMULATOR_LOCK_DIR}" 2>/dev/null || true
  echo "Simulator lease released: ${SIMULATOR_LOCK_DIR}"
fi

if [[ -d "$LOCKS_DIR" ]]; then
  for lock_path in "$LOCKS_DIR"/*.lock; do
    [[ -e "$lock_path" ]] || continue
    owner="$(cat "$lock_path/session" 2>/dev/null || true)"
    if [[ "$owner" == "$SANITIZED_SESSION" ]]; then
      rm -f "$lock_path/session" || true
      rmdir "$lock_path" 2>/dev/null || true
      echo "Simulator lease released: $lock_path"
    fi
  done
fi

echo "QA session stopped: $SANITIZED_SESSION"
