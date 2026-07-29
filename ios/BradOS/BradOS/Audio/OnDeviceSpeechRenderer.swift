import AVFoundation
import Foundation

/// Renders Apple's on-device speech into a local CAF file for the app's existing
/// timed playback pipelines. No text or audio leaves the device.
@MainActor
final class OnDeviceSpeechRenderer: NSObject {
    static let shared = OnDeviceSpeechRenderer()

    private let synthesizer = AVSpeechSynthesizer()

    func render(text: String, to fileURL: URL) async throws {
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw OnDeviceSpeechError.emptyText
        }

        try? FileManager.default.removeItem(at: fileURL)
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = preferredVoice
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate

        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            var outputFile: AVAudioFile?
            var renderingError: Error?

            synthesizer.write(utterance) { buffer in
                guard let pcmBuffer = buffer as? AVAudioPCMBuffer else { return }

                if pcmBuffer.frameLength == 0 {
                    if let renderingError {
                        continuation.resume(throwing: renderingError)
                    } else if outputFile == nil {
                        continuation.resume(throwing: OnDeviceSpeechError.noAudioProduced)
                    } else {
                        continuation.resume()
                    }
                    return
                }

                do {
                    if outputFile == nil {
                        outputFile = try AVAudioFile(
                            forWriting: fileURL,
                            settings: pcmBuffer.format.settings,
                            commonFormat: pcmBuffer.format.commonFormat,
                            interleaved: pcmBuffer.format.isInterleaved
                        )
                    }
                    try outputFile?.write(from: pcmBuffer)
                } catch {
                    renderingError = error
                }
            }
        }
    }

    private var preferredVoice: AVSpeechSynthesisVoice? {
        let voices = AVSpeechSynthesisVoice.speechVoices()
        return voices.first { $0.language == "en-US" && $0.quality == .enhanced }
            ?? voices.first { $0.language == "en-US" }
            ?? AVSpeechSynthesisVoice(language: "en-US")
    }
}

enum OnDeviceSpeechError: LocalizedError {
    case emptyText
    case noAudioProduced

    var errorDescription: String? {
        switch self {
        case .emptyText:
            return "Enter text to speak aloud."
        case .noAudioProduced:
            return "The selected on-device voice could not produce audio."
        }
    }
}
