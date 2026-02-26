# Agent Guidance Plan: Prefer Rust for Dev Tooling

## Overview
Add explicit agent-facing guidance to prefer Rust for non-trivial dev tooling and shell only for thin wrappers.

## Current State Analysis
- Agent policy entrypoint is `AGENTS.md`.
- Workflow conventions document quality gates and validate behavior: `docs/conventions/workflow.md`.
- No current explicit preference statement for Rust over complex shell orchestration.
- `main` now provides a shared Rust dev-tooling foundation in `tools/dev-cli` (`runner`, `reporter`, `timing`, `precommit` helpers).

## Desired End State
- AGENTS guidance explicitly states: complex tooling/orchestration should be Rust-first.
- Workflow conventions define when shell is acceptable and when migration is required.
- Guidance references shell complexity lint and migration plans.
- Coverage directive is explicit: any tooling code created or modified under this policy must enforce 90-100% line coverage (hard floor 90%, target >=95%).

## Key Discoveries
- Current AGENTS doc provides task and docs map but not implementation language preference.
- Existing `tools/dev-cli` modules are reusable for upcoming script migrations and should be referenced explicitly in guidance.

## What We're NOT Doing
- Not banning shell scripts entirely.
- Not changing app runtime language choices.

## Implementation Approach
Add concise normative rules in AGENTS + workflow docs with objective criteria tied to complexity lint.

## Phase 1: Draft Rule Language
### Changes Required
- Add AGENTS section `Dev Tooling Language Preference`:
  - Rust for orchestration/stateful tooling.
  - Shell allowed only for thin delegation wrappers.
- Add explicit examples from migrated scripts.

### Success Criteria
- Guidance is brief, unambiguous, and agent-actionable.

### Confirmation Gate
- Approve wording and strictness.

## Phase 2: Wire to Enforcement Docs
### Changes Required
- Update `docs/conventions/workflow.md` with shell complexity policy and lint expectations.
- Cross-link shell complexity guardrail plan and architecture lint command.

### Success Criteria
- Contributors can see policy + enforcement in one path.

### Confirmation Gate
- Validate docs links resolve and are consistent with lint behavior.

## Testing Strategy
- Documentation lint pass (`arch-lint` markdown link checks).
- Manual review for clarity and non-ambiguity.

## References
- `AGENTS.md`
- `docs/conventions/workflow.md`
- `thoughts/shared/plans/active/2026-02-26-shell-complexity-guardrail.md`
