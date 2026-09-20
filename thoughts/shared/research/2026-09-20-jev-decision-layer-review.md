# JEV decision-layer review and proposed behavioral contract

Date: September 20, 2026

Status: Historical pre-implementation review. The implementation and live evaluation have since advanced; use `packages/functions/src/__tests__/live/CURRENT-EVALUATION.md` and the meal-planning architecture document for current behavior and evidence. The checkpoint below is preserved as the review baseline, not a current build result.

Scope: Local `mealplan-jev` worktree at HEAD `252697f5463daaafff5250b8147aa526d54f93dc`, including existing uncommitted changes. Production was not inspected or changed.

Input: [Problem statement and proposed direction](../plans/active/2026-09-20-jev-meal-plan-decision-layer.md).

## Recommendation

Proceed with a controlled comparison of the current pipeline and direct final-slot selection. Start with the simpler direct-selection hypothesis: JEV chooses actual assignments using shared evidence; BradOS converts changed choices into minimal operations, validates the combined plan, and returns specific conflicts for bounded reconsideration. Add candidate scoring or sequential selection only if measured failures justify them.

The proposal identifies the main issue correctly: JEV currently judges intent and acceptable candidates, while backend filters and recency-first ordering determine much of the result. Removing those intermediate decisions could improve the workflow, but does not establish quality or lower total cost. The current evidence is insufficient for a rollout recommendation.

## Baseline reconciliation

| Item | Verified local evidence | Consequence |
| --- | --- | --- |
| Recorded live result | `RESULTS.md` reports 16/20 for each of two seeds. | Treat this as a historical checkpoint, not the current pass rate. |
| Current live inventory | 24 expanded cases: one generator-only case and 23 critique cases, with up to 36 critique calls when earlier assertions pass. | Four added cases are outside the recorded checkpoint. |
| Evidence classes | Original/adapted user text, historical Doris requests, manually explicit rewrites, reconstructed plans, and retrospective calendar annotations coexist. | Report them separately; an authored rewrite does not prove Doris produces it. |
| No-cook counterfactual | One explicit test rearranges adult breakfasts to free prep capacity. | Useful for isolating interpretation, but not a replay of the original constrained plan. |
| Readback | Critique responses are compared with fresh saved-plan reads. | Good persistence coverage for draft plan contents. |
| Missing coverage | No exact saved-history assertions, finalized `/revise` calls, finalized recency checks, or actual Doris execution in the live suite. | Draft pass counts cannot establish complete-workflow success. |
| Reproducibility | Random state advances across the suite; generation also uses the current date. | A seed alone does not freeze the starting plans. |
| Measurement | Successful JEV calls log optional usage and request IDs; critique helper records timing after successful assertions. | No complete per-turn cost record, failed-turn latency distribution, or GPT comparator is retained. |

Several replacement assertions also need an explicit nonempty result: rejecting the previous meal ID alone allows an accidental removal to pass. Preserve full-slot comparisons for unrelated entries.

Sources: [checkpoint](../../../packages/functions/src/__tests__/live/RESULTS.md), [live cases and helper](../../../packages/functions/src/__tests__/live/mealplan-jev.live.test.ts), [fixture provenance](../../../packages/functions/src/__tests__/live/README.md), and [generation clock](../../../packages/functions/src/services/mealplan-generation.service.ts).

The live directory and its dedicated configuration are currently untracked, while the decision service and related tests are modified. A baseline run must include these files in its manifest, not just the Git commit. This review did not rerun paid live inference.

## Proposed behavioral contract

### Responsibilities and evidence

- **Doris supplies context:** retain Brad's original words separately from resolved slot references, interpretation, relevant calendar facts, and inferred requirements. Explicit user statements take precedence over an inferred preference. Conflicting interpretations remain visible.
- **BradOS supplies authoritative state:** current saved plan, session catalog snapshot, slot identities, relevant recorded turns, and versioned rules. Preserve the actual slot matrix; historical 21-slot plans do not acquire adult breakfasts during revision.
- **JEV selects assignments:** choose from real catalog meals, preservation, explicit clearing, and unresolved outcomes. Missing ingredient or serving-time evidence is not a positive fact.
- **BradOS validates and persists:** validate the entire proposal against its starting state, persist only authorized changes, and expose an outcome that Doris can verify through readback.
- **Doris reports observed results:** compare requested changes with persisted state and explain the specific remaining question or conflict. Approval for finalization and shopping-list actions remains separate.

These are conceptual data requirements, not a mandate for new endpoints or a migration. The current strict input accepts only a 2,000-character `critique`; it cannot yet reliably retain a separate original request, structured interpretation, calendar evidence, and provenance. Define a backward-compatible representation before implementation. Direct clients without Doris must remain supported or explicitly excluded from the experiment.

Do not silently equate session creation time with the planning week's dates. Likewise, a later addition to the live meal catalog is absent from an older session snapshot; explain that distinction rather than claiming the meal does not exist.

### Rules and preferences

| Class | Proposed treatment |
| --- | --- |
| Structural validity | Existing unique slot identities; known catalog IDs for replacements; exact meal type and audience; one final assignment per changed slot. Always enforce. |
| Explicit requirements | Exact named meals, clears, exclusions, no-cook requirements, and specified audiences. Do not substitute an easier-to-satisfy interpretation. If evidence is insufficient, identify it. |
| Household policies | Repetition, prep capacity, and red-meat restrictions need a named policy and an explicit override rule. Preserve current enforcement during the initial comparison; do not silently relax it. |
| Preferences | Recency and usual effort targets should influence choices without overriding an exact request unless an agreed mandatory policy applies. Evaluate changing today's effort ceilings as a separate experimental factor. |
| Legacy exceptions | Preserve unrelated assignments and allowed pre-existing violations. Do not force a whole-week repair during a local edit. |

Current compatibility details matter: duplicate exceptions depend on the original occurrence slots; adult breakfast repetition is allowed when the snapshot has fewer than seven unique adult breakfast IDs; prep capacity is counted per occupied slot and allows a non-increasing pre-existing overage above three. Red-meat enforcement is currently in the critique service, not the operations validator. Generation uses additional fallbacks and is not the revision contract.

Policy decisions still required: whether explicit requests may override repetition, prep, or red-meat policies; whether weekday effort ceilings are mandatory; and how a user-authorized override is represented. These should be visible decisions, not assumptions buried in candidate filtering.

### Representative outcomes

| Request/context | Required result |
| --- | --- |
| “Remove Monday.” | Clear every Monday slot actually present, including adult breakfast; preserve every other slot. |
| “We just had baked spaghetti.” One uniquely matching assignment exists. | Replace that food, keep the slot filled, and record its rejection for relevant follow-ups. |
| “No Tuesday dinner needed.” | Clear Tuesday dinner; do not choose a replacement. |
| “New dinner sat and thurs.” | Replace both named dinners and preserve unrelated assignments. |
| “Swap Wednesday and Thursday dinners, then remove the tuna.” | Resolve source meals from the pre-edit plan and apply the final assignments together. Ask only if the tuna reference remains ambiguous. |
| “Try something else again.” | Use the latest applicable resolved replacement turn, exclude relevant prior rejections, and avoid replaying earlier edits. Clarify if multiple targets remain plausible. |
| “Change breakfast.” Both tracks exist. | Ask which audience unless the conversation resolves it; do not infer Brad's track merely from the speaker. |
| “No-cook Sunday lunch.” | Choose only when serving-time evidence supports it. Low effort alone does not prove no cooking. Distinguish missing evidence from catalog infeasibility. |
| Exact dish is absent from the session snapshot. | Explain the unavailable choice in that session; do not silently select another meal. |
| Two equally suitable dinners remain. | A spread-out preference distribution alone should not require Brad to choose. |
| Acknowledgement, finalization, shopping request, or calendar information without a meal-edit request. | Do not revise the plan through critique interpretation. |

Use distinct outcomes: `applied`, `no_change_requested`, `clarification_required`, `insufficient_evidence`, `infeasible`, `validation_failed`, `service_failed`, and `stale_state`. An exhausted search or an uncertain model rejection is not proof of infeasibility. Compound edits are all-or-nothing unless Brad explicitly requests partial application.

## First experiment

1. Freeze the starting plan, catalog, evaluation date, relevant history, and input provenance for each case. Retain the existing pipeline as the control.
2. Supply a shared evidence envelope and ask for final assignments. For each slot, expose preservation, clearing where meaningful, type/audience-compatible catalog options, and an unresolved outcome. Avoid duplicate equivalent options such as both “preserve” and the same current meal ID.
3. Preserve all catalog evidence initially; limit selectable choices only by structural eligibility in the direct-selection variant. Validate mandatory week-level policies on the combined proposal. Measure the effect of relaxing preference filters separately.
4. Use the complete proposed plan for reasoning, but emit minimal operations. Preserving an empty slot with the label “Eating out” must retain that label; clearing it is a different action. Stable choices should not trigger recency writes.
5. On a resolvable joint conflict, supply the full proposal, involved slots, specific rule, and fixed unaffected assignments for reconsideration. Permit all affected requested slots in the conflict to change together. Never expand into unrelated slots just to satisfy a constraint.
6. Start the experiment with at most one semantic reconsideration and a shared time budget; record unresolved conflicts. This is an experimental bound, not a product requirement. Keep provider retries separately observable.
7. Before persistence, verify the session has not changed since inference began. A stale proposal must not overwrite a newer critique or a newly finalized plan. Save and read back the actual result.

A collection of independent slot questions cannot guarantee a coordinated week. That is why the combined validator and conflict context are essential. Choice is the simplest starting primitive; Score is a justified alternative for comparable candidate suitability only if direct selection demonstrates a problem it solves. Do not interpret a Choice distribution as an absolute suitability score or blindly reuse today's 0.80 threshold across dozens of acceptable meals.

TypeSafe currently documents parallel questions, Choice options, structured question descriptions, and Score rubrics. The local adapter supports string-based Choice/Noul questions only, and has a 100,000-character request guard. The documented Choice maximum is 255 options. Measure serialized size and billed tokens; do not assume that sharing context makes it free. Sources: [parallel questions](https://docs.typesafe.ai/patterns/fan-out), [Choice](https://docs.typesafe.ai/primitives/choice), [Score](https://docs.typesafe.ai/primitives/score), [API](https://docs.typesafe.ai/api), and [confidence](https://docs.typesafe.ai/confidence). The building-guide page could not be retrieved during this review; the other references were available.

## Persistence issues to include in the design

| Finding | Required handling |
| --- | --- |
| History uses `FieldValue.arrayUnion` on message objects. Identical feedback can disappear while a different assistant reply remains. | Retain distinct logical turns and rejection chronology; separately deduplicate retries of the same request. Verify with real emulator storage. |
| Joint validation and a single document write do not protect against concurrent edits. | Use a version/precondition or equivalent transaction at persistence; test overlapping critiques and finalize races. |
| All-slot operations rewrite names and validate untouched legacy entries. | Preserve unchanged entries exactly and diff to genuine edits. |
| Clarifications are saved, while validation/provider failures follow different retention paths. | Specify which outcomes belong in conversation history and which belong in attempt diagnostics. Never label proposed operations as applied. |
| Finalized recency reconciliation runs after plan persistence and uses mutable session timestamps for all retained meals. | Test both routes and failure recovery. Report that recency does not prove meal dates or consumption. Do not silently redefine recency during this experiment. |

Sources: [atomic operations](../../../packages/functions/src/services/mealplan-operations.service.ts), [session repository](../../../packages/functions/src/repositories/mealplan-session.repository.ts), [routes](../../../packages/functions/src/handlers/mealplans.ts), [recency](../../../packages/functions/src/services/mealplan-recency.service.ts), and [input/history schemas](../../../packages/functions/src/schemas/mealplan.schema.ts).

The existing Doris skill also asks Doris to compute final transfers, screen candidate eligibility, and provide acceptable choices. Measure those contributions explicitly when evaluating the new division of responsibility. Authored backend instructions are a useful isolated test but not evidence of actual interpreter performance.

## Evaluation and rollout decision

Retain per-run manifests containing code/configuration/fixture hashes, model version, frozen clock, starting plans, source categories, policy version, and generation seeds. Capture relevant input, question options, raw judgments, filter exclusions, conflicts, correction attempts, final state, exact saved history, and recency readback in access-controlled evaluation artifacts. Keep household text and calendar details out of routine production logs.

Report interpretation errors, missing evidence, candidate exclusion, proven infeasibility, composition/validation failures, persistence errors, and provider failures separately. Correct no-change responses and necessary clarification belong in their own successful categories. Show complete-conversation success alongside per-turn results so that one failure does not disappear inside an aggregate count.

Run matched cases for the current pipeline and direct selection, with repeated trials and held-out wording. If comparing against GPT-5.2, rerun a fixed comparator on the same evidence where available; historical replies alone are not a controlled baseline. Measure latency for failed turns as well as successful ones, provider retries, internal corrections, and user clarification. Total inference cost must include Doris plus JEV/GPT, use recorded usage and dated pricing, and mark unavailable billing as unknown rather than zero.

Before evaluating a rollout candidate, agree numeric targets for acceptable task-success regression, unnecessary clarification, latency, and cost reduction. No numeric quality-parity or cost target is agreed in the attachment. Require zero observed unauthorized removals, unrelated edits, or silent partial commits in the acceptance set, while acknowledging that finite tests do not prove their absence in production.

The rollout decision should follow actual Doris interpretation and readback checks, both API routes, repeated held-out results, and a tested rollback to a preserved prior implementation. A unit-test pass or a better aggregate live score is insufficient by itself.

## Verification and source fingerprint

Fresh checks ran under Node 22.23.2 against the existing working tree:

- API `npm run build`: passed.
- Typecheck, lint, and architecture: passed; architecture reported 23/23 checks.
- Full `npm run validate`: did not pass. The first sandboxed run encountered denied local socket binding. With local socket access, two runs still failed on 5,000 ms test timeouts: 1,800 passed / 22 failed, then 1,775 passed / 47 failed, across 102 files with zero skipped tests. The changing failure set suggests intermittent behavior, but its cause was not established.
- On the last run, the JEV transport tests (58), critique tests (32), and JEV handler tests (2) passed. These isolated passes do not override the full validation failure.

The full baseline remains unverified until the timeouts are diagnosed and validation passes. No application source was changed during this review. Retained diagnostics: [latest test log](../../../.validate/test.log), [first socket-enabled log](/private/tmp/mealplan-jev-baseline-test-timeouts.log), and [final failures with source locations](/private/tmp/mealplan-jev-baseline-failures.md). The latest log can be overwritten by future validation runs.

No live inference, production update, finalization, shopping-list generation, or Telegram send was performed for this review.

SHA-256 fingerprints taken from the reviewed local files:

| File | SHA-256 |
| --- | --- |
| `mealplan-critique.service.ts` | `3cbc275940c0775b9b9ae00c026d7118040f9380fcfd17ad6bca4a30b47882ce` |
| `mealplan-jev.service.ts` | `c4ca86f7e0cdca5d5b5c98d365d601060010cb30f783cd479bef2c7bff341025` |
| `mealplan-operations.service.ts` | `7c55c5ef4873c1123202f0ce5bed9ed963f3e6e695089a2fe78bb1aa50193841` |
| `mealplan-jev.live.test.ts` | `0f13f56f9515f9292f266aa1c2b06bf8bc332242b9cda030fb012ab622f13373` |
| `RESULTS.md` | `1fd4b697ba017c569596f67421d582468ace489aee336720c25102daa6a76205` |

These identify key reviewed files; they are not a complete reproducible-run manifest.
