# Today Coach Implementation Plan

## Overview

Transform the cycling-specific AI coach into a holistic **"Today Coach"** that analyzes recovery, lifting, cycling, stretching, meditation, and weight data to deliver a personalized daily briefing. The coach card replaces the ReadinessCard on the main Today dashboard, with expandable drill-down sections for each domain. The cycling deep-dive preserves existing Peloton recommendation functionality.

## Current State

**What exists:**
- AI cycling coach at `packages/functions/src/handlers/cycling-coach.ts` — already fetches recovery, lifting schedule, weight, cycling activities, FTP, training load, VO2 max, EF trend, mesocycle context
- `cycling-coach.service.ts` — OpenAI integration with retry, validation, fallback pattern
- `CyclingCoachClient.swift` — iOS client with `@Published` state management
- `ReadinessCard.swift` on Today dashboard — shows recovery score, HRV, RHR, sleep
- `DashboardViewModel.swift` — loads workout, stretch, meditation, meal plan data in parallel
- `CoachRecommendationCard.swift` — rich card UI with loading/error/content states

**What's missing:**
- No unified endpoint that aggregates ALL activity types for AI analysis
- No stretching/meditation data sent to the AI coach
- No cross-domain insights (e.g., "you haven't stretched in 3 days after heavy lifting")
- Coach lives buried in Cycling tab, not on the main Today dashboard
- No daily briefing concept — just a cycling session recommendation

## Desired End State

1. **Today Coach card** on the main Today dashboard replaces ReadinessCard
2. **Daily briefing** — 2-3 sentence personalized summary analyzing all activity data
3. **Section cards** — expandable insights for recovery, lifting, cycling, stretching, meditation, weight
4. **Cross-domain intelligence** — the AI connects dots across domains (e.g., sleep trends + training load, stretching gaps after heavy lifting, meditation streak motivation)
5. **Cycling deep-dive** — full Peloton recommendation preserved within the cycling section
6. **Warnings** — cross-domain alerts (overtraining risk, sleep degradation, stretching neglect)

## What We're NOT Doing

- Not removing the cycling coach endpoint (it stays for backwards compatibility / direct use)
- Not changing how data is collected or synced (HealthKit sync, Strava, etc. stay as-is)
- Not adding new data sources — just aggregating existing ones for the AI
- Not building a chat interface — this is a one-shot daily briefing
- Not touching the Cycling tab's existing coach card (it stays independent)

## Key Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **New endpoint vs. extend cycling coach** | New `/today-coach/recommend` endpoint | Cleaner separation, different response shape, different prompt |
| **AI model** | `gpt-5.2` (same as cycling coach) | Proven reliable, structured JSON output works well |
| **Data aggregation** | Backend fetches everything in parallel | Same pattern as cycling coach, keeps iOS thin |
| **Reuse cycling coach logic** | Import cycling-specific helpers (training load, lifting context, EF trend) | DRY — don't duplicate the computation logic |
| **iOS architecture** | New `TodayCoachClient` + `TodayCoachCard` | Follows `CyclingCoachClient` pattern exactly |
| **Recovery data** | iOS sends recovery in request body (same as cycling coach) | Fastest path — recovery is already loaded on the dashboard |

---

## Phase 1: Backend Types & Data Aggregation

### Overview
Define the TypeScript types for the Today Coach request/response and build the data aggregation layer that collects all activity data.

### Changes Required

**New file: `packages/functions/src/types/today-coach.ts`**
```typescript
// Request sent to OpenAI with all athlete context
interface TodayCoachRequest {
  // Recovery (from cycling coach pattern)
  recovery: RecoverySnapshot;
  recoveryHistory: RecoveryHistoryEntry[];  // last 7 days

  // Lifting
  todaysWorkout: TodayWorkoutContext | null;
  liftingHistory: LiftingWorkoutSummary[];  // last 7 days
  liftingSchedule: LiftingScheduleContext;
  mesocycleContext: MesocycleContext | null;

  // Cycling
  cyclingContext: CyclingContext | null;  // null if no FTP/block set up

  // Stretching
  stretchingContext: StretchingContext;

  // Meditation
  meditationContext: MeditationContext;

  // Weight
  weightMetrics: WeightMetrics | null;

  // Meta
  timezone: string;
  currentDate: string;
}

interface TodayWorkoutContext {
  planDayName: string;
  weekNumber: number;
  isDeload: boolean;
  exerciseCount: number;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
}

interface CyclingContext {
  ftp: number;
  trainingLoad: { atl: number; ctl: number; tsb: number };
  weekInBlock: number | null;
  totalWeeks: number | null;
  nextSession: { type: string; description: string } | null;
  recentActivities: CyclingActivitySummary[];  // last 7 days
  vo2max: VO2MaxContext | null;
  efTrend: EFTrendSummary | null;
  ftpStaleDays: number;
}

interface CyclingActivitySummary {
  date: string;
  type: string;
  durationMinutes: number;
  tss: number;
}

interface StretchingContext {
  lastSessionDate: string | null;
  daysSinceLastSession: number | null;
  sessionsThisWeek: number;
  lastRegions: string[];  // body regions from last session
}

interface MeditationContext {
  lastSessionDate: string | null;
  daysSinceLastSession: number | null;
  sessionsThisWeek: number;
  totalMinutesThisWeek: number;
  currentStreak: number;  // consecutive days
}

// Response from OpenAI
interface TodayCoachResponse {
  dailyBriefing: string;  // 2-3 sentence personalized summary

  sections: {
    recovery: {
      insight: string;
      status: 'great' | 'good' | 'caution' | 'warning';
    };
    lifting: {
      insight: string;
      priority: 'high' | 'normal' | 'rest';
    } | null;  // null if no workout scheduled
    cycling: {
      insight: string;
      session: SessionRecommendation | null;  // reuse existing type
      priority: 'high' | 'normal' | 'skip';
    } | null;  // null if cycling not set up
    stretching: {
      insight: string;
      suggestedRegions: string[];
      priority: 'high' | 'normal' | 'low';
    };
    meditation: {
      insight: string;
      suggestedDurationMinutes: number;
      priority: 'high' | 'normal' | 'low';
    };
    weight: {
      insight: string;
    } | null;  // null if no weight goal
  };

  warnings: Array<{ type: string; message: string }>;
}
```

Export from `packages/functions/src/shared.ts` (add to barrel export).

**New file: `packages/functions/src/services/today-coach-data.service.ts`**

Data aggregation service that collects all activity context. Reuses existing repository/service functions:

```typescript
// Fetches and shapes all data needed for the Today Coach
export async function buildTodayCoachContext(
  userId: string,
  recovery: RecoverySnapshot,
  timezoneOffset: number
): Promise<TodayCoachRequest>
```

Implementation:
- Recovery history: reuse `recoveryService.getRecoveryHistory(userId, 7)` from `firestore-recovery.service.ts:127`
- Today's workout: reuse `workoutService.getTodaysWorkout()` from `workout.service.ts:63`
- Lifting history: reuse `buildLiftingContext()` from `cycling-coach.ts:259`
- Lifting schedule: reuse `buildLiftingSchedule()` from `cycling-coach.ts:330`
- Mesocycle context: reuse logic from `cycling-coach.ts:540-555`
- Cycling context: reuse cycling service calls from `cycling-coach.ts:452-475` + training load calculation
- Stretching: new queries using `stretchSessionRepo.findLatest()` and `stretchSessionRepo.findInDateRange()` from `stretchSession.repository.ts:94,154`
- Meditation: new queries using `meditationSessionRepo.findLatest()`, `findInDateRange()`, and streak calculation from `meditationSession.repository.ts:100,148`
- Weight: reuse `computeWeightMetrics()` pattern from `cycling-coach.ts:155`

**Refactor:** Extract `buildLiftingContext()` and `buildLiftingSchedule()` from `cycling-coach.ts` into a shared `packages/functions/src/services/lifting-context.service.ts` so both the cycling coach and today coach can use them without duplication.

### Success Criteria
- [ ] Types compile with `npm run typecheck`
- [ ] `buildTodayCoachContext()` returns all fields populated (unit test with mocked repos)
- [ ] Lifting context functions extracted and both cycling coach + today coach import from shared location
- [ ] No changes to cycling coach behavior (existing tests pass)

### Confirmation Gate
Run `npm run typecheck && npm run lint && npm test` — all pass.

---

## Phase 2: Today Coach AI Service

### Overview
Build the OpenAI integration service with the system prompt, response validation, and fallback logic.

### Changes Required

**New file: `packages/functions/src/services/today-coach.service.ts`**

Follows the exact pattern from `cycling-coach.service.ts`:

1. **System prompt** — broader than cycling coach, covers all domains:
   - Role: "You are a holistic wellness coach analyzing an athlete's recovery, training, and wellness data"
   - Recovery interpretation guidelines (same as cycling coach)
   - Lifting context (workout scheduled today, progressive overload week, deload awareness)
   - Cycling recommendations (reuse Peloton class type mapping from cycling coach)
   - Stretching recommendations (connect to lifting — suggest regions based on recent workouts)
   - Meditation recommendations (streak motivation, recovery-based suggestions — poor sleep → suggest evening meditation)
   - Weight insights (trend vs goal, caloric considerations)
   - Cross-domain connections to look for (the key differentiator):
     - Heavy lifting + no stretching → suggest targeted stretching
     - Poor sleep trend → suggest meditation, reduce training intensity
     - Weight loss + high training load → warn about under-fueling
     - Deload week on lifting → opportunity for harder cycling
     - Meditation streak → encourage maintaining it
     - Recovery "recover" state → prioritize rest across all domains

2. **Response validation** — `isValidTodayCoachResponse()` type guard checking all section shapes

3. **Fallback response** — if OpenAI fails, return a generic daily briefing based on recovery state + whatever data is available (no AI needed for "You haven't stretched in X days")

4. **Main function:**
```typescript
export async function getTodayCoachRecommendation(
  request: TodayCoachRequest,
  apiKey: string
): Promise<TodayCoachResponse>
```

### Success Criteria
- [ ] System prompt covers all 6 domains with clear instructions
- [ ] Response validator catches malformed responses
- [ ] Fallback response works when OpenAI is unavailable
- [ ] Unit test: mock OpenAI response → validate parsing → correct output shape

### Confirmation Gate
Unit tests pass for service layer. No deployment needed yet.

---

## Phase 3: Backend Handler & Deployment

### Overview
Create the Express handler, register the Cloud Function, and add Firebase hosting rewrites.

### Changes Required

**New file: `packages/functions/src/handlers/today-coach.ts`**

Follow `cycling-coach.ts` pattern exactly:
- Express app with cors, json, `stripPathPrefix('today-coach')`, requireAppCheck
- Single route: `POST /recommend`
- Extracts `x-user-id` and `x-timezone-offset` from headers
- Recovery from request body (same as cycling coach)
- Calls `buildTodayCoachContext()` to aggregate data
- Calls `getTodayCoachRecommendation()` for AI response
- Returns `{ success: true, data: TodayCoachResponse }`
- Error handling: RECOVERY_NOT_SYNCED if no recovery data

**Modify: `packages/functions/src/index.ts`**
- Import `todayCoachApp` from `./handlers/today-coach.js`
- Export `devTodayCoach = onRequest(withOpenAiOptions, todayCoachApp)` (~line 82)
- Export `prodTodayCoach = onRequest(withOpenAiOptions, todayCoachApp)` (~line 105)

**Modify: `firebase.json`**
- Add dev rewrites (~line 195):
  ```json
  { "source": "/api/dev/today-coach", "function": "devTodayCoach" },
  { "source": "/api/dev/today-coach/**", "function": "devTodayCoach" }
  ```
- Add prod rewrites (~line 372):
  ```json
  { "source": "/api/prod/today-coach", "function": "prodTodayCoach" },
  { "source": "/api/prod/today-coach/**", "function": "prodTodayCoach" }
  ```

### Success Criteria
- [ ] `npm run typecheck && npm run lint && npm test` all pass
- [ ] Deploy with `firebase deploy --only functions:devTodayCoach`
- [ ] Curl test: `POST /api/dev/today-coach/recommend` with recovery body returns valid response
- [ ] Existing cycling coach still works (no regressions)

### Confirmation Gate
Endpoint deployed and returning valid AI responses via curl.

---

## Phase 4: iOS Models & Client

### Overview
Create the Swift response models and the `TodayCoachClient` service on iOS.

### Changes Required

**New file: `ios/BradOS/BradOS/Models/TodayCoachModels.swift`**

```swift
struct TodayCoachRecommendation: Codable, Equatable {
    let dailyBriefing: String
    let sections: CoachSections
    let warnings: [CoachWarning]?

    struct CoachSections: Codable, Equatable {
        let recovery: RecoverySection
        let lifting: LiftingSection?
        let cycling: CyclingSection?
        let stretching: StretchingSection
        let meditation: MeditationSection
        let weight: WeightSection?
    }

    struct RecoverySection: Codable, Equatable {
        let insight: String
        let status: String  // great, good, caution, warning
    }

    struct LiftingSection: Codable, Equatable {
        let insight: String
        let priority: String  // high, normal, rest
    }

    struct CyclingSection: Codable, Equatable {
        let insight: String
        let session: SessionRecommendation?  // reuse from CyclingCoachClient
        let priority: String  // high, normal, skip
    }

    struct StretchingSection: Codable, Equatable {
        let insight: String
        let suggestedRegions: [String]
        let priority: String  // high, normal, low
    }

    struct MeditationSection: Codable, Equatable {
        let insight: String
        let suggestedDurationMinutes: Int
        let priority: String  // high, normal, low
    }

    struct WeightSection: Codable, Equatable {
        let insight: String
    }

    struct CoachWarning: Codable, Equatable {
        let type: String
        let message: String
    }
}
```

**New file: `ios/BradOS/BradOS/Services/TodayCoachClient.swift`**

Follow `CyclingCoachClient.swift` pattern:
```swift
@MainActor
class TodayCoachClient: ObservableObject {
    @Published var recommendation: TodayCoachRecommendation?
    @Published var isLoading = false
    @Published var error: String?

    private let apiClient: APIClient

    init(apiClient: APIClient = .shared) { ... }

    func getRecommendation(recovery: RecoveryData) async { ... }
    func refresh() async { ... }
}
```

**Modify: `ios/BradOS/BradOS/Services/APIClient.swift`**

Add method (~line 728):
```swift
func getTodayCoachRecommendation(_ body: CyclingCoachRequestBody) async throws -> TodayCoachRecommendation {
    try await post("/today-coach/recommend", body: body)
}
```

Note: Reuses `CyclingCoachRequestBody` since the request body is identical (just recovery data — the backend aggregates everything else).

**Modify: `ios/BradOS/project.yml`**

Add new Swift files to the BradOS target sources.

### Success Criteria
- [ ] XcodeGen generates project successfully
- [ ] Build succeeds for simulator target
- [ ] Models decode a sample JSON response correctly (unit test in BradOSCore if applicable)

### Confirmation Gate
App builds and `TodayCoachClient` compiles. No UI yet.

---

## Phase 5: Today Coach Card UI

### Overview
Build the Today Coach card that replaces ReadinessCard on the main dashboard. Shows the daily briefing with expandable section cards.

### Changes Required

**New file: `ios/BradOS/BradOS/Views/Today/TodayCoachCard.swift`**

The main card shown on the Today dashboard. States:
- **Loading:** Spinner + "Analyzing your day..." (pattern from `CoachRecommendationLoadingCard`)
- **No recovery:** Prompt to enable HealthKit (pattern from `ReadinessCard.notAuthorizedState`)
- **Error:** Error message + retry button (pattern from `CoachRecommendationErrorCard`)
- **Content:** Daily briefing + section previews

Content layout:
```
┌─────────────────────────────────────┐
│ 🧠 Today Coach              Ready  │  ← header with recovery state badge
│                                     │
│ "Recovery is solid at 78. Great     │  ← dailyBriefing text
│  day for Push and a PZ ride..."     │
│                                     │
│ ┌─ Recovery ──────────── Great ──┐  │  ← tappable section rows
│ │ HRV bounced back well          │  │
│ └────────────────────────────────┘  │
│ ┌─ Lifting ──────────── Push ────┐  │
│ │ Progressive overload: +1 rep   │  │
│ └────────────────────────────────┘  │
│ ┌─ Cycling ──────────── PZ Max ──┐  │
│ │ 30-min Power Zone Max          │  │
│ └────────────────────────────────┘  │
│ ┌─ Stretching ────────── ⚠️ ─────┐  │  ← high priority = warning indicator
│ │ 3 days since last stretch      │  │
│ └────────────────────────────────┘  │
│ ┌─ Meditation ──────── 4-day 🔥 ─┐  │
│ │ Keep the streak alive          │  │
│ └────────────────────────────────┘  │
│                                     │
│ ⚠️ Warning: Sleep dropping 3 days  │  ← warnings if any
└─────────────────────────────────────┘
```

Each section row is tappable → opens `TodayCoachDetailView` scrolled to that section.

Design tokens: Use `.glassCard()`, `Theme.Spacing`, `Theme.textPrimary`/`Secondary`/`Tertiary`, and `auroraGlow` based on recovery state color.

**New file: `ios/BradOS/BradOS/Views/Today/TodayCoachDetailView.swift`**

Full-screen sheet (follows `RecoveryDetailView` pattern) with expandable sections:

- **Recovery section** — shows the full ReadinessCard-style metrics (score ring, HRV, RHR, sleep) + the AI insight
- **Lifting section** — today's workout preview + AI insight about progressive overload / deload context
- **Cycling section** — full `CoachRecommendationCard`-style display with Peloton class types, target zones, TSS, coaching tips (reuse existing card components where possible)
- **Stretching section** — AI insight + suggested body regions as tappable chips that could launch a stretch session
- **Meditation section** — AI insight + suggested duration + streak info
- **Weight section** — AI insight + trend summary
- **Warnings section** — all cross-domain warnings with appropriate icons

Navigation: `NavigationStack` with `.toolbar` close button. Receives `TodayCoachRecommendation` + `RecoveryData` as init parameters.

**Modify: `ios/BradOS/BradOS/Views/Today/TodayDashboardView.swift`**

Replace `ReadinessCard()` (line 15) with `TodayCoachCard()`:

```swift
// Before:
ReadinessCard()

// After:
TodayCoachCard()
```

The `TodayCoachCard` manages its own state internally (same self-loading pattern as `ReadinessCard`):
1. Loads recovery from `APIClient.shared.getLatestRecovery()`
2. Passes recovery to `TodayCoachClient.getRecommendation(recovery:)`
3. Renders loading/error/content states

**Modify: `ios/BradOS/project.yml`**

Add new view files.

### Success Criteria
- [ ] App builds and displays the Today Coach card on the dashboard
- [ ] Loading state shows while waiting for AI response
- [ ] Error state shows with retry button if API fails
- [ ] Daily briefing renders correctly with all section rows
- [ ] Tapping a section opens the detail view
- [ ] Detail view shows full insights for each domain
- [ ] Cycling section in detail view shows Peloton recommendation (if cycling is set up)
- [ ] Sections with `null` data (no cycling setup, no weight goal) are hidden gracefully
- [ ] Pull-to-refresh reloads the coach recommendation
- [ ] Uses Aurora Glass design system (`.glassCard()`, `Theme.*` tokens, `auroraGlow`)

### Confirmation Gate
Build, install on simulator, verify the card renders with real data. Manually confirm each section works.

---

## Phase 6: Polish & QA

### Overview
End-to-end testing on simulator, edge case handling, and performance tuning.

### Changes Required

**Edge cases to handle:**
- No recovery data synced → show HealthKit enable prompt (not coach)
- No cycling setup (no FTP/block) → cycling section hidden, other sections still work
- No weight goal → weight section hidden
- No lifting mesocycle → lifting section shows "No workout scheduled"
- All activities done today → celebratory briefing tone
- Recovery in "recover" state → all sections should reflect rest-first messaging
- OpenAI timeout → fallback response renders gracefully

**Performance:**
- Backend: all Firestore queries run in parallel via `Promise.all()` (same as cycling coach)
- iOS: coach request fires on `.task` modifier, doesn't block other dashboard cards
- Consider caching the response for 1 hour (if user pulls to refresh frequently)

**Keep ReadinessCard accessible:**
- The recovery detail sheet (tapping the recovery section in the coach card) should show the same `RecoveryDetailView` that the old ReadinessCard opened

### Success Criteria
- [ ] `/explore-ios` QA passes — card loads, sections expand, detail view works
- [ ] Edge cases: test with no cycling setup, no weight goal, recover state
- [ ] Response time: coach card loads within ~5 seconds (OpenAI latency)
- [ ] No regressions: cycling tab's coach card still works independently
- [ ] No regressions: other Today dashboard cards (meal plan, workout) unaffected

### Confirmation Gate
Full QA on simulator with real data. All happy path + edge cases verified.

---

## Testing Strategy

### Unit Tests (Backend)
- `today-coach-data.service.test.ts` — mock repositories, verify `buildTodayCoachContext()` output shape
- `today-coach.service.test.ts` — mock OpenAI, verify prompt construction, response validation, fallback behavior
- `today-coach.handler.test.ts` — mock services, verify HTTP request/response contract
- `lifting-context.service.test.ts` — verify extracted lifting helpers still work (moved from cycling-coach)

### Unit Tests (iOS)
- `TodayCoachModels` — decode sample JSON responses
- `TodayCoachClient` — mock APIClient, verify state transitions

### Integration Tests
- Deploy to dev, curl the endpoint with sample recovery data
- Verify OpenAI returns valid structured JSON
- Verify fallback when OpenAI key is missing

### Manual QA
- Simulator end-to-end flow with `/explore-ios`
- Test all edge cases listed in Phase 6

---

## File Summary

### New Files
| File | Purpose |
|------|---------|
| `packages/functions/src/types/today-coach.ts` | Request/response TypeScript types |
| `packages/functions/src/services/today-coach-data.service.ts` | Data aggregation from all sources |
| `packages/functions/src/services/today-coach.service.ts` | OpenAI integration (prompt, validation, fallback) |
| `packages/functions/src/services/lifting-context.service.ts` | Extracted shared lifting helpers |
| `packages/functions/src/handlers/today-coach.ts` | Express handler |
| `ios/BradOS/BradOS/Models/TodayCoachModels.swift` | Swift response models |
| `ios/BradOS/BradOS/Services/TodayCoachClient.swift` | iOS coach client |
| `ios/BradOS/BradOS/Views/Today/TodayCoachCard.swift` | Dashboard card UI |
| `ios/BradOS/BradOS/Views/Today/TodayCoachDetailView.swift` | Full-screen detail view |

### Modified Files
| File | Change |
|------|--------|
| `packages/functions/src/index.ts` | Export devTodayCoach + prodTodayCoach |
| `packages/functions/src/shared.ts` | Export new types |
| `packages/functions/src/handlers/cycling-coach.ts` | Extract lifting helpers to shared service |
| `firebase.json` | Add today-coach rewrite rules |
| `ios/BradOS/BradOS/Services/APIClient.swift` | Add `getTodayCoachRecommendation()` method |
| `ios/BradOS/BradOS/Views/Today/TodayDashboardView.swift` | Replace ReadinessCard with TodayCoachCard |
| `ios/BradOS/project.yml` | Add new source files |

---

## References

- Cycling coach handler: `packages/functions/src/handlers/cycling-coach.ts`
- Cycling coach service: `packages/functions/src/services/cycling-coach.service.ts`
- Cycling coach iOS client: `ios/BradOS/BradOS/Services/CyclingCoachClient.swift`
- ReadinessCard: `ios/BradOS/BradOS/Views/Today/ReadinessCard.swift`
- RecoveryDetailView: `ios/BradOS/BradOS/Views/Today/RecoveryDetailView.swift`
- CoachRecommendationCard: `ios/BradOS/BradOS/Views/Cycling/CoachRecommendationCard.swift`
- DashboardViewModel: `ios/BradOS/BradOSCore/Sources/BradOSCore/ViewModels/DashboardViewModel.swift`
- TodayDashboardView: `ios/BradOS/BradOS/Views/Today/TodayDashboardView.swift`
- Calendar service (aggregation pattern): `packages/functions/src/services/calendar.service.ts`
- Stretch session repo: `packages/functions/src/repositories/stretchSession.repository.ts`
- Meditation session repo: `packages/functions/src/repositories/meditationSession.repository.ts`
- Recovery service: `packages/functions/src/services/firestore-recovery.service.ts`
- Original cycling coach plan: `thoughts/shared/plans/2026-02-08-ai-cycling-coach.md`
