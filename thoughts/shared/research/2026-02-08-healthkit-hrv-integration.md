# HealthKit + Strava Integration Research: AI Cycling Coach

**Date:** 2026-02-08
**Status:** Active Research
**Related:** Recovery-aware training, AI cycling coach feature

---

## Executive Summary

This research covers building an **AI cycling coach** that uses:
- **HealthKit** for HRV, sleep metrics, and weight
- **Strava API** for Peloton workout data (including power)
- **OpenAI** for personalized class recommendations

The goal: Take 8 weeks to regain cardio fitness via Peloton, maintain muscle mass with lifting, and lose weight. The AI will recommend specific power zone targets based on recovery state, training load (TSS), FTP, and goals.

**Key insight:** Peloton exports power data to Strava, so we can calculate TSS accurately. Combined with HealthKit's HRV and sleep data, we have everything needed for intelligent training recommendations.

---

## Part 1: Data Sources Overview

| Data | Source | Notes |
|------|--------|-------|
| HRV | HealthKit | Apple Watch measures every 2-5 hours |
| Sleep (stages, duration, efficiency) | HealthKit | Apple Watch tracks Core/Deep/REM/Awake |
| Weight | HealthKit | Manual or smart scale entries |
| Resting Heart Rate | HealthKit | Daily measurement from Apple Watch |
| Cycling workouts (power, HR, duration) | Strava API | Peloton exports power data |
| FTP | Manual entry | User enters every 4 weeks after testing |
| Lifting workouts | Existing Brad OS data | Already tracked in mesocycles |

---

## Part 2: HealthKit Technical Details

### HRV (Heart Rate Variability)

| Property | Value |
|----------|-------|
| Identifier | `HKQuantityTypeIdentifier.heartRateVariabilitySDNN` |
| Units | Milliseconds (`.secondUnit(with: .milli)`) |
| Metric | SDNN (Standard Deviation of Normal-to-Normal R-R intervals) |
| Sampling | Apple Watch measures every 2-5 hours automatically |
| Sleep sampling | "A few times during the night" - sporadic, not continuous |
| Historical access | Yes - query as far back as data exists |
| Average reading | ~36ms across Apple Watch users (highly individual) |
| Normal range | 18-76ms |

**SDNN vs RMSSD:** Apple uses SDNN, which measures overall autonomic variability. Whoop/Oura use RMSSD, which is more parasympathetic-specific. For trend tracking (our use case), SDNN works fine.

#### Swift Query Example

```swift
func fetchLatestHRV() async throws -> Double? {
    let hrvType = HKQuantityType(.heartRateVariabilitySDNN)
    let descriptor = HKSampleQueryDescriptor(
        predicates: [.quantitySample(type: hrvType)],
        sortDescriptors: [SortDescriptor(\.endDate, order: .reverse)],
        limit: 1
    )

    let results = try await descriptor.result(for: healthStore)
    return results.first?.quantity.doubleValue(for: .secondUnit(with: .milli))
}
```

### Sleep Data

| Property | Value |
|----------|-------|
| Type | `HKCategoryType` with identifier `.sleepAnalysis` |
| Values | `inBed`, `asleepCore`, `asleepDeep`, `asleepREM`, `awake`, `asleepUnspecified` |
| Source | Apple Watch (iPhone only tracks `inBed`) |
| Accuracy | REM: 78-82%, Deep: 50-62%, Wake: 26-44% (known limitation) |

**Sleep Stage Definitions:**
- **Core (Light):** N1 and N2 NREM stages - largest portion of sleep
- **Deep:** N3 NREM stage - growth hormone release, tissue repair
- **REM:** Motor memory consolidation, skill acquisition

**Key Metrics for Recovery:**

| Metric | Target | Poor Threshold | Impact |
|--------|--------|----------------|--------|
| Total Duration | 7-9 hours (9-10 for athletes) | <7 hours | Increased injury risk |
| Sleep Efficiency | 85-95% | <85% | Poor sleep quality |
| Deep Sleep % | 15-20% | <10% | Impaired muscle recovery |
| REM Sleep % | 20-25% | <15% | Reduced motor learning |

#### Swift Query Example

```swift
func fetchSleepData(for date: Date) async throws -> SleepMetrics {
    let sleepType = HKCategoryType(.sleepAnalysis)
    let startOfDay = Calendar.current.startOfDay(for: date)
    let endOfDay = Calendar.current.date(byAdding: .day, value: 1, to: startOfDay)!

    let predicate = HKQuery.predicateForSamples(withStart: startOfDay, end: endOfDay)
    let descriptor = HKSampleQueryDescriptor(
        predicates: [.categorySample(type: sleepType, predicate: predicate)],
        sortDescriptors: [SortDescriptor(\.startDate)]
    )

    let samples = try await descriptor.result(for: healthStore)

    var metrics = SleepMetrics()
    for sample in samples {
        let duration = sample.endDate.timeIntervalSince(sample.startDate)
        switch HKCategoryValueSleepAnalysis(rawValue: sample.value) {
        case .inBed: metrics.inBed += duration
        case .asleepCore: metrics.core += duration; metrics.totalSleep += duration
        case .asleepDeep: metrics.deep += duration; metrics.totalSleep += duration
        case .asleepREM: metrics.rem += duration; metrics.totalSleep += duration
        case .awake: metrics.awake += duration
        default: break
        }
    }

    metrics.efficiency = metrics.inBed > 0 ? (metrics.totalSleep / metrics.inBed) * 100 : 0
    return metrics
}
```

### Weight / Body Mass

| Property | Value |
|----------|-------|
| Identifier | `HKQuantityTypeIdentifier.bodyMass` |
| Units | Pounds (`HKUnit.pound()`) or kg |
| Sources | Manual entries + smart scale entries |

### Resting Heart Rate

| Property | Value |
|----------|-------|
| Identifier | `HKQuantityTypeIdentifier.restingHeartRate` |
| Units | BPM |
| Sampling | Apple Watch calculates daily from lowest readings |

---

## Part 3: Strava API for Peloton Data

### Why Strava Instead of HealthKit for Workouts?

Peloton exports **power data** to Strava, which HealthKit doesn't capture from Peloton. Power is essential for TSS calculation.

### What Peloton Exports to Strava

- Heart rate (average, max, stream)
- Power (average, weighted average, max, stream)
- Duration, distance, calories
- Activity type: `VirtualRide`

### Authentication

| Property | Value |
|----------|-------|
| Flow | OAuth 2.0 with PKCE |
| Token expiry | 6 hours |
| Refresh tokens | Yes - **may change on each refresh** |
| Storage | iOS Keychain (never UserDefaults) |
| Scopes needed | `activity:read` or `activity:read_all` |

**Mobile OAuth Flow:**
1. Use `ASWebAuthenticationSession` or detect Strava app
2. Redirect to custom URL scheme
3. Exchange code for tokens
4. Store in Keychain, refresh proactively

### Activity Data Available

**From `/activities/{id}` endpoint:**

```json
{
  "id": 123456,
  "type": "VirtualRide",
  "moving_time": 2700,
  "elapsed_time": 2850,
  "average_heartrate": 145,
  "max_heartrate": 172,
  "has_heartrate": true,
  "average_watts": 180,
  "weighted_average_watts": 195,
  "max_watts": 350,
  "device_watts": true,
  "kilojoules": 486,
  "suffer_score": 78
}
```

**Key fields:**
- `weighted_average_watts` = Normalized Power (basically)
- `device_watts: true` = Power from device, not estimated

### Streams Data (Time-Series)

For accurate TSS calculation, fetch second-by-second data:

```
GET /activities/{id}/streams?keys=watts,heartrate,time&key_by_type=true
```

Returns arrays of values aligned by index.

### Webhooks

Strava supports webhooks for real-time activity sync:

| Event | Description |
|-------|-------------|
| `activity.create` | New activity uploaded |
| `activity.update` | Activity modified |
| `activity.delete` | Activity removed |

**Setup:**
1. Register callback URL with Strava
2. Strava sends verification challenge
3. Respond within 2 seconds
4. Receive POST with activity IDs (not full data)
5. Fetch full activity data via API

### Rate Limits

| Limit | Value |
|-------|-------|
| 15-minute | 100-200 requests |
| Daily | 1,000-2,000 requests |
| Reset | 0, 15, 30, 45 minutes past hour |

**Mitigation:** Use webhooks + caching. Only fetch details when notified of new activity.

---

## Part 4: TSS Calculation

Strava does NOT provide TSS directly. We calculate it from power data.

### Power-Based TSS Formula

```
TSS = (duration_seconds × NP × IF) / (FTP × 3600) × 100
```

Where:
- **NP (Normalized Power)** = Strava's `weighted_average_watts` (close enough)
- **IF (Intensity Factor)** = NP / FTP
- **FTP** = User's Functional Threshold Power (manually entered)

### Example Calculation

```
45-minute ride:
- Duration: 2700 seconds
- Weighted Average Power: 195W
- FTP: 250W

IF = 195 / 250 = 0.78
TSS = (2700 × 195 × 0.78) / (250 × 3600) × 100
TSS = 410,670 / 900,000 × 100
TSS = 45.6
```

### Accurate NP from Streams (Optional)

If `weighted_average_watts` isn't accurate enough:

```swift
func calculateNormalizedPower(watts: [Int], sampleRate: Int = 1) -> Double {
    // 30-second rolling average
    let windowSize = 30 / sampleRate
    guard watts.count >= windowSize else { return 0 }

    var rollingAverages: [Double] = []
    for i in (windowSize - 1)..<watts.count {
        let window = watts[(i - windowSize + 1)...i]
        let avg = Double(window.reduce(0, +)) / Double(windowSize)
        rollingAverages.append(avg)
    }

    // Fourth power average, then fourth root
    let fourthPowers = rollingAverages.map { pow($0, 4) }
    let avgFourthPower = fourthPowers.reduce(0, +) / Double(fourthPowers.count)
    return pow(avgFourthPower, 0.25)
}
```

### Training Load Tracking

Track cumulative TSS over rolling windows:

| Metric | Formula | Purpose |
|--------|---------|---------|
| **ATL (Acute Training Load)** | 7-day exponential average of daily TSS | Recent fatigue |
| **CTL (Chronic Training Load)** | 42-day exponential average of daily TSS | Fitness |
| **TSB (Training Stress Balance)** | CTL - ATL | Form/freshness |

**TSB interpretation:**
- Positive TSB (>0): Fresh, ready for hard efforts
- Negative TSB (<-20): Accumulated fatigue, need recovery
- Sweet spot: -10 to +10 for race readiness

---

## Part 5: Recovery Score Algorithm

### Inputs

1. **HRV** - Overnight average or morning reading
2. **Resting Heart Rate** - Daily value
3. **Sleep Quality** - Duration, efficiency, deep sleep %

### Baseline Calculation

```swift
struct RecoveryBaseline {
    let hrvMedian: Double      // 60-day rolling median
    let hrvStdDev: Double      // For smallest worthwhile change
    let rhrMedian: Double      // 60-day rolling median
}

func calculateBaseline(hrvReadings: [Double], rhrReadings: [Double]) -> RecoveryBaseline {
    // Use median (resistant to outliers)
    let hrvSorted = hrvReadings.sorted()
    let rhrSorted = rhrReadings.sorted()

    return RecoveryBaseline(
        hrvMedian: hrvSorted[hrvSorted.count / 2],
        hrvStdDev: standardDeviation(hrvReadings),
        rhrMedian: rhrSorted[rhrSorted.count / 2]
    )
}
```

### Recovery Score Calculation

```swift
enum RecoveryState {
    case ready      // Green - train as planned
    case moderate   // Yellow - reduce intensity
    case recover    // Red - rest or easy only
}

func calculateRecovery(
    todayHRV: Double,
    todayRHR: Double,
    sleepMetrics: SleepMetrics,
    baseline: RecoveryBaseline
) -> (score: Int, state: RecoveryState) {

    // HRV component (0-100, 70% weight)
    let hrvDelta = (todayHRV - baseline.hrvMedian) / baseline.hrvStdDev
    let hrvScore = min(100, max(0, 50 + (hrvDelta * 25)))

    // RHR component (0-100, 20% weight) - lower is better
    let rhrDelta = (baseline.rhrMedian - todayRHR) / 5.0  // 5 BPM = 1 std dev approx
    let rhrScore = min(100, max(0, 50 + (rhrDelta * 25)))

    // Sleep component (0-100, 10% weight)
    var sleepScore = 0.0
    sleepScore += sleepMetrics.totalSleep >= 7 * 3600 ? 40 : (sleepMetrics.totalSleep / (7 * 3600)) * 40
    sleepScore += sleepMetrics.efficiency >= 85 ? 30 : (sleepMetrics.efficiency / 85) * 30
    sleepScore += sleepMetrics.deepPercent >= 15 ? 30 : (sleepMetrics.deepPercent / 15) * 30

    // Weighted combination
    let totalScore = Int(hrvScore * 0.7 + rhrScore * 0.2 + sleepScore * 0.1)

    // State determination
    let state: RecoveryState
    if totalScore >= 70 {
        state = .ready
    } else if totalScore >= 50 {
        state = .moderate
    } else {
        state = .recover
    }

    return (totalScore, state)
}
```

---

## Part 6: AI Cycling Coach Feature

### The Concept

An LLM-powered coach that recommends **specific session prescription** for your next Peloton ride based on:
- Current recovery state (HRV, sleep, RHR)
- Recent training load (TSS history, ATL/CTL/TSB)
- Your FTP
- Today's/tomorrow's lifting schedule
- Position in training block
- The cycling training philosophy corpus

### Training Philosophy (Summary)

The coach follows the evidence-based framework in `thoughts/shared/research/Cycing-Training-philosophy.md`:

**Weekly Structure (3 sessions):**
| Session | Day | Purpose | Intensity |
|---------|-----|---------|-----------|
| **Session 1** | Tuesday | VO2max intervals (SIT/Short HIIT) | 30/30, 40/20, or 30/120 protocols |
| **Session 2** | Thursday | Threshold development | Sweet spot (88-94% FTP) or threshold (95-105% FTP) |
| **Session 3** | Saturday | **Fun** - whatever you enjoy | Self-selected, no prescription |

**Key Principles:**
1. Two structured sessions drive adaptation; third session protects adherence
2. Maximize time at VO2max (>90% HRmax) in Session 1
3. Sweet spot/threshold work in Session 2 raises sustainable % of VO2max
4. Session 3 is NEVER prescribed - it's whatever sounds fun
5. Reduce interval count (not intensity) when fatigued
6. Concurrent training interference is minimal with cycling + proper spacing

**8-Week Periodization:**
- Weeks 1-2: Adaptation (lower volume)
- Weeks 3-4: Build (increase intervals)
- Week 5: Recovery (-30-40% volume)
- Weeks 6-7: Peak (max interval volume)
- Week 8: Test (FTP test + recovery)

**Load Reduction Triggers:**
- RHR elevated >5-7 bpm for 3+ days
- Can't complete prescribed intervals
- Subjective recovery <4/10
- Session 3 feels like a chore (adherence warning)

### Data Flow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Apple Watch   │     │    Peloton      │     │   User Input    │
│  (via HealthKit)│     │  (via Strava)   │     │                 │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │ HRV, Sleep,           │ Power, HR,            │ FTP, Goals,
         │ Weight, RHR           │ Duration              │ Preferences
         │                       │                       │
         ▼                       ▼                       ▼
┌────────────────────────────────────────────────────────────────────┐
│                        iOS App (BradOS)                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐    │
│  │HealthKit    │  │ Strava      │  │ Local State             │    │
│  │Manager      │  │ Client      │  │ (FTP, Goals, Prefs)     │    │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘    │
│         │                │                     │                   │
│         └────────────────┼─────────────────────┘                   │
│                          │                                         │
│                          ▼                                         │
│              ┌───────────────────────┐                             │
│              │ Recovery + TSS        │                             │
│              │ Calculation           │                             │
│              └───────────┬───────────┘                             │
│                          │                                         │
└──────────────────────────┼─────────────────────────────────────────┘
                           │
                           │ POST /cycling-coach/recommend
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     Cloud Function (Express)                          │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ Build prompt with:                                               │ │
│  │  - Recovery state + score                                        │ │
│  │  - Last 7 days of TSS                                            │ │
│  │  - Current ATL/CTL/TSB                                           │ │
│  │  - FTP value                                                     │ │
│  │  - Goals and week position                                       │ │
│  │  - Cycling science corpus (RAG or inline)                        │ │
│  └───────────────────────────┬─────────────────────────────────────┘ │
│                              │                                        │
│                              ▼                                        │
│                    ┌───────────────────┐                              │
│                    │   OpenAI API      │                              │
│                    │   (gpt-4o)        │                              │
│                    └─────────┬─────────┘                              │
│                              │                                        │
│                              ▼                                        │
│                    ┌───────────────────┐                              │
│                    │ Structured JSON   │                              │
│                    │ Response          │                              │
│                    └───────────────────┘                              │
└──────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        iOS App Display                                │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │  Today's Ride Recommendation                                    │ │
│  │                                                                 │ │
│  │  🟢 Recovery: 78%                                               │ │
│  │                                                                 │ │
│  │  Suggested: 45-min Power Zone Endurance                         │ │
│  │  Target Zone: Z2-Z3 (56-75% FTP)                                │ │
│  │  Target TSS: 45-55                                              │ │
│  │                                                                 │ │
│  │  "Your HRV is 8% above baseline and you had excellent sleep.    │ │
│  │   Today is a good day for sustained aerobic work. Stick to      │ │
│  │   zones 2-3 to build base fitness without accumulating too      │ │
│  │   much fatigue before tomorrow's lifting session."              │ │
│  │                                                                 │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

### Power Zone Reference

| Zone | Name | % of FTP | Purpose |
|------|------|----------|---------|
| Z1 | Active Recovery | <55% | Recovery rides |
| Z2 | Endurance | 56-75% | Aerobic base, fat burning |
| Z3 | Tempo | 76-90% | Muscular endurance |
| Z4 | Lactate Threshold | 91-105% | Threshold power |
| Z5 | VO2max | 106-120% | Aerobic capacity |
| Z6 | Anaerobic | 121-150% | Short power |
| Z7 | Neuromuscular | 150%+ | Sprint power |

### LLM Request/Response Structure

```typescript
interface CyclingCoachRequest {
  // Recovery state
  recovery: {
    score: number;              // 0-100
    state: 'ready' | 'moderate' | 'recover';
    hrvMs: number;              // Today's HRV in ms
    hrvVsBaseline: number;      // % difference from 60-day median
    rhrBpm: number;             // Today's resting HR
    rhrVsBaseline: number;      // Difference from baseline
    sleepHours: number;
    sleepEfficiency: number;    // 0-100%
    deepSleepPercent: number;   // 0-100%
  };

  // Training load
  trainingLoad: {
    last14DaysTSS: { date: string; tss: number; type: 'cycling' | 'lifting' }[];
    atl: number;                // 7-day exponential avg
    ctl: number;                // 42-day exponential avg
    tsb: number;                // CTL - ATL (form)
  };

  // Athlete profile
  athlete: {
    ftp: number;
    ftpLastTestedDate: string;
    goals: ('regain_fitness' | 'maintain_muscle' | 'lose_weight')[];
    weekInBlock: number;        // 1-8
    blockStartDate: string;
  };

  // Schedule context
  schedule: {
    dayOfWeek: string;          // "Tuesday", "Thursday", "Saturday"
    sessionType: 'vo2max' | 'threshold' | 'fun';
    liftingToday: boolean;
    liftingTomorrow: boolean;
    liftingYesterday: boolean;
  };

  // Recent performance
  recentPerformance: {
    lastSession: {
      date: string;
      prescribedIntervals: number;
      completedIntervals: number;
      avgPowerVsTarget: number; // % of target achieved
    } | null;
    missedSessionsLast7Days: number;
  };

  // Weight trend
  weight: {
    currentLbs: number;
    trend7DayLbs: number;       // Change over 7 days
    trend30DayLbs: number;      // Change over 30 days
  };
}

interface CyclingCoachResponse {
  // Session prescription
  session: {
    type: 'vo2max' | 'threshold' | 'fun' | 'recovery' | 'off';
    durationMinutes: number;

    // Only for structured sessions (vo2max/threshold)
    intervals?: {
      protocol: string;         // "30/30", "40/20", "2x20 sweet spot", etc.
      count: number;            // Number of intervals
      workSeconds: number;
      restSeconds: number;
      targetPowerPercent: { min: number; max: number }; // % of FTP
    };

    // Target outcome
    targetTSS: { min: number; max: number };
    targetZones: string;        // "Z5-Z6" or "Z3-Z4"
  };

  // Explanation for the user
  reasoning: string;            // 2-4 sentences explaining the prescription

  // Coaching notes
  coachingTips?: string[];      // Optional tips for execution

  // Warnings
  warnings?: {
    type: 'fatigue' | 'overreaching' | 'undertrained' | 'ftp_stale' | 'adherence';
    message: string;
  }[];

  // Suggested FTP test if week 8 or if FTP is stale
  suggestFTPTest?: boolean;
}
```

### System Prompt Structure

The system prompt includes the full training philosophy corpus, then the structured data:

```
You are an AI cycling coach implementing the evidence-based training framework below.

## Training Philosophy
[Full content of Cycing-Training-philosophy.md]

## Your Role
- Prescribe today's session based on the framework, recovery data, and training load
- For Tuesday (Session 1): VO2max intervals - adjust interval count based on recovery
- For Thursday (Session 2): Threshold/sweet spot - adjust duration based on recovery
- For Saturday (Session 3): ALWAYS prescribe "fun" - no structured workout
- When recovery is poor: Reduce volume, not intensity
- When overreaching detected: Suggest recovery ride or day off
- Consider lifting schedule when prescribing intensity

## Decision Framework
1. Check session type (vo2max/threshold/fun)
2. Assess recovery state and load
3. Consider week in block (periodization phase)
4. Account for lifting interference
5. Prescribe appropriate volume for the day

## Athlete Data
[CyclingCoachRequest JSON]

Respond with a CyclingCoachResponse JSON object.
```

### Example Request/Response

**Request (Thursday, Week 3):**
```json
{
  "recovery": {
    "score": 72,
    "state": "ready",
    "hrvMs": 38,
    "hrvVsBaseline": -5,
    "rhrBpm": 54,
    "rhrVsBaseline": 2,
    "sleepHours": 6.8,
    "sleepEfficiency": 82,
    "deepSleepPercent": 12
  },
  "trainingLoad": {
    "last14DaysTSS": [...],
    "atl": 32,
    "ctl": 25,
    "tsb": -7
  },
  "athlete": {
    "ftp": 220,
    "ftpLastTestedDate": "2026-01-15",
    "goals": ["regain_fitness", "maintain_muscle", "lose_weight"],
    "weekInBlock": 3
  },
  "schedule": {
    "dayOfWeek": "Thursday",
    "sessionType": "threshold",
    "liftingToday": false,
    "liftingTomorrow": true,
    "liftingYesterday": false
  },
  "recentPerformance": {
    "lastSession": {
      "date": "2026-02-06",
      "prescribedIntervals": 12,
      "completedIntervals": 12,
      "avgPowerVsTarget": 98
    },
    "missedSessionsLast7Days": 0
  },
  "weight": {
    "currentLbs": 183.2,
    "trend7DayLbs": -0.8,
    "trend30DayLbs": -2.4
  }
}
```

**Response:**
```json
{
  "session": {
    "type": "threshold",
    "durationMinutes": 50,
    "intervals": {
      "protocol": "2x15 sweet spot",
      "count": 2,
      "workSeconds": 900,
      "restSeconds": 300,
      "targetPowerPercent": { "min": 88, "max": 94 }
    },
    "targetTSS": { "min": 45, "max": 55 },
    "targetZones": "Z3-Z4"
  },
  "reasoning": "Week 3 build phase calls for increased threshold volume. Your HRV is slightly below baseline and sleep was short, so I'm prescribing 2x15 instead of 2x20. You crushed Tuesday's VO2max session, so the engine is responding well. Tomorrow's lifting means we keep today moderate.",
  "coachingTips": [
    "Warm up for 10 minutes before the first interval",
    "If the second interval feels impossible, cut it to 12 minutes - better to finish strong than blow up"
  ],
  "warnings": [
    {
      "type": "ftp_stale",
      "message": "FTP was last tested 24 days ago. Consider testing in Week 4 recovery week."
    }
  ]
}

### OpenAI Integration Pattern

Following the existing meal planner pattern:

```typescript
// packages/functions/src/services/cycling-coach.service.ts

const OPENAI_MODEL = 'gpt-4o';

export async function getCyclingRecommendation(
  request: CyclingCoachRequest,
  scienceCorpus: string,  // Cycling literature for context
  apiKey: string
): Promise<CyclingCoachResponse> {
  const client = new OpenAI({ apiKey });

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: buildSystemPrompt(scienceCorpus) },
    { role: 'user', content: JSON.stringify(request) }
  ];

  const response = await client.chat.completions.create({
    model: OPENAI_MODEL,
    response_format: { type: 'json_object' },
    messages,
  });

  return JSON.parse(response.choices[0]?.message?.content ?? '{}');
}
```

---

## Part 7: HealthKit Setup Requirements

### Xcode Configuration

1. **Enable HealthKit Capability**
   - Project Settings → Target → Signing & Capabilities → + Capability → HealthKit
   - Adds `com.apple.developer.healthkit` entitlement automatically

2. **Info.plist Keys (REQUIRED)**

```xml
<key>NSHealthShareUsageDescription</key>
<string>We use your HRV, sleep, and weight data to track recovery and provide personalized cycling training recommendations.</string>

<key>NSHealthUpdateUsageDescription</key>
<string>We save your workout data to HealthKit for a complete health picture.</string>
```

### Authorization Flow

```swift
@MainActor
class HealthKitManager: ObservableObject {
    private let healthStore = HKHealthStore()

    func requestAuthorization() async throws {
        guard HKHealthStore.isHealthDataAvailable() else {
            throw HealthKitError.notAvailable
        }

        let readTypes: Set<HKObjectType> = [
            HKQuantityType(.heartRateVariabilitySDNN),
            HKQuantityType(.bodyMass),
            HKQuantityType(.restingHeartRate),
            HKCategoryType(.sleepAnalysis)
        ]

        try await healthStore.requestAuthorization(toShare: [], read: readTypes)
    }
}
```

---

## Part 8: Implementation Phases

### Phase 1: HealthKit Foundation (iOS only)
- [ ] Add HealthKit capability and Info.plist keys
- [ ] Create `HealthKitManager` service
- [ ] Query HRV, sleep, weight, RHR
- [ ] Calculate recovery score locally
- [ ] Display Readiness Card on dashboard

### Phase 2: Strava Integration
- [ ] Register Strava API application
- [ ] Implement OAuth flow in iOS app
- [ ] Store tokens in Keychain
- [ ] Fetch activities and calculate TSS
- [ ] Set up webhook endpoint for real-time sync

### Phase 3: Training Load Tracking
- [ ] Store TSS history (local or backend)
- [ ] Calculate ATL/CTL/TSB
- [ ] Display training load chart

### Phase 4: AI Cycling Coach
- [ ] Create cycling-coach cloud function
- [ ] Build prompt with all data points
- [ ] Integrate OpenAI (following meal planner pattern)
- [ ] Display recommendation card in app
- [ ] Add cycling science corpus for RAG

### Phase 5: Goals & Preferences
- [ ] Goal selection UI (fitness, muscle, weight)
- [ ] FTP manual entry
- [ ] Training block configuration (8-week cycle)
- [ ] Integration with existing mesocycle system

---

## Part 9: Design Decisions (Confirmed)

### Data Strategy

| Data | Source | Storage | Notes |
|------|--------|---------|-------|
| **Cycling workout history** | Strava API | Firestore | Last 12 workouts fed to coach |
| **Lifting workout data** | HealthKit + existing Brad OS | Firestore | HR, duration, calories from Watch |
| **Mesocycle schedule** | Existing Brad OS data | SQLite | Coach sees planned lifting days |
| **FTP history** | Manual entry | Firestore | Every 4 weeks, prompted by coach |
| **Weight + goal** | HealthKit + manual | Firestore | Target weight and timeline |
| **TSS history** | Calculated from Strava | Firestore | ATL/CTL/TSB derived |
| **Strava tokens** | OAuth | iOS Keychain + Firestore | Both needed |

### Architecture Decisions

1. **Storage**: Firestore for all training data (survives device changes)
2. **Strava tokens**: iOS Keychain for on-demand queries, Firestore for webhook processing
3. **Strava webhook**: Cloud function receives notifications, fetches activity, calculates TSS
4. **Fun days**: Show encouraging "enjoy your ride!" message, still track TSS via Strava

### Navigation

**Dedicated Cycling section** inside Activities, mirroring the Lifting sub-page structure:
- Activities → Cycling → Shows coach recommendation + training block status
- Similar to Activities → Lifting → Shows mesocycle + workout list

---

## Part 10: New Feature Designs

### 10.1 Apple Watch Workout Auto-Launch (Lifting)

When user taps "Start Workout" in the iOS app, automatically start an Apple Watch strength training workout.

**Requirements:**
- Start `HKWorkoutActivityType.traditionalStrengthTraining` on Watch
- Collect: heart rate, active calories, duration
- End Watch workout when iOS app workout completes
- Sync workout data back to HealthKit

**Apple's Recommended Approach (iOS 17+):**

Use **HKWorkoutSession mirroring** instead of WatchConnectivity. This is the official Apple pattern for controlling Watch workouts from iPhone.

```
┌─────────────────────┐                           ┌─────────────────────┐
│     iOS App         │      HealthKit            │    WatchOS App      │
│                     │      Mirroring            │                     │
│  1. Create          │                           │                     │
│  HKWorkoutSession   │ ─startMirroringTo────────►│  2. Receives via    │
│  with config        │  CompanionDevice()        │  workoutSession-    │
│                     │                           │  MirroringStart-    │
│                     │                           │  Handler            │
│                     │                           │                     │
│  3. Start workout   │ ─sendToRemoteWorkout─────►│  4. Start           │
│                     │  Session(data:)           │  HKWorkoutBuilder   │
│                     │                           │                     │
│  Workout in         │                           │  Collect HR,        │
│  progress...        │ ◄─didReceiveDataFrom─────│  calories...        │
│                     │  RemoteWorkoutSession     │                     │
│                     │                           │                     │
│  5. End workout     │ ─sendToRemoteWorkout─────►│  6. stopActivity()  │
│                     │  Session(data:)           │  endCollection()    │
│                     │                           │  finishWorkout()    │
│                     │                           │  session.end()      │
│                     │                           │                     │
│  7. Receive         │ ◄─didReceiveDataFrom─────│  8. Send summary    │
│  summary            │  RemoteWorkoutSession     │  {avgHR, calories}  │
└─────────────────────┘                           └─────────────────────┘
```

**Key APIs:**

```swift
// iOS: Start mirrored session
let config = HKWorkoutConfiguration()
config.activityType = .traditionalStrengthTraining
config.locationType = .indoor

let session = try HKWorkoutSession(healthStore: healthStore, configuration: config)
try await session.startMirroringToCompanionDevice()

// iOS: Send commands to Watch
let startCommand = try JSONEncoder().encode(WorkoutCommand.start)
session.sendToRemoteWorkoutSession(data: startCommand) { success, error in }

// WatchOS: Receive in AppDelegate
class AppDelegate: NSObject, WKApplicationDelegate {
    func handle(_ workoutConfiguration: HKWorkoutConfiguration) {
        Task {
            try await workoutManager.startWorkout(with: workoutConfiguration)
        }
    }
}

// WatchOS: End sequence (in order!)
session.stopActivity(with: .now)
// Wait for state change to .stopped, then:
try await builder.endCollection(at: date)
let workout = try await builder.finishWorkout()
session.end()
```

**WatchOS App Requirements:**
- WatchOS app target in Xcode project
- `WKApplicationDelegate` to handle `workoutConfiguration`
- Background modes: `workout-processing`
- HealthKit entitlement on Watch
- Implement `HKWorkoutSessionDelegate` for state changes
- Implement `HKLiveWorkoutBuilderDelegate` for metrics

**What Apple Watch Tracks Automatically:**
- Heart rate (continuous during workout)
- Active calories
- Duration
- **NOT tracked:** Reps, sets, weight (must come from iOS app)

**Data Model Extension:**
```typescript
interface Workout {
  // ... existing fields
  watchData?: {
    avgHeartRate: number;
    maxHeartRate: number;
    activeCalories: number;
    totalDuration: number;  // seconds
  };
}
```

**Implementation Notes:**
1. iOS creates the session but Watch runs the workout builder
2. Data flows both ways via `sendToRemoteWorkoutSession`
3. Watch sends periodic HR updates during workout
4. Watch sends final summary when workout ends
5. Workout is saved to HealthKit automatically by Watch

**References:**
- [WWDC23: Build a multi-device workout app](https://developer.apple.com/videos/play/wwdc2023/10023/)
- [WWDC25: Track workouts with HealthKit on iOS and iPadOS](https://developer.apple.com/videos/play/wwdc2025/322/)
- [Running workout sessions (Apple)](https://developer.apple.com/documentation/healthkit/running-workout-sessions)

### 10.2 Weight Goal Feature

**Data Model:**
```typescript
interface WeightGoal {
  targetWeightLbs: number;
  targetDate: string;       // ISO date
  startWeightLbs: number;
  startDate: string;
  weeklyRateLbs: number;    // Calculated: (start - target) / weeks
}
```

**UI Location:** Profile screen, new "Weight Goal" section

**Display:**
- Current weight (from HealthKit)
- Target weight + date
- Progress bar
- Weekly rate (e.g., "-0.8 lbs/week")
- "On track" / "Behind" / "Ahead" status

**Coach Integration:**
- Weight trend included in coach request
- Coach can comment on progress in reasoning

### 10.3 Cycling Section Navigation

Mirror the existing Lifting section structure:

```
Activities
├── Lifting
│   ├── Meso (active mesocycle)
│   ├── Plans
│   └── Exercises
└── Cycling (NEW)
    ├── Today (coach recommendation)
    ├── Block (8-week block status)
    └── History (past rides with TSS)
```

**Today View:**
- Coach recommendation card
- Recovery status summary
- "Start Ride" button (for future: deep link to Peloton?)

**Block View:**
- Current week in block (e.g., "Week 3 of 8 - Build Phase")
- TSS chart (last 8 weeks)
- ATL/CTL/TSB graph
- FTP history

**History View:**
- List of rides from Strava
- TSS, duration, avg power for each
- Tap to see details

### 10.4 Coach Request Structure (Updated)

```typescript
interface CyclingCoachRequest {
  // Recovery state
  recovery: {
    score: number;
    state: 'ready' | 'moderate' | 'recover';
    hrvMs: number;
    hrvVsBaseline: number;
    rhrBpm: number;
    rhrVsBaseline: number;
    sleepHours: number;
    sleepEfficiency: number;
    deepSleepPercent: number;
  };

  // Training load
  trainingLoad: {
    // Last 12 cycling workouts (or however many exist)
    recentCyclingWorkouts: {
      date: string;
      tss: number;
      durationMinutes: number;
      avgPower: number;
      normalizedPower: number;
      avgHr: number;
      type: 'vo2max' | 'threshold' | 'fun' | 'unknown';
    }[];

    // Aggregates
    atl: number;
    ctl: number;
    tsb: number;
  };

  // Last 12 lifting workouts (from HealthKit/Brad OS)
  recentLiftingWorkouts: {
    date: string;
    durationMinutes: number;
    avgHeartRate: number;
    maxHeartRate: number;
    activeCalories: number;
    workoutDayName: string;    // "Upper Body A", "Lower Body B", etc.
    setsCompleted: number;
    totalVolume: number;       // lbs × reps
  }[];

  // Athlete profile
  athlete: {
    ftp: number;
    ftpLastTestedDate: string;
    goals: ('regain_fitness' | 'maintain_muscle' | 'lose_weight')[];
    weekInBlock: number;
    blockStartDate: string;
  };

  // Weight
  weight: {
    currentLbs: number;
    trend7DayLbs: number;
    trend30DayLbs: number;
    goal?: {
      targetLbs: number;
      targetDate: string;
      weeklyRateLbs: number;
      onTrack: boolean;
    };
  };

  // Schedule context
  schedule: {
    dayOfWeek: string;
    sessionType: 'vo2max' | 'threshold' | 'fun';

    // From mesocycle data
    liftingSchedule: {
      today: { planned: boolean; workoutName?: string };
      tomorrow: { planned: boolean; workoutName?: string };
      yesterday: { completed: boolean; workoutName?: string };
    };
  };
}
```

---

## Part 11: Implementation Phases (Updated)

### Phase 1: HealthKit Foundation
- [ ] Add HealthKit capability and Info.plist keys
- [ ] Create `HealthKitManager` service
- [ ] Query HRV, sleep, weight, RHR
- [ ] Calculate recovery score locally
- [ ] Display Readiness Card on Today dashboard

### Phase 2: Apple Watch Lifting Integration
- [ ] Create WatchOS app target in Xcode project
- [ ] Implement WatchConnectivity on iOS and Watch
- [ ] Start/end `HKWorkoutSession` from iOS commands
- [ ] Collect HR, calories, duration during workout
- [ ] Send workout summary back to iOS
- [ ] Store watch data with workout in API

### Phase 3: Strava Integration
- [ ] Register Strava API application
- [ ] Implement OAuth flow in iOS app (ASWebAuthenticationSession)
- [ ] Store tokens in Keychain + Firestore
- [ ] Create Strava webhook cloud function
- [ ] Fetch activities and calculate TSS
- [ ] Store activity history in Firestore

### Phase 4: Cycling Section UI
- [ ] Add Cycling to Activities grid
- [ ] Create CyclingTabView (Today, Block, History)
- [ ] Today: placeholder for coach recommendation
- [ ] Block: week indicator, TSS chart placeholder
- [ ] History: list rides from Firestore

### Phase 5: Training Block Setup
- [ ] Goal selection UI (fitness, muscle, weight)
- [ ] Weight goal with target + date
- [ ] FTP manual entry in Profile
- [ ] Block start date picker
- [ ] Week-in-block calculation

### Phase 6: AI Cycling Coach
- [ ] Create cycling-coach cloud function
- [ ] Include training philosophy in system prompt
- [ ] Build request from HealthKit + Strava + mesocycle data
- [ ] Call OpenAI with structured JSON response
- [ ] Display recommendation card in Cycling Today view

### Phase 7: Polish
- [ ] FTP test prompting (every 4 weeks)
- [ ] Block transition handling (week 8 → new block)
- [ ] Historical TSS/CTL/ATL charts
- [ ] Weight trend visualization with goal
- [ ] Onboarding flow for first-time setup

---

## References

### Apple Documentation
- [heartRateVariabilitySDNN](https://developer.apple.com/documentation/healthkit/hkquantitytypeidentifier/heartratevariabilitysdnn)
- [HKCategoryValueSleepAnalysis](https://developer.apple.com/documentation/healthkit/hkcategoryvaluesleepanalysis)
- [Authorizing access to health data](https://developer.apple.com/documentation/healthkit/authorizing-access-to-health-data)

### Strava API
- [Strava API Authentication](https://developers.strava.com/docs/authentication/)
- [Strava API Reference](https://developers.strava.com/docs/reference/)
- [Strava Webhooks](https://developers.strava.com/docs/webhooks/)

### Training Science
- [Training Stress Scores Explained (TrainingPeaks)](https://help.trainingpeaks.com/hc/en-us/articles/204071944-Training-Stress-Scores-TSS-Explained)
- [Normalized Power (TrainerRoad)](https://www.trainerroad.com/blog/normalized-power-what-it-is-and-how-to-use-it/)
- [HRV-guided training (Kubios)](https://www.kubios.com/blog/hrv-guided-training/)

### Sleep & Recovery
- [Sleep and Athletic Performance (MDPI 2025)](https://www.mdpi.com/2077-0383/14/21/7606)
- [Apple Watch Sleep Tracking Accuracy (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC11511193/)
- [HRV and Sleep Deprivation (Frontiers 2025)](https://www.frontiersin.org/journals/neurology/articles/10.3389/fneur.2025.1556784/full)

### Apple Watch Workouts
- [WWDC23: Build a multi-device workout app](https://developer.apple.com/videos/play/wwdc2023/10023/)
- [WWDC25: Track workouts with HealthKit on iOS and iPadOS](https://developer.apple.com/videos/play/wwdc2025/322/)
- [Running workout sessions (Apple)](https://developer.apple.com/documentation/healthkit/running-workout-sessions)
- [HKWorkoutSession](https://developer.apple.com/documentation/healthkit/hkworkoutsession)
- [workoutSessionMirroringStartHandler](https://developer.apple.com/documentation/healthkit/hkhealthstore/workoutsessionmirroringstarthandler)

### Training Philosophy
- [Cycling Training Philosophy Corpus](thoughts/shared/research/Cycing-Training-philosophy.md) - Evidence-based framework for time-constrained cyclists
