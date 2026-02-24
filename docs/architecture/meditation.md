# Meditation

## Data Flow
View -> Services (GuidedMeditationService, MeditationAPIService) -> APIClient -> Cloud Function Handler -> Repository -> Firestore

## iOS Layer
- **Views:**
  - `ios/BradOS/BradOS/Views/Meditation/MeditationView.swift` — main view, state machine (setup/active/complete)
  - `ios/BradOS/BradOS/Views/Meditation/MeditationCategoryView.swift` — choose breathing vs guided
  - `ios/BradOS/BradOS/Views/Meditation/MeditationSetupView.swift` — breathing duration picker
  - `ios/BradOS/BradOS/Views/Meditation/MeditationActiveView.swift` — breathing session UI
  - `ios/BradOS/BradOS/Views/Meditation/MeditationActiveView+Session.swift` — session logic extension
  - `ios/BradOS/BradOS/Views/Meditation/MeditationCompleteView.swift` — session summary
  - `ios/BradOS/BradOS/Views/Meditation/GuidedMeditationBrowserView.swift` — browse guided scripts
  - `ios/BradOS/BradOS/Views/Meditation/GuidedMeditationPreparingView.swift` — audio pre-fetch progress
  - `ios/BradOS/BradOS/Views/Meditation/GuidedMeditationActiveView.swift` — guided session playback
  - `ios/BradOS/BradOS/Views/Today/MeditationDashboardCard.swift` — Today tab card
- **Services:**
  - `ios/BradOS/BradOS/Services/GuidedMeditationService.swift` — fetches guided meditation scripts
  - `ios/BradOS/BradOS/Services/MeditationAPIService.swift` — session CRUD via API
  - `ios/BradOS/BradOS/Services/MeditationManifestService.swift` — breathing meditation manifest/cues
  - `ios/BradOS/BradOS/Services/TTSAudioCache.swift` — disk cache for TTS audio files
- **Models:**
  - `ios/BradOS/BradOS/Models/MeditationState.swift` — session state types
  - `ios/BradOS/BradOS/Models/GuidedMeditation.swift` — guided meditation script model
  - `ios/BradOS/BradOS/Models/MeditationManifest.swift` — breathing phase manifest
  - `ios/BradOS/BradOSCore/Sources/BradOSCore/Models/MeditationSession.swift` — session record
  - `ios/BradOS/BradOSCore/Sources/BradOSCore/Models/GuidedMeditation.swift` — shared guided model
- **ViewModels:**
  - `ios/BradOS/BradOS/ViewModels/TextToSpeechViewModel.swift` — TTS playback for cues

## Backend Layer
- **Handlers:**
  - `packages/functions/src/handlers/meditationSessions.ts` — session logging (create/list/stats/latest)
  - `packages/functions/src/handlers/guidedMeditations.ts` — guided script browsing (categories/scripts)
  - `packages/functions/src/handlers/tts.ts` — text-to-speech audio generation
- **Repositories:**
  - `packages/functions/src/repositories/meditationSession.repository.ts` — session records
  - `packages/functions/src/repositories/guided-meditation.repository.ts` — guided meditation scripts
- **Schemas:**
  - `packages/functions/src/schemas/meditation.schema.ts` — session validation
- **Types:**
  - `packages/functions/src/types/meditation.ts` — MeditationSessionRecord, MeditationPhase, MeditationManifest
  - `packages/functions/src/types/guided-meditation.ts` — GuidedMeditationScript, categories, segments

## Firestore Collections
- `meditation_sessions` — completed session records (breathing + guided)
- `guided_meditation_scripts` — guided meditation content (categories, segments, interjections)

## Key Endpoints
- `POST /api/meditation-sessions` — log a completed session
- `GET /api/meditation-sessions` — list all sessions
- `GET /api/meditation-sessions/stats` — meditation statistics
- `GET /api/meditation-sessions/latest` — most recent session
- `GET /api/guidedMeditations/categories` — list guided meditation categories
- `GET /api/guidedMeditations/category/:category` — scripts in a category
- `GET /api/guidedMeditations/:id` — full script with segments
- `POST /api/tts` — generate TTS audio for meditation cues

## Notes
- Two meditation modes: breathing (4-2-6-2 cycle = 14s) and guided (pre-recorded scripts with TTS)
- MeditationView uses enum-based state machine (MeditationSessionState) with no dedicated ViewModel
- Guided meditations have segments and interjections; audio is pre-fetched before playback
- TTS audio cached on disk via TTSAudioCache (FileManager-based)
- Breathing durations: 5, 10, or 20 minutes

## See Also
- [Today](today.md) — meditation status in daily briefing
- [Calendar](calendar.md) — meditation dates on calendar
