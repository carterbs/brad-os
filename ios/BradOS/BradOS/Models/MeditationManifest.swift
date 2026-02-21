import Foundation

/// Root structure for meditation audio manifest
struct MeditationManifest: Codable {
    let sessions: [MeditationSessionDefinition]
    let shared: MeditationSharedAudio
}

/// Definition of a meditation session type with variants
struct MeditationSessionDefinition: Codable {
    let id: String
    let variants: [MeditationVariant]
}

/// A specific duration variant of a meditation session
struct MeditationVariant: Codable {
    let durationMinutes: Int
    let phases: [MeditationPhaseDefinition]

    enum CodingKeys: String, CodingKey {
        case durationMinutes
        case phases
    }
}

/// A phase within a meditation session (intro, breathing, closing)
struct MeditationPhaseDefinition: Codable {
    let type: MeditationPhaseType
    let durationSeconds: Int
    let fixedCues: [FixedCue]
    let interjectionWindows: [InterjectionWindow]?

    enum CodingKeys: String, CodingKey {
        case type
        case durationSeconds
        case fixedCues
        case interjectionWindows
    }
}

/// Type of meditation phase
enum MeditationPhaseType: String, Codable {
    case intro
    case breathing
    case closing
}

/// A fixed audio cue at a specific time
struct FixedCue: Codable {
    let atSeconds: Int
    let audioFile: String
}

/// A window where random interjections can play
struct InterjectionWindow: Codable {
    let earliestSeconds: Int
    let latestSeconds: Int
    let audioPool: [String]
}

/// Shared audio resources used across sessions
struct MeditationSharedAudio: Codable {
    let bell: String
}

// MARK: - Computed Properties

extension MeditationManifest {
    /// Get a session definition by ID
    func getSession(id: String) -> MeditationSessionDefinition? {
        sessions.first { $0.id == id }
    }
}

extension MeditationSessionDefinition {
    /// Get a variant by duration
    func getVariant(duration: Int) -> MeditationVariant? {
        variants.first { $0.durationMinutes == duration }
    }
}

extension MeditationVariant {
    /// Total duration of all phases in seconds
    var totalDurationSeconds: Int {
        phases.reduce(0) { $0 + $1.durationSeconds }
    }

    /// Generate scheduled cues with absolute timestamps
    func generateScheduledCues(bellFile: String) -> [ScheduledCue] {
        var cues: [ScheduledCue] = []
        var currentOffset = 0

        for phase in phases {
            // Add fixed cues with absolute timestamp
            for fixedCue in phase.fixedCues {
                cues.append(ScheduledCue(
                    atSeconds: currentOffset + fixedCue.atSeconds,
                    audioFile: fixedCue.audioFile,
                    played: false
                ))
            }

            // Handle interjection windows if any (currently empty in manifest)
            if let windows = phase.interjectionWindows {
                for window in windows where !window.audioPool.isEmpty {
                    // Pick a random time within the window
                    let randomOffset = Int.random(
                        in: window.earliestSeconds...window.latestSeconds
                    )
                    // Pick a random audio file from the pool
                    if let randomFile = window.audioPool.randomElement() {
                        cues.append(ScheduledCue(
                            atSeconds: currentOffset + randomOffset,
                            audioFile: randomFile,
                            played: false
                        ))
                    }
                }
            }

            currentOffset += phase.durationSeconds
        }

        // Add bell at the very end
        cues.append(ScheduledCue(
            atSeconds: totalDurationSeconds,
            audioFile: bellFile,
            played: false
        ))

        // Sort by timestamp
        return cues.sorted { $0.atSeconds < $1.atSeconds }
    }
}
