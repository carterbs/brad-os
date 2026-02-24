# AI Cycling Coach Implementation Plan

## Overview

Build an **AI-powered cycling coach** that uses HealthKit recovery data (HRV, sleep, weight), Strava workout data (power, TSS), and OpenAI to provide personalized Peloton training recommendations. Includes Apple Watch workout session mirroring for lifting workouts.

**Goal:** 8-week training blocks to regain cardio fitness via Peloton, maintain muscle with lifting, and lose weight.

## Current State

- **iOS App:** SwiftUI with Aurora Glass design, existing lifting/stretching/meditation tracking
- **Backend:** Express API + SQLite (local), Firebase Cloud Functions for AI features
- **OpenAI Integration:** Existing pattern in meal planner (`packages/functions/src/services/meal-plan-*.ts`)
- **No HealthKit:** App doesn't read any health data currently
- **No Strava:** No external workout data sources
- **No WatchOS App:** No Apple Watch companion app

## Desired End State

1. **Recovery Readiness Card** on Today dashboard showing HRV, sleep quality, and recovery score
2. **Apple Watch integration** that auto-starts strength training workouts when iOS workout begins
3. **Strava sync** that imports Peloton rides with power data and calculates TSS
4. **Dedicated Cycling section** in Activities with coach recommendations, training block status, and ride history
5. **AI Cycling Coach** that prescribes power zone targets based on recovery, training load, and periodization

## What We're NOT Doing

- No direct Peloton API integration (Strava export is sufficient)
- No class catalog or class search (targeted zones, not specific classes)
- No Apple Watch standalone app (mirrored sessions controlled from iPhone)
- No HealthKit write (read-only for recovery data)
- No changes to existing lifting/stretching/meditation features

## Key Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Cycling workout source** | Strava API | Peloton exports power data to Strava |
| **TSS calculation** | From Strava `weighted_average_watts` | Close enough to NP for our needs |
| **Token storage** | iOS Keychain + Firestore | Keychain for app queries, Firestore for webhook |
| **Watch workout control** | HKWorkoutSession mirroring | Apple's recommended pattern for iOS 17+ |
| **AI model** | gpt-4o via Cloud Function | Consistent with meal planner |
| **Data storage** | Firestore | Survives device changes |

---

## Dependency Graph

```
Phase 0: Backend Data Models (SERIAL - foundation)
    │
    ├── Phase 1A: HealthKit Foundation (iOS)
    │       ├── HealthKit capability + entitlements
    │       ├── HealthKitManager service
    │       ├── Recovery score calculation
    │       └── Readiness Card on Today dashboard
    │
    ├── Phase 1B: Backend Cycling Infrastructure (PARALLEL with 1A)
    │       ├── Firestore collections schema
    │       ├── Cycling activity endpoints
    │       ├── Training load calculation service
    │       └── FTP/block management endpoints
    │
    └── Phase 1C: Strava OAuth Prep (PARALLEL with 1A, 1B)
            ├── Register Strava API app
            ├── iOS OAuth flow (ASWebAuthenticationSession)
            └── Keychain token storage
    │
    Phase 2A: Strava Integration (depends on 1B, 1C)
    │       ├── Strava client service
    │       ├── Activity fetch + TSS calculation
    │       ├── Webhook cloud function
    │       └── Token refresh handling
    │
    Phase 2B: Apple Watch Integration (depends on 1A)
    │       ├── WatchOS app target
    │       ├── HKWorkoutSession mirroring
    │       ├── Workout data sync to iOS
    │       └── Backend workout update endpoint
    │
    Phase 3: Cycling UI (depends on 1B, 2A partially)
    │       ├── CyclingTabView (Today, Block, History)
    │       ├── Ride history list
    │       ├── Training block status card
    │       └── Coach placeholder
    │
    Phase 4: AI Cycling Coach (depends on 1A, 1B, 2A, 3)
    │       ├── cycling-coach cloud function
    │       ├── System prompt with training philosophy
    │       ├── Request builder (recovery + TSS + schedule)
    │       └── Recommendation card UI
    │
    Phase 5: Goals & Onboarding (depends on 1B, 3)
    │       ├── FTP entry in Profile
    │       ├── Weight goal setup
    │       ├── Training block configuration
    │       └── Strava connection flow
    │
    Phase 6: Polish (SERIAL - final)
            ├── FTP test prompting
            ├── Block transitions
            ├── Charts (TSS/CTL/ATL)
            └── Onboarding flow
```

---

## Phase 0: Backend Data Models (SERIAL)

**Goal:** Define TypeScript types and Zod schemas for all cycling-related data.

### Files to Create

```
packages/functions/src/types/cycling.types.ts
packages/functions/src/schemas/cycling.schema.ts
```

### Types to Define

```typescript
// cycling.types.ts

export interface CyclingActivity {
  id: string;
  stravaId: number;
  userId: string;
  date: string;                    // ISO date
  durationMinutes: number;
  avgPower: number;
  normalizedPower: number;         // weighted_average_watts from Strava
  maxPower: number;
  avgHeartRate: number;
  maxHeartRate: number;
  tss: number;                     // Calculated
  intensityFactor: number;         // NP / FTP
  type: 'vo2max' | 'threshold' | 'fun' | 'recovery' | 'unknown';
  source: 'strava';
  createdAt: string;
}

export interface TrainingBlock {
  id: string;
  userId: string;
  startDate: string;
  endDate: string;                 // 8 weeks from start
  currentWeek: number;             // 1-8
  goals: ('regain_fitness' | 'maintain_muscle' | 'lose_weight')[];
  status: 'active' | 'completed';
}

export interface FTPEntry {
  id: string;
  userId: string;
  value: number;                   // watts
  date: string;
  source: 'manual' | 'test';
}

export interface WeightGoal {
  userId: string;
  targetWeightLbs: number;
  targetDate: string;
  startWeightLbs: number;
  startDate: string;
}

export interface RecoverySnapshot {
  date: string;
  hrvMs: number;
  hrvVsBaseline: number;           // % difference
  rhrBpm: number;
  rhrVsBaseline: number;           // BPM difference
  sleepHours: number;
  sleepEfficiency: number;         // 0-100
  deepSleepPercent: number;        // 0-100
  score: number;                   // 0-100
  state: 'ready' | 'moderate' | 'recover';
}

export interface CyclingCoachRequest {
  recovery: RecoverySnapshot;
  trainingLoad: {
    recentCyclingWorkouts: CyclingActivity[];
    atl: number;
    ctl: number;
    tsb: number;
  };
  recentLiftingWorkouts: LiftingWorkoutSummary[];
  athlete: {
    ftp: number;
    ftpLastTestedDate: string;
    goals: string[];
    weekInBlock: number;
    blockStartDate: string;
  };
  weight: {
    currentLbs: number;
    trend7DayLbs: number;
    trend30DayLbs: number;
    goal?: WeightGoal;
  };
  schedule: {
    dayOfWeek: string;
    sessionType: 'vo2max' | 'threshold' | 'fun';
    liftingSchedule: {
      today: { planned: boolean; workoutName?: string };
      tomorrow: { planned: boolean; workoutName?: string };
      yesterday: { completed: boolean; workoutName?: string };
    };
  };
}

export interface CyclingCoachResponse {
  session: {
    type: 'vo2max' | 'threshold' | 'fun' | 'recovery' | 'off';
    durationMinutes: number;
    intervals?: {
      protocol: string;
      count: number;
      workSeconds: number;
      restSeconds: number;
      targetPowerPercent: { min: number; max: number };
    };
    targetTSS: { min: number; max: number };
    targetZones: string;
  };
  reasoning: string;
  coachingTips?: string[];
  warnings?: { type: string; message: string }[];
  suggestFTPTest?: boolean;
}

export interface StravaTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;               // Unix timestamp
  athleteId: number;
}

export interface LiftingWorkoutSummary {
  date: string;
  durationMinutes: number;
  avgHeartRate: number;
  maxHeartRate: number;
  activeCalories: number;
  workoutDayName: string;
  setsCompleted: number;
  totalVolume: number;
}
```

### Schemas to Define

```typescript
// cycling.schema.ts

export const createFTPEntrySchema = z.object({
  value: z.number().positive().max(500),
  date: z.string().datetime(),
  source: z.enum(['manual', 'test']).default('manual'),
});

export const createTrainingBlockSchema = z.object({
  startDate: z.string().datetime(),
  goals: z.array(z.enum(['regain_fitness', 'maintain_muscle', 'lose_weight'])),
});

export const createWeightGoalSchema = z.object({
  targetWeightLbs: z.number().positive(),
  targetDate: z.string().datetime(),
  startWeightLbs: z.number().positive(),
  startDate: z.string().datetime(),
});

export const stravaCallbackSchema = z.object({
  code: z.string(),
  scope: z.string(),
});

export const stravaWebhookSchema = z.object({
  object_type: z.enum(['activity', 'athlete']),
  object_id: z.number(),
  aspect_type: z.enum(['create', 'update', 'delete']),
  owner_id: z.number(),
  subscription_id: z.number(),
  event_time: z.number(),
});
```

**Success Criteria:**
- [ ] All types compile with no errors
- [ ] Schemas validate correctly
- [ ] Types exported from `shared.ts`

---

## Phase 1A: HealthKit Foundation (iOS)

**Goal:** Read HRV, sleep, weight, and RHR from HealthKit. Calculate recovery score locally.

**Depends on:** None (can start immediately)

### Files to Create/Modify

```
ios/BradOS/BradOS/BradOS.entitlements           # Add HealthKit
ios/BradOS/BradOS/Info.plist                    # Add usage descriptions
ios/BradOS/BradOS/Services/HealthKitManager.swift
ios/BradOS/BradOS/Models/RecoveryData.swift
ios/BradOS/BradOS/Views/Today/ReadinessCard.swift
ios/BradOS/BradOS/Views/Today/TodayDashboardView.swift  # Add ReadinessCard
```

### Implementation Details

#### 1. Xcode Project Configuration

**BradOS.entitlements:**
```xml
<key>com.apple.developer.healthkit</key>
<true/>
<key>com.apple.developer.healthkit.access</key>
<array/>
```

**Info.plist:**
```xml
<key>NSHealthShareUsageDescription</key>
<string>We use your HRV, sleep, and weight data to track recovery and provide personalized cycling training recommendations.</string>
```

#### 2. HealthKitManager Service

```swift
// Services/HealthKitManager.swift

import HealthKit

@MainActor
class HealthKitManager: ObservableObject {
    private let healthStore = HKHealthStore()

    @Published var isAuthorized = false
    @Published var latestRecovery: RecoveryData?

    private let readTypes: Set<HKObjectType> = [
        HKQuantityType(.heartRateVariabilitySDNN),
        HKQuantityType(.bodyMass),
        HKQuantityType(.restingHeartRate),
        HKCategoryType(.sleepAnalysis)
    ]

    func requestAuthorization() async throws {
        guard HKHealthStore.isHealthDataAvailable() else {
            throw HealthKitError.notAvailable
        }
        try await healthStore.requestAuthorization(toShare: [], read: readTypes)
        isAuthorized = true
    }

    func fetchLatestHRV() async throws -> Double?
    func fetchTodayRHR() async throws -> Double?
    func fetchLatestWeight() async throws -> Double?
    func fetchSleepData(for date: Date) async throws -> SleepMetrics
    func fetchHRVHistory(days: Int) async throws -> [HRVReading]
    func fetchRHRHistory(days: Int) async throws -> [RHRReading]
    func calculateRecoveryScore() async throws -> RecoveryData
}
```

#### 3. RecoveryData Model

```swift
// Models/RecoveryData.swift

struct RecoveryData: Codable {
    let date: Date
    let hrvMs: Double
    let hrvVsBaseline: Double      // % difference from 60-day median
    let rhrBpm: Double
    let rhrVsBaseline: Double      // BPM difference from baseline
    let sleepHours: Double
    let sleepEfficiency: Double    // 0-100
    let deepSleepPercent: Double   // 0-100
    let score: Int                 // 0-100
    let state: RecoveryState
}

enum RecoveryState: String, Codable {
    case ready     // Green - train as planned
    case moderate  // Yellow - reduce intensity
    case recover   // Red - rest or easy only
}

struct SleepMetrics {
    var inBed: TimeInterval = 0
    var totalSleep: TimeInterval = 0
    var core: TimeInterval = 0
    var deep: TimeInterval = 0
    var rem: TimeInterval = 0
    var awake: TimeInterval = 0
    var efficiency: Double = 0     // totalSleep / inBed * 100
    var deepPercent: Double { deep / totalSleep * 100 }
}
```

#### 4. ReadinessCard View

```swift
// Views/Today/ReadinessCard.swift

struct ReadinessCard: View {
    @EnvironmentObject var healthKit: HealthKitManager

    var body: some View {
        // Glass L1 card showing:
        // - Recovery score (large number with state color)
        // - State badge (Ready/Moderate/Recover)
        // - HRV vs baseline (with trend arrow)
        // - Sleep quality (hours + efficiency)
        // - RHR vs baseline
    }
}
```

**Success Criteria:**
- [ ] HealthKit authorization request works
- [ ] HRV, sleep, weight, RHR queries return data
- [ ] Recovery score calculation matches algorithm in research doc
- [ ] ReadinessCard displays on Today dashboard
- [ ] 60-day baseline calculation works

---

## Phase 1B: Backend Cycling Infrastructure (PARALLEL with 1A)

**Goal:** Create Firestore collections and API endpoints for cycling data.

**Depends on:** Phase 0

### Files to Create

```
packages/functions/src/handlers/cycling.ts
packages/functions/src/routes/cycling.routes.ts
packages/functions/src/services/training-load.service.ts
packages/functions/src/services/firestore-cycling.service.ts
```

### Firestore Collections

```
/users/{userId}/cyclingActivities/{activityId}
/users/{userId}/trainingBlocks/{blockId}
/users/{userId}/ftpHistory/{entryId}
/users/{userId}/stravaTokens                    # Single doc
/users/{userId}/weightGoal                      # Single doc
```

### API Endpoints

```
GET    /api/cycling/activities          # List recent activities
POST   /api/cycling/activities          # Create activity (from Strava sync)
GET    /api/cycling/training-load       # Get ATL/CTL/TSB

GET    /api/cycling/ftp                 # Get current FTP
POST   /api/cycling/ftp                 # Create FTP entry
GET    /api/cycling/ftp/history         # Get FTP history

GET    /api/cycling/block               # Get current training block
POST   /api/cycling/block               # Create training block
PUT    /api/cycling/block/:id/complete  # Complete block

GET    /api/cycling/weight-goal         # Get weight goal
POST   /api/cycling/weight-goal         # Create/update weight goal
```

### Training Load Service

```typescript
// services/training-load.service.ts

export function calculateTSS(
  durationSeconds: number,
  normalizedPower: number,
  ftp: number
): number {
  const intensityFactor = normalizedPower / ftp;
  return (durationSeconds * normalizedPower * intensityFactor) / (ftp * 3600) * 100;
}

export function calculateATL(dailyTSS: { date: string; tss: number }[]): number {
  // 7-day exponential moving average
}

export function calculateCTL(dailyTSS: { date: string; tss: number }[]): number {
  // 42-day exponential moving average
}

export function calculateTSB(ctl: number, atl: number): number {
  return ctl - atl;
}

export function getWeekInBlock(blockStartDate: string): number {
  // Calculate current week (1-8) based on start date
}
```

**Success Criteria:**
- [ ] All endpoints return correct data
- [ ] TSS calculation matches formula in research doc
- [ ] ATL/CTL/TSB calculations correct
- [ ] Firestore read/write works

---

## Phase 1C: Strava OAuth Prep (PARALLEL with 1A, 1B)

**Goal:** Implement Strava OAuth flow in iOS app.

**Depends on:** None (can register Strava app immediately)

### External Setup

1. Register app at https://www.strava.com/settings/api
2. Set callback URL: `bradosapp://strava-callback`
3. Request scopes: `activity:read`
4. Save Client ID and Client Secret

### Files to Create/Modify

```
ios/BradOS/BradOS/Services/StravaAuthManager.swift
ios/BradOS/BradOS/Services/KeychainService.swift
ios/BradOS/BradOS/Info.plist                    # Add URL scheme
ios/BradOS/BradOS/App/BradOSApp.swift           # Handle callback
```

### Implementation Details

#### 1. URL Scheme

**Info.plist:**
```xml
<key>CFBundleURLTypes</key>
<array>
    <dict>
        <key>CFBundleURLSchemes</key>
        <array>
            <string>bradosapp</string>
        </array>
        <key>CFBundleURLName</key>
        <string>com.bradcarter.brad-os</string>
    </dict>
</array>
```

#### 2. StravaAuthManager

```swift
// Services/StravaAuthManager.swift

import AuthenticationServices

@MainActor
class StravaAuthManager: ObservableObject {
    @Published var isConnected = false
    @Published var athleteId: Int?

    private let clientId = "YOUR_CLIENT_ID"  // From secrets
    private let redirectUri = "bradosapp://strava-callback"

    func startOAuthFlow() async throws {
        let url = buildAuthURL()
        let session = ASWebAuthenticationSession(
            url: url,
            callbackURLScheme: "bradosapp"
        ) { callbackURL, error in
            // Handle callback
        }
        session.prefersEphemeralWebBrowserSession = true
        session.start()
    }

    func exchangeCodeForTokens(code: String) async throws -> StravaTokens
    func refreshTokensIfNeeded() async throws -> StravaTokens
    func disconnect() async throws

    private func buildAuthURL() -> URL
}
```

#### 3. KeychainService

```swift
// Services/KeychainService.swift

class KeychainService {
    static func save(key: String, data: Data) throws
    static func load(key: String) throws -> Data?
    static func delete(key: String) throws

    // Convenience methods for Strava
    static func saveStravaTokens(_ tokens: StravaTokens) throws
    static func loadStravaTokens() throws -> StravaTokens?
}
```

**Success Criteria:**
- [ ] OAuth flow opens Strava authorization page
- [ ] Callback URL returns authorization code
- [ ] Token exchange returns access + refresh tokens
- [ ] Tokens stored securely in Keychain
- [ ] Token refresh works before expiry

---

## Phase 2A: Strava Integration (depends on 1B, 1C)

**Goal:** Fetch Strava activities, calculate TSS, sync to backend.

**Depends on:** Phase 1B (backend endpoints), Phase 1C (OAuth)

### Files to Create

```
ios/BradOS/BradOS/Services/StravaClient.swift
packages/functions/src/handlers/strava-webhook.ts
packages/functions/src/routes/strava.routes.ts
packages/functions/src/services/strava.service.ts
```

### iOS Strava Client

```swift
// Services/StravaClient.swift

class StravaClient {
    func fetchRecentActivities(page: Int = 1, perPage: Int = 30) async throws -> [StravaActivity]
    func fetchActivity(id: Int) async throws -> StravaActivity
    func fetchActivityStreams(id: Int) async throws -> StravaStreams

    func syncActivitiesToBackend() async throws
}

struct StravaActivity: Codable {
    let id: Int
    let type: String
    let movingTime: Int
    let elapsedTime: Int
    let averageHeartrate: Double?
    let maxHeartrate: Double?
    let averageWatts: Double?
    let weightedAverageWatts: Double?
    let maxWatts: Int?
    let deviceWatts: Bool?
    let kilojoules: Double?
    let startDate: String
}
```

### Strava Webhook Cloud Function

```typescript
// handlers/strava-webhook.ts

// GET /strava/webhook - Verification challenge
export const handleStravaWebhookVerification = ...

// POST /strava/webhook - Activity events
export const handleStravaWebhookEvent = async (req, res) => {
    const event = stravaWebhookSchema.parse(req.body);

    if (event.object_type === 'activity' && event.aspect_type === 'create') {
        // Queue activity fetch
        // Fetch from Strava API
        // Calculate TSS
        // Store in Firestore
    }
};
```

### Backend Strava Service

```typescript
// services/strava.service.ts

export async function fetchStravaActivity(
    accessToken: string,
    activityId: number
): Promise<StravaActivity>

export async function refreshStravaTokens(
    refreshToken: string
): Promise<StravaTokens>

export async function processNewActivity(
    userId: string,
    stravaActivity: StravaActivity,
    ftp: number
): Promise<CyclingActivity>
```

**Success Criteria:**
- [ ] Fetch recent Strava activities
- [ ] Filter to VirtualRide (Peloton) activities
- [ ] Calculate TSS from weighted_average_watts
- [ ] Store activities in Firestore
- [ ] Webhook receives activity.create events
- [ ] Webhook fetches and stores new activities

---

## Phase 2B: Apple Watch Integration (depends on 1A)

**Goal:** Auto-start Apple Watch workout when iOS lifting workout starts.

**Depends on:** Phase 1A (HealthKit foundation)

### Files to Create

```
ios/BradOS/BradOSWatch/                         # New WatchOS target
ios/BradOS/BradOSWatch/BradOSWatchApp.swift
ios/BradOS/BradOSWatch/WorkoutManager.swift
ios/BradOS/BradOSWatch/Info.plist
ios/BradOS/BradOSWatch/BradOSWatch.entitlements

ios/BradOS/BradOS/Services/WatchWorkoutController.swift
```

### Xcode Project Setup

1. Add WatchOS target: `BradOSWatch`
2. Add HealthKit capability to Watch target
3. Add Background Modes: `workout-processing`
4. Link to iOS app

### iOS Watch Controller

```swift
// Services/WatchWorkoutController.swift

import HealthKit

@MainActor
class WatchWorkoutController: ObservableObject {
    private let healthStore = HKHealthStore()
    private var session: HKWorkoutSession?

    @Published var isWorkoutActive = false
    @Published var workoutSummary: WorkoutSummary?

    func startMirroredWorkout() async throws {
        let config = HKWorkoutConfiguration()
        config.activityType = .traditionalStrengthTraining
        config.locationType = .indoor

        session = try HKWorkoutSession(healthStore: healthStore, configuration: config)
        try await session?.startMirroringToCompanionDevice()

        // Send start command
        let command = WorkoutCommand.start
        session?.sendToRemoteWorkoutSession(data: try JSONEncoder().encode(command))

        isWorkoutActive = true
    }

    func endWorkout() async throws {
        let command = WorkoutCommand.end
        session?.sendToRemoteWorkoutSession(data: try JSONEncoder().encode(command))
    }
}

struct WorkoutSummary: Codable {
    let avgHeartRate: Double
    let maxHeartRate: Double
    let activeCalories: Double
    let totalDuration: TimeInterval
}

enum WorkoutCommand: Codable {
    case start
    case end
}
```

### WatchOS App

```swift
// BradOSWatch/BradOSWatchApp.swift

import SwiftUI
import HealthKit

@main
struct BradOSWatchApp: App {
    @WKApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        WindowGroup {
            WorkoutView()
        }
    }
}

class AppDelegate: NSObject, WKApplicationDelegate {
    func handle(_ workoutConfiguration: HKWorkoutConfiguration) {
        Task {
            try await WorkoutManager.shared.startWorkout(with: workoutConfiguration)
        }
    }
}

// BradOSWatch/WorkoutManager.swift

class WorkoutManager: NSObject, ObservableObject {
    static let shared = WorkoutManager()

    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?

    @Published var heartRate: Double = 0
    @Published var activeCalories: Double = 0
    @Published var elapsedTime: TimeInterval = 0

    func startWorkout(with configuration: HKWorkoutConfiguration) async throws {
        let healthStore = HKHealthStore()
        session = try HKWorkoutSession(healthStore: healthStore, configuration: configuration)
        builder = session?.associatedWorkoutBuilder()

        session?.delegate = self
        builder?.delegate = self
        builder?.dataSource = HKLiveWorkoutDataSource(healthStore: healthStore, workoutConfiguration: configuration)

        session?.startActivity(with: Date())
        try await builder?.beginCollection(at: Date())
    }

    func endWorkout() async throws {
        session?.stopActivity(with: Date.now)
        // Wait for .stopped state, then:
        try await builder?.endCollection(at: Date())
        let workout = try await builder?.finishWorkout()
        session?.end()

        // Send summary back to iOS
        let summary = WorkoutSummary(...)
        session?.sendToRemoteWorkoutSession(data: try JSONEncoder().encode(summary))
    }
}

extension WorkoutManager: HKWorkoutSessionDelegate {
    func workoutSession(_ workoutSession: HKWorkoutSession, didChangeTo toState: HKWorkoutSessionState, from fromState: HKWorkoutSessionState, date: Date) {
        // Handle state changes
    }

    func workoutSession(_ workoutSession: HKWorkoutSession, didReceiveDataFromRemoteWorkoutSession data: [Data]) {
        // Handle commands from iOS
    }
}

extension WorkoutManager: HKLiveWorkoutBuilderDelegate {
    func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>) {
        // Update published metrics
    }
}
```

### Backend Workout Update

Add `watchData` field to existing workout endpoint:

```typescript
// Update PUT /api/workouts/:id/complete

interface WatchData {
    avgHeartRate: number;
    maxHeartRate: number;
    activeCalories: number;
    totalDuration: number;
}

// Add to workout completion payload
```

**Success Criteria:**
- [ ] WatchOS app builds and installs
- [ ] Tapping "Start Workout" on iOS starts Watch workout
- [ ] Watch shows heart rate during workout
- [ ] Ending iOS workout ends Watch workout
- [ ] Workout summary syncs back to iOS
- [ ] Watch data stored with workout in backend

---

## Phase 3: Cycling UI (depends on 1B, 2A partially)

**Goal:** Create the Cycling section in Activities with coach, block, and history views.

**Depends on:** Phase 1B (backend), Phase 2A (Strava data - can stub initially)

### Files to Create

```
ios/BradOS/BradOS/Views/Cycling/CyclingTabView.swift
ios/BradOS/BradOS/Views/Cycling/CyclingTodayView.swift
ios/BradOS/BradOS/Views/Cycling/CyclingBlockView.swift
ios/BradOS/BradOS/Views/Cycling/CyclingHistoryView.swift
ios/BradOS/BradOS/Views/Cycling/RideDetailView.swift
ios/BradOS/BradOS/ViewModels/CyclingViewModel.swift
ios/BradOS/BradOS/Models/CyclingModels.swift
```

### Navigation Structure

```
ActivitiesView
├── Lifting → LiftingTabView
└── Cycling → CyclingTabView (NEW)
    ├── Today → CyclingTodayView (coach recommendation)
    ├── Block → CyclingBlockView (8-week status)
    └── History → CyclingHistoryView (ride list)
```

### View Implementations

#### CyclingTabView

```swift
struct CyclingTabView: View {
    @State private var selectedTab = 0

    var body: some View {
        // Tab picker (Today, Block, History)
        // Content based on selection
    }
}
```

#### CyclingTodayView

```swift
struct CyclingTodayView: View {
    @EnvironmentObject var cyclingVM: CyclingViewModel

    var body: some View {
        ScrollView {
            // Recovery summary (from ReadinessCard data)
            // Coach recommendation card (placeholder initially)
            // Training load summary (ATL/CTL/TSB)
        }
    }
}
```

#### CyclingBlockView

```swift
struct CyclingBlockView: View {
    var body: some View {
        ScrollView {
            // Week indicator ("Week 3 of 8 - Build Phase")
            // Phase description
            // TSS chart (last 8 weeks) - placeholder
            // FTP history
        }
    }
}
```

#### CyclingHistoryView

```swift
struct CyclingHistoryView: View {
    @EnvironmentObject var cyclingVM: CyclingViewModel

    var body: some View {
        List {
            // Recent rides from Strava
            // Each row: date, duration, avg power, TSS
            // Tap for detail
        }
    }
}
```

### ActivitiesView Update

Add Cycling card alongside Lifting:

```swift
// Update Views/Activities/ActivitiesView.swift

LazyVGrid(columns: columns) {
    ActivityCard(title: "Lifting", icon: "dumbbell.fill", color: Theme.lifting)
    ActivityCard(title: "Cycling", icon: "bicycle", color: Theme.stretch)  // NEW
    // ... other activities
}
```

**Success Criteria:**
- [ ] Cycling appears in Activities grid
- [ ] CyclingTabView shows 3 tabs
- [ ] Today view shows recovery + placeholder coach card
- [ ] Block view shows week indicator
- [ ] History view lists Strava rides
- [ ] All views follow Aurora Glass design

---

## Phase 4: AI Cycling Coach (depends on 1A, 1B, 2A, 3)

**Goal:** Implement the AI coach cloud function and integrate with iOS.

**Depends on:** All prior phases (needs all data sources)

### Files to Create

```
packages/functions/src/handlers/cycling-coach.ts
packages/functions/src/routes/cycling-coach.routes.ts
packages/functions/src/services/cycling-coach.service.ts
packages/functions/src/prompts/cycling-coach-system.md

ios/BradOS/BradOS/Views/Cycling/CoachRecommendationCard.swift
ios/BradOS/BradOS/Services/CyclingCoachClient.swift
```

### Cloud Function

```typescript
// handlers/cycling-coach.ts

export const getCyclingRecommendation = async (req, res) => {
    const { userId } = req.params;

    // 1. Fetch all required data
    const recoveryData = req.body.recovery;  // Sent from iOS
    const activities = await getCyclingActivities(userId, 12);
    const liftingWorkouts = await getLiftingWorkouts(userId, 12);
    const ftp = await getCurrentFTP(userId);
    const block = await getCurrentBlock(userId);
    const weightGoal = await getWeightGoal(userId);
    const schedule = await getMesocycleSchedule(userId);

    // 2. Build request
    const coachRequest = buildCoachRequest(...);

    // 3. Call OpenAI
    const recommendation = await getCyclingRecommendation(
        coachRequest,
        trainingPhilosophyCorpus,
        process.env.OPENAI_API_KEY
    );

    res.json(recommendation);
};
```

### Cycling Coach Service

```typescript
// services/cycling-coach.service.ts

import OpenAI from 'openai';

const OPENAI_MODEL = 'gpt-4o';

export async function getCyclingRecommendation(
    request: CyclingCoachRequest,
    scienceCorpus: string,
    apiKey: string
): Promise<CyclingCoachResponse> {
    const client = new OpenAI({ apiKey });

    const systemPrompt = buildSystemPrompt(scienceCorpus);

    const response = await client.chat.completions.create({
        model: OPENAI_MODEL,
        response_format: { type: 'json_object' },
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: JSON.stringify(request) }
        ],
    });

    return JSON.parse(response.choices[0]?.message?.content ?? '{}');
}

function buildSystemPrompt(scienceCorpus: string): string {
    return `You are an AI cycling coach implementing the evidence-based training framework below.

## Training Philosophy
${scienceCorpus}

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

## Power Zones (% of FTP)
- Z1 Active Recovery: <55%
- Z2 Endurance: 56-75%
- Z3 Tempo: 76-90%
- Z4 Lactate Threshold: 91-105%
- Z5 VO2max: 106-120%
- Z6 Anaerobic: 121-150%

Respond with a valid JSON object matching CyclingCoachResponse schema.`;
}
```

### Training Philosophy Corpus

Copy content from `thoughts/shared/research/Cycing-Training-philosophy.md` into the cloud function or load dynamically.

### iOS Coach Card

```swift
// Views/Cycling/CoachRecommendationCard.swift

struct CoachRecommendationCard: View {
    let recommendation: CyclingCoachResponse

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.space4) {
            // Header with session type badge
            HStack {
                Text("Today's Ride")
                    .font(.title3)
                    .fontWeight(.semibold)
                Spacer()
                SessionTypeBadge(type: recommendation.session.type)
            }

            // Target zones and TSS
            HStack {
                StatItem(label: "Target Zone", value: recommendation.session.targetZones)
                Spacer()
                StatItem(label: "Target TSS", value: "\(recommendation.session.targetTSS.min)-\(recommendation.session.targetTSS.max)")
            }

            // Intervals (if structured session)
            if let intervals = recommendation.session.intervals {
                IntervalCard(intervals: intervals)
            }

            // Reasoning
            Text(recommendation.reasoning)
                .font(.callout)
                .foregroundStyle(Theme.textSecondary)

            // Coaching tips
            if let tips = recommendation.coachingTips {
                ForEach(tips, id: \.self) { tip in
                    HStack(alignment: .top) {
                        Image(systemName: "lightbulb.fill")
                            .foregroundStyle(Theme.warning)
                        Text(tip)
                            .font(.footnote)
                    }
                }
            }

            // Warnings
            if let warnings = recommendation.warnings {
                ForEach(warnings, id: \.type) { warning in
                    WarningBanner(warning: warning)
                }
            }
        }
        .glassCard()
    }
}
```

**Success Criteria:**
- [ ] Cloud function returns valid CyclingCoachResponse
- [ ] System prompt includes training philosophy
- [ ] Response includes appropriate session prescription
- [ ] Fun days return "enjoy your ride" with no intervals
- [ ] iOS displays recommendation card correctly
- [ ] Warnings appear when FTP is stale or overreaching detected

---

## Phase 5: Goals & Onboarding (depends on 1B, 3)

**Goal:** Add settings for FTP, weight goal, training block, and Strava connection.

**Depends on:** Phase 1B (backend), Phase 3 (UI framework)

### Files to Create/Modify

```
ios/BradOS/BradOS/Views/Profile/FTPEntryView.swift
ios/BradOS/BradOS/Views/Profile/WeightGoalView.swift
ios/BradOS/BradOS/Views/Profile/TrainingBlockSetupView.swift
ios/BradOS/BradOS/Views/Profile/StravaConnectionView.swift
ios/BradOS/BradOS/Views/Profile/ProfileView.swift          # Add new sections
```

### FTP Entry View

```swift
struct FTPEntryView: View {
    @State private var ftpValue: String = ""
    @State private var testDate = Date()

    var body: some View {
        Form {
            Section("Current FTP") {
                TextField("Watts", text: $ftpValue)
                    .keyboardType(.numberPad)
                DatePicker("Last Tested", selection: $testDate, displayedComponents: .date)
            }

            Section("History") {
                // List of past FTP entries
            }
        }
        .navigationTitle("FTP")
    }
}
```

### Weight Goal View

```swift
struct WeightGoalView: View {
    @State private var targetWeight: String = ""
    @State private var targetDate = Date()

    var body: some View {
        Form {
            Section("Goal") {
                TextField("Target Weight (lbs)", text: $targetWeight)
                    .keyboardType(.decimalPad)
                DatePicker("Target Date", selection: $targetDate, displayedComponents: .date)
            }

            Section("Progress") {
                // Current weight from HealthKit
                // Progress bar
                // Weekly rate
                // On track status
            }
        }
        .navigationTitle("Weight Goal")
    }
}
```

### Training Block Setup

```swift
struct TrainingBlockSetupView: View {
    @State private var startDate = Date()
    @State private var selectedGoals: Set<String> = []

    var body: some View {
        Form {
            Section("Start Date") {
                DatePicker("Block Starts", selection: $startDate, displayedComponents: .date)
            }

            Section("Goals") {
                Toggle("Regain Fitness", isOn: binding(for: "regain_fitness"))
                Toggle("Maintain Muscle", isOn: binding(for: "maintain_muscle"))
                Toggle("Lose Weight", isOn: binding(for: "lose_weight"))
            }

            Section("Schedule") {
                Text("Session 1 (VO2max): Tuesday")
                Text("Session 2 (Threshold): Thursday")
                Text("Session 3 (Fun): Saturday")
            }
        }
        .navigationTitle("Training Block")
    }
}
```

### Strava Connection View

```swift
struct StravaConnectionView: View {
    @EnvironmentObject var stravaAuth: StravaAuthManager

    var body: some View {
        VStack {
            if stravaAuth.isConnected {
                // Connected state
                // Athlete info
                // Disconnect button
            } else {
                // Connect button
                // Explanation of what data is synced
            }
        }
    }
}
```

### Profile View Updates

```swift
// Add to ProfileView.swift

Section("Cycling") {
    NavigationLink("FTP", destination: FTPEntryView())
    NavigationLink("Training Block", destination: TrainingBlockSetupView())
    NavigationLink("Weight Goal", destination: WeightGoalView())
    NavigationLink("Strava", destination: StravaConnectionView())
}
```

**Success Criteria:**
- [ ] FTP entry saves to backend
- [ ] Weight goal shows progress from HealthKit data
- [ ] Training block creates correctly
- [ ] Strava OAuth flow accessible from Profile
- [ ] All forms follow Aurora Glass design

---

## Phase 6: Polish (SERIAL)

**Goal:** Add remaining features and refine UX.

**Depends on:** All prior phases

### Tasks

1. **FTP Test Prompting**
   - Check if FTP > 4 weeks old
   - Show warning in coach card
   - Suggest test during recovery week

2. **Block Transitions**
   - Auto-complete block after week 8
   - Prompt to start new block
   - Carry over goals

3. **Charts**
   - TSS history chart (8 weeks)
   - CTL/ATL/TSB trend chart
   - Weight trend with goal line

4. **Onboarding Flow**
   - First-time Strava connection
   - FTP entry prompt
   - Block setup wizard

5. **Fun Day Handling**
   - Show "Enjoy your ride!" message
   - No structured workout
   - Still track TSS via webhook

### Files to Modify

```
ios/BradOS/BradOS/Views/Cycling/CyclingBlockView.swift     # Add charts
ios/BradOS/BradOS/Views/Cycling/CyclingTodayView.swift     # FTP warning
ios/BradOS/BradOS/Views/Onboarding/CyclingOnboardingView.swift  # NEW
```

**Success Criteria:**
- [ ] FTP stale warning appears after 4 weeks
- [ ] Block auto-completes at week 8
- [ ] Charts display correctly
- [ ] Onboarding guides new users through setup
- [ ] Fun days show appropriate message

---

## Parallel Execution Map

```
Time →
─────────────────────────────────────────────────────────────────────
Phase 0: [████ Types + Schemas ████]
                                    │
Phase 1A: [████ HealthKit Foundation ████████████████]
Phase 1B: [████ Backend Infrastructure ██████████████]  ← 3 PARALLEL
Phase 1C: [████ Strava OAuth Prep ████████████████████]
                                    │
Phase 2A: [████ Strava Full Integration ████████]  ← 2 PARALLEL
Phase 2B: [████ Apple Watch Integration █████████]
                                    │
Phase 3:  [████ Cycling UI ██████████████████████]
                                    │
Phase 4:  [████ AI Cycling Coach █████████████████]
                                    │
Phase 5:  [████ Goals & Onboarding ███████████████]
                                    │
Phase 6:  [████ Polish ████████████████████████████]
```

## Agent Assignment Strategy

| Agent | Phases | Skills Needed |
|-------|--------|---------------|
| Agent 1 | 0, 1B, 2A | TypeScript, Express, Firestore, Strava API |
| Agent 2 | 1A, 2B | Swift, HealthKit, WatchOS |
| Agent 3 | 1C, 3, 5 | Swift, OAuth, SwiftUI, Aurora Glass |
| Agent 4 | 4 | TypeScript, OpenAI, Prompt Engineering |
| Agent 5 | 6 | Swift, Charts, UX Polish |

**Handoff Points:**
- Phase 0 must complete before 1B and 4 can start
- Phase 1A must complete before 2B can start
- Phase 1B + 1C must complete before 2A can start
- Phase 3 can start with stub data, then integrate 2A

## References

- Research Doc: `thoughts/shared/research/2026-02-08-healthkit-hrv-integration.md`
- Training Philosophy: `thoughts/shared/research/Cycing-Training-philosophy.md`
- OpenAI Pattern: `packages/functions/src/services/meal-plan-*.ts`
- Aurora Glass: `.claude/skills/aurora-glass/SKILL.md`
