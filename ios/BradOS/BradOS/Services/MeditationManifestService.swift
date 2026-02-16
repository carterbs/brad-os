import Foundation

/// Service for loading and processing meditation manifests
final class MeditationManifestService {
    static let shared = MeditationManifestService()

    private var cachedManifest: MeditationManifest?

    private init() {}

    // MARK: - Manifest Loading

    /// Load manifest from bundle or fetch from server
    func loadManifest() async throws -> MeditationManifest {
        // Return cached manifest if available
        if let cached = cachedManifest {
            return cached
        }

        // Try to load from bundle first
        if let manifest = loadFromBundle() {
            cachedManifest = manifest
            return manifest
        }

        // Fall back to embedded default manifest
        // In production, this would fetch from server
        let manifest = createDefaultManifest()
        cachedManifest = manifest
        return manifest
    }

    /// Load manifest from app bundle
    private func loadFromBundle() -> MeditationManifest? {
        guard let url = Bundle.main.url(
            forResource: "meditation",
            withExtension: "json"
        ) else {
            return nil
        }

        do {
            let data = try Data(contentsOf: url)
            let decoder = JSONDecoder()
            return try decoder.decode(MeditationManifest.self, from: data)
        } catch {
            print("Failed to load manifest from bundle: \(error)")
            return nil
        }
    }

    /// Create default manifest matching the web app's manifest
    private func createDefaultManifest() -> MeditationManifest {
        MeditationManifest(
            sessions: [
                MeditationSessionDefinition(
                    id: "basic-breathing",
                    name: "Basic Breathing",
                    description: "A simple breathing meditation focusing on natural breath awareness.",
                    variants: [
                        makeBreathingVariant(durationMinutes: 5, introSeconds: 30, breathingSeconds: 240),
                        makeBreathingVariant(durationMinutes: 10, introSeconds: 45, breathingSeconds: 525),
                        makeBreathingVariant(durationMinutes: 20, introSeconds: 60, breathingSeconds: 1110)
                    ]
                )
            ],
            shared: MeditationSharedAudio(
                bell: "shared/bell.wav",
                silence: "shared/silence.wav"
            )
        )
    }

    /// Build a basic-breathing variant with intro, breathing, and closing phases
    private func makeBreathingVariant(
        durationMinutes: Int, introSeconds: Int, breathingSeconds: Int
    ) -> MeditationVariant {
        MeditationVariant(
            durationMinutes: durationMinutes,
            phases: [
                MeditationPhaseDefinition(
                    type: .intro,
                    durationSeconds: introSeconds,
                    fixedCues: [
                        FixedCue(atSeconds: 0, audioFile: "sessions/basic-breathing/intro-welcome.wav")
                    ],
                    interjectionWindows: nil
                ),
                MeditationPhaseDefinition(
                    type: .breathing,
                    durationSeconds: breathingSeconds,
                    fixedCues: [],
                    interjectionWindows: []
                ),
                MeditationPhaseDefinition(
                    type: .closing,
                    durationSeconds: 30,
                    fixedCues: [
                        FixedCue(atSeconds: 0, audioFile: "sessions/basic-breathing/closing.wav")
                    ],
                    interjectionWindows: nil
                )
            ]
        )
    }

    // MARK: - Cue Generation

    /// Get the variant for a specific session and duration
    func getVariant(
        sessionId: String,
        duration: Int,
        from manifest: MeditationManifest
    ) -> MeditationVariant? {
        manifest.getSession(id: sessionId)?.getVariant(duration: duration)
    }

    /// Generate scheduled cues for a session
    func generateScheduledCues(
        sessionId: String,
        duration: Int
    ) async throws -> [ScheduledCue] {
        let manifest = try await loadManifest()

        guard let variant = getVariant(sessionId: sessionId, duration: duration, from: manifest) else {
            // Return empty cues if no variant found - session will work without audio
            return []
        }

        return variant.generateScheduledCues(bellFile: manifest.shared.bell)
    }

    // MARK: - Phase Calculation

    /// Determine the current meditation phase based on elapsed time
    func getCurrentPhase(
        sessionId: String,
        duration: Int,
        elapsedSeconds: Int
    ) async throws -> MeditationPhaseType? {
        let manifest = try await loadManifest()

        guard let variant = getVariant(sessionId: sessionId, duration: duration, from: manifest) else {
            return nil
        }

        var accumulated = 0
        for phase in variant.phases {
            accumulated += phase.durationSeconds
            if elapsedSeconds < accumulated {
                return phase.type
            }
        }

        return .closing  // Default to closing if past all phases
    }

    /// Clear cached manifest (for testing or refresh)
    func clearCache() {
        cachedManifest = nil
    }
}
