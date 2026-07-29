import AVFoundation
import Combine

/// Plays speech rendered by Apple's on-device speech synthesizer.
final class TTSAudioEngine: ObservableObject {
    @Published var isPlaying: Bool = false
    var isPlayingPublisher: AnyPublisher<Bool, Never> { $isPlaying.eraseToAnyPublisher() }

    private let audioSession = AudioSessionManager.shared
    private let renderer: OnDeviceSpeechRenderer

    init(renderer: OnDeviceSpeechRenderer = .shared) {
        self.renderer = renderer
    }

    /// Render and play local speech with ducking handled by AudioSessionManager.
    func play(text: String) async throws {
        stop()
        isPlaying = true
        defer { isPlaying = false }
        let fileURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension("caf")
        defer { try? FileManager.default.removeItem(at: fileURL) }
        try await renderer.render(text: text, to: fileURL)
        try await audioSession.playNarration(url: fileURL)
    }

    /// Stop current playback
    func stop() {
        audioSession.stopNarration()
        isPlaying = false
    }
}

extension TTSAudioEngine: TTSAudioEngineProtocol {}
