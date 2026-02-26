# Rust Migration Plan: `scripts/doctor.sh`

## Overview
Migrate `scripts/doctor.sh` to Rust with parity for tool detection, version checks, setup checks, and remediation output.

## Current State Analysis
- Doctor performs reusable tool checks with optional major-version floors: `scripts/doctor.sh:29`.
- It validates git hooks and `node_modules` setup state: `scripts/doctor.sh:97`, `scripts/doctor.sh:105`.
- It is executed via `npm run doctor`: `package.json:38`.
- `main` added `tools/dev-cli` shared execution/reporting modules that can reduce duplicate command-probing logic.

## Desired End State
- A Rust binary `brad-doctor` (preferably in `tools/dev-cli`) produces equivalent pass/fail behavior and install recommendations.
- Existing tests migrate/expand to Rust-focused coverage.
- Coverage >=95% target (>=90 enforced minimum).

## Key Discoveries
- Existing TypeScript tests are shell-content oriented and not behavior-complete: `scripts/doctor.test.ts:48`.
- Fast mode (`BRAD_DOCTOR_FAST`) must remain supported: `scripts/doctor.sh:22`.

## What We're NOT Doing
- No changes to required tool set unless separately approved.

## Implementation Approach
Implement doctor checks in Rust with explicit command probing and version parsing, reusing shared `dev-cli` helpers where appropriate, plus snapshot tests for output blocks.

## Phase 1: Contract Tests and Fixtures
### Changes Required
- Convert current shell-specific tests to behavior-focused integration tests.
- Add fixtures for missing tool, outdated version, and setup misconfiguration cases.

### Success Criteria
- Baseline output expectations are codified and deterministic.

### Confirmation Gate
- Approve messaging compatibility with existing docs.

## Phase 2: Rust Implementation
### Changes Required
- Implement command existence checks, version extraction, and setup checks.
- Preserve summary formatting and nonzero exit on issues.

### Success Criteria
- `npm run doctor` outputs equivalent pass/fail judgments.

### Confirmation Gate
- Run doctor in intentionally degraded test sandbox.

## Phase 3: Wiring + Coverage
### Changes Required
- Replace npm doctor command with Rust binary.
- Add coverage threshold in global Rust gate.

### Success Criteria
- Coverage >=95% (hard fail <90%).

### Confirmation Gate
- Local quickstart flow still works (`npm run doctor` then `npm run validate`).

## Testing Strategy
- Unit: semver major parsing, issue aggregation logic.
- Integration: fake PATH/tool availability matrix.
- Manual: run from clean checkout and configured checkout.

## References
- `scripts/doctor.sh`
- `scripts/doctor.test.ts`
- `package.json`
