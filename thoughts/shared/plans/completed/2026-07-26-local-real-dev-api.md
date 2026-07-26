# Local Standalone API Development

**Status:** Implementation complete on 2026-07-26. Repository, integration,
container, lifecycle, and local route-surface validation passed. The final
real-Firestore simulator smoke requires two one-time host prerequisites noted
in the validation report.

## Goal

Make the production-shaped Express service the only local API runtime:

- Interactive iOS QA runs the standalone API on loopback against the real Firebase project and the isolated `dev_*` Firestore collections.
- Automated integration tests run the same standalone API against a disposable Firestore emulator.
- The local runtime exposes only `/api/dev`; `/api/prod` and internal task routes remain unavailable.
- Firebase Functions and Hosting emulators are no longer part of either workflow.

This keeps local iOS testing close to the deployed Cloud Run service while retaining disposable test data for automated tests.

## Baseline Before Implementation

- `qa:start` launches Functions, Firestore, and Hosting emulators and points iOS at the Hosting emulator.
- Integration tests call generated Cloud Function URLs directly.
- The standalone server mounts both development and production routes and binds all interfaces.
- iOS infers “emulator” from a localhost hostname, so it suppresses App Check even when localhost is proxying real Firestore.

## Scope

### In scope

- Add an explicit, fail-safe local-development runtime mode.
- Decouple iOS App Check behavior from hostname detection.
- Point interactive simulator QA directly at the local standalone API and real `dev_*` Firestore data.
- Point automated integration tests at the local standalone API and a Firestore-only emulator.
- Remove obsolete Functions/Hosting emulator adapters and orchestration.
- Update local development, testing, and deployment documentation.
- Validate the whole repository and perform an end-to-end simulator smoke test.

### Out of scope

- Firestore-to-SQL migration.
- Changing deployed Cloud Run routes or production traffic.
- Deleting deployed infrastructure.
- Receiving Strava webhooks on localhost.
- Bypassing App Check while connected to real Firestore.

## Safety Invariants

1. Local interactive mode binds `127.0.0.1`, exposes `/api/dev` only, and requires valid App Check.
2. App Check bypass is permitted only in local-development-only mode, with a loopback `FIRESTORE_EMULATOR_HOST`, and when production mode is off.
3. Automated tests use a disposable Firestore emulator and never write to shared `dev_*` data.
4. Cloud Run keeps its existing `0.0.0.0` binding and both `/api/dev` and `/api/prod` routes.
5. No secret value is written to logs or repository files.

## Implementation

### Phase 1: Runtime and iOS safety

- Extend runtime configuration with an explicit local-development-only mode and bind host.
- Teach the app factory to omit production and internal-task routes in that mode.
- Start the standalone service with those settings from the server entry point.
- Remove iOS hostname-based App Check suppression so custom loopback URLs still send App Check.
- Add TypeScript and Swift tests for route exposure, binding, and App Check behavior.

### Phase 2: Interactive simulator QA

- Replace Firebase emulator startup in the Rust QA orchestrator with standalone API startup.
- Use the real `brad-os` project through Application Default Credentials.
- Resolve feature secrets from existing environment variables or Secret Manager without printing them.
- Verify Application Default Credentials can read the development namespace, wait on `/api/dev/health`, and launch iOS with that API base URL.
- Update QA state, logs, shutdown behavior, and unit tests to reflect the standalone API.

### Phase 3: Disposable integration tests

- Start only the Firestore emulator.
- Start the same standalone API with `FIRESTORE_EMULATOR_HOST` and the guarded App Check bypass.
- Give tests one configurable `/api/dev` base URL.
- Replace direct Cloud Function URLs with REST routes.
- Ensure both child processes are cleaned up on success, failure, and interruption.

### Phase 4: Cleanup and documentation

- Remove the Firebase Functions export adapter and emulator-only wiring that no workflow uses.
- Remove Functions/Hosting emulator configuration while retaining Firestore rules/indexes and the production Hosting-to-Cloud-Run rewrite.
- Update the quickstart, QA, debugging, architecture, and deployment documentation.
- Keep the existing Cloud Run deployment workflow unchanged except where documentation is stale.

## Validation

### Automated

- Run targeted TypeScript, Swift, and Rust tests while implementing.
- Run the Firestore-emulator integration suite through the new standalone API.
- Run `npm run validate`.
- Verify architecture checks no longer depend on local Cloud Function exports.

### End to end

- Start the default QA workflow.
- Confirm the local API health route succeeds.
- Confirm `/api/prod` and internal-task routes return 404 locally.
- Launch the iOS simulator with a registered App Check debug token.
- Exercise representative Today, meals, and health reads and confirm the local API receives `/api/dev` requests.
- Stop QA and confirm both the API and telemetry processes exit.

## Success Criteria

- `npm run qa:start` no longer launches Firebase emulators and reads/writes real `dev_*` Firestore collections through the standalone API.
- Automated integration tests launch only Firestore emulation plus the standalone API.
- Local interactive requests include App Check; local automated tests use only the guarded emulator bypass.
- Production routes are unavailable in local-development-only mode.
- The old Functions/Hosting emulator adapter and documentation are removed.
- Full validation and end-to-end QA pass.
- The implementation is committed on an isolated branch and merged without including unrelated user changes.

## Validation Report

### Passed

- `npm run validate`
  - Typecheck passed.
  - Lint passed.
  - 105 Vitest files and 1,911 tests passed.
  - Architecture checks passed.
- `npm run test:integration:emulator`
  - The runner built the standalone Express service.
  - Only the Firestore emulator was requested; Firebase's automatically started
    UI, hub, logging, and websocket companions were included in cleanup.
  - 13 integration files and 121 tests passed against `/api/dev`.
  - The API, Firestore emulator, and all companion listeners stopped cleanly.
- Focused Rust lifecycle and contract coverage passed:
  - 92 `dev-cli` library tests.
  - 3 doctor contract tests.
  - 14 QA stop tests.
  - 12 integration-runner process, signal, descendant, and environment-isolation tests.
- `npm run test:integration:container`
  - Built the production image.
  - Verified the non-root user, `/healthz`, both deployed API prefixes, packaged
    prompt assets, and graceful SIGTERM handling.
- Direct local-runtime smoke:
  - Listener was exactly `127.0.0.1:16550`.
  - `/api/dev/health` returned 200.
  - `/api/prod/health` returned 404.
  - `/internal/tasks/dev/ping` returned 404.
  - A protected `/api/dev/meals` request without App Check returned 401.
  - The temporary listener stopped cleanly.
- QA startup with missing credentials failed before spawning API or OTel
  processes and printed the documented
  `gcloud auth application-default login` remediation.
- The Xcode project file passed `plutil -lint`.

### Host prerequisites that prevented the final simulator smoke

- Application Default Credentials are not configured on this Mac. Run
  `gcloud auth application-default login`, then rerun `npm run qa:start` to
  prove a real `dev_*` Firestore read and exercise the iOS UI.
- The local Xcode license has not been accepted. Swift tests, simulator build,
  and simulator launch remain blocked until the user accepts that license.

These are local machine state requirements, not code failures. The QA harness
now detects the missing Firestore credentials before it starts background
services, and the standalone runtime plus every API route was exercised against
the disposable Firestore emulator.
