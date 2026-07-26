---
date: 2026-07-26
researcher: codex
git_commit: c07a5eaefc0bd49b0bad54d957ead0996315a50a
branch: codex/retire-cloud-functions
topic: Firebase Cloud Functions retirement safety audit
tags: [cloud-run, firebase, deployment, operations]
status: complete
---

# Research Question

Which deployed Firebase Cloud Functions can be removed after the BradOS API
cutover to Cloud Run, and what dependencies must be migrated or retained?

# Summary

The project had 45 active second-generation HTTP Functions in `us-central1`:
22 production/dev route pairs plus the dev-only meal-plan debug page. There are
no scheduled, event-driven, Firestore-triggered, or other background Functions.
The iOS app and CLI use Firebase Hosting's `/api/**` front door, which is already
pinned to the unified `brad-os-api` Cloud Run service. A live phone session
confirmed that all observed BradOS requests reached Cloud Run revision
`brad-os-api-00005-jac`, returned `200`, and did not invoke a legacy Function.

Two remaining dependencies had to be addressed before deletion. Firebase
Hosting still routed `/debug` and `/debug/**` to `devMealplanDebug`; those
obsolete rewrites must be removed with a Hosting-only deployment. Separately,
the live Strava webhook subscription still called `prodStrava` directly at its
`cloudfunctions.net` URL. On 2026-07-26 that subscription was successfully
recreated at `https://brad-os.web.app/api/prod/strava/webhook`, which resolves
through Hosting to Cloud Run.

The Function adapter source remains useful for local Firebase emulator QA and
integration tests. It does not need to be removed to retire the deployed
instances. The safer low-refactor posture is to retain that local compatibility
layer while removing public Function rewrites and deployment entry points, and
to make Firebase's Functions predeploy hook fail with a clear retirement
message. Firestore, App Check, Secret Manager, Firebase Hosting, Cloud Tasks,
service accounts, and the Cloud Run service are shared production
infrastructure and are explicitly outside the deletion scope.

After those safeguards and route migrations were validated, all 45 named
Functions were deleted successfully. The post-delete Function inventory was
empty, while Cloud Run, Hosting, Firestore-backed API behavior, App Check, the
Strava subscription, and the Cloud Tasks queue remained healthy.

# Detailed Findings

## Deployed Function inventory

`packages/functions/src/index.ts` exports only HTTP `onRequest` adapters. Each
normal endpoint family has `dev` and `prod` wrappers around the same Express
router, while `devMealplanDebug` is the single extra export. Dev/prod data
separation remains implemented through prefixed Firestore collections.

The exact deployed set observed before retirement was:

- Dev: `devBarcodes`, `devCalendar`, `devCycling`, `devCyclingCoach`,
  `devExercises`, `devGuidedMeditations`, `devHealth`, `devHealthSync`,
  `devIngredients`, `devMealplanDebug`, `devMealplans`, `devMeals`,
  `devMeditationSessions`, `devMesocycles`, `devPlans`, `devRecipes`,
  `devStrava`, `devStretchSessions`, `devStretches`, `devTodayCoach`, `devTts`,
  `devWorkoutSets`, and `devWorkouts`.
- Prod: `prodBarcodes`, `prodCalendar`, `prodCycling`, `prodCyclingCoach`,
  `prodExercises`, `prodGuidedMeditations`, `prodHealth`, `prodHealthSync`,
  `prodIngredients`, `prodMealplans`, `prodMeals`, `prodMeditationSessions`,
  `prodMesocycles`, `prodPlans`, `prodRecipes`, `prodStrava`,
  `prodStretchSessions`, `prodStretches`, `prodTodayCoach`, `prodTts`,
  `prodWorkoutSets`, and `prodWorkouts`.

## Production traffic

The iOS client uses `https://brad-os.web.app/api/prod` on a physical device and
the corresponding `/api/dev` path for simulator development. Firebase Hosting
maps `/api/**` to Cloud Run with `pinTag: true`; the unified Cloud Run app mounts
the same API manifest under both environments.

A live authenticated phone walkthrough on 2026-07-26 produced 16 BradOS
requests across meals, Today Coach, health, calendar, and workout reads. All 16
returned `200` from revision `brad-os-api-00005-jac`; no Function invocation or
Cloud Run warning/error was observed. Workout mutation routes were not exercised
in that phone session, but their handlers use the same unified router and passed
the repository's automated contract/integration validation during the cutover.

## Remaining dependencies

The public `/debug` rewrite was the only Firebase Hosting dependency on a
Function. The debug HTML itself calls the protected dev meal-plan API without an
App Check token, no product client calls it, and Cloud Run intentionally returns
`404` for `/debug`. Removing the two debug rewrites therefore removes an
obsolete surface rather than product functionality.

The live Strava push subscription was an external dependency not represented by
repository call-site searches. It initially targeted
`https://us-central1-brad-os.cloudfunctions.net/prodStrava/webhook`. The Hosting
and Cloud Run replacement endpoint passed Strava's verification challenge, then
subscription `329260` was replaced by subscription `362777` targeting
`https://brad-os.web.app/api/prod/strava/webhook`.

## Deletion boundary and recovery

Only the 45 named deployed Functions should be deleted. Do not delete:

- the `brad-os-api` Cloud Run service or its known-good revisions;
- Firebase Hosting releases or the `/api/**` rewrite;
- Firestore data or indexes;
- App Check configuration;
- Secret Manager secrets;
- the `brad-os-strava` Cloud Tasks queue or its service accounts; or
- source/container artifact repositories as part of this retirement.

The deleted deployments can be recreated from Git only by intentionally
removing the retirement guard and deploying the retained emulator adapters.
Normal production rollback is now a Cloud Run revision plus its corresponding
pinned Firebase Hosting release, not a Function redeployment.

## Post-retirement validation

The final live checks on 2026-07-26 showed:

- `gcloud functions list` returned an empty inventory for `us-central1`;
- Cloud Run still contained the ready `brad-os-api` service at revision
  `brad-os-api-00005-jac`, with 100% service traffic and the Hosting-pinned tag
  on that revision;
- `/api/dev/health` and `/api/prod/health` returned `200` with
  `runtime: "cloud-run"`;
- a protected route without App Check returned the expected
  `401 APP_CHECK_MISSING`, confirming that requests still reached the API and
  failed closed;
- the former direct `prodHealth` Function URL returned `404`;
- Strava subscription `362777` still targeted the canonical Hosting URL and its
  verification challenge returned `200`;
- the `brad-os-strava` queue remained `RUNNING` with no pending tasks; and
- Cloud Run request logs showed the expected routes on revision
  `brad-os-api-00005-jac`, with no error-severity entries during the cutover
  window.

# Code References

| File | Description |
|------|-------------|
| `firebase.json` | Local emulator configuration and the production Hosting rewrite |
| `packages/functions/src/index.ts` | Local Firebase emulator HTTP adapters |
| `packages/functions/src/cloud-run-app.ts` | Unified `/api/dev` and `/api/prod` Cloud Run app |
| `packages/functions/src/api-router.ts` | Shared endpoint-manifest router mounting |
| `packages/functions/src/handlers/strava-webhook.ts` | Public Strava verification/event routes and protected token route |
| `ios/BradOS/BradOS/Services/APIConfiguration.swift` | Physical-device, simulator, and emulator API base URLs |
| `scripts/rewrite-utils.ts` | Canonical Firebase Hosting rewrite generation |
| `tools/arch-lint/src/checks/firebase_routes.rs` | CI enforcement for Hosting and router coverage |

# Architecture Insights

Firebase Hosting is the stable public API address and Cloud Run is the sole
production compute runtime. Firestore and other managed GCP services remain
unchanged. Firebase Functions survives only as a local emulator adapter, which
keeps the existing development loop intact without carrying 45 production
deployments or a Function-based rollback path.

External webhook registrations must be audited separately from repository call
sites. The Strava subscription demonstrated that code and Hosting traffic alone
were insufficient evidence for safe deletion.

# Historical Context

BradOS originally exposed one Firebase Function per API route family. The Cloud
Run consolidation introduced a shared Express app and pinned Hosting rewrite so
the iOS URL did not change. This retirement removes the old deployments after
that cutover while deliberately avoiding a second refactor of local emulator
tooling.

# Open Questions

- Artifact Registry and Cloud Storage objects created by historical Function
  deployments remain for possible later cost/retention review; deleting them is
  not required to retire active Functions.
