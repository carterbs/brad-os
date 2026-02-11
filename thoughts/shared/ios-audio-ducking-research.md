# iOS Audio Ducking Research

## Summary

Navigation-style apps manage audio ducking through AVAudioSession with specific category/mode/option combinations. The key pattern: activate with `.duckOthers` before playing announcements, deactivate with `.notifyOthersOnDeactivation` after, to restore other apps' volume.

## Our Implementation (AudioSessionManager.swift)

All audio session management is centralized in `AudioSessionManager.shared`. No other file should call `AVAudioSession.sharedInstance()` directly.

### Two Audio Modes

**Normal (between narration):**
```swift
category: .playback, mode: .default, options: [.mixWithOthers]
```
- Plays alongside other audio at full volume
- Keeps audio session alive for background/lock screen

**Ducking (during narration):**
```swift
category: .playback, mode: .voicePrompt, options: [.duckOthers, .interruptSpokenAudioAndMixWithOthers]
```
- `.duckOthers` - lowers music volume (~20-30%) during our narration
- `.interruptSpokenAudioAndMixWithOthers` - PAUSES podcasts/audiobooks (instead of garbling them under our narration) while still ducking music
- `.voicePrompt` mode - tells iOS this is navigation-style spoken content

### Ducking Lifecycle

```
1. Check session.isOtherAudioPlaying
2. If true: enableDucking() -> setCategory(.voicePrompt, .duckOthers) -> setActive(true)
3. Play narration via AVPlayer
4. On completion: restore
   - backgroundSafe=true:  setCategory(.default, .mixWithOthers) [no deactivation, keeps keepalive alive]
   - backgroundSafe=false: setActive(false, .notifyOthersOnDeactivation) -> wait -> setCategory -> setActive(true)
```

### Two Restore Strategies

**backgroundSafe (meditation/stretching with keepalive):**
- Just swaps category options to remove `.duckOthers`
- Does NOT deactivate the session (that would kill the keepalive player)
- Some older apps may not restore volume without deactivation notification

**non-backgroundSafe (TTS, one-off narration):**
- Deactivates session with `.notifyOthersOnDeactivation`
- Polls `isOtherAudioPlaying` for up to 1s to let other apps resume
- Reactivates with `.mixWithOthers`

## Required Permissions

**Info.plist / project.yml:**
```xml
<key>UIBackgroundModes</key>
<array>
    <string>audio</string>
</array>
```

No other entitlements needed. The `.playback` category + background mode enables lock-screen audio.

## What Each Option Does

| Option | Effect |
|--------|--------|
| `.playback` category | Audio continues when screen locks and Ring/Silent switch is on |
| `.voicePrompt` mode | Optimized for navigation-style TTS |
| `.duckOthers` | System reduces other app volume during our playback |
| `.interruptSpokenAudioAndMixWithOthers` | Pauses podcasts/audiobooks, ducks music |
| `.mixWithOthers` | Allows simultaneous playback (our keepalive + Spotify) |
| `.notifyOthersOnDeactivation` | Tells other apps to restore volume when we deactivate |

## Common Pitfalls (from research)

1. **Volume never restores** - Forgetting `.notifyOthersOnDeactivation` or never calling `setActive(false)`. Must deactivate in both success AND error paths.

2. **Removing `.mixWithOthers`** from the restore path causes our app to steal exclusive audio focus, killing Spotify/Music.

3. **Calling `setActive(false)` during backgroundSafe mode** kills the keepalive player, audio stops on lock screen.

4. **Bypassing AudioSessionManager** (direct `AVAudioSession.sharedInstance()` calls from views/services) creates session conflicts where one component's config overwrites another's.

5. **Race conditions with rapid announcements** - Queue announcements and only deactivate after the last one finishes.

6. **iOS Simulator limitation** - `isOtherAudioPlaying` does not detect Safari/Music audio on the simulator. Use the Force Ducking toggle in the debug harness (Profile > TTS) to exercise the ducking code path on simulator.

## Debug Harness

Located in `TextToSpeechView.swift` (DEBUG builds only), at Profile > Text to Speech:

- **Force Ducking toggle** - exercises ducking code path without external audio
- **Playback Delay** - set 10-15s, tap Play, lock screen to test background playback
- **Event Log** - real-time timestamped log of every ducking lifecycle event
- **Audio Session State** - live `isOtherAudioPlaying` and `secondaryAudioShouldBeSilencedHint` indicators

## Sources

- [Apple WWDC20: Create a seamless speech experience](https://developer.apple.com/videos/play/wwdc2020/10022/)
- [Mapbox Navigation iOS - ducking implementation](https://github.com/mapbox/mapbox-navigation-ios/issues/1864)
- [Igor Kulman: Correctly playing audio in iOS](https://blog.kulman.sk/correctly-playing-audio-in-ios-apps/)
- [Apple: AVAudioSession duckOthers](https://developer.apple.com/documentation/avfaudio/avaudiosession/categoryoptions-swift.struct/duckothers)
- [Apple: voicePrompt mode](https://developer.apple.com/documentation/avfaudio/avaudiosession/mode/2962803-voiceprompt)
- [Apple: interruptSpokenAudioAndMixWithOthers](https://developer.apple.com/documentation/avfaudio/avaudiosession/categoryoptions/1616534-interruptspokenaudioandmixwithot)
