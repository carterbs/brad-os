# Debugging the Cloud Run API

Normal iOS/API traffic reaches one Cloud Run service through Firebase Hosting:

```text
/api/** -> brad-os-api (us-central1, pinned revision)
```

No Firebase Functions are deployed or used as local adapters. Interactive QA runs the
same Express service on loopback, mounts only `/api/dev`, and connects to the real
`brad-os` `dev_*` Firestore collections.

## Ordered checklist

1. **Check the Hosting target.** `firebase.json` must contain exactly one pinned `/api/**`
   Cloud Run rewrite to `brad-os-api` and no Function-backed rewrites. A Hosting HTML 404
   usually means routing or release state.
2. **Check the pinned Cloud Run revision.** Confirm the tagged revision is ready and that
   `/api/dev/health` and `/api/prod/health` succeed at its direct candidate
   URL. (`/healthz` remains the internal container startup probe.)
3. **Check the request environment.** The simulator uses `/api/dev`; a physical phone uses
   `/api/prod`. Both are handled concurrently by the same process.
4. **Check Cloud Run logs.** Filter by service `brad-os-api` and revision before changing
   code or App Check configuration.
5. **Check App Check.** A raw request to a protected route should reach Cloud Run and return
   `APP_CHECK_MISSING`. If another protected API request succeeds on the same device, App
   Check is not the likely cause.
6. **Separate standalone-local failures from production failures.** Inspect the session's
   `logs/api.log` and its direct `http://127.0.0.1:<api-port>/api/dev/health` route.
   Local logs describe the same application code but not the deployed revision, network,
   service account, or production data namespace.
7. **Confirm the local data boundary.** Interactive QA is allowed to mutate `dev_*`
   collections. It must never mount `/api/prod`, set `FIRESTORE_EMULATOR_HOST`, or enable
   `APP_CHECK_BYPASS`.

## App Check debug token registration

Simulator debug tokens change when a simulator is erased or recreated:

1. Launch with `xcrun simctl launch --console <bundle-id>`.
2. Find the `[AppCheckCore] App Check debug token` value.
3. Register it in Firebase Console under App Check > Apps > Manage debug tokens.

The custom loopback API URL still sends App Check because it uses the real database.
Never enable `APP_CHECK_BYPASS` in interactive QA or a production container. The
standalone runtime permits that bypass only in explicit local-development-only mode,
with a loopback `FIRESTORE_EMULATOR_HOST`, and when `NODE_ENV` is not production. That
combination is reserved for automated integration tests.

## Local service troubleshooting

Run `npm run qa:start -- --id <id>` and inspect:

- `/tmp/brad-os-qa/sessions/<id>/state.env` for `API_PORT`, `API_LOG`, and
  `API_PID_FILE`;
- `/tmp/brad-os-qa/sessions/<id>/logs/api.log` for startup and request errors;
- `http://127.0.0.1:<API_PORT>/api/dev/health` for readiness.

The harness uses Application Default Credentials for Firestore. If startup reports an
authentication problem, refresh them with `gcloud auth application-default login`.
OpenAI and Strava routes also need their corresponding secrets; the harness tries the
current environment first and then Secret Manager, warning without printing values when
an optional secret is unavailable.

Incoming Strava webhooks cannot reach a loopback server. Validate webhook delivery on a
tagged Cloud Run candidate or the live Hosting URL instead.

## Automated integration tests

`npm run test:integration:emulator` starts the standalone API against a fresh Firestore
emulator. It uses no Functions or Hosting emulator and tears down its data automatically.
If this workflow fails while interactive QA succeeds, inspect the integration runner's
API and Firestore logs rather than the shared `dev_*` collections.

## Candidate versus live URL

The deployment command prints a tagged candidate URL. Test that URL before Hosting changes.
Firebase Hosting remains a separate, explicit cutover:

```bash
npm run deploy:hosting
```

That command deploys Hosting only and pins `/api/**` to the validated Cloud Run revision.
No Functions deployment participates.

## Rollback

If live routing is unhealthy, restore the last known-good Cloud Run revision and its
pinned Hosting release. Do not redeploy Functions or delete infrastructure during the
incident. See [Cloud Run rollback](../ops/cloud-run-rollback.md).
