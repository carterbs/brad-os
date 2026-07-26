# Cloud Run API rollback

The pre-migration source commit is:

```text
0c7db7f20ba84cec6a416087b55b6331d016e888
```

All 45 Firebase Functions must remain deployed until a separate, explicitly authorized
retirement project. They are the rollback target.

## Trigger

Roll back when the live Hosting path has persistent API failures, App Check regressions,
dev/prod namespace leakage, or unacceptable cold-launch behavior that cannot be corrected
immediately.

## Restore the previous Hosting configuration

1. Close the iOS app.
2. Save the current Cloud Run revision and image digest for diagnosis.
3. Materialize `firebase.json` from the pre-migration commit into a temporary file.
4. Deploy **Hosting only** with that configuration and project `brad-os`.
5. Verify physical-phone `/api/prod/health`, simulator `/api/dev/health`, and one protected
   read in each environment.

Example:

```bash
git show 0c7db7f20ba84cec6a416087b55b6331d016e888:firebase.json > /tmp/brad-os-firebase-legacy.json
firebase deploy --project brad-os --only hosting --config /tmp/brad-os-firebase-legacy.json
```

Do not run `firebase deploy --only functions`, delete the Cloud Run service, or remove the
Cloud Tasks queue during an incident rollback.

## Strava tasks

The legacy Strava Function remains the public webhook target after the Hosting rollback.
Pause the `brad-os-strava` queue only if the Cloud Run worker is producing harmful or
non-idempotent failures. Otherwise let already-created tasks retry while the candidate is
diagnosed.

## Data

No database schema or datastore changes are part of this migration. Both runtimes use the
same Firestore data and the same `dev_` versus production namespace rules, so there is no
database rollback.
