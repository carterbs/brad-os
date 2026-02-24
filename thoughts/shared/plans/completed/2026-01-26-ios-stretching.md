# iOS Native Stretching Feature Implementation Plan

## Overview

Implement the native iOS stretching feature for BradOS, providing a guided stretching session system with configurable body regions, audio narration, Spotify integration, and session history tracking. The feature will match the web PWA's functionality while leveraging native iOS capabilities for a better experience.

## Current State Analysis

### What Exists

**iOS App Structure:**
- Basic `StretchView.swift` at `ios/BradOS/BradOS/Views/Stretch/StretchView.swift:11-590` with:
  - State machine pattern (setup → active → complete) at lines 4-8
  - Simple region selection grid (8 regions) at lines 111-137
  - Basic countdown timer per region (not per segment) at lines 462-479
  - Mock stats on completion screen at lines 538-546
- `StretchSession` model at `ios/BradOS/BradOS/Models/StretchSession.swift` with:
  - `BodyRegion` enum (8 regions with display names and icons) at lines 4-41
  - `StretchRegionConfig` for setup at lines 44-49
  - `StretchSession` for completed sessions at lines 77-102
- Theme system with stretch color (`#14b8a6` teal) at `ios/BradOS/BradOS/Theme/Theme.swift:22`

**Web Reference Implementation:**
- Complete stretching feature at `packages/client/src/pages/StretchPage.tsx`
- Stretch manifest at `packages/client/public/audio/stretching/stretches.json` (8 regions, 39 stretches)
- Audio system at `packages/client/src/utils/stretchAudio.ts`
- Session hook at `packages/client/src/hooks/useStretchSession.ts`
- Server API at `packages/server/src/routes/stretchSession.routes.ts`

### What's Missing

1. **Data Layer** - No manifest loading, no random stretch selection, no individual stretch models
2. **Audio System** - No AVPlayer, AVAudioSession, or narration playback
3. **Segment-Based Timer** - Current timer counts down per region, not per segment (2 segments per stretch)
4. **Lock Screen Controls** - No MPNowPlayingInfoCenter or MPRemoteCommandCenter
5. **Configuration Persistence** - No UserDefaults for region order, durations, Spotify URL
6. **Crash Recovery** - No session state persistence for recovery after app crash/close
7. **Spotify Integration** - No deep-link opening or audio session coordination
8. **API Integration** - No session history saving to server

## Desired End State

A fully functional iOS stretching feature where users can:
1. Configure which body regions to stretch with drag-drop reordering
2. Set per-region duration (1 or 2 minutes)
3. Optionally configure a Spotify playlist URL
4. Start a session that opens Spotify, then begins guided stretching
5. Hear narration at stretch start and segment transitions (Spotify pauses during narration, resumes after)
6. Control session from lock screen (play/pause, skip segment)
7. Skip individual segments or entire stretches
8. Recover interrupted sessions within 1 hour
9. View session history with "Last stretched: Today" display

## Key Discoveries

### Audio Session Behavior (Critical)

The user wants Spotify to **pause during narration and resume after**. On iOS, this is achieved with:

```swift
// Before playing narration - interrupts Spotify
try AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio)
try AVAudioSession.sharedInstance().setActive(true)

// Play narration via AVPlayer...

// After narration finishes - Spotify resumes
try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
```

Key insight: Unlike the web implementation (which uses a keepalive loop), iOS doesn't need continuous audio to maintain background execution. The timer runs via SwiftUI/Combine, and MPNowPlayingInfoCenter works without active audio.

### Manifest Structure

From `packages/client/public/audio/stretching/stretches.json`:
```json
{
  "regions": {
    "back": {
      "stretches": [
        {
          "id": "back-childs-pose",
          "name": "Child's Pose",
          "description": "...",
          "bilateral": false,
          "image": "back/childs-pose.png",
          "audioFiles": { "begin": "back/childs-pose-begin.wav" }
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

### API Endpoint

POST `/api/stretch-sessions` with body:
```json
{
  "completedAt": "2026-01-26T10:30:00.000Z",
  "totalDurationSeconds": 480,
  "regionsCompleted": 4,
  "regionsSkipped": 0,
  "stretches": [
    { "region": "neck", "stretchId": "neck-forward-tilt", "durationSeconds": 60, "skippedSegments": 0 }
  ]
}
```

## What We're NOT Doing

- Image display for stretches (web has optional images, iOS will show icons)
- Detailed stretch history list screen (just "Last stretched" on dashboard)
- Auto-pause after 30 minutes (native iOS handles this differently)
- Complex audio ducking (we'll use clean interrupt/resume pattern)

---

## Implementation Approach

### Phase 1: Data Models & Manifest Loading

**Overview:** Define Swift types matching the manifest structure and load stretches.json at app startup or first stretch page visit.

**Changes Required:**

1. **Create `Stretch.swift`** at `ios/BradOS/BradOS/Models/Stretch.swift`:
   ```swift
   struct Stretch: Codable, Identifiable {
       let id: String
       let name: String
       let description: String
       let bilateral: Bool
       let image: String?
       let audioFiles: AudioFiles

       struct AudioFiles: Codable {
           let begin: String
       }
   }

   struct StretchManifest: Codable {
       let regions: [String: RegionStretches]
       let shared: SharedAudio

       struct RegionStretches: Codable {
           let stretches: [Stretch]
       }

       struct SharedAudio: Codable {
           let switchSides: String
           let halfway: String
           let sessionComplete: String
           let silence: String
       }
   }
   ```

2. **Create `StretchManifestLoader.swift`** at `ios/BradOS/BradOS/Services/StretchManifestLoader.swift`:
   - Load from bundle or fetch from server
   - Cache in memory after first load
   - Provide `func getStretches(for region: BodyRegion) -> [Stretch]`
   - Provide `func selectRandomStretch(for region: BodyRegion) -> Stretch`

3. **Update `StretchSession.swift`** at `ios/BradOS/BradOS/Models/StretchSession.swift`:
   - Add `SelectedStretch` struct matching web's type (region, stretch, durationSeconds, segmentDuration)
   - Add `CompletedStretch` struct with skippedSegments count

**Success Criteria:**
- [ ] `Stretch` and `StretchManifest` types compile and decode test JSON
- [ ] `StretchManifestLoader` loads manifest and returns stretches by region
- [ ] Random selection returns different stretches on repeated calls

**Confirmation Gate:** Manifest loads successfully with all 8 regions and 39 stretches.

---

### Phase 2: Audio System Foundation

**Overview:** Create the audio playback system using AVPlayer with proper session management to interrupt/resume Spotify.

**Changes Required:**

1. **Create `StretchAudioManager.swift`** at `ios/BradOS/BradOS/Services/StretchAudioManager.swift`:
   ```swift
   class StretchAudioManager: ObservableObject {
       private var player: AVPlayer?

       /// Plays narration, interrupting Spotify. Returns when clip finishes.
       func playNarration(_ clipPath: String) async throws {
           // 1. Configure audio session to interrupt other audio
           try AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio)
           try AVAudioSession.sharedInstance().setActive(true)

           // 2. Load and play audio file
           guard let url = Bundle.main.url(forResource: clipPath, withExtension: nil) else {
               throw AudioError.fileNotFound(clipPath)
           }
           player = AVPlayer(url: url)

           // 3. Wait for playback to complete
           await withCheckedContinuation { continuation in
               NotificationCenter.default.addObserver(
                   forName: .AVPlayerItemDidPlayToEndTime,
                   object: player?.currentItem,
                   queue: .main
               ) { _ in
                   continuation.resume()
               }
               player?.play()
           }

           // 4. Deactivate session to let Spotify resume
           try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
       }

       func stopAudio() {
           player?.pause()
           player = nil
           try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
       }
   }
   ```

2. **Add audio files to bundle:**
   - Copy `packages/client/public/audio/stretching/` to `ios/BradOS/BradOS/Resources/Audio/Stretching/`
   - Add to Xcode project with folder reference

3. **Update `Info.plist`** at `ios/BradOS/BradOS/Info.plist`:
   ```xml
   <key>UIBackgroundModes</key>
   <array>
       <string>audio</string>
   </array>
   ```

**Success Criteria:**
- [ ] `playNarration()` plays audio file to completion
- [ ] Spotify pauses when narration starts
- [ ] Spotify resumes when narration finishes
- [ ] Background audio entitlement configured

**Confirmation Gate:** Narration plays correctly with Spotify interrupt/resume behavior verified on device.

---

### Phase 3: Session State Machine

**Overview:** Implement the segment-based timer and session state management matching the web's behavior.

**Changes Required:**

1. **Create `StretchSessionManager.swift`** at `ios/BradOS/BradOS/Services/StretchSessionManager.swift`:
   ```swift
   @Observable
   class StretchSessionManager {
       enum Status { case idle, active, paused, complete }

       var status: Status = .idle
       var currentStretchIndex: Int = 0
       var currentSegment: Int = 1  // 1 or 2
       var segmentRemaining: TimeInterval = 0
       var selectedStretches: [SelectedStretch] = []
       var completedStretches: [CompletedStretch] = []

       private var segmentStartedAt: Date?
       private var pausedElapsed: TimeInterval = 0
       private var timer: Timer?
       private let audioManager: StretchAudioManager

       func start(with config: StretchSessionConfig, stretches: [SelectedStretch]) async {
           selectedStretches = stretches
           currentStretchIndex = 0
           currentSegment = 1
           completedStretches = []

           // Play first stretch narration
           let firstStretch = stretches[0]
           try? await audioManager.playNarration(firstStretch.stretch.audioFiles.begin)

           // Start timer
           segmentStartedAt = Date()
           status = .active
           startTimer()
       }

       private func handleSegmentComplete() async {
           if currentSegment == 1 {
               // Advance to segment 2
               currentSegment = 2
               segmentStartedAt = Date()

               // Play transition narration (non-blocking approach: timer continues)
               let stretch = selectedStretches[currentStretchIndex]
               let clip = stretch.stretch.bilateral ? "shared/switch-sides.wav" : "shared/halfway.wav"
               Task { try? await audioManager.playNarration(clip) }
           } else {
               // Record completed stretch
               completedStretches.append(...)

               if currentStretchIndex == selectedStretches.count - 1 {
                   // Session complete
                   try? await audioManager.playNarration("shared/session-complete.wav")
                   status = .complete
               } else {
                   // Advance to next stretch
                   currentStretchIndex += 1
                   currentSegment = 1
                   segmentStartedAt = Date()

                   let nextStretch = selectedStretches[currentStretchIndex]
                   Task { try? await audioManager.playNarration(nextStretch.stretch.audioFiles.begin) }
               }
           }
       }
   }
   ```

2. **Update `StretchView.swift`** at `ios/BradOS/BradOS/Views/Stretch/StretchView.swift`:
   - Replace local `@State` timer with `StretchSessionManager`
   - Update active view to show current segment (1 or 2) and bilateral labels
   - Add skip segment and skip stretch buttons
   - Show progress dots for completed/current/pending stretches

**Success Criteria:**
- [ ] Timer counts down segment duration (half of region duration)
- [ ] Segment 1 → 2 transition plays correct narration (switch sides vs halfway)
- [ ] Segment 2 completion advances to next stretch or completes session
- [ ] Pause/resume correctly suspends and resumes timer
- [ ] Skip segment advances immediately and records skip
- [ ] Skip stretch marks both segments as skipped

**Confirmation Gate:** Full session runs through all stretches with correct timing and narration.

---

### Phase 4: Lock Screen Controls

**Overview:** Implement MPNowPlayingInfoCenter for lock screen display and MPRemoteCommandCenter for controls.

**Changes Required:**

1. **Extend `StretchSessionManager.swift`**:
   ```swift
   import MediaPlayer

   extension StretchSessionManager {
       func setupNowPlaying() {
           let commandCenter = MPRemoteCommandCenter.shared()

           commandCenter.playCommand.addTarget { [weak self] _ in
               self?.resume()
               return .success
           }

           commandCenter.pauseCommand.addTarget { [weak self] _ in
               self?.pause()
               return .success
           }

           commandCenter.nextTrackCommand.addTarget { [weak self] _ in
               self?.skipSegment()
               return .success
           }
       }

       func updateNowPlayingInfo() {
           guard currentStretchIndex < selectedStretches.count else { return }
           let selected = selectedStretches[currentStretchIndex]

           var info = [String: Any]()
           info[MPMediaItemPropertyTitle] = selected.stretch.name
           info[MPMediaItemPropertyArtist] = "\(selected.region.displayName) - Segment \(currentSegment)/2"
           info[MPMediaItemPropertyAlbumTitle] = "Stretching Session"
           info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = segmentElapsed
           info[MPNowPlayingInfoPropertyPlaybackDuration] = selected.segmentDuration
           info[MPNowPlayingInfoPropertyPlaybackRate] = status == .active ? 1.0 : 0.0

           MPNowPlayingInfoCenter.default().nowPlayingInfo = info
       }

       func clearNowPlaying() {
           MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
       }
   }
   ```

2. **Call updates at appropriate times:**
   - `setupNowPlaying()` on session start
   - `updateNowPlayingInfo()` on segment/stretch change and timer tick
   - `clearNowPlaying()` on session end

**Success Criteria:**
- [ ] Lock screen shows current stretch name and segment
- [ ] Play/pause buttons on lock screen work
- [ ] Next track button skips segment
- [ ] Progress bar reflects segment timing

**Confirmation Gate:** Lock screen controls fully functional on physical device.

---

### Phase 5: Setup Screen Enhancements

**Overview:** Add drag-drop reordering, duration toggling, and Spotify URL configuration.

**Changes Required:**

1. **Update `StretchSetupView`** in `StretchView.swift`:
   - Replace `LazyVGrid` with `List` and `.onMove` modifier for drag-drop
   - Add `@State private var editMode: EditMode = .active` for always-draggable list
   - Update duration badge to toggle between 60/120 on tap
   - Add Spotify URL TextField below region list

2. **Create `StretchConfigStorage.swift`** at `ios/BradOS/BradOS/Services/StretchConfigStorage.swift`:
   ```swift
   class StretchConfigStorage {
       private let defaults = UserDefaults.standard
       private let configKey = "stretch-config"

       func save(_ config: StretchSessionConfig) {
           let encoder = JSONEncoder()
           if let data = try? encoder.encode(config) {
               defaults.set(data, forKey: configKey)
           }
       }

       func load() -> StretchSessionConfig {
           guard let data = defaults.data(forKey: configKey),
                 let config = try? JSONDecoder().decode(StretchSessionConfig.self, from: data) else {
               return .default
           }
           return config
       }
   }
   ```

3. **Spotify deep-link opening:**
   ```swift
   func openSpotifyPlaylist(_ urlString: String) {
       // Convert web URL to deep link
       // https://open.spotify.com/playlist/abc → spotify:playlist:abc
       guard let url = URL(string: urlString),
             let playlistId = url.pathComponents.last else { return }

       let deepLink = URL(string: "spotify:playlist:\(playlistId)")!
       UIApplication.shared.open(deepLink)
   }
   ```

**Success Criteria:**
- [ ] Regions can be reordered via drag-drop
- [ ] Duration badge toggles 1m ↔ 2m on tap
- [ ] Spotify URL persists across app restarts
- [ ] "Start Stretching" opens Spotify if URL configured

**Confirmation Gate:** Configuration persists correctly and Spotify opens on session start.

---

### Phase 6: Crash Recovery

**Overview:** Persist session state to UserDefaults for recovery within 1 hour.

**Changes Required:**

1. **Create `StretchSessionStorage.swift`** at `ios/BradOS/BradOS/Services/StretchSessionStorage.swift`:
   ```swift
   class StretchSessionStorage {
       private let defaults = UserDefaults.standard
       private let stateKey = "stretch-session-state"
       private let staleThreshold: TimeInterval = 60 * 60  // 1 hour

       func save(_ state: StretchSessionState) {
           let encoder = JSONEncoder()
           if let data = try? encoder.encode(state) {
               defaults.set(data, forKey: stateKey)
           }
       }

       func load() -> StretchSessionState? {
           guard let data = defaults.data(forKey: stateKey),
                 let state = try? JSONDecoder().decode(StretchSessionState.self, from: data) else {
               return nil
           }

           // Check staleness
           let timestamp = state.pausedAt ?? state.segmentStartedAt ?? Date.distantPast
           if Date().timeIntervalSince(timestamp) > staleThreshold {
               clear()
               return nil
           }

           return state
       }

       func clear() {
           defaults.removeObject(forKey: stateKey)
       }
   }
   ```

2. **Add recovery prompt to `StretchView.swift`:**
   - Check for saved session on appear
   - Show alert with "Resume" and "Start Over" options
   - Resume restores state to `StretchSessionManager`
   - Start Over clears saved state and shows setup

3. **Save state on every change:**
   - After segment advance
   - After pause/resume
   - After skip

**Success Criteria:**
- [ ] Session state saved to UserDefaults on each change
- [ ] App relaunch within 1 hour shows recovery prompt
- [ ] "Resume" restores exact session position
- [ ] Sessions older than 1 hour silently discarded

**Confirmation Gate:** Kill app mid-session, relaunch, verify recovery works.

---

### Phase 7: API Integration

**Overview:** Save completed sessions to the server and display "Last stretched" on dashboard.

**Changes Required:**

1. **Create `StretchSessionAPI.swift`** at `ios/BradOS/BradOS/Services/StretchSessionAPI.swift`:
   ```swift
   class StretchSessionAPI {
       private let baseURL = URL(string: "http://localhost:3001/api")!  // TODO: Configure properly

       func saveSession(_ record: StretchSessionRecord) async throws {
           var request = URLRequest(url: baseURL.appendingPathComponent("stretch-sessions"))
           request.httpMethod = "POST"
           request.setValue("application/json", forHTTPHeaderField: "Content-Type")
           request.httpBody = try JSONEncoder().encode(record)

           let (_, response) = try await URLSession.shared.data(for: request)
           guard let httpResponse = response as? HTTPURLResponse,
                 httpResponse.statusCode == 201 else {
               throw APIError.saveFailed
           }
       }

       func fetchLatestSession() async throws -> StretchSessionRecord? {
           let url = baseURL.appendingPathComponent("stretch-sessions/latest")
           let (data, _) = try await URLSession.shared.data(from: url)
           let response = try JSONDecoder().decode(APIResponse<StretchSessionRecord?>.self, from: data)
           return response.data
       }
   }
   ```

2. **Update `StretchCompleteView`** to save on appear:
   ```swift
   .task {
       guard !hasSaved else { return }
       hasSaved = true

       let record = StretchSessionRecord(
           completedAt: ISO8601DateFormatter().string(from: Date()),
           totalDurationSeconds: sessionDuration,
           regionsCompleted: completedStretches.filter { $0.skippedSegments < 2 }.count,
           regionsSkipped: completedStretches.filter { $0.skippedSegments == 2 }.count,
           stretches: completedStretches
       )

       try? await api.saveSession(record)
   }
   ```

3. **Update `TodayDashboardView.swift`** to fetch latest session:
   - Add `@State private var lastStretchSession: StretchSessionRecord?`
   - Fetch on appear via `StretchSessionAPI.fetchLatestSession()`
   - Display "Last stretched: Today/Yesterday/X days ago" in stretch quick card

**Success Criteria:**
- [ ] Completed sessions POST to `/api/stretch-sessions`
- [ ] Dashboard fetches and displays latest session timestamp
- [ ] "Last stretched" shows relative date (Today, Yesterday, X days ago)

**Confirmation Gate:** Complete session, verify record in database, verify dashboard displays correctly.

---

### Phase 8: Completion Screen Polish

**Overview:** Finalize the completion screen with accurate stats and proper navigation.

**Changes Required:**

1. **Update `StretchCompleteView`** in `StretchView.swift`:
   - Show actual duration (wall-clock time from start to complete)
   - Show stretches completed vs total
   - Show per-stretch breakdown with skip indicators
   - "Done" returns to dashboard (sets `appState.isShowingStretch = false`)
   - "Start Another Session" returns to setup

2. **Add stretch list with skip status:**
   ```swift
   ForEach(completedStretches, id: \.region) { completed in
       HStack {
           Text(completed.region.displayName)
           Spacer()
           if completed.skippedSegments > 0 {
               Text(completed.skippedSegments == 2 ? "Skipped" : "Partial")
                   .foregroundColor(Theme.statusSkipped)
           } else {
               Image(systemName: "checkmark.circle.fill")
                   .foregroundColor(Theme.statusCompleted)
           }
       }
   }
   ```

**Success Criteria:**
- [ ] Duration shows actual elapsed time
- [ ] Stretch list shows all completed stretches
- [ ] Skip status indicated with appropriate styling
- [ ] Navigation works correctly for both buttons

**Confirmation Gate:** Completion screen displays accurate information and navigation works.

---

## Testing Strategy

### Unit Tests
- `StretchManifest` decoding from JSON
- `StretchConfigStorage` save/load round-trip
- `StretchSessionStorage` staleness calculation
- Timer calculation logic

### Integration Tests
- Audio session interrupt/resume behavior
- UserDefaults persistence across app restarts
- API request/response handling

### Manual Testing
- Full session with Spotify playing (verify interrupt/resume)
- Lock screen controls on physical device
- Kill app mid-session, verify recovery
- Complete session, verify server record
- Drag-drop reorder, verify persistence

## References

- Spec: `ios/specs/stretching.md`
- Web implementation: `packages/client/src/pages/StretchPage.tsx`
- Web session hook: `packages/client/src/hooks/useStretchSession.ts`
- Web audio: `packages/client/src/utils/stretchAudio.ts`
- Manifest: `packages/client/public/audio/stretching/stretches.json`
- Server API: `packages/server/src/routes/stretchSession.routes.ts`
- Existing iOS stretch view: `ios/BradOS/BradOS/Views/Stretch/StretchView.swift`
