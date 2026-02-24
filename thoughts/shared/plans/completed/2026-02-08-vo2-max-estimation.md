# Estimated VO2 Max Feature - Implementation Plan

## Overview

Add an **estimated VO2 max** metric derived from cycling power and heart rate data, plus an **Efficiency Factor (EF)** trend for passive aerobic fitness tracking. Address the known **Peloton Apple Watch HR data gap** (10-70% missing samples) by using HealthKit as a fallback HR source.

## Current State

### What Exists
- **Strava integration**: OAuth, webhooks, historical sync importing `CyclingActivity` records
- **Activity data stored**: avgPower, normalizedPower, maxPower, avgHeartRate, maxHeartRate, tss, intensityFactor, type (`packages/functions/src/types/cycling.ts:22-38`)
- **Training load**: ATL/CTL/TSB already calculated via EMA in `training-load.service.ts`
- **FTP tracking**: Manual entry + staleness detection, stored in Firestore (`/users/{userId}/ftpHistory/`)
- **HealthKit**: HRV, RHR, sleep, weight queries implemented in `HealthKitManager.swift:30-333`
- **Weight from HealthKit**: `fetchLatestWeight()` returns lbs (`HealthKitManager.swift:168-183`)
- **Activity classification**: Rides classified by IF thresholds (vo2max/threshold/fun/recovery) in `strava.service.ts:173-181`

### What's Missing
- **No Strava streams fetch**: Only summary data (avg/max) is fetched, not time-series power/HR streams
- **No VO2 max estimation**: The "vo2max" activity type is just an IF >= 1.05 classification, not an actual mL/kg/min estimate
- **No Efficiency Factor tracking**: Power/HR ratio not calculated or trended
- **No peak power detection**: No rolling 5-min or 20-min best power calculation
- **No HR quality detection**: Can't tell if Peloton ride has sparse HR data
- **No HealthKit workout HR query**: HealthKit manager reads resting HR but not workout HR

### Key Constraints
- **Peloton HR gap**: Apple Watch HR via Peloton's HealthKit integration loses 10-70% of data (Apple Community thread). Theater Mode reduces this to 1-3%. BLE broadcast apps (HeartCast) fix it completely.
- **Peloton power accuracy**: Peloton estimates power from resistance + cadence, which can be 15-30% inflated vs calibrated power meters
- **Weight required**: VO2 max formula needs body weight in kg
- **Only summary data currently**: Strava summary gives `average_watts` and `weighted_average_watts`, but not the time-series needed for peak 5-min power

## Desired End State

1. **Estimated VO2 max** displayed in the Cycling section, calculated from best 5-minute power and body weight
2. **VO2 max trend** over time (recalculated when new peak efforts are detected)
3. **Efficiency Factor** (NP/avgHR) tracked per ride, with trend chart showing aerobic fitness improvement
4. **HR quality indicator** on rides showing completeness of HR data
5. **HealthKit workout HR fallback** for Peloton rides with missing/sparse Strava HR data
6. **User guidance** on improving HR data quality (Theater Mode tip, HeartCast suggestion)

## What We're NOT Doing

- No Garmin-style real-time VO2 max (requires continuous stream analysis with Firstbeat algorithm)
- No direct Peloton API integration (Strava export remains the pipeline)
- No lab-grade accuracy claims (estimates only, with appropriate disclaimers)
- No aerobic decoupling analysis (requires 90+ min steady rides, too niche for now)
- No Apple Watch BLE HR broadcast feature (third-party app territory)

## Key Discoveries

### VO2 Max Formula (ACSM)
```
VO2 max (mL/kg/min) = [(10.8 x watts) / weight_kg] + 7
```
Where `watts` = best effort power. Options:
- **5-minute max power**: Most direct VO2 max proxy (use Strava streams)
- **FTP-derived**: `VO2_max_power = FTP / 0.80`, then apply formula (no streams needed, less accurate)
- **20-minute max power**: Use 95% as FTP approximation

### Efficiency Factor
```
EF = Normalized Power / Average Heart Rate
```
- Ranges: 1.10-1.30 (beginner) → 1.50-2.0+ (well-trained)
- Best measured on Zone 2 steady rides
- Rising EF over weeks = improving aerobic fitness

### Strava Streams API
```
GET /activities/{id}/streams?keys=watts,heartrate,time&key_by_type=true
```
Returns per-second arrays: `watts.data: [150, 155, 160, ...]`, `heartrate.data: [120, 122, ...]`
All streams have the same length; indices correspond to the same timestamp.

### Peloton HR Data Pipeline
```
Apple Watch → HealthKit (10-70% data loss) → Peloton App → Strava
Power/Cadence: Peloton Bike → Peloton App → Strava (complete)
```
- Theater Mode on Apple Watch reduces HR loss to 1-3%
- BLE broadcast apps (HeartCast) give 100% HR capture
- HealthKit stores the Apple Watch HR samples independently of Peloton

### HealthKit Workout HR
HealthKit stores heart rate samples during workouts. We can query `HKQuantityType(.heartRate)` for a time window matching a Strava activity's start/end to get HR data that may be more complete than what Peloton synced to Strava.

---

## Implementation Approach

### Phase 1: Backend - VO2 Max Estimation Service

**Goal**: Calculate and store VO2 max estimates from existing activity data (FTP-based, no streams needed yet).

#### Changes Required

**New file: `packages/functions/src/services/vo2max.service.ts`**
```typescript
interface VO2MaxEstimate {
  id: string;
  userId: string;
  date: string;           // ISO 8601
  value: number;          // mL/kg/min
  method: 'ftp_derived' | 'peak_5min' | 'peak_20min';
  sourcePower: number;    // watts used for calculation
  sourceWeight: number;   // kg used for calculation
  activityId?: string;    // Strava activity that produced peak power
  createdAt: string;
}

// FTP-derived: VO2max_power = FTP / 0.80
// Then: VO2max = [(10.8 * watts) / weight_kg] + 7
function estimateVO2MaxFromFTP(ftpWatts: number, weightKg: number): number

// Peak power-derived: Use actual 5-min or 20-min best power
function estimateVO2MaxFromPeakPower(peakWatts: number, weightKg: number): number
```

**New file: `packages/functions/src/services/efficiency-factor.service.ts`**
```typescript
interface EfficiencyFactorEntry {
  activityId: string;
  date: string;
  ef: number;             // NP / avg_HR
  normalizedPower: number;
  avgHeartRate: number;
  activityType: string;   // Only meaningful for steady rides
}

// Calculate EF for a ride
function calculateEF(normalizedPower: number, avgHeartRate: number): number | null
// Returns null if avgHeartRate is 0 (no HR data)
```

**Modified: `packages/functions/src/types/cycling.ts`**
- Add `VO2MaxEstimate` interface
- Add `EfficiencyFactorEntry` interface
- Add `weightKg` to user settings type

**Modified: `packages/functions/src/services/firestore-cycling.service.ts`**
- Add Firestore collection: `/users/{userId}/vo2maxEstimates/{entryId}`
- Add CRUD methods: `saveVO2MaxEstimate()`, `getLatestVO2Max()`, `getVO2MaxHistory()`
- Add EF storage: `/users/{userId}/cyclingActivities/{id}` gets `ef` field

**Modified: `packages/functions/src/handlers/cycling.ts`**
- New endpoint: `GET /cycling/vo2max` - returns latest estimate + history
- New endpoint: `POST /cycling/vo2max/calculate` - triggers recalculation from latest FTP + weight
- Modify activity processing to calculate and store EF per ride

**Modified: `packages/functions/src/services/strava.service.ts`**
- `processStravaActivity()`: Add EF calculation when both NP and avgHR > 0
- Store EF value in activity document

#### Success Criteria
- `POST /cycling/vo2max/calculate` with FTP=250, weight=75kg returns `{ value: 42.8, method: "ftp_derived" }`
- EF is calculated and stored for every ride with HR data
- `GET /cycling/vo2max` returns latest estimate and last 10 entries
- Unit tests for ACSM formula edge cases (0 weight, 0 power, very high values)

---

### Phase 2: Strava Streams Integration

**Goal**: Fetch time-series power data from Strava to find peak 5-minute power for more accurate VO2 max.

#### Changes Required

**Modified: `packages/functions/src/services/strava.service.ts`**
```typescript
// New interface
interface StravaStream {
  data: number[];
  series_type: string;
  original_size: number;
  resolution: string;
}

interface ActivityStreams {
  watts?: StravaStream;
  heartrate?: StravaStream;
  time?: StravaStream;
  cadence?: StravaStream;
}

// New function
async function fetchActivityStreams(
  accessToken: string,
  activityId: number,
  keys: string[] = ['watts', 'heartrate', 'time']
): Promise<ActivityStreams>

// New function - rolling window best power
function calculatePeakPower(
  wattsStream: number[],
  timeStream: number[],
  windowSeconds: number  // 300 for 5-min, 1200 for 20-min
): number
```

**Modified: `packages/functions/src/services/strava.service.ts` - processStravaActivity()**
- After processing summary data, optionally fetch streams
- Calculate peak 5-min power from watts stream
- Store `peak5MinPower` on activity

**Modified: `packages/functions/src/types/cycling.ts` - CyclingActivity**
- Add optional fields: `peak5MinPower?: number`, `peak20MinPower?: number`, `ef?: number`
- Add `hrCompleteness?: number` (0-100, percentage of time with HR data)

**New: HR completeness detection**
```typescript
function calculateHRCompleteness(
  heartRateStream: number[],
  timeStream: number[]
): number
// Count non-zero HR samples / total samples * 100
// < 80% = warn user about HR quality
```

**Modified: `packages/functions/src/handlers/cycling.ts`**
- Sync endpoint: After importing activity, fetch streams for rides with power data
- Rate limit streams fetches (Strava API rate limits: 100 req/15 min, 1000 req/day)
- Store peak power and HR completeness

**Modified: webhook handler** (`strava-webhook.ts`)
- On activity create, fetch streams and compute peak power + HR completeness

#### Success Criteria
- Streams fetched for new activities via webhook
- Peak 5-min power correctly calculated (verified against known Strava data)
- HR completeness percentage stored per activity
- Rate limiting prevents Strava API throttling during bulk sync
- VO2 max auto-recalculates when new peak 5-min power exceeds previous best

---

### Phase 3: HealthKit Workout HR Fallback

**Goal**: For Peloton rides with sparse HR data in Strava, query HealthKit for Apple Watch HR samples during that time window to fill the gap.

#### Changes Required

**Modified: `ios/BradOS/BradOS/Services/HealthKitManager.swift`**
```swift
// Add to readTypes:
HKQuantityType(.heartRate)  // Workout HR (not just resting)

// New function
func fetchWorkoutHeartRate(
    startDate: Date,
    endDate: Date
) async throws -> [HeartRateSample] {
    // Query HKQuantityType(.heartRate) for the time window
    // Returns array of (date, bpm) samples
}

struct HeartRateSample: Equatable {
    let date: Date
    let bpm: Double
}

// New function - calculate average HR from HealthKit samples
func calculateAverageHR(
    startDate: Date,
    endDate: Date
) async throws -> (avgHR: Double, maxHR: Double, sampleCount: Int)?
```

**Modified: iOS CyclingViewModel or new VO2MaxViewModel**
- After loading activities, check HR completeness
- For rides with low HR completeness (< 80%), attempt HealthKit HR query
- Display "HR from Apple Watch" badge when using HealthKit data
- Send enriched HR data to backend for EF recalculation

**New endpoint: `PUT /cycling/activities/:id/enrich-hr`**
- Accepts `{ avgHeartRate, maxHeartRate, hrSource: 'healthkit' }`
- Updates activity with HealthKit-sourced HR data
- Recalculates EF

#### Success Criteria
- Activities with < 80% HR completeness trigger HealthKit query on iOS
- HealthKit HR data successfully fills gaps for Peloton rides
- UI shows HR source indicator (Strava vs HealthKit)
- EF recalculated with enriched HR data
- HealthKit authorization updated to include `.heartRate` type

---

### Phase 4: iOS Display

**Goal**: Show VO2 max estimate, EF trends, and HR quality in the Cycling section.

#### Changes Required

**New file: `ios/BradOS/BradOS/Views/Cycling/VO2MaxCard.swift`**
- Display current VO2 max estimate with fitness category label
- Categories: Poor (<35), Fair (35-45), Good (45-55), Excellent (55-65), Elite (65+)
- Small trend sparkline showing last 6 estimates
- Tap to see full history
- "Estimated from cycling power data" disclaimer
- Method badge: "FTP-derived" or "5-min peak"

**New file: `ios/BradOS/BradOS/Views/Cycling/EfficiencyFactorChart.swift`**
- Line chart showing EF trend over last 8 weeks
- Only includes steady rides (IF < 0.88, i.e., fun/recovery type)
- Rising line = improving aerobic fitness
- Current EF value with "watts/bpm" unit label

**Modified: `ios/BradOS/BradOS/Views/Cycling/CyclingBlockView.swift`**
- Add VO2MaxCard below training load section
- Add EF trend chart below TSS history

**Modified: `ios/BradOS/BradOS/Views/Cycling/CyclingHistoryView.swift` (RideCard)**
- Add HR completeness indicator (green checkmark if > 80%, yellow warning if < 80%)
- Show EF value if available
- Show peak 5-min power if available

**Modified: `ios/BradOS/BradOS/ViewModels/CyclingViewModel.swift`**
- Add `vo2maxEstimate: VO2MaxEstimateModel?`
- Add `vo2maxHistory: [VO2MaxEstimateModel]`
- Add `efHistory: [EFDataPoint]` for chart
- New fetch: `GET /cycling/vo2max`

**New: HR Quality Tip Banner**
- When rides consistently have < 80% HR completeness, show a tip:
  "Improve HR accuracy: Enable Theater Mode on Apple Watch before Peloton rides, or use HeartCast app for Bluetooth HR broadcast."
- Dismissible, shown once per week max

**Modified: `ios/BradOS/BradOS/Models/CyclingModels.swift`**
- Add `VO2MaxEstimateModel` struct
- Add `EFDataPoint` struct for charts
- Add `peak5MinPower: Int?` and `ef: Double?` and `hrCompleteness: Int?` to `CyclingActivityModel`

#### Success Criteria
- VO2 max card displays with correct value and fitness category
- EF chart shows trend over time for steady rides
- HR quality indicator visible on rides with sparse data
- Tip banner appears for users with consistent HR issues
- All new views follow Aurora Glass design system

---

### Phase 5: Weight Sync & User Profile

**Goal**: Ensure body weight flows from HealthKit to the backend for VO2 max calculation.

#### Changes Required

**Modified: `ios/BradOS/BradOS/Services/HealthKitManager.swift`**
- `fetchLatestWeight()` already returns lbs - add kg conversion
- Send weight to backend on app launch or weight change

**Modified: `packages/functions/src/handlers/cycling.ts`**
- New endpoint: `PUT /cycling/profile` accepting `{ weightKg, maxHR?, restingHR? }`
- Store in Firestore: `/users/{userId}/settings/cyclingProfile`

**Auto-recalculation trigger**:
- When weight changes > 1kg, recalculate VO2 max from latest peak power
- When new FTP is set, recalculate VO2 max
- When new peak 5-min power detected, recalculate VO2 max

#### Success Criteria
- Weight syncs from HealthKit to backend
- VO2 max auto-recalculates on weight or power changes
- User can manually set max HR and resting HR in cycling profile

---

## Testing Strategy

### Unit Tests
- `vo2max.service.test.ts`: ACSM formula with known values, edge cases (0 weight, 0 power)
- `efficiency-factor.service.test.ts`: EF calculation, null when no HR
- `strava.service.test.ts`: Peak power rolling window calculation, HR completeness detection
- `training-load.service.test.ts`: Verify existing tests still pass

### Integration Tests
- VO2 max endpoint returns correct format
- Activity enrichment endpoint updates HR and recalculates EF
- Streams fetch + peak power calculation end-to-end

### Manual Testing
- Verify VO2 max card displays in Cycling section
- Verify EF chart populates with steady ride data
- Verify HR completeness indicator shows on rides
- Test HealthKit HR fallback on simulator (mock data)
- Verify auto-recalculation triggers work

---

## Phasing & Dependencies

```
Phase 1 (Backend VO2 Max Service) ← No dependencies, can start immediately
  ↓
Phase 2 (Strava Streams) ← Depends on Phase 1 for peak power → VO2 max flow
  ↓
Phase 3 (HealthKit HR Fallback) ← Independent of Phase 2, but benefits from HR completeness detection
  ↓
Phase 4 (iOS Display) ← Depends on Phases 1-2 for backend data, Phase 3 for HR quality
  ↓
Phase 5 (Weight Sync) ← Can run parallel with Phase 4
```

Phases 1 and 3 can be developed in parallel. Phase 4 depends on backend being ready.

## References

- ACSM Power Formula: `VO2max = [(10.8 × watts) / weight_kg] + 7`
- Garmin/Firstbeat: `VO2 = (12.35 × power + 300) / weight_kg`
- Strava Streams API: `GET /activities/{id}/streams` ([docs](https://developers.strava.com/docs/reference/))
- Apple Watch HR gap: [Apple Community discussion](https://discussions.apple.com/thread/251458331) - Theater Mode reduces loss from 20-30% to 1-3%
- Efficiency Factor: TrainingPeaks `EF = NP / avg_HR` ([guide](https://cyklopedia.cc/cycling-tips/efficiency-factor/))
- FTP/VO2 relationship: FTP ~75-85% of VO2 max power ([TrainerRoad](https://www.trainerroad.com/blog/the-relationship-between-ftp-and-vo2-max-understanding-it-can-make-you-faster/))
