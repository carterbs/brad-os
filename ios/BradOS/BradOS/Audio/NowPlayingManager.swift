import MediaPlayer

/// Manages lock screen Now Playing info and remote command center controls
final class NowPlayingManager {
    static let shared = NowPlayingManager()

    private let nowPlayingInfo = MPNowPlayingInfoCenter.default()
    private let commandCenter = MPRemoteCommandCenter.shared()

    /// Callbacks for remote commands
    private var onPlay: (() -> Void)?
    private var onPause: (() -> Void)?

    private init() {}

    // MARK: - Metadata

    /// Update the Now Playing info displayed on lock screen and Control Center
    func updateMetadata(
        title: String,
        phase: String,
        duration: TimeInterval,
        elapsedTime: TimeInterval,
        isPlaying: Bool
    ) {
        var info: [String: Any] = [
            MPMediaItemPropertyTitle: title,
            MPMediaItemPropertyArtist: phase,
            MPMediaItemPropertyAlbumTitle: "Meditation",
            MPMediaItemPropertyPlaybackDuration: duration,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: elapsedTime,
            MPNowPlayingInfoPropertyPlaybackRate: isPlaying ? 1.0 : 0.0
        ]

        // Add artwork if available
        if let image = UIImage(systemName: "brain.head.profile") {
            let artwork = MPMediaItemArtwork(boundsSize: CGSize(width: 300, height: 300)) { _ in
                // Create a simple colored image with the icon
                let renderer = UIGraphicsImageRenderer(size: CGSize(width: 300, height: 300))
                return renderer.image { context in
                    // Background
                    UIColor(Theme.meditation).setFill()
                    context.fill(CGRect(x: 0, y: 0, width: 300, height: 300))

                    // Icon (centered)
                    let iconSize: CGFloat = 150
                    let iconRect = CGRect(
                        x: (300 - iconSize) / 2,
                        y: (300 - iconSize) / 2,
                        width: iconSize,
                        height: iconSize
                    )
                    if let icon = UIImage(systemName: "brain.head.profile")?
                        .withTintColor(.white, renderingMode: .alwaysOriginal) {
                        icon.draw(in: iconRect)
                    }
                }
            }
            info[MPMediaItemPropertyArtwork] = artwork
        }

        nowPlayingInfo.nowPlayingInfo = info
    }

    /// Update just the playback state (for quick pause/resume updates)
    func updatePlaybackState(isPlaying: Bool, elapsedTime: TimeInterval) {
        var info = nowPlayingInfo.nowPlayingInfo ?? [:]
        info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = elapsedTime
        info[MPNowPlayingInfoPropertyPlaybackRate] = isPlaying ? 1.0 : 0.0
        nowPlayingInfo.nowPlayingInfo = info
    }

    // MARK: - Remote Commands

    /// Setup remote command handlers for lock screen play/pause
    func setupRemoteCommands(
        onPlay: @escaping () -> Void,
        onPause: @escaping () -> Void
    ) {
        self.onPlay = onPlay
        self.onPause = onPause

        // Enable play command
        commandCenter.playCommand.isEnabled = true
        commandCenter.playCommand.addTarget { [weak self] _ in
            self?.onPlay?()
            return .success
        }

        // Enable pause command
        commandCenter.pauseCommand.isEnabled = true
        commandCenter.pauseCommand.addTarget { [weak self] _ in
            self?.onPause?()
            return .success
        }

        // Enable toggle play/pause command (headphone button)
        commandCenter.togglePlayPauseCommand.isEnabled = true
        commandCenter.togglePlayPauseCommand.addTarget { [weak self] _ in
            // Determine current state from Now Playing info
            if let info = self?.nowPlayingInfo.nowPlayingInfo,
               let rate = info[MPNowPlayingInfoPropertyPlaybackRate] as? Double,
               rate > 0 {
                self?.onPause?()
            } else {
                self?.onPlay?()
            }
            return .success
        }

        // Disable unsupported commands
        commandCenter.nextTrackCommand.isEnabled = false
        commandCenter.previousTrackCommand.isEnabled = false
        commandCenter.seekForwardCommand.isEnabled = false
        commandCenter.seekBackwardCommand.isEnabled = false
        commandCenter.skipForwardCommand.isEnabled = false
        commandCenter.skipBackwardCommand.isEnabled = false
        commandCenter.changePlaybackPositionCommand.isEnabled = false
    }

    /// Remove remote command handlers
    func removeRemoteCommands() {
        commandCenter.playCommand.removeTarget(nil)
        commandCenter.pauseCommand.removeTarget(nil)
        commandCenter.togglePlayPauseCommand.removeTarget(nil)
        onPlay = nil
        onPause = nil
    }

    // MARK: - Cleanup

    /// Clear all Now Playing info (call when session ends)
    func clear() {
        nowPlayingInfo.nowPlayingInfo = nil
        removeRemoteCommands()
    }
}
