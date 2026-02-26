# Local Dev Quickstart

Get brad-os running locally in ~5 minutes: install dependencies, validate the build, then run one command to start simulator + Firebase + OTel + app.

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

Or run the automated check:

```bash
npm run doctor
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

## Step 3: Start Full Local QA Loop (Recommended)

```bash
npm run qa:start
```

This is the default local app workflow for both humans and agents. It:
- Leases an available iOS simulator for your session
- Starts isolated Firebase emulators
- Starts isolated OTel collector
- Builds the iOS app
- Installs and launches the app in simulator

Optional: choose a stable session ID for repeat runs:

```bash
npm run qa:start -- --id alice
```

Stop the loop when done:

```bash
npm run qa:stop
```

## Step 4: Advanced Controls (Only for Troubleshooting)

Use these when you intentionally need to bypass the default one-command flow:

| Command | Behavior |
|---------|----------|
| `npm run advanced:qa:env:start -- --id <id>` | Start isolated env only (no build/launch) |
| `npm run qa:build -- --id <id>` | Build iOS app using an existing QA session |
| `npm run qa:launch -- --id <id>` | Install + launch app using an existing QA session |
| `npm run qa:stop -- --id <id>` | Stop a specific QA session |
| `npm run advanced:emulators` | Start Firebase emulators only |
| `npm run advanced:otel:start` | Start OTel collector only |

### Run integration tests (one command)

```bash
npm run test:integration:emulator
```

This starts emulators in the background, waits for readiness, runs all integration tests, and tears down automatically. No separate terminal needed.

## You're Done!

At this point you should have:
- ✅ All validation checks passing
- ✅ Isolated Firebase + OTel services running
- ✅ The iOS app running in simulator and talking to local services

## Next Steps

- **[AGENTS.md](../../AGENTS.md)** — Project rules, navigation map
- **[Workflow Rules](../conventions/workflow.md)** — Worktrees, validation, subagents, QA
- **[Isolated QA Loop](isolated-qa-loop.md)** — Session isolation details, device leasing, and advanced options
- **[iOS Build and Run](ios-build-and-run.md)** — Advanced manual build commands and exploratory testing
- **[Debugging Cloud Functions](debugging-cloud-functions.md)** — Troubleshooting endpoints
- **[Debug Telemetry](debug-telemetry.md)** — Telemetry query patterns and advanced collector controls
- **[Conventions](../conventions/)** — TypeScript, iOS/Swift, API, and testing conventions
