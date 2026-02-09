# Cycling Coach Data Gap Analysis

**Date**: 2026-02-09
**Goal**: Identify data sources available in the system but not fed to the AI cycling coach

## What the Coach Currently Receives

The `CyclingCoachRequest` (assembled in `cycling-coach.ts:383-413`) includes:

### 1. Recovery Data (`recovery`)
- HRV (ms + vs baseline %)
- Resting HR (bpm + vs baseline)
- Sleep hours, efficiency, deep sleep %
- Overall score (0-100) and state (ready/moderate/recover)

### 2. Training Load (`trainingLoad`)
- Last 7 cycling activities (power, HR, TSS, duration, etc.)
- ATL (7-day), CTL (42-day), TSB

### 3. Recent Lifting Workouts (`recentLiftingWorkouts`)
- Last 7 days of completed lifting: date, duration, workout name, sets, volume, isLowerBody

### 4. Athlete Profile (`athlete`)
- FTP (watts) + last tested date
- Goals (from training block)
- Week in block + block start date

### 5. Weight (`weight`)
- **HARDCODED TO ZEROS** (line 399-402): `currentLbs: 0, trend7DayLbs: 0, trend30DayLbs: 0`

### 6. Schedule (`schedule`)
- Day of week, session type, next session in queue
- Sessions completed this week, total sessions, full weekly queue
- Lifting schedule (yesterday/today/tomorrow with lower body flag)

---

## Data Gaps: Available But NOT Fed to Coach

### GAP 1: Weight Data (HARDCODED ZEROS)
**Severity: HIGH** — The types exist, the Firestore services exist, but it's literally hardcoded to 0.

Available in system:
- `recoveryService.getLatestWeight(userId)` → current weight
- `recoveryService.getWeightHistory(userId, days)` → weight trend
- `cyclingService.getWeightGoal(userId)` → target weight, target date, start weight
- `WeightMetrics` type already has `currentLbs`, `trend7DayLbs`, `trend30DayLbs`, `goal?`

**Impact**: The coach can't factor in weight loss goals when recommending session intensity/duration. A caloric deficit affects recovery capacity and should lower intensity recommendations.

### GAP 2: VO2 Max Estimates
**Severity: HIGH** — The service exists, data is stored, but never sent to the coach.

Available in system:
- `cyclingService.getLatestVO2Max(userId)` → latest VO2 max estimate
- `cyclingService.getVO2MaxHistory(userId, 10)` → trend over time
- Includes method (FTP-derived, peak 5min, peak 20min), source power, source weight

**Impact**: The coach doesn't know the athlete's aerobic fitness level or trend. VO2 max trend tells you if training is actually working. A declining VO2 max should trigger different recommendations than a rising one.

### GAP 3: Efficiency Factor (EF) Trend
**Severity: MEDIUM** — EF is stored on each CyclingActivity, but the coach doesn't get the trend summary.

Available in system:
- Each `CyclingActivity` has `ef` field (NP/avg HR)
- `efficiency-factor.service.ts` has `calculateEF()` and `categorizeEF()`
- Activities are already sent to the coach, but there's no aggregated EF trend

**Impact**: EF trend over 4-8 weeks is one of the best indicators of aerobic improvement. The coach should know "EF is trending up by X% over the last month" to calibrate intensity recommendations.

### GAP 4: Recovery History (Trend)
**Severity: MEDIUM** — Only the latest snapshot is sent, not the trend.

Available in system:
- `recoveryService.getRecoveryHistory(userId, days)` → multi-day recovery trend
- `recoveryService.getRecoveryBaseline(userId)` → HRV median, HRV stddev, RHR median

**Impact**: A single day's recovery score misses the trend. Three consecutive "moderate" days means something very different from one "moderate" after a week of "ready." The coach should see 7-14 day recovery trajectory.

### GAP 5: FTP History (Progression)
**Severity: MEDIUM** — Only current FTP is sent, not the progression curve.

Available in system:
- `cyclingService.getFTPHistory(userId)` → all FTP entries with dates and source (manual vs test)

**Impact**: The coach doesn't know if FTP is stagnating (suggesting protocol change) or rapidly improving (suggesting the current approach works). FTP progression rate affects how aggressively to prescribe intensity.

### GAP 6: Cycling Profile (Max HR, Resting HR)
**Severity: LOW-MEDIUM** — Profile has maxHR and restingHR but these aren't in the coach request.

Available in system:
- `cyclingService.getCyclingProfile(userId)` → weightKg, maxHR, restingHR

**Impact**: Max HR enables HR zone calculation, which helps the coach give more precise zone targets. Without it, the coach can only reference power zones.

### GAP 7: Mesocycle Context (Lifting Periodization)
**Severity: LOW-MEDIUM** — The coach knows about recent lifting workouts but doesn't know the overall lifting program structure.

Available in system:
- Active mesocycle: current week (1-7), deload status
- Plan structure: which days are lower body, which are upper
- Progressive overload status: whether weights are increasing

**Impact**: If the lifter is in week 6 (heaviest week before deload), cycling intensity should be reduced proactively. If they're in deload week, cycling can be pushed harder. The coach currently only reacts to yesterday's workout, not the pattern.

### GAP 8: Stretching & Meditation Data
**Severity: LOW** — These activities exist but aren't fed to the coach.

Available in system:
- Stretch sessions: date, duration, body regions worked
- Meditation sessions: date, duration, type

**Impact**: Stretching data could indicate injury management (frequent hip flexor stretching = cycling-related tightness). Meditation consistency correlates with recovery quality. Low value individually but adds holistic picture.

### GAP 9: Calendar/Activity Density
**Severity: LOW** — The calendar service aggregates all activity types but this isn't sent to the coach.

Available in system:
- `calendar.service.ts` can show total activity load across all types
- Identifies "double days" (lifting + cycling) and rest days

**Impact**: Overall training density across all activities matters. A day with 60min lifting + 45min cycling is very different from cycling alone.

### GAP 10: Training Block Experience Level
**Severity: LOW** — Stored on training block but not sent in athlete profile.

Available in system:
- `block.experienceLevel` (beginner/intermediate/advanced)
- `block.weeklyHoursAvailable`

**Impact**: These were used for schedule generation but could improve daily recommendations too. A beginner needs more conservative intensity recommendations.

---

## Priority Implementation Order

| Priority | Gap | Effort | Impact |
|----------|-----|--------|--------|
| 1 | Weight data (unhardcode zeros) | Low | High |
| 2 | VO2 max (latest + trend) | Low | High |
| 3 | Recovery history (7-day trend) | Low | Medium |
| 4 | EF trend summary | Medium | Medium |
| 5 | FTP history | Low | Medium |
| 6 | Cycling profile (maxHR) | Low | Low-Med |
| 7 | Mesocycle context | Medium | Low-Med |
| 8 | Experience level | Low | Low |
| 9 | Stretching/meditation | Medium | Low |
| 10 | Calendar density | Medium | Low |

### Quick Wins (gaps 1, 2, 3, 5, 6, 8)
These just require fetching existing data and adding it to the `CyclingCoachRequest` + updating the system prompt. No new services or data collection needed.

### Medium Effort (gaps 4, 7, 9, 10)
These require computing derived metrics or pulling from different service domains.
