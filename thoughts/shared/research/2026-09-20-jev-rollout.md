# JEV rollout packet — 2026-09-20

This records production verification, prepared local artifacts, and one explicitly
approved isolated actual-Doris evaluation. The TypeSafe runtime access grant has now
been applied and read back. API deployment, Hosting cutover, remote binary/skill
installation, live meal writes, and Telegram delivery are not claimed complete here.
Temporary fixture staging was removed after the isolated evaluation.

## Readiness decision

Candidate 19 passed the decision-quality gate under the user's accepted limit
of one additional clarification per conversation after a safe unchanged refusal.
The user subsequently requested removal of the GPT meal-plan implementation and
provider switch. That JEV-only source requires a new clean release commit, deployment
plan, production image build, and runtime verification; candidate 19 and its earlier
release identity are historical evidence rather than the final deployment artifact.
Acceptance requires the exact intended saved assignments and history, preserved
unrelated constraints, and zero incorrect or partial writes.

The final audited inventory contains 100 cases, including two generator checks:
97 passed on the first attempt and three resolved with one additional clarification.
Model-bearing conversations passed 95/98 initially and 98/98 within that limit.
There were no incorrect writes. This is an audited combination of retained results and
fresh closing checks, not one newly executed 100-case run. The seed-20260920 undo
case used the reproduced original plan and exact retained operations, explanations,
and refusal; unavailable session identity/timestamps were explicitly synthetic metadata.
Its successful explicit restore preserved the accepted Wednesday revision. The lost
original raw files and this reconstructed recovery remain separately identified.

The new independent boundary trial passed 8/8 JEV conversations on the first attempt;
the matching GPT comparison passed 2/8 and made unsafe ambiguous edits in six cases.
Both providers' concurrent-save checks returned exactly one 200 and one 409. The
provider-free stale-finalization check passed. The exact recovered actual-Doris request
also passed candidate-19 saved-state and literal context/history assertions in 4,787 ms
with 13 JEV calls, reusing the single previously measured interpreter result.

The local production container, 1,922 automated tests, 215 Rust tooling tests, and the
rebuilt Linux CLI checks passed. Fresh private closing evidence is retained under
the durable bundle's `closing-evaluation/` directory: 1,191 private files were copied
exactly, with directory mode 0700, file mode 0600, and manifest SHA-256
`ef438b51d089c9f5c7873b077a21768165b8a19d46244bdd25b6fa0daf261780`. The
[current evaluation report](../../../packages/functions/src/__tests__/live/CURRENT-EVALUATION.md)
records the exact inventory, attempt counts, provenance, and comparison limits.
The new JEV-only release SHA and deployment plan must be recorded externally as
described below. The user has authorized deployment, live API and Datadog verification,
then the existing Doris draft-planning routine and its Telegram DM. Execution and
post-write evidence belong to the release record; this packet does not claim those
operational steps have occurred.

The pre-cutover rollback metadata has been refreshed: direct traffic remains on
`brad-os-api-00005-jac`, and Hosting version `56f8da5ae5a54c08` still pins
`brad-os-api-00008-maz`. The TypeSafe secret-scoped runtime access grant is applied and
verified. Fresh metadata is retained under
`/Users/bradcarter/Documents/Dev/brad-os/.cache/jev-deploy-20260920`.

## Recovery status after the local reboot

The reboot removed `/private/tmp`, including the original readiness bundle and raw
evaluation files. This packet was reconstructed from retained session patch records;
production, Hosting, IAM, and OpenClaw observations below remain pre-reboot snapshots,
not fresh live verification. Original `/private/tmp` paths identify historical evidence
locations and must not be treated as files that currently exist.

The durable recovery bundle is
`/Users/bradcarter/Documents/Dev/brad-os/.cache/jev-doris-readiness-20260920`, outside
the recovered worktree. Its `actual-doris-may` directory is mode 0700 and recovered
private files are mode 0600. The complete strict `request.json` was reconstructed from
the retained exact feedback and context, then matched against its original SHA-256
before being written. The complete `evidence.json` was recovered from a retained
tool output, including source hashes, usage, start time, and cleanup observations.

| Recovered file | SHA-256 |
| --- | --- |
| `actual-doris-may/request.json` | `45d5477798d183fef3f39eaf2b4ecda27fee92b107ab2c865c212a8a809464ad` |
| `actual-doris-may/evidence.json` | `4f59098ac14690bbc72ab232e0cba18b7aee3826d1fffb4f7e4fcbfb9445bffa` |

The original full provider envelope, prompt, proposal, temporary configuration, and
raw downstream evaluation manifests have not been recovered. The hashes retained in
`evidence.json` identify those original files but do not replace their missing contents.
The candidate-17 replay numbers below are historical recorded results. Fresh evaluator
and persistence verification are recorded separately against the recovered source in
the readiness decision and current evaluation report.
No new remote Doris call was made during recovery.

The candidate-19 Docker image survived and its exact ID was read back after reboot.
Recomputing all 143 build-input hashes reproduced the original manifest hash. These
fresh read-only checks are in `container-validation/candidate19/image-inspect.json`
and `recovered-build-inputs.json` in the durable bundle. The old smoke-response JSON
is lost; the successful pre-reboot checks remain historical evidence until repeated.
The original 76-line candidate-19 build log was also recovered from Docker Buildx
record `vysqsmjk2niy98j0x9y6nqkl3` as `build-detail.log` in that directory. The image,
matching source-input manifest, and build log are available. The reboot alone did not
require a rebuild, but the subsequent JEV-only production-source changes do require a
new image build and runtime checks before deployment.
The Linux CLI was rebuilt locally after recovery, and its SHA-256 exactly matches the
original prepared binary. Fresh network-disabled Linux amd64 checks resolved all dynamic
libraries and verified critique/revise `--context-json` help. The binary and the exact
evaluated candidate skill are now in the durable bundle; `cli-build/verification.json`
records source hashes and verification. Nothing was installed remotely. Original
deployment-plan output still must be regenerated from the clean release commit; the
table below is the original bundle inventory, not a complete current availability list.

## Verified release gap

Pre-reboot production inspection found GPT 5.2. The inspected Firebase Hosting release
`sites/brad-os/releases/1788801431065000`, released `2026-09-07T17:17:11.065Z`, uses
version `sites/brad-os/versions/56f8da5ae5a54c08`. Its `/api/**` rewrite pins
`candidate-59aadb53804e`, which resolves to Cloud Run revision
`brad-os-api-00008-maz`. Source at that exact Git prefix hardcodes `gpt-5.2` in
`packages/functions/src/services/mealplan-critique.service.ts`.

The revision's immutable image is:

```text
us-central1-docker.pkg.dev/brad-os/brad-os-api/brad-os-api@sha256:9e22dc80fcb31484954949722f9b34b5a61cb056bdff40ca7c3a35bfa69ad525
```

At that inspection, direct Cloud Run service traffic separately remained 100% on
`brad-os-api-00005-jac`, tag `candidate-aabe5d2844b4`, image digest
`sha256:931da16ebb62979181a280cd6b0bd65dc6d6659344b47f892868d27ad2e9c54a`.
Preserve this distinction when recording or restoring the exact pre-rollout state.

Both inspected revisions bind these numeric secret references:

| Runtime variable | Secret version |
| --- | --- |
| `OPENAI_API_KEY` | `OPENAI_API_KEY:1` |
| `STRAVA_CLIENT_ID` | `STRAVA_CLIENT_ID:2` |
| `STRAVA_CLIENT_SECRET` | `STRAVA_CLIENT_SECRET:2` |
| `STRAVA_WEBHOOK_VERIFY_TOKEN` | `STRAVA_WEBHOOK_VERIFY_TOKEN:1` |

Neither revision sets `MEALPLAN_CRITIQUE_PROVIDER`, `JEV_MODEL`, or a TypeSafe binding.
`TYPESAFE_API_KEY:1` exists and is ENABLED, created `2026-09-20T00:49:39.169253Z`.
Its secret IAM policy has no bindings. The runtime account
`brad-os-api@brad-os.iam.gserviceaccount.com` has project roles for Cloud Config,
Firestore, App Check, and service usage, but no project-level Secret Manager accessor
role. A secret-scoped grant is a release prerequisite; no grant was made:

```bash
gcloud secrets add-iam-policy-binding TYPESAFE_API_KEY \
  --project=brad-os \
  --member=serviceAccount:brad-os-api@brad-os.iam.gserviceaccount.com \
  --role=roles/secretmanager.secretAccessor
```

The direct stable service URL is `https://brad-os-api-vp6k5mvuea-uc.a.run.app`.
Metadata was filtered before saving; no secret values were read or retained.

## Local readiness bundle

Historical bundle directory (removed by reboot): `/private/tmp/jev-doris-readiness-20260920`.

| File | Purpose |
| --- | --- |
| `brados-x86_64-unknown-linux-gnu` | Built Linux CLI with `--context-json` for critique/revise |
| `SKILL.installed.md` | Read-only snapshot of the actual installed Doris skill |
| `SKILL.candidate.md` | Adapted replacement preserving Doris paths and calendar workflow |
| `SKILL.diff` | Exact installed-to-candidate instruction diff |
| `interpreter-eval.config.json` | Non-secret model settings with an absolute deny-all tool policy |
| `deploy-jev.plan.txt`, `deploy-gpt.plan.txt` | Successful local plan output for each explicit provider |
| `cloud-run-current.metadata.json` | Latest service template, tags, secret references |
| `cloud-run-traffic-revision.metadata.json` | Current direct-traffic revision metadata |
| `hosting-live.metadata.json` | Live Hosting release/version and pinned tag |
| `typesafe-secret.metadata.json` | Enabled version and verified IAM gap |
| `SHA256SUMS` | Bundle integrity manifest |

Prepared binary SHA-256:
`aba315dc6d38deb4a981c269fc8f683c2a34dc57c3dbc33c70c48db8136df9d8`.

Prepared skill SHA-256:
`68085e0647da1263933e436dcd62b08a4fd86d7ff2d3e023fdbb78edc4ad4de6`.

The durable skill source is
[`docs/ops/meal-planner-openclaw/SKILL.md`](../../../docs/ops/meal-planner-openclaw/SKILL.md).
The packaged `SKILL.candidate.md` matches it and the evaluated instructions byte-for-byte.

The remote host and `openclaw-gateway` container both report `x86_64`. The CLI was
built locally with `cross build --release -p brados-cli --target
x86_64-unknown-linux-gnu`, using `ghcr.io/cross-rs/x86_64-unknown-linux-gnu:0.2.5`.
A read-only, network-disabled Linux amd64 container resolved every `ldd` dependency
and successfully ran both critique and revise `--help`, including `--context-json`.
Local Docker Desktop was started for this build. Nothing was installed remotely.

The authoritative JEV-only release identity and regenerated deployment-plan hash belong in the
durable bundle's `release-metadata.json`, generated from the clean release checkout
after the release commit. Earlier exploratory plan outputs are not release artifacts;
do not override Git discovery to regenerate them from an uncommitted worktree.

After the new JEV-only release commit is available, regenerate the plan from a clean checkout of that
exact commit. If unrelated working changes remain, use a separate clean worktree;
verify `git rev-parse HEAD` and an empty `git status --porcelain`. Leave
`BRAD_CLOUD_RUN_GIT_SHA` unset so the tool discovers and checks the checkout itself.
Use the numeric bindings and stable service URL listed in rollout step 4 below, then
unset obsolete `MEALPLAN_CRITIQUE_PROVIDER` and save `--plan` output as
`deploy-jev.release.plan.txt` in the bundle. Verify that the image tag contains the new
release SHA and the plan identifies the JEV engine, pinned model, TypeSafe binding,
and no-traffic candidate configuration. The OpenAI binding remains for Today Coach.
Record the final release SHA, exact plan filename and hash in the external durable
bundle's `release-metadata.json`, then refresh its checksum manifest. Generate this
metadata after the commit rather than embedding the packet's own commit SHA here.
Do not execute the plan during this preparation step.

## Production container verification

The historical candidate-19 snapshot passed the CI production Docker build through
`npm run test:integration:container -- --build-only --image
brad-os-api:jev-readiness-candidate19`, with `DOCKER_DEFAULT_PLATFORM=linux/amd64`.
The initial local Docker credential helper stalled while resolving a public image;
the successful retry used an empty temporary auth configuration and the existing
Buildx plugin. No global Docker settings or stored credentials were changed.

| Evidence | Result |
| --- | --- |
| Local image ID | `sha256:425bbbed5a19af16c47415e2ae19a0c04fc1dfa09132f769a03a437a06e8b3cb` |
| Platform and runtime | Linux amd64, Node 22.23.2, user `node` / UID 1000 |
| 143-file build-input manifest SHA-256 | `c335502bd52931f4e3309a46b995fd78dfdf8d3b82d4b10867a52b3df599a04e` |
| Decision service source SHA-256 | `3f2b66953d021ca7dfd020b013f68072375e1b81745d80ff20679b3ba6d03f74` |
| `/healthz`, `/api/dev/health`, `/api/prod/health` | HTTP 200, healthy; API environments matched |
| Protected dev/prod meal-plan requests without authentication | HTTP 401, `APP_CHECK_MISSING` |
| Shutdown | SIGTERM drained requests and exited 0 |
| Cleanup | Test container removed; image retained locally only |

The runtime used `--network none`, a read-only filesystem, no mounts, no published
ports, dropped capabilities, and the fake project `brad-os-container-test`. Its only
network interface was loopback. `PORT=18080`, `MEALPLAN_CRITIQUE_PROVIDER=jev`, and
`JEV_MODEL=jev-1.13.0` were read back; OpenAI, TypeSafe, Google credential, emulator,
and App Check bypass variables were absent. Requests ran on container loopback, so
neither provider calls nor production Firestore access were possible. This covers
the CI health and shutdown contract; model correctness and emulator persistence
are covered separately. Health checks do not require an emulator.

The build-input hashes were unchanged after the smoke checks at
`2026-09-20T15:33Z`. The recovered image and exact source-input hashes match this
tested snapshot, and the closing live correctness gate has passed under the accepted
one-extra-clarification limit. Further production-source edits require a fresh build
and smoke check. The earlier build logs retain the existing lockfile's
dependency audit warnings (runtime install: 21 findings, including 2 critical);
this task did not change dependencies or classify those findings.

Before reboot, logs, exact source hashes, image/container metadata, and route results were under
`/private/tmp/jev-doris-readiness-20260920/container-validation/candidate19/`. Candidate 18
also passed its isolated container checks, but its image remains historical/provisional:
`sha256:9ac655df3b52df80d62b296dddcc25407571f26425eacabda522e406c4a5b979`, with evidence
then stored in the sibling `candidate18/` directory. Candidate-16 evidence was in the
parent directory. Those temporary directories were lost. Recovered candidate-19 image
and source metadata are identified in the recovery section above; no original raw smoke
response is claimed restored. Nothing was pushed to a registry or deployed.

## Doris installation and adaptation

The running image is `ghcr.io/openclaw/openclaw:2026.9.2`, OpenClaw build `3928bad`.
The active primary model is `openrouter/deepseek/deepseek-v4.1-flash`, with no main-agent
override. Its provider parameters are `zdr=true`, `data_collection=deny`, ordered
`fireworks`, `siliconflow`, `deepinfra`.

| Host path | Container path | Mount |
| --- | --- | --- |
| `/opt/openclaw/bin` | `/usr/local/bin/brados-tools` | read-only directory |
| `/opt/openclaw/skills-live` | `/home/node/.openclaw/skills-live` | read/write |
| `/opt/openclaw/config` | `/home/node/.openclaw` | read/write |
| `/opt/openclaw/workspace` | `/home/node/.openclaw/workspace` | read/write |

The installed binary is `/opt/openclaw/bin/brados`; the actual agent uses the preserved
wrapper `/usr/local/bin/brados-tools/brados-auth`. The wrapper was not read or changed.
Installed binary SHA-256:
`b61021e49eb6a26cbc1f2cf246c5c03c6120445b7153d05b1e22fe2a2a8cb471`.
It currently lacks `--context-json`.

The installed skill is `/opt/openclaw/skills-live/meal-planner/SKILL.md`; OpenClaw
reports it ready, visible, and sourced from `openclaw-extra`. Installed skill SHA-256:
`435dcb70c40471921acf5aaf1ca59bd82f96504fa4d1c7d4ff06af4c48dbd203`.

The candidate preserves the installed authenticated wrapper, all three calendar reads,
next-Monday window, recency/fallback rules, and saved-plan read-back. Its changes are:

- Replace the instruction to rewrite user feedback into final slot commands with
  original feedback plus separate `original_request`, `interpretation`,
  `calendar_context`, and known `planning_week_start` fields.
- Preserve the original source identities for exchanges; let JEV select open-ended
  catalog replacements from supported constraints.
- Inspect explicit outcomes and conflicts, then verify fresh saved state.
- Use `revise` for finalized sessions; keep shopping-list approval separate.

Do not copy the repository skill wholesale: it assumes a bare `brados` command and
does not contain all installed Doris calendar instructions.

## Isolated actual-Doris interpreter evaluation

Prepared config: `/private/tmp/jev-doris-readiness-20260920/interpreter-eval.config.json`.
Its model and provider routing match the verified live defaults. It includes the required
explicit `agents.entries.main={}` roster and passed the installed OpenClaw schema validator
in memory without writing remote files or invoking a model. Its global tool policy
is exactly:

```json
{"tools":{"profile":"minimal","deny":["*"]}}
```

The installed matcher was executed directly in memory: this denies `exec`, `read`,
`write`, `message`, `browser`, `cron`, `sessions_spawn`, `apply_patch`, `web_search`, and
`web_fetch`. Installed source confirms deny patterns win over every allowlist, and
`*` matches all names, including extension tools.

Use `openclaw agent exec --config ...` for a one-shot embedded run with a fresh temporary
state root. Do not use the live cron or an ordinary agent turn. In this installed
version, `agent exec --isolated` alone defaults to the coding tool profile and unrestricted
exec. `--config` is mutually exclusive with `--isolated` and `--auth-env-only`; use the
explicit config, not those flags. Without `--state-dir`, the command creates and cleans
up its temporary state directory. Its source resolves existing authentication before
pinning temporary state; credentials need not appear in the prompt, files, or output.

Stage only the non-secret config and a dedicated empty temporary workspace after the
evaluation has been authorized. Supply one bounded prompt through stdin containing the
candidate skill, prerecorded session/history/catalog/calendar facts, and one feedback
fixture. Ask for one JSON object with `critique` and `context`; require original wording
and evidence-backed interpretation. Do not ask the model to execute any command.

Equivalent command options inside the installed container:

```bash
openclaw agent exec \
  --config /tmp/jev-interpreter-eval/interpreter-eval.config.json \
  --cwd /tmp/jev-interpreter-eval/workspace \
  --model openrouter/deepseek/deepseek-v4.1-flash \
  --message-file - \
  --json \
  --timeout 120
```

Use a fresh invocation per fixture. Assert the returned tool-call count is zero and
fail the evaluation if any tool is exposed or attempted. Parse the returned proposal
through the actual strict critique schema, then give it only to the local/emulator
evaluation harness. This tests the real Doris model and current OpenClaw runtime as an
interpreter; it does not claim a full production workflow test.

The weekly cron `76cee927-efc9-424a-b9f9-8c18bb08606d` runs Saturdays at 20:30
America/New_York with `sessionTarget=isolated`, `delivery.mode=none`, and timeout 600s.
Its prompt explicitly requests the message tool, so `delivery.mode=none` is insufficient
to prevent Telegram. The last run timed out after about 601.6s, with four consecutive
errors; this pre-existing timeout was left unchanged.

### Approved actual-Doris result

Automatic approval review initially rejected transferring the household prompt to the
remote temporary directory. The user then explicitly approved the exact retained May
21-slot plan, 83-meal catalog, and candidate instructions for one isolated call through
existing DeepSeek/OpenRouter. That approval was used; no additional fixture was called.

The first isolated invocation stopped before inference with `missing-provider-auth`.
The normal live configuration supplies `env.vars.OPENROUTER_API_KEY`; an isolated config
intentionally omits it. For the successful invocation, the installed framework's
`createConfigIO({configPath: '/home/node/.openclaw/openclaw.json'}).loadConfig()` loaded
the existing credential into process memory before the unchanged isolated configuration
was used. No credential was printed, copied into the prompt, or stored in artifacts.
The retained `agentExecCommand` result exposed its actual `toolCalls` counter; the call
also set `maxToolCalls: 0` and `timeoutMs: 120000`. The ordinary CLI JSON envelope does
not expose that counter. These internal module entrypoints are specific to the inspected
OpenClaw build and must be rechecked after an upgrade.

The one paid call returned successfully on `openrouter/deepseek/deepseek-v4.1-flash`:

| Evidence | Result |
| --- | --- |
| Duration | 67,479 ms |
| Input tokens | 18,501 |
| Output tokens | 5,730, including 4,592 reasoning tokens |
| Reported cost | $0.00785202 |
| Tool calls | 0 |
| Workspace files after execution | 0 |
| Strict critique/context schema | Passed |
| Original user feedback | Preserved byte-for-byte |

Private mode-0600 prompt, proposal, strict request, raw response, and sanitized evidence
were originally under `/private/tmp/jev-doris-readiness-20260920/actual-doris-may`. The exact request
is `request.json`; its SHA-256 is
`45d5477798d183fef3f39eaf2b4ecda27fee92b107ab2c865c212a8a809464ad`.
`request.json` and the complete `evidence.json` were recovered to the durable bundle;
the other original raw files remain unavailable. `evidence.json` includes
source/skill/prompt/output hashes and usage. The temporary
container prompt/config/workspace were removed. Production model routing, skill,
binary, cron, authenticated wrapper, and meal data were unchanged.

Doris identified the correct net state: all three Monday slots empty, two Tuesday
replacements, Wednesday dinner empty, and Thursday Garlic linguine. It also added an
unnecessary question about filling Wednesday for company despite the explicit removal.
Preserve that output unchanged in downstream testing; interpreter success alone does
not establish JEV success. The live harness accepts the private request through
`JEV_EVAL_DORIS_ARTIFACT` and the `actualDoris:` test-name filter, applies the same strict
final-state assertions to both providers, and keeps the historical cases unchanged.
The exact same private request was replayed successfully against candidate 17:

| Critique provider | Downstream duration | Model calls | Saved-state and literal history checks |
| --- | --- | --- | --- |
| JEV | 4,419 ms | 13 | Passed |
| GPT | 4,540 ms | 1 | Passed |

Both verified every requested assignment and literal context/history. The shared Doris
interpretation took 67.479 seconds and cost $0.00785202 once; it was reused for both
replays and must not be charged twice in a combined comparison. These downstream
numbers are candidate-17 evidence. The closing candidate-19 JEV replay of the same
unchanged request also passed in 4,787 ms with 13 model calls, including exact saved
assignments and literal context/history verification. No new interpreter call was made.
This remains one interpreted fixture, not a Telegram end-to-end workflow test.

## Candidate deployment and rollout order

Persistence safeguards in the candidate include full-session compare-and-save for
critique/revision, preserving repeated literal turns and their structured context.
History-only changes preserve the planning `updated_at` timestamp, including direct
history appends, so later recency reconciliation cannot reinterpret a clarification as
a newly planned meal. An unchanged plan does not trigger revision recency writes.

Finalization compares the exact loaded session and reads all referenced live meal
documents before staging writes. It commits the finalized flag and initial meal-recency
updates in one Firestore transaction, using the same timestamp and environment-prefixed
collections. Changed, deleted, or concurrently finalized sessions produce a conflict
without recency writes. Duplicate references are updated once; missing or invalid meals
retain the previous skip behavior. Shopping-list generation remains a separate action
that reads the saved session. These changes do not migrate general recency history.

1. Complete the local/live-fixture evaluation gates and create the final release commit.
   Refresh artifact hashes if any CLI or adapted skill source changes.
2. Preserve the above Hosting version, both Cloud Run revisions/tags, and exact remote
   binary/skill backups. Avoid an active Doris meal-planning turn during the paired
   binary/skill replacement. Do not change the cron or authenticated wrapper.
3. The approved secret-scoped TypeSafe accessor grant has been applied and the IAM
   policy read back successfully. Preserve that grant for the JEV deployment.
4. From the clean committed checkout, configure and render the Jev candidate plan:

   ```bash
   export BRAD_OPENAI_SECRET_VERSION=1
   export BRAD_TYPESAFE_SECRET_VERSION=1
   export BRAD_STRAVA_CLIENT_ID_SECRET_VERSION=2
   export BRAD_STRAVA_CLIENT_SECRET_VERSION=2
   export BRAD_STRAVA_VERIFY_TOKEN_SECRET_VERSION=1
   export BRAD_CLOUD_RUN_SERVICE_URL=https://brad-os-api-vp6k5mvuea-uc.a.run.app
   unset MEALPLAN_CRITIQUE_PROVIDER
   export JEV_MODEL=jev-1.13.0
   npm run deploy:cloud-run -- --plan
   ```

5. After release authorization, execute the same configuration with `--execute`. It
   builds and validates a no-traffic JEV candidate, explicitly reads model/bindings
   back, and leaves Hosting unchanged. Validate the protected candidate without
   unapproved production meal mutations, following the deployment guide.
6. Install the prepared binary and adapted skill as a pair through their host directory
   mounts, retaining backups. For example, stage candidate files under a dedicated
   `/tmp` directory; use `sudo cp -p` to back up the existing destinations, install each
   candidate to a sibling `.next` file with binary mode 755 and skill mode 644, then
   rename into place. Never overwrite or inspect `brados-auth`.
7. Read both files back through `docker exec openclaw-gateway`, compare SHA-256 hashes,
   run the binary's harmless critique/revise `--help`, and run `openclaw skills info
   meal-planner`. Directory bind mounts expose the replacement without a restart.
8. Cut over the separately pinned Hosting release only after the candidate and Doris
   contract checks pass. Retain all rollback artifacts and verify the actual live
   Hosting pin plus JEV runtime evidence. Health alone is not a critique correctness test.
9. After live API and Datadog verification, run the existing authorized Doris routine
   to create and read back a draft, then send its Telegram DM. Keep finalization and
   shopping-list generation behind their existing separate approval gates.

## Rollback ordering

For immediate recovery, avoid waiting for an image build:

1. Stop further meal-edit attempts in the operator workflow; do not finalize or generate
   a shopping list as part of rollback.
2. Restore the retained binary and installed skill together, then compare their original
   hashes and check harmless help/skill visibility. Leave the wrapper, model routing,
   cron, and unrelated files unchanged.
3. Restore the live Hosting channel to retained version `56f8da5ae5a54c08`, preserving
   tag `candidate-59aadb53804e` and revision `brad-os-api-00008-maz`. If direct traffic
   was changed during rollout, restore its separately recorded `00005-jac=100` baseline.
   Do not assume Hosting and direct traffic had the same revision before this release.
4. Read back the Hosting pin and direct traffic separately, then verify protected reads
   and the existing health/Strava checks in the rollback guide. Preserve secret versions,
   IAM grants, candidate images, and backups for diagnosis; no data rollback is implied.

The new source is JEV-only. It has no GPT meal-plan implementation, provider switch,
or automatic fallback; any `MEALPLAN_CRITIQUE_PROVIDER` deployment input is rejected
with instructions to unset it. Rollback uses the retained immutable pre-cutover API
revision and Hosting release together with the matching old Doris binary/skill pair.
Do not build a new GPT candidate or change unrelated OpenAI-dependent features.

Historical GPT comparison results above remain evidence about the compared older
implementation. That comparison forwarded the latest request context but earlier
messages only as text; prior structured context, operations, and previous assignments
were not forwarded. Those results do not establish behavioral equivalence or describe
a fallback retained in the JEV-only release.

See [deployment guide](../../../docs/guides/deploying-cloud-run.md) and
[rollback guide](../../../docs/ops/cloud-run-rollback.md).

The final JEV-only release identity and regenerated deployment plan belong in
`/Users/bradcarter/Documents/Dev/brad-os/.cache/jev-doris-readiness-20260920/release-metadata.json`.
Create it after the clean release commit and plan generation, recording the exact
release SHA and plan hash; this packet intentionally contains no self-referential
release SHA. The accepted closing quality gate is retained historical evidence. Fresh
JEV-only source validation and container checks, followed by external release metadata,
must bind the verified artifacts to the new committed release before cutover.
