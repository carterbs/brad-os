import Foundation
import Combine
import BradOSCore

/// View model for the Text to Speech feature
@MainActor
final class TextToSpeechViewModel: ObservableObject {
    enum State {
        case idle
        case generating
        case playing
    }

    @Published var text: String = ""
    @Published var state: State = .idle
    @Published var errorMessage: String?

    private let apiClient: APIClientProtocol
    private let audioEngine = TTSAudioEngine()
    private var cancellables = Set<AnyCancellable>()

    var canPlay: Bool { !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && state == .idle }

    init(apiClient: APIClientProtocol = APIClient.shared) {
        self.apiClient = apiClient

        audioEngine.$isPlaying
            .receive(on: DispatchQueue.main)
            .sink { [weak self] playing in
                guard let self = self else { return }
                if !playing && self.state == .playing {
                    self.state = .idle
                }
            }
            .store(in: &cancellables)
    }

    /// Send text to TTS API and play the returned audio.
    /// - Parameter delaySec: Seconds to wait after generating before playing (for lock screen testing).
    func generateAndPlay(delaySec: Int = 0) {
        guard canPlay else { return }

        errorMessage = nil
        state = .generating

        Task {
            do {
                let audioData = try await apiClient.synthesizeSpeech(text: text)
                if delaySec > 0 {
                    state = .playing // Show "Stop" button during countdown
                    try await Task.sleep(nanoseconds: UInt64(delaySec) * 1_000_000_000)
                }
                try await audioEngine.play(data: audioData)
                state = .playing
            } catch {
                state = .idle
                errorMessage = error.localizedDescription
            }
        }
    }

    /// Stop current playback
    func stop() {
        audioEngine.stop()
        state = .idle
    }
}
