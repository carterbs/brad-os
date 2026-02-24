# Training Block Enhancement: Configurable Schedule + Peloton-Aware AI Coach

**Created**: 2026-02-09
**Status**: Draft

## Problem Statement

The current training block creation flow is too minimal. It only asks for:
1. Goals (regain fitness / maintain muscle / lose weight)
2. Start date

After creation, the user gets a week indicator and phase name (Adaptation, Build, etc.) but **no actual daily workout plan**. The schedule section shows a hardcoded Tue/Thu/Sat structure that the user has no control over. The AI coach generates daily recommendations but is completely decoupled from the training block configuration — it always assumes the same 3-day fixed schedule regardless of what the user actually wants.

The daily AI recommendations currently prescribe specific interval protocols (e.g., "10x 30/30 Billat at 110-120% FTP") which is irrelevant when the user trains on Peloton. The recommendations should suggest **Peloton class types** — Power Zone Max, Power Zone Endurance, HIIT & Hills, etc. — so the user knows what kind of class to search for.

**What the user expects:**
- Choose how many days per week to ride (2-5)
- Choose which days to ride
- See a generated weekly plan suggesting what *kind* of Peloton class to take each day
- Have the AI coach produce daily recommendations framed as Peloton class suggestions, adjusted for recovery

## Current Architecture

### Training Block (data model)
```typescript
// packages/functions/src/types/cycling.ts:58-66
interface TrainingBlock {
  id: string;
  userId: string;
  startDate: string;       // YYYY-MM-DD
  endDate: string;         // YYYY-MM-DD
  currentWeek: number;     // 1-8
  goals: TrainingGoal[];   // regain_fitness | maintain_muscle | lose_weight
  status: 'active' | 'completed';
}
```

### AI Coach Request (what it knows today)
```typescript
// packages/functions/src/types/cycling.ts:226-233
interface CyclingCoachRequest {
  recovery: RecoverySnapshot;
  trainingLoad: TrainingLoadMetrics;
  recentLiftingWorkouts: LiftingWorkoutSummary[];
  athlete: AthleteProfile;       // includes goals, weekInBlock, ftp
  weight: WeightMetrics;
  schedule: ScheduleContext;     // dayOfWeek, sessionType (hardcoded from day-of-week map)
}
```

### Hardcoded Schedule Mapping
```typescript
// packages/functions/src/handlers/cycling-coach.ts:95-103
function getSessionType(date: Date): 'vo2max' | 'threshold' | 'fun' {
  const day = date.getDay();
  switch (day) {
    case 2: return 'vo2max';    // Tuesday
    case 4: return 'threshold'; // Thursday
    case 6: return 'fun';       // Saturday
    default: return 'fun';
  }
}
```

### Current SessionRecommendation (interval-focused)
```typescript
// packages/functions/src/types/cycling.ts:257-263
interface SessionRecommendation {
  type: SessionType;
  durationMinutes: number;
  intervals?: IntervalWorkout;    // <-- prescribes exact protocols, irrelevant for Peloton
  targetTSS: TargetTSSRange;
  targetZones: string;
}
```

### Training Philosophy (system prompt)
The system prompt (`cycling-coach-system.md`) hardcodes a 3-session structure and prescribes specific intervals:
- Session 1 (Tuesday): VO2max Intervals — "10-15 x 30/30, 6-8 x 30/120, 15-20 x 40/20"
- Session 2 (Thursday): Threshold — "3x10-15min at 88-94% FTP, 2x20min at 88-94% FTP"
- Session 3 (Saturday): Fun Ride

## Design

### Peloton Class Type Taxonomy

Map training intentions to Peloton class categories:

| Training Intent | Peloton Class Types | When to Use |
|---|---|---|
| VO2max / High Intensity | Power Zone Max, HIIT & Hills, Tabata | Max effort day |
| Threshold / Sweet Spot | Power Zone, Sweat Steady, Climb | Sustained effort day |
| Endurance / Base | Power Zone Endurance, Low Impact (long) | Aerobic base day |
| Tempo | Power Zone, Intervals | Moderate push day |
| Fun | Music/Theme rides, Scenic, Live DJ, any class you enjoy | Motivation/adherence day |
| Recovery | Low Impact, Recovery Ride | Easy day after hard effort |

### New Training Block Data Model

Extend `TrainingBlock` with schedule configuration:

```typescript
interface TrainingBlock {
  // ... existing fields ...

  // NEW: Schedule configuration
  daysPerWeek: number;                  // 2-5
  weeklySessions: WeeklySession[];      // Ordered list of sessions to complete each week
  preferredDays: number[];              // Preferred days of week [2, 4, 6] — suggestions only
  experienceLevel: ExperienceLevel;     // beginner | intermediate | advanced
  weeklyHoursAvailable: number;         // 3-10 hours available for cycling per week
}

type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';

interface WeeklySession {
  order: number;                        // 1, 2, 3... — sequence in the week
  sessionType: SessionType;             // vo2max | threshold | endurance | tempo | fun | recovery
  pelotonClassTypes: string[];          // ["Power Zone Max", "HIIT & Hills"]
  suggestedDurationMinutes: number;     // 20, 30, 45, or 60
  description: string;                  // "High-intensity — search for a PZ Max or HIIT class"
  preferredDay?: number;                // Suggested day of week (0-6), but not required
}
```

**Key design choice:** Sessions are an **ordered queue**, not pinned to specific days. The `preferredDay` is a hint for spacing (e.g., "ideally do this Tuesday") but the system never says "you missed Tuesday." It says "here's your next session."

### Session Types (expanded)

Current: `vo2max | threshold | fun`

New: `vo2max | threshold | endurance | tempo | fun | recovery`

- **vo2max**: High-intensity → Peloton: Power Zone Max, HIIT & Hills, Tabata
- **threshold**: Sustained hard effort → Peloton: Power Zone, Sweat Steady, Climb
- **endurance**: Long aerobic → Peloton: Power Zone Endurance, Low Impact (45-60 min)
- **tempo**: Moderate push → Peloton: Power Zone, Intervals
- **fun**: Whatever you enjoy → Peloton: Music rides, Theme rides, Scenic, anything
- **recovery**: Very easy → Peloton: Low Impact, Recovery Ride (20 min)

### Updated SessionRecommendation (Peloton-aware)

Replace the interval-focused response with Peloton class suggestions:

```typescript
interface SessionRecommendation {
  type: SessionType;
  durationMinutes: number;              // Suggested class length
  pelotonClassTypes: string[];          // ["Power Zone Max", "HIIT & Hills"]
  pelotonTip: string;                   // "Look for a 30-min PZ Max class. Stay in zones 5-6 during efforts."
  targetTSS: TargetTSSRange;           // Keep for tracking context
  targetZones: string;                  // "Zones 5-6 during work, Zone 1-2 recovery"
  // intervals field REMOVED — not relevant for Peloton
}
```

### Schedule Templates

The AI generates the weekly session queue at block creation time. Sessions are ordered with the most important/hardest first so that if life gets in the way, the highest-value sessions are prioritized.

**2 sessions/week:**
1. Intensity (PZ Max or PZ, alternating weeks)
2. Fun

**3 sessions/week (current default):**
1. PZ Max / HIIT (highest training stimulus)
2. PZ / Sweat Steady (threshold development)
3. Fun (adherence / enjoyment)

**4 sessions/week:**
1. PZ Max / HIIT
2. PZ / Sweat Steady
3. PZ Endurance (aerobic base)
4. Fun

**5 sessions/week:**
1. PZ Max / HIIT
2. PZ / Sweat Steady
3. PZ Endurance
4. PZ / Intervals (tempo)
5. Fun

The AI adjusts these based on goals, experience, and available hours. For example:
- "Lose weight" goal → more endurance sessions, longer durations
- "Regain fitness" goal → balanced intensity and endurance
- Beginner → fewer high-intensity days, more PZ Endurance
- Advanced + 8+ hours → can handle back-to-back intensity if recovery allows

**Ordering principle:** Hard sessions first in the queue. If you only get to 2 of your 4 planned sessions this week, you did the two that matter most. Fun is always last — it's the one to skip if something has to give (but ideally you don't).

### Setup Flow (iOS)

Replace the current minimal setup with a multi-step wizard:

**Step 1: Experience & Availability**
- Experience level: Beginner / Intermediate / Advanced (single select cards)
- Hours available per week: Segmented control (2-3h, 4-5h, 6-8h, 8-10h)

**Step 2: Sessions Per Week**
- How many sessions per week? (2-5, segmented control)
- Which days do you *usually* ride? (day-of-week pill buttons, pre-populated based on count)
  - Default suggestions: 2 → Tue/Sat, 3 → Tue/Thu/Sat, 4 → Tue/Thu/Sat/Sun, 5 → Mon/Tue/Thu/Sat/Sun
  - Subtitle: "These are suggestions — ride whenever works for you"

**Step 3: Goals** (existing, kept as-is)
- Regain fitness / Maintain muscle / Lose weight (multi-select checkboxes)

**Step 4: Schedule Preview** (AI-generated)
- Call `POST /cycling-coach/generate-schedule` with collected inputs
- Show loading state while AI generates
- Display weekly sessions as an **ordered list** (not tied to days):
  ```
  ┌─────────────────────────────────────┐
  │ Your weekly sessions                │
  │                                     │
  │  1. 🔥 Power Zone Max              │
  │     30-45 min · HIIT & Hills works │
  │     too                             │
  │                                     │
  │  2. ⚡ Power Zone                   │
  │     45 min · Sweat Steady works too │
  │                                     │
  │  3. 😊 Fun Ride                     │
  │     30-60 min · Whatever you enjoy  │
  │                                     │
  │  Do them in order. Life happens —   │
  │  just pick up where you left off.   │
  └─────────────────────────────────────┘
  ```
- "Looks good" → proceed to date picker
- "Regenerate" → call API again for a different arrangement

**Step 5: Start Date**
- Date picker, end date auto-calculated (8 weeks)
- "Start Training Block" button

### AI Schedule Generation (new endpoint)

New endpoint: `POST /cycling-coach/generate-schedule`

**Request:**
```typescript
interface GenerateScheduleRequest {
  sessionsPerWeek: number;
  preferredDays: number[];          // day-of-week numbers [2, 4, 6] — suggestions only
  goals: TrainingGoal[];
  experienceLevel: ExperienceLevel;
  weeklyHoursAvailable: number;
  ftp?: number;
}
```

**Response:**
```typescript
interface GenerateScheduleResponse {
  sessions: WeeklySession[];         // Ordered session queue
  weeklyPlan: WeeklyPlanSummary;
  rationale: string;                 // "With 3 sessions and a regain fitness goal, we balance one hard session..."
}

interface WeeklyPlanSummary {
  totalEstimatedHours: number;
  phases: PhaseSummary[];
}

interface PhaseSummary {
  name: string;           // "Adaptation", "Build", etc.
  weeks: string;          // "1-2", "3-4", etc.
  description: string;    // "Start with 20-min PZ Max classes, 30-min PZ. Get your legs used to structured work."
}
```

**System prompt for schedule generation** tells the AI:
- The user trains on Peloton
- Generate an **ordered list of sessions** (not a day-by-day calendar)
- Suggest Peloton class types (Power Zone Max, Power Zone, Power Zone Endurance, HIIT & Hills, Sweat Steady, Climb, Low Impact, Recovery, Music/Theme rides)
- Don't prescribe specific intervals — the Peloton instructor handles that
- Order sessions by priority: hardest/most important first, fun last
- Preferred days are hints for spacing, not requirements
- The user may not complete all sessions every week — that's fine

### "Next Session" Logic (core concept)

The schedule is a queue, not a calendar. Each week, the user works through sessions in order. The system determines **which session is next** by matching completed Strava activities against the session queue for the current week.

**Algorithm:**
1. Get the block's `weeklySessions` (ordered list, e.g., [PZ Max, PZ, Fun])
2. Get this week's cycling activities from Strava (Mon-Sun of current week)
3. Walk the session queue: for each session, try to match a Strava activity by type
   - PZ Max session → match activity with type `vo2max`
   - PZ session → match activity with type `threshold`
   - Fun session → match activity with type `fun`
   - Each Strava activity can only match one session (consumed in order)
4. The first unmatched session is the **next session**
5. If all sessions are matched → week is complete, show congratulations

**Example:** 3-session week [PZ Max, PZ, Fun]. User did a VO2max ride on Wednesday and a threshold ride on Friday. It's Saturday. Next session = Fun.

**Example:** 3-session week [PZ Max, PZ, Fun]. User did nothing yet. It's Thursday. Next session = PZ Max. No shame, no "you missed Tuesday."

**Where this runs:** Both backend (for AI coach context) and iOS (for UI display). The logic is simple enough to duplicate, or the backend can return the `nextSession` in the block fetch response.

**Week boundary:** Weeks reset on Monday. If you didn't finish last week's sessions, they don't carry over — each week is a fresh queue. This prevents guilt spirals from accumulating "debt."

### AI Coach Integration (daily recommendations)

The daily recommendation endpoint (`POST /cycling-coach/recommend`) updated to:

1. **Determine the next session** from the block's queue (not the day-of-week mapping)
2. **Know what's been completed this week** for context
3. **Recommend the next session's Peloton class type** adjusted for recovery state

Updated `ScheduleContext`:
```typescript
interface ScheduleContext {
  dayOfWeek: string;
  nextSession: WeeklySession | null;           // The next incomplete session in this week's queue
  sessionsCompletedThisWeek: number;           // How many sessions done so far
  totalSessionsThisWeek: number;               // Total planned for the week
  weeklySessionQueue: WeeklySession[];         // Full queue for context
  liftingSchedule: LiftingScheduleContext;
}
```

The coach always recommends based on `nextSession`, regardless of what day it is. If nextSession is a PZ Max session but it's Wednesday (not Tuesday), the recommendation is still PZ Max — no mention of "this was supposed to be Tuesday."

**Recovery-based adjustments (Peloton-framed):**
- **Ready (score >= 70)**: "Go for a 45-min Power Zone Max class. You're well recovered."
- **Moderate (score 50-69)**: "Swap the PZ Max for a 30-min version, or try a regular Power Zone class instead."
- **Recover (score < 50)**: "Skip the intensity today. Take a 20-min Low Impact or Recovery Ride. Your next hard session can wait."

Updated system prompt tells the AI:
- The user rides on Peloton — always recommend Peloton class types
- Never prescribe specific interval protocols (no "10x 30/30")
- You're recommending the **next session** in their queue, not a day-specific workout
- Suggest class duration (20, 30, 45, or 60 min) based on recovery and phase
- When downgrading due to fatigue, suggest an easier class type or a shorter duration — but don't skip the session type entirely unless recovery is very poor
- Never reference missed days or imply the user is behind schedule
- If recovery is poor, it's fine to say "rest today and come back to this session tomorrow"
- Account for lifting interference — if the user did a Leg Day yesterday, recommend a recovery ride or low impact instead of the queued hard session

### Lifting Data Integration (currently broken)

The AI coach already has prompt instructions for handling lifting interference:
- "Heavy lower body yesterday → reduce cycling volume by 20%, avoid threshold"
- "Heavy lower body today → recovery ride only"
- "Upper body only → no adjustments needed"

But the data is **never populated**. The handler always sends:
```typescript
recentLiftingWorkouts: [],                    // always empty
liftingSchedule: {
  today: { planned: false },                  // always false
  tomorrow: { planned: false },               // always false
  yesterday: { completed: false },            // always false
}
```

**What's available in Firestore:**
- `WorkoutRepository.findCompletedInDateRange(start, end, tzOffset)` — queries completed workouts by date
- `WorkoutRepository.findByDate(date)` — queries scheduled workouts for a date (any status)
- `PlanDay.name` — contains workout type ("Leg Day", "Push Day", "Pull Day") via `plan_day_id` FK
- `WorkoutSet` data — `actual_weight * actual_reps` for volume calculation
- Duration calculable from `started_at` / `completed_at` timestamps

**Not available in Firestore (Watch captures but doesn't sync):**
- `avgHeartRate`, `maxHeartRate`, `activeCalories` — set to 0 for now

**Lower body detection heuristic:**
Check `PlanDay.name` (case-insensitive) for: "leg", "lower", "squat", "deadlift"
Everything else treated as upper body / no cycling interference.

The `LiftingWorkoutSummary` type already exists at `types/cycling.ts:147-156` with the right shape — we just need to populate it from real data.

### Updated CoachRecommendationCard (iOS)

The existing card shows interval details (protocol name, rep count, work/rest seconds, power targets). Replace with Peloton-oriented display:

```
┌──────────────────────────────────────────┐
│  Next Up                                 │
│ 🔥 Power Zone Max                        │
│ 30-45 min                                │
│                                          │
│ Also works: HIIT & Hills, Tabata         │
│                                          │
│ "You're well recovered today. Go for a   │
│  45-min PZ Max class and push hard in    │
│  the efforts. Stay in zones 5-6."        │
│                                          │
│ Tips:                                    │
│ 💡 Filter by 30-45 min Power Zone Max    │
│ 💡 Target TSS: 50-70                     │
│                                          │
│  Session 1 of 3 this week               │
└──────────────────────────────────────────┘
```

vs current interval-focused display:
```
❌ "30/30 Billat · 10 reps · 30s work / 30s rest · 110-120% FTP"
```

### CyclingBlockView Enhancement

After creating a block, the block view shows weekly progress as a session queue:

- **Session Queue Card**: Ordered list of this week's sessions with completion status
  ```
  This Week (2 of 3 done)
  ✅ Power Zone Max · Done Wed
  ✅ Power Zone · Done Fri
  ○  Fun Ride · Up next
  ```
  - Completed sessions show a checkmark and what day they were done (not what day they were "supposed to be")
  - Next session is highlighted, remaining sessions are dimmed
  - No red X's, no "missed" indicators, no shame
- **Next Up Card**: Prominent card for the next incomplete session — shows Peloton class type, duration, and links to AI coach recommendation
- **Week Complete State**: When all sessions are done, show a simple congrats message: "All 3 sessions done this week. Nice work." No fanfare needed.
- **Phase Progress**: Current phase with Peloton-framed description ("This week, look for 30-min PZ Max classes. Next phase we'll bump to 45-min.")

## Implementation Phases

### Phase 1: Backend — Types, Schema, Schedule Generation Endpoint

**Files to modify:**
- `packages/functions/src/types/cycling.ts`
  - Add `ExperienceLevel` type
  - Add `WeeklySession` interface with `order`, `pelotonClassTypes`, `preferredDay` fields
  - Extend `TrainingBlock` with `daysPerWeek`, `weeklySessions`, `preferredDays`, `experienceLevel`, `weeklyHoursAvailable`
  - Update `SessionRecommendation`: replace `intervals?: IntervalWorkout` with `pelotonClassTypes: string[]` and `pelotonTip: string`
  - Add `GenerateScheduleRequest` and `GenerateScheduleResponse` interfaces
- `packages/functions/src/schemas/cycling.schema.ts`
  - Add `experienceLevelSchema` (z.enum)
  - Add `generateScheduleSchema` for the new endpoint
  - Update `createTrainingBlockSchema` with new optional fields
- `packages/functions/src/services/firestore-cycling.service.ts`
  - Update `createTrainingBlock()` to store new fields
  - Update `getCurrentTrainingBlock()` to return new fields
  - Add backward compat: blocks without `weeklySessions` get default 3-session queue on read
- `packages/functions/src/handlers/cycling-coach.ts`
  - Add `POST /cycling-coach/generate-schedule` endpoint
  - New handler that validates input, calls AI, returns session queue
- `packages/functions/src/services/cycling-coach.service.ts`
  - Add `generateSchedule()` function
  - Add `buildScheduleGenerationPrompt()` with Peloton-aware system prompt
  - Add validation for schedule response
- `packages/functions/src/services/training-load.service.ts`
  - Add `determineNextSession()` function: takes `weeklySessions[]` + this week's Strava activities → returns the next incomplete session
  - Add `getWeekBoundaries()` helper: returns Monday-Sunday date range for current week

**New files:**
- `packages/functions/src/prompts/schedule-generation-system.md` — System prompt for schedule generation

**Tests:**
- Update `packages/functions/src/services/cycling-coach.service.test.ts` — Test schedule generation prompt building
- Update `packages/functions/src/handlers/cycling-coach.test.ts` — Test new endpoint validation
- New: `determineNextSession()` tests — various completion states, all-done state, empty week

### Phase 2: Backend — Lifting Data Integration

Wire up the lifting/workout data that the AI coach prompt already references but never receives.

**Data flow:**
1. Query `WorkoutRepository.findCompletedInDateRange()` for last 7 days of completed workouts
2. For each workout, look up `PlanDay` via `plan_day_id` to get the `name` ("Leg Day", "Push Day", etc.)
3. Query `WorkoutSetRepository` for completed sets → calculate `setsCompleted` and `totalVolume`
4. Calculate `durationMinutes` from `started_at` / `completed_at` timestamps
5. Build `LiftingWorkoutSummary[]` array and populate `recentLiftingWorkouts`
6. For `liftingSchedule` context:
   - **Yesterday**: `findCompletedInDateRange(yesterday, yesterday)` → `completed: true/false`, `workoutName`
   - **Today**: `findByDate(today)` filtered for `pending`/`in_progress` → `planned: true/false`, `workoutName`
   - **Tomorrow**: `findByDate(tomorrow)` filtered for `pending` → `planned: true/false`, `workoutName`

**Lower body detection:**
- Check `PlanDay.name` case-insensitively for: "leg", "lower", "squat", "deadlift"
- Everything else → upper body / no cycling interference
- Pass the workout name through so the AI can make its own determination too

**Files to modify:**
- `packages/functions/src/handlers/cycling-coach.ts`
  - Import `WorkoutRepository`, `PlanDayRepository`, `WorkoutSetRepository`
  - Add `buildLiftingContext()` helper function that queries Firestore for recent workouts
  - Replace hardcoded empty `recentLiftingWorkouts: []` with real data
  - Replace hardcoded `liftingSchedule: { today: { planned: false }, ... }` with real queries
  - Add timezone offset handling (from request header or default)
- `packages/functions/src/types/cycling.ts`
  - Add optional `isLowerBody: boolean` field to `LiftingWorkoutSummary` (derived from plan day name)
  - Update `LiftingScheduleContext` to include `isLowerBody?: boolean` on each day

**Fields populated vs zeroed:**

| Field | Source | Available? |
|---|---|---|
| `date` | `Workout.completed_at` | Yes |
| `workoutDayName` | `PlanDay.name` via `plan_day_id` | Yes |
| `setsCompleted` | Count of `WorkoutSet` where `status === 'completed'` | Yes |
| `totalVolume` | Sum of `actual_weight * actual_reps` | Yes |
| `durationMinutes` | `completed_at - started_at` | Yes (calculated) |
| `avgHeartRate` | Apple Watch (not synced to Firestore) | No → `0` |
| `maxHeartRate` | Apple Watch (not synced to Firestore) | No → `0` |
| `activeCalories` | Apple Watch (not synced to Firestore) | No → `0` |

**Tests:**
- New test: `buildLiftingContext()` returns correct data for yesterday/today/tomorrow
- New test: lower body detection heuristic
- New test: empty workout history returns all-false lifting schedule

### Phase 3: Backend — Update Daily Recommendation to Be Peloton-Aware + Next Session

**Files to modify:**
- `packages/functions/src/handlers/cycling-coach.ts`
  - Replace `getSessionType()` with `determineNextSession()` call
  - Fetch this week's Strava activities to figure out what's been completed
  - Build `ScheduleContext` with `nextSession`, `sessionsCompletedThisWeek`, `totalSessionsThisWeek`
- `packages/functions/src/types/cycling.ts`
  - Update `ScheduleContext` to include `nextSession`, `sessionsCompletedThisWeek`, `totalSessionsThisWeek`, `weeklySessionQueue`
- `packages/functions/src/services/cycling-coach.service.ts`
  - Update `buildSystemPrompt()` to be Peloton-aware
  - Remove interval-specific instructions from prompt
  - Add Peloton class type taxonomy to prompt
  - Update response validation: `pelotonClassTypes` instead of `intervals`
  - Update `createFallbackResponse()` to use Peloton class types
- `packages/functions/src/prompts/cycling-coach-system.md`
  - Rewrite training philosophy to frame everything as Peloton class suggestions
  - Remove interval protocol prescriptions
  - Add Peloton class type reference table
  - Update lifting interference section to reference Peloton class swaps (e.g., "Leg Day yesterday → swap PZ Max for a 20-min Low Impact or Recovery Ride")

**Tests:**
- Update existing coach tests for Peloton-aware responses

### Phase 4: iOS — Setup Wizard

**Files to modify:**
- `ios/BradOS/BradOS/Models/CyclingModels.swift`
  - Add `ExperienceLevel` enum
  - Add `WeeklySessionModel` struct with `order`, `pelotonClassTypes`, `preferredDay`
  - Extend `TrainingBlockModel` with `weeklySessions`, `preferredDays`, `experienceLevel`, `weeklyHoursAvailable`
  - Add `GenerateScheduleResponse` model
  - Update `SessionRecommendationModel` (if exists) for Peloton fields
- `ios/BradOS/BradOS/Services/APIClient.swift`
  - Add `generateSchedule()` method → POST `/cycling-coach/generate-schedule`
  - Update `createBlock()` to send new fields
- `ios/BradOS/BradOS/Services/CyclingCoachClient.swift`
  - Add `generateSchedule()` client method
- `ios/BradOS/BradOS/ViewModels/CyclingViewModel.swift`
  - Add `generateSchedule()` function
  - Add `@Published var generatedSchedule: GenerateScheduleResponse?`
  - Update `startNewBlock()` to include schedule data
- `ios/BradOS/BradOS/Views/Profile/TrainingBlockSetupView.swift`
  - Replace with multi-step wizard (5 steps)
  - Step 1: Experience & hours (new)
  - Step 2: Days per week & day selection (new)
  - Step 3: Goals (existing logic, reskinned)
  - Step 4: AI schedule preview with Peloton class types (new)
  - Step 5: Start date (existing logic, moved)
- `ios/BradOS/BradOS/Views/Cycling/CyclingBlockView.swift`
  - Update `NewBlockSheet` to use same wizard flow
- `ios/BradOS/BradOS/Views/Onboarding/CyclingOnboardingView.swift`
  - Update onboarding to use new wizard steps

### Phase 5: iOS — Block View & Coach Card Updates

**Files to modify:**
- `ios/BradOS/BradOS/Views/Cycling/CyclingBlockView.swift`
  - Add `SessionQueueCard` showing ordered sessions with completion status (checkmarks, not day labels)
  - Add `NextUpCard` highlighting the next incomplete session
  - Week-complete state: "All 3 sessions done this week. Nice work."
  - Update phase descriptions to be Peloton-framed
  - No "missed day" indicators anywhere — only forward-looking language
- `ios/BradOS/BradOS/Views/Cycling/CyclingTodayView.swift`
  - Show "Next Up: Power Zone Max" based on next-session logic, not day of week
  - Connect to AI coach recommendation for the next session
  - Show lifting interference warning when relevant ("You did Leg Day yesterday — today's recommendation is adjusted")
- `ios/BradOS/BradOS/Views/Cycling/CoachRecommendationCard.swift`
  - Replace interval details section with Peloton class suggestions
  - Show "Next Up" label + primary class type prominently
  - Show "Session X of Y this week" progress indicator
  - Show alternatives as secondary text
  - Show `pelotonTip` as the coaching guidance
  - Remove `IntervalDetailView` / interval protocol display
  - Keep: reasoning, coaching tips, warnings, recovery state, TSS target
- `ios/BradOS/BradOS/ViewModels/CyclingViewModel.swift`
  - Add `nextSession` computed property (or fetched from backend)
  - Add `sessionsCompletedThisWeek` property
  - Match Strava activities against session queue to determine completion

### Phase 6: Backward Compatibility & Cleanup

- Blocks without `weeklySessions` fall back to default 3-session queue [PZ Max, PZ, Fun] on fetch
- Keep `IntervalWorkout` type but mark as deprecated (future custom workout feature)
- `getSessionType()` function kept as fallback when no block exists
- Coach handles missing schedule gracefully (uses day-of-week fallback → converted to next-session)
- Lifting context gracefully returns empty/false when no workout data exists

## File Change Summary

| File | Phase | Change |
|---|---|---|
| `types/cycling.ts` | 1, 2, 3 | `WeeklySession`, updated `ScheduleContext`, `isLowerBody` |
| `schemas/cycling.schema.ts` | 1 | New schemas |
| `firestore-cycling.service.ts` | 1 | Store/fetch `weeklySessions` + new fields |
| `training-load.service.ts` | 1 | `determineNextSession()`, `getWeekBoundaries()` |
| `cycling-coach.ts` (handler) | 1, 2, 3 | New endpoint, lifting queries, next-session logic |
| `cycling-coach.service.ts` | 1, 3 | Schedule generation, Peloton-aware prompts |
| `cycling-coach-system.md` | 3 | Rewrite for Peloton + lifting + next-session |
| `schedule-generation-system.md` | 1 | New prompt file |
| `workout.repository.ts` | 2 | Existing — used by handler (no changes needed) |
| `plan-day.repository.ts` | 2 | Existing — used by handler (no changes needed) |
| `workout-set.repository.ts` | 2 | Existing — used by handler (no changes needed) |
| `CyclingModels.swift` | 4 | `WeeklySessionModel`, updated block model |
| `APIClient.swift` | 4 | New API methods |
| `CyclingCoachClient.swift` | 4 | Schedule generation client |
| `CyclingViewModel.swift` | 4, 5 | Schedule generation, `nextSession`, completion tracking |
| `TrainingBlockSetupView.swift` | 4 | Multi-step wizard |
| `CyclingBlockView.swift` | 4, 5 | NewBlockSheet + session queue card |
| `CyclingOnboardingView.swift` | 4 | Updated onboarding |
| `CyclingTodayView.swift` | 5 | Next-session context, lifting warnings |
| `CoachRecommendationCard.swift` | 5 | Peloton class display, "Next Up" framing |

## Success Criteria

1. User can choose 2-5 sessions per week during block setup
2. User can indicate preferred days (as suggestions, not commitments)
3. User sees an AI-generated session queue suggesting Peloton class types before confirming
4. After block creation, the block view shows the session queue with completion progress
5. **"Next Up" always shows the next incomplete session** — no day-of-week rigidity
6. If it's Wednesday and the user hasn't ridden yet, the app shows session 1 with no judgment
7. Daily AI coach recommendations suggest Peloton class types (not interval protocols)
8. Recovery-based adjustments recommend easier Peloton classes or shorter durations (not fewer intervals)
9. Week resets on Monday — no accumulated "debt" from previous weeks
10. Existing blocks without session data continue to work (fall back to 3-session default)
11. **AI coach receives real lifting data** — yesterday's Leg Day triggers a recovery ride recommendation instead of PZ Max
12. **Lifting schedule context is populated** — today/tomorrow planned workouts inform the coach about upcoming interference
13. **No shame UI anywhere** — no red X's, no "missed" labels, no "you were supposed to..." language
