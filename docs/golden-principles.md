# Golden Principles

Invariants for the Brad OS codebase. Every line is verifiable by a linter or code review.

## Enforced (linter/hook exists)

### TypeScript [eslint]
- No `any` types — use or create a proper type
- Explicit return types on all functions
- No floating or misused promises
- Use `??` over `||`, use `?.` over manual checks
- Strict boolean expressions — no implicit truthiness

### Architecture [lint-architecture]
- Layer imports flow one direction: types -> schemas -> repos -> services -> handlers
- POST/PUT/PATCH handlers must have Zod validation (schema-at-boundary)
- No duplicate type/interface definitions across files — consolidate in `types/`
- `firebase.json` rewrite paths must match `stripPathPrefix()` arguments
- iOS Views must not reference Service types — go through ViewModels
- iOS Components must not reference ViewModel types — receive data via parameters
- Firebase logger only (`info`/`warn`/`error` from `firebase-functions/logger`), never `console.log` in Cloud Functions
- All iOS HTTP goes through shared APIClient with App Check — no one-off `URLSession` calls
- Domain types live in `packages/functions/src/types/`, not in services/handlers/repositories
- Zod schemas live in `packages/functions/src/schemas/`, not in services/handlers/repositories
- No skipped tests (`it.skip`, `describe.skip`, `xit`, `xdescribe`) — fix or remove the test
- High-risk files (AI integrations, coach logic) must have corresponding test files
- Prefer shared test factories from `__tests__/utils/` over inline `createMock*`/`createTest*` definitions
- No inline `ApiResponse` interface in test files — import from `__tests__/utils/api-types.ts`
- No focused tests (`.only`, `test.only`, `fit`, `fdescribe`) — these silently skip the rest of the suite
- No empty or assertion-free tests — every test file must have `expect()` calls; test bodies must not be empty

### Swift [swiftlint via xcodebuild]
- No force unwrapping (`!`) — use `guard let` or `?? default`
- No optional booleans (`Bool?`) — use `decodeIfPresent ?? false` for Codable
- Max 600 lines/file, 500 lines/type, 60 lines/function
- No inline `swiftlint:disable` — fix the code or change the rule globally

### Git [pre-commit hook]
- No direct commits to main — use worktree workflow
- No secrets in staged changes — gitleaks scans on every commit

## Enforced (by convention, not yet linted)

- TDD: write tests before implementation (can't enforce statically)
- API inputs validated with Zod at the handler boundary, not in services (partially covered by schema-at-boundary check)
- RESTful routes for CRUD, verb-suffix routes (`/start`, `/complete`) for actions (too nuanced for static analysis)


## Principle-to-Linter Pipeline

When a convention-only principle is violated twice, it graduates to a linter rule:
1. File an issue describing the repeat violation
2. Add a check function to `scripts/lint-architecture.ts`
3. Move the principle from "by convention" to "enforced" in this document
