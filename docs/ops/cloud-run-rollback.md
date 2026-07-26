# Cloud Run API rollback

Production has no Firebase Functions rollback target. A rollback restores both:

1. the last known-good Cloud Run revision for direct service traffic and Cloud Tasks;
2. the matching Firebase Hosting release, which is pinned to that revision by
   `pinTag: true`.

## Required retained artifacts

For every live deployment, record and retain:

- the Firebase Hosting release/version ID;
- the Cloud Run revision name and immutable image digest;
- the validated service configuration and secret version references;
- the Git commit used to build the image.

Do not remove the last known-good Hosting release, revision, required traffic tag, or
Artifact Registry image until a newer rollback target has passed a rollback drill.

## Trigger

Roll back when the live Hosting path has persistent API failures, App Check regressions,
dev/prod namespace leakage, or unacceptable cold-launch behavior that cannot be corrected
immediately.

## Restore the known-good revision and Hosting release

1. Close the iOS app.
2. Record the current Cloud Run revision, image digest, Hosting release ID, and Cloud
   Tasks queue state for diagnosis.
3. Confirm the exact last known-good revision and its matching Hosting release.
4. Send direct Cloud Run service traffic to that revision:

   ```bash
   gcloud run services update-traffic brad-os-api \
     --project=brad-os \
     --region=us-central1 \
     --to-revisions=KNOWN_GOOD_REVISION=100
   ```

5. In Firebase Console, open **Hosting > Release history** and roll back the live channel
   to the matching known-good release. Because the rewrite uses `pinTag: true`, the
   Hosting release restores its pinned Cloud Run revision.
6. Verify:
   - the direct Cloud Run `/healthz`;
   - physical-phone `/api/prod/health`;
   - simulator `/api/dev/health`;
   - one protected read in each environment;
   - the Strava verification challenge at
     `https://brad-os.web.app/api/prod/strava/webhook`;
   - the active Strava subscription still reports that exact `callback_url`;
   - the Cloud Tasks worker path.
7. Inspect Cloud Run, App Check, Hosting, and Cloud Tasks logs before reopening normal use.

Do not redeploy Firebase Functions, delete the Cloud Run service, remove the Cloud Tasks
queue, or clean up revisions/images during an incident rollback.

## Strava tasks

The canonical Strava callback remains
`https://brad-os.web.app/api/prod/strava/webhook`, so a revision/Hosting rollback must not
recreate the subscription. Never point it at a legacy Function, tagged candidate, or
direct `run.app` URL. Pause the `brad-os-strava` queue only if the worker is producing
harmful or non-idempotent failures. Otherwise let already-created tasks retry against the
restored service revision.

## Data

Cloud Run revisions use the same Firestore schema and the same `dev_` versus production
namespace rules. No database rollback is normally required. Restore from a managed
Firestore export only for demonstrated data corruption.

## If the retained revision is unavailable

Rebuild from the recorded Git commit through the normal Cloud Run candidate workflow,
validate it, then pin a new Hosting release. Do not recover by redeploying legacy
Functions.
