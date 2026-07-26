# Local Dev Quickstart

Get brad-os running locally in ~5 minutes: install dependencies, validate the build,
then run one command to start the simulator, standalone API, OTel collector, and app.
Interactive QA uses the real Firestore `dev_*` collections.

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 22.x (pinned in `.nvmrc`) | `nvm install` (reads `.nvmrc`) or `brew install node@22` |
| npm | 10.x+ | Comes with Node |
| Google Cloud CLI | Latest | [Install `gcloud`](https://cloud.google.com/sdk/docs/install) |
| Firebase CLI | Latest | `npm install -g firebase-tools` (automated integration tests only) |
| Xcode | 16+ | Mac App Store |
| XcodeGen | Latest | `brew install xcodegen` |

Verify:

```bash
node -v          # v22.x
gcloud --version
firebase --version
xcodegen --version
xcodebuild -version
```

Or run the automated check:

```bash
npm run doctor
```

Authenticate both the local service and the optional feature-secret lookup:

```bash
gcloud auth login
gcloud auth application-default login
```

The QA harness always targets the `brad-os` project explicitly. It reads Firestore with
Application Default Credentials and, when available, loads OpenAI and Strava secrets from
Secret Manager without printing them.

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
- Builds and starts the standalone API on loopback
- Mounts only `/api/dev` and reads/writes the real `brad-os` `dev_*` Firestore collections
- Starts isolated OTel collector
- Builds the iOS app
- Installs and launches the app in simulator

The local API still requires App Check because it uses the real database. Register the
simulator debug token once using the steps in
[Debugging the Cloud Run API](debugging-cloud-run.md#app-check-debug-token-registration).
Never set `APP_CHECK_BYPASS` for this workflow.

QA sessions isolate ports, logs, telemetry, and simulator leases, but they intentionally
share the real development database. `--fresh` clears session logs and telemetry; it does
not reset or isolate Firestore data, so changes from one QA session are visible to others.

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
| `npm run advanced:qa:env:start -- --id <id>` | Start API/OTel/simulator environment only (no app build/launch) |
| `npm run qa:build -- --id <id>` | Build iOS app using an existing QA session |
| `npm run qa:launch -- --id <id>` | Install + launch app using an existing QA session |
| `npm run qa:stop -- --id <id>` | Stop a specific QA session |
| `npm run advanced:qa:env:start -- --id <id> --no-api` | Start a session without the standalone API |
| `npm run advanced:otel:start` | Start OTel collector only |
| `npm run test:integration:container` | Build and smoke-test the production Cloud Run image |
| `npm run deploy:cloud-run -- --plan` | Review the candidate deployment without changing GCP |

### Run integration tests (one command)

```bash
npm run test:integration:emulator
```

This starts a fresh Firestore emulator plus the standalone API, waits for readiness, runs
all integration tests, and tears everything down automatically. It never touches the
shared development database. The Functions and Hosting emulators are not used.

## You're Done!

At this point you should have:

- ✅ All validation checks passing
- ✅ Standalone API + OTel running on loopback
- ✅ The iOS app running in simulator against the real `dev_*` Firestore namespace

## Next Steps

- **[AGENTS.md](../../AGENTS.md)** — Project rules, navigation map
- **[Workflow Rules](../conventions/workflow.md)** — Worktrees, validation, subagents, QA
- **[Isolated QA Loop](isolated-qa-loop.md)** — Session isolation details, device leasing, and advanced options
- **[iOS Build and Run](ios-build-and-run.md)** — Advanced manual build commands and exploratory testing
- **[Debugging the Cloud Run API](debugging-cloud-run.md)** — Production and standalone-local troubleshooting
- **[Deploying Cloud Run](deploying-cloud-run.md)** — Production image, candidate deployment, Hosting cutover, and rollback
- **[Debug Telemetry](debug-telemetry.md)** — Telemetry query patterns and advanced collector controls
- **[Conventions](../conventions/)** — TypeScript, iOS/Swift, API, and testing conventions
