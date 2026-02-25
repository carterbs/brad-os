# Isolated QA Loop

Run a fully isolated local loop for a specific QA session so multiple agents do not share:
- Firebase emulator ports/data
- iOS simulator instance
- OTel collector/files

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
- Starts isolated environment (Firebase + OTel + simulator lease)
- Builds iOS app
- Installs + launches app
- Runs basic health check

The environment startup step (`advanced:qa:env:start`) does:
- Builds functions
- Starts Firebase emulators on session-specific ports with session-specific import/export data
- Starts OTel collector on a session-specific port and writes under `/tmp/brad-os-qa/sessions/<id>/otel/`
- Leases/boots an existing host simulator
- Injects simulator env vars:
  - `BRAD_OS_API_URL=http://127.0.0.1:<hosting-port>/api/dev`
  - `BRAD_OS_OTEL_BASE_URL=http://127.0.0.1:<otel-port>`

State/logs are saved to:
- `/tmp/brad-os-qa/sessions/<id>/state.env`
- `/tmp/brad-os-qa/sessions/<id>/logs/firebase.log`
- `/tmp/brad-os-qa/sessions/<id>/logs/otel.log`

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
# Clear previous data + telemetry for this session first
npm run qa:start -- --id alice --fresh

# Skip one subsystem if you already manage it separately
npm run advanced:qa:env:start -- --id alice --no-firebase
npm run advanced:qa:env:start -- --id alice --no-otel
npm run advanced:qa:env:start -- --id alice --no-simulator
```
