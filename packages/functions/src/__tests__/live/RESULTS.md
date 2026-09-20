# Historical JEV evaluation checkpoint — September 20, 2026

Status: **quality parity is not established; do not recommend switching Doris yet.** This is an active investigation, not a completed rollout.

The historical suite at this checkpoint exercised 20 scenarios through the real local HTTP API, real Firestore emulator, and real `jev-1.13.0` using the dev secret. It includes retained May backend conversations, July raw and Doris-forwarded requests, an August voice-note adaptation, and three backfilled calendar weeks. Every response is checked against persisted state. See [README](README.md) for provenance, limitations, and reproduction commands.

## Evidence retained from the earlier implementation

- Repository validation: 102 test files, 1,822 tests passed; typecheck, lint, and architecture checks passed. API build passed.
- Live seed `20260920`: 16 of 20 scenarios passed after bounded matching and explicit source-slot decisions.
- Live seed `20260921`: 16 of 20 scenarios passed with the same four failures. Generation randomness is isolated from network/repository randomness. Provider results can still vary.
- Earlier intermediate runs varied considerably. Their best counts are not evidence that the final implementation is reliable.

The four remaining failures in both latest runs were:

1. The terse July request, “New dinner sat and thurs,” caused an unnecessary clarification for Saturday dinner. Doris's fully worded backend request passed.
2. The August compound request could not confidently select a no-cook Sunday lunch. It left the whole plan unchanged rather than partially applying the removals and other replacements.
3. The actual May backend correction rejected baked spaghetti by name, but the classifier did not confidently resolve that as a Tuesday dinner replacement. The whole plan remained unchanged.
4. The raw May swap-then-remove sequence could not resolve the final Wednesday dinner action. The historical Doris/GPT exchange also required correction, but that does not make this passing behavior.

Successful cases included explicit meal exchanges, family/adult breakfast separation, unchanged ambiguous breakfasts, named and unnamed replacement follow-ups, the separate May family-preference sequence, explicitly choosing frozen pizza, calendar-driven easy dinners, and negative cases involving withheld approval, contextual information, or unsupported work. Success here means the scenario's assertions passed, not a guarantee for all similarly worded requests.

## Application bugs repaired during evaluation

- Local startup fetches `TYPESAFE_API_KEY_DEV` while preserving the runtime environment variable `TYPESAFE_API_KEY`.
- Provider probability validation accommodates observed two-decimal rounding while rejecting malformed distributions.
- Candidate questions are sent in batches of at most 16 under a shared deadline. All operations remain atomic across batches.
- Minimum-effort meals can be replaced by another minimum-effort meal, and an empty dinner slot can receive an explicitly requested easy meal.
- A day's usual dinner effort minimum is a selection preference, so it does not exclude an explicitly requested frozen pizza.
- An uncertain preliminary effort judgment no longer vetoes an otherwise valid swap; candidate matching still evaluates requested effort.
- Explicit source-slot decisions handle transfers of existing meals. Candidates and the final combined plan still pass structural validation.
- Unqualified breakfast requests are guarded when both tracks exist.
- Explanations retain the old and new meal names, and prior replacement targets support unnamed follow-ups.
- Replacement ordering prefers meals outside the 21-day recency window, with least-recent fallback.

These changes have regression tests. Failed live scenarios remain ordinary failing tests in the opt-in suite; they were not skipped or converted to expected failures.

## Separate generation limitation

The catalog has seven adult breakfasts, three requiring prep ahead, and only six low-effort non-prep family lunches. No-repeat, low-effort breakfast/lunch, and the three-prep-meal cap cannot all hold simultaneously. The existing generator's repeats and higher-effort lunch fallbacks are recorded separately from JEV errors. No recipe-level no-cook or nutrition guarantees were established.

## Remaining work

Resolve the four live failures, add counterexamples for each interpretation change, and repeat the full live suite across seeds before claiming comparable capability. Recheck rejection history across the complete original May conversation, not only the isolated family-preference segment. Telegram delivery, OpenClaw scheduling, finalization, and shopping-list delivery have not been exercised or changed.
