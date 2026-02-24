**Title**: Lint-architecture rule: require colocated tests for non-abstract repository files

**Why**: All 16 concrete repositories currently have colocated `.test.ts` files, but nothing prevents a new repository from being added without one. A lint check enforces the invariant at CI time, catching gaps before they merge.

**What**

Add Check 20 (`checkRepositoryTestCoverage`) to the architecture linter. It scans `packages/functions/src/repositories/` for `.repository.ts` files, skips files on an explicit allowlist (abstract base classes, type-only files), and fails if any remaining file lacks a colocated `.test.ts`.

### Algorithm

1. Read all files in `config.functionsSrc + '/repositories/'`.
2. Filter to files matching `*.repository.ts` (excludes `.test.ts`, `.spec.ts`).
3. Skip files on the allowlist: `['base.repository.ts']`.
4. For each remaining file, check if a sibling `<name>.test.ts` exists (same directory, same base name with `.test.ts` replacing `.ts`).
5. If missing, emit a violation with the file path and a fix instruction telling the implementer to create the test file.

### Allowlist rationale

- `base.repository.ts` — Abstract class with no standalone behavior to test. Its methods are exercised through concrete subclass tests.
- The allowlist is defined as a `const` array at the top of the check function, making it easy to extend if future abstract/utility repository files are added.

**Files**

### 1. `scripts/lint-checks.ts` (modify)

Append new exported function after `checkTestQuality`:

```typescript
// ─────────────────────────────────────────────────────────────────────────────
// Check 20: Repository test coverage
//
// Every non-abstract repository file must have a colocated .test.ts file.
// Abstract base classes and type-only files are explicitly allowlisted.
// ─────────────────────────────────────────────────────────────────────────────

export function checkRepositoryTestCoverage(config: LinterConfig): CheckResult {
  const name = 'Repository test coverage';

  // Files that are intentionally untested (abstract classes, type-only files)
  const ALLOWLIST: string[] = [
    'base.repository.ts',
  ];

  const repoDir = path.join(config.functionsSrc, 'repositories');

  if (!fs.existsSync(repoDir)) {
    return { name, passed: true, violations: [] };
  }

  const violations: string[] = [];

  const repoFiles = fs.readdirSync(repoDir).filter(
    (f) =>
      f.endsWith('.repository.ts') &&
      !f.endsWith('.test.ts') &&
      !f.endsWith('.spec.ts') &&
      !ALLOWLIST.includes(f)
  );

  for (const file of repoFiles) {
    const baseName = file.replace(/\.ts$/, '');
    const testFile = `${baseName}.test.ts`;
    const testPath = path.join(repoDir, testFile);

    if (!fs.existsSync(testPath)) {
      const relPath = path.relative(config.rootDir, path.join(repoDir, file));
      const relTestPath = path.relative(config.rootDir, testPath);
      violations.push(
        `${relPath} has no colocated test file.\n` +
        `    Rule: Every non-abstract repository must have a colocated .test.ts file.\n` +
        `    Fix: Create ${relTestPath} with tests for all public methods.\n` +
        `    If this file is intentionally untested (e.g., abstract base class),\n` +
        `    add it to the ALLOWLIST in checkRepositoryTestCoverage().`
      );
    }
  }

  return { name, passed: violations.length === 0, violations };
}
```

### 2. `scripts/lint-architecture.ts` (modify)

Two changes:

**A. Add import** — Add `checkRepositoryTestCoverage` to the import block:

```typescript
import {
  // ... existing imports ...
  checkTestQuality,
  checkQualityGradesFreshness,
  checkRepositoryTestCoverage,  // ADD
} from './lint-checks.js';
```

**B. Add to checks array** — Append to the `checks` array (after `checkTestQuality`):

```typescript
(): CheckResult => checkRepositoryTestCoverage(config),
```

### 3. `scripts/lint-architecture.test.ts` (modify)

**A. Add import** — Add `checkRepositoryTestCoverage` to the import block:

```typescript
import {
  // ... existing imports ...
  checkQualityGradesFreshness,
  checkRepositoryTestCoverage,  // ADD
} from './lint-checks.js';
```

**B. Add test suite** — Append after the `checkQualityGradesFreshness` describe block:

```typescript
// ── Check 20: Repository test coverage ───────────────────────────────────────

describe('checkRepositoryTestCoverage', () => {
  let rootDir: string;
  let config: LinterConfig;

  beforeEach(() => {
    ({ rootDir, config } = createFixture());
  });
  afterEach(() => cleanup(rootDir));

  it('passes when all repository files have colocated tests', () => {
    writeFixture(rootDir, 'packages/functions/src/repositories/exercise.repository.ts',
      'export class ExerciseRepository {}');
    writeFixture(rootDir, 'packages/functions/src/repositories/exercise.repository.test.ts',
      "it('works', () => { expect(1).toBe(1); });");

    const result = checkRepositoryTestCoverage(config);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('fails when a repository file has no colocated test', () => {
    writeFixture(rootDir, 'packages/functions/src/repositories/exercise.repository.ts',
      'export class ExerciseRepository {}');

    const result = checkRepositoryTestCoverage(config);
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toContain('exercise.repository.ts');
    expect(result.violations[0]).toContain('no colocated test file');
  });

  it('skips allowlisted files (base.repository.ts)', () => {
    writeFixture(rootDir, 'packages/functions/src/repositories/base.repository.ts',
      'export abstract class BaseRepository {}');

    const result = checkRepositoryTestCoverage(config);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('passes when repositories directory does not exist', () => {
    // config.functionsSrc/repositories does not exist in fixture
    const result = checkRepositoryTestCoverage(config);
    expect(result.passed).toBe(true);
  });

  it('reports multiple missing test files', () => {
    writeFixture(rootDir, 'packages/functions/src/repositories/foo.repository.ts',
      'export class FooRepository {}');
    writeFixture(rootDir, 'packages/functions/src/repositories/bar.repository.ts',
      'export class BarRepository {}');

    const result = checkRepositoryTestCoverage(config);
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(2);
  });

  it('ignores non-repository .ts files in the directory', () => {
    writeFixture(rootDir, 'packages/functions/src/repositories/helpers.ts',
      'export function helper() {}');

    const result = checkRepositoryTestCoverage(config);
    expect(result.passed).toBe(true);
  });

  it('does not flag test files themselves', () => {
    writeFixture(rootDir, 'packages/functions/src/repositories/exercise.repository.ts',
      'export class ExerciseRepository {}');
    writeFixture(rootDir, 'packages/functions/src/repositories/exercise.repository.test.ts',
      "it('works', () => { expect(1).toBe(1); });");

    const result = checkRepositoryTestCoverage(config);
    expect(result.passed).toBe(true);
  });
});
```

**Tests**

Seven test cases in `scripts/lint-architecture.test.ts` (listed above):

| # | Test | Verifies |
|---|------|----------|
| 1 | passes when all repos have tests | Happy path — no violations |
| 2 | fails when repo has no test | Core detection logic |
| 3 | skips allowlisted files | `base.repository.ts` is exempt |
| 4 | passes when dir missing | Graceful degradation (no crash) |
| 5 | reports multiple missing | Each gap is a separate violation |
| 6 | ignores non-repository files | Only `*.repository.ts` files are checked |
| 7 | does not flag test files | `*.repository.test.ts` files aren't treated as source |

**QA**

1. **Run the linter against the real codebase** to confirm it passes (all 16 concrete repos have tests):
   ```bash
   npx tsx scripts/lint-architecture.ts
   ```
   Verify the new check line appears: `✓ Repository test coverage: clean`

2. **Simulate a violation** by temporarily creating a repository without a test:
   ```bash
   echo 'export class TempRepository {}' > packages/functions/src/repositories/temp.repository.ts
   npx tsx scripts/lint-architecture.ts
   # Should show: ✗ Repository test coverage: 1 violation(s)
   # With message pointing to temp.repository.ts
   rm packages/functions/src/repositories/temp.repository.ts
   ```

3. **Verify allowlist works** by confirming `base.repository.ts` (which has no test) does not trigger a violation.

4. **Run full validation** to ensure no regressions:
   ```bash
   npm run validate
   ```

**Conventions**

1. **CLAUDE.md** — Run `npm run validate` before committing. Use subagents for validation commands.

2. **docs/conventions/testing.md** — Tests use vitest with explicit imports (`import { describe, it, expect, beforeEach, afterEach } from 'vitest'`). No skipped or focused tests. Each test has at least one `expect()` assertion.

3. **docs/conventions/typescript.md** — No `any`. Explicit return types on the new function (`CheckResult`). Use `string[]` for the allowlist const.

4. **Existing lint-checks patterns** — Follow the established structure:
   - Section comment header with check number and description
   - Function signature: `export function checkXxx(config: LinterConfig): CheckResult`
   - `const name = 'Check display name'` as first line
   - Build `violations: string[]` array
   - Return `{ name, passed: violations.length === 0, violations }`
   - Violation messages include: file path, rule explanation, fix instruction, and (where applicable) convention doc reference
   - Tests use `createFixture()` / `writeFixture()` / `cleanup()` helpers from the test file
