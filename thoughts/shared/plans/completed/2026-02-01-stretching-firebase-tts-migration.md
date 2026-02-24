# Stretching: Firebase Migration & TTS Audio Replacement

## Overview

Move stretch definitions from the bundled `stretches.json` manifest into Firestore, and replace the 42 bundled WAV narration files with on-demand TTS audio using the existing `synthesizeSpeech` API. The app will fetch stretch data from the server, generate narration audio via TTS, cache it on disk, and play it during sessions exactly as it does today.

## Current State

- 38 stretches defined in `ios/BradOS/BradOS/Resources/stretches.json` (8 body regions, 4-5 each)
- 42 WAV files bundled at `ios/BradOS/BradOS/Resources/Audio/stretching/` (~38 per-stretch + 4 shared)
- `StretchManifestLoader` loads JSON from bundle, selects random stretches
- `StretchAudioManager` resolves WAV paths from bundle, plays via AVPlayer
- Backend TTS proxy exists at `POST /tts/synthesize` (Google Cloud TTS, base64 MP3)
- iOS `APIClient.synthesizeSpeech(text:)` already works
- Stretch sessions already save to Firestore via `POST /stretch-sessions`

## Desired End State

- Stretch definitions stored in Firestore `stretches` collection (grouped by region)
- iOS fetches stretch data from API on app launch / pull-to-refresh
- Narration audio generated via TTS from stretch description text
- Audio cached on disk permanently (same text = same audio)
- All audio pre-fetched before session starts (preparation step)
- Shared cues (switch-sides, halfway, session-complete) also generated via TTS
- Bundled `stretches.json` and WAV files removed from app bundle
- Session flow unchanged from user's perspective (minus a one-time "preparing audio" step)

## What We're NOT Doing

- Allowing users to create/edit stretches (admin-only data, seeded via script)
- Streaming audio during sessions (all audio pre-fetched before session starts)
- Changing the timer, segment, or session completion logic
- Modifying the stretch session recording API (it already works)
- Client-side TTS (all synthesis goes through the backend proxy)

## Key Decisions

- **Offline support**: Cache stretch data (UserDefaults) and TTS audio (disk) after first successful fetch. Sessions work fully offline once data + audio are cached.
- **Keepalive silence**: Keep `silence-1s.wav` bundled. It's infrastructure, not content — no reason to generate or TTS it.

---

## Phase 1: Backend — Stretches API

### 1A. Types

**Create** `packages/functions/src/types/stretch.ts`:

```typescript
interface StretchDefinition {
  id: string;              // e.g., "back-childs-pose"
  name: string;            // e.g., "Child's Pose"
  description: string;     // Full instruction text (TTS source)
  bilateral: boolean;      // true = stretch both sides
}

interface StretchRegion {
  id: string;              // document ID = region key (e.g., "back")
  region: BodyRegion;      // enum value
  displayName: string;     // "Back"
  iconName: string;        // SF Symbol name
  stretches: StretchDefinition[];  // 4-5 stretches per region
}
```

Stretches are embedded as an array within each region document. Max ~5 stretches per region, always read together, never queried independently — same reasoning as recipe ingredients in the meal planner migration.

### 1B. Schema

**Create** `packages/functions/src/schemas/stretch.schema.ts` (extend existing file):

Add `stretchDefinitionSchema` and `stretchRegionSchema` for seed validation.

### 1C. Repository

**Create** `packages/functions/src/repositories/stretch.repository.ts`:

- Collection: `stretches` / `dev_stretches`
- `findAll(): Promise<StretchRegion[]>` — all regions with embedded stretches
- `findByRegion(region: string): Promise<StretchRegion | null>` — single region
- `seed(regions: StretchRegion[]): Promise<void>` — batch write for data load

### 1D. Handler

**Create** `packages/functions/src/handlers/stretches.ts`:

```
GET /stretches              -> all regions with stretches
GET /stretches/:region      -> single region with stretches
```

Standard middleware chain: cors, json, stripPathPrefix, requireAppCheck.

### 1E. Register Functions

**Modify** `packages/functions/src/index.ts`:

```typescript
export const devStretches = onRequest(defaultOptions, stretchesApp);
export const prodStretches = onRequest(defaultOptions, stretchesApp);
```

### 1F. Seed Script

**Create** `packages/functions/src/scripts/seed-stretches.ts`:

Parse the existing `stretches.json` manifest into Firestore documents. Each body region becomes one document with embedded stretches array. Drop `image` and `audioFiles` fields (no longer needed — description text is the TTS source).

Run with: `npx tsx packages/functions/src/scripts/seed-stretches.ts`

### Success Criteria
- `GET /stretches` returns 8 regions with 38 total stretches
- `GET /stretches/back` returns back region with 5 stretches
- Each stretch has id, name, description, bilateral fields
- All endpoints validated with App Check
- Seed script is idempotent (can re-run safely)

---

## Phase 2: iOS Data Layer — Models, API, Cache

### 2A. Update Models

**Modify** `ios/BradOS/BradOS/Models/Stretch.swift`:

Replace the current `Stretch` struct (which has `audioFiles`) with a server-backed model:

```swift
struct StretchDefinition: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let description: String
    let bilateral: Bool
}

struct StretchRegionData: Codable, Identifiable, Hashable {
    let id: String
    let region: BodyRegion
    let displayName: String
    let iconName: String
    let stretches: [StretchDefinition]
}
```

Keep `SelectedStretch` but update it to reference `StretchDefinition` instead of `Stretch`.

Remove `StretchManifest`, `Stretch.AudioFiles`, and related types.

### 2B. API Client Extensions

**Modify** `ios/BradOS/BradOS/Services/APIClient.swift`:

- `getStretches() -> [StretchRegionData]` — fetch all regions
- `synthesizeSpeech(text:)` already exists at line 573

**Modify** `ios/BradOS/BradOSCore/Sources/BradOSCore/Protocols/APIClientProtocol.swift`:

Add `getStretches()` to protocol.

### 2C. TTS Audio Cache

**Create** `ios/BradOS/BradOS/Services/StretchAudioCache.swift`:

Disk cache in `FileManager.cachesDirectory/stretch-tts/`:

```swift
final class StretchAudioCache {
    static let shared = StretchAudioCache()

    func cachedFileURL(for text: String) -> URL?
    func store(data: Data, for text: String) -> URL
    func getOrFetch(text: String, using apiClient: APIClientProtocol) async throws -> URL
    func clearCache()
}
```

- Cache key: SHA256(text) -> `{hash}.mp3`
- No expiry (same text = same audio, stretch descriptions are static)
- Reuse pattern from guided meditation `TTSAudioCache` design

### 2D. Stretch Data Service

**Create** `ios/BradOS/BradOS/Services/StretchDataService.swift`:

```swift
@MainActor final class StretchDataService: ObservableObject {
    @Published var regions: [StretchRegionData] = []
    @Published var isLoading: Bool = false
    @Published var error: APIError?

    func loadRegions() async
    func selectRandomStretch(for region: BodyRegion) -> StretchDefinition?
    func selectStretches(for config: StretchSessionConfig) -> [SelectedStretch]
}
```

Replaces `StretchManifestLoader`. Fetches from API, caches in memory and persists to UserDefaults for offline use. Selection logic moves here.

On `loadRegions()`:
1. Return cached in-memory data if available
2. Attempt API fetch — on success, update memory cache + persist to UserDefaults
3. On API failure, fall back to UserDefaults persisted data
4. If no persisted data either, surface error with retry

### 2E. Audio Preparation Service

**Create** `ios/BradOS/BradOS/Services/StretchAudioPreparer.swift`:

```swift
@MainActor final class StretchAudioPreparer: ObservableObject {
    @Published var progress: Double = 0
    @Published var isPreparing: Bool = false

    func prepareAudio(
        for stretches: [SelectedStretch],
        sharedCues: [String: String]  // key -> text
    ) async throws -> PreparedStretchAudio
}

struct PreparedStretchAudio {
    let stretchAudio: [String: URL]    // stretchId -> cached MP3 URL
    let switchSidesURL: URL
    let halfwayURL: URL
    let sessionCompleteURL: URL
}
```

For each selected stretch + shared cue:
1. Check disk cache
2. If miss, call `apiClient.synthesizeSpeech(text:)`
3. Store result in cache
4. Update progress

### Success Criteria
- `StretchDataService.loadRegions()` fetches and stores all regions
- `selectStretches(for:)` returns random stretches matching config
- `StretchAudioPreparer.prepareAudio()` caches all needed audio files
- Second call for same stretches hits cache (near-instant)
- Progress updates during preparation

---

## Phase 3: iOS Audio Pipeline — Replace WAV Playback with Cached TTS

### 3A. Modify StretchAudioManager

**Modify** `ios/BradOS/BradOS/Services/StretchAudioManager.swift`:

Replace the bundle-based file resolution with cache URL lookup:

```swift
// BEFORE (bundle lookup):
func findAudioFile(_ relativePath: String) -> URL?
// Uses Bundle.main.url(forResource:withExtension:subdirectory:)

// AFTER (cache lookup):
func setAudioSources(_ prepared: PreparedStretchAudio)
func audioURL(for stretchId: String) -> URL?
func sharedAudioURL(for cue: SharedCue) -> URL?
```

The manager stores a reference to the `PreparedStretchAudio` from Phase 2. Audio playback (`playNarration`, `playNarrationAsync`) stays the same — just the URL source changes from bundle to disk cache.

Keep the keepalive silence pattern. The silence file can remain bundled (it's 1 second of silence, no TTS needed) or be generated programmatically.

### 3B. Modify StretchSessionManager

**Modify** `ios/BradOS/BradOS/Services/StretchSessionManager.swift`:

Update to accept `PreparedStretchAudio` instead of relying on manifest audio paths:

```swift
func start(with config: StretchSessionConfig,
           stretches: [SelectedStretch],
           audio: PreparedStretchAudio)
```

The session manager no longer calls `manifestLoader.selectStretches()` — that's done upstream. It receives pre-selected stretches and pre-cached audio.

Narration trigger points stay the same:
- Stretch begin: `audioManager.audioURL(for: stretch.id)` instead of `stretch.audioFiles.begin`
- Halfway/Switch sides: `audioManager.sharedAudioURL(.switchSides)` or `.halfway`
- Session complete: `audioManager.sharedAudioURL(.sessionComplete)`

### 3C. Keepalive Silence

Keep bundled `silence-1s.wav`. It's infrastructure, not content.

### Success Criteria
- Audio playback works identically to before (ducking, async/sync narration)
- All narration comes from disk-cached TTS files, not bundle WAVs
- Keepalive still works for background playback
- Lock screen controls still function

---

## Phase 4: iOS UI — Preparation Step & Data Loading

### 4A. Stretch Data Loading

**Modify** `ios/BradOS/BradOS/Views/Stretch/StretchView.swift`:

Add data loading on view appear:
- Load stretch regions from API via `StretchDataService`
- Show loading state if data hasn't been fetched yet
- Cache in memory so subsequent visits don't re-fetch

The setup view needs the region list to render the region selection grid. Currently it uses `BodyRegion.allCases` — it should continue to do so for the grid, but pull stretch data from `StretchDataService` for selection.

### 4B. Audio Preparation Step

**Modify** `ios/BradOS/BradOS/Views/Stretch/StretchView.swift`:

After user taps "Start Session" but before the Spotify handoff:

1. Select random stretches from `StretchDataService`
2. Show preparation view with progress bar ("Preparing audio...")
3. Call `StretchAudioPreparer.prepareAudio(for: stretches)`
4. On completion, proceed to Spotify handoff (if configured) then session start
5. Cancel button to abort preparation

This replaces the instant session start. First time will take a few seconds (TTS generation for ~8 stretches + 3 shared cues). Subsequent sessions with the same stretches will be near-instant (cache hits).

### 4C. Error Handling

- If API fails to load stretch data: show error with retry button in setup view
- If TTS fails for a specific stretch: skip that stretch's narration (session can still run silently)
- If all TTS fails: show error, allow user to proceed without narration or retry

### 4D. Update StretchSetupView

The region selection grid currently uses `BodyRegion.allCases` for the available regions. This stays the same — the regions are an enum. But the grid should disable regions that have no stretch data (in case the API returns partial data).

### Success Criteria
- Setup view loads stretch data from API
- "Start Session" triggers audio preparation with progress indicator
- Cached sessions start near-instantly
- Errors are handled gracefully with retry options
- Session flow is otherwise unchanged

---

## Phase 5: Cleanup — Remove Bundled Assets

### 5A. Remove WAV Files

Delete `ios/BradOS/BradOS/Resources/Audio/stretching/` directory (all 42 WAV files).

Keep `ios/BradOS/BradOS/Resources/Audio/stretching/shared/silence-1s.wav` if we chose option 1 for keepalive.

### 5B. Remove stretches.json

Delete `ios/BradOS/BradOS/Resources/stretches.json` and the duplicate at `Resources/Audio/stretching/stretches.json`.

### 5C. Remove StretchManifestLoader

Delete `ios/BradOS/BradOS/Services/StretchManifestLoader.swift`. Its responsibilities are now handled by `StretchDataService`.

### 5D. Update Xcode Project

Remove deleted files from the Xcode project file. Ensure no build errors from missing bundle resources.

### 5E. Update State Persistence

**Modify** `ios/BradOS/BradOS/Services/StretchSessionStorage.swift`:

Update `StretchSessionPersistableState` to work with the new `StretchDefinition` model instead of `Stretch`. Ensure backward compatibility — if a persisted session uses the old model, handle gracefully (discard and start fresh).

### Success Criteria
- App bundle size reduced by ~42 WAV files
- No references to `stretches.json` or `StretchManifestLoader` remain
- Build succeeds with zero warnings about missing resources
- Existing persisted sessions handled gracefully

---

## Phase 6: Seed Script & Testing

### 6A. Seed Production Data

Run the seed script against dev first, validate, then prod:

```bash
# Dev
npx tsx packages/functions/src/scripts/seed-stretches.ts

# Prod (after validation)
npx tsx packages/functions/src/scripts/seed-stretches.ts --prod
```

### 6B. Backend Tests

Write tests for:
- `StretchRepository.findAll()` returns 8 regions
- `StretchRepository.findByRegion('back')` returns correct stretches
- `GET /stretches` endpoint returns valid response
- Seed script is idempotent

### 6C. iOS Testing

- Verify stretch data loads from API
- Verify TTS audio generation and caching
- Verify session plays with TTS audio
- Verify cache hits on repeat sessions
- Verify offline behavior (cached audio + cached data work without network)
- Verify session persistence/recovery still works

### Success Criteria
- All backend tests pass
- Full stretch session works end-to-end with TTS audio
- App bundle is smaller (no WAV files)
- No regressions in stretching functionality

---

## Shared Cue Text

The 4 shared audio cues need defined text for TTS:

| Cue | Text |
|-----|------|
| switchSides | "Now switch to the other side." |
| halfway | "You're halfway through this stretch." |
| sessionComplete | "Great work! Your stretching session is complete." |
| silence | N/A (keep bundled or generate programmatically) |

These are synthesized once and cached permanently.

---

## Key Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| First session slow (TTS generation for 8+ clips) | Progress indicator during preparation; disk cache makes all subsequent sessions fast |
| TTS voice doesn't match original WAV quality | Google Chirp3-HD voice is high quality; test and tune before removing WAVs |
| Offline users can't start sessions | Stretch data persisted to UserDefaults, TTS audio cached on disk — sessions work fully offline after first successful fetch |
| Stretch description text too long for TTS | Max 5000 chars per API call; longest description is ~200 chars, well within limit |
| Migration breaks existing persisted sessions | Handle old model format gracefully in deserialization (discard stale sessions) |

## Firestore Document Structure

```
stretches/{regionId}
├── region: string           // "back", "neck", etc.
├── displayName: string      // "Back", "Neck", etc.
├── iconName: string         // SF Symbol name
├── stretches: array         // embedded stretch definitions
│   └── [{
│         id: string,        // "back-childs-pose"
│         name: string,      // "Child's Pose"
│         description: string, // Full instruction text
│         bilateral: boolean   // true/false
│       }]
├── createdAt: timestamp
└── updatedAt: timestamp
```

8 documents total. Estimated size: ~8 KB. Trivially small.

## References

- `packages/functions/src/handlers/tts.ts` — Existing TTS proxy (Google Cloud TTS)
- `ios/BradOS/BradOS/Services/APIClient.swift:573-589` — Existing `synthesizeSpeech(text:)`
- `ios/BradOS/BradOS/Resources/stretches.json` — Current manifest (migration source)
- `ios/BradOS/BradOS/Services/StretchManifestLoader.swift` — Current loader (to be replaced)
- `ios/BradOS/BradOS/Services/StretchAudioManager.swift` — Audio playback (to be modified)
- `ios/BradOS/BradOS/Services/StretchSessionManager.swift` — Session orchestration (to be modified)
- `thoughts/shared/plans/2026-02-01-guided-meditation-tts.md` — TTSAudioCache pattern reference
- `thoughts/shared/plans/2026-01-31-mealplanner-firebase-migration.md` — Firebase migration pattern reference
- `thoughts/shared/research/2026-02-01-stretching-firebase-tts-migration.md` — Detailed research findings
