# Container image retention

Artifact Registry's 0.5 GiB storage allowance is shared across the billing account,
including BradOS and OpenClaw. Repository storage includes shared layers; do not sum
individual advertised image sizes to estimate the bill. Removing an image version
does not immediately reclaim its layers: unreferenced layers are collected daily.

## Active policy

The policy in [artifact-registry-cleanup-policy.json](artifact-registry-cleanup-policy.json)
is enabled on `brad-os/brad-os-api` and
`openclaw-poc-260314-4147/cloud-run-source-deploy`, both in `us-central1`:

- delete unprotected builds older than 14 days;
- keep the three most recent builds **per image/package**;
- keep every image with a tag beginning `retain-`, regardless of age.

Keep rules override delete rules. Cleanup runs periodically, so this policy is not
an instantaneous storage limit. Aim below 0.4 GiB to leave room for builds. Inspect
repository bytes after layer collection, and review protected images if the total grows.

BradOS permits mutable tags so tagged builds can be removed. Production must continue
to deploy exact `sha256:` image digests. Moving an Artifact Registry tag does not change
the image used by an existing Cloud Run revision.

## Protection tags are part of deployment

Artifact Registry does **not** discover Cloud Run traffic or Hosting rewrite pins.
The most recent three builds can all be failed candidates. Maintain these tags for
each image/package before enabling cleanup and whenever promoting or rolling back:

| Registry tag | Meaning |
| --- | --- |
| `retain-current` | Image for the current production service or job |
| `retain-rollback-1` | Most recent validated rollback build |
| `retain-rollback-2` | Second validated rollback build, when available |
| `retain-candidate-<git-sha>` | Candidate intentionally kept for validation |
| `retain-legacy-gpt` | BradOS's pre-JEV GPT fallback; keep until explicitly retired |

Before building/deploying candidates, confirm that every live Cloud Run traffic target,
live/preview Hosting release, and intentional rollback target has a protection tag.
Protect a newly deployed candidate using its exact digest, before starting validation:

```bash
gcloud artifacts docker tags add \
  us-central1-docker.pkg.dev/brad-os/brad-os-api/brad-os-api@sha256:EXACT_DIGEST \
  us-central1-docker.pkg.dev/brad-os/brad-os-api/brad-os-api:retain-candidate-GIT_SHA \
  --project=brad-os
```

After successful candidate validation and Hosting promotion, record the Hosting
release/version ID, Cloud Run revision, Git SHA, and image digest. Resolve and record
all existing protection-tag digests before moving any tags. Use those recorded exact
digests to rotate tags in this order:

1. Point `retain-rollback-2` at the old `retain-rollback-1` digest.
2. Point `retain-rollback-1` at the old `retain-current` digest.
3. Point `retain-current` at the validated new production digest.
4. Read back every protection tag and the live Hosting/Cloud Run targets.
5. Remove the completed candidate's temporary `retain-candidate-*` registry tag only
   after the image is protected by the appropriate release tag. For failed candidates,
   remove protection only after confirming they are not active or intentional rollback
   targets. The 14-day age rule still applies.

Use `gcloud artifacts docker tags add IMAGE@sha256:DIGEST IMAGE:TAG` to move a protection
tag. Rollbacks must refresh the same protection tags. Never remove the last known-good
image/revision/Hosting pin before a newer rollback target has passed the required drill;
see [Cloud Run rollback](cloud-run-rollback.md). Historical Hosting releases whose tags
have been intentionally retired are not supported rollback targets.

The repository policy automatically removes aged builds; protection-tag rotation is
a required operator step in the existing manual deployment/promotion workflow.

## Verified retained BradOS targets on October 4, 2026

| Protection | Cloud Run revision | Git SHA prefix | Hosting version |
| --- | --- | --- | --- |
| Current | `brad-os-api-00013-veg` | `2f887a5ded3d` | `357c6cfc919eba03` |
| Rollback 1 | `brad-os-api-00011-tas` | `5d083bc23418` | `812ac415fd2fe551` |
| Rollback 2 | `brad-os-api-00009-zot` | `933083cb2ee0` | `dfe59f0381b70ce4` |
| Legacy GPT | `brad-os-api-00008-maz` | `59aadb53804e` | `56f8da5ae5a54c08` |

Both prod and dev health endpoints on all four retained targets returned HTTP 200.
These checks are not a production rollback drill or a full application validation.

## Changing the cleanup policy

Preview and inspect keep/delete decisions before activating changes:

```bash
gcloud artifacts repositories set-cleanup-policies brad-os-api \
  --project=brad-os --location=us-central1 \
  --policy=docs/ops/artifact-registry-cleanup-policy.json --dry-run
```

Google's background dry-run results can take about a day. For immediate validation of
an explicitly reviewed version list, the Artifact Registry `versions:batchDelete`
API supports `validateOnly: true`; this validates those deletions, not the policy
engine's selection. Once the protected set and deletion list are verified, activate:

```bash
gcloud artifacts repositories set-cleanup-policies brad-os-api \
  --project=brad-os --location=us-central1 \
  --policy=docs/ops/artifact-registry-cleanup-policy.json --no-dry-run
```

Apply the same policy file to OpenClaw's `cloud-run-source-deploy` repository using
its project ID. Keep protection tags scoped to the image/package: the Gmail cursor
service and renewal job are separate packages. Do not execute the renewal job or send
mail to test retention.

References: [cleanup policies](https://docs.cloud.google.com/artifact-registry/docs/repositories/cleanup-policy),
[storage pricing](https://cloud.google.com/artifact-registry/pricing), and
[Cloud Run image copies](https://docs.cloud.google.com/run/docs/deploying).
