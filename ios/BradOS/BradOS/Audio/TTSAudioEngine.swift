import AVFoundation
import Combine

/// Plays MP3 audio data from TTS API responses
final class TTSAudioEngine: NSObject, ObservableObject {
    @Published var isPlaying: Bool = false

    private var player: AVAudioPlayer?
    private let audioSession = AudioSessionManager.shared

    override init() {
        super.init()
    }

    /// Play MP3 data received from the TTS API
    func play(data: Data) throws {
        stop()

        try audioSession.activate()

        player = try AVAudioPlayer(data: data)
        player?.delegate = self
        player?.prepareToPlay()
        player?.play()
        isPlaying = true
    }

    /// Stop current playback
    func stop() {
        player?.stop()
        player = nil
        isPlaying = false
    }
}

// MARK: - AVAudioPlayerDelegate

extension TTSAudioEngine: AVAudioPlayerDelegate {
    func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        DispatchQueue.main.async { [weak self] in
            self?.isPlaying = false
            self?.player = nil
        }
    }

    func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) {
        DispatchQueue.main.async { [weak self] in
            self?.isPlaying = false
            self?.player = nil
            if let error = error {
                print("[TTSAudioEngine] Decode error: \(error.localizedDescription)")
            }
        }
    }
}
