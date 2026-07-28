# Cycling Data

## Purpose

Cycling is an ingested data source, not a standalone coaching product. BradOS keeps a local Firestore copy of Strava rides and uses recent workload as context for the unified Today Coach, recovery, calendar, and history surfaces.

Today Coach may use a completed ride to explain fatigue or adjust lifting, stretching, sleep, recovery, and fueling guidance. It must not prescribe a ride, Peloton class, target TSS, power zone, FTP test, or training schedule.

## Data flow

```text
Strava webhook/manual sync
  -> Strava activity and stream fetch
  -> users/{uid}/cyclingActivities
  -> Today Coach context aggregation
  -> cross-domain wellness guidance
```

Today Coach reads the BradOS copy of rides; it does not call Strava during recommendation generation.

## iOS

- `ios/BradOS/BradOS/Services/StravaAuthManager.swift` — OAuth lifecycle
- `ios/BradOS/BradOS/Views/Profile/StravaConnectionView.swift` — connection and manual sync
- `ios/BradOS/BradOS/Services/APIClient+WellnessData.swift` — token sync and historical ride sync
- Profile exposes Strava under **Connections**
- Calendar and history may display completed cycling activities

There is no cycling tab, training-block setup, cycling onboarding, FTP settings screen, or cycling recommendation card.

## Backend

- `packages/functions/src/handlers/strava-webhook.ts` — webhook verification, events, and token sync
- `packages/functions/src/handlers/internal-tasks.ts` — durable activity processing
- `packages/functions/src/handlers/cycling.ts` — stored activity, stream, metric, and manual-sync endpoints
- `packages/functions/src/services/strava.service.ts` — Strava API client and activity processing
- `packages/functions/src/services/firestore-cycling.service.ts` — Firestore persistence
- `packages/functions/src/services/today-coach-data.service.ts` — reads recent stored rides into Today Coach context

The standalone `/cycling-coach` route and cycling-specific OpenAI prompts do not exist.

## Storage

- `users/{uid}/cyclingActivities` — synced Strava activities
- `users/{uid}/cyclingActivities/{id}/streams/data` — power, heart-rate, cadence, and time streams
- `users/{uid}/integrations/strava` — Strava OAuth tokens
- `athleteToUser/{athleteId}` — Strava athlete-to-user mapping

## Endpoints

- `GET /cycling/activities`
- `GET /cycling/activities/:id`
- `GET /cycling/activities/:id/streams`
- `POST /cycling/activities/backfill-streams`
- `GET /cycling/training-load`
- `POST /cycling/sync`
- `GET/POST /strava/webhook`
- `POST /strava/tokens`

Legacy analytical endpoints for FTP, VO2 max, efficiency factor, profile, and weight goal remain available while their consumers are migrated. Training-block and cycling-coach endpoints are retired.

## Related

- [Today](today.md) — unified coaching
- [Health](health.md) — recovery context
- [Calendar](calendar.md) — completed activity history
