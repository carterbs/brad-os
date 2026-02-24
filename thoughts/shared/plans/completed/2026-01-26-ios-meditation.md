# iOS Meditation Feature Implementation Plan

## Overview

Implement a full meditation feature for the native iOS app matching the spec at `ios/specs/meditation.md`. This includes guided breathing meditation with audio narration cues, background playback support, crash recovery, and API integration for session history.

## Current State Analysis

### What Exists

**MeditationView.swift** (`ios/BradOS/BradOS/Views/Meditation/MeditationView.swift`)
- Three-state session flow (setup → active → complete)
- Duration selection (5, 10, 20 minutes)
- Basic breathing circle animation (but uses 4-4-4 cycle, not spec's 4-2-6-2)
- Countdown timer with pause/resume
- Completion screen with stats

**MeditationSession model** (`ios/BradOS/BradOS/Models/MeditationSession.swift`)
- Codable struct ready for API serialization
- Snake_case CodingKeys for API compatibility

### What's Missing (Per Spec)

| Feature | Status | Notes |
|---------|--------|-------|
| Audio cue system | Not implemented | No AVFoundation code exists |
| Manifest loading | Not implemented | Need to fetch from server |
| Background audio keepalive | Not implemented | Critical for iOS |
| MediaSession lock screen controls | Not implemented | Requires Now Playing integration |
| Crash recovery (UserDefaults) | Not implemented | No persistence layer |
| Stale session detection (1hr) | Not implemented | Part of crash recovery |
| Pause timeout (30min) | Not implemented | Auto-end paused sessions |
| Early end confirmation dialog | Not implemented | Currently ends immediately |
| Correct breathing cycle | Incorrect | Spec: 4-2-6-2 (14s), Current: 4-4-4 (12s) |
| API integration | Not implemented | No networking layer |
| Duration preference persistence | Not implemented | Should remember last selection |

## Desired End State

A fully functional meditation feature where users can:
1. Select 5, 10, or 20 minute sessions (persisted preference)
2. Engage with a breathing circle animation (14-second cycle: inhale 4s → hold 2s → exhale 6s → rest 2s)
3. Hear audio narration cues at scheduled times (intro, closing, bell)
4. Continue meditation with screen locked or app backgrounded
5. Use lock screen controls to pause/resume
6. Recover interrupted sessions after crashes (if < 1 hour old)
7. Have completed sessions saved to server for history

## Key Discoveries

1. **Web implementation** uses manifest-driven audio scheduling with:
   - Fixed cues at predetermined times
   - Randomized interjection windows (currently empty in manifest)
   - Silent keepalive loop to prevent iOS suspension

2. **Audio manifest** at `/audio/meditation/meditation.json`:
   - Phases: intro, breathing, closing
   - Bell plays at session end only
   - Each duration variant has different phase lengths

3. **Existing iOS patterns** to follow:
   - `@State` + `Timer.scheduledTimer` for countdown timers
   - `@EnvironmentObject` for app-wide state
   - Codable models with snake_case CodingKeys

4. **iOS-specific requirements**:
   - Must use AVAudioSession for background audio
   - Must configure audio category as `.playback` with `.mixWithOthers` option
   - Must set up MPNowPlayingInfoCenter for lock screen controls
   - Must use MPRemoteCommandCenter for play/pause handling

## What We're NOT Doing

- Multiple meditation types (only "basic-breathing" exists)
- Interjection audio during breathing phase (manifest has empty windows)
- Custom audio recording/upload
- Offline manifest caching (require network)
- Analytics beyond session completion records

## Implementation Approach

Build features in layers: persistence → audio → integration → polish

---

## Phase 1: Foundation - Persistence & State Management

### Overview
Create the persistence layer for session state and user preferences using UserDefaults. This enables crash recovery and duration preference memory.

### Changes Required

**New File: `ios/BradOS/BradOS/Storage/MeditationStorage.swift`**
```swift
// UserDefaults keys for meditation
// - meditation-session-state: Codable session state for crash recovery
// - meditation-config: User preferences (selected duration)

// Functions:
// - saveMeditationState(_ state: MeditationSessionPersisted)
// - loadMeditationState() -> MeditationSessionPersisted?
// - clearMeditationState()
// - isMeditationSessionStale(_ state: MeditationSessionPersisted) -> Bool
// - saveMeditationConfig(_ config: MeditationConfig)
// - loadMeditationConfig() -> MeditationConfig
```

**New File: `ios/BradOS/BradOS/Models/MeditationState.swift`**
```swift
// Persisted session state (Codable for UserDefaults)
struct MeditationSessionPersisted: Codable {
    var status: MeditationStatus  // idle, active, paused, complete
    var sessionType: String
    var durationMinutes: Int
    var sessionStartedAt: Date?
    var pausedAt: Date?
    var pausedElapsed: TimeInterval  // Seconds accumulated before pause
    var scheduledCues: [ScheduledCue]
    var currentPhaseIndex: Int
}

// Scheduled audio cue
struct ScheduledCue: Codable {
    let atSeconds: Int
    let audioFile: String
    var played: Bool
}

// User configuration
struct MeditationConfig: Codable {
    var duration: Int  // 5, 10, or 20
}

// Constants
let MEDITATION_STALE_THRESHOLD: TimeInterval = 60 * 60  // 1 hour
let MEDITATION_PAUSE_TIMEOUT: TimeInterval = 30 * 60    // 30 minutes
```

**Update: `ios/BradOS/BradOS/Views/Meditation/MeditationView.swift`**
- Load saved duration preference on appear
- Save duration preference when changed
- Check for saved session state on appear
- Show recovery prompt if valid saved session exists

### Success Criteria
- [ ] Duration selection persists across app restarts
- [ ] Session state saves to UserDefaults on start, pause, resume
- [ ] Session state clears on completion or explicit end
- [ ] Stale sessions (>1 hour) are silently discarded
- [ ] Recovery prompt appears when valid saved session exists

### Confirmation Gate
Verify persistence by: starting a session, force-quitting app, reopening to see recovery prompt.

---

## Phase 2: Audio Engine - AVFoundation Integration

### Overview
Build the audio playback system using AVFoundation for narration, bell sounds, and background keepalive. Configure audio session for background playback.

### Changes Required

**New File: `ios/BradOS/BradOS/Audio/MeditationAudioEngine.swift`**
```swift
// Singleton audio engine managing:
// - AVAudioSession configuration
// - Three AVAudioPlayer instances: narration, bell, keepalive
// - Audio file loading from bundle or server
// - Playback state management

class MeditationAudioEngine: NSObject, ObservableObject {
    static let shared = MeditationAudioEngine()

    @Published var isPlaying: Bool = false
    @Published var audioError: Error?

    private var narrationPlayer: AVAudioPlayer?
    private var bellPlayer: AVAudioPlayer?
    private var keepalivePlayer: AVAudioPlayer?

    // Configure audio session for background playback
    func configureAudioSession() throws

    // Initialize players (call during user gesture)
    func initialize() async throws

    // Narration playback
    func playNarration(file: String) async throws
    func stopNarration()

    // Bell sound
    func playBell() async throws

    // Keepalive for background
    func startKeepalive()
    func stopKeepalive()

    // Cleanup
    func teardown()
}
```

**New File: `ios/BradOS/BradOS/Audio/AudioSessionManager.swift`**
```swift
// AVAudioSession configuration wrapper
// - Category: .playback
// - Options: .mixWithOthers, .duckOthers
// - Activation/deactivation
// - Interruption handling
```

**Update: `ios/BradOS/BradOS/Info.plist`**
- Add `UIBackgroundModes` array with `audio` key
- Verify audio session requirements

**Add Audio Assets**
- Copy meditation audio files to app bundle or configure for server download
- Path: `ios/BradOS/BradOS/Resources/Audio/meditation/`
  - `sessions/basic-breathing/intro-welcome.wav`
  - `sessions/basic-breathing/closing.wav`
  - `shared/bell.wav`
  - `shared/silence-1s.wav`

### Success Criteria
- [ ] Audio plays with screen locked
- [ ] Audio continues when app is backgrounded
- [ ] Keepalive prevents audio session suspension
- [ ] Narration and bell play at correct times
- [ ] No audio overlapping (one at a time)
- [ ] Audio stops immediately on pause

### Confirmation Gate
Play a full 5-minute session with audio, lock screen mid-session, verify audio continues and completes.

---

## Phase 3: Now Playing & Lock Screen Controls

### Overview
Integrate with MPNowPlayingInfoCenter and MPRemoteCommandCenter for lock screen controls and media display.

### Changes Required

**New File: `ios/BradOS/BradOS/Audio/NowPlayingManager.swift`**
```swift
// MediaPlayer framework integration
import MediaPlayer

class NowPlayingManager {
    static let shared = NowPlayingManager()

    // Update Now Playing info
    func updateMetadata(
        title: String,        // "Basic Breathing"
        artist: String,       // "Introduction" / "Breathing" / "Closing"
        duration: TimeInterval,
        elapsedTime: TimeInterval
    )

    // Set playback state
    func setPlaybackState(_ state: MPNowPlayingPlaybackState)

    // Register command handlers
    func setupRemoteCommands(
        onPlay: @escaping () -> Void,
        onPause: @escaping () -> Void
    )

    // Clear on session end
    func clear()
}
```

**Update: `ios/BradOS/BradOS/Views/Meditation/MeditationView.swift`**
- Initialize NowPlayingManager when session starts
- Update Now Playing info when phase changes
- Register pause/play command handlers linked to session state
- Clear Now Playing on session end

### Success Criteria
- [ ] Lock screen shows "Basic Breathing" with correct phase
- [ ] Pause button on lock screen pauses session
- [ ] Play button on lock screen resumes session
- [ ] Elapsed time updates on lock screen
- [ ] Now Playing clears when session ends

### Confirmation Gate
Start session, lock screen, verify controls work and display is correct.

---

## Phase 4: Breathing Animation & Timer Fixes

### Overview
Update the breathing animation to match the spec's 14-second cycle and implement timestamp-based timer for background resilience.

### Changes Required

**Update: `ios/BradOS/BradOS/Views/Meditation/MeditationView.swift`**

Fix breathing cycle (lines 11-23):
```swift
enum BreathingPhase: String {
    case inhale = "Inhale"
    case hold = "Hold"
    case exhale = "Exhale"
    case rest = "Rest"  // ADD rest phase

    var duration: Double {
        switch self {
        case .inhale: return 4.0
        case .hold: return 2.0    // Change from 4.0
        case .exhale: return 6.0  // Change from 4.0
        case .rest: return 2.0    // Add rest
        }
    }
}
```

Fix animation sizes/opacity (lines 315-324):
```swift
// Per spec:
// Inhale: scale 1→1.8, opacity 0.6→1.0
// Hold: scale 1.8, opacity 1.0
// Exhale: scale 1.8→1, opacity 1.0→0.6
// Rest: scale 1, opacity 0.6
```

Convert timer to timestamp-based:
```swift
// Instead of decrementing counter, calculate from timestamp:
// elapsed = Date().timeIntervalSince(sessionStartedAt) - pausedElapsed
// remaining = totalDuration - elapsed
```

Add visibility/background handling:
```swift
// Use @Environment(\.scenePhase) to detect backgrounding
// Recalculate time on foreground return
```

### Success Criteria
- [ ] Breathing cycle is exactly 14 seconds (4+2+6+2)
- [ ] Circle scale matches spec (1→1.8→1.8→1→1)
- [ ] Circle opacity matches spec (0.6→1.0→1.0→0.6→0.6)
- [ ] Timer is accurate after returning from background
- [ ] Timer continues counting while backgrounded

### Confirmation Gate
Run session, verify cycle timing with stopwatch, background app for 1 minute, verify timer caught up on return.

---

## Phase 5: Audio Cue Scheduling

### Overview
Implement manifest-driven audio cue scheduling to play narration at the correct times during the session.

### Changes Required

**New File: `ios/BradOS/BradOS/Models/MeditationManifest.swift`**
```swift
// Decodable structures matching meditation.json
struct MeditationManifest: Codable {
    let sessions: [MeditationSessionDefinition]
    let shared: SharedAudio
}

struct MeditationSessionDefinition: Codable {
    let id: String
    let name: String
    let description: String
    let variants: [MeditationVariant]
}

struct MeditationVariant: Codable {
    let durationMinutes: Int
    let phases: [MeditationPhase]
}

struct MeditationPhase: Codable {
    let type: String  // "intro", "breathing", "closing"
    let durationSeconds: Int
    let fixedCues: [FixedCue]
    let interjectionWindows: [InterjectionWindow]?
}

struct FixedCue: Codable {
    let atSeconds: Int
    let audioFile: String
}

struct InterjectionWindow: Codable {
    let earliestSeconds: Int
    let latestSeconds: Int
    let audioPool: [String]
}

struct SharedAudio: Codable {
    let bell: String
    let silence: String
}
```

**New File: `ios/BradOS/BradOS/Services/MeditationManifestService.swift`**
```swift
// Load manifest from bundle or server
// Generate scheduled cues with randomized interjections
// Calculate absolute timestamps for each cue

class MeditationManifestService {
    func loadManifest() async throws -> MeditationManifest

    func generateScheduledCues(
        for variant: MeditationVariant
    ) -> [ScheduledCue]

    func getVariant(
        sessionId: String,
        duration: Int,
        from manifest: MeditationManifest
    ) -> MeditationVariant?
}
```

**Update: `ios/BradOS/BradOS/Views/Meditation/MeditationView.swift`**
- Load manifest on setup screen appear
- Generate cue schedule when session starts
- Check for pending cues every 100ms during active session
- Play cues sequentially (no overlap)
- Mark cues as played in persisted state
- Play bell on full completion

### Success Criteria
- [ ] Manifest loads successfully from bundle/server
- [ ] Intro cue plays at session start
- [ ] Closing cue plays at correct time
- [ ] Bell plays when session completes fully
- [ ] No audio plays if ended early
- [ ] Cues resume correctly after crash recovery

### Confirmation Gate
Run full 5-minute session, verify intro/closing/bell audio timing with stopwatch.

---

## Phase 6: Session Lifecycle Refinements

### Overview
Add remaining spec features: pause timeout, early end confirmation, proper audio cleanup.

### Changes Required

**Update: `ios/BradOS/BradOS/Views/Meditation/MeditationView.swift`**

Add pause timeout:
```swift
// When paused, start 30-minute timeout timer
// Auto-end session and clear state if timeout reached
// Cancel timeout timer on resume
```

Add end confirmation dialog:
```swift
// Show confirmation alert when user taps End
// Options: "End Session" (confirm) / "Cancel"
// Don't end immediately on tap
```

Add proper audio cleanup:
```swift
// On end/complete:
// - Stop all audio immediately
// - Stop keepalive
// - Clear Now Playing
// - Deactivate audio session
```

Add audio error handling:
```swift
// Show error overlay if audio fails to load/play
// Options: "Retry" / "Skip"
// Continue session even if audio fails
```

### Success Criteria
- [ ] Paused sessions auto-end after 30 minutes
- [ ] End button shows confirmation dialog
- [ ] Cancel in dialog keeps session running
- [ ] All audio stops immediately on end
- [ ] Audio errors show recoverable UI

### Confirmation Gate
Test pause timeout (can use shorter duration for testing), verify confirmation dialog works.

---

## Phase 7: API Integration

### Overview
Implement networking layer to save completed sessions and fetch history from server.

### Changes Required

**New File: `ios/BradOS/BradOS/Services/APIClient.swift`**
```swift
// Generic API client for server communication
// Base URL from environment/config
// JSON encoding/decoding
// Error handling

class APIClient {
    static let shared = APIClient()

    func get<T: Decodable>(_ path: String) async throws -> T
    func post<T: Encodable, R: Decodable>(_ path: String, body: T) async throws -> R
}
```

**New File: `ios/BradOS/BradOS/Services/MeditationAPIService.swift`**
```swift
// Meditation-specific API calls
class MeditationAPIService {
    // POST /api/meditation-sessions
    func createSession(_ session: MeditationSession) async throws -> MeditationSession

    // GET /api/meditation-sessions/latest
    func getLatestSession() async throws -> MeditationSession?

    // GET /api/meditation-sessions/stats
    func getStats() async throws -> MeditationStats
}

struct MeditationStats: Codable {
    let totalSessions: Int
    let totalMinutes: Int
}
```

**Update: `ios/BradOS/BradOS/Views/Meditation/MeditationView.swift`**
- Save session to server on completion
- Fetch latest session on setup screen appear
- Show "Last meditated: X days ago" from API data

### Success Criteria
- [ ] Completed sessions POST to /api/meditation-sessions
- [ ] Latest session fetches on setup screen load
- [ ] Last session date displays correctly
- [ ] Network errors don't crash app (graceful handling)
- [ ] Offline sessions queue for later upload (stretch goal)

### Confirmation Gate
Complete a session, verify it appears in server database, verify it shows in web app history.

---

## Phase 8: Polish & Edge Cases

### Overview
Handle edge cases, improve UX, and ensure robustness.

### Changes Required

**Edge Cases**
- Phone call during session (audio interruption)
- Bluetooth device disconnect
- Low battery / thermal throttling
- Multiple rapid pause/resume
- App termination while paused
- Session completion while backgrounded

**UX Improvements**
- Haptic feedback on pause/resume
- Subtle animation when breathing phase changes
- Progress indicator showing session progress
- Smooth transitions between setup/active/complete

**Accessibility**
- VoiceOver support for breathing phases
- Reduce Motion support (disable circle animation)
- Dynamic Type for timer display

### Success Criteria
- [ ] Phone call pauses session, resumes after
- [ ] App handles all interruption types gracefully
- [ ] VoiceOver announces phase changes
- [ ] Reduce Motion users see static breathing indicator
- [ ] All text scales with Dynamic Type

### Confirmation Gate
Test with VoiceOver enabled, test with phone call interruption, test with Reduce Motion enabled.

---

## Testing Strategy

### Unit Tests
- MeditationStorage: save/load/clear/stale detection
- MeditationManifestService: manifest parsing, cue generation
- Timer calculations: elapsed time, remaining time

### Integration Tests
- Full session flow: start → pause → resume → complete
- Crash recovery: save state → restart → recover
- Audio playback: cue timing accuracy

### Manual Testing Checklist
- [ ] 5-minute session completes with all audio
- [ ] 10-minute session completes with all audio
- [ ] 20-minute session completes with all audio
- [ ] Screen lock continues audio
- [ ] Background app continues audio
- [ ] Lock screen controls work
- [ ] Early end saves partial session
- [ ] Crash recovery works within 1 hour
- [ ] Stale sessions (>1hr) are discarded
- [ ] 30-minute pause timeout ends session
- [ ] Duration preference persists

## References

- **Spec**: `ios/specs/meditation.md`
- **Web implementation**: `packages/client/src/hooks/useMeditationSession.ts`
- **Audio engine**: `packages/client/src/utils/meditationAudio.ts`
- **Storage**: `packages/client/src/utils/meditationStorage.ts`
- **Manifest**: `packages/client/public/audio/meditation/meditation.json`
- **API routes**: `packages/server/src/routes/meditationSession.routes.ts`
- **Existing iOS view**: `ios/BradOS/BradOS/Views/Meditation/MeditationView.swift`

## File Summary

### New Files
| File | Purpose |
|------|---------|
| `Storage/MeditationStorage.swift` | UserDefaults persistence |
| `Models/MeditationState.swift` | Persisted session state types |
| `Models/MeditationManifest.swift` | Manifest Codable types |
| `Audio/MeditationAudioEngine.swift` | AVFoundation audio playback |
| `Audio/AudioSessionManager.swift` | Audio session configuration |
| `Audio/NowPlayingManager.swift` | Lock screen controls |
| `Services/MeditationManifestService.swift` | Manifest loading & cue generation |
| `Services/APIClient.swift` | Generic HTTP client |
| `Services/MeditationAPIService.swift` | Meditation API calls |

### Modified Files
| File | Changes |
|------|---------|
| `Views/Meditation/MeditationView.swift` | Major refactor for all features |
| `Models/MeditationSession.swift` | Add computed properties |
| `Info.plist` | Add background audio mode |

### Asset Files
| File | Purpose |
|------|---------|
| `Resources/Audio/meditation/...` | Audio files (or server download) |
