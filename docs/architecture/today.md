# Today Dashboard

## Data Flow
TodayDashboardView -> DashboardViewModel (BradOSCore) -> APIClient -> various handlers
TodayCoachCard -> TodayCoachClient -> todayCoachApp handler -> TodayCoachDataService + TodayCoachService (OpenAI)

## iOS Layer
- **Views:**
  - `ios/BradOS/BradOS/Views/Today/TodayDashboardView.swift` (main container)
  - `ios/BradOS/BradOS/Views/Today/TodayCoachCard.swift` (AI briefing card)
  - `ios/BradOS/BradOS/Views/Today/TodayCoachCard+Content.swift`
  - `ios/BradOS/BradOS/Views/Today/TodayCoachDetailView.swift` (expanded view)
  - `ios/BradOS/BradOS/Views/Today/TodayCoachDetailView+Sections.swift`
  - `ios/BradOS/BradOS/Views/Today/TodayCoachDetailView+Helpers.swift`
  - `ios/BradOS/BradOS/Views/Today/WorkoutDashboardCard.swift`
  - `ios/BradOS/BradOS/Views/Today/CyclingDashboardCard.swift`
  - `ios/BradOS/BradOS/Views/Today/MealPlanDashboardCard.swift`
  - `ios/BradOS/BradOS/Views/Today/ReadinessCard.swift`
  - `ios/BradOS/BradOS/Views/Today/RecoveryDetailView.swift`
- **ViewModels:** `ios/BradOS/BradOSCore/Sources/BradOSCore/ViewModels/DashboardViewModel.swift`
- **Services:** `ios/BradOS/BradOS/Services/TodayCoachClient.swift`
- **Models:** `ios/BradOS/BradOS/Models/TodayCoachModels.swift`

## Backend Layer
- **Handlers:** `packages/functions/src/handlers/today-coach.ts`
- **Services:**
  - `packages/functions/src/services/today-coach-data.service.ts` (aggregates all activity data)
  - `packages/functions/src/services/today-coach.service.ts` (OpenAI integration)
- **Types:** `packages/functions/src/types/today-coach.ts`

## Key Endpoints
- `POST /today-coach/recommend` -- AI-generated daily wellness briefing

## Notes
- Today is a hub that aggregates data from all features: lifting, cycling, meals, stretching, meditation, recovery
- DashboardViewModel loads workout and meal plan data; CyclingViewModel is injected via @EnvironmentObject
- TodayCoachClient calls the AI endpoint which aggregates recovery, lifting, cycling, stretching, meditation, and weight data
- AI uses OpenAI (GPT) to generate personalized daily briefings with sections for each activity domain
- Recovery data can come from request body (iOS HealthKit) or fallback to Firestore
- 5-minute foreground reload interval to avoid redundant API calls

## See Also
- [Lifting](lifting.md) — workout data aggregated in daily briefing
- [Cycling](cycling.md) — cycling data aggregated in daily briefing
- [Meal Planning](meal-planning.md) — meal plan data shown on dashboard
- [Stretching](stretching.md) — stretch status in daily briefing
- [Meditation](meditation.md) — meditation status in daily briefing
- [Health](health.md) — recovery/readiness data for coach recommendations
