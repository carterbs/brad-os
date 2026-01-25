#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

echo ""
echo "Running validations..."
echo ""

# Create temp files for capturing output
TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

# Track overall status
all_passed=true

# Kill any existing process on port 3100 to avoid conflicts
lsof -ti:3100 | xargs kill 2>/dev/null || true

# Strategy: Run E2E in background (slow, 40s) while running fast checks sequentially
# This avoids resource contention while still parallelizing the bottleneck

# Start E2E Tests in background (the slow one)
# Set CI=true to ensure Playwright starts a fresh server with NODE_ENV=test
# Set PLAYWRIGHT_HTML_OPEN=never to prevent browser from opening on failure
(CI=true PLAYWRIGHT_HTML_OPEN=never npm run test:e2e > "$TMPDIR/e2e.out" 2>&1; echo $? > "$TMPDIR/e2e.exit") &
e2e_pid=$!

# Run fast checks sequentially while E2E runs in background
# TypeScript (~0.2s)
echo -n "Checking TypeScript... "
tsc_output=$(npm run typecheck 2>&1)
tsc_exit=$?
if [ $tsc_exit -eq 0 ]; then
    ts_status="PASSED"
    ts_detail="No type errors"
    echo -e "${GREEN}PASSED${NC}"
else
    ts_status="FAILED"
    ts_detail=$(echo "$tsc_output" | grep -c "error TS")" type errors"
    echo -e "${RED}FAILED${NC}"
    all_passed=false
fi

# Lint (~11s)
echo -n "Checking Lint... "
lint_output=$(npm run lint 2>&1)
lint_exit=$?
if [ $lint_exit -eq 0 ]; then
    lint_status="PASSED"
    lint_detail="No lint errors"
    echo -e "${GREEN}PASSED${NC}"
else
    lint_status="FAILED"
    lint_detail=$(echo "$lint_output" | grep -E "[0-9]+ problems" | sed 's/.*\([0-9]*\) problems.*/\1 errors/')
    echo -e "${RED}FAILED${NC}"
    all_passed=false
fi

# Unit Tests (~9s)
echo -n "Running Unit Tests... "
test_output=$(npm test 2>&1)
test_exit=$?
if [ $test_exit -eq 0 ]; then
    unit_status="PASSED"
    unit_detail=$(echo "$test_output" | grep -E "Tests.*passed" | tail -1 | sed 's/.*Tests[[:space:]]*\([0-9]*\) passed.*/\1 passed/')
    echo -e "${GREEN}PASSED${NC}"
else
    unit_status="FAILED"
    failed=$(echo "$test_output" | grep -E "[0-9]+ failed" | head -1 | sed 's/.*\([0-9]*\) failed.*/\1/')
    passed=$(echo "$test_output" | grep -E "[0-9]+ passed" | tail -1 | sed 's/.*\([0-9]*\) passed.*/\1/')
    unit_detail="$failed failed / $passed passed"
    echo -e "${RED}FAILED${NC}"
    all_passed=false
fi

# Wait for E2E to complete
echo -n "Running E2E Tests... "
wait $e2e_pid

e2e_exit=$(cat "$TMPDIR/e2e.exit")
e2e_output=$(cat "$TMPDIR/e2e.out")
if [ "$e2e_exit" -eq 0 ]; then
    e2e_status="PASSED"
    e2e_detail=$(echo "$e2e_output" | grep -E "[0-9]+ passed" | tail -1 | sed 's/.*[[:space:]]\([0-9]*\) passed.*/\1 passed/')
    echo -e "${GREEN}PASSED${NC}"
else
    e2e_status="FAILED"
    failed=$(echo "$e2e_output" | grep -E "[0-9]+ failed" | head -1 | sed 's/.*[[:space:]]\([0-9]*\) failed.*/\1/')
    passed=$(echo "$e2e_output" | grep -E "[0-9]+ passed" | tail -1 | sed 's/.*[[:space:]]\([0-9]*\) passed.*/\1/')
    e2e_detail="$failed failed / $passed passed"
    echo -e "${RED}FAILED${NC}"
    all_passed=false
fi

# Print summary table
echo ""
echo "┌────────────┬───────────┬───────────────────────────┐"
echo "│   Check    │  Status   │          Details          │"
echo "├────────────┼───────────┼───────────────────────────┤"

print_row() {
    local name=$1
    local status=$2
    local detail=$3

    if [ "$status" = "PASSED" ]; then
        status_color="${GREEN}PASSED${NC}"
    else
        status_color="${RED}FAILED${NC}"
    fi

    printf "│ %-10s │ " "$name"
    echo -en "$status_color"
    printf " │ %-25s │\n" "$detail"
}

print_row "TypeScript" "$ts_status" "$ts_detail"
echo "├────────────┼───────────┼───────────────────────────┤"
print_row "Lint" "$lint_status" "$lint_detail"
echo "├────────────┼───────────┼───────────────────────────┤"
print_row "Unit Tests" "$unit_status" "$unit_detail"
echo "├────────────┼───────────┼───────────────────────────┤"
print_row "E2E Tests" "$e2e_status" "$e2e_detail"
echo "└────────────┴───────────┴───────────────────────────┘"
echo ""

if [ "$all_passed" = true ]; then
    exit 0
else
    exit 1
fi
