# Isolated QA Loop

Run a port- and device-isolated local loop for a specific QA session so multiple agents
do not share:

- standalone API ports/processes
- iOS simulator instances
- OTel collector ports/files

The application database is deliberately shared: every interactive session uses the
real `brad-os` `dev_*` Firestore collections. Use the automated integration command when
tests require disposable data.

`--fresh` only clears the selected session's local logs and telemetry. It never clears,
resets, or isolates the shared development Firestore data.

The simulator coordination is done via a lease pool:

- `qa:start` (default one-command flow) leases one available iOS simulator from the host's existing device list.
- Leases are tracked in `/tmp/brad-os-qa/device-locks/<udid>.lock` (shared across worktrees).
- Another session cannot claim the same simulator until `qa:stop` releases the lock.
- No new simulator clones are created by default.

## Start

```bash
npm run qa:start
```

Choose a specific simulator by name fragment or UDID:

```bash
npm run qa:start -- --id alice --device \"iPhone 17\"
```

Default `qa:start` command:

- Starts the loopback standalone API, OTel, and a simulator lease
- Builds iOS app
- Installs + launches app
- Runs basic health check

The environment startup step (`advanced:qa:env:start`) does:

- Builds the unified API and starts it at a session-specific loopback port
- Mounts only `/api/dev` and connects to real `brad-os` `dev_*` Firestore collections
- Keeps App Check enabled; the simulator must use a registered debug token
- Loads optional OpenAI/Strava secrets from the environment or Secret Manager
- Starts OTel collector on a session-specific port and writes under `/tmp/brad-os-qa/sessions/<id>/otel/`
- Leases/boots an existing host simulator
- Injects simulator env vars:
  - `BRAD_OS_API_URL=http://127.0.0.1:<api-port>/api/dev`
  - `BRAD_OS_OTEL_BASE_URL=http://127.0.0.1:<otel-port>`

State/logs are saved to:

- `/tmp/brad-os-qa/sessions/<id>/state.env`
- `/tmp/brad-os-qa/sessions/<id>/logs/api.log`
- `/tmp/brad-os-qa/sessions/<id>/logs/otel.log`

The state file records `API_PORT`, `API_LOG`, `API_PID_FILE`, `OTEL_PORT`,
`OTEL_LOG`, and `OTEL_PID_FILE` alongside simulator/session metadata.

Override the shared root if needed:

```bash
QA_STATE_ROOT=/tmp/my-custom-qa-root npm run qa:start -- --id alice
```

## Build + Launch App

Reusable commands:

```bash
npm run qa:build  -- --id alice
npm run qa:launch -- --id alice
```

One-command end-to-end sweep:

```bash
npm run qa:sweep -- --id alice --fresh
```

Advanced environment-only startup (no build/launch):

```bash
npm run advanced:qa:env:start -- --id alice
```

## Stop

```bash
npm run qa:stop -- --id alice
```

Optional simulator shutdown:

```bash
npm run qa:stop -- --id alice --shutdown-simulator
```

## Useful Options

```bash
# Clear previous logs + telemetry for this session (not Firestore data)
npm run qa:start -- --id alice --fresh

# Skip one subsystem if you already manage it separately
npm run advanced:qa:env:start -- --id alice --no-api
npm run advanced:qa:env:start -- --id alice --no-otel
npm run advanced:qa:env:start -- --id alice --no-simulator
```

## Disposable Integration Data

```bash
npm run test:integration:emulator
```

This separate workflow starts the same standalone API against a fresh Firestore emulator,
enables the tightly guarded test-only App Check bypass, runs the suite, and tears both
processes down. It does not start Functions or Hosting emulators and cannot write to the
real development database. Firebase CLI may start its local UI and coordination
companions alongside Firestore; they are also torn down by the runner.
