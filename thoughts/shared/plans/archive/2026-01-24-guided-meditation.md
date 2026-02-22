# Plan: Guided Meditation Sessions

**Date**: 2026-01-24
**Feature**: 5/10/20-minute breathing meditation with TTS narration, breathing animation, randomly-timed interjections, and session tracking

---

## Execution Order & Scheduling

### Dependency Graph

```
                    ┌─────────────────────────────────────────────────────────────┐
                    │                                                             │
   Phase 1 ────┐    │                                                             │
   (Assets)    │    │                                                             ▼
               ├────┼──► Phase 3 ──┐                                         Phase 10
   Phase 2 ────┤    │   (Data)     │                                         (History)
   (Types)     │    │              ├──► Phase 5 ──► Phase 6 ──► Phase 9 ─────────┘
               │    │              │    (Hook)      (Setup)     (Routing)
               └────┼──► Phase 4 ──┘                    │
                    │   (Audio)                         │
                    │                                   ▼
                    │                              Phase 7 ◄──── Phase 8
                    │                              (Session)     (Animation)
                    │                                   │
                    │                                   └──────► Phase 9
                    │                                            (Routing)
                    └─────────────────────────────────────────────────────────────┘
```

### Sequential Dependencies (MUST be in order)

| Step | Phase | Depends On | Reason |
|------|-------|------------|--------|
| 1 | Phase 1 (Assets) | — | Audio files must exist before anything can play them |
| 2 | Phase 2 (Types) | — | Types must exist before code can use them |
| 3 | Phase 3 (Data Loader) | 1, 2 | Needs types + manifest structure to load |
| 4 | Phase 4 (Audio Engine) | 1, 2 | Needs types + audio files to play |
| 5 | Phase 5 (Session Hook) | 3, 4 | Core logic needs data loader + audio engine |
| 6 | Phase 6 (Setup UI) | 2, 5 | Needs types + hook to start sessions |
| 7 | Phase 7 (Session UI) | 5, 6 | Needs hook + renders after setup |
| 8 | Phase 9 (Routing) | 6, 7 | Needs all UI components to route between |
| 9 | Phase 10 (History) | 5, 9 | Needs hook (to save) + routing (to display) |

### Parallel Opportunities

```
Timeline:

Step 1:  ┌─ Phase 1: Assets ─────────┐
         │  (Download bell, run TTS) │
         └───────────────────────────┘
         ┌─ Phase 2: Types ──────────┐     CAN RUN IN PARALLEL
         │  (TypeScript definitions) │     No dependencies on each other
         └───────────────────────────┘

Step 2:  ┌─ Phase 3: Data Loader ────┐
         │  (Manifest + randomizer)  │
         └───────────────────────────┘
         ┌─ Phase 4: Audio Engine ───┐     CAN RUN IN PARALLEL
         │  (Playback utilities)     │     Both depend only on Step 1
         └───────────────────────────┘

Step 3:  ┌─ Phase 5: Session Hook ───┐
         │  (State machine + timer)  │     SEQUENTIAL
         └───────────────────────────┘     Core logic, everything depends on this

Step 4:  ┌─ Phase 6: Setup UI ───────┐
         │  (Duration selector)      │     SEQUENTIAL
         └───────────────────────────┘     Needs hook to function

Step 5:  ┌─ Phase 7: Session UI ─────┐
         │  (Timer + controls)       │
         └───────────────────────────┘
         ┌─ Phase 8: Animation ──────┐     CAN RUN IN PARALLEL
         │  (Breathing circle CSS)   │     Animation is standalone component
         └───────────────────────────┘

Step 6:  ┌─ Phase 9: Routing ────────┐
         │  (Wire up /meditation)    │     SEQUENTIAL
         └───────────────────────────┘     Needs all UI pieces

Step 7:  ┌─ Phase 10: History ───────┐
         │  (DB + API + persistence) │     SEQUENTIAL
         └───────────────────────────┘     Needs routing for display
```

### Work Packages for Parallel Execution

If two developers (or two parallel agents) are available:

| Step | Worker A | Worker B | Sync Point |
|------|----------|----------|------------|
| 1 | Phase 1 (Assets + TTS) | Phase 2 (Types) | Wait for both |
| 2 | Phase 3 (Data Loader) | Phase 4 (Audio Engine) | Wait for both |
| 3 | Phase 5 (Session Hook) | — | Worker B idle or helps with tests |
| 4 | Phase 6 (Setup UI) | Phase 8 (Animation) | Animation can start early |
| 5 | Phase 7 (Session UI) | — | Integrate animation |
| 6 | Phase 9 (Routing) | — | — |
| 7 | Phase 10 (History) | — | — |

### Critical Path Analysis

**Critical path** (longest sequential chain):
```
Phase 2 → Phase 3 → Phase 5 → Phase 6 → Phase 7 → Phase 9 → Phase 10
(Types)   (Data)    (Hook)    (Setup)   (Session) (Route)   (History)
```

**Phases that can float** (not on critical path):
- Phase 1 (Assets) — Can start anytime before Phase 3/4, but best to start early
- Phase 4 (Audio) — Parallel with Phase 3
- Phase 8 (Animation) — Parallel with Phase 6/7, just needs integration

### Estimated Effort per Phase

| Phase | Effort | Parallelizable With | Notes |
|-------|--------|---------------------|-------|
| 1. Assets | Small | Phase 2 | Download + script extension |
| 2. Types | Small | Phase 1 | Copy patterns from stretching |
| 3. Data Loader | Medium | Phase 4 | New randomization logic |
| 4. Audio Engine | Small | Phase 3 | Mostly copy from stretching |
| 5. Session Hook | Large | — | Core complexity lives here |
| 6. Setup UI | Small | Phase 8 | Simple duration picker |
| 7. Session UI | Medium | — | Timer + controls + integration |
| 8. Animation | Small | Phase 6, 7 | Pure CSS, standalone |
| 9. Routing | Small | — | Wire up existing components |
| 10. History | Medium | — | DB migration + API + client |

### Recommended Execution Plan

**Option A: Single Developer (Sequential with opportunistic parallelism)**
```
Day 1: Phase 1 + 2 (parallel) → Phase 3 + 4 (parallel)
Day 2: Phase 5 (session hook - largest piece)
Day 3: Phase 6 + 8 (parallel) → Phase 7
Day 4: Phase 9 → Phase 10
```

**Option B: Two Developers**
```
         Developer A              Developer B
Day 1:   Phase 1 (Assets)         Phase 2 (Types)
Day 1:   Phase 3 (Data)           Phase 4 (Audio)
Day 2:   Phase 5 (Hook)           Phase 8 (Animation) + tests
Day 2:   Phase 6 (Setup)          —
Day 3:   Phase 7 (Session)        Integration testing
Day 3:   Phase 9 (Routing)        —
Day 4:   Phase 10 (History)       E2E tests
```

**Option C: Maximum Parallelism (with coordination overhead)**
```
Step 1: [Phase 1] [Phase 2]           — 2 parallel tasks
Step 2: [Phase 3] [Phase 4]           — 2 parallel tasks
Step 3: [Phase 5]                     — 1 task (critical path)
Step 4: [Phase 6] [Phase 8]           — 2 parallel tasks
Step 5: [Phase 7]                     — 1 task
Step 6: [Phase 9]                     — 1 task
Step 7: [Phase 10]                    — 1 task
                                      ─────────────────
                                      7 steps, 11 phases
```

### Validation Gates

After each step, validate before proceeding:

| After Step | Validation |
|------------|------------|
| 1 | `npm run typecheck` passes, audio files exist |
| 2 | Unit tests for data loader + audio engine pass |
| 3 | Hook tests pass, manual test: timer counts down |
| 4 | Setup UI renders, duration selection works |
| 5 | Full session plays through manually |
| 6 | Navigation works, session persists across nav |
| 7 | `npm run validate` passes, E2E tests pass |

---

## Overview

Add a guided breathing meditation feature with pre-generated TTS narration (Kokoro-82M, `af_heart` voice) that guides users through 5, 10, or 20-minute sessions. Each session has three phases: introduction, breathing (with randomly-timed interjections), and closing. A breathing animation provides visual guidance, and the timer is visible when the screen is on. Sessions are tracked for the parallel analytics feature.

---

## Current State Analysis

**What exists (from stretching feature):**
- TTS generation script (`scripts/generate-tts.py`) — extend for meditation
- Audio playback engine (`packages/client/src/utils/stretchAudio.ts`) — copy and adapt
- Timestamp-based timer pattern (`useStretchSession.ts:128-138`) — reuse
- localStorage persistence pattern (`stretchStorage.ts`) — reuse
- MediaSession integration (`stretchAudio.ts:61-73`) — reuse
- Service Worker audio caching (`public/sw.js`) — extend
- Session history persistence pattern (`stretchSession.repository.ts`) — follow

**What's missing:**
- Bell sound assets (meditation-specific, not TTS)
- Meditation TTS scripts generation
- Random interjection timing system
- Breathing animation component
- Duration variant selection (5/10/20 min)
- Meditation-specific types and state machine
- `/meditation` route and UI components

---

## Desired End State

- User navigates to "Meditation" (or accesses from a menu/settings area)
- **Setup screen**: Choose duration (5, 10, or 20 minutes). Simple, calm interface.
- **Start**: Bell sounds, breathing animation begins, intro narration plays
- **Active session**: Shows:
  - Breathing animation (circle expanding/contracting)
  - Timer countdown (visible when screen is on)
  - Minimal controls (Pause/Stop only)
- **Interjections**: During breathing phase, narration cues play at random times within predefined windows. Each session feels different.
- **Completion**: Closing narration, final bell, session summary
- **Tracking**: Records planned duration, actual duration, completion timestamp

---

## What We're NOT Doing

- Background ambient sounds or music mixing
- Haptic/vibration feedback
- Multiple meditation types (just "Basic Breathing" for now)
- Guided body scan (future enhancement)
- Streak counters or gamification (tracked data only)
- Session pause/resume from notification (just in-app controls)

---

## Key Technical Decisions

### Random Interjection System

Each session type defines "interjection windows" — time ranges during the breathing phase where a narration cue can occur. At session start, we:
1. For each window, pick a random time within the range
2. For each window, pick a random audio file from the pool
3. Store as concrete `ScheduledCue[]` for this session instance

```typescript
interface InterjectionWindow {
  earliestSeconds: number;
  latestSeconds: number;
  audioPool: string[];  // e.g., ['breathing-reminder-1.wav', 'breathing-reminder-2.wav']
}

interface ScheduledCue {
  atSeconds: number;    // Randomly chosen within window
  audioFile: string;    // Randomly chosen from pool
}
```

This creates variety: the same 10-minute session plays differently each time.

### Duration Variants

| Duration | Intro | Breathing | Closing | Interjection Windows |
|----------|-------|-----------|---------|---------------------|
| 5 min    | 30s   | 240s      | 30s     | 2 windows |
| 10 min   | 60s   | 480s      | 60s     | 5 windows |
| 20 min   | 60s   | 1080s     | 60s     | 8 windows |

Each variant has its own window configuration stored in the manifest.

### Breathing Animation

A CSS-animated circle that:
- Expands over 4 seconds (inhale)
- Holds for 2 seconds (hold)
- Contracts over 6 seconds (exhale)
- Pauses for 2 seconds (rest)

Total cycle: ~14 seconds. Animation runs via CSS `@keyframes`, not JS, for smooth performance during background.

### Bell Sounds

Downloaded from Freesound.org (CC0 license):
- **Start bell**: Singing bowl strike, ~3-4 seconds
- **End bell**: Same or slightly lower pitch variant

Trimmed and normalized during asset preparation.

### Session Tracking

For the parallel tracking feature, we capture:

```typescript
interface MeditationSessionRecord {
  id: string;                     // Server-generated UUID
  completedAt: string;            // ISO 8601 timestamp
  sessionType: string;            // 'basic-breathing'
  plannedDurationSeconds: number; // 300, 600, or 1200
  actualDurationSeconds: number;  // Wall-clock time
  completedFully: boolean;        // Did they finish vs end early?
}
```

---

## Phase 1: Bell Sound Assets & TTS Generation

### Overview
Download and prepare bell sounds, then extend TTS generation to produce meditation narration clips.

### Changes Required

**Download bell sounds:**
- Source: https://freesound.org/people/zambolino/sounds/439235/ (Singing Bowl, CC0)
- Download WAV, trim to first 3-4 seconds using ffmpeg
- Save as `packages/client/public/audio/meditation/shared/bell.wav`
- Optionally create a second variant with slight pitch shift for end bell

**New file: `thoughts/shared/plans/meditation/basic-breathing.md`**
Define all meditation scripts (used by TTS generator):

```markdown
Basic Breathing Meditation Scripts

## Intro Phase

intro-welcome: Welcome to your meditation practice. Find a comfortable position, either sitting or lying down. You can close your eyes whenever you're ready.

intro-posture: Let your shoulders drop away from your ears. Rest your hands gently in your lap, or by your sides. There's nothing you need to do right now, except be here.
----

## Breathing Phase

breathing-settle: Take a moment to notice how your body feels. You might feel the weight of your body against the surface beneath you. Let yourself settle into this moment. There's nowhere else you need to be.

breathing-rhythm: Now, gently bring your attention to your breath. Don't try to change it. Just notice the natural rhythm of breathing in, and breathing out.

breathing-reminder-1: If your mind has wandered, that's completely normal. Gently guide your attention back to your breath.

breathing-reminder-2: Notice the cool air as you breathe in, and the warm air as you breathe out. Each breath is an anchor to this present moment.

breathing-reminder-3: Let each exhale carry away any tension you're holding. There's nothing to figure out right now.

breathing-midpoint: You're doing beautifully. Continue following your breath, letting thoughts come and go like clouds passing through the sky.

breathing-deepen: With each breath, allow yourself to sink a little deeper into relaxation. Your body knows how to rest. Trust it.
----

## Closing Phase

closing-transition: Begin to let go of focusing on your breath. Allow your awareness to gently expand outward.

closing-awakening: Start to bring gentle movement back to your body. Maybe wiggle your fingers or toes. Take your time. There's no rush.

closing-gratitude: When you're ready, you can open your eyes. Thank you for taking this time for yourself. Carry this sense of calm with you as you continue your day.
----
```

**Modify: `scripts/generate-tts.py`**
- Add meditation script parsing mode
- Parse `thoughts/shared/plans/meditation/*.md`
- Generate clips to `packages/client/public/audio/meditation/sessions/{session-type}/`
- Output `meditation.json` manifest with session definitions and interjection windows

**Modify: `scripts/ensure-tts.sh`**
- Check for both `stretches.json` AND `meditation.json`
- Run meditation generation if manifest missing

**Asset file structure:**
```
packages/client/public/audio/meditation/
├── meditation.json                    # Manifest with session configs
├── shared/
│   ├── bell.wav                       # Start/end bell
│   └── silence-1s.wav                 # Keepalive (can share with stretching)
└── sessions/
    └── basic-breathing/
        ├── intro-welcome.wav
        ├── intro-posture.wav
        ├── breathing-settle.wav
        ├── breathing-rhythm.wav
        ├── breathing-reminder-1.wav
        ├── breathing-reminder-2.wav
        ├── breathing-reminder-3.wav
        ├── breathing-midpoint.wav
        ├── breathing-deepen.wav
        ├── closing-transition.wav
        ├── closing-awakening.wav
        └── closing-gratitude.wav
```

**Total: 12 TTS clips + 1 bell sound = 13 audio files**

### Success Criteria
- [ ] Bell sound downloaded, trimmed, and placed correctly
- [ ] All 12 meditation scripts generate as WAV files
- [ ] `meditation.json` manifest contains session definitions
- [ ] Running `npm run generate:tts` also generates meditation assets
- [ ] Clips are audible and natural-sounding

---

## Phase 2: Shared Types & Constants

### Overview
Define TypeScript types for meditation sessions, phases, interjection windows, and tracking.

### Changes Required

**New file: `packages/shared/src/types/meditation.ts`**
```typescript
export type MeditationDuration = 5 | 10 | 20; // minutes

export interface InterjectionWindow {
  earliestSeconds: number;
  latestSeconds: number;
  audioPool: string[];  // Relative paths to audio files
}

export interface MeditationPhase {
  type: 'intro' | 'breathing' | 'closing';
  durationSeconds: number;
  fixedCues: FixedCue[];           // Cues at specific times
  interjectionWindows?: InterjectionWindow[];  // Only for breathing phase
}

export interface FixedCue {
  atSeconds: number;
  audioFile: string;
}

export interface ScheduledCue {
  atSeconds: number;    // Absolute seconds from session start
  audioFile: string;
  played: boolean;
}

export interface MeditationSessionDefinition {
  id: string;                    // 'basic-breathing'
  name: string;                  // 'Basic Breathing'
  description: string;
  variants: MeditationVariant[];
}

export interface MeditationVariant {
  durationMinutes: MeditationDuration;
  phases: MeditationPhase[];
}

export interface MeditationManifest {
  sessions: MeditationSessionDefinition[];
  shared: {
    bell: string;
    silence: string;
  };
}

export interface MeditationSessionState {
  status: 'idle' | 'active' | 'paused' | 'complete';
  sessionType: string;
  durationMinutes: MeditationDuration;
  sessionStartedAt: number | null;    // Unix timestamp
  pausedAt: number | null;
  pausedElapsed: number;
  scheduledCues: ScheduledCue[];      // Pre-randomized at start
  currentPhaseIndex: number;
}

// --- Session History (persisted to server) ---

export interface MeditationSessionRecord {
  id?: string;                         // Server-generated UUID
  completedAt: string;                 // ISO 8601 timestamp
  sessionType: string;                 // 'basic-breathing'
  plannedDurationSeconds: number;      // 300, 600, or 1200
  actualDurationSeconds: number;       // Wall-clock time
  completedFully: boolean;             // Finished vs ended early
}

export type CreateMeditationSessionRequest = Omit<MeditationSessionRecord, 'id'>;
```

**Modify: `packages/shared/src/types/index.ts`**
- Export from `./meditation`

**New file: `packages/shared/src/schemas/meditation.schema.ts`**
- Zod schema for `CreateMeditationSessionRequest`

### Success Criteria
- [ ] Types compile with `npm run typecheck`
- [ ] `MeditationSessionState` tracks cue scheduling
- [ ] `MeditationSessionRecord` captures planned vs actual duration
- [ ] Schemas validate session creation requests

---

## Phase 3: Meditation Data Loader

### Overview
Create a client-side module that loads the meditation manifest and generates randomized cue schedules.

### Changes Required

**New file: `packages/client/src/utils/meditationData.ts`**
- `loadMeditationManifest(): Promise<MeditationManifest>`
- `getSessionVariant(manifest, sessionType, duration): MeditationVariant`
- `generateScheduledCues(variant: MeditationVariant): ScheduledCue[]`
  - For each phase, add fixed cues at their absolute times
  - For breathing phase, randomize within each interjection window
  - Return sorted array by `atSeconds`
- `getAssetUrl(relativePath: string): string`

**Randomization algorithm:**
```typescript
function generateScheduledCues(variant: MeditationVariant): ScheduledCue[] {
  const cues: ScheduledCue[] = [];
  let phaseStartSeconds = 0;

  for (const phase of variant.phases) {
    // Add fixed cues
    for (const fixed of phase.fixedCues) {
      cues.push({
        atSeconds: phaseStartSeconds + fixed.atSeconds,
        audioFile: fixed.audioFile,
        played: false,
      });
    }

    // Add randomized interjection cues (breathing phase only)
    if (phase.interjectionWindows) {
      for (const window of phase.interjectionWindows) {
        const randomTime = window.earliestSeconds +
          Math.random() * (window.latestSeconds - window.earliestSeconds);
        const randomAudio = window.audioPool[
          Math.floor(Math.random() * window.audioPool.length)
        ];
        cues.push({
          atSeconds: phaseStartSeconds + randomTime,
          audioFile: randomAudio,
          played: false,
        });
      }
    }

    phaseStartSeconds += phase.durationSeconds;
  }

  return cues.sort((a, b) => a.atSeconds - b.atSeconds);
}
```

**New file: `packages/client/src/utils/__tests__/meditationData.test.ts`**
- Tests for manifest loading
- Tests for cue randomization (verify times are within windows)
- Tests for audio pool selection

### Success Criteria
- [ ] Manifest loads and parses correctly
- [ ] `generateScheduledCues()` produces cues within window bounds
- [ ] Each call to `generateScheduledCues()` produces different random times
- [ ] Cues are sorted by time

---

## Phase 4: Audio Playback Engine

### Overview
Create the meditation audio playback module, adapting from stretching but with meditation-specific metadata.

### Changes Required

**New file: `packages/client/src/utils/meditationAudio.ts`**
- Largely copy from `stretchAudio.ts` with meditation-specific changes:
- `initMeditationAudio(): void` — creates audio elements, unlocks playback
- `playNarration(clipPath: string): Promise<void>` — same pattern
- `playBell(): Promise<void>` — plays bell sound
- `startKeepalive() / stopKeepalive()` — same pattern
- `setMediaSessionMetadata(sessionName: string, phase: string): void`
  ```typescript
  navigator.mediaSession.metadata = new MediaMetadata({
    title: sessionName,
    artist: phase,  // e.g., "Introduction", "Breathing", "Closing"
    album: 'Meditation',
  });
  ```

**New file: `packages/client/src/utils/__tests__/meditationAudio.test.ts`**
- Tests mocking `HTMLAudioElement`
- Verify bell playback
- Verify MediaSession metadata format

### Success Criteria
- [ ] Bell sound plays correctly
- [ ] Narration clips play with keepalive management
- [ ] MediaSession shows meditation-specific metadata
- [ ] Background playback works on mobile

---

## Phase 5: Meditation Session Hook & State Machine

### Overview
Create the core `useMeditationSession` hook with randomized cue triggering.

### Changes Required

**New file: `packages/client/src/hooks/useMeditationSession.ts`**

State machine:
```
idle → (start) → active[cues scheduled]
active → (cue time reached) → play cue → continue active
active → (session time ends) → complete
active → (pause) → paused → (resume) → active
active → (end early) → complete (completedFully: false)
```

Core logic:
- On start: call `generateScheduledCues()`, play start bell, start timer
- Timer loop (100ms): check if any unplayed cue's `atSeconds` <= elapsed
- When cue triggers: play audio, mark `played: true`
- Phase transitions are implicit (just different cue timings)
- On complete: play closing cues, end bell, calculate actual duration
- Track `completedFully` based on whether user ended early

**Key difference from stretching**: No segments, no skip controls. Just pause and end.

**New file: `packages/client/src/utils/meditationStorage.ts`**
- `saveMeditationState(state: MeditationSessionState): void`
- `loadMeditationState(): MeditationSessionState | null`
- `clearMeditationState(): void`
- `saveMeditationConfig(duration: MeditationDuration): void`
- `loadMeditationConfig(): MeditationDuration`

**New file: `packages/client/src/hooks/__tests__/useMeditationSession.test.tsx`**
- Tests for state transitions
- Tests for cue triggering at correct times
- Tests for randomized cue schedule generation
- Tests for pause/resume with elapsed time preservation
- Tests for early end tracking

### Success Criteria
- [ ] Session starts with bell and schedules random cues
- [ ] Cues trigger at their scheduled times
- [ ] Each session has different interjection timing
- [ ] Timer continues in background
- [ ] Pause/resume preserves elapsed time
- [ ] `completedFully` correctly tracks early endings
- [ ] Actual duration calculated correctly

---

## Phase 6: Setup Screen UI

### Overview
Build a minimal, calm setup screen for selecting meditation duration.

### Changes Required

**New file: `packages/client/src/components/Meditation/MeditationSetup.tsx`**
- Duration selector: three large buttons or cards for 5/10/20 minutes
- Currently selected duration highlighted
- "Begin Meditation" button
- Calm, muted color scheme
- Optional: show last meditation date

**New file: `packages/client/src/components/Meditation/MeditationSetup.module.css`**
- Calm color palette (muted blues/greens)
- Generous whitespace
- Large, easy-to-tap duration buttons

**New file: `packages/client/src/components/Meditation/index.ts`**
- Barrel exports

### Success Criteria
- [ ] Three duration options clearly displayed
- [ ] Selection persists in localStorage
- [ ] Begin button starts session with selected duration
- [ ] UI feels calm and minimal

---

## Phase 7: Session UI

### Overview
Build the active meditation session view with timer and minimal controls.

### Changes Required

**New file: `packages/client/src/components/Meditation/MeditationSession.tsx`**
- Timer countdown (MM:SS), large and centered
- Timer visible when screen is on (no hide option)
- Breathing animation component (see Phase 8)
- Pause/Resume button
- End Session button (with confirmation)
- Minimal chrome — the animation is the focus

**New file: `packages/client/src/components/Meditation/MeditationSession.module.css`**
- Dark/calm background color
- Large, readable timer
- Centered layout
- Subtle controls at bottom

**New file: `packages/client/src/components/Meditation/MeditationComplete.tsx`**
- Completion message
- Session stats: duration completed, planned duration
- "Done" button returns to setup
- Triggers session record save

### Success Criteria
- [ ] Timer counts down accurately
- [ ] Pause/resume works correctly
- [ ] End confirmation prevents accidental stops
- [ ] Completion screen shows stats
- [ ] UI is calm and uncluttered

---

## Phase 8: Breathing Animation

### Overview
Create a CSS-animated breathing guide circle.

### Changes Required

**New file: `packages/client/src/components/Meditation/BreathingCircle.tsx`**
```tsx
interface BreathingCircleProps {
  isPaused: boolean;
}

export function BreathingCircle({ isPaused }: BreathingCircleProps) {
  return (
    <div className={styles.container}>
      <div
        className={`${styles.circle} ${isPaused ? styles.paused : ''}`}
      />
    </div>
  );
}
```

**New file: `packages/client/src/components/Meditation/BreathingCircle.module.css`**
```css
.container {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 300px;
}

.circle {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  background: radial-gradient(circle, var(--blue-6), var(--blue-9));
  animation: breathe 14s ease-in-out infinite;
}

.circle.paused {
  animation-play-state: paused;
}

@keyframes breathe {
  0%, 100% {
    transform: scale(1);
    opacity: 0.6;
  }
  /* Inhale: 0-28.5% (4s) */
  28.5% {
    transform: scale(1.8);
    opacity: 1;
  }
  /* Hold: 28.5-43% (2s) */
  43% {
    transform: scale(1.8);
    opacity: 1;
  }
  /* Exhale: 43-86% (6s) */
  86% {
    transform: scale(1);
    opacity: 0.6;
  }
  /* Rest: 86-100% (2s) */
}
```

Animation breakdown (14s cycle):
- 0% → 28.5%: Inhale (4s)
- 28.5% → 43%: Hold (2s)
- 43% → 86%: Exhale (6s)
- 86% → 100%: Rest (2s)

**Integration: `MeditationSession.tsx`**
- Render `<BreathingCircle isPaused={isPaused} />` as the main visual element
- Position timer below or overlaid on the circle

### Success Criteria
- [ ] Circle smoothly expands and contracts
- [ ] Animation pauses when session paused
- [ ] Animation resumes smoothly on resume
- [ ] Performance is smooth (pure CSS, no JS animation)
- [ ] Works correctly across browsers

---

## Phase 9: Routing & Navigation

### Overview
Add the `/meditation` route and integrate with the app.

### Changes Required

**Modify: `packages/client/src/components/App.tsx`**
- Add route: `<Route path="/meditation" element={<MeditationPage />} />`

**New file: `packages/client/src/pages/MeditationPage.tsx`**
- Renders `MeditationSetup` when idle
- Renders `MeditationSession` when active/paused
- Renders `MeditationComplete` when complete
- Uses `useMeditationSession` hook
- On mount: loads manifest, checks for saved session
- On start: calls `initMeditationAudio()` on user gesture

**Modify: `packages/client/src/pages/index.ts`**
- Export `MeditationPage`

**Navigation decision**: Either add to bottom nav (if there's room) or make it accessible from a settings/more menu. TBD based on nav bar capacity.

### Success Criteria
- [ ] `/meditation` route renders correctly
- [ ] Navigation to meditation works
- [ ] Active session persists across navigation
- [ ] Manifest loads before session can start

---

## Phase 10: History Persistence

### Overview
Persist completed meditation sessions to the database for the tracking feature.

### Changes Required

**New migration: `packages/server/src/db/migrations/XXX-create-meditation-sessions.ts`**
```sql
CREATE TABLE meditation_sessions (
  id TEXT PRIMARY KEY,
  completed_at TEXT NOT NULL,
  session_type TEXT NOT NULL,
  planned_duration_seconds INTEGER NOT NULL,
  actual_duration_seconds INTEGER NOT NULL,
  completed_fully INTEGER NOT NULL  -- 0 or 1
);
```

**New file: `packages/server/src/repositories/meditationSession.repository.ts`**
- `create(session: CreateMeditationSessionRequest): Promise<MeditationSessionRecord>`
- `getLatest(): Promise<MeditationSessionRecord | null>`
- `getAll(): Promise<MeditationSessionRecord[]>`
- `getStats(): Promise<{ totalSessions: number, totalMinutes: number }>`

**New file: `packages/server/src/routes/meditationSession.routes.ts`**
- `POST /api/meditation-sessions` — create session record
- `GET /api/meditation-sessions/latest` — most recent session
- `GET /api/meditation-sessions` — all sessions
- `GET /api/meditation-sessions/stats` — aggregate stats

**New file: `packages/client/src/hooks/useMeditationHistory.ts`**
- `useLatestMeditationSession()` — React Query hook
- `useSaveMeditationSession()` — React Query mutation
- `useMeditationStats()` — React Query hook for stats

**Modify: `packages/client/src/components/Meditation/MeditationComplete.tsx`**
- On render: save session via `useSaveMeditationSession`
- Include `completedFully`, `plannedDurationSeconds`, `actualDurationSeconds`

### Success Criteria
- [ ] Completing a session persists a record
- [ ] Record includes planned vs actual duration
- [ ] `completedFully` correctly reflects early endings
- [ ] Stats endpoint returns aggregated data
- [ ] Data available for parallel tracking feature

---

## Testing Strategy

### Unit Tests
- `meditationData.ts` — manifest parsing, cue randomization
- `meditationAudio.ts` — playback, bell sound, keepalive
- `useMeditationSession.ts` — state machine, cue triggering, timing
- `meditationStorage.ts` — localStorage operations
- `meditationSession.repository.ts` — CRUD operations
- `MeditationSetup.tsx` — duration selection, persistence
- `MeditationSession.tsx` — timer display, controls
- `BreathingCircle.tsx` — pause state handling

### E2E Tests
- Start 5-minute session, verify timer counts down
- Pause and resume, verify elapsed time preserved
- End early, verify `completedFully: false` recorded
- Complete full session, verify record with correct durations
- Verify breathing animation pauses/resumes

### Manual Testing
- Lock screen: verify timer + audio continue (iOS, Android)
- Verify interjections play at different times each session
- Verify breathing animation is smooth and not jarring
- Verify bell sounds play at start and end
- Test with Spotify playing (audio ducking behavior)

---

## Manifest Structure

**`meditation.json`**:
```json
{
  "sessions": [
    {
      "id": "basic-breathing",
      "name": "Basic Breathing",
      "description": "A gentle breathing meditation to calm your mind.",
      "variants": [
        {
          "durationMinutes": 5,
          "phases": [
            {
              "type": "intro",
              "durationSeconds": 30,
              "fixedCues": [
                { "atSeconds": 0, "audioFile": "sessions/basic-breathing/intro-welcome.wav" }
              ]
            },
            {
              "type": "breathing",
              "durationSeconds": 240,
              "fixedCues": [
                { "atSeconds": 0, "audioFile": "sessions/basic-breathing/breathing-settle.wav" },
                { "atSeconds": 20, "audioFile": "sessions/basic-breathing/breathing-rhythm.wav" }
              ],
              "interjectionWindows": [
                {
                  "earliestSeconds": 80,
                  "latestSeconds": 120,
                  "audioPool": [
                    "sessions/basic-breathing/breathing-reminder-1.wav",
                    "sessions/basic-breathing/breathing-reminder-2.wav",
                    "sessions/basic-breathing/breathing-reminder-3.wav"
                  ]
                },
                {
                  "earliestSeconds": 180,
                  "latestSeconds": 220,
                  "audioPool": [
                    "sessions/basic-breathing/breathing-deepen.wav"
                  ]
                }
              ]
            },
            {
              "type": "closing",
              "durationSeconds": 30,
              "fixedCues": [
                { "atSeconds": 0, "audioFile": "sessions/basic-breathing/closing-transition.wav" },
                { "atSeconds": 15, "audioFile": "sessions/basic-breathing/closing-gratitude.wav" }
              ]
            }
          ]
        },
        {
          "durationMinutes": 10,
          "phases": [
            {
              "type": "intro",
              "durationSeconds": 60,
              "fixedCues": [
                { "atSeconds": 0, "audioFile": "sessions/basic-breathing/intro-welcome.wav" },
                { "atSeconds": 30, "audioFile": "sessions/basic-breathing/intro-posture.wav" }
              ]
            },
            {
              "type": "breathing",
              "durationSeconds": 480,
              "fixedCues": [
                { "atSeconds": 0, "audioFile": "sessions/basic-breathing/breathing-settle.wav" },
                { "atSeconds": 25, "audioFile": "sessions/basic-breathing/breathing-rhythm.wav" }
              ],
              "interjectionWindows": [
                { "earliestSeconds": 60, "latestSeconds": 90, "audioPool": ["sessions/basic-breathing/breathing-reminder-1.wav", "sessions/basic-breathing/breathing-reminder-2.wav", "sessions/basic-breathing/breathing-reminder-3.wav"] },
                { "earliestSeconds": 140, "latestSeconds": 180, "audioPool": ["sessions/basic-breathing/breathing-reminder-1.wav", "sessions/basic-breathing/breathing-reminder-2.wav", "sessions/basic-breathing/breathing-reminder-3.wav"] },
                { "earliestSeconds": 220, "latestSeconds": 260, "audioPool": ["sessions/basic-breathing/breathing-midpoint.wav"] },
                { "earliestSeconds": 320, "latestSeconds": 380, "audioPool": ["sessions/basic-breathing/breathing-reminder-1.wav", "sessions/basic-breathing/breathing-reminder-2.wav", "sessions/basic-breathing/breathing-reminder-3.wav"] },
                { "earliestSeconds": 420, "latestSeconds": 460, "audioPool": ["sessions/basic-breathing/breathing-deepen.wav"] }
              ]
            },
            {
              "type": "closing",
              "durationSeconds": 60,
              "fixedCues": [
                { "atSeconds": 0, "audioFile": "sessions/basic-breathing/closing-transition.wav" },
                { "atSeconds": 20, "audioFile": "sessions/basic-breathing/closing-awakening.wav" },
                { "atSeconds": 40, "audioFile": "sessions/basic-breathing/closing-gratitude.wav" }
              ]
            }
          ]
        },
        {
          "durationMinutes": 20,
          "phases": [
            {
              "type": "intro",
              "durationSeconds": 60,
              "fixedCues": [
                { "atSeconds": 0, "audioFile": "sessions/basic-breathing/intro-welcome.wav" },
                { "atSeconds": 30, "audioFile": "sessions/basic-breathing/intro-posture.wav" }
              ]
            },
            {
              "type": "breathing",
              "durationSeconds": 1080,
              "fixedCues": [
                { "atSeconds": 0, "audioFile": "sessions/basic-breathing/breathing-settle.wav" },
                { "atSeconds": 30, "audioFile": "sessions/basic-breathing/breathing-rhythm.wav" }
              ],
              "interjectionWindows": [
                { "earliestSeconds": 90, "latestSeconds": 130, "audioPool": ["sessions/basic-breathing/breathing-reminder-1.wav", "sessions/basic-breathing/breathing-reminder-2.wav", "sessions/basic-breathing/breathing-reminder-3.wav"] },
                { "earliestSeconds": 200, "latestSeconds": 260, "audioPool": ["sessions/basic-breathing/breathing-reminder-1.wav", "sessions/basic-breathing/breathing-reminder-2.wav", "sessions/basic-breathing/breathing-reminder-3.wav"] },
                { "earliestSeconds": 320, "latestSeconds": 380, "audioPool": ["sessions/basic-breathing/breathing-midpoint.wav"] },
                { "earliestSeconds": 460, "latestSeconds": 540, "audioPool": ["sessions/basic-breathing/breathing-reminder-1.wav", "sessions/basic-breathing/breathing-reminder-2.wav", "sessions/basic-breathing/breathing-reminder-3.wav"] },
                { "earliestSeconds": 620, "latestSeconds": 700, "audioPool": ["sessions/basic-breathing/breathing-deepen.wav"] },
                { "earliestSeconds": 780, "latestSeconds": 860, "audioPool": ["sessions/basic-breathing/breathing-reminder-1.wav", "sessions/basic-breathing/breathing-reminder-2.wav", "sessions/basic-breathing/breathing-reminder-3.wav"] },
                { "earliestSeconds": 920, "latestSeconds": 1000, "audioPool": ["sessions/basic-breathing/breathing-reminder-1.wav", "sessions/basic-breathing/breathing-reminder-2.wav", "sessions/basic-breathing/breathing-reminder-3.wav"] },
                { "earliestSeconds": 1020, "latestSeconds": 1060, "audioPool": ["sessions/basic-breathing/breathing-deepen.wav"] }
              ]
            },
            {
              "type": "closing",
              "durationSeconds": 60,
              "fixedCues": [
                { "atSeconds": 0, "audioFile": "sessions/basic-breathing/closing-transition.wav" },
                { "atSeconds": 20, "audioFile": "sessions/basic-breathing/closing-awakening.wav" },
                { "atSeconds": 40, "audioFile": "sessions/basic-breathing/closing-gratitude.wav" }
              ]
            }
          ]
        }
      ]
    }
  ],
  "shared": {
    "bell": "shared/bell.wav",
    "silence": "shared/silence-1s.wav"
  }
}
```

---

## References

- Stretching feature implementation: `thoughts/shared/plans/2026-01-24-narrated-stretching.md`
- Meditation research: `thoughts/shared/research/2026-01-24-meditation-feature-research.md`
- TTS model decision: `docs/tts-kokoro-decision.md`
- Bell sound source: https://freesound.org/people/zambolino/sounds/439235/
- MediaSession API: https://developer.mozilla.org/en-US/docs/Web/API/MediaSession
