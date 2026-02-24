#!/bin/bash
set -euo pipefail

# Unified validation pipeline for brad-os
# Runs all quality checks in sequence, failing fast on first error.
#
# Usage:
#   npm run validate          # All checks (typecheck + lint + test + architecture)
#   npm run validate:quick    # Fast checks only (typecheck + lint)

BOLD='\033[1m'
GREEN='\033[32m'
RED='\033[31m'
DIM='\033[2m'
RESET='\033[0m'

QUICK=false
if [ "${1:-}" = "--quick" ]; then
  QUICK=true
fi

TOTAL_START=$(date +%s)
PASSED=0
FAILED=0

run_check() {
  local name="$1"
  shift
  local start=$(date +%s)

  printf "${BOLD}▶ ${name}${RESET}\n"

  if "$@"; then
    local end=$(date +%s)
    local elapsed=$((end - start))
    printf "${GREEN}✓ ${name}${RESET} ${DIM}(${elapsed}s)${RESET}\n\n"
    PASSED=$((PASSED + 1))
  else
    local end=$(date +%s)
    local elapsed=$((end - start))
    printf "${RED}✗ ${name}${RESET} ${DIM}(${elapsed}s)${RESET}\n\n"
    FAILED=$((FAILED + 1))

    TOTAL_END=$(date +%s)
    TOTAL_ELAPSED=$((TOTAL_END - TOTAL_START))

    printf "\n${BOLD}--- Validation FAILED ---${RESET}\n"
    printf "${RED}Failed at: ${name}${RESET}\n"
    printf "${DIM}${PASSED} passed, ${FAILED} failed (${TOTAL_ELAPSED}s total)${RESET}\n"
    exit 1
  fi
}

if [ "$QUICK" = true ]; then
  printf "\n${BOLD}=== Quick Validation ===${RESET}\n\n"
else
  printf "\n${BOLD}=== Full Validation ===${RESET}\n\n"
fi

run_check "TypeScript compilation" npx tsc -b
run_check "ESLint" npx eslint . --ext .ts

if [ "$QUICK" = false ]; then
  run_check "Unit tests" npx vitest run
  run_check "Architecture enforcement" node --disable-warning=ExperimentalWarning scripts/lint-architecture.ts
fi

TOTAL_END=$(date +%s)
TOTAL_ELAPSED=$((TOTAL_END - TOTAL_START))

printf "\n${BOLD}--- Validation PASSED ---${RESET}\n"
printf "${GREEN}All ${PASSED} checks passed${RESET} ${DIM}(${TOTAL_ELAPSED}s total)${RESET}\n"
