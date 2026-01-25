# Plan: Narrated Stretching Sessions

**Date**: 2026-01-24
**Feature**: Guided stretching sessions with TTS narration, per-stretch instructions, timers, media control, and background playback

---

## Execution Order

### Phase Dependencies

```
Phase 1: TTS Build Script ──┐
                            ├──► Phase 3: Data Loader ──┐
Phase 2: Shared Types ──────┤                           │
                            └──► Phase 4: Audio Engine ─┼──► Phase 5: Session Hook
                                                        │         │
                                                        │         ▼
                                                        │    Phase 6: Setup UI
                                                        │         │
                                                        │         ▼
                                                        │    Phase 7: Session UI
                                                        │         │
                                                        │         ▼
                                                        │    Phase 8: Routing
                                                        │         │
                                                        ├─────────┼──► Phase 9: Spotify/MediaSession
                                                        │         ├──► Phase 10: Background/SW
                                                        └─────────┴──► Phase 11: History Persistence
```

### Recommended Batches

| Batch | Phases | Parallelizable | Notes |
|-------|--------|----------------|-------|
| 1 | 1 + 2 | ✅ Yes | TTS script + TypeScript types (no dependencies) |
| 2 | 3 + 4 | ✅ Yes | Data loader + Audio engine (both need Batch 1) |
| 3 | 5 | ❌ No | Session hook (core state machine) |
| 4 | 6 | ❌ No | Setup UI |
| 5 | 7 | ❌ No | Active session UI |
| 6 | 8 | ❌ No | Routing & navigation |
| 7 | 9 + 10 + 11 | ✅ Yes | Spotify, Background, History (all independent) |

**Critical path**: 1 → 3 → 5 → 6 → 7 → 8 (or 2 → 5 → ...)

---

## Overview

Add a standalone stretching feature with pre-generated TTS narration (Kokoro-82M) that guides users through body-region stretches. Each body region has a library of stretches (defined in `thoughts/shared/plans/stretching/*.md`); one is randomly selected per region per session. Stretches are split into two equal-duration segments — bilateral stretches get "Switch sides" between segments, non-bilateral get "Halfway." Users can reorder/toggle regions, skip individual segments or entire stretches, and see the stretch description on-screen. Audio is only generated during the build phase if clips don't already exist.

---

## Current State Analysis

**What exists:**
- Web Audio API singleton for Safari (`packages/client/src/utils/audio.ts:45-65`) — reusable for audio context management
- Timestamp-based timer with background tab support (`packages/client/src/hooks/useRestTimer.ts:64-70`) — pattern to follow
- Timer localStorage persistence (`packages/client/src/utils/timerStorage.ts:6-73`) — pattern for session state recovery
- Service Worker for push notifications (`packages/client/public/sw.js:1-60`) — extend for audio caching
- `useLocalStorage<T>` generic hook (`packages/client/src/hooks/useLocalStorage.ts`) — use for preferences
- Bottom navigation with 5 items (`packages/client/src/components/Navigation/BottomNav.tsx:10-36`)
- Radix UI Themes for all styling (`packages/client/src/main.tsx:20-23`)
- Stretch definitions in `thoughts/shared/plans/stretching/` (8 files, 5 stretches each, `----` separated)
- No drag-and-drop library installed
- No `<audio>` element usage (only Web Audio API oscillators)
- No MediaSession API usage

**Stretch definition files:**
| File | Bilateral Count | Non-Bilateral Count |
|------|----------------|-------------------|
| `neck.md` | 4 (Side Tilt, Rotation, Upper Trap, Levator Scapulae) | 1 (Forward Tilt) |
| `shoulders.md` | 4 (Cross-Body, Overhead, Thread Needle, Arm Behind) | 1 (Shrugs) |
| `back.md` | 1 (Supine Spinal Twist) | 4 (Child's Pose, Cat-Cow, Knees-to-Chest, Cobra) |
| `hip_flexors.md` | 5 (all) | 0 |
| `glutes.md` | 5 (all) | 0 |
| `hamstrings.md` | 2 (Supine, Standing One-Leg) | 2 (Standing, Seated Forward Bend) |
| `quads.md` | 5 (all) | 0 |
| `calves.md` | 4 (Standing, Wall Push-Up, Bent-Knee, Single-Leg) | 1 (Downward Dog) |

**What's missing:**
- TTS generation script (Python/Kokoro)
- Stretch data parsed into structured format (JSON with bilateral flags)
- Audio file serving (static wavs in public/)
- `<audio>` element playback for pre-recorded clips
- MediaSession API integration for lock screen / media control
- Drag-and-drop reordering library
- Segment-based timer/session state machine
- On-screen stretch instruction display
- Route and page for `/stretch`

---

## Desired End State

- User navigates to "Stretch" in bottom nav
- **Setup screen**: Shows body regions in configurable order with drag-to-reorder. Each region has a duration toggle (1 min or 2 min, user-configurable). Users can toggle regions on/off. Spotify playlist URL is configurable. Total session time displayed.
- **Start**: Randomly selects one stretch per enabled region. Opens Spotify via deep link (putting Spotify in foreground). Waits for app to regain focus (`visibilitychange`), then begins narration.
- **Active session**: Shows:
  - Current stretch name and body region
  - **Full stretch description text** (readable instructions)
  - Countdown timer (MM:SS remaining in current segment)
  - Segment indicator (Segment 1/2)
  - Progress through total regions
- **Segments**: Each stretch split into 2 equal segments:
  - 1-min stretch = 2 × 30 seconds
  - 2-min stretch = 2 × 60 seconds
  - Bilateral: "Switch sides" TTS between segments
  - Non-bilateral: "Halfway" TTS between segments
- **Narration**: At stretch start, plays TTS of stretch name + full description concurrently with the segment timer (narration overlaps timer — the timer does NOT pause during narration). At segment boundary, plays "Switch sides" or "Halfway." External audio (Spotify) pauses during narration, resumes after.
- **Skipping**: Two skip levels:
  - **Skip segment** → advance to next segment (or next stretch if on segment 2)
  - **Skip stretch** → advance to next body region entirely
- **Completion**: Plays "Stretching complete. Great job." → session summary
- **Background**: Audio playback via `<audio>` element keeps the PWA alive on lock screen. MediaSession metadata shows current stretch on lock screen.

---

## What We're NOT Doing

- Server-side TTS generation on demand — pre-generated at build time only
- Committing audio files to git — generated files are .gitignored
- Custom voice selection UI — hardcoded to `af_heart` voice
- Stretch analytics/graphs — just persist session records, no dashboards yet
- Streak counter UI — persist the data needed, but streak display is a future enhancement
- Video/animation guides — audio-only narration with on-screen text
- Multiple stretch routines/presets — single configurable routine for now
- Forearms stretches — no definition file provided
- Editing stretch definitions in-app — definitions live in source files

---

## Key Technical Decisions

### Stretch Data Architecture

Stretch definitions live in `thoughts/shared/plans/stretching/*.md` as initiala source-of-truth. Images live in `thoughts/shared/plans/stretching/images/{region}-{slug}.png`. The TTS build script parses these files and:
1. Detects bilateral stretches via keyword heuristic ("one" + body part, "opposite", "other side")
2. Generates per-stretch narration wavs
3. Copies matching images to the public asset directory
4. Outputs a `stretches.json` manifest consumed by the client at runtime

**Image naming convention**: `{region}-{stretch-slug}.png` (e.g., `back-cat-cow-stretch.png`)
- Source: `thoughts/shared/plans/stretching/images/`
- Destination: `packages/client/public/audio/stretching/{region}/{slug}.png`
- If an image doesn't exist for a stretch, the manifest sets `image: null` and the UI hides the image slot

The manifest structure:
```json
{
  "regions": {
    "neck": {
      "stretches": [
        {
          "id": "neck-forward-tilt",
          "name": "Neck Forward Tilt",
          "description": "Gently lower your chin toward your chest...",
          "bilateral": false,
          "image": "neck/neck-forward-tilt.png",
          "audioFiles": {
            "begin": "neck/neck-forward-tilt-begin.wav"
          }
        },
        {
          "id": "neck-side-tilt",
          "name": "Neck Side Tilt",
          "description": "Tilt your head to one side...",
          "bilateral": true,
          "image": "neck/neck-side-tilt.png",
          "audioFiles": {
            "begin": "neck/neck-side-tilt-begin.wav"
          }
        }
      ]
    }
  },
  "shared": {
    "switchSides": "shared/switch-sides.wav",
    "halfway": "shared/halfway.wav",
    "sessionComplete": "shared/session-complete.wav",
    "silence": "shared/silence-1s.wav"
  }
}
```

### Bilateral Detection Heuristic

A stretch is bilateral if its description contains any of:
- "one leg", "one arm", "one knee", "one foot", "one side", "one hand"
- "opposite" (side/arm/leg/knee)
- Combined with context of asymmetric movement

This correctly classifies all 39 stretches in the current definitions. The manifest includes an explicit `bilateral` flag per stretch so the client doesn't need to re-detect.

### Slug Generation Rules

Stretch names are converted to file-safe slugs by:
1. Lowercasing the entire name
2. Stripping apostrophes entirely (e.g., "Child's Pose" → "childs-pose", not "child-s-pose")
3. Replacing spaces and non-alphanumeric characters with hyphens
4. Collapsing consecutive hyphens into one
5. Trimming leading/trailing hyphens

Examples:
- "Neck Forward Tilt" → `neck-forward-tilt`
- "Child's Pose" → `childs-pose`
- "Cat-Cow Stretch" → `cat-cow-stretch`
- "Levator Scapulae Stretch" → `levator-scapulae-stretch`

### Narration Timing

Narration plays concurrently with the segment timer — the timer does **not** pause during narration. When a stretch begins, the "begin" narration clip plays while the segment 1 countdown is already running. This means the effective hold time for the user is `segmentDuration - narrationDuration`. This is intentional: narration clips are short (~5-10 seconds), and the user is getting into position during narration anyway.

### Session Staleness & Timeout

- **Stale session recovery**: On mount, if a saved `StretchSessionState` exists in localStorage and its `segmentStartedAt` is older than 1 hour, silently discard it. If less than 1 hour old, prompt the user: "Resume unfinished session?" with Resume/Discard options.
- **Pause timeout**: If a session remains paused for 30+ minutes, auto-end it (transition to `complete` state, stop keepalive audio). This prevents indefinite battery drain from the silent keepalive loop.

### Segment Model

Each stretch (regardless of duration) has exactly 2 segments of equal length:
- **Segment 1**: First half of the stretch
- **Segment boundary**: "Switch sides" (bilateral) or "Halfway" (non-bilateral)
- **Segment 2**: Second half of the stretch

For bilateral stretches, the on-screen instructions could optionally note which side, but since the stretch descriptions don't specify sides, the TTS "Switch sides" cue is sufficient.

### Only-If-Not-Exist Generation

The TTS script checks each output wav path before generating:
```python
output_path = f"packages/client/public/audio/stretching/{clip_path}"
if os.path.exists(output_path):
    print(f"  SKIP (exists): {output_path}")
    continue
```

This means:
- First run: generates all ~43 clips
- Subsequent runs: skips existing, only generates new/missing clips
- To regenerate: delete the specific wav and re-run

### Background Playback Strategy

PWAs on iOS/Android can maintain background audio via an `<audio>` element with `MediaSession` API integration:

1. Play narration wavs through an `<audio>` element (not Web Audio API oscillators)
2. Between narrations, play a silent audio loop to keep the audio session alive
3. Register `MediaSession` metadata (current stretch name, progress) for lock screen display
4. Use `setInterval` with visibility-aware timestamp calculations (same pattern as `useRestTimer.ts`)

**Why `<audio>` over Web Audio API**: The `<audio>` element integrates with the OS media session, allowing background playback. Web Audio API `AudioContext` gets suspended when the app is backgrounded on mobile.

### Media Pause/Resume During Narration

1. **Audio Focus**: Playing our `<audio>` element causes the OS to duck/pause other audio (default behavior on iOS/Android)
2. **Between narrations**: Stop our audio element → OS releases audio focus → Spotify resumes
3. **Silent keepalive**: A sub-audible silent audio file looped between narrations keeps our audio session registered without interrupting Spotify

### Session History Storage

Completed sessions are persisted to a `stretch_sessions` SQLite table via a single POST endpoint. The `stretches` column stores the full `CompletedStretch[]` array as JSON — no join table needed for a single-user app. This keeps the schema simple while storing all the detail needed for future streak counters and history views.

The client saves the record on session completion (when `StretchComplete` renders). The setup screen fetches the latest record to show "Last stretched: X ago."

---

## Implementation Approach

**Dependencies to add:**
- `@dnd-kit/core` + `@dnd-kit/sortable` — drag-and-drop reordering (client)
- `kokoro>=0.9.2` + `soundfile` — TTS generation (Python, dev/CI only)

**Server-side changes:** A single `stretch_sessions` table and POST endpoint to persist completed session summaries. The active session state machine remains client-side (localStorage); only the final summary is sent to the server on completion.

---

## Phase 1: TTS Build Script & Audio Assets

### Overview
Create a Python script that parses stretch definition files, detects bilateral stretches, generates per-stretch narration wavs using Kokoro-82M (skipping existing files), and outputs a structured JSON manifest.

### Changes Required

**New file: `scripts/generate-tts.py`**
- Parse all `thoughts/shared/plans/stretching/*.md` files
- Extract stretch name + description per `----` delimiter
- Detect bilateral stretches via keyword heuristic
- For each stretch, generate a "begin" clip: `"{Stretch Name}. {Description}"`
- Generate shared clips: "Switch sides.", "Halfway.", "Stretching complete. Great job."
- Generate 1-second silent wav for keepalive
- Output to `packages/client/public/audio/stretching/{region}/{slug}-begin.wav`
- **Skip generation if wav already exists** at the target path
- **Copy images**: For each stretch, look for `thoughts/shared/plans/stretching/images/{region}-{slug}.png`. If found, copy to `packages/client/public/audio/stretching/{region}/{slug}.png`. Set `image` field in manifest (or `null` if no image exists).
- Output `packages/client/public/audio/stretching/stretches.json` manifest (always regenerated)
- Use Kokoro-82M with `af_heart` voice, speed=1.0
- Slugify stretch names by stripping apostrophes entirely, lowercasing, and replacing non-alphanumeric chars with hyphens

**Asset file structure:**
```
packages/client/public/audio/stretching/
├── stretches.json                          # Manifest (always regenerated)
├── shared/
│   ├── switch-sides.wav                    # "Switch sides."
│   ├── halfway.wav                         # "Halfway."
│   ├── session-complete.wav                # "Stretching complete. Great job."
│   └── silence-1s.wav                      # Silent keepalive loop
├── neck/
│   ├── neck-forward-tilt-begin.wav         # TTS narration
│   ├── neck-forward-tilt.png              # Stretch image (if available)
│   ├── neck-side-tilt-begin.wav
│   ├── neck-side-tilt.png
│   ├── neck-rotation-begin.wav
│   ├── upper-trapezius-stretch-begin.wav
│   └── levator-scapulae-stretch-begin.wav
├── back/
│   ├── childs-pose-begin.wav
│   ├── childs-pose.png                    # Copied from thoughts/.../images/back-childs-pose.png
│   ├── cat-cow-stretch-begin.wav
│   ├── cat-cow-stretch.png
│   └── ... (5 clips + available images)
├── shoulders/
│   └── ... (5 clips + available images)
├── hip_flexors/
│   └── ... (5 clips + available images)
├── glutes/
│   └── ... (5 clips + available images)
├── hamstrings/
│   └── ... (4 clips + available images)
├── quads/
│   └── ... (5 clips + available images)
└── calves/
    └── ... (5 clips + available images)
```

**Total: 39 stretch clips + 4 shared clips = 43 wav files + up to 39 images**

**Image source**: `thoughts/shared/plans/stretching/images/{region}-{slug}.png`
Images are optional per stretch — the UI gracefully handles missing images.

**Modify: `.gitignore`**
- Add `packages/client/public/audio/`

**Modify: `package.json` (root)**
- Add script: `"generate:tts": "python3 scripts/generate-tts.py"`

**New file: `scripts/requirements-tts.txt`**
```
kokoro>=0.9.2
soundfile
numpy
```

### Success Criteria
- [ ] Running `npm run generate:tts` parses all 8 stretch files correctly
- [ ] Produces 43 wav files in the expected directory structure
- [ ] Available images are copied from `thoughts/.../images/` to `public/audio/stretching/{region}/`
- [ ] `stretches.json` contains all 39 stretches with correct bilateral flags and image paths (or null)
- [ ] Running again with existing files skips wav generation (prints SKIP for each)
- [ ] Images are always re-copied (cheap operation, ensures sync with source)
- [ ] Deleting one wav and re-running regenerates only that file
- [ ] The generated directory is .gitignored
- [ ] wavs are audible and natural-sounding

### Confirmation Gate
Listen to a few generated clips to verify quality. Verify bilateral detection accuracy against the table in Current State Analysis. Verify images appear in correct output directories.

---

## Phase 2: Shared Types & Constants

### Overview
Define TypeScript types for body regions, individual stretches, session configuration, and segment-based session state.

### Changes Required

**New file: `packages/shared/src/types/stretching.ts`**
```typescript
export type BodyRegion =
  | 'neck' | 'shoulders' | 'back'
  | 'hip_flexors' | 'glutes' | 'hamstrings' | 'quads' | 'calves';

export interface Stretch {
  id: string;           // slug: "neck-forward-tilt"
  name: string;         // "Neck Forward Tilt"
  description: string;  // Full instruction text
  bilateral: boolean;
  image: string | null; // relative path: "neck/neck-forward-tilt.png" or null if unavailable
  audioFiles: {
    begin: string;      // relative path: "neck/neck-forward-tilt-begin.wav"
  };
}

export interface StretchRegionData {
  stretches: Stretch[];
}

export interface StretchManifest {
  regions: Record<BodyRegion, StretchRegionData>;
  shared: {
    switchSides: string;
    halfway: string;
    sessionComplete: string;
    silence: string;
  };
}

export interface StretchRegionConfig {
  region: BodyRegion;
  durationSeconds: 60 | 120; // User-configurable: 1 min or 2 min (binary toggle in UI)
  enabled: boolean;
}

export interface StretchSessionConfig {
  regions: StretchRegionConfig[];
  spotifyPlaylistUrl: string | null;
}

// Represents a single stretch chosen for a session
export interface SelectedStretch {
  region: BodyRegion;
  stretch: Stretch;
  durationSeconds: number;
  segmentDuration: number; // durationSeconds / 2
}

export interface StretchSessionState {
  status: 'idle' | 'active' | 'paused' | 'complete';
  currentStretchIndex: number;
  currentSegment: 1 | 2;
  segmentStartedAt: number | null; // Unix timestamp for current segment
  pausedAt: number | null;         // Unix timestamp when paused (for 30-min timeout)
  pausedElapsed: number;           // Elapsed seconds when paused
  selectedStretches: SelectedStretch[];
}

export const DEFAULT_STRETCH_REGIONS: StretchRegionConfig[] = [
  { region: 'neck', durationSeconds: 60, enabled: true },
  { region: 'shoulders', durationSeconds: 60, enabled: true },
  { region: 'back', durationSeconds: 120, enabled: true },
  { region: 'hip_flexors', durationSeconds: 60, enabled: true },
  { region: 'glutes', durationSeconds: 120, enabled: true },
  { region: 'hamstrings', durationSeconds: 60, enabled: true },
  { region: 'quads', durationSeconds: 60, enabled: true },
  { region: 'calves', durationSeconds: 60, enabled: true },
];

export const BODY_REGION_LABELS: Record<BodyRegion, string> = {
  'neck': 'Neck',
  'shoulders': 'Shoulders',
  'back': 'Back',
  'hip_flexors': 'Hip Flexors',
  'glutes': 'Glutes',
  'hamstrings': 'Hamstrings',
  'quads': 'Quads',
  'calves': 'Calves',
};

// --- Session History (persisted to server) ---

// A completed stretch within a session
export interface CompletedStretch {
  region: BodyRegion;
  stretchId: string;         // e.g., "neck-forward-tilt"
  stretchName: string;       // e.g., "Neck Forward Tilt"
  durationSeconds: number;   // configured duration (60 or 120)
  skippedSegments: number;   // 0, 1, or 2 (2 = entire stretch skipped)
}

// Full session summary saved to the database on completion
export interface StretchSessionRecord {
  id?: string;                    // assigned by server (UUID)
  completedAt: string;            // ISO 8601 timestamp
  totalDurationSeconds: number;   // wall-clock time from start to finish
  regionsCompleted: number;       // count of regions with at least 1 segment done
  regionsSkipped: number;         // count of regions fully skipped
  stretches: CompletedStretch[];  // ordered list of all stretches in the session
}

// API request body for creating a session record
export type CreateStretchSessionRequest = Omit<StretchSessionRecord, 'id'>;
```

**Modify: `packages/shared/src/types/index.ts`**
- Export from `./stretching`

### Success Criteria
- [ ] Types compile with `npm run typecheck`
- [ ] Constants importable from `@brad-os/shared`
- [ ] `StretchSessionState` tracks segment-level granularity
- [ ] `SelectedStretch` ties a specific stretch to its region config
- [ ] `StretchSessionRecord` and `CompletedStretch` types available for server + client

---

## Phase 3: Stretch Data Loader

### Overview
Create a client-side module that loads and provides access to the stretch manifest JSON, with random selection logic.

### Changes Required

**New file: `packages/client/src/utils/stretchData.ts`**
- `loadStretchManifest(): Promise<StretchManifest>` — fetches `/audio/stretching/stretches.json`, caches in memory
- `selectRandomStretches(config: StretchSessionConfig, manifest: StretchManifest): SelectedStretch[]` — for each enabled region, randomly picks one stretch from its pool
- `getAssetUrl(relativePath: string): string` — resolves to full URL: `/audio/stretching/{path}` (works for both wavs and PNGs)
- `getStretchImageUrl(stretch: Stretch): string | null` — returns resolved image URL or null if stretch has no image

**New file: `packages/client/src/utils/__tests__/stretchData.test.ts`**
- Tests for manifest loading, random selection, audio URL resolution
- Verify each enabled region gets exactly one stretch
- Verify disabled regions are excluded

### Success Criteria
- [ ] Manifest loads and parses correctly
- [ ] Random selection produces one stretch per enabled region
- [ ] Selection respects disabled regions
- [ ] Audio URLs resolve correctly

---

## Phase 4: Audio Playback Engine

### Overview
Build a client-side audio playback module that plays wav narration clips via `<audio>` element, integrates with MediaSession API, and handles the OS audio ducking pattern.

### Changes Required

**New file: `packages/client/src/utils/stretchAudio.ts`**
- Singleton `HTMLAudioElement` for narration playback
- Separate `HTMLAudioElement` for silent keepalive loop
- `playNarration(clipPath: string): Promise<void>` — pauses keepalive, loads + plays narration wav, resolves on `ended` event, resumes keepalive
- `startKeepalive(): void` — loops `silence-1s.wav` to maintain audio session
- `stopKeepalive(): void` — stops silent loop
- `setMediaSessionMetadata(stretchName: string, region: string, segment: number): void` — updates lock screen
- `initStretchAudio(): void` — must be called on user gesture (creates audio elements, unlocks playback)

**Key behavior:**
- Playing narration `<audio>` naturally causes OS to duck/pause Spotify
- When narration ends, Spotify resumes (OS releases audio focus)
- Silent keepalive loop maintains audio session between narrations without interrupting Spotify
- MediaSession metadata updates on each stretch/segment change

**Error handling:**
- If an audio file fails to load (network error, 404, corrupt file), `playNarration()` rejects with an error
- The session hook pauses the session timer and displays a retry UI: "Audio failed to load. [Retry] [Skip]"
- Retry re-attempts the same `playNarration()` call
- Skip resumes the timer without narration for that clip
- This ensures the user isn't silently left without guidance mid-session

**New file: `packages/client/src/utils/__tests__/stretchAudio.test.ts`**
- Unit tests mocking `HTMLAudioElement` and `navigator.mediaSession`
- Verify keepalive start/stop around narration
- Verify MediaSession metadata updates

### Success Criteria
- [ ] `playNarration('neck/neck-forward-tilt-begin')` plays the wav and resolves on completion
- [ ] Keepalive pauses during narration and resumes after
- [ ] MediaSession metadata displays current stretch on lock screen
- [ ] External audio (Spotify) pauses during narration, resumes after
- [ ] Works when called from background (screen locked)
- [ ] `playNarration()` rejects with descriptive error when audio fails to load
- [ ] Error state is surfaced to the caller for UI handling

---

## Phase 5: Stretch Session Hook & State Machine

### Overview
Create the core `useStretchSession` hook that manages the segment-based timer, stretch transitions, narration triggers, skip logic, and session state persistence.

### Changes Required

**New file: `packages/client/src/hooks/useStretchSession.ts`**

State machine:
```
idle → (start) → active[stretch 0, segment 1]
active[segment 1] → (segment timer ends) → play "Switch sides"/"Halfway" → active[segment 2]
active[segment 2] → (segment timer ends) → advance to next stretch segment 1
active[last stretch, segment 2] → (timer ends) → complete
active → (pause) → paused → (resume) → active
active → (skipSegment) → next segment or next stretch
active → (skipStretch) → next stretch segment 1 (or complete if last)
```

Core logic:
- Timestamp-based timer for current segment (pattern from `useRestTimer.ts:64-70`)
- `visibilitychange` listener for background recovery
- On stretch start (segment 1): play `{stretch-id}-begin.wav` narration
- At segment boundary (segment 1 → 2):
  - If bilateral: play `shared/switch-sides.wav`
  - If non-bilateral: play `shared/halfway.wav`
- On session complete: play `shared/session-complete.wav`
- **skipSegment**: If on segment 1, advance to segment 2 (play switch/halfway). If on segment 2, advance to next stretch.
- **skipStretch**: Advance to next stretch entirely (skip both segments of current stretch)
- Persist `StretchSessionState` to localStorage for crash recovery
- On resume from localStorage: recalculate elapsed from saved timestamp
- **Session staleness**: On load, if saved state's `segmentStartedAt` is >1 hour ago, silently discard. If <1 hour, prompt user to resume or discard.
- **Pause timeout**: When paused, record `pausedAt` timestamp. On each `visibilitychange` or periodic check, if `Date.now() - pausedAt > 30 minutes`, auto-end the session (stop keepalive, transition to `complete`).
- **Audio error handling**: If `playNarration()` rejects, pause the timer and surface an error state with retry/skip options. On retry, re-attempt playback. On skip, resume timer without that narration clip.

**New file: `packages/client/src/utils/stretchStorage.ts`**
- `saveStretchState(state: StretchSessionState): void`
- `loadStretchState(): StretchSessionState | null` — returns null if no saved state exists
- `isSessionStale(state: StretchSessionState): boolean` — true if `segmentStartedAt` (or `pausedAt` if paused) is >1 hour ago
- `clearStretchState(): void`
- `saveStretchConfig(config: StretchSessionConfig): void`
- `loadStretchConfig(): StretchSessionConfig`
- Storage keys: `'stretch-session-state'`, `'stretch-config'`
- Constants: `SESSION_STALE_THRESHOLD_MS = 60 * 60 * 1000` (1 hour), `PAUSE_TIMEOUT_MS = 30 * 60 * 1000` (30 min)

**New file: `packages/client/src/hooks/__tests__/useStretchSession.test.tsx`**
- Tests for state transitions, timer accuracy, narration trigger timing
- Tests for skipSegment (segment 1 → 2, segment 2 → next stretch)
- Tests for skipStretch (skip entire stretch regardless of current segment)
- Tests for bilateral vs non-bilateral segment boundary narration
- Tests for crash recovery from localStorage
- Tests for session staleness (>1 hour discards, <1 hour prompts)
- Tests for 30-minute pause timeout auto-ending session
- Tests for audio error → pause → retry/skip flow

### Success Criteria
- [ ] Timer counts accurately including across background/foreground transitions
- [ ] Bilateral stretches get "Switch sides" at segment boundary
- [ ] Non-bilateral stretches get "Halfway" at segment boundary
- [ ] `skipSegment` advances correctly from segment 1 and from segment 2
- [ ] `skipStretch` advances to next stretch entirely
- [ ] Session state persists across page reload (segment-level granularity)
- [ ] Auto-advances through all selected stretches
- [ ] Random stretch selection occurs at session start, not during
- [ ] Stale sessions (>1 hour) are auto-discarded on load
- [ ] Sessions paused >30 minutes are auto-ended
- [ ] Audio load failures pause the timer and show retry/skip UI

---

## Phase 6: Setup Screen UI

### Overview
Build the stretch configuration screen with drag-to-reorder body regions, enable/disable toggles, Spotify playlist input, and start button.

### Changes Required

**Install: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`** (client package)

**New file: `packages/client/src/components/Stretching/StretchSetup.tsx`**
- Renders list of body regions from saved config (localStorage via `loadStretchConfig()`)
- Each item shows: drag handle, region name, duration toggle (1m ↔ 2m, tappable), enable/disable toggle
- Duration is user-configurable per region: binary toggle between 60s and 120s (no other options)
- Drag-and-drop reordering via `@dnd-kit/sortable`
- Spotify playlist URL text input (saved to config)
- Total session time display (sum of enabled region durations)
- "Start Stretching" button (disabled if no regions enabled)

**New file: `packages/client/src/components/Stretching/RegionItem.tsx`**
- Individual draggable region row component
- Drag handle icon on left
- Region name in center
- Duration toggle (1m/2m) — tappable badge that switches between 60s and 120s
- Enable/disable toggle switch on right

**New file: `packages/client/src/components/Stretching/index.ts`**
- Barrel exports

**New file: `packages/client/src/components/Stretching/__tests__/StretchSetup.test.tsx`**
- Tests for reordering, enable/disable toggle, duration toggle, config persistence
- Tests for total time calculation (updates when toggling duration or enable/disable)
- Tests for start button disabled state

### Success Criteria
- [ ] Regions can be reordered via drag-and-drop (touch + pointer)
- [ ] Toggling a region on/off updates the total time
- [ ] Duration toggle switches between 60s and 120s per region and updates total time
- [ ] Config (order, enabled, durations) persists in localStorage across visits
- [ ] Start button is disabled if no regions are enabled
- [ ] Spotify URL is saved and recalled
- [ ] All 8 body regions shown with correct default durations

---

## Phase 7: Active Session UI

### Overview
Build the active stretching session view showing current stretch name, on-screen instructions, segment-aware countdown timer, and skip controls.

### Changes Required

**New file: `packages/client/src/components/Stretching/StretchSession.tsx`**
- Current body region label (e.g., "Neck")
- Current stretch name (large text, e.g., "Neck Side Tilt")
- **Stretch image** (if available in manifest, displayed prominently — shows the pose/position)
- **Stretch description text** (full instruction paragraph, readable on screen below image)
- Segment indicator: "Segment 1 of 2" or "Left Side / Right Side" for bilateral
- Countdown timer display (MM:SS remaining in current segment)
- Progress bar for current segment
- Region progress indicator (e.g., "3 of 7 stretches")
- **Skip Segment button** — advances to next segment (or next stretch if on segment 2)
- **Skip Stretch button** — advances to next stretch entirely
- Pause/Resume button
- Stop button (end session early, with confirm dialog)

**Image display logic:**
- If `stretch.image` is non-null, render `<img src={getAudioUrl(stretch.image)} />` with appropriate sizing
- Image should be prominent but not overflow the viewport — constrained to ~200px height, centered
- If `stretch.image` is null, hide the image area (description text fills the space)

**New file: `packages/client/src/components/Stretching/StretchSession.module.css`**
- Timer styling (large tabular numerals)
- Description text styling (readable font size, good contrast)
- Progress bar animations
- Segment indicator styling
- Transitions between stretches

**New file: `packages/client/src/components/Stretching/StretchComplete.tsx`**
- Session summary (total time, stretches completed, stretches skipped)
- "Done" button returns to setup
- Shows which stretches were randomly selected
- On render: triggers session record save to server (via `useSaveStretchSession` mutation, see Phase 11)

**New file: `packages/client/src/components/Stretching/__tests__/StretchSession.test.tsx`**
- Timer display tests
- Skip segment behavior (both segment 1 and segment 2)
- Skip stretch behavior
- Pause/stop behavior
- Stretch image rendered when available, hidden when null
- Stretch description displayed correctly
- Bilateral segment labels

### Success Criteria
- [ ] Timer counts down per-segment (30s or 60s depending on region duration)
- [ ] Stretch image displayed when available, hidden gracefully when null
- [ ] Stretch description is readable on screen (below image)
- [ ] Skip Segment advances within stretch or to next stretch
- [ ] Skip Stretch skips both segments
- [ ] Progress indicators update correctly
- [ ] Pause/resume works at segment level
- [ ] Session survives screen lock (timestamp-based)

---

## Phase 8: Routing & Navigation

### Overview
Add the `/stretch` route and navigation entry point.

### Changes Required

**Modify: `packages/client/src/components/App.tsx`**
- Add route: `<Route path="/stretch" element={<StretchPage />} />`

**New file: `packages/client/src/pages/StretchPage.tsx`**
- Renders `StretchSetup` when idle, `StretchSession` when active, `StretchComplete` when done
- Uses `useStretchSession` hook for state management
- On mount: loads stretch manifest, checks localStorage for in-progress session (discards if >1 hour stale, prompts if <1 hour)
- On start:
  1. Calls `initStretchAudio()` (user gesture unlocks audio)
  2. Calls `selectRandomStretches()` to pick one stretch per region
  3. If Spotify configured: opens deep link (Spotify goes to foreground, app loses focus)
  4. Listens for `visibilitychange` → when app regains focus, begins first stretch narration
  5. If no Spotify configured: begins immediately after step 2

**Modify: `packages/client/src/components/Navigation/BottomNav.tsx`**
- Add nav item: `{ path: '/stretch', label: 'Stretch', icon: <StretchIcon /> }`
- Add `StretchIcon` SVG component

**Modify: `packages/client/src/pages/index.ts`**
- Export `StretchPage`

### Success Criteria
- [ ] `/stretch` route renders correctly
- [ ] Bottom nav shows "Stretch" with icon
- [ ] Active stretch session persists across navigation and page reload
- [ ] Spotify opens on session start (if configured)
- [ ] Manifest loads before session can start

---

## Phase 9: Spotify & MediaSession Integration

### Overview
Wire up Spotify deep link launch and MediaSession lock screen controls with segment-aware metadata.

### Changes Required

**Modify: `packages/client/src/pages/StretchPage.tsx`** (or extract to utility)
- On "Start": open Spotify via `window.open(spotifyUrl, '_blank')` which puts Spotify in the foreground
- Support deep links: `https://open.spotify.com/playlist/X` → try `spotify:playlist:X` first
- After opening Spotify, register a one-time `visibilitychange` listener that fires when the user returns to the app
- On visibility restored: begin the first stretch narration (the session "truly starts" here)
- If Spotify URL is not configured, skip this step and start immediately

**Modify: `packages/client/src/utils/stretchAudio.ts`**
- Register `MediaSession` action handlers (play/pause → session pause/resume, nexttrack → skipSegment)
- Update metadata on each stretch/segment:
  ```typescript
  navigator.mediaSession.metadata = new MediaMetadata({
    title: stretch.name,
    artist: `${regionLabel} - Segment ${segment}/2`,
    album: 'Stretching Session',
  });
  ```
- Set `playbackState` on session state changes

**Modify: `packages/client/src/hooks/useStretchSession.ts`**
- Call `setMediaSessionMetadata()` on stretch/segment transitions
- Expose pause/resume/skip as callbacks compatible with MediaSession handlers

### Success Criteria
- [ ] Spotify playlist opens when session starts (app goes to background)
- [ ] Narration begins only after user returns to app (visibilitychange fires)
- [ ] If no Spotify URL configured, session starts immediately without waiting
- [ ] Lock screen shows current stretch name, region, and segment
- [ ] Lock screen play/pause buttons control the stretch session
- [ ] Lock screen next-track button skips segment

---

## Phase 10: Background Keepalive & Service Worker

### Overview
Ensure the stretch timer continues working with the screen locked by leveraging the silent audio keepalive and caching audio files for offline use.

### Changes Required

**Modify: `packages/client/src/utils/stretchAudio.ts`** (keepalive already built in Phase 4)
- Verify keepalive behavior: silent loop between narrations keeps iOS audio session alive
- Verify on Android: timers are throttled but not killed, timestamp approach handles accuracy

**Modify: `packages/client/public/sw.js`**
- Add `install` event: precache `/audio/stretching/stretches.json` and shared clips
- Add `fetch` event handler: cache-first strategy for `/audio/stretching/**` requests
- On first stretch session start, cache all audio files for the selected stretches

### Technical Notes

The silent audio loop (`silence-1s.wav` on repeat) is the key mechanism for background survival on iOS Safari. Without an active audio session, iOS suspends the PWA within seconds of screen lock. The silent loop maintains the audio session without audible output, allowing our `setInterval` timer to continue firing.

On Android Chrome, timers are throttled to ~1/minute when backgrounded, but the timestamp-based calculation ensures accuracy on next foreground event or next narration playback.

**30-minute pause timeout**: If the session is paused and 30 minutes elapse (checked via `visibilitychange` or periodic timer), the session auto-ends. This stops the keepalive loop and prevents indefinite battery drain if the user forgets about a paused session. The timeout check uses the `pausedAt` timestamp stored in `StretchSessionState`.

### Success Criteria
- [ ] Timer continues counting with screen locked (iOS Safari, Android Chrome)
- [ ] Narration plays through lock screen
- [ ] Audio files work offline after first session
- [ ] Silent loop does not produce audible output or visible battery drain
- [ ] Paused session auto-ends after 30 minutes (keepalive stops, state → complete)

---

## Phase 11: Session History Persistence

### Overview
Persist completed stretch sessions to the database via a server-side API endpoint. On session completion, the client sends a full session summary (regions, stretches, skips, duration) to the server. The setup screen shows when the user last stretched.

### Changes Required

**New file: `packages/server/src/db/migrations/XXX-create-stretch-sessions.ts`**
- Create `stretch_sessions` table:
  ```sql
  CREATE TABLE stretch_sessions (
    id TEXT PRIMARY KEY,           -- UUID
    completed_at TEXT NOT NULL,    -- ISO 8601
    total_duration_seconds INTEGER NOT NULL,
    regions_completed INTEGER NOT NULL,
    regions_skipped INTEGER NOT NULL,
    stretches TEXT NOT NULL        -- JSON array of CompletedStretch[]
  );
  ```
- The `stretches` column stores the full ordered list as JSON (simple, avoids a join table for a single-user app)

**New file: `packages/shared/src/schemas/stretching.ts`**
- Zod schema: `createStretchSessionSchema` validating `CreateStretchSessionRequest`

**New file: `packages/server/src/repositories/stretchSession.repository.ts`**
- `create(session: CreateStretchSessionRequest): Promise<StretchSessionRecord>`
- `getLatest(): Promise<StretchSessionRecord | null>` — most recent session
- `getAll(): Promise<StretchSessionRecord[]>` — all sessions, newest first

**New file: `packages/server/src/routes/stretchSession.routes.ts`**
- `POST /api/stretch-sessions` — validate with Zod, persist via repository, return created record
- `GET /api/stretch-sessions/latest` — return most recent session (for "last stretched" display)
- `GET /api/stretch-sessions` — return all sessions (for future history view)

**New file: `packages/server/src/routes/__tests__/stretchSession.routes.test.ts`**
- Tests for POST validation, successful creation, GET latest, GET all

**Modify: `packages/client/src/hooks/useStretchSession.ts`**
- On session completion (status → `complete`): build `CreateStretchSessionRequest` from session state, POST to `/api/stretch-sessions`
- Track per-stretch skip counts during session (increment `skippedSegments` on each skip action)

**Modify: `packages/client/src/components/Stretching/StretchSetup.tsx`**
- On mount: fetch `GET /api/stretch-sessions/latest`
- Display "Last stretched: X days ago" (or "Today" / "Yesterday") above the region list
- If no sessions exist, show nothing (no empty state clutter)

**New file: `packages/client/src/hooks/useStretchHistory.ts`**
- React Query hook: `useLatestStretchSession()` — fetches `/api/stretch-sessions/latest`
- React Query mutation: `useSaveStretchSession()` — POST to `/api/stretch-sessions`

### Success Criteria
- [ ] Completing a session persists a record to the database
- [ ] `GET /api/stretch-sessions/latest` returns the most recent session
- [ ] Setup screen shows "Last stretched: X ago" when history exists
- [ ] Session records include full stretch details (names, regions, skips)
- [ ] Zod validation rejects malformed requests
- [ ] Skipped stretches are recorded with correct `skippedSegments` counts

---

## Testing Strategy

### Unit Tests
- `stretchData.ts` — manifest parsing, random selection, URL resolution
- `stretchAudio.ts` — playback, keepalive, MediaSession updates (mock `HTMLAudioElement`)
- `useStretchSession.ts` — state machine transitions, segment timer, narration triggers, skip logic, bilateral detection
- `stretchStorage.ts` — localStorage read/write/clear, config persistence, staleness checks
- `stretchSession.repository.ts` — create, getLatest, getAll
- `stretchSession.routes.ts` — POST validation, GET endpoints
- `StretchSetup.tsx` — rendering, reorder, toggle, config persistence, "last stretched" display
- `StretchSession.tsx` — timer display, description display, segment indicators, skip buttons
- `StretchPage.tsx` — routing between setup/session/complete states, manifest loading

### E2E Tests
- Start a stretch session, verify timer counts down per-segment
- Skip a segment, verify advance to segment 2
- Skip a stretch, verify advance to next stretch
- Pause and resume
- Verify stretch description text is visible
- Verify correct segment boundary behavior (switch sides vs halfway)
- Complete a session, verify record persisted to database via API
- After completing a session, verify setup screen shows "Last stretched: Today"

### Manual Testing
- Lock screen on iOS Safari: verify timer + narration continue
- Lock screen on Android Chrome: verify timer + narration continue
- Spotify pause/resume during narration (audio ducking)
- Spotify open flow: verify app waits for focus return before starting narration
- Drag-and-drop reorder on mobile (touch events)
- Duration toggle: verify switching between 1m/2m updates total time correctly
- Session recovery after browser crash (reload during active session <1 hour old → prompt)
- Stale session: reload after >1 hour → silently discarded, shows setup screen
- Pause timeout: pause session, wait 30+ minutes → verify auto-ends
- Audio error: disable network mid-session → verify pause + retry UI appears
- Verify bilateral stretches say "Switch sides" and non-bilateral say "Halfway"
- Run `generate:tts` twice — second run should skip all existing files

---

## References

- TTS model decision: `docs/tts-kokoro-decision.md`
- Stretch definitions: `thoughts/shared/plans/stretching/*.md`
- Existing timer pattern: `packages/client/src/hooks/useRestTimer.ts`
- Existing audio pattern: `packages/client/src/utils/audio.ts`
- MediaSession API: https://developer.mozilla.org/en-US/docs/Web/API/MediaSession
- @dnd-kit docs: https://docs.dndkit.com/
- iOS PWA background audio: requires `<audio>` element with active playback
- Kokoro-82M: Apache 2.0, `af_heart` voice, 6x realtime on CPU
