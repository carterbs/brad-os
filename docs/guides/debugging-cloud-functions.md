# Debugging the Cloud Run API

Normal iOS/API traffic reaches one Cloud Run service through Firebase Hosting:

```text
/api/** -> brad-os-api (us-central1, pinned revision)
```

No Firebase Functions are deployed in production. Local QA can still use Firebase
Functions emulator adapters, but `/debug` is local-only and is never routed by production
Hosting.

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
6. **Separate local emulator failures from production failures.** The local Functions
   emulator adapters are development infrastructure only; their state and logs do not
   describe the deployed Cloud Run service.

## App Check debug token registration

Simulator debug tokens change when a simulator is erased or recreated:

1. Launch with `xcrun simctl launch --console <bundle-id>`.
2. Find the `[AppCheckCore] App Check debug token` value.
3. Register it in Firebase Console under App Check > Apps > Manage debug tokens.

Never enable `APP_CHECK_BYPASS` in a production container. The standalone runtime permits
it only when `NODE_ENV` is not production and `FIRESTORE_EMULATOR_HOST` is set.

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
