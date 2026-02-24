# Weight Goal Feature - Implementation Plan

## Overview

Replace the mock weight goal feature with a fully functional implementation that:
1. Fetches real weight history from Firebase (already synced from HealthKit)
2. Persists weight goals to Firebase
3. Displays weight + 7-day smoothed average on a chart
4. Predicts goal completion date based on current rate of change

## Design Decisions

### 1. Weight History Source: Firebase API (not HealthKit directly)
Weight is already synced from HealthKit → Firebase via `HealthKitSyncService`. The iOS app should read history from `GET /health-sync/weight?days=N` rather than querying HealthKit directly. This gives us a single source of truth that's also accessible from other clients.

### 2. Weight Goal Storage: Firestore single document
Store at `/users/{userId}/settings/weightGoal` as a single document (same pattern as `recoveryBaseline`). Only one active goal at a time. Overwriting = updating the goal.

### 3. 7-Day Smoothed Average: Simple Moving Average (SMA)
At each data point, average the weight values from that point and the 6 preceding days. Points with fewer than 7 days of history use whatever data is available (partial window). SMA is simple, well-understood, and appropriate for daily weight fluctuations.

### 4. Prediction: Linear Regression on Recent Data
Use linear regression (least squares) on the last 28 days of weight data to calculate the rate of change. Extrapolate to the target weight to predict the completion date. 28 days balances noise reduction with responsiveness to recent trends. If rate is moving away from goal, show "not on track" instead of a date.

### 5. Remove Target Date Input, Replace with Prediction
The current UI has a manual "target date" picker. This is backwards — the user should set a target weight and the app predicts when they'll reach it. Remove the date picker. The prediction IS the target date.

---

## Phase 1: Backend — Weight Goal Endpoints

### 1.1 Add WeightGoal type
**File**: `packages/functions/src/types/recovery.ts`

```typescript
export interface WeightGoal {
  targetWeightLbs: number;
  startWeightLbs: number;
  startDate: string;        // YYYY-MM-DD
  createdAt: string;        // ISO 8601
  updatedAt: string;        // ISO 8601
}
```

### 1.2 Add Zod schema
**File**: `packages/functions/src/schemas/recovery.schema.ts`

```typescript
export const weightGoalSchema = z.object({
  targetWeightLbs: z.number().positive().max(1000),
  startWeightLbs: z.number().positive().max(1000),
});
```

### 1.3 Add Firestore service methods
**File**: `packages/functions/src/services/firestore-recovery.service.ts`

- `upsertWeightGoal(userId, goal)` → write to `/users/{userId}/settings/weightGoal`
- `getWeightGoal(userId)` → read from same path

### 1.4 Add API endpoints
**File**: `packages/functions/src/handlers/health-sync.ts`

- `PUT /health-sync/goal` — save weight goal
- `GET /health-sync/goal` — retrieve current goal

---

## Phase 2: iOS — Real Weight History + Goal Persistence

### 2.1 Add weight history fetch to APIClient or direct URL fetch
Fetch from `GET /health-sync/weight?days=90` (90 days for enough data for regression + chart display).

### 2.2 Add weight goal API methods
- `PUT /health-sync/goal` with `{ targetWeightLbs, startWeightLbs }`
- `GET /health-sync/goal`

### 2.3 Create WeightGoalViewModel
Extract logic from the view into a proper ViewModel that:
- Loads weight history from API
- Loads existing goal from API
- Calculates 7-day SMA
- Runs linear regression for prediction
- Saves goal to API

### 2.4 Update WeightGoalView
- Remove mock data generation
- Remove target date picker (prediction replaces it)
- Add 7-day SMA line to chart
- Add prediction section
- Wire save button to API
- Handle loading/error states

---

## Phase 3: Chart Enhancements

### 3.1 Dual-line chart
- Solid line: actual daily weight
- Dashed/translucent line: 7-day SMA
- Horizontal dashed line: goal weight
- Legend updated

### 3.2 Prediction visualization
- Extend the SMA line forward as a dotted "projected" line to the predicted date
- Mark predicted date on the x-axis

---

## Success Criteria

- [ ] Weight history loads from Firebase (not mock data)
- [ ] Chart shows actual weight + 7-day smoothed average
- [ ] User can set target weight and save to Firebase
- [ ] App predicts when target will be reached based on current trend
- [ ] Goal persists across app launches
- [ ] Handles edge cases: no weight data, not on track, insufficient data for prediction
