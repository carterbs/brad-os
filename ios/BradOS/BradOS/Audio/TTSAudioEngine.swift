import AVFoundation
import Combine

/// Plays MP3 audio data from TTS API responses
final class TTSAudioEngine: ObservableObject {
    @Published var isPlaying: Bool = false
    var isPlayingPublisher: AnyPublisher<Bool, Never> { $isPlaying.eraseToAnyPublisher() }

    private let audioSession = AudioSessionManager.shared

    /// Play MP3 data received from the TTS API (ducking handled by AudioSessionManager)
    func play(data: Data) async throws {
        stop()
        isPlaying = true
        defer { isPlaying = false }
        try await audioSession.playNarration(data: data)
    }

    /// Stop current playback
    func stop() {
        audioSession.stopNarration()
        isPlaying = false
    }
}

extension TTSAudioEngine: TTSAudioEngineProtocol {}
