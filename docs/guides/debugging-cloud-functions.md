# Debugging the Cloud Run API and legacy Functions

Normal iOS/API traffic reaches one Cloud Run service through Firebase Hosting:

```text
/api/** -> brad-os-api (us-central1, pinned revision)
```

The old 45 Firebase Functions remain deployed for rollback. `/debug` and `/debug/**`
continue to target `devMealplanDebug`.

## Ordered checklist

1. **Check the Hosting target.** `firebase.json` must contain one pinned `/api/**` Cloud Run
   rewrite to `brad-os-api`. A Hosting HTML 404 usually means routing or release state.
2. **Check the pinned Cloud Run revision.** Confirm the tagged revision is ready and that
   `/healthz` succeeds at its direct candidate URL.
3. **Check the request environment.** The simulator uses `/api/dev`; a physical phone uses
   `/api/prod`. Both are handled concurrently by the same process.
4. **Check Cloud Run logs.** Filter by service `brad-os-api` and revision before changing
   code or App Check configuration.
5. **Check App Check.** A raw request to a protected route should reach Cloud Run and return
   `APP_CHECK_MISSING`. If another protected API request succeeds on the same device, App
   Check is not the likely cause.
6. **Check the old Functions only for rollback traffic or `/debug`.** Their presence does
   not mean normal `/api/**` traffic still reaches them.

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

That command deploys Hosting only. It must not be replaced by a combined Functions deploy.

## Rollback

If live routing is unhealthy, restore the prior Hosting configuration. Do not rebuild or
delete anything during the incident. See [Cloud Run rollback](../ops/cloud-run-rollback.md).
