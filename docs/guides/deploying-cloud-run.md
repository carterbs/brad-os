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

The service uses request-based billing, minimum instances `0`, maximum instances `1`,
concurrency `20`, 1 vCPU, 512 MiB, and a 180-second request timeout.

The legacy Firebase Functions remain deployed. This workflow does not deploy, update, or
delete them.

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
6. checks the candidate revision's `/healthz`;
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

`firebase.json` contains three Hosting rewrites:

1. `/api/**` to the pinned `brad-os-api` Cloud Run service;
2. `/debug` to the existing `devMealplanDebug` Function;
3. `/debug/**` to the existing `devMealplanDebug` Function.

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

This Hosting-only command moves `/api/**`. It does not deploy or delete Functions.

## Roll back

See [Cloud Run rollback](../ops/cloud-run-rollback.md). Because the old Functions remain
deployed and Firestore schemas are unchanged, rollback is a Hosting-only change.
