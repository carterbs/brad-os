# Deploying the BradOS Cloud Run API

The primary API is one Cloud Run service:

| Setting                      | Value                                                                  |
| ---------------------------- | ---------------------------------------------------------------------- |
| Project                      | `brad-os`                                                              |
| Region                       | `us-central1`                                                          |
| Service                      | `brad-os-api`                                                          |
| Artifact Registry repository | `brad-os-api`                                                          |
| Image                        | `us-central1-docker.pkg.dev/brad-os/brad-os-api/brad-os-api:<git-sha>` |
| Runtime service account      | `brad-os-api@brad-os.iam.gserviceaccount.com`                          |
| Cloud Tasks queue            | `brad-os-strava`                                                       |
| Task OIDC service account    | `brad-os-strava-tasks@brad-os.iam.gserviceaccount.com`                 |
| Service/revision maximum     | `1` / `1`                                                              |
| Startup probe                | `/healthz`, every 1s, 1s timeout, 60 failures                          |

The service uses request-based billing, minimum instances `0`, service-level maximum
instances `1`, revision-level maximum instances `1`, concurrency `20`, 1 vCPU, 512 MiB,
and a 180-second request timeout.

Production is Cloud Run-only: no Firebase Functions are deployed. Firebase Functions
emulator adapters remain available for local development, but they are not a production
deployment target.

## Scaling and startup guardrails

The deploy command sets both Cloud Run scaling controls:

- `--max=1` limits the service traffic split;
- `--max-instances=1` limits each new revision, including a no-traffic revision reached
  through its candidate tag.

Cloud Run applies the lesser limit when both controls apply. Both are intentional:
tag-only revisions do not count toward the service-level maximum, so the revision limit
keeps candidate validation from bypassing the one-instance cost guardrail.

The HTTP startup probe uses an initial delay of zero, a one-second period, a one-second
timeout, and a failure threshold of 60. One second is Cloud Run's minimum supported
startup-probe period. This cuts the avoidable readiness-detection delay from as much as
five seconds to about one second while preserving the previous 60-second failure budget.
The deployment readback checks both scaling annotations and every effective probe field,
including Cloud Run defaults that can be omitted from serialized output.

### Remove obsolete traffic tags after validation

After live Hosting is pinned to the validated revision and the rollback audit is
complete, remove obsolete bootstrap and candidate tags. Do not automate this step or
remove a tag still needed for current validation. First list the exact tags:

```bash
gcloud run services describe brad-os-api \
  --project=brad-os \
  --region=us-central1
```

Then remove only the confirmed-obsolete names:

```bash
gcloud run services update-traffic brad-os-api \
  --project=brad-os \
  --region=us-central1 \
  --remove-tags=bootstrap-OLD_SHA,candidate-OLD_SHA
```

This removes the tagged URLs, not the revisions or Artifact Registry images. Keep the
last known-good Hosting release, Cloud Run revision, immutable image digest, and any tag
needed by that release until a newer rollback target has been validated. Removing truly
obsolete tags is important because a tag-only revision is outside the service-level
maximum; the revision-level maximum protects new candidates, while tag removal closes
access to older revisions created before that guardrail.

## Cloud Tasks retry contract

The `brad-os-strava` queue must use this exact configuration:

```bash
gcloud tasks queues update brad-os-strava \
  --project=brad-os \
  --location=us-central1 \
  --max-concurrent-dispatches=1 \
  --max-dispatches-per-second=1 \
  --max-attempts=5 \
  --min-backoff=10s \
  --max-backoff=600s \
  --max-doublings=4 \
  --max-retry-duration=0s \
  --log-sampling-ratio=1
```

For failures that return quickly, five attempts begin at approximately 0, 10, 30,
70, and 150 seconds. The worker's Firestore claim lease is one minute: attempts two
and three cannot duplicate an active claim, attempt four can recover a claim abandoned
by a hard process exit, and attempt five remains available if that recovery attempt
also fails. A caught processing failure explicitly clears its lease, so the next
scheduled delivery can reclaim it immediately.

The zero retry duration is deliberate. The
[Cloud Tasks retry contract](https://cloud.google.com/tasks/docs/reference/rest/v2/projects.locations.queues#RetryConfig)
combines a positive `maxRetryDuration` with `maxAttempts` using an AND condition, which
would allow more than five attempts until both limits were reached. Zero disables the
duration condition, making five attempts the exact execution bound; Cloud Tasks'
task-retention limit remains the outer bound for a task that cannot be dispatched.

Keep the retry policy and claim lease synchronized. Increasing the lease beyond the
fourth-attempt offset can exhaust all five attempts before a hard-crashed claim becomes
recoverable. The one-at-a-time dispatch limit is intentional for this single-user
service and also prevents normal retries from overlapping an in-flight worker request.

Read the queue back after provisioning or updating it:

```bash
gcloud tasks queues describe brad-os-strava \
  --project=brad-os \
  --location=us-central1
```

## Prerequisites

Before deploying, confirm the Artifact Registry repository, both service accounts, Cloud
Tasks queue, IAM grants, and four Secret Manager secrets exist. The deploy command binds
an exact numeric secret version; it deliberately refuses `latest`.

Set the active versions:

```bash
export BRAD_OPENAI_SECRET_VERSION=1
export BRAD_STRAVA_CLIENT_ID_SECRET_VERSION=1
export BRAD_STRAVA_CLIENT_SECRET_VERSION=1
export BRAD_STRAVA_VERIFY_TOKEN_SECRET_VERSION=1
```

Use the actual enabled version numbers from Secret Manager rather than copying these
examples.

The deploy requires a clean, committed worktree. Its image tag is the full Git commit SHA.

## Review without changing GCP

```bash
npm run deploy:cloud-run -- --plan
```

The plan confirms the project, region, immutable image name, scale-to-zero settings, and
candidate-only traffic posture.

## Build and deploy a candidate

```bash
npm run deploy:cloud-run -- --execute
```

The Rust deployment command:

1. sends the `.gcloudignore`-filtered source to Cloud Build;
2. tags the image with the full Git commit;
3. resolves the immutable Artifact Registry digest;
4. deploys a public, no-traffic candidate revision with all runtime settings explicit;
5. reads the service configuration back and rejects drift;
6. checks the candidate revision's public `/api/dev/health` and
   `/api/prod/health` routes with bounded retries;
7. prints the tagged candidate URL and digest.

For the first service creation, the command performs a two-revision bootstrap. Cloud Run
does not allow `--no-traffic` on a brand-new service, so the bootstrap revision receives
the direct Run URL while Firebase Hosting remains unchanged. The command reads that stable
`status.url`, then creates the real no-traffic candidate with both of these variables set
to that exact direct URL:

```text
CLOUD_RUN_SERVICE_URL
STRAVA_TASK_OIDC_AUDIENCE
```

On later deployments, set `BRAD_CLOUD_RUN_SERVICE_URL` to the existing direct service URL
to skip the bootstrap revision:

```bash
export BRAD_CLOUD_RUN_SERVICE_URL=https://YOUR-STABLE-SERVICE-URL.run.app
```

The deployed runtime variables are:

```text
GOOGLE_CLOUD_PROJECT=brad-os
STRAVA_TASK_QUEUE=brad-os-strava
STRAVA_TASK_QUEUE_LOCATION=us-central1
STRAVA_TASK_OIDC_SERVICE_ACCOUNT=brad-os-strava-tasks@brad-os.iam.gserviceaccount.com
CLOUD_RUN_SERVICE_URL=<direct stable run.app URL>
STRAVA_TASK_OIDC_AUDIENCE=<same direct stable run.app URL>
```

The tool never modifies Firebase Hosting. A candidate cannot receive normal iOS traffic
until Hosting is changed separately.

## Validate the Strava verification challenge

The canonical Strava subscription callback is:

```text
https://brad-os.web.app/api/prod/strava/webhook
```

Every active Strava subscription must use that exact Firebase Hosting URL. Do not
register a legacy Function URL, a tagged candidate URL, or the direct `run.app` service
URL as the callback.

After deploying a new candidate, verify its read-only Strava subscription challenge
before shifting traffic. Use the secret version bound to that exact revision, keep the
secret value out of output, and validate only the HTTP status and echoed challenge:

```bash
set -euo pipefail
set +x

export BRAD_CANDIDATE_REVISION='brad-os-api-REPLACE_ME'

brad_candidate_url="$(
  gcloud run services describe brad-os-api \
    --project=brad-os \
    --region=us-central1 \
    --format=json |
    jq -r --arg revision "$BRAD_CANDIDATE_REVISION" \
      'first(.status.traffic[]
       | select(.revisionName == $revision and .tag != null)
       | .url)'
)"
brad_verify_version="$(
  gcloud run revisions describe "$BRAD_CANDIDATE_REVISION" \
    --project=brad-os \
    --region=us-central1 \
    --format=json |
    jq -r \
      '.spec.containers[0].env[]
       | select(.name == "STRAVA_WEBHOOK_VERIFY_TOKEN")
       | .valueFrom.secretKeyRef.key'
)"
brad_verify_token="$(
  gcloud secrets versions access "$brad_verify_version" \
    --project=brad-os \
    --secret=STRAVA_WEBHOOK_VERIFY_TOKEN
)"
brad_challenge="brad-os-cloud-run-$(date -u +%Y%m%dT%H%M%SZ)"
brad_response_file="$(mktemp)"
trap 'rm -f "$brad_response_file"' EXIT

brad_status="$(
  curl --silent --show-error \
    --output "$brad_response_file" \
    --write-out '%{http_code}' \
    --get "$brad_candidate_url/api/prod/strava/webhook" \
    --data-urlencode 'hub.mode=subscribe' \
    --data-urlencode "hub.verify_token=$brad_verify_token" \
    --data-urlencode "hub.challenge=$brad_challenge"
)"
unset brad_verify_token

test "$brad_status" = '200'
jq -e --arg challenge "$brad_challenge" \
  '."hub.challenge" == $challenge' \
  "$brad_response_file" >/dev/null
echo 'Strava verification challenge passed: HTTP 200 and challenge echoed'
```

Do not enable shell tracing, print the token variable, use `curl --verbose`, or retain
the response file. This GET request does not create a subscription, enqueue a task, or
write application data.

After the live Hosting cutover, repeat the verification challenge against the canonical
callback URL and read back the active Strava subscription list. The challenge must return
HTTP 200 with the exact echoed value, and the subscription's `callback_url` must match the
canonical URL exactly. A normal Cloud Run revision deployment or rollback must not require
recreating the Strava subscription.

## Validate the production image

CI builds the exact Dockerfile and starts the image. Locally, with Docker available:

```bash
npm run test:integration:container
```

This checks that the image:

- runs as the non-root `node` user;
- listens on the injected port;
- serves `/healthz`, `/api/dev/health`, and `/api/prod/health`;
- contains the Markdown prompt needed by cycling coach;
- exits successfully after Docker sends `SIGTERM`.

Use `--build-only` when only an image build and non-root inspection are possible:

```bash
npm run test:integration:container -- --build-only
```

## Move iOS/API traffic

`firebase.json` contains one production Hosting rewrite:

1. `/api/**` to the pinned `brad-os-api` Cloud Run service.

The local meal-plan debug UI is not exposed through production Hosting.

The iOS URLs do not change. A physical phone continues using `/api/prod/**`; the simulator
continues using `/api/dev/**`.

Deploy a Hosting preview first:

```bash
firebase hosting:channel:deploy cloud-run-preview --expires 7d
```

After direct-candidate and preview validation, move the live Hosting front door:

```bash
npm run deploy:hosting
```

This Hosting-only command pins `/api/**` to the validated Cloud Run revision. No
Functions deployment participates.

## Roll back

See [Cloud Run rollback](../ops/cloud-run-rollback.md). Rollback restores both the
last known-good Cloud Run revision and its pinned Hosting release. Firestore schemas are
unchanged, so data rollback is required only for demonstrated corruption.
