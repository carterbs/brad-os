import Combine
import Foundation

/// Protocol abstraction for TTS audio playback.
protocol TTSAudioEngineProtocol {
    var isPlayingPublisher: AnyPublisher<Bool, Never> { get }
    func play(data: Data) async throws
    func stop()
}
