#!/bin/bash
set -uo pipefail

# Unified validation pipeline for brad-os
# Runs all quality checks IN PARALLEL, logs verbose output to .validate/*.log,
# and prints a tiny pass/fail summary.
#
# Usage:
#   npm run validate          # All checks (typecheck + lint + test + architecture)
#   npm run validate:quick    # Fast checks only (typecheck + lint)

LOG_DIR=".validate"
rm -rf "$LOG_DIR"
mkdir -p "$LOG_DIR"

QUICK=false
[[ "${1:-}" == "--quick" ]] && QUICK=true

TOTAL_START=$(date +%s)

# --- Define checks ---
CHECKS=("typecheck" "lint")
$QUICK || CHECKS+=("test" "architecture")

run_check() {
  local key="$1"
  local start=$(date +%s)
  local rc=0

  case "$key" in
    typecheck)    npx tsc -b                                                             > "$LOG_DIR/typecheck.log"    2>&1 || rc=$? ;;
    lint)         npx eslint . --ext .ts                                                 > "$LOG_DIR/lint.log"         2>&1 || rc=$? ;;
    test)         npx vitest run                                                         > "$LOG_DIR/test.log"         2>&1 || rc=$? ;;
    architecture) node --disable-warning=ExperimentalWarning scripts/lint-architecture.ts > "$LOG_DIR/architecture.log" 2>&1 || rc=$? ;;
  esac

  local elapsed=$(( $(date +%s) - start ))
  echo "$rc $elapsed" > "$LOG_DIR/$key.status"
}

# --- Launch all checks in parallel ---
for check in "${CHECKS[@]}"; do
  run_check "$check" &
done
wait

# --- Summary ---
BOLD='\033[1m'
GREEN='\033[32m'
RED='\033[31m'
DIM='\033[2m'
RESET='\033[0m'

TOTAL_ELAPSED=$(( $(date +%s) - TOTAL_START ))
ALL_PASSED=true

printf "\n"
for check in "${CHECKS[@]}"; do
  read -r rc elapsed < "$LOG_DIR/$check.status"
  if [ "$rc" -eq 0 ]; then
    printf "  ${GREEN}✓ %-15s${RESET} ${DIM}%ss${RESET}\n" "$check" "$elapsed"
  else
    printf "  ${RED}✗ %-15s${RESET} ${DIM}%ss  → .validate/%s.log${RESET}\n" "$check" "$elapsed" "$check"
    ALL_PASSED=false
  fi
done

printf "\n"
if $ALL_PASSED; then
  printf "  ${GREEN}${BOLD}PASS${RESET} ${DIM}(%ss)${RESET}\n\n" "$TOTAL_ELAPSED"
else
  printf "  ${RED}${BOLD}FAIL${RESET} ${DIM}(%ss)  Logs: .validate/*.log${RESET}\n\n" "$TOTAL_ELAPSED"
  exit 1
fi
