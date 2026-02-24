# Local Dev Quickstart

Get brad-os running locally in ~5 minutes: install dependencies, validate the build, start emulators, and run the iOS app on a simulator.

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 22.x (pinned in `.nvmrc`) | `nvm install` (reads `.nvmrc`) or `brew install node@22` |
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
