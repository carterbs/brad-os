# Oxlint Migration Plan

Status: **Completed (2026-02-26)**

All lint execution is now through Oxlint. legacy lint runtime dependency and configuration are removed, and the migration plan is considered complete. Type-aware strictness has intentionally been deferred to follow the user’s request to complete the tool cutover first.

## Overview

Replace legacy lint with Oxlint for the main TypeScript lint gate, keeping strict enforcement on explicit `any` and adding pragmatic safeguards around unsafe `unknown` usage, while reducing lint runtime from ~8-9s to a clearly faster target.

## Current State Analysis

- Lint runs through legacy lint from root scripts: `npm run lint` / `npm run lint:fix` in [`package.json:14`](../../../package.json:14), [`package.json:15`](../../../package.json:15).
- Validation invokes legacy lint directly and writes `.validate/lint.log` in [`scripts/validate.sh:32`](../../../scripts/validate.sh:32).
- Latest recorded lint timing in local validation artifacts is 9s in [`.validate/lint.status:1`](../../../.validate/lint.status:1).
- Pre-commit and CI rely on `npm run validate`, not raw legacy lint output parsing: [`hooks/pre-commit:47`](../../../hooks/pre-commit:47), [`.github/workflows/ci.yml:32`](../../../.github/workflows/ci.yml:32).
- Current lint behavior comes from a strict, type-aware legacy-lint` setup in [`.legacy-lint.cjs:7`](../../../.legacy-lint.cjs:7), [`.legacy-lint.cjs:10`](../../../.legacy-lint.cjs:10), [`.legacy-lint.cjs:25`](../../../.legacy-lint.cjs:25).
- `no-explicit-any` is already a hard error in [`.legacy-lint.cjs:26`](../../../.legacy-lint.cjs:26), matching documented principles in [`docs/golden-principles.md:8`](../../../docs/golden-principles.md:8).
- Scope is narrower than it looks: `scripts/` is ignored except `scripts/lint-*.ts` in [`.legacy-lint.cjs:46`](../../../.legacy-lint.cjs:46), [`.legacy-lint.cjs:47`](../../../.legacy-lint.cjs:47).
- Local Claude automation currently auto-fixes TS/JS edits with legacy lint in [`.claude/settings.json:9`](../../../.claude/settings.json:9).

## Desired End State

- `npm run lint` and `npm run lint:fix` run Oxlint (not legacy lint) with equivalent repo scope.
- Validation, hooks, and CI keep the same entrypoints and log artifacts (`.validate/*.log`), so team workflow does not change.
- `no-explicit-any` remains a hard error.
- Unsafe type flows are covered as far as Oxlint type-aware mode allows, with `unknown`-heavy test patterns tracked and reduced over time.
- Lint runtime target on this repo:
  - Warm run median: <= 3.0s
  - Cold run median: <= 5.0s
  - Stretch goal: warm <= 2.0s

## Key Discoveries

- Oxlint at repo root catches many `any` violations in `scripts/ralph/*` that are currently out-of-scope under legacy lint; migration must mirror current scope first to avoid noisy regressions.
- Explicit `any` in `packages/functions/src` is already low and mostly test-only suppressions.
- `as unknown as` is concentrated in tests; production code is not the main risk hotspot.
- Oxlint type-aware rules require `oxlint-tsgolint` and TypeScript-go constraints; this must be treated as a staged gate, not an all-at-once cutover.

## Benchmark Notes

- Baseline legacy lint timing (from existing `.validate/lint.status`): 9 seconds on prior local run.
- `npm run lint` target has been switched to Oxlint; capture fresh warm/cold baselines after type-aware rollout for comparison.
- legacy lint fallback has been removed after cutover; migration parity is now via Oxlint-specific scripts and type-aware checks.

## What We're NOT Doing

- No formatter migration (Prettier stays as-is).
- No Swift/SwiftLint changes.
- No immediate expansion of lint scope into all `scripts/**`.
- No attempt to eliminate all `unknown` casts in a single PR.

## Implementation Approach

Move in phases with measurable gates:
1. establish baseline and scope parity;
2. introduce Oxlint side-by-side;
3. enable type-aware unsafe rules;
4. cut over validation path;
5. clean up legacy lint only after stability window.

## Phase 1: Baseline and Guardrails

### Overview

Capture reproducible timing and current failure baseline before changing tools.

### Changes Required

- Add a lightweight benchmark script (or documented command set) to run cold/warm lint timings for:
  - current `npm run lint` (legacy lint baseline)
  - candidate Oxlint command(s)
- Record baseline results in this plan file under a `Benchmark Notes` section.
- Add a canary check step to validate that a temporary `any` in a scratch TS file fails lint (and then remove the scratch file).

### Success Criteria

- Baseline timings captured from at least 3 runs each for cold and warm.
- Confirmed that current lint gate fails on explicit `any`.

### Confirmation Gate

- Proceed only after timing and `no-explicit-any` baseline are documented.

## Phase 2: Add Oxlint in Parallel (Non-Breaking)

### Overview

Introduce Oxlint config and scripts without changing `npm run validate` yet.

### Changes Required

- Add Oxlint dependencies (`oxlint`, optionally `@oxlint/migrate` for initial config seed).
- Create Oxlint config (`.oxlintrc.json`) with scope matching current legacy lint behavior:
  - include `packages/functions/src/**/*.ts` and `scripts/lint-*.ts`
  - ignore existing build/config paths equivalent to [`.legacy-lint.cjs:38`](../../../.legacy-lint.cjs:38)-[`.legacy-lint.cjs:47`](../../../.legacy-lint.cjs:47)
- Add scripts in [`package.json`](../../../package.json):
  - `lint:oxlint`
  - `lint:oxlint:fix`
  - `lint:legacy-lint:legacy` (temporary fallback comparison)
- Start with strict priority rules:
  - `typescript/no-explicit-any`: `error`
  - `typescript/no-unused-vars`: `error`
  - `typescript/no-unnecessary-type-assertion`: `warn` initially if noisy
- Keep `npm run lint` pointed at legacy lint during this phase.

### Success Criteria

- `npm run lint:oxlint` runs cleanly on current codebase scope.
- Oxlint flags an injected explicit `any` violation.
- No CI/pre-commit behavior changes yet.

### Confirmation Gate

- Proceed only when Oxlint is stable enough to run in parallel for several local loops.

## Phase 3: Enable Type-Aware Unsafe Checks

### Overview

Turn on Oxlint type-aware rules to enforce “minimal unknown unsafe usage” without blocking migration momentum.

### Changes Required

- Install and wire `oxlint-tsgolint`.
- Configure type-aware Oxlint execution (`--type-aware`) and confirm project compatibility.
- Enable unsafe rule set (priority order):
  - `typescript/no-unsafe-assignment`
  - `typescript/no-unsafe-call`
  - `typescript/no-unsafe-member-access`
  - `typescript/no-unsafe-return`
  - `typescript/no-unsafe-type-assertion`
  - `typescript/no-unnecessary-type-assertion`
- Start as `warn` for the noisiest rules, then ratchet to `error` on agreed schedule.
- Add suppression hygiene note: each new suppression requires a short reason and owner.

### Success Criteria

- Type-aware Oxlint runs successfully in repo.
- Unsafe diagnostics are visible and triaged.
- New explicit `any` remains blocked.

### Confirmation Gate

- Proceed to cutover after at least one clean full `npm run validate` plus targeted unsafe-rule triage.

## Phase 4: Cut Over Main Lint Path

### Overview

Make Oxlint the tool behind existing lint commands and validation pipeline.

### Changes Required

- Switch root scripts in [`package.json:14`](../../../package.json:14), [`package.json:15`](../../../package.json:15) to Oxlint.
- Update [`packages/functions/package.json:14`](../../../packages/functions/package.json:14) to Oxlint.
- Update [`scripts/validate.sh:32`](../../../scripts/validate.sh:32) so lint step uses Oxlint while preserving `.validate/lint.log` behavior.
- Update [`.claude/settings.json:9`](../../../.claude/settings.json:9) auto-fix hook to use Oxlint fix command.
- Keep CI and pre-commit entrypoints unchanged (`npm run validate`).

### Success Criteria

- `npm run validate` succeeds with Oxlint-backed lint.
- Pre-commit and CI behavior is unchanged from developer perspective.
- Measured lint runtime meets or improves toward target (<= 3s warm median goal).

### Confirmation Gate

- Hold for a short soak period (3-7 days of normal usage) before removing legacy lint dependencies.

## Phase 5: Cleanup and Policy Alignment

### Overview

Remove obsolete legacy lint wiring and align docs with Oxlint enforcement model.

### Changes Required

- Remove legacy lint packages/config once fallback is no longer needed.
- Delete or archive `.legacy-lint.cjs` after cutover stability.
- Update docs that explicitly reference legacy lint:
  - [`README.md:78`](../../../README.md:78)
  - [`docs/conventions/typescript.md:6`](../../../docs/conventions/typescript.md:6)
  - [`docs/golden-principles.md:7`](../../../docs/golden-principles.md:7)
  - [`.gitignore:84`](../../../.gitignore:84) if `.legacy-lintcache` is no longer relevant
- Document the final Oxlint rule set and suppression policy.

### Success Criteria

- No runtime path depends on legacy lint.
- Documentation reflects actual lint tool and guarantees.
- `no-explicit-any` and selected unsafe rules remain enforced.

### Confirmation Gate

- Mark plan complete only after validation passes and docs are updated.

## Testing Strategy

### Automated

- `npm run lint` (post-cutover Oxlint path)
- `npm run validate:quick`
- `npm run validate`
- Migration comparison via:
  - `npm run lint:oxlint`
  - `npm run lint:oxlint:type-aware`

### Manual

- Run cold/warm timing checks before and after cutover.
- Verify pre-commit hook still blocks bad commits via `npm run validate`.
- Verify CI still uploads `.validate/*.log` on failure.
- Verify inserted explicit `any` is blocked and then removed.

## Risks and Mitigations

- Risk: type-aware Oxlint setup churn (`oxlint-tsgolint`, TS-go constraints).
  - Mitigation: keep non-type-aware Oxlint gate first; stage type-aware rollout.
- Risk: migration broadens lint scope and creates noise from `scripts/ralph`.
  - Mitigation: mirror existing legacy lint scope in initial Oxlint config.
- Risk: behavior drift on non-priority style rules.
  - Mitigation: prioritize `no-explicit-any` and unsafe rules, treat others as best-effort.

## References

- Local:
  - `.legacy-lint.cjs`
  - `package.json`
  - `scripts/validate.sh`
  - `hooks/pre-commit`
  - `.github/workflows/ci.yml`
  - `.claude/settings.json`
  - `thoughts/shared/research/2026-02-26-legacy-lint-biome-oxlint-assessment.md`
  - `thoughts/shared/research/2026-02-26-type-safety-priority-context.md`
- External:
  - https://oxc.rs/docs/guide/usage/linter.html
  - https://oxc.rs/docs/guide/usage/linter/migrate-from-legacy-lint.html
  - https://oxc.rs/docs/guide/usage/linter/type-aware.html
  - https://oxc.rs/docs/guide/usage/linter/rules/typescript/no-explicit-any
  - https://oxc.rs/docs/guide/usage/linter/rules/typescript/no-unnecessary-type-assertion
  - https://oxc.rs/docs/guide/usage/linter/rules/typescript/strict-boolean-expressions
