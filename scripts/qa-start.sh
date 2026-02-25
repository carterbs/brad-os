#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
QA_STATE_ROOT="${QA_STATE_ROOT:-/tmp/brad-os-qa}"

SESSION_ID="${SESSION_ID:-}"
PROJECT_ID=""
DEVICE_REQUEST=""
TIMEOUT_SECONDS=120
START_FIREBASE=true
START_OTEL=true
SETUP_SIMULATOR=true
FRESH_DATA=false

SIMULATOR_LOCK_DIR=""
LOCK_ACQUIRED_THIS_RUN=false

usage() {
  cat <<'USAGE'
Usage:
  bash scripts/qa-start.sh [options]

Options:
  --id <id>            Optional QA session identifier.
  --agent <id>         Backward-compatible alias for --id.
  --project-id <id>    Optional Firebase project ID override.
  --device <name|udid> Optional simulator name fragment or exact UDID.
  --timeout <seconds>  Startup wait timeout (default: 120).
  --fresh              Clear this QA session's telemetry/data directories before start.
  --no-firebase        Skip Firebase emulator startup.
  --no-otel            Skip OTel collector startup.
  --no-simulator       Skip simulator leasing + env injection.
  -h, --help           Show this help.
USAGE
}

cleanup_on_error() {
  local exit_code=$?
  if (( exit_code == 0 )); then
    return
  fi

  if [[ "$LOCK_ACQUIRED_THIS_RUN" == "true" && -n "$SIMULATOR_LOCK_DIR" ]]; then
    rm -f "$SIMULATOR_LOCK_DIR/session" 2>/dev/null || true
    rmdir "$SIMULATOR_LOCK_DIR" 2>/dev/null || true
  fi
}

trap cleanup_on_error EXIT

while [[ $# -gt 0 ]]; do
  case "$1" in
    --id|--agent)
      SESSION_ID="${2:-}"
      shift 2
      ;;
    --project-id)
      PROJECT_ID="${2:-}"
      shift 2
      ;;
    --device)
      DEVICE_REQUEST="${2:-}"
      shift 2
      ;;
    --timeout)
      TIMEOUT_SECONDS="${2:-}"
      shift 2
      ;;
    --fresh)
      FRESH_DATA=true
      shift
      ;;
    --no-firebase)
      START_FIREBASE=false
      shift
      ;;
    --no-otel)
      START_OTEL=false
      shift
      ;;
    --no-simulator)
      SETUP_SIMULATOR=false
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

if ! [[ "$TIMEOUT_SECONDS" =~ ^[0-9]+$ ]]; then
  echo "--timeout must be an integer number of seconds." >&2
  exit 1
fi

sanitize_id() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9-' '-'
}

default_session_id() {
  local worktree hash
  worktree="$(basename "$ROOT_DIR")"
  hash="$(printf '%s' "$ROOT_DIR" | cksum | awk '{print $1}')"
  printf '%s-%s' "$(sanitize_id "$worktree")" "$((hash % 10000))"
}

is_pid_running() {
  local pid_file="$1"
  if [[ -f "$pid_file" ]]; then
    local pid
    pid="$(cat "$pid_file" 2>/dev/null || true)"
    [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
    return
  fi
  return 1
}

wait_for_http_ok() {
  local label="$1"
  local url="$2"
  local timeout="$3"
  local start
  start="$(date +%s)"

  while true; do
    if curl -s -f "$url" >/dev/null 2>&1; then
      echo "  [ok] $label is ready: $url"
      return 0
    fi

    local now elapsed
    now="$(date +%s)"
    elapsed=$((now - start))
    if (( elapsed >= timeout )); then
      echo "  [error] Timeout waiting for $label at $url" >&2
      return 1
    fi

    if (( elapsed % 10 == 0 )); then
      echo "  [wait] $label not ready yet (${elapsed}s elapsed)"
    fi

    sleep 1
  done
}

wait_for_port_listener() {
  local label="$1"
  local port="$2"
  local timeout="$3"
  local start
  start="$(date +%s)"

  while true; do
    if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
      echo "  [ok] $label is listening on port $port"
      return 0
    fi

    local now elapsed
    now="$(date +%s)"
    elapsed=$((now - start))
    if (( elapsed >= timeout )); then
      echo "  [error] Timeout waiting for $label on port $port" >&2
      return 1
    fi

    if (( elapsed % 10 == 0 )); then
      echo "  [wait] $label not listening yet (${elapsed}s elapsed)"
    fi

    sleep 1
  done
}

pick_ports_from_hash() {
  local seed="$1"
  local hash slot base
  hash="$(printf '%s' "$seed" | cksum | awk '{print $1}')"
  slot=$((hash % 200))
  base=$((15000 + slot * 20))
  echo "$base"
}

claim_device_lock() {
  local udid="$1"
  local lock_dir="$DEVICE_LOCKS_DIR/${udid}.lock"

  if mkdir "$lock_dir" 2>/dev/null; then
    printf '%s\n' "$SANITIZED_SESSION" > "$lock_dir/session"
    SIMULATOR_LOCK_DIR="$lock_dir"
    LOCK_ACQUIRED_THIS_RUN=true
    return 0
  fi

  if [[ -f "$lock_dir/session" ]]; then
    local owner
    owner="$(cat "$lock_dir/session" 2>/dev/null || true)"
    if [[ "$owner" == "$SANITIZED_SESSION" ]]; then
      SIMULATOR_LOCK_DIR="$lock_dir"
      return 0
    fi
  fi

  return 1
}

collect_candidate_devices() {
  local line
  local in_ios=false
  local saw_first_ios=false

  while IFS= read -r line; do
    if [[ "$line" == --\ iOS* ]]; then
      if [[ "$saw_first_ios" == false ]]; then
        saw_first_ios=true
        in_ios=true
      else
        in_ios=false
      fi
      continue
    fi

    if [[ "$line" == --* ]]; then
      in_ios=false
      continue
    fi

    if [[ "$in_ios" != true ]]; then
      continue
    fi

    if [[ "$line" != *"("*")"* ]]; then
      continue
    fi

    local udid
    local name
    udid="$(printf '%s\n' "$line" | sed -n 's/.*(\([A-F0-9-][A-F0-9-]*\)).*/\1/p')"
    name="$(printf '%s\n' "$line" | sed -E 's/^ +//; s/ \([A-F0-9-]+\).*//')"
    if [[ -n "$udid" && -n "$name" ]]; then
      echo "${name}|${udid}"
    fi
  done < <(xcrun simctl list devices available)
}

choose_simulator() {
  local candidates=()
  local iphone_candidates=()
  local ipad_candidates=()

  while IFS='|' read -r name udid; do
    [[ -z "$name" || -z "$udid" ]] && continue

    if [[ -n "$DEVICE_REQUEST" ]]; then
      if [[ "$udid" != "$DEVICE_REQUEST" && "$name" != *"$DEVICE_REQUEST"* ]]; then
        continue
      fi
    fi

    candidates+=("$name|$udid")
    if [[ "$name" == iPhone* ]]; then
      iphone_candidates+=("$name|$udid")
    else
      ipad_candidates+=("$name|$udid")
    fi
  done < <(collect_candidate_devices)

  if (( ${#candidates[@]} == 0 )); then
    echo "No matching iOS simulators found for request: ${DEVICE_REQUEST:-<auto>}" >&2
    exit 1
  fi

  local entry name udid
  for entry in "${iphone_candidates[@]}"; do
    [[ -z "$entry" ]] && continue
    name="${entry%%|*}"
    udid="${entry##*|}"

    if claim_device_lock "$udid"; then
      SIMULATOR_NAME="$name"
      SIMULATOR_UDID="$udid"
      return 0
    fi
  done

  for entry in "${ipad_candidates[@]}"; do
    [[ -z "$entry" ]] && continue
    name="${entry%%|*}"
    udid="${entry##*|}"

    if claim_device_lock "$udid"; then
      SIMULATOR_NAME="$name"
      SIMULATOR_UDID="$udid"
      return 0
    fi
  done

  echo "No unlocked simulator is available for session '$SANITIZED_SESSION'." >&2
  echo "Locked devices:" >&2
  for lock_path in "$DEVICE_LOCKS_DIR"/*.lock; do
    [[ -e "$lock_path" ]] || continue
    local lock_udid owner
    lock_udid="$(basename "$lock_path" .lock)"
    owner="$(cat "$lock_path/session" 2>/dev/null || echo unknown)"
    echo "  $lock_udid -> $owner" >&2
  done
  exit 1
}

if [[ -z "$SESSION_ID" ]]; then
  SESSION_ID="$(default_session_id)"
  echo "No --id provided. Using worktree session id: $SESSION_ID"
fi

SANITIZED_SESSION="$(sanitize_id "$SESSION_ID")"
if [[ -z "$SANITIZED_SESSION" ]]; then
  echo "Session ID resolved to empty value after sanitization." >&2
  exit 1
fi

if [[ -z "$PROJECT_ID" ]]; then
  PROJECT_ID="brad-os-${SANITIZED_SESSION}"
fi

SESSION_DIR="$QA_STATE_ROOT/sessions/$SANITIZED_SESSION"
DEVICE_LOCKS_DIR="$QA_STATE_ROOT/device-locks"
LOG_DIR="$SESSION_DIR/logs"
PID_DIR="$SESSION_DIR/pids"
DATA_DIR="$SESSION_DIR/data"
OTEL_DIR="$SESSION_DIR/otel"
STATE_FILE="$SESSION_DIR/state.env"
FIREBASE_CONFIG="$SESSION_DIR/firebase.json"
WORKTREE_LINK="$SESSION_DIR/worktree-root"
FIREBASE_LOG="$LOG_DIR/firebase.log"
OTEL_LOG="$LOG_DIR/otel.log"
FIREBASE_PID_FILE="$PID_DIR/firebase.pid"
OTEL_PID_FILE="$PID_DIR/otel.pid"

mkdir -p "$LOG_DIR" "$PID_DIR" "$DATA_DIR" "$OTEL_DIR" "$DEVICE_LOCKS_DIR"
ln -sfn "$ROOT_DIR" "$WORKTREE_LINK"

if $FRESH_DATA; then
  find "$DATA_DIR" -mindepth 1 -delete || true
  find "$OTEL_DIR" -mindepth 1 -delete || true
  find "$LOG_DIR" -mindepth 1 -delete || true
fi

if [[ -f "$STATE_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$STATE_FILE"
fi

if [[ -z "${FUNCTIONS_PORT:-}" ]]; then
  PORT_BASE="$(pick_ports_from_hash "$SANITIZED_SESSION")"
  FUNCTIONS_PORT="$PORT_BASE"
  HOSTING_PORT=$((PORT_BASE + 1))
  FIRESTORE_PORT=$((PORT_BASE + 2))
  UI_PORT=$((PORT_BASE + 3))
  OTEL_PORT=$((PORT_BASE + 4))
  HUB_PORT=$((PORT_BASE + 5))
  LOGGING_PORT=$((PORT_BASE + 6))
fi

generate_firebase_config() {
  FIREBASE_TEMPLATE="$ROOT_DIR/firebase.json" \
  FIREBASE_CONFIG="$FIREBASE_CONFIG" \
  DATA_DIR="$DATA_DIR" \
  FUNCTIONS_PORT="$FUNCTIONS_PORT" \
  HOSTING_PORT="$HOSTING_PORT" \
  FIRESTORE_PORT="$FIRESTORE_PORT" \
  UI_PORT="$UI_PORT" \
  HUB_PORT="$HUB_PORT" \
  LOGGING_PORT="$LOGGING_PORT" \
  node <<'NODE'
const fs = require('fs');

const templatePath = process.env.FIREBASE_TEMPLATE;
const configPath = process.env.FIREBASE_CONFIG;
const dataDir = process.env.DATA_DIR;

const config = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
config.functions = config.functions ?? {};
config.functions.source = 'worktree-root/packages/functions';

config.emulators = config.emulators ?? {};
config.emulators.functions = {
  ...(config.emulators.functions ?? {}),
  port: Number(process.env.FUNCTIONS_PORT),
};
config.emulators.firestore = {
  ...(config.emulators.firestore ?? {}),
  port: Number(process.env.FIRESTORE_PORT),
};
config.emulators.hosting = {
  ...(config.emulators.hosting ?? {}),
  port: Number(process.env.HOSTING_PORT),
};
config.emulators.ui = {
  ...(config.emulators.ui ?? {}),
  enabled: true,
  port: Number(process.env.UI_PORT),
};
config.emulators.hub = { port: Number(process.env.HUB_PORT) };
config.emulators.logging = { port: Number(process.env.LOGGING_PORT) };
config.emulators.import = dataDir;
config.emulators.export_on_exit = dataDir;
config.emulators.singleProjectMode = true;
config.hosting = config.hosting ?? {};
config.hosting.public = 'worktree-root/public';

fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
NODE
}

lease_and_boot_simulator() {
  local existing_udid
  existing_udid="${SIMULATOR_UDID:-}"

  if [[ -n "$existing_udid" && -n "${SIMULATOR_LOCK_DIR:-}" ]]; then
    if [[ -d "$SIMULATOR_LOCK_DIR" && -f "$SIMULATOR_LOCK_DIR/session" ]]; then
      local owner
      owner="$(cat "$SIMULATOR_LOCK_DIR/session" 2>/dev/null || true)"
      if [[ "$owner" == "$SANITIZED_SESSION" ]]; then
        if xcrun simctl list devices | rg -q "$existing_udid"; then
          SIMULATOR_UDID="$existing_udid"
          SIMULATOR_NAME="$(
            xcrun simctl list devices |
              rg "$existing_udid" |
              sed -E 's/^ +//; s/ \([A-F0-9-]+\).*//' |
              tail -1
          )"
        fi
      fi
    fi
  fi

  if [[ -z "${SIMULATOR_UDID:-}" ]]; then
    choose_simulator
  fi

  xcrun simctl boot "$SIMULATOR_UDID" >/dev/null 2>&1 || true
  xcrun simctl bootstatus "$SIMULATOR_UDID" -b >/dev/null

  xcrun simctl spawn "$SIMULATOR_UDID" launchctl setenv BRAD_OS_API_URL "http://127.0.0.1:${HOSTING_PORT}/api/dev"
  xcrun simctl spawn "$SIMULATOR_UDID" launchctl setenv BRAD_OS_OTEL_BASE_URL "http://127.0.0.1:${OTEL_PORT}"
  xcrun simctl spawn "$SIMULATOR_UDID" launchctl setenv BRAD_OS_QA_ID "$SANITIZED_SESSION"
  xcrun simctl spawn "$SIMULATOR_UDID" launchctl unsetenv USE_EMULATOR || true
}

start_firebase() {
  local health_url
  health_url="http://127.0.0.1:${FUNCTIONS_PORT}/${PROJECT_ID}/us-central1/devHealth"

  if is_pid_running "$FIREBASE_PID_FILE"; then
    echo "Firebase emulator already running for $SANITIZED_SESSION (pid $(cat "$FIREBASE_PID_FILE"))."
    return 0
  fi

  if ! curl -s -f "$health_url" >/dev/null 2>&1; then
    for port in "$FUNCTIONS_PORT" "$FIRESTORE_PORT" "$HOSTING_PORT" "$UI_PORT" "$HUB_PORT" "$LOGGING_PORT"; do
      lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null || true
    done
  fi

  generate_firebase_config

  echo "Building functions..."
  (cd "$ROOT_DIR" && npm run build -w @brad-os/functions)

  echo "Starting Firebase emulators for $SANITIZED_SESSION..."
  pushd "$ROOT_DIR" >/dev/null
  nohup firebase emulators:start --only functions,firestore,hosting --config "$FIREBASE_CONFIG" --project "$PROJECT_ID" >"$FIREBASE_LOG" 2>&1 < /dev/null &
  local pid="$!"
  popd >/dev/null

  if [[ -z "$pid" ]]; then
    echo "Could not determine Firebase emulator pid." >&2
    exit 1
  fi
  echo "$pid" > "$FIREBASE_PID_FILE"

  wait_for_http_ok "Firebase functions" "$health_url" "$TIMEOUT_SECONDS" || {
    echo "Last Firebase log lines:" >&2
    tail -n 40 "$FIREBASE_LOG" >&2 || true
    exit 1
  }
}

start_otel() {
  if is_pid_running "$OTEL_PID_FILE"; then
    echo "OTel collector already running for $SANITIZED_SESSION (pid $(cat "$OTEL_PID_FILE"))."
    return 0
  fi

  echo "Starting OTel collector for $SANITIZED_SESSION..."
  pushd "$ROOT_DIR" >/dev/null
  OTEL_COLLECTOR_PORT="$OTEL_PORT" \
  OTEL_OUTPUT_DIR="$OTEL_DIR" \
    nohup npx tsx scripts/otel-collector/index.ts >"$OTEL_LOG" 2>&1 < /dev/null &
  local pid="$!"
  popd >/dev/null

  if [[ -z "$pid" ]]; then
    echo "Could not determine OTel collector pid." >&2
    exit 1
  fi
  echo "$pid" > "$OTEL_PID_FILE"

  wait_for_port_listener "OTel collector" "$OTEL_PORT" "$TIMEOUT_SECONDS" || {
    echo "Last OTel log lines:" >&2
    tail -n 40 "$OTEL_LOG" >&2 || true
    exit 1
  }
}

if $START_FIREBASE; then
  start_firebase
fi

if $START_OTEL; then
  start_otel
fi

if $SETUP_SIMULATOR; then
  lease_and_boot_simulator
fi

cat > "$STATE_FILE" <<EOF_STATE
QA_STATE_ROOT="$QA_STATE_ROOT"
WORKTREE_ROOT="$ROOT_DIR"
SESSION_ID="$SANITIZED_SESSION"
PROJECT_ID="$PROJECT_ID"
FUNCTIONS_PORT="$FUNCTIONS_PORT"
HOSTING_PORT="$HOSTING_PORT"
FIRESTORE_PORT="$FIRESTORE_PORT"
UI_PORT="$UI_PORT"
OTEL_PORT="$OTEL_PORT"
HUB_PORT="$HUB_PORT"
LOGGING_PORT="$LOGGING_PORT"
SIMULATOR_UDID="${SIMULATOR_UDID:-}"
SIMULATOR_NAME="${SIMULATOR_NAME:-}"
SIMULATOR_LOCK_DIR="${SIMULATOR_LOCK_DIR:-}"
FIREBASE_CONFIG="$FIREBASE_CONFIG"
FIREBASE_LOG="$FIREBASE_LOG"
OTEL_LOG="$OTEL_LOG"
FIREBASE_PID_FILE="$FIREBASE_PID_FILE"
OTEL_PID_FILE="$OTEL_PID_FILE"
EOF_STATE

LOCK_ACQUIRED_THIS_RUN=false

echo ""
echo "QA environment ready:"
echo "  Session ID:    $SANITIZED_SESSION"
echo "  Project ID:    $PROJECT_ID"
echo "  Functions URL: http://127.0.0.1:${FUNCTIONS_PORT}/${PROJECT_ID}/us-central1/devHealth"
echo "  API Base URL:  http://127.0.0.1:${HOSTING_PORT}/api/dev"
echo "  OTel Base URL: http://127.0.0.1:${OTEL_PORT}"
echo "  Simulator:     ${SIMULATOR_NAME:-n/a} (${SIMULATOR_UDID:-not configured})"
echo "  Shared state:  $QA_STATE_ROOT"
echo "  State file:    $STATE_FILE"
echo ""

echo "Next commands:"
echo "  npm run qa:build -- --id ${SANITIZED_SESSION}"
echo "  npm run qa:launch -- --id ${SANITIZED_SESSION}"
echo "  npm run qa:start -- --id ${SANITIZED_SESSION}"
