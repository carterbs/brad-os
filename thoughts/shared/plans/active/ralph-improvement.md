# Test Robustness Enforcement: Empty Test Detection + Assertion Density Tracking

## Why

The linter now has 18 architecture checks and 48 self-tests (improvement #6). It catches structural violations, skipped tests, focused tests, and missing test files for high-risk code. But there is a **critical blind spot**: it cannot distinguish between a real test and a placeholder.

An agent can write this and the entire harness says "PASS":

```typescript
it('should calculate progressive overload', () => {});
it('should handle edge cases', () => { expect(true).toBe(true); });
```

Both tests run, both "pass," and the quality-grades script counts them as legitimate test files. The high-risk file check (check 15) is satisfied. But these tests verify **nothing** — they're cosmetic compliance.

This is the highest-leverage improvement because:

1. **It closes the last gap in the test quality enforcement chain.** Checks 14-18 guard against skipped tests, focused tests, inline factories, inline ApiResponse, and missing high-risk test files. But none of them verify that test bodies actually assert anything. An agent that writes `it('works', () => {})` for every test case "passes" all five checks.

2. **It's the most common agent anti-pattern.** When agents are asked to "add tests" and run into mocking complexity, they frequently write placeholder tests to satisfy the "file must exist" check. These placeholders persist because nothing flags them.

3. **Quality grades become more trustworthy.** The quality-grades script currently tracks test FILE count per domain (e.g., "Lifting: 23 test files"). After this improvement, it also tracks assertion density — how many `expect()` calls per test case. This transforms quality grades from a file-counting exercise into a test-depth metric.

4. **The compound effect is significant.** Every future change to a tested file is protected by its tests — but only if those tests actually assert something. Empty tests create a false sense of security that degrades the value of the entire harness.

After this improvement:
- Architecture check 19 catches empty test bodies and assertion-free test files
- Quality grades show assertion counts and density per domain
- Agents get clear, actionable feedback when they write placeholder tests
- The testing conventions document explains the new rule with examples

## What

### Phase 1: Architecture Check 19 — No Empty or Assertion-Free Tests

Add a new check function `checkTestQuality` to `scripts/lint-checks.ts` that scans all test files for two categories of violations:

**Category A: Empty test bodies**
Detects test cases where the callback body is empty — no statements at all.

Pattern (single-line): `it('name', () => {})` or `test('name', async () => {})`
Pattern (multi-line):
```typescript
it('name', () => {
});
```

Detection approach: For each line matching `\b(it|test)\s*\(`, track the opening `{` of the callback and check whether the closing `}` appears with only whitespace between them. Handle both single-line and multi-line variants.

**Category B: Assertion-free test files**
Detects test files where there are test case definitions (`it(`, `test(`) but zero `expect(` calls in the entire file. This catches files where every test case is a placeholder or where someone forgot to add assertions.

Note: this is a FILE-level check, not per-test-case. A file with 10 tests and 1 `expect()` call passes — only files with ZERO assertions are flagged. This minimizes false positives while catching the most egregious cases.

**What it does NOT check** (to avoid false positives):
- Per-test-case assertion counting (too noisy — some tests legitimately share assertions via helper functions)
- Trivial assertions like `expect(true).toBe(true)` (hard to detect reliably across all patterns)
- `describe` blocks without test cases (legitimate for organizing test suites)
- Commented-out test lines (already handled by skipping `//` prefixed lines)

#### Implementation

```typescript
// ─────────────────────────────────────────────────────────────────────────────
// Check 19: Test quality — no empty or assertion-free tests
//
// Test files must contain meaningful assertions. Empty test bodies and files
// with zero expect() calls indicate placeholder tests that verify nothing.
// ─────────────────────────────────────────────────────────────────────────────

export function checkTestQuality(config: LinterConfig): CheckResult {
  const name = 'Test quality (no empty/assertion-free tests)';

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

  // Pattern for test case definitions (it/test, not describe)
  const testCasePattern = /\b(it|test)\s*\(/;

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split('\n');
    const relPath = path.relative(config.rootDir, file);

    // --- Category A: Empty test bodies ---
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line === undefined) continue;
      if (/^\s*\/\//.test(line)) continue;

      if (!testCasePattern.test(line)) continue;

      // Check for single-line empty body: it('...', () => {})
      // Also handles async: it('...', async () => {})
      if (/\b(it|test)\s*\([^)]*,\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{\s*\}\s*\)/.test(line)) {
        violations.push(
          `${relPath}:${i + 1} has an empty test body.\n` +
          `    Rule: Every test case must contain at least one expect() assertion.\n` +
          `    Fix: Add assertions that verify the behavior under test, e.g.:\n` +
          `         expect(result).toBe(expectedValue);\n` +
          `    See: docs/conventions/testing.md`
        );
        continue;
      }

      // Check for multi-line empty body:
      //   it('...', () => {
      //   });
      // Find the opening { on this or next lines, then check if } follows with only whitespace
      if (/\b(it|test)\s*\(/.test(line) && /=>\s*\{\s*$/.test(line)) {
        // Arrow function body opens at end of this line
        const nextNonEmpty = lines.slice(i + 1).findIndex(
          (l) => l !== undefined && l.trim().length > 0
        );
        if (nextNonEmpty !== -1) {
          const nextLine = lines[i + 1 + nextNonEmpty];
          if (nextLine !== undefined && /^\s*\}\s*\)\s*;?\s*$/.test(nextLine)) {
            // Check that lines between opening { and closing } are only whitespace
            const bodyLines = lines.slice(i + 1, i + 1 + nextNonEmpty);
            const allEmpty = bodyLines.every(
              (l) => l === undefined || l.trim().length === 0
            );
            if (allEmpty) {
              violations.push(
                `${relPath}:${i + 1} has an empty test body (multi-line).\n` +
                `    Rule: Every test case must contain at least one expect() assertion.\n` +
                `    Fix: Add assertions that verify the behavior under test.\n` +
                `    See: docs/conventions/testing.md`
              );
            }
          }
        }
      }
    }

    // --- Category B: Assertion-free test file ---
    const testCaseCount = (content.match(/\b(it|test)\s*\(/g) ?? []).length;
    const expectCount = (content.match(/\bexpect\s*\(/g) ?? []).length;

    if (testCaseCount > 0 && expectCount === 0) {
      violations.push(
        `${relPath} has ${testCaseCount} test case(s) but zero expect() assertions.\n` +
        `    Rule: Test files must contain at least one expect() call to verify behavior.\n` +
        `    Fix: Add expect() assertions to each test case. Example:\n` +
        `         expect(result.success).toBe(true);\n` +
        `         expect(body.data).toHaveLength(2);\n` +
        `    See: docs/conventions/testing.md`
      );
    }
  }

  return { name, passed: violations.length === 0, violations };
}
```

**Key design decisions:**
- The `collectTestFiles` function follows the same pattern as `checkNoFocusedTests` (check 18). It recursively walks from `config.rootDir` and finds `*.test.ts`/`*.spec.ts` files, skipping `node_modules`.
- Category A (empty bodies) is a per-line check with both single-line and multi-line detection.
- Category B (assertion-free files) is a file-level check. It counts `it(`/`test(` occurrences and `expect(` occurrences. If tests > 0 and expects === 0, it's flagged.
- Comment lines (`//`) are skipped for Category A to avoid false positives on commented-out test code.
- The `expect(` regex uses `\bexpect\s*\(` to match both `expect(value)` and `expect (value)` while avoiding false matches on strings like `unexpect`.

### Phase 2: Assertion Density Tracking in Quality Grades

Enhance `scripts/update-quality-grades.ts` to count assertions per domain, not just test files. This adds a quantitative depth metric to the quality grades.

#### 2a. Add assertion counting to the backend test counting

Modify the `DomainTestCounts` interface (currently at ~line 144 in `scripts/update-quality-grades.ts`) to add two new fields:

```typescript
interface DomainTestCounts {
  handlers: string[];
  services: string[];
  repositories: string[];
  integration: string[];
  schemas: string[];
  total: number;
  // NEW:
  testCaseCount: number;      // Total it()/test() blocks across all test files
  assertionCount: number;      // Total expect() calls across all test files
}
```

In the `ensureDomain()` helper (line ~156), initialize the new fields to 0:

```typescript
function ensureDomain(domain: string): DomainTestCounts {
  if (!domainCounts.has(domain)) {
    domainCounts.set(domain, {
      handlers: [],
      services: [],
      repositories: [],
      integration: [],
      schemas: [],
      total: 0,
      testCaseCount: 0,
      assertionCount: 0,
    });
  }
  return domainCounts.get(domain)!;
}
```

In the `countBackendTests()` function's file-processing loop (after the domain is determined and counts are updated), add assertion counting:

```typescript
// Read the test file to count assertions
const content = fs.readFileSync(testFile, 'utf-8');
const testCases = (content.match(/\b(it|test)\s*\(/g) ?? []).length;
const assertions = (content.match(/\bexpect\s*\(/g) ?? []).length;
counts.testCaseCount += testCases;
counts.assertionCount += assertions;
```

This needs to be added in each branch (handlers, services, repositories, integration, schemas) right before the `continue` statement, after the domain is resolved and `counts.total` is incremented.

#### 2b. Add assertion density to the grade table

Update the markdown generation function to include assertion metrics. The domain grades table gains two new columns. Find the table header generation (look for the line producing the `| Domain | Grade | Backend Tests |` row) and add:

**Before:**
```
| Domain | Grade | Backend Tests | iOS Tests | Coverage | API Complete | iOS Complete | Notes |
```

**After:**
```
| Domain | Grade | Backend Tests | iOS Tests | Assertions | Density | Coverage | API Complete | iOS Complete | Notes |
```

Where:
- **Assertions**: Total `expect()` calls across all backend test files for the domain
- **Density**: `assertions / testCases` ratio formatted as "X.Yx" (e.g., "3.2x" means 3.2 assertions per test case). Shows "—" if testCaseCount is 0.

For each domain row, compute and render:
```typescript
const density = counts.testCaseCount > 0
  ? (counts.assertionCount / counts.testCaseCount).toFixed(1) + 'x'
  : '—';
```

#### 2c. Add assertion density to grade calculation

In the grade calculation logic, factor in assertion density as an adjustment signal. Find the section where grades are computed (likely a function that assigns A/B/C/D/F). Add:

```typescript
// Assertion density adjustment (±1 sub-grade)
const density = counts.testCaseCount > 0
  ? counts.assertionCount / counts.testCaseCount
  : 0;

if (density >= 2.0) {
  // Thorough tests — positive adjustment (e.g., B → B+)
  // Implementation: increment the grade score by a small amount
} else if (density < 1.0 && counts.testCaseCount > 0) {
  // Weak tests — negative adjustment (e.g., B+ → B)
  // Implementation: decrement the grade score by a small amount
}
```

**Important**: The implementing agent should read the existing grade calculation logic to understand how grades are currently computed, then add the density adjustment in a way that's consistent. The goal is ±1 sub-grade at most.

### Phase 3: Update Documentation

#### 3a. Update `docs/golden-principles.md`

Add one line under `### Architecture [lint-architecture]` after the existing "No focused tests" line:

```markdown
- No empty or assertion-free tests — every test file must have `expect()` calls; test bodies must not be empty
```

#### 3b. Update `docs/conventions/testing.md`

Add a new section after "Focused Tests (.only) Policy":

```markdown
## Test Quality Policy

**Every test case must contain meaningful assertions.** The architecture linter (check 19) enforces two rules:

1. **No empty test bodies.** `it('name', () => {})` is never acceptable. If a test case exists, it must verify behavior.

2. **No assertion-free test files.** A test file must contain at least one `expect()` call. Files with test cases but zero assertions are placeholder files that provide false confidence.

### Bad Examples (caught by linter)

```typescript
// Empty body — flagged
it('should calculate progression', () => {});

// File with test cases but no expect() — flagged
describe('WorkoutService', () => {
  it('creates a workout', async () => {
    await service.create(data);
    // Missing: expect(result).toBeDefined();
  });
  it('deletes a workout', async () => {
    await service.delete(id);
    // Missing: expect(result.success).toBe(true);
  });
});
```

### Good Examples

```typescript
it('should calculate progression', () => {
  const result = calculateProgression(previousWeek);
  expect(result.reps).toBe(9);
  expect(result.weight).toBe(135);
});

it('should reject invalid input', () => {
  expect(() => validateInput(null)).toThrow();
});
```
```

#### 3c. Update header comment in `scripts/lint-checks.ts`

Add check 19 to the header comment list at the top of the file:

```
 *  19. Test quality (no empty test bodies, no assertion-free test files)
```

### Phase 4: Wire Check 19 into the Runner

#### 4a. Update `scripts/lint-architecture.ts`

Add `checkTestQuality` to the import list:

```typescript
import {
  // ... existing imports ...
  checkTestQuality,    // NEW
} from './lint-checks.js';
```

Add to the checks array (after the `checkNoFocusedTests` entry):

```typescript
(): CheckResult => checkTestQuality(config),    // NEW — check 19
```

### Phase 5: Add Self-Tests for Check 19

Add test cases to `scripts/lint-architecture.test.ts`. Import `checkTestQuality` alongside the existing check imports. Add a new describe block after the "Check 18: No focused tests" section:

```typescript
// ── Check 19: Test quality (no empty/assertion-free tests) ───────────────────

describe('checkTestQuality', () => {
  let rootDir: string;
  let config: LinterConfig;

  beforeEach(() => {
    ({ rootDir, config } = createFixture());
  });
  afterEach(() => cleanup(rootDir));

  it('passes for tests with assertions', () => {
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.test.ts',
      "import { it, describe, expect } from 'vitest';\n" +
      "describe('Exercises', () => {\n" +
      "  it('returns all exercises', () => {\n" +
      "    expect([1, 2]).toHaveLength(2);\n" +
      "  });\n" +
      "});");

    const result = checkTestQuality(config);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('fails for single-line empty test body', () => {
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.test.ts',
      "import { it, describe } from 'vitest';\n" +
      "describe('Exercises', () => {\n" +
      "  it('should work', () => {});\n" +
      "});");

    const result = checkTestQuality(config);
    expect(result.passed).toBe(false);
    expect(result.violations.length).toBeGreaterThanOrEqual(1);
    expect(result.violations[0]).toContain('empty test body');
  });

  it('fails for multi-line empty test body', () => {
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.test.ts',
      "import { it, describe } from 'vitest';\n" +
      "describe('Exercises', () => {\n" +
      "  it('should work', () => {\n" +
      "  });\n" +
      "});");

    const result = checkTestQuality(config);
    expect(result.passed).toBe(false);
    expect(result.violations.length).toBeGreaterThanOrEqual(1);
    expect(result.violations[0]).toContain('empty test body');
  });

  it('fails for async empty test body', () => {
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.test.ts',
      "import { it, describe } from 'vitest';\n" +
      "describe('Exercises', () => {\n" +
      "  it('should work', async () => {});\n" +
      "});");

    const result = checkTestQuality(config);
    expect(result.passed).toBe(false);
    expect(result.violations[0]).toContain('empty test body');
  });

  it('fails for test file with test cases but zero expect() calls', () => {
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.test.ts',
      "import { it, describe } from 'vitest';\n" +
      "describe('Exercises', () => {\n" +
      "  it('creates exercise', async () => {\n" +
      "    await service.create(data);\n" +
      "  });\n" +
      "  it('deletes exercise', async () => {\n" +
      "    await service.delete(id);\n" +
      "  });\n" +
      "});");

    const result = checkTestQuality(config);
    expect(result.passed).toBe(false);
    expect(result.violations[0]).toContain('zero expect() assertions');
  });

  it('passes for test file with some tests having assertions', () => {
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.test.ts',
      "import { it, describe, expect } from 'vitest';\n" +
      "describe('Exercises', () => {\n" +
      "  it('creates exercise', async () => {\n" +
      "    const result = await service.create(data);\n" +
      "    expect(result).toBeDefined();\n" +
      "  });\n" +
      "  it('sets up state', () => {\n" +
      "    service.init();\n" +
      "  });\n" +
      "});");

    const result = checkTestQuality(config);
    // File has expect() calls, so file-level check passes
    // The second test has no assertions but is not empty (has a statement)
    expect(result.passed).toBe(true);
  });

  it('ignores commented-out test lines', () => {
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.test.ts',
      "import { it, describe, expect } from 'vitest';\n" +
      "describe('Exercises', () => {\n" +
      "  // it('placeholder', () => {});\n" +
      "  it('real test', () => { expect(1).toBe(1); });\n" +
      "});");

    const result = checkTestQuality(config);
    expect(result.passed).toBe(true);
  });

  it('handles test.each without flagging', () => {
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.test.ts',
      "import { it, describe, expect } from 'vitest';\n" +
      "describe('Exercises', () => {\n" +
      "  it.each([1, 2, 3])('handles %i', (n) => {\n" +
      "    expect(n).toBeGreaterThan(0);\n" +
      "  });\n" +
      "});");

    const result = checkTestQuality(config);
    expect(result.passed).toBe(true);
  });

  it('does not flag describe blocks (only it/test)', () => {
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.test.ts',
      "import { describe, it, expect } from 'vitest';\n" +
      "describe('Exercises', () => {\n" +
      "  it('works', () => { expect(true).toBe(true); });\n" +
      "});");

    const result = checkTestQuality(config);
    expect(result.passed).toBe(true);
  });
});
```

**Total: 9 test cases** covering:
1. Happy path (tests with assertions pass)
2. Single-line empty body detection
3. Multi-line empty body detection
4. Async empty body detection
5. Assertion-free file detection
6. Mixed file (some assertions) passes
7. Commented-out lines ignored
8. test.each handled correctly
9. describe blocks not confused with test cases

## Files

| File | Action | Description |
|------|--------|-------------|
| `scripts/lint-checks.ts` | **Modify** | Add `checkTestQuality` function (~80 lines) after check 18. Update header comment to include check 19. |
| `scripts/lint-architecture.ts` | **Modify** | Add `checkTestQuality` import and add to checks array (~2 lines changed). |
| `scripts/lint-architecture.test.ts` | **Modify** | Add `checkTestQuality` import and 9 test cases in a new describe block (~100 lines added). |
| `scripts/update-quality-grades.ts` | **Modify** | Add `testCaseCount` and `assertionCount` to `DomainTestCounts` interface. Add counting logic in the test file processing loop. Add Assertions/Density columns to grade table generation. Factor density into grade calculation (~60 lines of changes spread across the file). |
| `docs/golden-principles.md` | **Modify** | Add one line under "Architecture [lint-architecture]" section (line ~29). |
| `docs/conventions/testing.md` | **Modify** | Add "Test Quality Policy" section with bad/good examples (~30 lines after line 110). |

**Total: 6 modified files, 0 new files**

## Tests

### Self-tests for check 19 (in `scripts/lint-architecture.test.ts`)

| # | Test Case | What It Verifies |
|---|-----------|-----------------|
| 1 | Tests with assertions pass | Clean test files are not flagged |
| 2 | Single-line empty body fails | `it('name', () => {})` detected |
| 3 | Multi-line empty body fails | Empty body across lines detected |
| 4 | Async empty body fails | `it('name', async () => {})` detected |
| 5 | Assertion-free file fails | File with test cases but zero `expect()` detected |
| 6 | Mixed file passes | File with some `expect()` calls passes file-level check |
| 7 | Comments ignored | Commented-out `it()` lines not flagged |
| 8 | test.each handled | Parameterized tests with assertions pass |
| 9 | describe not confused with test | Only `it`/`test` counted, not `describe` |

### Existing tests must pass

All 48 existing test cases in `scripts/lint-architecture.test.ts` must continue to pass. The new check is additive — it doesn't modify any existing check function.

### Architecture lint against real codebase

After adding check 19, running `npm run lint:architecture` on the current codebase must pass with all 19 checks clean. This verifies that no existing test files in the repo have empty bodies or zero assertions.

**Pre-check before implementation:** The implementing agent should verify this by searching for test files without any `expect()` calls:
```bash
find packages/functions/src -name "*.test.ts" -exec sh -c 'grep -qL "expect(" "$1" && echo "$1"' _ {} \;
find scripts -name "*.test.ts" -exec sh -c 'grep -qL "expect(" "$1" && echo "$1"' _ {} \;
```
If any files appear, they need assertions added as part of this improvement (before the check can pass).

## QA

### Step 1: Verify check 19 passes on the current codebase

```bash
npm run lint:architecture
```

Expected: All 19 checks pass (0 violations). If check 19 fails on existing test files, those files need assertions added first.

### Step 2: Verify check 19 catches empty test bodies

Create a temporary test file:
```bash
cat > packages/functions/src/handlers/temp-test-quality.test.ts << 'EOF'
import { it, describe } from 'vitest';
describe('Placeholder', () => {
  it('should work', () => {});
});
EOF
npm run lint:architecture
```

Expected: Check 19 fails with a violation pointing to the empty test body.

Clean up: `rm packages/functions/src/handlers/temp-test-quality.test.ts`

### Step 3: Verify check 19 catches assertion-free files

Create a temporary test file with test cases but no expect():
```bash
cat > packages/functions/src/handlers/temp-test-quality.test.ts << 'EOF'
import { it, describe } from 'vitest';
describe('Placeholder', () => {
  it('creates something', async () => {
    await someFunction();
  });
});
EOF
npm run lint:architecture
```

Expected: Check 19 fails mentioning "zero expect() assertions."

Clean up: `rm packages/functions/src/handlers/temp-test-quality.test.ts`

### Step 4: Run all tests including self-tests

```bash
npx vitest run
```

Expected: Both workspaces pass:
- `functions` — all existing tests pass
- `scripts` — all lint architecture tests pass (48 existing + 9 new = 57 total)

### Step 5: Run full validation

```bash
npm run validate
```

Expected: All checks pass (typecheck, lint, test, architecture).

### Step 6: Verify quality grades update

```bash
npm run update:quality-grades
```

Expected: `docs/quality-grades.md` is regenerated with:
- New "Assertions" and "Density" columns in the domain grades table
- Lifting domain should show high assertion count and high density (many assertions per test case)
- Cycling domain should show moderate density
- Today domain should show "—" for density (no tests at all)

Manually inspect the output to verify the numbers look reasonable.

### Step 7: Verify the linter self-test catches regressions

Intentionally break check 19 (e.g., change the test case regex to match nothing) and verify that the self-tests fail:

```bash
# After breaking the check:
npx vitest run scripts/lint-architecture.test.ts
```

Expected: The "fails for single-line empty test body" and similar tests fail, proving the self-tests guard against check regressions.

Revert the intentional break after verifying.

## Conventions

1. **Git Worktree Workflow** — All changes in a worktree branch, not directly on main. Create worktree at `/tmp/brad-os-worktrees/`, symlink `node_modules` from main.

2. **Subagent Usage** — Run `npm run validate` in subagents to conserve context.

3. **Vitest not Jest** — All tests use vitest. Import `{ describe, it, expect }` from `'vitest'` explicitly in the test file.

4. **No `any` types** — The new check function and test code must not use `any`. Use `unknown` for untyped values, narrow with assertions.

5. **Explicit return types** — `checkTestQuality` returns `CheckResult` (already defined in lint-checks.ts).

6. **File naming** — No new files; all modifications go to existing files following existing naming conventions.

7. **Principle-to-Linter Pipeline** — This is a new enforcement rule added to golden-principles.md under "Enforced (linter/hook exists)" → "Architecture [lint-architecture]".

8. **No floating promises** — The check function is synchronous (all `fs.readFileSync`). Tests are also synchronous.

9. **`os.tmpdir()` for temp files** — The test fixtures already use `os.tmpdir()` via the existing `createFixture()` helper.

10. **Read before modifying** — The implementing agent must read `scripts/lint-checks.ts`, `scripts/lint-architecture.ts`, `scripts/lint-architecture.test.ts`, and `scripts/update-quality-grades.ts` in full before making changes. The plan provides patterns and function signatures; the agent must verify against the actual code.

11. **Test fixture safety** — Tests in `lint-architecture.test.ts` for checks 14 and 18 use string concatenation (e.g., `"it" + ".skip("`) to avoid the test file itself triggering the linter. Check 19's test fixtures write content to temp directories (via `writeFixture`), not to the actual scripts/ directory, so they won't trigger the linter. However, verify that the check's `collectTestFiles` starts from `config.rootDir` (the temp dir in tests), not from the real project root.
