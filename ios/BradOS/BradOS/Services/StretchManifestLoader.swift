import Foundation
import BradOSCore

/// Errors that can occur during manifest loading
enum StretchManifestError: Error, LocalizedError {
    case fileNotFound
    case decodingFailed(Error)
    case noStretchesForRegion(BodyRegion)

    var errorDescription: String? {
        switch self {
        case .fileNotFound:
            return "Stretch manifest file not found in bundle"
        case .decodingFailed(let error):
            return "Failed to decode stretch manifest: \(error.localizedDescription)"
        case .noStretchesForRegion(let region):
            return "No stretches found for region: \(region.displayName)"
        }
    }
}

/// Singleton service for loading and caching the stretch manifest
class StretchManifestLoader {
    static let shared = StretchManifestLoader()

    private var cachedManifest: StretchManifest?
    private let queue = DispatchQueue(label: "com.bradOS.stretchManifest", attributes: .concurrent)

    private init() {}

    /// Load the manifest from bundle, using cache if available
    func loadManifest() throws -> StretchManifest {
        // Check cache first (thread-safe read)
        if let cached = queue.sync(execute: { cachedManifest }) {
            return cached
        }

        // Load from bundle
        guard let url = Bundle.main.url(forResource: "stretches", withExtension: "json") else {
            throw StretchManifestError.fileNotFound
        }

        do {
            let data = try Data(contentsOf: url)
            let manifest = try JSONDecoder().decode(StretchManifest.self, from: data)

            // Cache the result (thread-safe write)
            queue.async(flags: .barrier) { [weak self] in
                self?.cachedManifest = manifest
            }

            return manifest
        } catch let error as DecodingError {
            throw StretchManifestError.decodingFailed(error)
        } catch {
            throw StretchManifestError.decodingFailed(error)
        }
    }

    /// Get all stretches for a body region
    func getStretches(for region: BodyRegion) throws -> [Stretch] {
        let manifest = try loadManifest()
        let stretches = manifest.getStretches(for: region)
        guard !stretches.isEmpty else {
            throw StretchManifestError.noStretchesForRegion(region)
        }
        return stretches
    }

    /// Select a random stretch for a body region
    func selectRandomStretch(for region: BodyRegion) throws -> Stretch {
        let stretches = try getStretches(for: region)
        // randomElement is safe here since we check for empty above
        return stretches.randomElement()!
    }

    /// Select random stretches for all enabled regions
    func selectStretches(for config: StretchSessionConfig) throws -> [SelectedStretch] {
        var selectedStretches: [SelectedStretch] = []

        for regionConfig in config.regions where regionConfig.enabled {
            let stretch = try selectRandomStretch(for: regionConfig.region)
            let selected = SelectedStretch(
                region: regionConfig.region,
                definition: StretchDefinition(
                    id: stretch.id,
                    name: stretch.name,
                    description: stretch.description,
                    bilateral: stretch.bilateral
                ),
                durationSeconds: regionConfig.durationSeconds
            )
            selectedStretches.append(selected)
        }

        return selectedStretches
    }

    /// Get shared audio file paths
    func getSharedAudio() throws -> StretchSharedAudio {
        let manifest = try loadManifest()
        return manifest.shared
    }

    /// Clear the cached manifest (useful for testing)
    func clearCache() {
        queue.async(flags: .barrier) { [weak self] in
            self?.cachedManifest = nil
        }
    }
}
