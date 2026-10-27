# Direct JEV candidate evaluation — September 20, 2026

## Frozen candidate 19: closing gate passed

The user accepted a safe unchanged refusal when the original request resolves within **one additional clarification per conversation**. Incorrect or partial writes, lost constraints, or a second extra turn still fail. Production prompts remain frozen. Strict first-attempt assertions remain the default; the opt-in bounded profile records the initial outcome, verified unchanged state/history, authored clarification provenance, extra-turn count, and final state. An applied response only counts after all case assertions pass.

The interrupted candidate-19 run had **66 passing cases, one safe undo refusal, and 25 infrastructure failures**, not 26 model failures. Local socket exhaustion caused `EADDRNOTAVAIL`; the new shared IPv4 HTTP server and a connection pool capped at 50 passed 250 sequential requests using one connection and 100 concurrent requests using at most 50. No operating-system tuning or hidden retries were introduced.

The completed case ledger contains **98 model-bearing conversations: 95 succeeded on the first attempt and three safe refusals resolved with one extra clarification each; zero incorrect persisted changes were observed under candidate 19**. Two generator-only cases bring the total to 100 cases. This ledger combines historical transcript-supported results with the resumed closing runs, as disclosed below. Concurrency, persistence, and the actual-Doris replay are separate checks.

The three extra-turn conversations were seed-20260920 selective undo (reconstructed retained refusal), seed-20260921 selective undo (fresh exact saved refusal), and seed-20260921 Monday/Saturday dinner exchange (fresh exact saved refusal). No conversation received two extra clarifications.

The comparable strict first-attempt score for the preserved GPT implementation is **69/98 model-bearing conversations** (67/90 from its retained earlier matrix plus 2/8 on the fresh boundary trial). Its earlier failures were not offered this new extra-turn profile, so no equivalent overall bounded GPT score is claimed. On the genuinely new final eight conversations both providers had the same one-extra acceptance profile: **JEV 8/8, GPT 2/8**. All six GPT failures persisted edits before an ambiguous audience was clarified; recovery was therefore ineligible.

Completed closing results:

- The 25 interrupted seed-20260921 conversations were replayed: **23 passed on the first attempt**. The seed-20260921 selective undo passed after one recorded extra clarification. One exact dinner exchange safely refused with zero operations; **one clarification against that exact saved refusal state passed** the full expected-plan and history assertions. The original 24/25 test-run score already includes the in-run undo recovery and must not be called 24 first-attempt successes.
- The earlier undo refusal was reconstructed from the reproduced seeded original plan plus exact transcript-recorded operations, explanations, and refusal. **One explicit restore passed**, preserving the accepted Wednesday revision and every unrelated assignment. Original session ID/post-edit time were unavailable and are explicitly synthetic metadata. A separate fresh seeded replay also passed without an extra turn; it is not counted as evidence that the original refusal succeeded initially.
- The four independently authored final boundary scenarios passed **8/8 JEV conversations across two seeds, all on the first attempt** (16 turns). Recovery wording was independently authored before the trial and never used. These are genuinely new first-trial results; the previous two confirmation sets are exposed regressions.
- The exact recovered actual-Doris request passed the frozen candidate-19 backend replay without editing the interpretation. Both JEV and GPT concurrent-write checks passed: one HTTP 200, one conflict, and exactly one persisted user/assistant pair. The provider-free stale-finalization test passed, verifying stale history and stale plan guards plus atomic session/meal-recency readback.
- All fresh JEV workloads used the production 30-second provider deadline. The 25 resumed conversations had median 1,516 ms, p95 2,709 ms, and maximum 3,289 ms per turn. The final boundary trial's maximum was 1,678 ms. Actual-Doris replay took 4,787 ms. No measured fresh turn exceeded 30 seconds.

The source and fixture recovery is documented separately from original raw evidence. A reboot cleared `/private/tmp`, including all pre-reboot full provider artifacts and manifests. Exact source edits were recovered from durable Codex transcripts; the candidate-19 production hash is `3f2b66953d021ca7dfd020b013f68072375e1b81745d80ff20679b3ba6d03f74`. May fixture hashes match retained records; current catalog/calendar fixtures were regenerated from the same retained read-only sources, but their original manifest hashes were not printed and cannot be independently compared. Original counts, selected exact judgments, and run summaries survive in transcripts; this is **not one new 100-case run or a complete recovery of every old raw judgment**. The exact actual-Doris request and evidence JSON were recovered with the original request hash; its raw gateway envelope remains lost. Fresh closing runs now store complete private evidence under the durable worktree `.cache/jev-eval/`.

Strict first-attempt comparisons and bounded readiness are separate. Older GPT trials were not offered the new extra-turn profile, so their strict score must not be presented as an equivalent bounded-resolution score. The final eight boundary conversations use the same profile for both providers. Efficiency remains secondary to correctness.


The recovered fixture hashes used by the fresh closing runs are:

| Fixture | SHA-256 | Historical identity evidence |
| --- | --- | --- |
| `meals.json` | `c4abaac07f0b4fbbc62c734e5bb083bd3c35be4cd8ee86e7cb99c38ae1a7c71f` | Same retained read-only source; original printed hash unavailable |
| `may-catalog.json` | `c7f5862938e9c04492104057493295cc0351759d6a802cb3984b110aa2bf7e56` | Exact retained hash match |
| `may-week.json` | `1fbed056f15430a54dfcb0956a1a6fb4049c90b3382dbf6ead45760837f083a0` | Exact retained hash match |
| `calendars.json` | `65c8f5335f67c08a7e3d60bcf389f3c0b292abf6eecd2da816fbec97e7336bbf` | Same retained read-only source; original printed hash unavailable |

All eight fresh closing manifests recorded the same candidate-19 production source hash above. Final live-project typecheck, focused lint, and whitespace validation passed after the recovery-profile changes.

## Durable closing run index

Fresh full manifests and opt-in private judgments live under `.cache/jev-eval/<run-id>/` in the durable worktree. The table counts physical attempts including provider corrections. Costs are reported measurements, not a comparison of equal successful workloads; GPT's failures end several conversations early.

| Workload | Result | Critique turns / physical attempts | Backend usage estimate | Run ID |
| --- | --- | ---: | ---: | --- |
| Seed21 interrupted conversations | 23 first-attempt +1 in-run extra-turn pass;1 safe refusal subsequently resolved |39 /220|$0.073931634|`2026-09-20T16-27-20-094Z-10396-20260921`|
| Exact exchange recovery + reconstructed original undo recovery |2/2, exactly one extra request each|2 /16|$0.004184208|`2026-09-20T16-30-25-163Z-11254-20260920`|
| Final independent JEV boundary first trial |8/8, no extra turns|16 /54|$0.005826072|`2026-09-20T16-31-08-556Z-11452-20260920`|
| Final independent GPT boundary first trial |2/8;6 incorrect/partial writes|10 /10|$0.034900250|`2026-09-20T16-32-00-339Z-11670-20260920`|
| JEV concurrent writes |1/1;2 simultaneous HTTP requests|1 workload /12|$0.000710556|`2026-09-20T16-34-27-520Z-11951-20260920`|
| GPT concurrent writes |1/1;2 simultaneous HTTP requests|1 workload /2|$0.004826500|`2026-09-20T16-35-11-673Z-12122-20260920`|
| Exact actual-Doris request, candidate19 backend |1/1|1 /13|$0.006590220|`2026-09-20T16-35-21-584Z-12229-20260920`|
| Separate seeded undo replay, no denominator substitution |1/1 on first attempt|2 /16|$0.007506198|`2026-09-20T16-26-46-282Z-10211-20260920`|

The provider-free stale-finalization check passed in 118 ms alongside the JEV concurrency run and made zero provider calls. The one actual Doris interpretation remains the original measured call ($0.00785202); backend replay does not call Doris again. Combining it with the current JEV backend gives $0.014442240 versus the prior preserved GPT backend's $0.015703570 for this single exact workload (about 8.0% lower). This is not a broad cost-savings claim. The earlier matched-turn comparison below belongs to candidate 17, not candidate 19.

## Historical checkpoints before the reboot

Status: candidate 17 passed the complete exposed 38-case matrix on both seeds: 76/76 cases, or 74/74 model-bearing conversations plus two generator checks (110 critique turns). Its separately authored second independent confirmation trial passed 14/16 conversations, with zero incorrect persisted edits and two safe refusals of a supported clarification follow-up. Candidate 18 also safely refused that case on both seeds; the supported case blocked readiness at that checkpoint. The first trial is retained; subsequent changes to address it are exposed regression work. The exact actual-Doris interpretation passed both JEV and preserved GPT backend replays.

The preserved GPT-5.2 implementation scored 57/76 cases across the same exposed matrix: 41/60 development cases and 16/16 first-round confirmation conversations, or 55/74 model-bearing conversations plus both generator checks. Its 19 failures comprised 17 conversations with incorrect or incomplete persisted edits and two safe unchanged outcomes with the wrong infeasibility classification. GPT outperformed candidate 16 on the first independent confirmation set (16/16 versus 10/16); retain that first result when reporting later fixes. On the second independent confirmation set, preserved GPT passed 12/16 conversations: two failures edited an ambiguous breakfast audience, and two failed selective undo while claiming restoration. This compares the preserved implementation under the same shared persistence and validation guards, not model ability under identical prompts.

Aggregate run costs are not a fair savings estimate when failures stop conversations early. For candidate 17 versus the refreshed comparator, 55 identical-input turns from cases both providers passed cost $0.116746518 for JEV versus $0.193556650 for GPT-5.2 (39.68% lower). They used 312 versus 55 physical requests, respectively. Matching requires the same seed, case, turn index, request/context, starting plan/history, and catalog hashes; Doris is excluded. This supersedes the earlier candidate-11 50.18% comparison for the newer verified pipeline.

One isolated actual Doris interpretation has now been measured: DeepSeek V4.1 Flash used 18,501 input and 5,730 output tokens, took 67,479 ms, and cost $0.00785202. It made zero tool calls, sent no Telegram message, and made no production writes. Its exact validated output passed both backend replays without rewriting the interpretation. JEV took 4,419 ms and cost $0.006497484; preserved GPT took 4,540 ms and cost $0.00785155. Including the same measured interpreter cost gives $0.014349504 versus $0.015703570 for this one paired workload. The single interpreter invocation does not establish scheduling or Telegram delivery readiness.

The opt-in suite uses real provider requests, real local HTTP routes, and a disposable Firestore emulator. Its initial 29-case development set contained the original 24 plus five now-exposed development holdouts for repeated identical rejection, missing evidence, catalog infeasibility, unavailable exact dishes, and finalized revision/recency. One later synthetic core-dish-family policy regression extends current development coverage to 30. Eight independently authored confirmation scenarios and one concurrent-write regression are separate from that denominator. See [README](README.md) for provenance and reproduction. No production plans or Telegram messages are changed.

| Run | Result | Provider attempts | Input / output tokens | Usage estimate | Median turn |
| --- | --- | ---: | ---: | ---: | ---: |
| Direct candidate 17 exposed 38-case matrix, two seeds | 76/76 | 614 | 5,725,651 / 499,392 | $0.240477342 | 1,553 ms |
| Direct candidate 17 second independent first trial, two seeds | 14/16 | 130 | 881,562 / 73,491 | $0.037025604 | Original manifest lost; transcript summary retained |
| Preserved GPT-5.2 second independent first trial, two seeds | 12/16 | 20 | 42,494 / 2,639 | $0.085102500 | Original manifest lost; transcript summary retained |
| Preserved GPT-5.2 current 38-case matrix, two seeds | 57/76 | 104 | 297,609 / 14,918 | $0.363360550 | 2,150 ms |
| Direct candidate 16 development, two seeds | 60/60 | 510 | 5,096,807 / 457,187 | $0.214065894 | 1,559 ms |
| Direct candidate 16 first independent confirmation, two seeds | 10/16 | 91 | 596,896 / 59,191 | $0.025069632 | Original manifest lost; transcript summary retained |
| Direct candidate 15, two seeds | 59/60 | 507 | 4,983,566 / 453,496 | $0.209309772 | 1,582 ms |
| Direct candidate 1 | 3/29; 26 local request-size failures | 6 | Original manifest lost; transcript summary retained | Not computed in that manifest | Not representative |
| Direct candidate 2 | 15/29 | 80 | 1,876,150 / 296,498 | $0.0787983 | 706 ms |
| Direct candidate 3 | 19/29 | 81 | 1,492,231 / 316,147 | $0.062673702 | 612.5 ms |
| Direct candidate 4 | 16/29 | 85 | 946,096 / 78,658 | $0.039736032 | 723 ms |
| Direct candidate 5 | 24/29 | 153 | 1,118,631 / 95,684 | $0.046982502 | 1,144 ms |
| Direct candidate 6 | 28/29 | 172 | 1,370,415 / 101,137 | $0.057557430 | 1,158 ms |
| Direct candidate 11, two seeds | 52/58 | 402 | 3,810,784 / 326,447 | $0.160052928 | 1,362 ms |
| Refreshed GPT-5.2, two seeds | 44/58 | 85 | 254,426 / 11,881 | $0.317848300 | 1,886 ms |
| Preserved GPT-5.2 baseline | 18/29 with the initial strict outcome assertion; 18/24 original scenarios | 40 | 123,546 / 5,833 | $0.1960595 | 2,019.5 ms |
| GPT-5.2 held-out completion | 4/5 semantic cases; legacy outcome field recorded as unavailable | 9 | 19,657 / 787 | $0.02545935 | Original manifest lost; transcript summary retained |

Single-seed runs use `20260920`; the two-seed runs also use `20260921`. Each development matrix includes one generator-only case per seed; all other cases contain model-bearing conversations. A later failed turn fails its whole case. Case counts, conversation counts, and actual critique-turn counts are distinct. They are not comparable solely by aggregate cost: failed scenarios can stop early, and each candidate's number of inference calls differs. Dollar values are estimates from provider-reported usage and dated official prices, not invoices. The table contains backend execution only; the separately measured Doris invocation is excluded.

The candidate-17 matrix used the production default `JEV_TIMEOUT_MS=30000`; the harness never overrides it or mocks transport clocks. Its 110 critique turns had median 1,553 ms, nearest-rank p95 3,071 ms, maximum 3,923 ms, and zero turns over 30 seconds. The larger Vitest deadline is only an outer test timeout.

The first three generator checks produced identical five-week plan hashes, including when generation was run by itself. Later fixture hardening also normalizes generated session timestamps and uses seed-derived synthetic recency meal IDs. Transport clocks remain real.

## Findings retained from the initial candidates

- Candidate 1 exceeded the adapter's 100,000-character guard for full-catalog requests. These failures made no provider request. The tiny-catalog real critique/finalize/revise case passed its history and recency checks.
- Candidate 2 failed mainly through declined or unresolved edits and joint-choice conflicts. A stale-session history baseline in one pre-existing test was corrected: the second request now uses the immediately preceding saved session. No plan assertion was relaxed.
- Candidate 3 improved many requests but still persisted an ambiguous breakfast edit and reused an earlier rejected meal. Both are readiness blockers. Other failures include repeated dinner choices, incomplete terse compound edits, unhelpful bounded corrections, and a correction request exceeding the local size guard.
- The preserved GPT baseline also made unsafe edits: it changed ambiguous breakfast targets, partially applied an ambiguous compound request, changed meals from calendar context alone, and partially cleared a meal when the explicitly atomic ingredient-evidence request could not be fulfilled. It also reused an earlier rejected meal in the original May follow-up.
- GPT's original API does not return the new structured outcome field. The five held-out cases were rerun with that capability gap explicitly recorded so all existing plan/history/recency assertions could execute. This gives a provisional combined 22/29 semantic baseline, not a new full-suite pass and not structured-outcome parity.

- Candidate 4 refused correct changes because its broad scope-confidence gate rejected valid scopes; its clear gate also refused three explicit removals. All 13 failures remain recorded.
- Candidate 5 applied no incorrect edits in this run, but refused five supported conversations: exact breakfast transfers, a feasible compound counterfactual, the original May transfer/removal request, and two dinner-rejection follow-ups. Its empty semantic-fit pool was incorrectly called infeasible, which later candidates corrected to `validation_failed`.
- Candidate 6 passed 28/29 development cases. The original May request still failed safely with an unchanged plan because scope classification confused the intermediate exchange with the final removal. That remaining supported failure blocks readiness.
- A targeted candidate 7 May rerun still failed safely. Its intermediate transfer identities were correct, but the final action/review stages disagreed. The independent live JEV concurrency regression passed: two simultaneous real-provider requests returned one successful applied edit and one `409 SESSION_CONFLICT`; fresh history contained exactly one user/assistant pair.

- Candidate 8 passed the May final-scope review but could not verify any eligible replacement: its per-food confidence scores were depressed by the compound request. The unchanged plan and explicit `validation_failed` outcome were retained; no expectation was relaxed.

- Candidate 9 kept the plan unchanged when a wrong May scope passed its scope review but failed the later food-fit check. This demonstrates why the independent final checks remain necessary; it is still a failed supported request.

- Candidate 10 correctly resolved the May transfer/removal scope and selected structurally valid foods, but its final joint-food check declined the proposal. It again preserved the plan. The result remains a supported-request failure rather than being counted as a safe-outcome success.

- Candidate 11 passed the targeted three-turn May replay, then scored 26/29 cases on each development seed. Four failures safely refused exact transfers after scope questions mistakenly introduced a concrete lunch-removal example from their own instructions. One repeated-rejection case persisted a previously rejected meal. One feasible counterfactual failed safely because the provider's chosen option disagreed with its returned highest probability. This was an HTTP-200 provider response rejected by adapter validation, not a network failure. All six failures remain visible.
- The refreshed GPT baseline scored 22/29 cases on each seed. Its 14 strict contract failures comprise 11 conversations with incorrect or incomplete persisted edits, two proven-infeasible cases safely refused with the wrong structured classification, and one feasible breakfast exchange safely declined. They are not 14 wrong meal writes. The missing legacy outcome field is recorded separately wherever absent. Every provider response was followed by an actual saved-plan read; later harness strengthening additionally performs exact unchanged-history assertions before preserving the expected error failure.

- Candidate 12's two-seed targeted regression passed 9/10 conversations. Repeated rejection and the original May progression passed both seeds. The remaining adult-breakfast exchange was safely refused because a meal already repeated in the generated plan could not be moved despite leaving its total frequency unchanged. Its final full development evaluation has not yet run.

- Candidate 13 issued zero provider requests before local transport stalled. The owned Vitest process was stopped, the pre-existing emulator was preserved, and a separate `run-status.json` records `infrastructure_aborted` without rewriting the original manifest. Its hook failure is not a model-quality failure. At that checkpoint, the newly added core-dish-family policy regression and all eight final confirmation prompts were unrun.

- Explicit IPv4 listener readiness fixed the local transport issue: a generation-only diagnostic completed five real emulator weeks without provider calls. Candidate 14 then passed 10/12 targeted conversations. Both safe failures were the prep-freeing counterfactual: per-slot actions were correct, but an independent audience question failed to combine separately stated family and Brad breakfast removals. The guard rejected that contradiction. The new core-dish-family regression passed both seeds. The eight final confirmation prompts remain unrun.

- Candidate 15 passed the two-seed prep-freeing counterfactual regression, then passed 29/30 and 30/30 development cases (57/58 conversations plus both generator checks, with 92 critique turns). The sole failure was the raw July request, “Remove lunch on Tuesday and Friday and Sunday. New dinner sat and thurs”. Both scope passes omitted the Saturday dinner replacement. Independent scope reviews rejected the incomplete action list, producing `validation_failed` with zero operations and an unchanged saved plan. The raw judgments and failure remain retained. All eight final confirmation prompts remain unrun.

- Candidate 16's full development matrix passed 60/60 cases. The first independent confirmation matrix then passed 5/8 cases on each seed. Both preservation failures followed a contradictory forwarded critique and interpretation instead of the explicit original-user instruction to leave every current assignment unchanged. The named-breakfast exchange selected the correct Monday/Tuesday transfer identities on both seeds, but also proposed an unrelated Sunday transfer where a dish repeated on seed 20; the audience guard correctly rejected that extra move. Seed 21 incorrectly treated the hypothetical transfer preview as already persisted and returned no change. Both narrower dinner-rejection follow-ups correctly targeted Thursday dinner yet spuriously requested clarification about Thursday breakfast. All six failures retain exact saved results and raw judgments; no assertion was changed to make them pass. The three failing scenarios are now exposed to the implementation author, while their independent authorship and original first-trial result remain recorded.

A separate provider-free emulator regression passed after candidate 15: same-timestamp history and plan changes each reject stale finalization without changing session or meal documents; finalizing the current state commits the flag and assigned meal recency at one timestamp. It makes no provider call and is outside the model-quality denominator. The existing real HTTP critique/finalize/revise recency scenario also passed both candidate-15 seeds.

## Read-only diagnostic accounting

After candidate 18 safely refused the supported clarification follow-up on both seeds, eight read-only scope-review probes compared the exact saved review with three source-derived representations. Original wording and a simpler question both rejected the correct action lists. Adding exact chronological user/assistant messages to state selected correct on both seeds (0.67 and 0.71 probability); repeating the same verbatim history in the question selected correct at 0.71 and 0.53. These are diagnostics, not conversation passes, and made no database writes. All eight physical calls, full wording, raw judgments, 24,824 input/256 output tokens, and $0.001042608 incurred usage estimate are retained privately. No resolved intent or expected target list was added to the source evidence.

## Correctness of the no-cook fixture

For the raw August case at this seed, the three prep-ahead slots are all outside the requested changes. Both non-prep effort-one lunches already occupy unrelated fixed slots. Every other effort-one lunch requires prep ahead. Therefore the original unconditional demand for a different effort-one Sunday lunch is impossible under the no-repeat and prep-cap rules.

The test now proves that necessary-condition failure independently before selecting its expected outcome. If no suitable structural alternative exists, it requires exactly `infeasible`, zero operations, and the entire unchanged plan. If alternatives exist, it retains the original successful-replacement assertions. The separately labeled human-authored counterfactual frees prep capacity and still requires successful application. Previous failed results remain above and in their manifests. Effort is not recipe-level proof of no cooking or ingredient safety.

## Retained local evidence

Private run directories are Git-ignored under `.cache/jev-eval`, with directory mode 0700 and file mode 0600. Manifests retain source/fixture hashes, case seeds, model versions, complete timing and usage, provenance, and readback status. Opt-in files retain full questions, judgments, starting evidence, and saved results without credentials or authorization headers.

- Candidate 1: `2026-09-20T12-58-07-189Z-98472-20260920`
- Candidate 2: `2026-09-20T13-00-03-664Z-176-20260920`
- Candidate 3: `2026-09-20T13-07-02-706Z-3190-20260920`
- Candidate 4: `2026-09-20T13-17-58-739Z-6081-20260920`
- Candidate 5: `2026-09-20T13-23-18-571Z-7830-20260920`
- Candidate 6: `2026-09-20T13-27-21-445Z-8636-20260920`
- Candidate 7 targeted May plus concurrency: `2026-09-20T13-31-31-645Z-10253-20260920`
- Candidate 8 targeted May: `2026-09-20T13-33-24-232Z-10823-20260920`
- Candidate 9 targeted May: `2026-09-20T13-35-23-381Z-11848-20260920`
- GPT concurrency: `2026-09-20T13-32-20-482Z-10525-20260920`
- Candidate 10 targeted May: `2026-09-20T13-37-37-666Z-12649-20260920`
- Candidate 11 two seeds: `2026-09-20T13-49-31-705Z-15567-20260920`
- Refreshed GPT two seeds: `2026-09-20T13-45-03-409Z-14207-20260920`
- Preserved GPT current 38-case matrix, two seeds: `2026-09-20T15-02-12-627Z-32579-20260920`
- Candidate 17 targeted exposed regression, two seeds: `2026-09-20T15-07-41-524Z-36841-20260920`
- Candidate 17 full exposed matrix, two seeds: `2026-09-20T15-09-05-292Z-38128-20260920`
- Candidate 17 second independent first trial, two seeds: `2026-09-20T15-14-43-988Z-42509-20260920`
- Candidate 18 targeted clarification follow-up, two seeds: `2026-09-20T15-20-04-239Z-47221-20260920`
- Read-only scope diagnostic (not conversation evidence): `scope-diagnostic-2026-09-20T15-26-07-308Z-48844`
- GPT second independent first trial, two seeds: `2026-09-20T15-15-56-887Z-44025-20260920`
- JEV actual-Doris replay: `2026-09-20T15-12-28-040Z-39184-20260920`
- GPT actual-Doris replay: `2026-09-20T15-13-41-424Z-40554-20260920`
- Candidate 12 targeted two seeds: `2026-09-20T14-20-15-408Z-20810-20260920`
- Candidate 13 infrastructure-aborted attempt: `2026-09-20T14-28-31-450Z-23524-20260920`
- Candidate 14 targeted two seeds: `2026-09-20T14-35-28-649Z-25849-20260920`
- Candidate 15 full development, two seeds: `2026-09-20T14-39-49-302Z-27076-20260920`
- Candidate 16 full development, two seeds: `2026-09-20T14-48-51-991Z-29368-20260920`
- Candidate 16 first independent confirmation, two seeds: `2026-09-20T14-51-53-901Z-30001-20260920`
- GPT baseline: `2026-09-20T13-03-31-492Z-1671-20260920`
- GPT held-out completion: `2026-09-20T13-06-24-023Z-3003-20260920`

Pricing checked September 20, 2026: [TypeSafe JEV models](https://docs.typesafe.ai/models), [OpenAI GPT-5.2](https://developers.openai.com/api/docs/models/gpt-5.2). Missing usage or failed-request billing remains unknown; known costs are reported separately. The backend runs do not establish Telegram readback/delivery, live scheduling, or shopping-list behavior. The isolated actual Doris interpretation is separately measured above; its unchanged-output backend replay and the interpreter-plus-backend cost comparison are reported above for that single workload.
