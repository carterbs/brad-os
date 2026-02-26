#!/usr/bin/env bash
set -uo pipefail

run_rust_validate() {
  local repo_root
  local binary
  local source_dir

  repo_root="$(cd "$(dirname "$0")/.." && pwd)"
  binary="$repo_root/target/release/brad-validate"
  source_dir="$repo_root/tools/dev-cli/src"

  if ! command -v cargo >/dev/null 2>&1; then
    if [ -f "$HOME/.cargo/env" ]; then
      # shellcheck disable=SC1091
      source "$HOME/.cargo/env"
    fi
  fi

  if [ ! -f "$binary" ] || [ -n "$(find "$source_dir" -newer "$binary" 2>/dev/null -print -quit)" ]; then
    if ! cargo build -p dev-cli --release --manifest-path "$repo_root/Cargo.toml" -q; then
      return 1
    fi
  fi

  if [ -x "$binary" ]; then
    exec "$binary" "$@"
  fi
  return 1
}

run_legacy_validate() {
  # Unified validation pipeline for brad-os
  # Runs all quality checks IN PARALLEL, logs verbose output to .validate/*.log,
  # and prints a tiny pass/fail summary.
  #
  # Usage:
  #   npm run validate          # All checks (typecheck + lint + test + architecture)
  #   npm run validate:quick    # Fast checks only (typecheck + lint)
  #
  # Targeted test execution (optional):
  #   BRAD_VALIDATE_TEST_FILES - newline-separated file paths to pass to vitest
  #   BRAD_VALIDATE_TEST_PROJECTS - newline-separated vitest project names to run
  #   Example:
  #   BRAD_VALIDATE_TEST_FILES=$'packages/functions/src/services/foo.test.ts\n' \
  #   BRAD_VALIDATE_TEST_PROJECTS=$'functions\n' npm run validate

  set -o pipefail

  for arg in "$@"; do
    case "$arg" in
      --quick)
        QUICK=true
        ;;
    esac
  done

  TEST_FILES=()
  TEST_PROJECTS=()

  if [ -n "${BRAD_VALIDATE_TEST_FILES:-}" ]; then
    while IFS= read -r file; do
      [ -n "$file" ] && TEST_FILES+=("$file")
    done <<EOF
$(printf "%s" "${BRAD_VALIDATE_TEST_FILES}")
EOF
  fi

  if [ -n "${BRAD_VALIDATE_TEST_PROJECTS:-}" ]; then
    while IFS= read -r project; do
      [ -n "$project" ] && TEST_PROJECTS+=("$project")
    done <<EOF
$(printf "%s" "${BRAD_VALIDATE_TEST_PROJECTS}")
EOF
  fi

  LOG_DIR=".validate"
  rm -rf "$LOG_DIR"
  mkdir -p "$LOG_DIR"

  QUICK="${QUICK:-false}"

  TOTAL_START=$(date +%s)

  # --- Define checks ---
  CHECKS=("typecheck" "lint")
  $QUICK || CHECKS+=("test" "architecture")

  run_check() {
    local key="$1"
    local start
    local rc=0
    local -a vitest_args=()
    local project
    local file

    start=$(date +%s)
    case "$key" in
      typecheck) npx tsc -b > "$LOG_DIR/typecheck.log" 2>&1 || rc=$? ;;
      lint) npx oxlint packages/functions/src --config .oxlintrc.json > "$LOG_DIR/lint.log" 2>&1 || rc=$? ;;
      test)
        if [ "${#TEST_PROJECTS[@]}" -gt 0 ]; then
          for project in "${TEST_PROJECTS[@]}"; do
            vitest_args+=(--project "$project")
          done
        fi
        if [ "${#TEST_FILES[@]}" -gt 0 ]; then
          for file in "${TEST_FILES[@]}"; do
            vitest_args+=("$file")
          done
        fi

        if [ "${#vitest_args[@]}" -gt 0 ]; then
          npx vitest run "${vitest_args[@]}" > "$LOG_DIR/test.log" 2>&1 || rc=$?
        else
          npx vitest run > "$LOG_DIR/test.log" 2>&1 || rc=$?
        fi
        ;;
      architecture) bash scripts/arch-lint > "$LOG_DIR/architecture.log" 2>&1 || rc=$? ;;
    esac

    local elapsed
    elapsed=$(( $(date +%s) - start ))
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
}

if [ "${BRAD_USE_RUST_VALIDATE:-1}" = "1" ]; then
  run_rust_validate "$@"
  exit $?
fi

run_legacy_validate "$@"
