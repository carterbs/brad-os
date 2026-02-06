---
date: 2026-02-01
researcher: claude
git_commit: b3298ea
branch: main
topic: Stretching Firebase Migration & TTS Audio Replacement
tags: [stretching, firebase, tts, audio, migration]
status: complete
---

# Research Question

How are stretches currently defined and played in the iOS app, and what would it take to (1) move stretch definitions from the bundled JSON manifest into Firebase/Firestore, and (2) replace the 42 bundled WAV files with on-demand TTS audio using the existing `synthesizeSpeech` API?

# Summary

The stretching feature currently operates entirely offline for its content: 38 stretch definitions live in a bundled `stretches.json` manifest, and 42 pre-recorded WAV files (38 per-stretch narrations + 4 shared cues) are included in the app bundle. The `StretchManifestLoader` loads the JSON at runtime, randomly selects one stretch per enabled body region, and `StretchAudioManager` plays the corresponding WAV files via AVPlayer with audio ducking during narration.

The app already has all the infrastructure needed for this migration: Firebase App Check authentication, a REST API pattern through Cloud Functions, a working TTS proxy endpoint (`POST /tts/synthesize`) that returns base64-encoded MP3 via Google Cloud TTS, an iOS `APIClient.synthesizeSpeech(text:)` method, and a disk-caching pattern from the guided meditation plan (`TTSAudioCache`). The stretch session completion API (`POST /stretch-sessions`) already stores session records in Firestore.

The migration involves two parallel tracks: (1) a new Firestore collection for stretch definitions with a corresponding API + iOS data layer, and (2) a TTS audio cache that generates narration on-demand from the stretch description text, replacing the bundled WAVs.

# Detailed Findings

## Current Stretch Data Architecture

### Manifest (`stretches.json`)
- **Location**: `ios/BradOS/BradOS/Resources/stretches.json` (duplicated in `Resources/Audio/stretching/stretches.json`)
- **Structure**: 8 body regions, 38 total stretches (4-5 per region)
- **Per stretch**: id, name, description (full instruction text), bilateral flag, image path, audioFiles.begin path
- **Shared audio**: switchSides, halfway, sessionComplete, silence-1s

### WAV Files
- **Location**: `ios/BradOS/BradOS/Resources/Audio/stretching/` organized by region
- **Count**: 42 files (38 stretch-specific `*-begin.wav` + 4 shared)
- **Naming**: `{region}/{stretch-id}-begin.wav` (e.g., `back/childs-pose-begin.wav`)
- **Purpose**: Each WAV narrates the stretch instructions when a stretch begins

### Loading Pipeline
1. `StretchManifestLoader.swift:32-58` loads and caches `stretches.json` from bundle
2. `StretchManifestLoader.swift:78-92` selects one random stretch per enabled region
3. `StretchAudioManager.swift:285-322` resolves relative audio paths to bundle URLs
4. `StretchAudioManager.swift:209-248` plays narration via AVPlayer with ducking

### Key Models
- `Stretch` struct: id, name, description, bilateral, image, audioFiles.begin
- `SelectedStretch`: region + stretch + durationSeconds (segmentDuration = duration/2)
- `StretchManifest`: regions dict + shared audio paths
- `BodyRegion` enum: 8 cases with displayName and iconName
- `StretchRegionConfig`: region + durationSeconds + enabled flag
- `StretchSessionConfig`: regions array + spotifyPlaylistUrl

## Existing TTS Infrastructure

### Backend (`packages/functions/src/handlers/tts.ts`)
- `POST /tts/synthesize` accepts `{ text: string }` (1-5000 chars)
- Proxies to Google Cloud TTS API (`en-US-Chirp3-HD-Algenib` voice)
- Returns `{ success: true, data: { audio: "<base64-mp3>" } }`
- Voice configurable via Firebase Remote Config (`TTS_VOICE` key)
- 30-second timeout, App Check required

### iOS Client (`APIClient.swift:573-589`)
- `synthesizeSpeech(text:) -> Data` decodes base64 response to MP3 Data
- `TTSAudioEngine` plays MP3 Data via AVAudioPlayer
- `AudioSessionManager` handles .playback category with background support

### Guided Meditation Plan (reference pattern)
- `TTSAudioCache` design: disk cache in `FileManager.cachesDirectory/meditation-tts/`
- Key: SHA256(text + voiceId + speed) -> `{hash}.mp3`
- No expiry (same text = same audio)
- `getOrFetch(text:fetcher:) -> URL` pattern

## Firebase Integration Pattern

### Backend
- Express handlers with middleware: cors -> json -> stripPathPrefix -> requireAppCheck
- Lazy repository initialization per Cloud Function instance
- `BaseRepository<T>` with environment-aware collection names (`dev_` prefix)
- Functions exported as `devX` and `prodX` pairs in `index.ts`

### iOS
- No direct Firestore access - all data flows through REST API
- `APIClient.shared` with App Check token attachment
- ViewModels fetch via `apiClient` methods, store in `@Published` properties
- `.task` modifier and `.refreshable` for data loading lifecycle

## Stretch Session API (already exists)
- `POST /stretch-sessions` - create completed session record
- `GET /stretch-sessions` - list all sessions
- `GET /stretch-sessions/latest` - most recent session
- `GET /stretch-sessions/:id` - specific session
- Repository: `stretchSession.repository.ts` with Firestore CRUD
- Collection: `stretch_sessions` / `dev_stretch_sessions`

# Code References

| File | Lines | Description |
|------|-------|-------------|
| `ios/BradOS/BradOS/Resources/stretches.json` | 1-432 | Hardcoded stretch manifest (38 stretches, 8 regions) |
| `ios/BradOS/BradOS/Models/Stretch.swift` | 5-64 | Stretch, StretchManifest, SelectedStretch models |
| `ios/BradOS/BradOSCore/.../Models/StretchSession.swift` | 4-99 | BodyRegion enum, StretchRegionConfig, CompletedStretch |
| `ios/BradOS/BradOS/Services/StretchManifestLoader.swift` | 32-92 | Manifest loading and random stretch selection |
| `ios/BradOS/BradOS/Services/StretchAudioManager.swift` | 209-322 | Audio playback, file resolution, ducking |
| `ios/BradOS/BradOS/Services/StretchSessionManager.swift` | 170-545 | Session orchestration, timing, narration triggers |
| `packages/functions/src/handlers/tts.ts` | 58-101 | TTS proxy endpoint |
| `packages/functions/src/handlers/stretchSessions.ts` | 28-55 | Stretch session CRUD endpoints |
| `packages/functions/src/types/stretching.ts` | 8-116 | Backend stretch types |
| `ios/BradOS/BradOS/Services/APIClient.swift` | 573-589 | synthesizeSpeech(text:) method |

# Architecture Insights

1. **Audio is narration, not music**: Each WAV file speaks the stretch instructions aloud (e.g., "Kneel on the floor, sit back on your heels..."). The `description` field in `stretches.json` contains this same text. This means TTS can replace WAVs by synthesizing the description text.

2. **Shared audio cues are short phrases**: "Switch sides", "Halfway there", "Session complete" - these are simple phrases that TTS can generate once and cache permanently.

3. **Audio timing is fire-and-forget**: Narration plays asynchronously at stretch start (`playNarrationAsync`). The timer runs independently. This means slight TTS generation latency is acceptable as long as audio is pre-cached before the session starts.

4. **The manifest is the single source of truth**: All stretch selection, audio resolution, and session flow depend on the manifest. Replacing the manifest source (bundle -> Firestore) is the key architectural change.

5. **No images are actually used**: The `image` field exists in the manifest but stretch images are loaded from the bundle path. Currently the setup view shows SF Symbol icons, not images.

# Resolved Questions

- **Shared cues**: Switch-sides, halfway, session-complete become TTS (cached permanently). Silence keepalive stays bundled.
- **Pre-fetch strategy**: Only fetch audio for stretches selected in the current session config (not all 38). Cached audio persists across sessions.
- **Editability**: Purely admin-seeded data. No user editing.
- **Offline**: Cache stretch data in UserDefaults + TTS audio on disk. Sessions work fully offline after first successful fetch.
