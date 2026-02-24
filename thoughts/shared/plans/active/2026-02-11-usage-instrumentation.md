# Usage Instrumentation Plan

## Overview

Add self-instrumentation to Cloud Functions to track API usage against free-tier limits. The iOS app will later consume this data via a dashboard endpoint.

## Current State

### What we're tracking and their free tiers

| Service | Free Tier | Granularity | What to count |
|---------|-----------|-------------|---------------|
| Firestore reads | 50k/day | Daily | `.get()`, `.where()...get()` |
| Firestore writes | 20k/day | Daily | `.set()`, `.add()`, `.update()` |
| Firestore deletes | 20k/day | Daily | `.delete()` |
| Cloud Functions | 2M invocations/month | Monthly | HTTP requests |
| Cloud Functions compute | 400k GB-sec/month | Monthly | Execution time × memory |
| GCP TTS | 4M chars/month (standard), 1M (WaveNet) | Monthly | Characters in `text` field |
| OpenAI | No free tier | Monthly | Tokens + estimated cost |

### Existing code patterns

- **OpenAI**: 3 identical `callOpenAIWithRetry()` functions across `today-coach.service.ts:365`, `cycling-coach.service.ts:201`, `mealplan-critique.service.ts:141`. All already log `prompt_tokens`, `completion_tokens`, `total_tokens` via Firebase logger — but don't persist. Plus 1 iOS-side call in `FoodScanService.swift` (bypasses backend, calls OpenAI directly — out of scope for now).
- **TTS**: Single call site in `handlers/tts.ts:76`. Character count available from `req.body.text.length`.
- **Firestore**: All access flows through `getFirestoreDb()` singleton in `firebase.ts:28`. Two access patterns: repositories (17 classes extending `BaseRepository`) and direct service access (`firestore-cycling.service.ts`, `firestore-recovery.service.ts`).
- **Cloud Functions**: 22 handler apps, each an Express app. All share the same middleware pattern: cors → json → stripPathPrefix → requireAppCheck → routes → errorHandler.

### iOS-side OpenAI call (deferred)

`FoodScanService.swift` calls OpenAI directly from the device. This bypasses our Cloud Functions entirely. We should eventually route this through a backend endpoint so it gets instrumented, but that's a separate task.

## What We're NOT Doing

- Wrapping the Firestore client with a Proxy (too complex, fragile across SDK updates)
- BigQuery billing export (good for reconciliation later, not needed for MVP)
- Datadog or third-party monitoring
- iOS-side instrumentation (FoodScanService direct OpenAI call)
- Real-time WebSocket updates (polling is fine for a cost dashboard)

## Architecture

### Core concept: `UsageTracker` service + `FieldValue.increment()`

A singleton `UsageTracker` that exposes methods like `trackFirestoreRead(count)`, `trackOpenAI(tokens, cost)`, `trackTTS(chars)`, etc. Under the hood, it batches increments in memory and flushes to a Firestore counter document using `FieldValue.increment()` — atomic, no read-before-write, single write per flush.

### Storage: `usage/{YYYY-MM-DD}` documents

```typescript
interface DailyUsageDoc {
  date: string;                    // "2026-02-11"
  firestore_reads: number;
  firestore_writes: number;
  firestore_deletes: number;
  function_invocations: number;
  function_compute_ms: number;     // total execution time in ms
  tts_characters: number;
  openai_prompt_tokens: number;
  openai_completion_tokens: number;
  openai_total_tokens: number;
  openai_estimated_cost_cents: number;
  openai_requests: number;
  updated_at: string;              // ISO timestamp
}
```

Monthly aggregation is just a sum query over the date range for monthly-granularity services (functions, TTS, OpenAI).

### Batching strategy

**Problem**: Writing to Firestore on every single operation would itself blow through the write free tier.

**Solution**: In-memory accumulator that flushes once per request lifecycle. Express middleware captures the response `finish` event and calls `usageTracker.flush()`. This means at most 1 extra Firestore write per API call. Since we're already doing Firestore operations per request, this is marginal overhead.

### Firestore operation tracking approach

Rather than wrapping the Firestore client (which would require proxying `CollectionReference`, `DocumentReference`, `Query`, etc.), we instrument at the **repository and service level**:

1. **BaseRepository**: Add tracking calls to the base class methods (`create`, `findById`, `findAll`, `update`, `delete`). Since all 17 repositories extend this, we get coverage for free.
2. **Direct-access services** (`firestore-cycling.service.ts`, `firestore-recovery.service.ts`): Add a lightweight `trackRead()`/`trackWrite()` helper that they call alongside their Firestore operations. These services have known patterns — a `getUserDoc()` helper at the top of each that we can instrument.
3. **Batch operations**: The `batch.commit()` calls in mesocycle service and recovery service already know how many operations they contain — track those counts.

This won't be 100% precise (we might miss edge cases), but it'll be within ~90% accuracy — more than enough for "am I near the limit?"

## Implementation Phases

### Phase 1: UsageTracker service + storage

**Files to create:**
- `packages/functions/src/services/usage-tracker.service.ts`

**What it does:**
- Singleton with in-memory counters
- Methods: `trackFirestoreRead(n)`, `trackFirestoreWrite(n)`, `trackFirestoreDelete(n)`, `trackFunctionInvocation(durationMs)`, `trackTTS(charCount)`, `trackOpenAI(promptTokens, completionTokens, estimatedCostCents)`
- `flush()` method: writes accumulated counters to `usage/{YYYY-MM-DD}` using `FieldValue.increment()`, then resets in-memory counters
- Uses `getCollectionName('usage')` for env-prefixed collection

**Type to create:**
- `packages/functions/src/types/usage.types.ts` — `DailyUsageDoc` interface

**Success criteria:**
- Unit tests for accumulation and flush logic
- Flush produces correct `FieldValue.increment()` calls
- Zero counters don't produce unnecessary writes

### Phase 2: Express middleware for function invocations

**Files to create:**
- `packages/functions/src/middleware/usage-tracking.ts`

**What it does:**
- Express middleware that records `start = Date.now()` on request
- Listens for response `finish` event
- On finish: calls `usageTracker.trackFunctionInvocation(elapsed)` then `usageTracker.flush()`
- This is the single flush point — all tracking accumulated during the request gets written here

**Files to modify:**
- Each handler file (22 files) to add `app.use(usageTracking)` after `requireAppCheck`
- OR: create a shared `createApp()` factory that applies all standard middleware including usage tracking, reducing boilerplate

**Success criteria:**
- Every API call records an invocation + duration
- Flush happens exactly once per request

### Phase 3: OpenAI tracking

**Files to modify:**
- `packages/functions/src/services/today-coach.service.ts` (~line 383-391)
- `packages/functions/src/services/cycling-coach.service.ts` (~line 220-228)
- `packages/functions/src/services/mealplan-critique.service.ts` (~line 159-167)

**What it does:**
- After the existing `info()` log call in each `callOpenAIWithRetry`, add:
  ```typescript
  UsageTracker.getInstance().trackOpenAI(
    usage?.prompt_tokens ?? 0,
    usage?.completion_tokens ?? 0,
    estimateCostCents(OPENAI_MODEL, usage)
  );
  ```
- Add a `estimateCostCents(model, usage)` helper in the usage tracker that uses hardcoded per-model pricing (easy to update, good enough)

**Optional improvement:** Extract the 3 duplicate `callOpenAIWithRetry` functions into a shared `packages/functions/src/services/openai.service.ts` utility. This would DRY up the code AND centralize instrumentation. But this is a refactor — can be done later.

**Success criteria:**
- Every OpenAI call records prompt/completion tokens and estimated cost
- Pricing estimates are within 10% of actual (verify against OpenAI dashboard)

### Phase 4: TTS tracking

**Files to modify:**
- `packages/functions/src/handlers/tts.ts` (~line 59, after extracting `text`)

**What it does:**
- After `const { text } = req.body as SynthesizeRequest;`, add:
  ```typescript
  UsageTracker.getInstance().trackTTS(text.length);
  ```

**Success criteria:**
- Every TTS synthesis records character count

### Phase 5: Firestore operation tracking

**Files to modify:**
- `packages/functions/src/repositories/base.repository.ts` — add tracking to base methods
- `packages/functions/src/services/firestore-cycling.service.ts` — add tracking to direct operations
- `packages/functions/src/services/firestore-recovery.service.ts` — add tracking to direct operations

**BaseRepository changes:**
- In `create()` area: after successful `.add()` → `UsageTracker.getInstance().trackFirestoreWrite(1)`
- In `findById()` area: after `.get()` → `trackFirestoreRead(1)`
- In `findAll()` area: after `.get()` → `trackFirestoreRead(docs.size)`
- In `update()`: after `.update()` → `trackFirestoreWrite(1)`
- In `delete()`: after `.delete()` → `trackFirestoreDelete(1)`

**Problem:** `BaseRepository` has abstract methods — the implementations are in the 17 subclasses. Two options:
a. Add tracking to each subclass (tedious, 17 files)
b. Add non-abstract template methods in BaseRepository that subclasses call, which wrap tracking around the operation

Option (b) is cleaner. Add protected helper methods like `trackingGet()`, `trackingSet()` etc. that wrap the Firestore call + tracking. Subclasses migrate to use these over time.

Actually, even simpler: most repositories follow the same CRUD patterns. We can add a `tracked` wrapper to BaseRepository:

```typescript
protected async trackedGet(ref: DocumentReference): Promise<DocumentSnapshot> {
  const snap = await ref.get();
  UsageTracker.getInstance().trackFirestoreRead(1);
  return snap;
}
```

But this requires touching all 17 repositories to switch from `ref.get()` to `this.trackedGet(ref)`. That's a big changeset.

**Pragmatic approach:** Start with just the `firestore-cycling.service.ts` and `firestore-recovery.service.ts` (the two heaviest Firestore users — bulk health sync can do hundreds of operations per call). Add tracking to BaseRepository's concrete helper methods. Migrate subclasses incrementally — the base class tracking covers the common CRUD patterns, and the two direct-access services cover the bulk operations. This gets us ~80% coverage day one.

**Success criteria:**
- Bulk sync operations (health, cycling) track their Firestore ops
- Standard CRUD via repositories tracks reads/writes/deletes
- Counter values are in the right ballpark (verify against GCP Console usage graphs)

### Phase 6: Usage summary endpoint

**Files to create:**
- `packages/functions/src/handlers/usage.ts`

**What it does:**
- `GET /usage/summary` — returns current day's usage + current month's aggregated usage
- Reads today's doc from `usage/{YYYY-MM-DD}`
- Queries this month's docs for monthly aggregation
- Returns data shaped for the dashboard:

```typescript
interface UsageSummary {
  today: {
    firestore_reads: number;    // vs 50,000 daily limit
    firestore_writes: number;   // vs 20,000 daily limit
    firestore_deletes: number;  // vs 20,000 daily limit
  };
  this_month: {
    function_invocations: number;    // vs 2,000,000 monthly limit
    function_compute_ms: number;     // vs 400,000 GB-sec monthly limit
    tts_characters: number;          // vs 4,000,000 monthly limit
    openai_total_tokens: number;
    openai_estimated_cost_cents: number;
    openai_requests: number;
  };
  limits: {
    // The free tier limits for reference
    firestore_reads_daily: 50000;
    firestore_writes_daily: 20000;
    firestore_deletes_daily: 20000;
    function_invocations_monthly: 2000000;
    tts_characters_monthly: 4000000;
  };
}
```

**Files to modify:**
- `packages/functions/src/index.ts` — add `devUsage` and `prodUsage` exports
- `firebase.json` — add rewrite for `/api/dev/usage/**`

**Success criteria:**
- Endpoint returns current usage with free-tier limits
- Monthly aggregation is correct (sum of daily docs)

## Testing Strategy

**Unit tests:**
- `usage-tracker.service.test.ts` — accumulation, flush, FieldValue.increment calls, date rollover
- `usage-tracking.test.ts` (middleware) — invocation counting, flush on response finish
- `usage.test.ts` (handler) — summary endpoint returns correct shape

**Manual verification:**
- Deploy to dev, use the app for a few minutes
- Check `dev_usage/2026-02-11` doc in Firebase Console
- Compare Firestore operation counts against GCP Console usage dashboard
- Compare OpenAI token counts against OpenAI usage dashboard

## Cost of instrumentation itself

- **1 extra Firestore write per API call** (the flush). If we get 1,000 API calls/day, that's 1,000 extra writes — 5% of the 20k daily free tier. Acceptable.
- **1 extra Firestore read per dashboard view** (reading the usage doc). Negligible.
- **Monthly aggregation**: ~30 reads to sum a month of daily docs. Negligible.

## References

- `packages/functions/src/firebase.ts` — Firestore singleton
- `packages/functions/src/repositories/base.repository.ts` — repository base class
- `packages/functions/src/services/today-coach.service.ts:365` — OpenAI call pattern
- `packages/functions/src/handlers/tts.ts:76` — TTS call site
- `packages/functions/src/middleware/` — existing middleware pattern
