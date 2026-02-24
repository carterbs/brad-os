# CI Workflow: Validate + Integration Tests with Artifact Upload

**Why**: The project has comprehensive local validation (`npm run validate`) and 11 integration test suites against Firebase emulators, but zero CI automation. Every merge to `main` relies on the developer remembering to run checks locally. A GitHub Actions workflow catches regressions automatically and uploads `.validate/*.log` artifacts on failure so debugging agents (and humans) can inspect verbose output without re-running locally.

**What**

A single GitHub Actions workflow (`ci.yml`) triggered on pushes to `main` and pull requests targeting `main`. Two jobs:

1. **validate** — Runs `npm run validate` (typecheck + lint + unit tests + architecture lint). On failure, uploads `.validate/*.log` as a downloadable artifact.
2. **integration** — Builds the project, boots Firebase emulators in the background, waits for readiness, runs `npm run test:integration`, then uploads logs on failure.

Both jobs run on `ubuntu-latest` with Node.js 22 (matching the `nodejs22` Firebase runtime in `firebase.json`).

---

## Files

### 1. `.github/workflows/ci.yml` (create)

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

# Cancel in-progress runs for the same branch/PR
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  validate:
    name: Validate (typecheck + lint + test + architecture)
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Run validation
        run: npm run validate

      - name: Upload validation logs
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: validate-logs
          path: .validate/*.log
          retention-days: 7

  integration:
    name: Integration tests (Firebase emulators)
    runs-on: ubuntu-latest
    timeout-minutes: 20
    needs: validate

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Install firebase-tools
        run: npm install -g firebase-tools

      - name: Build functions
        run: npm run build

      - name: Start Firebase emulators
        run: |
          firebase emulators:start --project brad-os &
          # Wait for functions emulator to be ready (port 5001)
          echo "Waiting for emulators to start..."
          timeout 60 bash -c '
            until curl -sf http://127.0.0.1:5001/brad-os/us-central1/devHealth > /dev/null 2>&1; do
              sleep 2
            done
          '
          echo "Emulators ready."

      - name: Run integration tests
        run: npm run test:integration

      - name: Upload integration test logs
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: integration-logs
          path: |
            .validate/*.log
          retention-days: 7
```

**Design decisions explained:**

| Decision | Rationale |
|----------|-----------|
| Two separate jobs (`validate` → `integration`) | Fail fast on cheap checks before booting emulators. `needs: validate` skips integration if validation fails. |
| `concurrency` with `cancel-in-progress` | Avoids wasting CI minutes when multiple pushes happen in quick succession. |
| `npm ci` (not `npm install`) | Deterministic installs from lockfile, faster in CI. |
| `firebase emulators:start` without `--import` | Uses fresh state (no seed data) matching `npm run emulators:fresh`. Integration tests create their own data. |
| `--project brad-os` flag | Explicitly sets the project ID so the emulator URL matches the hardcoded `http://127.0.0.1:5001/brad-os/us-central1` in integration tests. Avoids needing `.firebaserc` auth. |
| Health check loop with `timeout 60` | Polls the `devHealth` endpoint (same check integration tests use in `checkEmulatorRunning()`). 60s cap prevents hanging forever if the emulator fails to start. |
| `firebase-tools` installed globally | It's not a devDependency — matches local dev setup where it's installed globally. |
| `retention-days: 7` for artifacts | Keeps logs long enough for debugging but doesn't bloat storage. |
| `timeout-minutes: 15/20` | Generous limits — validate typically takes ~20s locally, integration ~60s, but CI machines are slower and include install time. |

**What the workflow does NOT do:**

- No iOS build (requires macOS runners, Xcode — separate concern)
- No deployment (intentionally decoupled from CI validation)
- No secrets or Firebase auth tokens (emulator runs locally, no cloud access needed)
- No coverage upload (can be added later)

---

### 2. `package.json` (modify — optional enhancement)

Add `firebase-tools` as a devDependency so CI can use `npx firebase` instead of a global install:

```json
"devDependencies": {
  "firebase-tools": "^13.0.0"
}
```

**However**, this changes the lockfile and may conflict with the globally-installed version used locally. **Recommendation: skip this for now** and use the global install approach in the workflow. This can be revisited later.

---

### 3. `CLAUDE.md` (modify)

Add a brief CI section after the "Validation" section so future agents know CI exists:

```markdown
## Continuous Integration

GitHub Actions runs on every push to `main` and every PR:

1. **validate** job — `npm run validate` (typecheck + lint + test + architecture)
2. **integration** job — Boots Firebase emulators, runs `npm run test:integration`

On failure, `.validate/*.log` artifacts are uploaded for inspection. See `.github/workflows/ci.yml`.
```

---

## Tests

This is an infrastructure change (CI config), not application code. No new unit tests are needed. The CI workflow **is itself the test** — it validates that the existing test suites pass in a clean environment.

**Verification approach:**

1. The workflow runs `npm run validate` which exercises all 4 check categories (typecheck, lint, test, architecture) — these already have extensive tests.
2. The workflow runs `npm run test:integration` which exercises all 11 integration test suites against real Firebase emulators.
3. The artifact upload step is verified by intentionally triggering a failure (see QA below).

---

## QA

### 1. Verify the workflow file is valid YAML

```bash
# From the worktree root
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo "Valid YAML"
```

Or use `actionlint` if available:
```bash
npx actionlint .github/workflows/ci.yml
```

### 2. Verify the workflow triggers correctly

Push the branch and open a PR against `main`. Confirm the CI workflow appears in the GitHub Actions tab with both jobs listed.

### 3. Verify the validate job passes

The PR's CI run should show the `validate` job completing successfully with all 4 checks passing.

### 4. Verify the integration job passes

The `integration` job should:
- Install firebase-tools
- Build functions
- Start emulators (visible in logs as "Emulators ready.")
- Run all 11 integration test suites
- Show green checkmark

### 5. Verify artifact upload on failure

To test this without breaking main, temporarily add a failing assertion to one test file in the PR branch, push, and confirm:
- The workflow fails
- The "validate-logs" artifact appears in the Actions run summary
- Downloading the artifact yields the `.validate/*.log` files with verbose error output
- Revert the intentional failure before merging

### 6. Verify concurrency cancellation

Push two commits in rapid succession to the same branch. Confirm the first run is cancelled and only the second completes.

---

## Conventions

1. **CLAUDE.md — Worktree workflow**: Create the workflow file in a worktree branch, validate, then merge to main.

2. **CLAUDE.md — Validation**: Run `npm run validate` locally before committing to ensure the workflow file doesn't break anything.

3. **CLAUDE.md — Subagent usage**: Run validation commands in subagents to conserve context.

4. **CLAUDE.md — Self-review**: Review the diff before committing. Ensure the YAML is valid and the CLAUDE.md update is accurate.

5. **docs/conventions/testing.md**: The CI workflow must run the same test commands as local development — `npm run validate` and `npm run test:integration` — not custom CI-only test scripts.

6. **Project structure**: The `.github/workflows/` directory doesn't exist yet — it must be created along with the workflow file.
