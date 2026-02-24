# Pin Node 22 Toolchain and Fail Fast on Version Mismatch

**Why**: Node version is specified in three disconnected places (`packages/functions/package.json` engines, `firebase.json` runtime, `.github/workflows/ci.yml` setup-node) but nothing prevents a developer or agent from running `npm install` or `npm run validate` on the wrong Node major version. A mismatch causes cryptic failures (e.g., native module ABI errors, unsupported syntax) far from the root cause. A single `.nvmrc` pins the version for `nvm use`, root `engines` documents it for humans/tools, and a `preinstall` script fails fast with a clear message.

---

## What

1. **Create `.nvmrc`** at the repo root pinning Node 22.
2. **Add `engines` field** to the root `package.json` requiring Node `>=22.0.0 <23.0.0`.
3. **Add a `preinstall` script** to the root `package.json` that checks `process.version` and exits with a clear error if Node is not on major version 22.
4. **Update CI** to read from `.nvmrc` instead of hardcoding `node-version: 22` (single source of truth).
5. **Add a unit test** that verifies the preinstall script behavior.

---

## Files

### 1. `.nvmrc` (CREATE)

```
22
```

Single line, no trailing content. This is the source of truth for the project's Node major version. `nvm use` and `nvm install` read this file. GitHub Actions `setup-node` can also read it via `node-version-file: '.nvmrc'`.

### 2. `package.json` (MODIFY)

Add two things:

**a) `engines` field** (top-level, after `"private": true`):

```json
"engines": {
  "node": ">=22.0.0 <23.0.0"
},
```

This is advisory by default (npm only warns), but it documents the requirement and tools like Volta, Corepack, and `npm --engine-strict` respect it.

**b) `preinstall` script** (in `"scripts"`, before `"postinstall"`):

```json
"preinstall": "node scripts/check-node-version.js"
```

Using a `.js` file (not `.ts`) because `preinstall` runs before `npm install` completes — `tsx` and other devDependencies may not be available yet. The script must work with just bare Node.

### 3. `scripts/check-node-version.js` (CREATE)

```js
#!/usr/bin/env node

// Fail fast if Node major version doesn't match .nvmrc.
// Runs as a preinstall hook — no dependencies available, pure Node only.

const fs = require('fs');
const path = require('path');

const nvmrcPath = path.join(__dirname, '..', '.nvmrc');
const expectedMajor = parseInt(fs.readFileSync(nvmrcPath, 'utf8').trim(), 10);
const actualMajor = parseInt(process.versions.node.split('.')[0], 10);

if (actualMajor !== expectedMajor) {
  console.error('');
  console.error(`ERROR: Node ${expectedMajor} is required, but you're running Node ${process.versions.node}.`);
  console.error('');
  console.error('Fix with:');
  console.error(`  nvm install ${expectedMajor} && nvm use ${expectedMajor}`);
  console.error('  # or: brew install node@${expectedMajor}');
  console.error('');
  process.exit(1);
}
```

Key design decisions:
- **Reads `.nvmrc`** at runtime rather than hardcoding `22` — single source of truth. If we bump to Node 24 later, only `.nvmrc` changes.
- **CommonJS `require()`** — this runs before install, so there's no guarantee ESM loader or `tsx` is available. CJS works on all Node versions.
- **No dependencies** — only `fs` and `path` from Node stdlib.
- **Clear error message** — tells the user exactly what's wrong and how to fix it.
- **`process.exit(1)`** — makes `npm install` abort immediately.

### 4. `.github/workflows/ci.yml` (MODIFY)

Replace the hardcoded `node-version: 22` in both jobs with `node-version-file: '.nvmrc'`:

**In the `validate` job** (around line 25):
```yaml
# Before:
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

# After:
      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: npm
```

**In the `integration` job** (around line 53):
```yaml
# Before:
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

# After:
      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: npm
```

This eliminates the duplicated `22` constant. `setup-node` natively supports `node-version-file`.

### 5. `docs/guides/local-dev-quickstart.md` (MODIFY)

Update the Prerequisites table to reference `.nvmrc`:

**Current** (around line 5-6 of the Prerequisites table):
```markdown
| Node.js | 22.x | `brew install node@22` or [nvm](https://github.com/nvm-sh/nvm) |
```

**Replace with:**
```markdown
| Node.js | 22.x (pinned in `.nvmrc`) | `nvm install` (reads `.nvmrc`) or `brew install node@22` |
```

### 6. `scripts/check-node-version.test.ts` (CREATE)

Unit test for the version check script. Tests the logic by spawning the script with different Node version semantics.

```typescript
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import path from 'path';
import fs from 'fs';

const scriptPath = path.resolve(__dirname, 'check-node-version.js');

describe('check-node-version', () => {
  it('script file exists and is valid JavaScript', () => {
    expect(fs.existsSync(scriptPath)).toBe(true);
    // Verify it parses without syntax errors
    const content = fs.readFileSync(scriptPath, 'utf8');
    expect(() => new Function(content)).not.toThrow();
  });

  it('succeeds on the current Node version (which should match .nvmrc)', () => {
    // This test runs in CI and locally — both should be on Node 22
    const result = execFileSync('node', [scriptPath], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
    // No output on success, no error thrown
    expect(result).toBe('');
  });

  it('reads expected major version from .nvmrc', () => {
    const nvmrcPath = path.resolve(__dirname, '..', '.nvmrc');
    const content = fs.readFileSync(nvmrcPath, 'utf8').trim();
    expect(parseInt(content, 10)).toBe(22);
  });
});
```

Notes:
- The test that `execFileSync` succeeds is the critical one — it proves the script exits 0 on the correct Node version.
- We can't easily test the failure path in-process (would need to mock `process.versions.node`), but we verify the script parses correctly and reads `.nvmrc`.
- If someone runs the test suite on the wrong Node version, the preinstall script would have already blocked `npm install`, so the success-path test is always valid.

---

## Tests

| Test | What it verifies |
|------|-----------------|
| `scripts/check-node-version.test.ts` — "script file exists" | The script is present and is valid JS |
| `scripts/check-node-version.test.ts` — "succeeds on current Node" | Script exits 0 when run on the correct Node major version |
| `scripts/check-node-version.test.ts` — "reads from .nvmrc" | `.nvmrc` contains `22` (catches accidental edits) |

---

## QA

### 1. Validate the build passes
```bash
npm run validate
# All checks should pass (existing + new test)
```

### 2. Verify `.nvmrc` works with nvm
```bash
# From repo root:
cat .nvmrc
# Should print: 22

nvm use
# Should say "Now using node v22.x.x"
```

### 3. Verify `preinstall` runs and succeeds on correct Node
```bash
# Simulate what npm does:
node scripts/check-node-version.js
# Should exit 0, no output
echo $?
# Should print: 0
```

### 4. Verify `preinstall` fails on wrong Node (manual test)
```bash
# If nvm is available, temporarily switch:
nvm use 20
node scripts/check-node-version.js
# Should print error message and exit 1
echo $?
# Should print: 1
nvm use 22  # switch back
```

### 5. Verify `engines` field is present
```bash
# Check root package.json has engines:
node -e "const p = require('./package.json'); console.log(p.engines)"
# Should print: { node: '>=22.0.0 <23.0.0' }
```

### 6. Verify CI uses `.nvmrc`
```bash
grep -n 'node-version' .github/workflows/ci.yml
# Should show 'node-version-file: .nvmrc' (not hardcoded '22')
```

### 7. Diff review
```bash
git diff main --stat
# Expected: ~6 files changed
#   .nvmrc (new)
#   package.json (modified — engines + preinstall)
#   scripts/check-node-version.js (new)
#   scripts/check-node-version.test.ts (new)
#   .github/workflows/ci.yml (modified)
#   docs/guides/local-dev-quickstart.md (modified)

git diff main
# Review every changed line
```

---

## Conventions

1. **CLAUDE.md — Worktree workflow**: Make all changes in a git worktree, not directly on main.
2. **CLAUDE.md — Validation**: Run `npm run validate` before committing.
3. **CLAUDE.md — Subagent usage**: Run validation in a subagent to conserve context.
4. **CLAUDE.md — Self-review**: `git diff main` to review every changed line before committing.
5. **Testing conventions — TDD**: Write test before or alongside the script.
6. **Testing conventions — vitest not jest**: Test uses `import { describe, it, expect } from 'vitest'`.
7. **Testing conventions — no skip/only**: No `.only` or `.skip` in committed tests.
8. **CLAUDE.md — QA**: Exercise what you built — run the script manually, verify it catches the wrong version.
9. **TypeScript conventions — file naming**: The preinstall script is `.js` (not `.ts`) by necessity — it runs before devDependencies are installed. The test is `.test.ts` per convention.
