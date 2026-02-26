---
date: 2026-02-26
researcher: codex
git_commit: 01f73ac
branch: main
topic: Type-safety priority context for explicit any, unknown-casting, and lint coverage
tags: [typescript, lint, type-safety, oxlint]
status: complete
---

# Research Question

Analyze the repository for type-safety risk concentration: where explicit `any` is used/suppressed, where `unknown`-casting patterns are common, and which directories are currently linted versus ignored, with practical implications for Oxlint rule rollout.

# Summary

Type-safety debt is concentrated in test code, not production handlers/services. In `packages/functions/src`, explicit `any` is rare and currently appears only behind targeted legacy lint suppressions in test utilities. However, double-cast patterns (`as unknown as`) are frequent: 90 occurrences in `packages/functions/src`, with 89 in test-like files.

Lint coverage is strict for `packages/functions/src` and intentionally narrow for `scripts/`: root legacy lint ignores all of `scripts/` except `scripts/lint-*.ts`. This means the largest explicit `any` cluster (`scripts/ralph/*.test.ts`) is currently outside the main lint gate. There is no active Oxlint config/script in package scripts; `oxlint` appears only in prior research notes.

For Oxlint, this points to a staged approach: enforce `no-explicit-any` and cast-safety rules first in `packages/functions/src` (especially tests), then decide whether to expand lint scope into currently ignored script directories.

# Detailed Findings

## 1) Explicit `any` usage and suppression

In currently linted TypeScript scope (`packages/functions/src` + `scripts/lint-*.ts`), explicit `any` appears at:

- `packages/functions/src/services/firestore-cycling.service.test.ts:18`
- `packages/functions/src/services/firestore-cycling.service.test.ts:20`
- `packages/functions/src/__tests__/utils/mock-repository.ts:18`
- `scripts/lint-architecture.test.ts:332` (inside a string literal fixture, not executable TS type usage)

The functions-side `any` usages are paired with explicit suppression comments:

- `packages/functions/src/services/firestore-cycling.service.test.ts:17`
- `packages/functions/src/services/firestore-cycling.service.test.ts:19`
- `packages/functions/src/__tests__/utils/mock-repository.ts:17`

Additional type-safety suppressions in tests:

- legacy-lint-rule/no-unsafe-assignment` suppressed 8x in `packages/functions/src/services/calendar.service.test.ts` at lines `358`, `382`, `407`, `425`, `968`, `990`, `1011`, `1032`
- legacy-lint-rule/no-unsafe-member-access` suppressed 2x in `packages/functions/src/handlers/tts.test.ts` at lines `273`, `314`

Outside linted script scope, explicit `any` is concentrated in:

- `scripts/ralph/index.test.ts` (34 hits)
- `scripts/ralph/agent.test.ts` (8 hits)
- `scripts/codemod-print-to-logger.ts` (2 hits at lines `145`, `150`)

## 2) `unknown`-casting hotspots (`as unknown as`)

`as unknown as` occurs 90 times in `packages/functions/src`.

Top concentration by file:

- `packages/functions/src/repositories/guided-meditation.repository.test.ts` (18)
- `packages/functions/src/services/mesocycle.service.test.ts` (8)
- `packages/functions/src/services/workout.service.test.ts` (7)
- `packages/functions/src/repositories/plan.repository.test.ts` (6)
- `packages/functions/src/repositories/mesocycle.repository.test.ts` (6)
- `packages/functions/src/repositories/mealplan-session.repository.test.ts` (6)
- `packages/functions/src/repositories/cycling-activity.repository.test.ts` (6)

Representative patterns:

- Mock constructor coercion: `... mockImplementation(() => mockRepo as unknown as RepoType)` in `packages/functions/src/services/calendar.service.test.ts:162`
- Matcher coercion: `expect.any(String) as unknown as string` in `packages/functions/src/services/workout.service.test.ts:309`
- Partial-to-concrete coercion for Express/Firestore shapes in `packages/functions/src/__tests__/utils/mock-express.ts:39` and `packages/functions/src/test-utils/firestore-mock.ts:68`

Distribution: 89/90 occurrences are in test-like files (`*.test.ts` or `__tests__`), 1/90 in test utility (`packages/functions/src/test-utils/firestore-mock.ts:68`).

## 3) Current linted vs ignored directories

Root lint execution and rules:

- Root lint command: `package.json:14` (`legacy-lint . --ext .ts --cache --cache-strategy content`)
- Validate pipeline invokes same command: `scripts/validate.sh:32`
- legacy-lint-rule/no-explicit-any` set to `error`: `.legacy-lint.cjs:26`

Lint scope boundaries:

- Type-aware projects: `.legacy-lint.cjs:18-21`
  - `./packages/*/tsconfig.legacy-lint.json`
  - `./scripts/tsconfig.legacy-lint.json`
- `packages/functions/tsconfig.legacy-lint.json` includes `src/**/*`: line `6`
- Root ignore patterns exclude `scripts/` but re-include `scripts/lint-*.ts`: `.legacy-lint.cjs:46-47`
- Also ignored: `dist/`, `lib/`, `node_modules/`, `*.config.js`, `*.config.ts`, `vitest.workspace.ts` (`.legacy-lint.cjs:39-46`)

Net effect:

- Linted now: `packages/functions/src/**`, `scripts/lint-*.ts`
- Ignored now: most of `scripts/**` (including `scripts/ralph/**`), config files, build output dirs
- No active Oxlint wiring: search finds `oxlint` only in `thoughts/shared/research/2026-02-26-legacy-lint-biome-oxlint-assessment.md`

# Code References

| File | Lines | Description |
|------|-------|-------------|
| `.legacy-lint.cjs` | 18-21 | Type-aware project list |
| `.legacy-lint.cjs` | 26 | `no-explicit-any` set to error |
| `.legacy-lint.cjs` | 38-48 | Ignore patterns and scripts exception |
| `package.json` | 14-15 | Root lint commands |
| `scripts/validate.sh` | 22-35 | Validation lint wiring |
| `packages/functions/tsconfig.legacy-lint.json` | 6-7 | legacy lint TS include/exclude |
| `packages/functions/src/services/firestore-cycling.service.test.ts` | 17-20 | Suppressed explicit `any` in test mocks |
| `packages/functions/src/__tests__/utils/mock-repository.ts` | 17-18 | Suppressed generic `vi.fn<any, any>` |
| `packages/functions/src/services/calendar.service.test.ts` | 162-166 | Repeated `as unknown as` mock coercion |
| `packages/functions/src/services/workout.service.test.ts` | 123-127, 309 | Repo mock + matcher double-casts |
| `packages/functions/src/repositories/guided-meditation.repository.test.ts` | 103-104 | Repeated `expect.any` double-cast pattern |
| `packages/functions/src/__tests__/utils/mock-express.ts` | 39 | Mock Request cast via `unknown` |
| `packages/functions/src/test-utils/firestore-mock.ts` | 68 | Firestore update fn cast via `unknown` |
| `scripts/codemod-print-to-logger.ts` | 145, 150 | Non-linted script using explicit `any` |
| `scripts/ralph/index.test.ts` | 259 | Representative `as any` in ignored script tests |

# Architecture Insights

Type-safety pressure is intentionally strongest on backend package code under `packages/functions/src`, while script tooling code is selectively exempted for iteration speed. Most unsafe casts are in test setup and matcher ergonomics, indicating opportunity for reusable typed test factories/matchers rather than production API refactors.

# Historical Context

The repo already codifies strict TypeScript policy (`noImplicitAny`, strict legacy lint presets), but practical test ergonomics have introduced carve-outs through inline suppressions and `unknown` double-casts.

# Open Questions

- Should script/tooling tests (especially `scripts/ralph/*.test.ts`) be brought under the lint gate, or intentionally remain relaxed?
- For Oxlint rollout, should first pass target only `packages/functions/src` to avoid large noise from currently ignored script tests?
- Should repeated test patterns (`expect.any(String) as unknown as string`) be replaced with typed helpers to reduce cast churn?
