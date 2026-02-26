#!/bin/bash
set -uo pipefail

# Environment doctor for brad-os
# Verifies all required tooling is installed and prints install commands
# for anything missing.
#
# Usage:
#   npm run doctor
#   bash scripts/doctor.sh

# --- ANSI Colors (same as validate.sh) ---
BOLD='\033[1m'
GREEN='\033[32m'
RED='\033[31m'
DIM='\033[2m'
RESET='\033[0m'

# --- State ---
ISSUES=0
INSTALL_CMDS=()
FAST_MODE="${BRAD_DOCTOR_FAST:-0}"

# --- Helper: check a command exists ---
# check_tool <name> <install_cmd> [min_major_version]
#
# If min_major_version is provided, extracts the major version from
# `<name> --version` or `<name> -v` output and compares.
check_tool() {
  local name="$1"
  local install_cmd="$2"
  local min_major="${3:-}"

  if ! command -v "$name" >/dev/null 2>&1; then
    printf "  ${RED}✗ %-18s${RESET} ${DIM}not found${RESET}\n" "$name"
    INSTALL_CMDS+=("$install_cmd")
    ((ISSUES++))
    return
  fi

  local version
  if [ "$FAST_MODE" = "1" ]; then
    version="installed (fast)"
  else
    # Get version string
    version=$("$name" --version 2>/dev/null || "$name" -v 2>/dev/null || echo "unknown")
    # Extract first version-like number (e.g., "v22.12.0" → "22.12.0", "13.29.1" → "13.29.1")
    version=$(echo "$version" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
    [ -z "$version" ] && version="installed"
  fi

  if [ -n "$min_major" ] && [ "$version" != "installed" ] && [ "$FAST_MODE" != "1" ]; then
    local major
    major=$(echo "$version" | cut -d. -f1)
    if [ "$major" -lt "$min_major" ] 2>/dev/null; then
      printf "  ${RED}✗ %-18s${RESET} ${DIM}v%s (need ≥ %s)${RESET}\n" "$name" "$version" "$min_major"
      INSTALL_CMDS+=("$install_cmd")
      ((ISSUES++))
      return
    fi
    printf "  ${GREEN}✓ %-18s${RESET} ${DIM}v%s (≥ %s)${RESET}\n" "$name" "$version" "$min_major"
  else
    printf "  ${GREEN}✓ %-18s${RESET} ${DIM}%s${RESET}\n" "$name" "$version"
  fi
}

# --- Helper: check project setup ---
check_setup() {
  local label="$1"
  local condition="$2"   # "ok" or "fail"
  local detail="$3"
  local fix_cmd="$4"

  if [ "$condition" = "ok" ]; then
    printf "  ${GREEN}✓ %-18s${RESET} ${DIM}%s${RESET}\n" "$label" "$detail"
  else
    printf "  ${RED}✗ %-18s${RESET} ${DIM}%s${RESET}\n" "$label" "$detail"
    INSTALL_CMDS+=("$fix_cmd")
    ((ISSUES++))
  fi
}

# --- Run checks ---
printf "\n"

# Ensure cargo is in PATH if installed via rustup
if ! command -v cargo &>/dev/null; then
  [ -f "$HOME/.cargo/env" ] && source "$HOME/.cargo/env"
fi

# Tool checks
check_tool "node" "brew install node@22  # or: nvm install 22" 22
check_tool "npm" "# npm comes with Node — reinstall Node to update npm" 10
check_tool "firebase" "npm install -g firebase-tools"
check_tool "cargo" "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
check_tool "gitleaks" "brew install gitleaks"
check_tool "xcodegen" "brew install xcodegen"
check_tool "rustup" "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
check_tool "cargo" "install Rust via rustup (https://rustup.rs)"

if command -v cargo-llvm-cov >/dev/null 2>&1; then
  check_setup "cargo-llvm-cov" "ok" "installed" ""
else
  check_setup "cargo-llvm-cov" "fail" "missing" "cargo install cargo-llvm-cov --locked"
fi

if command -v rustup >/dev/null 2>&1 && rustup component list --installed | grep -Fxq "llvm-tools-preview"; then
  check_setup "llvm-tools-preview" "ok" "installed" ""
else
  check_setup "llvm-tools-preview" "fail" "missing rustup component" "rustup component add llvm-tools-preview"
fi

# Project setup checks
printf "\n"

# Git hooks
HOOKS_PATH=$(git config core.hooksPath 2>/dev/null || echo "")
if [ "$HOOKS_PATH" = "hooks" ]; then
  check_setup "git hooks" "ok" "hooks/" "npm install  # sets core.hooksPath via postinstall"
else
  check_setup "git hooks" "fail" "not configured (got: '${HOOKS_PATH:-<unset>}')" "npm install  # sets core.hooksPath via postinstall"
fi

# node_modules
if [ -d "node_modules" ]; then
  check_setup "node_modules" "ok" "present" ""
else
  check_setup "node_modules" "fail" "missing" "npm install"
fi

# --- Summary ---
printf "\n"
if [ "$ISSUES" -eq 0 ]; then
  printf "  ${GREEN}${BOLD}PASS${RESET}  ${DIM}All dependencies satisfied.${RESET}\n\n"
else
  printf "  ${RED}${BOLD}FAIL${RESET}  ${DIM}%d issue(s) found. Install missing dependencies:${RESET}\n\n" "$ISSUES"
  for cmd in "${INSTALL_CMDS[@]}"; do
    printf "    %s\n" "$cmd"
  done
  printf "\n"
  exit 1
fi
