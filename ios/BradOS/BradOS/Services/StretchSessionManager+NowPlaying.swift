import Foundation
import Combine
import MediaPlayer
import BradOSCore

// MARK: - Now Playing / Lock Screen Controls

extension StretchSessionManager {
    /// Setup remote command center for lock screen controls
    func setupRemoteCommandCenter() {
        let commandCenter = MPRemoteCommandCenter.shared()

        commandCenter.playCommand.addTarget { [weak self] _ in
            Task { @MainActor in self?.resume() }
            return .success
        }

        commandCenter.pauseCommand.addTarget { [weak self] _ in
            Task { @MainActor in self?.pause() }
            return .success
        }

        commandCenter.togglePlayPauseCommand.addTarget { [weak self] _ in
            Task { @MainActor in
                guard let self = self else { return }
                if self.status == .paused {
                    self.resume()
                } else if self.status == .active {
                    self.pause()
                }
            }
            return .success
        }

        commandCenter.nextTrackCommand.addTarget { [weak self] _ in
            Task { @MainActor in self?.skipSegment() }
            return .success
        }

        commandCenter.previousTrackCommand.isEnabled = false
        commandCenter.skipForwardCommand.isEnabled = false
        commandCenter.skipBackwardCommand.isEnabled = false
        commandCenter.seekForwardCommand.isEnabled = false
        commandCenter.seekBackwardCommand.isEnabled = false
    }

    /// Start periodic updates of Now Playing info for elapsed time
    func startNowPlayingUpdates() {
        nowPlayingUpdateTimer?.cancel()
        nowPlayingUpdateTimer = Timer.publish(every: 1.0, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] _ in
                self?.updateNowPlayingInfo()
            }
    }

    /// Update the Now Playing info center with current stretch info
    func updateNowPlayingInfo() {
        guard let selected = currentSelectedStretch else {
            clearNowPlayingInfo()
            return
        }

        var info = [String: Any]()
        info[MPMediaItemPropertyTitle] = selected.definition.name

        let segmentLabel = selected.definition.bilateral
            ? (currentSegment == 1 ? "Left Side" : "Right Side")
            : (currentSegment == 1 ? "First Half" : "Second Half")
        info[MPMediaItemPropertyArtist] = "\(selected.region.displayName) - \(segmentLabel)"
        info[MPMediaItemPropertyAlbumTitle] = "Stretching Session"

        info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = segmentElapsed
        info[MPMediaItemPropertyPlaybackDuration] = segmentDuration
        info[MPNowPlayingInfoPropertyPlaybackRate] = status == .active ? 1.0 : 0.0
        info[MPNowPlayingInfoPropertyDefaultPlaybackRate] = 1.0

        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }

    /// Clear the Now Playing info
    func clearNowPlayingInfo() {
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    }
}

// MARK: - Persistable State

/// State that can be persisted for crash recovery
struct StretchSessionPersistableState: Codable {
    let selectedStretches: [SelectedStretch]
    let currentStretchIndex: Int
    let currentSegment: Int
    let segmentRemaining: TimeInterval
    let completedStretches: [CompletedStretch]
    let skippedSegments: [String: Int]
    let sessionStartTime: Date?
    let pausedAt: Date?
}
