# JEV live evaluation

This opt-in suite runs the actual local Express meal-plan endpoints, persists and rereads drafts in the Firestore emulator, and calls TypeSafe using `TYPESAFE_API_KEY_DEV` from project `brad-os`. It never writes production plans or sends Telegram messages. Meal-plan critique execution is JEV-only. Earlier GPT comparison results remain historical evidence in `CURRENT-EVALUATION.md`; the comparator implementation and runnable provider switch have been removed. Ordinary validation excludes this suite because it requires credentials, network access, and a running emulator; `test:jev:live` typechecks the suite before running it.

Start a disposable emulator, then run the suite from the repository root:

```sh
firebase emulators:start --only firestore --project demo-jev-eval
```

In another terminal:

```sh
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run test:jev:live
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 JEV_EVAL_SEED=20260921 npm run test:jev:live
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 JEV_EVAL_SEEDS=20260920,20260921 npm run test:jev:live
```

Historical replay and confirmation fixtures explicitly enable `ADULT_BREAKFAST_ENABLED=true` within this suite and restore the environment afterward, retaining their original 28-slot, two-audience contract. Default-off behavior is covered separately by the feature-policy, handler, generation, shopping, recency, and critique unit regressions.

The test refuses other database hosts. The dev key is fetched into the test process, never printed or saved. The default model is pinned to `jev-1.13.0`. Each test derives its own seed from the base seed and case name; each generation within it derives a separate iteration seed. Generation alone uses the frozen date `2026-09-20T12:00:00.000Z` (override with `JEV_EVAL_DATE`). Running a filtered case therefore reproduces its starting plans from the full suite. Catalog records are reseeded before every case so recency updates cannot contaminate later starts. After the real generate endpoint creates each fixture, only its emulator creation/update timestamps are normalized to the frozen date so revision planning context is reproducible too; transport clocks remain real. Custom recency fixture meal IDs are seed-derived. Runs use the same disposable project and must run sequentially. No clock, model response, HTTP route, repository, or persistence is mocked. Real provider fetches pass through a recorder. Seeds do not guarantee identical provider judgments. `JEV_EVAL_SEEDS` runs the full scenario matrix sequentially across distinct seeds in one process; it overrides `JEV_EVAL_SEED`. Repeat the same command in a new run to measure provider variation on identical starting evidence. Case manifests include their base seed, and private filenames distinguish seeds. Filters select the same per-case starting plans regardless of which other scenarios run.

## Evidence and provenance

- `meals.json`: 83 meals read from BradOS through the authenticated CLI on openclaw-vm during this investigation. This is the current retained catalog, not a reconstruction of past consumption.
- `may-catalog.json`: 83 meals retained in session `v7in5qfZ1jgs6c81rCYb`.
- `may-week.json`: the May 25 Telegram plan reconstructed from the quoted reply, plus saved backend requests and intermediate plans reconstructed from retained GPT operations. Source transcript: `ee540cab-cf0d-480f-b2ce-afb36eac6540`. The first retained user request corrects the typo “mponday” and omits a separate catalog-deletion request; it is labeled `historical_user_with_documented_edits`, not raw verbatim input. These documented scope/typo edits are retained in the fixture metadata. Missing `new_meal_id` values in old removal operations are interpreted as cleared slots. “Whole Fish with Bread and a Salad” had no `last_planned` field in both catalog exports; fixtures explicitly normalize it to null to satisfy the current schema.
- `calendars.json`: all-page, read-only backfill for May 25–31, August 10–16, and August 24–30 across Brad, Shannon, and Family calendars, with explicit America/New_York boundaries. Retrieved September 20, 2026. Event titles are generalized; dates and times are retained. `requires_easy_dinner` is a fixture annotation used to reproduce Doris's calendar-to-critique step. Retained calendar records cannot prove what events existed when the original plan was made.
- The July compound request is tested both verbatim and as Doris actually forwarded it (transcript `c667d93c-932b-42e2-9823-b3dc3f4fe860`). The August no-cook case is an intent-preserving adaptation of the voice-note exchange (`8842619c-a0e5-43e3-a634-9057dd45a62f`).

## What the assertions prove

The suite checks slot removal versus replacement, exact exchanges, family versus adult breakfasts, prior rejections, family suitability, explicit named meals, no-cook/low-effort attributes, calendar adjustments, and preservation of every unrelated slot. Every critique/revise response is compared with a fresh saved-plan read, including the full prior history and exactly one new user/assistant pair. Replacement checks require a nonempty meal of the correct type and audience. Dedicated held-out cases repeat identical rejection text three times, require correct structured infeasibility and missing-evidence outcomes, and exercise actual draft critique, finalize, and finalized revise with persisted recency checks on isolated fixture IDs. Approval and shopping requests must not finalize a draft through this endpoint. Negative cases cover withheld approval, contextual information, and ambiguous targets.

The raw May swap-then-remove message is a deliberately difficult case. Doris/GPT also misinterpreted the original conversation; separate tests replay the later backend corrections and family-preference turns. A successful simpler case must not hide failure of this difficult case.

The original no-cook request remains verbatim. A deterministic necessary-condition check now proves whether any different effort-one lunch can fit alongside unrelated fixed slots under no-repeat and prep limits. A proven impossible fixture must return `infeasible` and preserve the entire plan; feasible fixtures must still apply all requested changes. The explicit counterfactual that frees prep capacity must apply. Earlier unconditional-replacement failures remain in retained manifests rather than being erased. Effort-one and prep-ahead attributes alone do not establish recipe-level cooking guarantees. The additional ingredient-evidence case requires a structured `insufficient_evidence` outcome and no partial edit. No live result is an ingredient or allergy certification.

Generation is the existing best-effort algorithm, not JEV. Its structural and audience invariants are asserted; repetitions and breakfast/lunch effort exceptions are recorded. This catalog has seven adult breakfasts, three requiring prep ahead, but only six low-effort non-prep family lunches. Consequently the three-prep-meal cap, no repeats, and low effort at every breakfast/lunch cannot all hold simultaneously. The suite reports that tradeoff instead of pretending the catalog meets every preference.

## Interpreting results

A passing unit suite verifies application behavior under supplied judgments, not model quality. The live suite intentionally fails when an expected edit is declined, misapplied, or only partially satisfied. Keep failing scenarios visible. Repeated live passes across different generation seeds and held-out requests are required before recommending a switch from the former critique system. These tests exercise emulator finalization and recency. An optional exact actual-Doris interpretation is replayed with separately measured interpreter evidence; the suite itself does not invoke Doris. Telegram delivery, live scheduling, and shopping-list delivery remain outside this evaluation.


## Reproducibility and measurement

Each run writes `.cache/jev-eval/<run-id>/manifest.json` (an existing git-ignored location) with owner-only file permissions. It retains Git HEAD, SHA-256 hashes of source/configuration/fixtures, exact model and seed, frozen generation date, per-case result, per-turn provenance and starting/final state hashes, exact-history readback status, all semantic calls, and all physical provider attempts including HTTP errors and transport failures. Usage is read from a clone of successful provider responses; provider behavior is never replaced. Failed turns retain elapsed time. Missing tokens and billing are `null`, never estimated as zero. Usage estimates retain dated official prices: JEV 1.13.0 input $0.042/million and output free ([TypeSafe models](https://docs.typesafe.ai/models)), checked September 20, 2026. These are usage estimates, not invoices. Unknown billing on failed physical attempts keeps the complete total unknown while known cost is reported separately. Preflight failures with zero physical attempts have zero provider cost. End-to-end comparison must include Doris separately. This suite does not invoke Doris; an optional imported actual interpretation includes its separately recorded upstream usage, latency, and cost.

Set `JEV_EVAL_PRIVATE_ARTIFACTS=1` to retain the full local input/plan/history evidence, question options, returned judgments, provider success payloads, and saved result alongside the manifest. These files can contain household information. They are opt-in, ignored by Git, and written with mode 0600 inside a mode 0700 directory. Request authorization headers and keys are never captured; provider error bodies are not read. Per-turn console metrics contain hashes, timing, outcome, and counts rather than requests or judgments; Vitest test titles still identify the documented fixture wording. Do not commit private files.

The evidence labels intentionally distinguish historical raw requests, historical user text with documented typo/scope edits, actual historical Doris-forwarded requests, intent adaptations, retrospective calendar annotations, human-authored rewrites, human-authored counterfactuals, synthetic regressions, development holdouts, and independently authored final-confirmation wording. A human-authored rewrite or rearranged counterfactual plan is not a successful replay of the original conversation. `RESULTS.md` remains a historical 16/20 checkpoint; it is not the current suite's denominator or a rollout claim.

Every current JEV response must include its structured outcome and satisfy the same full plan/history/recency/atomicity assertions. Historical GPT comparator runs recorded their missing outcome capability separately; those retained results are not rewritten by removing the executable comparator.


## Development and final confirmation

The original 24 scenarios plus five development holdouts formed the initial 29-case development set. A separately labeled synthetic policy regression now checks that an ordinary replacement does not introduce another variant of a core dish already planned, bringing development coverage to 30 cases (29 model-bearing conversations and one five-week generator check). Those five requests have now informed implementation changes and are not untouched holdouts. Eight separately authored scenarios form `independent final confirmation`; their request text was withheld from the implementation author during candidate development. They check missing evidence, explicit preservation, named breakfast audiences, a whole-household day removal, rejection progression, exact cyclic transfers, joint prep capacity, and an exact effort override with empty-label preservation.

Use test-name selection to separate evaluation phases without disabling tests in source:

```sh
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run test:jev:live -- --testNamePattern '^(?!.*(?:confirmation:|concurrency:|actualDoris:|persistence:))'
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run test:jev:live -- --testNamePattern 'confirmation:'
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 JEV_EVAL_SEEDS=20260920,20260921 npm run test:jev:live
```

The default command runs 39 scenarios per seed: 30 development cases (including one generator-only check), eight independent confirmation conversations, and one concurrent-write regression. One additional provider-free persistence integration case runs once per invocation. Run the concurrent-write regression separately with `--testNamePattern 'concurrency:'`; the provider-free stale-finalization case uses `persistence:` as documented below. It issues two simultaneous real HTTP/provider requests against one draft and requires one applied success, one `409 SESSION_CONFLICT`, and exactly one persisted user/assistant pair. Async-local inference metering retains separate provider calls within the joint concurrent workload. The same semantic assertions apply to JEV and the preserved GPT comparator; only the documented legacy missing-outcome capability is reported separately. The first confirmation trial on candidate 16 scored 10/16 across two seeds; the three failing scenarios are now disclosed to the implementation author and are exposed evaluation evidence. Their provenance label continues to describe independent authorship, not continued secrecy. Once a confirmation failure informs implementation changes, retain its first result and report subsequent runs as exposed regression results. A repeated pass on exposed wording is not an unseen confirmation result.


## Actual Doris interpretation replay

`JEV_EVAL_DORIS_ARTIFACT=/absolute/private/request.json JEV_EVAL_DORIS_EVIDENCE=/absolute/private/evidence.json` registers one separate `actualDoris:` case. Its input must be the exact strictly validated `{ critique, context }` output from a separately recorded, delivery-disabled Doris gateway invocation. The test replays the retained May starting plan, checks every requested removal and replacement, and verifies exact persisted context/history through the real API. Run it for either provider with `--testNamePattern 'actualDoris:'`; ordinary runs without that variable retain the 39-case scenario denominator. It never invokes Doris or edits the imported request. The manifest labels this `live_doris_forwarded`, verifies request/source-fixture hashes, and retains sanitized interpreter model, usage, timing, cost, and provenance hashes as an upstream measurement. Backend usage remains backend-only; combine it with the separately retained gateway evidence when reporting this single end-to-end workload. An imported request does not establish Telegram delivery or household-wide interpretation reliability.

## Provider-free stale finalization

Run `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run test:jev:live -- --testNamePattern 'persistence:'` to exercise real Firestore transactions without fetching provider credentials or making model requests. The separate integration case proves that same-timestamp changes to either history or plan invalidate a loaded finalization state without changing the session or meal recency. It then finalizes the current state and verifies that the saved flag and assigned meal recency share the committed timestamp. This case is outside the model-quality denominator; the development recency scenario separately exercises the real HTTP finalize endpoint.

## Independently authored second confirmation

A separate author prepared eight additional scenarios from the behavioral contract and catalog without reading the decision implementation or earlier cases. Their first trial on frozen candidate 17 scored 14/16 across two seeds, versus preserved GPT’s 12/16. JEV’s one failing clarification-follow-up scenario has now been disclosed and is exposed regression evidence; the immutable first trial remains distinct. Set `JEV_EVAL_FRESH_CONFIRMATION=1` to register them, and select `--testNamePattern 'fresh-confirmation:'`. The same option and assertions work for the preserved GPT comparator. Ordinary invocations do not register these eight cases, so existing development and first-confirmation counts stay unchanged. When enabled, exclude `fresh-confirmation:` from other phase filters. Record their first trial independently from any later exposed regression runs.

## Small independent history-boundary confirmation

`JEV_EVAL_BOUNDARY_CONFIRMATION=1` registers four additional independently authored history-boundary scenarios; select `--testNamePattern 'boundary-confirmation:'`. They are currently unrun. The author read the behavioral contract and helper types, not prior case bodies, results, or production decision prompts. Their first frozen-candidate trial must remain separate from later exposed regressions.

## Retained read-only scope diagnostic

The completed eight-probe scope experiment is archived privately with its source under the ignored `scope-diagnostic-*` evidence directory. It initialized no database and changed no saved plan or correctness assertion. Its owner-only artifacts retain exact inputs, judgments, all physical attempts, reported usage, known versus unknown billing, and a source hash. A completed probe is not a conversation-quality pass; diagnostic calls remain outside correctness denominators and inside incurred-cost accounting. The temporary assertion-free runner was removed from test discovery after completion.

## Bounded resolution and recovered evidence

Strict first-attempt behavior is the default. `JEV_EVAL_BOUNDED_RECOVERY=1` permits at most one preauthored clarification in the whole conversation, and only after a successful response has been read back with zero operations, an unchanged complete plan, and exact appended history. HTTP/provider failures and incorrect/partial edits cannot trigger recovery. The original request and failure remain recorded; all final scenario assertions are unchanged. Independent boundary recovery wording is in `confirmation-round3-recovery.ts`, authored before the first trial. The exposed selective-undo clarification names only the original assignment from saved `previous_assignments` metadata.

For a retained safe refusal, `JEV_EVAL_SAVED_RECOVERY_INPUT` imports a private, validated session, exact expected plan, and one authored clarification. The test reads the seeded session back exactly, makes one request, and asserts the entire final plan and history. `JEV_EVAL_UNDO_RECOVERY_INPUT` separately labels the reboot-era reconstructed undo history; it is not represented as a recovered original session dump. These opt-in cases resolve existing failed conversations and do not enlarge the independent-scenario denominator.

A reboot cleared the original temporary worktree and its private pre-reboot raw artifacts. Source was recovered by replaying exact session-recorded edits, and fixtures were restored from retained read-only sources. Historical report counts remain supported by durable transcript summaries, but old run IDs do not imply their complete manifests/raw judgments remain available. New private runs live in the durable worktree's ignored `.cache/jev-eval` directory. Do not place this worktree or evaluation evidence under `/private/tmp` again.

The completed frozen candidate-19 ledger is reported in `CURRENT-EVALUATION.md`: 95/98 model conversations succeeded on their first attempt and three resolved after one extra clarification each. Two generator checks are counted separately. The final independent boundary first trial passed 8/8 for JEV and 2/8 for preserved GPT under the same acceptance profile. No broad evaluation rerun or prompt change was made after this closing gate.

Reproduce the final boundary profile with real providers and the local emulator:

```sh
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 JEV_EVAL_SEEDS=20260920,20260921 JEV_EVAL_BOUNDARY_CONFIRMATION=1 JEV_EVAL_BOUNDED_RECOVERY=1 JEV_EVAL_PRIVATE_ARTIFACTS=1 npm run test:jev:live -- --testNamePattern='boundary-confirmation:'
```

Omit `JEV_EVAL_BOUNDED_RECOVERY` for strict first-attempt evaluation. Recovery imports are selected separately with `--testNamePattern='recovery:'`; their private input artifacts must already exist and pass schema validation. Provider-free stale-finalization is selected with `--testNamePattern='persistence:'`; concurrent-write verification uses `--testNamePattern='concurrency:'`. These commands intentionally make paid provider requests only for model-bearing selections.
