# Guided Meditation with TTS Audio Pipeline

## Overview

Add meditation categories with a TTS-backed guided meditation experience. Users pick a category (Breathing or Reactivity), then for Reactivity, browse 14 guided meditations. Audio is generated via server-side TTS, cached on disk, and played through an AVQueuePlayer pipeline that's fully background-safe (phone locked, screen off).

## Current State

- Single "basic-breathing" meditation type with visual breathing circle + timer
- `MeditationView.swift` has state machine: `setup -> active -> complete`
- `MeditationAudioEngine` uses AVAudioPlayer for narration + bell + keepalive
- Timer-based cue scheduling at 100ms intervals (`ScheduledCue` system)
- `AudioSessionManager` configured for `.playback` with background mode enabled
- `NowPlayingManager` handles lock screen controls
- Backend accepts any `sessionType` string — no schema changes needed
- Existing `StretchAudioManager` has AVPlayer + AVPlayerItem patterns we can reference

## Desired End State

- Category selection before meditation setup
- 14 reactivity meditations fetched from server (text + timings)
- TTS proxy endpoint converts text segments to audio (OpenAI TTS via backend)
- All audio pre-fetched and disk-cached before session starts
- AVQueuePlayer plays the full 10-minute timeline (TTS clips + generated silence gaps)
- Rock-solid background playback — no timer dependency for audio scheduling
- Random interjections during silence phases
- Crash recovery for guided sessions

## What We're NOT Doing

- Replacing the existing breathing meditation — it stays as-is
- Client-side TTS — all TTS goes through backend proxy
- Streaming audio — all segments pre-fetched before session starts
- Custom voice training — using stock OpenAI TTS voices
- Multiple durations for reactivity — all are fixed 10 minutes

---

## Phase 1: Backend — Scripts API (TTS Proxy Already Exists)

### Already Built (no work needed)

The TTS proxy is complete:
- **Backend**: `packages/functions/src/handlers/tts.ts` — proxies to Google Cloud TTS (`en-US-Chirp3-HD-Algenib` voice), returns base64-encoded MP3 in `{ success: true, data: { audio: "<base64>" } }`
- **Schema**: `packages/functions/src/schemas/tts.schema.ts` — validates `{ text: string }` (1-5000 chars)
- **iOS APIClient**: `APIClient.swift:573-589` — `synthesizeSpeech(text:) -> Data`, decodes base64 audio response
- **iOS TTSAudioEngine**: `ios/BradOS/BradOS/Audio/TTSAudioEngine.swift` — plays MP3 `Data` via AVAudioPlayer
- **iOS Protocol**: `APIClientProtocol.swift:180` — `synthesizeSpeech(text:)` in protocol
- **Secret**: `GOOGLE_TTS_API_KEY` configured, voice set via `TTS_VOICE` env var

### 1A. Types

**Create** `packages/functions/src/types/guided-meditation.ts`:
- `GuidedMeditationScript` — id, category, title, subtitle, orderIndex, durationSeconds, segments[], interjections[]
- `GuidedMeditationSegment` — id, startSeconds, text, phase
- `GuidedMeditationInterjection` — windowStartSeconds, windowEndSeconds, textOptions[]

### 1B. Repository

**Create** `packages/functions/src/repositories/guided-meditation.repository.ts`:
- Firestore collection `guided_meditation_scripts`
- `findAllByCategory(category)` — ordered by `orderIndex`
- `findById(id)` — single script with full text
- `getCategories()` — distinct category metadata
- `seed(scripts[])` — batch write for initial data load

### 1C. Guided Meditations Handler

**Create** `packages/functions/src/handlers/guidedMeditations.ts`:
```
GET /guided-meditations/categories           -> list categories
GET /guided-meditations/category/:category   -> list scripts (without full text)
GET /guided-meditations/:id                  -> full script with text
```
Standard middleware chain: cors, json, stripPathPrefix, requireAppCheck.

### 1D. Register Functions

**Modify** `packages/functions/src/index.ts`:
```typescript
export const devGuidedMeditations = onRequest(defaultOptions, guidedMeditationsApp);
export const prodGuidedMeditations = onRequest(defaultOptions, guidedMeditationsApp);
```

### 1E. Seed the 14 Meditations

**Create** `packages/functions/src/scripts/seed-reactivity-meditations.ts`:
Parse `meditations.md` into 14 `GuidedMeditationScript` documents. Each maps to:
- Segments: opening (start=0), teachings (start=120), closing (start=510)
- Interjections: two windows (~350-370s and ~440-460s) with text from the `[6:00]` and `[7:30]` markers

### Success Criteria
- `GET /guided-meditations/categories` returns `[{ id: "reactivity", name: "Reactivity", scriptCount: 14 }]`
- `GET /guided-meditations/category/reactivity` returns 14 scripts ordered by index
- Existing `POST /tts/synthesize` already works
- All endpoints validated with App Check

---

## Phase 2: iOS Data Layer — Models, TTS Service, Cache

### 2A. Guided Meditation Models

**Create** `ios/BradOS/BradOS/Models/GuidedMeditation.swift`:
```swift
struct GuidedMeditationScript: Codable, Identifiable { ... }
struct GuidedMeditationSegment: Codable, Identifiable { ... }
struct GuidedMeditationInterjection: Codable { ... }

enum MeditationCategory: String, CaseIterable, Identifiable {
    case breathing, reactivity
    var displayName: String { ... }
    var icon: String { ... }
}
```

### 2B. API Client Extensions

**Modify** `ios/BradOS/BradOS/Services/APIClient.swift`:
- `getGuidedMeditationScripts(category:) -> [GuidedMeditationScript]`
- `getGuidedMeditationScript(id:) -> GuidedMeditationScript`
- `synthesizeSpeech(text:)` already exists at line 573 — returns base64-decoded MP3 `Data`

### 2C. TTS Audio Cache

**Create** `ios/BradOS/BradOS/Services/TTSAudioCache.swift`:
- Disk cache in `FileManager.cachesDirectory/meditation-tts/`
- Cache key: `SHA256(text + voiceId + speed)` → `{hash}.mp3`
- `cachedFileURL(for key:) -> URL?`
- `store(data:for key:) -> URL`
- `getOrFetch(text:voiceId:speed:fetcher:) -> URL` — check cache, fetch if miss
- No expiry (same text = same audio, scripts are static)

### 2D. Guided Meditation Service

**Create** `ios/BradOS/BradOS/Services/GuidedMeditationService.swift`:
```swift
@MainActor final class GuidedMeditationService: ObservableObject {
    @Published var scripts: [GuidedMeditationScript] = []
    @Published var preparationProgress: Double = 0
    @Published var isPreparing: Bool = false

    func loadScripts(category: String) async throws
    func prepareAudio(for script: GuidedMeditationScript) async throws -> [PreparedAudioSegment]
}

struct PreparedAudioSegment {
    let segmentId: String
    let phase: String
    let startSeconds: Int
    let audioFileURL: URL
    let audioDuration: TimeInterval  // Measured via AVURLAsset
}
```

`prepareAudio` iterates segments + resolved interjection texts, calls `cache.getOrFetch` for each, measures actual audio duration with `AVURLAsset.load(.duration)`, updates `preparationProgress`.

### Success Criteria
- Models decode correctly from API responses
- TTS cache stores and retrieves audio files
- `prepareAudio` returns all segments with measured durations
- Second call to `prepareAudio` for same script hits cache (near-instant)

---

## Phase 3: iOS Audio Pipeline — AVQueuePlayer + Silence Generation

### 3A. Silence Generator

**Create** `ios/BradOS/BradOS/Audio/SilenceGenerator.swift`:
```swift
final class SilenceGenerator {
    static func generateSilence(duration: TimeInterval, sampleRate: Double = 8000) throws -> URL
}
```
Generates valid WAV files with PCM 16-bit mono silence. Uses 8000Hz sample rate to keep file sizes small (a 4.5-minute silence is ~4.3MB at 8kHz vs ~23MB at 44.1kHz). Written to temp directory with duration-based filename for reuse within a session.

### 3B. Guided Meditation Pipeline

**Create** `ios/BradOS/BradOS/Audio/GuidedMeditationPipeline.swift`:
```swift
@MainActor final class GuidedMeditationPipeline: ObservableObject {
    @Published var isPlaying: Bool = false
    @Published var currentPhase: String = ""
    @Published var elapsedSeconds: TimeInterval = 0

    private var queuePlayer: AVQueuePlayer?
    private var keepalivePlayer: AVAudioPlayer?  // Safety net for background

    func buildTimeline(
        from segments: [PreparedAudioSegment],
        interjections: [ResolvedInterjection],
        bellFileURL: URL,
        totalDuration: TimeInterval
    ) throws

    func play()
    func pause()
    func resume()
    func stop()
}
```

**`buildTimeline` algorithm:**
1. Merge segments + interjections into single list sorted by `startSeconds`
2. Walk chronologically, tracking `currentEndTime = 0`
3. For each audio event:
   - `silenceGap = event.startSeconds - currentEndTime`
   - If `silenceGap > 0`: generate silence WAV, create `AVPlayerItem`, append to queue
   - Create `AVPlayerItem` from event's audio file URL, append to queue
   - `currentEndTime = event.startSeconds + event.audioDuration`
4. After last event: add silence until total duration, then bell
5. Construct `AVQueuePlayer(items: allItems)`

**Background safety:**
- AVQueuePlayer manages its own queue transitions — no timer dependency
- Keepalive AVAudioPlayer (looped silence at 0.01 volume) runs alongside as safety net
- `addPeriodicTimeObserver` on the queue player updates `elapsedSeconds` for UI
- Observe `.AVPlayerItemDidPlayToEndTime` on final item for completion
- `AudioSessionManager.shared` already configured for background playback

**Interjection resolution** (done during prepare phase):
```swift
struct ResolvedInterjection {
    let scheduledSeconds: Int       // Random time within window
    let audioFileURL: URL           // Already cached TTS file
    let audioDuration: TimeInterval // Measured
}
```
For each `GuidedMeditationInterjection`, pick `Int.random(in: windowStart...windowEnd)` and `textOptions.randomElement()`.

### Success Criteria
- Silence generator produces valid WAV files of exact duration
- AVQueuePlayer plays full 10-minute timeline start to finish
- Audio continues playing with phone locked and screen off
- Pause/resume works from lock screen controls
- Elapsed time is accurate after returning from background

---

## Phase 4: iOS UI — Category Selection, Browser, Session Views

### 4A. Expand State Machine

**Modify** `ios/BradOS/BradOS/Views/Meditation/MeditationView.swift`:

```swift
enum MeditationSessionState {
    case categorySelection    // NEW
    case setup                // existing (breathing duration picker)
    case guidedBrowser        // NEW
    case guidedPreparing      // NEW
    case active               // existing (breathing session)
    case guidedActive         // NEW
    case complete             // existing
}
```

Initial state changes from `.setup` to `.categorySelection`. Add `@State` properties:
- `selectedCategory: MeditationCategory?`
- `selectedScript: GuidedMeditationScript?`
- `preparedSegments: [PreparedAudioSegment]`
- `resolvedInterjections: [ResolvedInterjection]`

### 4B. Category Selection View

**Create** `ios/BradOS/BradOS/Views/Meditation/MeditationCategoryView.swift`:
Two glass cards — "Breathing" (existing flow) and "Reactivity" (guided flow). Uses existing `Theme` + `.glassCard()` styling. Brain icon header like existing setup view.

### 4C. Guided Meditation Browser

**Create** `ios/BradOS/BradOS/Views/Meditation/GuidedMeditationBrowserView.swift`:
ScrollView with LazyVStack listing the 14 meditations. Each row: order number, title, subtitle, "10 min" badge. Fetches scripts via `GuidedMeditationService.loadScripts(category:)` on appear.

### 4D. Pre-fetch Loading View

**Create** `ios/BradOS/BradOS/Views/Meditation/GuidedMeditationPreparingView.swift`:
Shows meditation title, progress bar (from `GuidedMeditationService.preparationProgress`), "Preparing meditation..." text, cancel button. On completion, calls back with prepared segments + resolved interjections.

### 4E. Guided Active Session View

**Create** `ios/BradOS/BradOS/Views/Meditation/GuidedMeditationActiveView.swift`:
- Countdown timer driven by `GuidedMeditationPipeline.elapsedSeconds`
- Phase indicator (Opening → Teachings → Silence → Closing)
- Meditation title display (no breathing circle — this is a listening experience)
- Pause/resume via pipeline
- End session dialog
- NowPlaying updates with meditation title + phase
- Scene phase handling: save state on background, recalculate on foreground

### 4F. Wire Into MeditationView

**Modify** `ios/BradOS/BradOS/Views/Meditation/MeditationView.swift`:
Add switch cases for new states routing to new views. Navigation flows:
- **Breathing**: `categorySelection -> setup -> active -> complete`
- **Reactivity**: `categorySelection -> guidedBrowser -> guidedPreparing -> guidedActive -> complete`

Back button shows during `categorySelection`, `setup`, and `guidedBrowser` states.

### Success Criteria
- Category selection appears first when entering meditation
- Tapping Breathing goes to existing duration picker
- Tapping Reactivity shows list of 14 meditations
- Selecting a meditation shows preparation progress
- Session plays with countdown and phase indicator
- Completion view shows meditation title and session details

---

## Phase 5: State Persistence and Crash Recovery

### 5A. Extend Persisted State

**Modify** `ios/BradOS/BradOS/Models/MeditationState.swift`:
Add optional fields to `MeditationSessionPersisted`:
- `guidedScriptId: String?`
- `guidedCategory: String?`
- `queuePlayerItemIndex: Int?`
- `queuePlayerItemTime: TimeInterval?`

All optional, so backward-compatible with existing persisted sessions.

### 5B. Recovery Logic

**Modify** `ios/BradOS/BradOS/Storage/MeditationStorage.swift`:
`recoverableSession()` checks `guidedScriptId != nil` to determine if it's a guided session. Recovery for guided sessions: rebuild AVQueuePlayer from cached audio (all files are disk-cached), seek to last known position.

### 5C. Config Persistence

**Modify** `ios/BradOS/BradOS/Models/MeditationState.swift`:
Add `selectedCategory: String?` to `MeditationConfig` so the app remembers the last selected category.

### Success Criteria
- Killing the app mid-guided-session and reopening shows "Resume Session?" prompt
- Resuming rebuilds the queue and picks up near where it left off
- Old breathing sessions still recover correctly (backward compat)

---

## Key Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| AVQueuePlayer alone may not keep audio session alive during long silence gaps | Keepalive AVAudioPlayer running alongside (existing pattern from MeditationAudioEngine) |
| TTS audio duration doesn't match expected timing (drift) | Measure actual duration with AVURLAsset, compute silence gaps dynamically |
| First-time preparation slow (5-6 TTS API calls) | Progress indicator + disk cache makes subsequent plays instant |
| Large silence WAV files | 8kHz sample rate keeps 4.5min silence at ~4.3MB |
| Crash mid-session loses progress | Periodic state saves, disk-cached audio enables rebuild |

## References

- `packages/functions/src/handlers/tts.ts` — Existing TTS proxy (Google Cloud TTS, base64 MP3 response)
- `ios/BradOS/BradOS/Services/APIClient.swift:573-589` — Existing `synthesizeSpeech(text:)` method
- `ios/BradOS/BradOS/Audio/TTSAudioEngine.swift` — Existing TTS audio player (AVAudioPlayer from Data)
- `ios/BradOS/BradOS/Services/StretchAudioManager.swift` — AVPlayer + AVPlayerItem + keepalive pattern to follow
- `ios/BradOS/BradOS/Audio/MeditationAudioEngine.swift:159-170` — Keepalive player setup to replicate
- `ios/BradOS/BradOS/Audio/AudioSessionManager.swift` — Shared audio session config (already correct)
- `ios/BradOS/BradOS/Audio/NowPlayingManager.swift` — Lock screen integration to reuse
- `meditations.md` — Source content for the 14 reactivity meditations
