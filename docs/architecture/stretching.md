# Stretching

## Data Flow
View -> StretchSessionManager/StretchDataService -> APIClient -> Cloud Function Handler -> Repository -> Firestore

## iOS Layer
- **Views:**
  - `ios/BradOS/BradOS/Views/Stretch/StretchView.swift` — main view, manages session lifecycle
  - `ios/BradOS/BradOS/Views/Stretch/StretchSetupView.swift` — region/duration config before session
  - `ios/BradOS/BradOS/Views/Stretch/StretchActiveView.swift` — active stretching timer UI
  - `ios/BradOS/BradOS/Views/Stretch/StretchCompleteView.swift` — session summary
  - `ios/BradOS/BradOS/Views/Stretch/StretchSupportViews.swift` — shared UI components
  - `ios/BradOS/BradOS/Views/Stretch/StretchSessionDetailView.swift` — past session detail
  - `ios/BradOS/BradOS/Views/Today/StretchDashboardCard.swift` — Today tab card
- **Services (act as ViewModels):**
  - `ios/BradOS/BradOS/Services/StretchSessionManager.swift` — session state machine, timer logic
  - `ios/BradOS/BradOS/Services/StretchSessionManager+Timer.swift` — timer extension
  - `ios/BradOS/BradOS/Services/StretchSessionManager+NowPlaying.swift` — lock screen controls
  - `ios/BradOS/BradOS/Services/StretchDataService.swift` — fetches stretch definitions from API
  - `ios/BradOS/BradOS/Services/StretchConfigStorage.swift` — persists user config (regions, duration)
  - `ios/BradOS/BradOS/Services/StretchSessionStorage.swift` — session recovery on crash
  - `ios/BradOS/BradOS/Services/StretchAudioManager.swift` — TTS playback during session
  - `ios/BradOS/BradOS/Services/StretchAudioPreparer.swift` — pre-fetches TTS audio
  - `ios/BradOS/BradOS/Services/StretchAudioCache.swift` — disk cache for TTS audio
- **Models:**
  - `ios/BradOS/BradOS/Models/Stretch.swift` — local stretch types
  - `ios/BradOS/BradOSCore/Sources/BradOSCore/Models/StretchSession.swift` — session record
  - `ios/BradOS/BradOSCore/Sources/BradOSCore/Helpers/StretchUrgency.swift` — urgency calculation

## Backend Layer
- **Handlers:**
  - `packages/functions/src/handlers/stretches.ts` — stretch definition CRUD (GET by region)
  - `packages/functions/src/handlers/stretchSessions.ts` — session logging (create/list/latest)
- **Repositories:**
  - `packages/functions/src/repositories/stretch.repository.ts` — stretch definitions by region
  - `packages/functions/src/repositories/stretchSession.repository.ts` — session records
- **Schemas:**
  - `packages/functions/src/schemas/stretch.schema.ts` — stretch definition validation
  - `packages/functions/src/schemas/stretching.schema.ts` — session validation
- **Types:**
  - `packages/functions/src/types/stretch.ts` — StretchDefinition, StretchRegion
  - `packages/functions/src/types/stretching.ts` — StretchSessionRecord, BodyRegion, StretchSessionConfig

## Firestore Collections
- `stretches` — stretch definitions organized by body region
- `stretch_sessions` — completed session records

## Key Endpoints
- `GET /api/stretches` — all regions with stretch definitions
- `GET /api/stretches/:region` — stretches for a specific body region
- `POST /api/stretch-sessions` — log a completed stretch session
- `GET /api/stretch-sessions` — list all sessions
- `GET /api/stretch-sessions/latest` — most recent session

## Notes
- No dedicated ViewModel class; StretchView uses @StateObject services (StretchSessionManager, StretchDataService)
- TTS audio (voice cues for stretch names/transitions) is pre-fetched and cached on disk
- Session recovery: StretchSessionStorage persists state so sessions survive app crashes
- StretchUrgency in BradOSCore calculates days-since-last-stretch for dashboard display
- Lock screen Now Playing integration via MPNowPlayingInfoCenter
