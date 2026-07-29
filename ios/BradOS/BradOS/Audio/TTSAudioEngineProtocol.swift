import Combine
import Foundation

/// Protocol abstraction for on-device speech playback.
protocol TTSAudioEngineProtocol {
    var isPlayingPublisher: AnyPublisher<Bool, Never> { get }
    func play(text: String) async throws
    func stop()
}
