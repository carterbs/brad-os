# Add Local Dev Quickstart Guide

**Why**: There is no single document that walks a new developer (or agent) through the full bootstrap sequence. The README has a minimal "Development" section with stale commands (`npm run dev` which actually runs emulators, no mention of `validate`, no XcodeGen step). CLAUDE.md has validation and iOS build info but scattered across sections. A dedicated 5-minute quickstart guide consolidates the happy path: install → validate → emulators → iOS build.

---

## What

Create `docs/guides/local-dev-quickstart.md` — a concise, linear guide covering:

1. **Prerequisites** — Node 22, npm, Firebase CLI, Xcode + simulator, XcodeGen
2. **Step 1: Clone & Install** — `git clone`, `npm install` (which also sets up git hooks via `postinstall`)
3. **Step 2: Validate** — `npm run validate` to confirm the TypeScript + lint + test + architecture stack passes
4. **Step 3: Start Emulators** — `npm run emulators` (persist mode) with a health-check curl to verify
5. **Step 4: Build & Run iOS** — XcodeGen → xcodebuild → simctl install → simctl launch
6. **Verify everything works** — curl the health endpoint, confirm iOS app loads in simulator
7. **Next steps** — links to CLAUDE.md, conventions, and other guides

Then link it from `README.md` and `CLAUDE.md`.

---

## Files

### 1. `docs/guides/local-dev-quickstart.md` (CREATE)

Full content of the new file:

```markdown
# Local Dev Quickstart

Get brad-os running locally in ~5 minutes: install dependencies, validate the build, start emulators, and run the iOS app on a simulator.

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 22.x | `brew install node@22` or [nvm](https://github.com/nvm-sh/nvm) |
| npm | 10.x+ | Comes with Node |
| Firebase CLI | Latest | `npm install -g firebase-tools` |
| Xcode | 16+ | Mac App Store |
| XcodeGen | Latest | `brew install xcodegen` |

Verify:

```bash
node -v          # v22.x
firebase --version
xcodegen --version
xcodebuild -version
```

## Step 1: Clone & Install

```bash
git clone <repo-url> brad-os
cd brad-os
npm install
```

`npm install` also runs `postinstall` which sets `core.hooksPath` to `hooks/` — this enables the pre-commit hook that enforces validation.

## Step 2: Validate

```bash
npm run validate
```

This runs typecheck + lint + test + architecture checks. All output goes to `.validate/*.log` — you only see a pass/fail summary. If anything fails, inspect the log:

```bash
cat .validate/typecheck.log   # or test.log, lint.log, architecture.log
```

A clean `validate` confirms your environment is set up correctly.

## Step 3: Start Firebase Emulators

```bash
npm run emulators
```

This builds the Cloud Functions and starts the Firebase emulator suite:
- **Functions:** http://127.0.0.1:5001
- **Firestore:** http://127.0.0.1:8080
- **Emulator UI:** http://127.0.0.1:4000

Verify the functions are running:

```bash
curl -sf http://127.0.0.1:5001/brad-os/us-central1/devHealth
```

Other emulator modes:

| Command | Behavior |
|---------|----------|
| `npm run emulators` | Persist data across restarts (default) |
| `npm run emulators:fresh` | Start with empty database |
| `npm run emulators:seed` | Load seed data from `seed-data/` |

## Step 4: Build & Run iOS App

Generate the Xcode project, build for the simulator, and launch:

```bash
# Generate project from project.yml
cd ios/BradOS && xcodegen generate && cd ../..

# Build for simulator
xcodebuild -project ios/BradOS/BradOS.xcodeproj \
  -scheme BradOS \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -derivedDataPath ~/.cache/brad-os-derived-data \
  -skipPackagePluginValidation \
  build

# Install and launch on booted simulator
xcrun simctl install booted ~/.cache/brad-os-derived-data/Build/Products/Debug-iphonesimulator/BradOS.app
xcrun simctl launch booted com.bradcarter.brad-os
```

**Notes:**
- Do NOT pass `-sdk iphonesimulator` — it breaks the watchOS companion build.
- `-skipPackagePluginValidation` is required for the SwiftLint SPM build plugin.
- SwiftLint runs automatically during `xcodebuild build` — a successful build means zero lint errors.

## You're Done!

At this point you should have:
- ✅ All validation checks passing
- ✅ Firebase emulators running with a health endpoint responding
- ✅ The iOS app running in the simulator and talking to local emulators

## Next Steps

- **[CLAUDE.md](../../CLAUDE.md)** — Project rules, worktree workflow, validation commands
- **[iOS Build and Run](ios-build-and-run.md)** — Detailed iOS build commands and exploratory testing
- **[Debugging Cloud Functions](debugging-cloud-functions.md)** — Troubleshooting endpoints
- **[Debug Telemetry](debug-telemetry.md)** — OpenTelemetry traces for iOS debugging
- **[Conventions](../conventions/)** — TypeScript, iOS/Swift, API, and testing conventions
```

### 2. `README.md` (MODIFY)

Add a quickstart link in the Development section. Replace the existing `## Development` section:

**Current** (lines 51–59):
```markdown
## Development

```bash
npm install              # Install dependencies
npm run dev              # Start API server (port 3001)
npm run build            # Build all packages
npm run typecheck        # TypeScript compilation
npm run lint             # ESLint checks
npm run test             # Unit tests
```
```

**Replace with:**
```markdown
## Development

See **[Local Dev Quickstart](docs/guides/local-dev-quickstart.md)** for the full 5-minute bootstrap flow.

```bash
npm install              # Install dependencies (also sets up git hooks)
npm run validate         # Full check: typecheck + lint + test + architecture
npm run emulators        # Start Firebase emulators (port 5001)
npm run build            # Build Cloud Functions
npm run typecheck        # TypeScript compilation
npm run lint             # ESLint checks
npm run test             # Unit tests
```
```

Key changes:
- Add link to the quickstart guide at the top of the section
- Replace stale `npm run dev` with `npm run emulators` (they're the same script, but `emulators` is the real name)
- Add `npm run validate` (the primary validation command)
- Fix `npm run build` description (builds Cloud Functions, not "all packages")
- Add note about git hooks to `npm install`

### 3. `CLAUDE.md` (MODIFY)

Add a quickstart link in the `## Guides` section. After the last guide entry (Debug Telemetry), add:

**Current** (lines 136–140):
```markdown
## Guides (see docs/guides/)

- **[Debugging Cloud Functions](docs/guides/debugging-cloud-functions.md)** — Ordered checklist: rewrite paths, deployment state, App Check
- **[iOS Build and Run](docs/guides/ios-build-and-run.md)** — xcodebuild commands, simulator setup, SwiftLint via build, exploratory testing
- **[Progressive Overload](docs/guides/progressive-overload.md)** — Business logic for workout progression, data architecture
- **[Debug Telemetry](docs/guides/debug-telemetry.md)** — `npm run otel:start`, query `.otel/traces.jsonl` and `.otel/logs.jsonl` with Grep for structured iOS debugging
```

**Replace with:**
```markdown
## Guides (see docs/guides/)

- **[Local Dev Quickstart](docs/guides/local-dev-quickstart.md)** — 5-minute bootstrap: install → validate → emulators → iOS build
- **[Debugging Cloud Functions](docs/guides/debugging-cloud-functions.md)** — Ordered checklist: rewrite paths, deployment state, App Check
- **[iOS Build and Run](docs/guides/ios-build-and-run.md)** — xcodebuild commands, simulator setup, SwiftLint via build, exploratory testing
- **[Progressive Overload](docs/guides/progressive-overload.md)** — Business logic for workout progression, data architecture
- **[Debug Telemetry](docs/guides/debug-telemetry.md)** — `npm run otel:start`, query `.otel/traces.jsonl` and `.otel/logs.jsonl` with Grep for structured iOS debugging
```

The quickstart is listed first because it's the entry point for new developers/agents.

---

## Tests

This is a documentation-only change — no application code is modified. No vitest unit tests are needed.

**Verify no existing tests break** by running `npm run validate` after making changes. The architecture linter checks for broken internal references in some cases, so confirm it passes.

**Manual link verification** (in QA below) replaces automated tests for this change.

---

## QA

### 1. Validate the build still passes
```bash
npm run validate
# All checks should pass — this is a docs-only change
```

### 2. Verify all internal links in the new guide resolve
Check that every relative link in `docs/guides/local-dev-quickstart.md` points to a real file:
```bash
# These files must exist:
ls docs/guides/ios-build-and-run.md
ls docs/guides/debugging-cloud-functions.md
ls docs/guides/debug-telemetry.md
ls docs/conventions/
ls CLAUDE.md
```

### 3. Verify the README link resolves
```bash
# From the repo root, this file must exist:
ls docs/guides/local-dev-quickstart.md
```

### 4. Verify the CLAUDE.md link resolves
```bash
# Same file, same check — already confirmed above
ls docs/guides/local-dev-quickstart.md
```

### 5. Verify commands in the guide are accurate
Cross-check each command in the quickstart against the actual project config:
- `npm run validate` — exists in `package.json` ✓
- `npm run emulators` — exists in `package.json` ✓
- `npm run emulators:fresh` — exists in `package.json` ✓
- `npm run emulators:seed` — exists in `package.json` ✓
- `xcodebuild -project ios/BradOS/BradOS.xcodeproj -scheme BradOS ...` — matches `docs/guides/ios-build-and-run.md` ✓
- `xcrun simctl install booted ...` — matches `docs/guides/ios-build-and-run.md` ✓
- Port numbers (5001, 8080, 4000) — match `firebase.json` emulator config ✓
- Bundle ID `com.bradcarter.brad-os` — matches `docs/conventions/ios-swift.md` ✓

### 6. Diff review
```bash
git diff main --stat
# Expected: 3 files changed (1 new, 2 modified)
#   docs/guides/local-dev-quickstart.md (new)
#   README.md (modified)
#   CLAUDE.md (modified)

git diff main
# Review every changed line
```

---

## Conventions

1. **CLAUDE.md — Worktree workflow**: Make all changes in a git worktree, not directly on main.
2. **CLAUDE.md — Validation**: Run `npm run validate` before committing.
3. **CLAUDE.md — Subagent usage**: Run validation in a subagent to conserve context.
4. **CLAUDE.md — Self-review**: `git diff main` to review every changed line before committing.
5. **CLAUDE.md — Agent legibility**: Push context into the repo (docs) rather than leaving it in chat. This guide directly serves that principle.
6. **CLAUDE.md — QA**: Exercise what you built — verify links resolve, commands are accurate, and the guide matches reality.
