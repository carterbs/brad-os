import Foundation
import AVFoundation

/// Generates silent WAV audio files of exact durations for use as spacers in AVQueuePlayer
final class SilenceGenerator {

    /// Generate a silent WAV file of the specified duration
    /// - Parameters:
    ///   - duration: Duration in seconds
    ///   - sampleRate: Sample rate (default 8000 Hz for small file size)
    /// - Returns: URL to the generated WAV file in temp directory
    static func generateSilence(duration: TimeInterval, sampleRate: Double = 8000) throws -> URL {
        // Check if we already generated this exact duration
        let filename = String(format: "silence-%.1f.wav", duration)
        let tempDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("meditation-silence", isDirectory: true)
        try? FileManager.default.createDirectory(
            at: tempDir, withIntermediateDirectories: true
        )
        let fileURL = tempDir.appendingPathComponent(filename)

        // Reuse if exists
        if FileManager.default.fileExists(atPath: fileURL.path) {
            return fileURL
        }

        // Generate WAV file with PCM 16-bit mono silence
        let numSamples = Int(sampleRate * duration)
        let bitsPerSample: UInt16 = 16
        let numChannels: UInt16 = 1
        let byteRate = UInt32(sampleRate) * UInt32(numChannels) * UInt32(bitsPerSample / 8)
        let blockAlign = numChannels * (bitsPerSample / 8)
        let dataSize = UInt32(numSamples * Int(numChannels) * Int(bitsPerSample / 8))
        let fileSize = 36 + dataSize  // 36 bytes of header + data

        var data = Data()

        // RIFF header
        data.append(contentsOf: "RIFF".utf8)
        data.append(contentsOf: withUnsafeBytes(of: fileSize.littleEndian) { Array($0) })
        data.append(contentsOf: "WAVE".utf8)

        // fmt subchunk
        data.append(contentsOf: "fmt ".utf8)
        data.append(contentsOf: withUnsafeBytes(of: UInt32(16).littleEndian) { Array($0) })  // Subchunk1Size (PCM = 16)
        data.append(contentsOf: withUnsafeBytes(of: UInt16(1).littleEndian) { Array($0) })   // AudioFormat (PCM = 1)
        data.append(contentsOf: withUnsafeBytes(of: numChannels.littleEndian) { Array($0) }) // NumChannels
        data.append(contentsOf: withUnsafeBytes(of: UInt32(sampleRate).littleEndian) { Array($0) }) // SampleRate
        data.append(contentsOf: withUnsafeBytes(of: byteRate.littleEndian) { Array($0) })    // ByteRate
        data.append(contentsOf: withUnsafeBytes(of: blockAlign.littleEndian) { Array($0) })  // BlockAlign
        data.append(contentsOf: withUnsafeBytes(of: bitsPerSample.littleEndian) { Array($0) }) // BitsPerSample

        // data subchunk
        data.append(contentsOf: "data".utf8)
        data.append(contentsOf: withUnsafeBytes(of: dataSize.littleEndian) { Array($0) })

        // Silent samples (all zeros)
        let silentBytes = Data(count: Int(dataSize))
        data.append(silentBytes)

        try data.write(to: fileURL)
        return fileURL
    }
}
