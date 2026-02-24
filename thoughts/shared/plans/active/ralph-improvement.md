# Architecture Linter Self-Tests: Test the Guards, Add .only Detection

## Why

The architecture linter (`scripts/lint-architecture.ts`) is the **backbone of quality enforcement** in this codebase. It is 1,466 lines of TypeScript implementing 16 checks that enforce every architectural invariant — layer dependencies, schema-at-boundary, type deduplication, iOS architecture layers, document staleness, test quality, and more. It runs in `npm run validate` and is the last gate before code merges.

**It has zero tests.**

This is the highest-leverage harness improvement because:

1. **Every harness improvement modifies the linter.** Improvements #1 and #2 both added/modified checks. Future improvements will continue to do so. Without tests, each change risks silently breaking an existing check.

2. **A broken check is invisible.** If `checkNoConsoleLog` silently starts returning `passed: true` for all files, nothing catches it. The linter output says "clean" and nobody knows the check stopped working. The codebase gradually degrades.

3. **The check numbering has already drifted.** The inline comment at line 1050 says "Check 11" but so does line 987 — the comments are out of sync with the header. This is a canary: the linter is already accumulating drift that tests would catch.

4. **`process.cwd()` vs `ROOT_DIR` inconsistency.** Some checks use `process.cwd()` for violation paths, others use `ROOT_DIR`. This makes violation messages unpredictable and untestable.

5. **Scripts are excluded from ESLint.** Line 47 of `.eslintrc.cjs` ignores `scripts/`. The linter — the most critical infrastructure code — has no lint enforcement of its own. `any` types, missing return types, or floating promises would not be caught.

6. **Missing `.only` detection is a critical gap.** The linter checks for `.skip`/`xit`/`xdescribe` (check 13) but NOT for `.only`/`test.only`/`fit`/`fdescribe`. If an agent commits `it.only(...)`, vitest runs only that one test — silently skipping hundreds of others. The build "passes" but coverage drops to near zero. This is a catastrophic silent failure mode.

After this improvement:
- All 17 check functions have positive and negative test cases
- Any change to a check is verified against known fixtures
- The `.only` gap is closed (check 17)
- Violation message paths are consistent and predictable
- The linter code itself is ESLint-enforced
- Future harness improvements can modify checks with confidence

## What

### Phase 1: Extract Check Functions into Testable Module

The current `scripts/lint-architecture.ts` is a monolithic file where:
- Module-level constants (`ROOT_DIR`, `FUNCTIONS_SRC`) are hardcoded
- All 16 check functions reference these constants directly
- `main()` calls `process.exit()`, making the module unsafe to import in tests

**Refactoring approach**: Split into two files:
- `scripts/lint-checks.ts` — Exports all check functions, each accepting a `LinterConfig` parameter
- `scripts/lint-architecture.ts` — Thin CLI runner that creates a config and calls checks

#### 1a. Create `scripts/lint-checks.ts`

This file exports:

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface LinterConfig {
  rootDir: string;
  functionsSrc: string;
}

export interface CheckResult {
  name: string;
  passed: boolean;
  violations: string[];
}

export function createDefaultConfig(): LinterConfig {
  const rootDir = path.resolve(import.meta.dirname ?? __dirname, '..');
  return {
    rootDir,
    functionsSrc: path.join(rootDir, 'packages/functions/src'),
  };
}

// All 16 existing check functions, refactored to accept config:
export function checkLayerDeps(config: LinterConfig): CheckResult { ... }
export function checkSchemaBoundary(config: LinterConfig): CheckResult { ... }
export function checkTypeDedup(config: LinterConfig): CheckResult { ... }
export function checkFirebaseRoutes(config: LinterConfig): CheckResult { ... }
export function checkIosLayers(config: LinterConfig): CheckResult { ... }
export function checkArchMapRefs(config: LinterConfig): CheckResult { ... }
export function checkClaudeMdRefs(config: LinterConfig): CheckResult { ... }
export function checkOrphanFeatures(config: LinterConfig): CheckResult { ... }
export function checkPlanLifecycle(config: LinterConfig): CheckResult { ... }
export function checkNoConsoleLog(config: LinterConfig): CheckResult { ... }
export function checkNoRawUrlSession(config: LinterConfig): CheckResult { ... }
export function checkTypesInTypesDir(config: LinterConfig): CheckResult { ... }
export function checkSchemasInSchemasDir(config: LinterConfig): CheckResult { ... }
export function checkNoSkippedTests(config: LinterConfig): CheckResult { ... }
export function checkUntestedHighRisk(config: LinterConfig): CheckResult { ... }
export function checkTestFactoryUsage(config: LinterConfig): CheckResult { ... }
export function checkNoInlineApiResponse(config: LinterConfig): CheckResult { ... }

// NEW check 17:
export function checkNoFocusedTests(config: LinterConfig): CheckResult { ... }

// Warning (non-blocking):
export function checkQualityGradesFreshness(config: LinterConfig): { stale: boolean; message: string } { ... }
```

**Mechanical refactoring for each check function:**

Every reference to the module-level `ROOT_DIR` becomes `config.rootDir`.
Every reference to `FUNCTIONS_SRC` becomes `config.functionsSrc`.
Every `path.relative(process.cwd(), ...)` becomes `path.relative(config.rootDir, ...)` for consistent violation paths.

Example — `checkNoConsoleLog` before:
```typescript
function checkNoConsoleLog(): CheckResult {
  const SRC_DIR = FUNCTIONS_SRC;
  // ...
  const relPath = path.relative(process.cwd(), file);
```

After:
```typescript
export function checkNoConsoleLog(config: LinterConfig): CheckResult {
  const SRC_DIR = config.functionsSrc;
  // ...
  const relPath = path.relative(config.rootDir, file);
```

Apply this same transformation to all 16 functions. The logic inside each function stays identical — only the path sources change.

**Also fix the check numbering comments.** Update inline comments to match the header:
- Line ~987: `// Check 10: No raw URLSession in iOS` (currently says "Check 11" — wrong)
- Line ~1050: `// Check 11: Domain types only in types/` (currently duplicates "Check 11" — fix to 11)
- Line ~1100: `// Check 12: Zod schemas only in schemas/`
- Line ~1168: `// Check 13: No skipped tests`
- Line ~1224: `// Check 14: Untested high-risk files`
- Line ~1279: `// Check 15: Shared test factory usage`
- Line ~1327: `// Check 16: No inline ApiResponse in tests`
- NEW: `// Check 17: No focused tests (.only)`

#### 1b. Rewrite `scripts/lint-architecture.ts` as Thin Runner

Replace the entire file with a thin runner that imports from `lint-checks.ts`:

```typescript
#!/usr/bin/env tsx
/**
 * Architecture Enforcement Linter — CLI Runner
 *
 * Imports check functions from lint-checks.ts and runs them in sequence.
 * See lint-checks.ts for the actual check implementations.
 */

import {
  type LinterConfig,
  type CheckResult,
  createDefaultConfig,
  checkLayerDeps,
  checkSchemaBoundary,
  checkTypeDedup,
  checkFirebaseRoutes,
  checkIosLayers,
  checkArchMapRefs,
  checkClaudeMdRefs,
  checkOrphanFeatures,
  checkPlanLifecycle,
  checkNoConsoleLog,
  checkNoRawUrlSession,
  checkTypesInTypesDir,
  checkSchemasInSchemasDir,
  checkNoSkippedTests,
  checkUntestedHighRisk,
  checkTestFactoryUsage,
  checkNoInlineApiResponse,
  checkNoFocusedTests,
  checkQualityGradesFreshness,
} from './lint-checks.js';

// Color helpers
const green = (s: string): string => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string): string => `\x1b[33m${s}\x1b[0m`;
const red = (s: string): string => `\x1b[31m${s}\x1b[0m`;
const bold = (s: string): string => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string): string => `\x1b[2m${s}\x1b[0m`;

function main(): void {
  const config = createDefaultConfig();

  console.log(bold('\n=== Architecture Enforcement ===\n'));

  const checks: Array<() => CheckResult> = [
    () => checkLayerDeps(config),
    () => checkSchemaBoundary(config),
    () => checkTypeDedup(config),
    () => checkFirebaseRoutes(config),
    () => checkIosLayers(config),
    () => checkArchMapRefs(config),
    () => checkClaudeMdRefs(config),
    () => checkOrphanFeatures(config),
    () => checkPlanLifecycle(config),
    () => checkNoConsoleLog(config),
    () => checkNoRawUrlSession(config),
    () => checkTypesInTypesDir(config),
    () => checkSchemasInSchemasDir(config),
    () => checkNoSkippedTests(config),
    () => checkUntestedHighRisk(config),
    () => checkTestFactoryUsage(config),
    () => checkNoInlineApiResponse(config),
    () => checkNoFocusedTests(config),
  ];

  // ... rest of runner logic (results, summary, exit codes) stays the same ...

  const freshness = checkQualityGradesFreshness(config);
  // ... warning display logic stays the same ...
}

main();
```

The runner keeps the color helpers, result display, summary, and `process.exit()` calls. Only the check functions are imported from the other module.

### Phase 2: Add Check 17 — No Focused Tests (.only)

Add to `scripts/lint-checks.ts`:

```typescript
// ─────────────────────────────────────────────────────────────────────────────
// Check 17: No focused tests (.only)
//
// Tests must never be focused with .only — this silently skips all other tests.
// If vitest runs with .only, only that single test executes and the rest are
// skipped without any failure signal. This is worse than .skip because it's
// completely invisible in CI output.
// ─────────────────────────────────────────────────────────────────────────────

export function checkNoFocusedTests(config: LinterConfig): CheckResult {
  const name = 'No focused tests (.only)';

  function collectTestFiles(dir: string): string[] {
    const results: string[] = [];
    if (!fs.existsSync(dir)) return results;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') continue;
        results.push(...collectTestFiles(fullPath));
      } else if (
        entry.isFile() &&
        (entry.name.endsWith('.test.ts') || entry.name.endsWith('.spec.ts'))
      ) {
        results.push(fullPath);
      }
    }
    return results;
  }

  const files = collectTestFiles(config.rootDir);
  const violations: string[] = [];
  const onlyPattern = /\b(it\.only|describe\.only|test\.only|fit|fdescribe)\s*\(/;

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (/^\s*\/\//.test(line)) continue;

      const match = onlyPattern.exec(line);
      if (match) {
        const relPath = path.relative(config.rootDir, file);
        violations.push(
          `${relPath}:${i + 1} has a focused test (${match[1]}).\n` +
          `    Rule: Never commit focused tests — .only silently skips all other tests in the suite.\n` +
          `    Fix: Remove the .only modifier. If debugging, use vitest's --grep flag instead:\n` +
          `         npx vitest run --grep "test name pattern"\n` +
          `    See: docs/conventions/testing.md`
        );
      }
    }
  }

  return { name, passed: violations.length === 0, violations };
}
```

This mirrors `checkNoSkippedTests` exactly in structure but catches the complementary problem: `.only` instead of `.skip`.

### Phase 3: Write Self-Tests

Create `scripts/lint-architecture.test.ts`. Each check gets at least two test cases: one that passes (clean fixture) and one that fails (violation fixture). Tests use `fs.mkdtempSync()` to create isolated fixture directories.

#### Test Harness Helpers

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  type LinterConfig,
  checkLayerDeps,
  checkSchemaBoundary,
  checkTypeDedup,
  checkFirebaseRoutes,
  checkIosLayers,
  checkArchMapRefs,
  checkClaudeMdRefs,
  checkOrphanFeatures,
  checkPlanLifecycle,
  checkNoConsoleLog,
  checkNoRawUrlSession,
  checkTypesInTypesDir,
  checkSchemasInSchemasDir,
  checkNoSkippedTests,
  checkUntestedHighRisk,
  checkTestFactoryUsage,
  checkNoInlineApiResponse,
  checkNoFocusedTests,
  checkQualityGradesFreshness,
} from './lint-checks.js';

// Helper: create temp root with packages/functions/src structure
function createFixture(): { config: LinterConfig; rootDir: string } {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-test-'));
  const functionsSrc = path.join(rootDir, 'packages/functions/src');
  fs.mkdirSync(functionsSrc, { recursive: true });
  return {
    config: { rootDir, functionsSrc },
    rootDir,
  };
}

// Helper: write a file, creating parent dirs
function writeFixture(rootDir: string, relPath: string, content: string): void {
  const fullPath = path.join(rootDir, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

// Helper: clean up temp dir
function cleanup(rootDir: string): void {
  fs.rmSync(rootDir, { recursive: true, force: true });
}
```

#### Test Cases for Each Check

Below are the concrete test cases. Each test is self-contained: it creates the minimal fixture, runs the check, and asserts on the result. The implementing agent should follow this pattern for ALL checks.

**Check 1 — Layer Dependencies:**

```typescript
describe('checkLayerDeps', () => {
  let rootDir: string;
  let config: LinterConfig;

  beforeEach(() => {
    ({ rootDir, config } = createFixture());
  });
  afterEach(() => cleanup(rootDir));

  it('passes when handlers import from services and types', () => {
    writeFixture(rootDir, 'packages/functions/src/types/exercise.ts',
      'export interface Exercise { id: string; }');
    writeFixture(rootDir, 'packages/functions/src/services/workout.service.ts',
      "import { Exercise } from '../types/exercise.js';\nexport function getExercise(): Exercise { return { id: '1' }; }");
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.ts',
      "import { getExercise } from '../services/workout.service.js';");

    const result = checkLayerDeps(config);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('fails when a service imports from handlers', () => {
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.ts',
      "export const app = {};");
    writeFixture(rootDir, 'packages/functions/src/services/workout.service.ts',
      "import { app } from '../handlers/exercises.js';");

    const result = checkLayerDeps(config);
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toContain('services');
    expect(result.violations[0]).toContain('handlers');
  });

  it('ignores test files', () => {
    writeFixture(rootDir, 'packages/functions/src/services/workout.service.test.ts',
      "import { app } from '../handlers/exercises.js';");

    const result = checkLayerDeps(config);
    expect(result.passed).toBe(true);
  });
});
```

**Check 2 — Schema-at-Boundary:**

```typescript
describe('checkSchemaBoundary', () => {
  let rootDir: string;
  let config: LinterConfig;

  beforeEach(() => {
    ({ rootDir, config } = createFixture());
  });
  afterEach(() => cleanup(rootDir));

  it('passes when POST routes have Zod validation', () => {
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.ts',
      "app.post('/exercises', validate(createExerciseSchema), asyncHandler(async (req, res) => {}));");

    const result = checkSchemaBoundary(config);
    expect(result.passed).toBe(true);
  });

  it('fails when POST route lacks Zod validation', () => {
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.ts',
      "app.post('/exercises', asyncHandler(async (req, res) => {}));");

    const result = checkSchemaBoundary(config);
    expect(result.passed).toBe(false);
    expect(result.violations[0]).toContain('without Zod validation');
  });

  it('allows action routes without validation', () => {
    writeFixture(rootDir, 'packages/functions/src/handlers/workouts.ts',
      "app.post('/workouts/:id/complete', asyncHandler(async (req, res) => {}));");

    const result = checkSchemaBoundary(config);
    expect(result.passed).toBe(true);
  });
});
```

**Check 3 — Type Deduplication:**

```typescript
describe('checkTypeDedup', () => {
  // passes: Exercise defined only in types/
  // fails: Exercise defined in both types/ and services/
  // passes: re-export from shared.ts does not count as duplicate
});
```

**Check 4 — Firebase Route Consistency:**

```typescript
describe('checkFirebaseRoutes', () => {
  // passes: firebase.json source matches handler's stripPathPrefix
  // fails: firebase.json source doesn't match handler's stripPathPrefix
  // Fixtures: firebase.json + packages/functions/src/index.ts + handler file
});
```

**Check 5 — iOS Architecture Layers:**

```typescript
describe('checkIosLayers', () => {
  // passes: View references ViewModel, not Service
  // fails: View directly references a Service class
  // fails: Component references a ViewModel class
  // passes: references in #Preview section are ignored
  // Fixtures: ios/BradOS/BradOS/{Services,ViewModels,Views,Components}/*.swift
});
```

**Check 6 — Architecture Map File References:**

```typescript
describe('checkArchMapRefs', () => {
  // passes: all backtick-quoted paths in docs/architecture/*.md exist
  // fails: a path references a file that doesn't exist
});
```

**Check 7 — CLAUDE.md File Path References:**

```typescript
describe('checkClaudeMdRefs', () => {
  // passes: all backtick-quoted paths in CLAUDE.md exist
  // fails: a path references a missing file
  // passes: paths inside code fences are ignored
  // passes: template variables like <feature> are ignored
});
```

**Check 8 — Orphan Features:**

```typescript
describe('checkOrphanFeatures', () => {
  // passes: handler with routes has a matching architecture doc
  // fails: handler with routes but no doc and not in feature map
  // fails: handler maps to feature but doc doesn't exist
});
```

**Check 9 — Plan Lifecycle:**

```typescript
describe('checkPlanLifecycle', () => {
  // passes: plans in active/ and completed/ subdirs, index.md at root
  // fails: plan .md file directly in thoughts/shared/plans/ root
});
```

**Check 10 — No console.log:**

```typescript
describe('checkNoConsoleLog', () => {
  let rootDir: string;
  let config: LinterConfig;

  beforeEach(() => {
    ({ rootDir, config } = createFixture());
  });
  afterEach(() => cleanup(rootDir));

  it('passes when using firebase logger', () => {
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.ts',
      "import { logger } from 'firebase-functions/logger';\nlogger.info('hello');");

    const result = checkNoConsoleLog(config);
    expect(result.passed).toBe(true);
  });

  it('fails when using console.log', () => {
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.ts',
      "console.log('debug');");

    const result = checkNoConsoleLog(config);
    expect(result.passed).toBe(false);
    expect(result.violations[0]).toContain('console');
  });

  it('ignores comments containing console.log', () => {
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.ts',
      "// console.log('commented out');");

    const result = checkNoConsoleLog(config);
    expect(result.passed).toBe(true);
  });

  it('ignores test files', () => {
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.test.ts',
      "console.log('test debugging');");

    const result = checkNoConsoleLog(config);
    expect(result.passed).toBe(true);
  });
});
```

**Check 11 — No raw URLSession:**

```typescript
describe('checkNoRawUrlSession', () => {
  // passes: no URLSession usage in Swift files
  // fails: URLSession used in a View file
  // passes: URLSession in APIClient.swift (allowlisted)
  // passes: URLSession in StravaAuthManager.swift (allowlisted)
  // Fixtures: ios/BradOS/BradOS/{Views,Services}/*.swift
});
```

**Check 12 — Types in types/ directory:**

```typescript
describe('checkTypesInTypesDir', () => {
  // passes: exported interface in types/ directory
  // fails: exported interface in handlers/ directory
  // passes: re-export from handlers does not trigger
});
```

**Check 13 — Schemas in schemas/ directory:**

```typescript
describe('checkSchemasInSchemasDir', () => {
  // passes: z.object() in schemas/ directory
  // fails: z.object() in handlers/ directory
});
```

**Check 14 — No skipped tests:**

```typescript
describe('checkNoSkippedTests', () => {
  let rootDir: string;
  let config: LinterConfig;

  beforeEach(() => {
    ({ rootDir, config } = createFixture());
  });
  afterEach(() => cleanup(rootDir));

  it('passes for tests without skip', () => {
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.test.ts',
      "import { it, describe } from 'vitest';\ndescribe('test', () => { it('works', () => {}); });");

    const result = checkNoSkippedTests(config);
    expect(result.passed).toBe(true);
  });

  it('fails when it.skip is found', () => {
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.test.ts',
      "import { it, describe } from 'vitest';\ndescribe('test', () => { it.skip('broken', () => {}); });");

    const result = checkNoSkippedTests(config);
    expect(result.passed).toBe(false);
    expect(result.violations[0]).toContain('it.skip');
  });

  it('detects xit and xdescribe', () => {
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.test.ts',
      "xit('broken', () => {});\nxdescribe('broken suite', () => {});");

    const result = checkNoSkippedTests(config);
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(2);
  });
});
```

**Check 15 — Untested high-risk files:**

```typescript
describe('checkUntestedHighRisk', () => {
  // passes: today-coach.ts handler has today-coach.test.ts
  // fails: today-coach.ts handler has no test file
  // passes: exercises.ts (not high-risk) has no test file — not flagged
});
```

**Check 16 — Shared test factory usage:**

```typescript
describe('checkTestFactoryUsage', () => {
  // passes: test imports from __tests__/utils/
  // fails: test defines inline createMock* without importing shared utils
  // passes: test defines inline factory AND imports from shared utils
});
```

**Check 17 — No inline ApiResponse:**

```typescript
describe('checkNoInlineApiResponse', () => {
  // passes: test imports ApiResponse from __tests__/utils/
  // fails: test defines `interface ApiResponse` inline
});
```

**Check 18 (NEW) — No focused tests:**

```typescript
describe('checkNoFocusedTests', () => {
  let rootDir: string;
  let config: LinterConfig;

  beforeEach(() => {
    ({ rootDir, config } = createFixture());
  });
  afterEach(() => cleanup(rootDir));

  it('passes for tests without .only', () => {
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.test.ts',
      "import { it, describe } from 'vitest';\ndescribe('test', () => { it('works', () => {}); });");

    const result = checkNoFocusedTests(config);
    expect(result.passed).toBe(true);
  });

  it('fails when it.only is found', () => {
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.test.ts',
      "import { it, describe } from 'vitest';\ndescribe('test', () => { it.only('focused', () => {}); });");

    const result = checkNoFocusedTests(config);
    expect(result.passed).toBe(false);
    expect(result.violations[0]).toContain('it.only');
  });

  it('detects describe.only and test.only', () => {
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.test.ts',
      "describe.only('focused suite', () => {});\ntest.only('focused test', () => {});");

    const result = checkNoFocusedTests(config);
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(2);
  });

  it('detects fit and fdescribe (Jest aliases)', () => {
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.test.ts',
      "fit('focused', () => {});\nfdescribe('focused suite', () => {});");

    const result = checkNoFocusedTests(config);
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(2);
  });

  it('ignores .only in comments', () => {
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.test.ts',
      "// it.only('commented out');");

    const result = checkNoFocusedTests(config);
    expect(result.passed).toBe(true);
  });
});
```

**Quality Grades Freshness (warning check):**

```typescript
describe('checkQualityGradesFreshness', () => {
  // stale: false when updated today
  // stale: true when updated 10 days ago
  // stale: true when file doesn't exist
});
```

### Phase 4: Add Scripts Tests to Vitest Workspace

Modify `vitest.workspace.ts` to add a second workspace entry for scripts:

```typescript
import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    test: {
      name: 'functions',
      root: './packages/functions',
      environment: 'node',
      include: ['src/**/*.test.ts'],
      exclude: ['src/__tests__/integration/**'],
      setupFiles: ['./src/__tests__/vitest.setup.ts'],
      globals: true,
    },
  },
  {
    test: {
      name: 'scripts',
      root: '.',
      environment: 'node',
      include: ['scripts/**/*.test.ts'],
      globals: true,
    },
  },
]);
```

This means `npx vitest run` will now also run scripts tests. The `scripts` workspace is lightweight — no special setup files needed.

### Phase 5: Remove scripts/ from ESLint ignorePatterns

Modify `.eslintrc.cjs` to stop ignoring scripts:

```javascript
ignorePatterns: [
  'dist/',
  'lib/',
  'node_modules/',
  '*.config.js',
  '*.config.ts',
  '.eslintrc.cjs',
  'vitest.workspace.ts',
  // 'scripts/' — REMOVED: scripts are now linted
],
```

Create `scripts/tsconfig.eslint.json` so ESLint can type-check scripts:

```json
{
  "extends": "../packages/functions/tsconfig.json",
  "compilerOptions": {
    "composite": false,
    "rootDir": ".",
    "outDir": "../dist/scripts",
    "noUnusedLocals": false,
    "noUnusedParameters": false
  },
  "include": ["./**/*.ts"],
  "exclude": ["**/*.test.ts"]
}
```

Update `.eslintrc.cjs` to include this tsconfig in `parserOptions.project`:

```javascript
parserOptions: {
  project: [
    './tsconfig.json',
    './packages/*/tsconfig.json',
    './packages/*/tsconfig.eslint.json',
    './scripts/tsconfig.eslint.json',  // NEW
  ],
},
```

**Note**: The linter code may have ESLint violations that were hidden by the ignore. The implementing agent should:
1. Run `npx eslint scripts/ --ext .ts` after un-ignoring
2. Fix any violations (likely: missing explicit return types on inner functions, `!` non-null assertions that need `?? fallback`)
3. The `@typescript-eslint/no-non-null-assertion` rule is NOT in the eslint config (only `@typescript-eslint/strict` extends), so `!` assertions may be fine — check what `strict` includes
4. If the `explicit-function-return-type` rule fires on inner helper functions (like the nested `collectFiles`), add return types to them

### Phase 6: Update Validate Pipeline

Modify `scripts/validate.sh` to ensure scripts tests are included.

Since `npx vitest run` now picks up both workspaces (functions + scripts), no change is needed to the validate script itself — the existing `run_check "Unit tests" npx vitest run` will automatically run scripts tests too.

Verify this by checking that the vitest output after the workspace change shows two workspaces:
```
 DEV  v1.x.x

 ✓ functions > ... (X tests)
 ✓ scripts > ... (Y tests)
```

### Phase 7: Update Documentation

#### 7a. Update `docs/golden-principles.md`

Add under `### Architecture [lint-architecture]`:
```
- No focused tests (`.only`, `test.only`, `fit`, `fdescribe`) — these silently skip the rest of the suite
```

#### 7b. Update header comment in `scripts/lint-checks.ts`

The check list comment at the top of the module should list all 17 checks:

```typescript
/**
 * Architecture Enforcement Check Functions
 *
 * Each function accepts a LinterConfig and returns a CheckResult.
 * The CLI runner (lint-architecture.ts) calls these in sequence.
 *
 * Checks:
 *   1. Layer dependency direction (types -> schemas -> repos -> services -> handlers)
 *   2. Schema-at-boundary (write routes must have Zod validation)
 *   3. Type deduplication (no duplicate type/interface definitions)
 *   4. Firebase route consistency (rewrite paths match stripPathPrefix)
 *   5. iOS architecture layers (Views->Services, Components->ViewModels)
 *   6. Architecture map file references (docs/architecture/*.md paths exist)
 *   7. CLAUDE.md file path references (backtick-quoted paths resolve)
 *   8. Orphan features (handlers with routes have architecture docs)
 *   9. Plan lifecycle (plans in active/ or completed/, not root)
 *  10. No console.log in Cloud Functions
 *  11. No raw URLSession in iOS (use shared APIClient)
 *  12. Domain types only in types/ directory
 *  13. Zod schemas only in schemas/ directory
 *  14. No skipped tests
 *  15. High-risk files must have tests
 *  16. Prefer shared test factories over inline definitions
 *  17. No inline ApiResponse in tests
 *  18. No focused tests (.only)
 */
```

Wait — the numbering shift. Adding checkNoFocusedTests makes 18 checks total. But the check numbering in the code should match:
- Checks 1-16: existing checks (with the numbering comment fixes from Phase 1)
- Check 17: `checkNoInlineApiResponse` (existing, renumber from 16 to 17)
- Check 18: `checkNoFocusedTests` (new)

Actually, re-reading the current code: the header already lists 16 checks (1-16), with `checkNoInlineApiResponse` as #16. The new `.only` check becomes #17. Here's the mapping:

| # | Check Function | Status |
|---|---|---|
| 1-9 | checkLayerDeps through checkPlanLifecycle | Unchanged |
| 10 | checkNoConsoleLog | Fix comment (currently misnumbered as "9" in header count) |
| 11 | checkNoRawUrlSession | Fix inline comment (currently says "Check 11", correct) |
| 12 | checkTypesInTypesDir | Fix inline comment (currently duplicates "Check 11") |
| 13 | checkSchemasInSchemasDir | Fix inline comment |
| 14 | checkNoSkippedTests | Currently says "Check 13" in inline comment → fix to 14 |
| 15 | checkUntestedHighRisk | Currently says "Check 14" → fix to 15 |
| 16 | checkTestFactoryUsage | Currently says "Check 15" → fix to 16 |
| 17 | checkNoInlineApiResponse | Currently says "Check 16" → fix to 17 |
| 18 | checkNoFocusedTests | **NEW** |

**Important**: The header comment counts checks starting from 1, and the runner array defines execution order. Renumbering the inline comments to match the actual execution order is the fix. The implementing agent should read the current header comment, count the checks in the runner array, and make all inline comments consistent.

#### 7c. Update `docs/conventions/testing.md`

Add to the testing conventions after the existing "Test Policy (CRITICAL)" section:

```markdown
## Focused Tests (.only) Policy

**NEVER commit focused tests.** Using `it.only`, `describe.only`, `test.only`, `fit`, or `fdescribe` silently skips all other tests in the suite. vitest will report success even though most tests never ran.

For debugging, use vitest's `--grep` flag instead:
```bash
npx vitest run --grep "test name pattern"
```

The architecture linter (check 18) enforces this — focused tests cause a build failure.
```

## Files

| File | Action | Description |
|------|--------|-------------|
| `scripts/lint-checks.ts` | **Create** | Exported check functions + LinterConfig interface + CheckResult interface + createDefaultConfig(). ~1400 lines (essentially the check logic from lint-architecture.ts, refactored to accept config params). |
| `scripts/lint-architecture.ts` | **Rewrite** | Thin CLI runner (~100 lines). Imports all checks from lint-checks.ts, creates default config, runs checks, displays results, exits. |
| `scripts/lint-architecture.test.ts` | **Create** | Vitest test file with ~40-50 test cases covering all 18 checks + quality grades freshness. ~600-800 lines. Uses temp directories as fixtures. |
| `scripts/tsconfig.eslint.json` | **Create** | tsconfig for ESLint to type-check scripts directory (~12 lines). |
| `vitest.workspace.ts` | **Modify** | Add `scripts` workspace entry (include: `scripts/**/*.test.ts`). |
| `.eslintrc.cjs` | **Modify** | Remove `scripts/` from ignorePatterns. Add `scripts/tsconfig.eslint.json` to parserOptions.project. |
| `docs/golden-principles.md` | **Modify** | Add "No focused tests" principle under "Architecture [lint-architecture]" section. |
| `docs/conventions/testing.md` | **Modify** | Add "Focused Tests (.only) Policy" section explaining the rule and the `--grep` alternative. |

**Total: 3 new files, 5 modified files**

## Tests

### The test file IS the primary deliverable

`scripts/lint-architecture.test.ts` should have test cases for every check function. At minimum:

| Check | Test Cases | What They Verify |
|-------|-----------|-----------------|
| checkLayerDeps | 3 | Clean deps pass; service→handler fails; test files ignored |
| checkSchemaBoundary | 3 | POST with validate passes; POST without fails; action routes ignored |
| checkTypeDedup | 3 | Unique types pass; duplicates fail; re-exports not counted |
| checkFirebaseRoutes | 2 | Matching config passes; mismatched stripPathPrefix fails |
| checkIosLayers | 3 | Clean View passes; View→Service fails; #Preview section ignored |
| checkArchMapRefs | 2 | Valid refs pass; broken refs fail |
| checkClaudeMdRefs | 3 | Valid refs pass; broken refs fail; code fences ignored |
| checkOrphanFeatures | 3 | Handler with doc passes; unmapped handler fails; missing doc fails |
| checkPlanLifecycle | 2 | Plans in active/ pass; plan at root fails |
| checkNoConsoleLog | 4 | Logger passes; console.log fails; comments ignored; tests ignored |
| checkNoRawUrlSession | 3 | No URLSession passes; raw URLSession fails; allowlisted files pass |
| checkTypesInTypesDir | 2 | Types in types/ pass; types in handlers/ fail |
| checkSchemasInSchemasDir | 2 | Schemas in schemas/ pass; schemas in handlers/ fail |
| checkNoSkippedTests | 3 | Normal tests pass; it.skip fails; xit/xdescribe detected |
| checkUntestedHighRisk | 3 | High-risk with test passes; high-risk without fails; non-high-risk ignored |
| checkTestFactoryUsage | 2 | Imports from utils pass; inline factories without imports fail |
| checkNoInlineApiResponse | 2 | Import from utils passes; inline interface fails |
| checkNoFocusedTests | 5 | Normal tests pass; it.only fails; describe.only/test.only/fit/fdescribe detected; comments ignored |
| checkQualityGradesFreshness | 3 | Fresh date not stale; old date stale; missing file stale |

**Total: ~48 test cases**

### Existing tests must continue to pass

The refactoring does not change any check logic — only where the code lives and how paths are parameterized. All existing tests in `packages/functions/` must produce identical results.

### Architecture lint must pass against real codebase

After the refactoring, `npm run lint:architecture` must produce the same output as before (all 17 checks pass with 0 violations on the current codebase). The new check 18 (no focused tests) should also pass since no `.only` calls exist in the codebase.

## QA

### Step 1: Verify the refactoring preserves behavior

```bash
# Before: run the old linter, save output
npm run lint:architecture > /tmp/lint-before.txt 2>&1

# After refactoring: run the new linter, save output
npm run lint:architecture > /tmp/lint-after.txt 2>&1

# Compare (should be identical except for the new check 18 line)
diff /tmp/lint-before.txt /tmp/lint-after.txt
```

Expected: The only difference is the addition of check 18 ("No focused tests (.only): clean") in the output.

### Step 2: Run all tests including scripts

```bash
npx vitest run
```

Expected: Two workspace sections appear in output:
- `functions` — all existing tests pass
- `scripts` — all new lint architecture tests pass

### Step 3: Run full validation

```bash
npm run validate
```

Expected: All checks pass (typecheck, lint, tests, architecture). Pay attention to:
- **TypeScript**: `scripts/lint-checks.ts` and `scripts/lint-architecture.ts` compile
- **ESLint**: Scripts directory now linted — no violations
- **Tests**: Both workspaces pass
- **Architecture**: All 18 checks clean

### Step 4: Verify .only detection catches violations

Temporarily add a focused test:
```typescript
// In any test file, e.g., packages/functions/src/handlers/exercises.test.ts:
it.only('focused', () => { expect(true).toBe(true); });
```

Run:
```bash
npm run lint:architecture
```

Expected: Check 18 fails with 1 violation pointing to the file and line number.

### Step 5: Verify .only detection ignores comments

Temporarily add a commented-out .only:
```typescript
// In any test file:
// it.only('commented out');
```

Run:
```bash
npm run lint:architecture
```

Expected: Check 18 passes (comments are ignored).

### Step 6: Revert intentional test modifications

```bash
git checkout -- packages/functions/src/handlers/exercises.test.ts
```

### Step 7: Verify ESLint passes on scripts

```bash
npx eslint scripts/ --ext .ts
```

Expected: 0 errors, 0 warnings. If there are violations from the un-ignoring, they should have been fixed in Phase 5.

### Step 8: Verify test count is unchanged for functions workspace

```bash
npx vitest run --reporter=verbose 2>&1 | grep -c "✓\|✗"
```

Compare with the count before the change. The functions workspace should have the same number of tests. Only the scripts workspace adds new tests.

## Conventions

1. **Git Worktree Workflow** — All changes in a worktree branch, not directly on main.

2. **Subagent Usage** — Run `npm run validate` in subagents to conserve context.

3. **Vitest not Jest** — All tests use vitest. Import `{ describe, it, expect }` explicitly from `'vitest'` (the scripts workspace uses `globals: true`, but explicit imports are preferred per `docs/conventions/testing.md`).

4. **No `any` types** — The refactored check functions and test helpers must not use `any`. Use `unknown` for parsed JSON, assert with type narrowing.

5. **Explicit return types** — All exported functions in `lint-checks.ts` must have explicit return types (`CheckResult`, `{ stale: boolean; message: string }`, etc.).

6. **File naming** — `lint-checks.ts` follows the existing `lint-architecture.ts` kebab-case pattern.

7. **Principle-to-Linter Pipeline** — From `docs/golden-principles.md`: the `.only` detection is a new enforcement rule, added to the "Enforced (linter/hook exists)" section.

8. **No floating promises** — The linter is synchronous (all `fs.readFileSync`), so no async concerns. Tests should also be synchronous.

9. **`os.tmpdir()` for temp files** — Tests must use `os.tmpdir()` (or `$TMPDIR` in bash context) for fixture directories, never hardcoded `/tmp`. Clean up in `afterEach`.

10. **Read before modifying** — The implementing agent must read the current `lint-architecture.ts` in full before refactoring. The plan provides the pattern; the agent must verify against the actual code.
