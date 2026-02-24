# Cycling

## Data Flow
CyclingTabView -> CyclingViewModel -> APIClient -> cycling/cycling-coach/strava handlers -> Firestore
Strava webhook -> strava-webhook handler -> cyclingService -> Firestore (async activity sync)

## iOS Layer
- **Views:**
  - `ios/BradOS/BradOS/Views/Cycling/CyclingTabView.swift` — tab container
  - `ios/BradOS/BradOS/Views/Cycling/CyclingTodayView.swift` — today's recommendation
  - `ios/BradOS/BradOS/Views/Cycling/CyclingBlockView.swift` — training block view
  - `ios/BradOS/BradOS/Views/Cycling/CyclingBlockView+Cards.swift` — block cards
  - `ios/BradOS/BradOS/Views/Cycling/CyclingHistoryView.swift` — activity history
  - `ios/BradOS/BradOS/Views/Cycling/CoachRecommendationCard.swift` — AI coach card
  - `ios/BradOS/BradOS/Views/Cycling/CoachRecommendationCard+Extras.swift` — card extensions
  - `ios/BradOS/BradOS/Views/Cycling/EfficiencyFactorChart.swift` — EF trend chart
  - `ios/BradOS/BradOS/Views/Cycling/VO2MaxCard.swift` — VO2max display
  - `ios/BradOS/BradOS/Views/Onboarding/CyclingOnboardingView.swift` — Strava onboarding
  - `ios/BradOS/BradOS/Views/Today/CyclingDashboardCard.swift` — Today tab card
- **ViewModels:** `ios/BradOS/BradOS/ViewModels/CyclingViewModel.swift`
- **Models:** `ios/BradOS/BradOS/Models/CyclingModels.swift`
- **Services:** `ios/BradOS/BradOS/Services/StravaAuthManager.swift` — Strava OAuth flow

## Backend Layer
- **Handlers:**
  - `packages/functions/src/handlers/cycling.ts` — activities, FTP, blocks, training load, VO2max, weight goal, EF, profile
  - `packages/functions/src/handlers/cycling-coach.ts` — AI coach recommendation + schedule generation
  - `packages/functions/src/handlers/strava-webhook.ts` — Strava webhook (verify, events, token sync)
- **Routes:** `packages/functions/src/routes/strava.routes.ts`
- **Services:**
  - `packages/functions/src/services/firestore-cycling.service.ts` — Firestore CRUD for cycling data
  - `packages/functions/src/services/strava.service.ts` — Strava API client (token refresh, activity fetch, streams)
  - `packages/functions/src/services/cycling-coach.service.ts` — OpenAI-powered coach recommendations
  - `packages/functions/src/services/training-load.service.ts` — TSS/CTL/ATL/TSB calculations
  - `packages/functions/src/services/vo2max.service.ts` — VO2max estimation from FTP/power
  - `packages/functions/src/services/efficiency-factor.service.ts` — EF trend analysis
  - `packages/functions/src/services/lifting-context.service.ts` — lifting schedule context for coach
- **Schemas:** `packages/functions/src/schemas/cycling.schema.ts`
- **Types:** `packages/functions/src/types/cycling.ts`
- **Prompts:** `packages/functions/src/prompts/cycling-coach-system.md`

## Firestore Collections
- `users/{uid}/cyclingActivities` — synced Strava activities (power, HR, TSS, type)
- `users/{uid}/cyclingActivities/{id}/streams/data` — raw time-series data (watts, HR, cadence)
- `users/{uid}/ftpHistory` — FTP test results over time
- `users/{uid}/trainingBlocks` — 8-week periodized training blocks
- `users/{uid}/vo2maxEstimates` — VO2max estimates from FTP/power
- `users/{uid}/settings/weightGoal` — weight goal
- `users/{uid}/settings/cyclingProfile` — cycling profile (weight, FTP)
- `users/{uid}/integrations/strava` — Strava OAuth tokens
- `athleteToUser/{athleteId}` — maps Strava athlete ID to Firebase user ID

## Key Endpoints
- `GET /cycling/activities` — list activities (optional limit)
- `POST /cycling/activities` — create activity
- `DELETE /cycling/activities/:id` — delete activity
- `POST /cycling/activities/backfill-streams` — backfill Strava stream data
- `GET /cycling/training-load` — CTL/ATL/TSB metrics
- `GET/POST /cycling/ftp` — current FTP and history
- `GET/POST /cycling/block` — training blocks
- `PUT /cycling/block/:id/complete` — complete a block
- `GET/POST /cycling/vo2max` — VO2max estimates
- `GET/PUT /cycling/profile` — cycling profile
- `GET /cycling/ef` — efficiency factor trends
- `POST /cycling/sync` — manual Strava sync
- `POST /cycling-coach/recommend` — AI coach recommendation
- `POST /cycling-coach/generate-schedule` — generate training schedule
- `GET/POST /strava/webhook` — Strava webhook verification + events
- `POST /strava/tokens` — save Strava OAuth tokens (App Check protected)

## Notes
- Strava webhook flow: Strava sends event -> resolve athleteId to userId -> fetch full activity -> save to Firestore
- Training load uses TSS-based CTL (42-day), ATL (7-day), TSB (CTL - ATL) calculations
- 8-week periodization: Adaptation (1-2), Build (3-4), Recovery (5), Peak (6-7), Test (8)
- AI coach considers recovery state, lifting schedule interference, and Peloton class types
- Webhook endpoints skip App Check (called by Strava); /tokens uses App Check (called by iOS app)

## See Also
- [Lifting](lifting.md) — lifting context used by cycling coach
- [Today](today.md) — cycling data shown in daily briefing
- [Health](health.md) — VO2 max and recovery metrics
