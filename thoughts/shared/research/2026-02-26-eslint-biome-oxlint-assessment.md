---
date: 2026-02-26
researcher: codex
git_commit: 01f73ac
branch: main
topic: legacy lint-to-Biome migration fit and faster lint alternatives
tags: [lint, legacy-lint, biome, oxlint, typescript]
status: complete
---

# Research Question

Given the current legacy lint usage in this repository, is migration to Biome straightforward and low risk? If not, what faster alternative provides the best speed/perf upside with minimal rule-quality regression?

# Summary

The current setup is operationally simple (single root `.legacy-lint.cjs`, one plugin family, no custom in-house legacy lint rules), but **semantically strict** because it depends on multiple legacy-lint` type-aware rules and strict presets. This makes a full drop-in migration to Biome non-trivial.

Biome can migrate config (`biome migrate legacy-lint`) and offers equivalents for several current rules. However, key parity caveats remain: some relevant rules are only available in Biome's `nursery`/`types` domains, and at least one current rule (legacy-lint-rule/strict-boolean-expressions`) has no direct equivalent listed in Biome's legacy lint mapping docs. For this repo's “golden principles,” that is a meaningful policy gap.

Fast alternatives exist. **Oxlint** currently appears to be the fastest mainstream legacy lint-compatible linter path and supports incremental migration, including hybrid runs with legacy lint. It also has type-aware mode, but docs currently label that mode as alpha. Given current repo constraints, the safest near-term optimization is likely a staged/hybrid strategy rather than immediate full replacement.

# Detailed Findings

## Current legacy lint Footprint (Repo)

The lint topology is centralized and easy to locate:

- Root lint command: `legacy-lint . --ext .ts --cache --cache-strategy content` in [`package.json`](../../../package.json) lines 14-15.
- Validation path hardcodes legacy lint similarly in [`scripts/validate.sh`](../../../scripts/validate.sh) line 32.
- Pre-commit gate runs `npm run validate` in [`hooks/pre-commit`](../../../hooks/pre-commit) line 47.
- CI uses `npm run validate` and archives `.validate/*.log` in [`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml) lines 31-40.

Rule configuration is one root legacy config with legacy-lint` strict + type-aware presets in [`.legacy-lint.cjs`](../../../.legacy-lint.cjs) lines 7-37.

Important: policy docs tie code quality principles directly to these legacy lint behaviors:

- “No any”, explicit return types, strict booleans in [`docs/golden-principles.md`](../../../docs/golden-principles.md) lines 7-13.
- TypeScript convention explicitly says no `any` and explicit returns are legacy lint-enforced in [`docs/conventions/typescript.md`](../../../docs/conventions/typescript.md) lines 6-18.

## Biome Fit for This Setup

Biome strengths relevant here:

- Official legacy lint migration command (`biome migrate legacy-lint`) and suppression migration path.
- Rule-source mapping docs for legacy lint and typescript-legacy-lint compatibility.
- Promise/type rules now grouped under `types` domain and can be enabled.

Parity for current custom rules in `.legacy-lint.cjs`:

- legacy-lint-rule/no-explicit-any` -> Biome `lint/suspicious/noExplicitAny` (documented mapping)
- legacy-lint-rule/explicit-function-return-type` -> Biome `lint/style/useExplicitType` (documented mapping)
- legacy-lint-rule/explicit-module-boundary-types` -> no direct equivalent listed; docs reference partial coverage via `useExplicitType`
- legacy-lint-rule/no-unused-vars` -> Biome `lint/correctness/noUnusedVariables` (documented mapping)
- legacy-lint-rule/prefer-optional-chain` -> Biome `lint/style/useOptionalChain` (documented mapping)
- legacy-lint-rule/no-floating-promises` -> Biome `lint/correctness/noFloatingPromises` (Biome rule page cites TS-legacy lint source)
- legacy-lint-rule/no-misused-promises` -> Biome `lint/correctness/noMisusedPromises` (Biome rule page cites TS-legacy lint source)
- legacy-lint-rule/await-thenable` -> Biome `lint/style/useAwait` (mapped in Biome docs)
- legacy-lint-rule/prefer-nullish-coalescing` -> Biome `lint/style/useNullishCoalescing` (Biome rule page cites TS-legacy lint source)
- legacy-lint-rule/strict-boolean-expressions` -> no direct equivalent found in Biome rule-source mapping
- legacy-lint-rule/no-unnecessary-type-assertion` -> no direct equivalent found in Biome rule-source mapping

Operational deltas to plan for:

- Existing inline suppressions are legacy lint-formatted comments and must be translated to Biome suppressions (`// biome-ignore ...`).
- Validate/pre-commit/CI plumbing must keep same exit-code semantics and `.validate/*.log` artifacts.

## Faster Alternatives (Beyond Biome)

### Oxlint

From official Oxc docs/blog:

- Positioned for incremental legacy lint migration (`@oxlint/migrate`, hybrid use with legacy lint).
- High rule count and plugin coverage claims.
- Benchmark claims around 50-100x faster than legacy lint in published examples.
- Type-aware mode exists but is explicitly documented as alpha and requires `oxlint-tsgolint` + `--type-aware`.

Implication for this repo: Oxlint is likely the strongest speed-first option, but if you require stable, strict type-aware parity today, you would still keep some legacy lint checks in place (hybrid mode).

### legacy lint-only tuning (no tool switch)

Given current scripts already use `--cache --cache-strategy content`, major additional speed gains from legacy lint alone are likely limited versus Rust-based alternatives.

# Code References

| File | Lines | Description |
|------|-------|-------------|
| `.legacy-lint.cjs` | 7-37 | legacy lint extends chain, TS parser/project, strict custom rules |
| `.legacy-lint.cjs` | 38-48 | Ignore patterns (includes scripts exception) |
| `package.json` | 14-15 | Root lint and lint:fix commands |
| `package.json` | 36-37 | `validate` and `validate:quick` entrypoints |
| `package.json` | 66-70 | legacy lint + TS-legacy lint dependencies |
| `scripts/validate.sh` | 22-35 | Parallel check list and lint command wiring |
| `hooks/pre-commit` | 41-52 | Pre-commit enforcement via `npm run validate` |
| `.github/workflows/ci.yml` | 31-40 | CI validation and `.validate` artifact upload |
| `docs/golden-principles.md` | 7-13 | Lint-enforced TS quality principles |
| `docs/conventions/typescript.md` | 6-18 | Convention claims tied to legacy lint behavior |

# Architecture Insights

Lint is treated as a first-class quality gate, not a local convenience tool. It is integrated into:

1. Local developer loop (`npm run lint`, `npm run validate`)
2. Commit-time gate (`hooks/pre-commit`)
3. CI pass/fail + log artifact workflow (`.github/workflows/ci.yml` + `.validate/*.log`)
4. Cultural documentation (`docs/golden-principles.md`, `docs/conventions/typescript.md`)

This means migration risk is less about command replacement and more about preserving behavioral guarantees and policy intent.

# Historical Context

Current stack still uses legacy lint v8 legacy config (`.legacy-lint.cjs`) with TS-legacy lint v7. The setup indicates gradual hardening around strict TS policy and architecture linting over time. There is no evidence of custom legacy lint plugin authoring in-repo, which lowers technical migration burden, but documentation and quality gates have evolved around current rule semantics.

# Open Questions

- Does the team require strict parity for `strict-boolean-expressions` and `no-unnecessary-type-assertion`, or is near-equivalent acceptable?
- Would you accept a hybrid model (fast linter first, legacy lint for remaining strict type-aware checks) as an interim state?
- Should formatter migration (Prettier -> Biome formatter) be in scope, or linter-only changes?

# External Sources

- Biome home: https://biomejs.dev/
- Biome migration guide: https://biomejs.dev/guides/migrate-legacy-lint-prettier/
- Biome rule source mapping: https://biomejs.dev/linter/rules-sources/
- Biome rule: `noFloatingPromises`: https://biomejs.dev/linter/rules/no-floating-promises/
- Biome rule: `noMisusedPromises`: https://biomejs.dev/linter/rules/no-misused-promises/
- Biome rule: `useExplicitType`: https://biomejs.dev/linter/rules/use-explicit-type/
- Biome rule: `useNullishCoalescing`: https://biomejs.dev/linter/rules/use-nullish-coalescing/
- Biome suppression syntax (v1 doc): https://v1.biomejs.dev/uk/linter/
- Oxc/Oxlint migration: https://oxc.rs/docs/guide/usage/linter/migrate-from-legacy-lint.html
- Oxc/Oxlint overview: https://oxc.rs/docs/guide/usage/linter.html
- Oxc/Oxlint type-aware linting: https://oxc.rs/docs/guide/usage/linter/type-aware.html
- Oxlint v1.0 benchmarks: https://oxc.rs/blog/2025-06-10-oxlint-stable
