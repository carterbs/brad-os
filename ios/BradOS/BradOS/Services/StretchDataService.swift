import Foundation
import BradOSCore

/// Service for fetching and caching stretch definitions from the API.
/// Replaces StretchManifestLoader for data loading and stretch selection.
@MainActor
final class StretchDataService: ObservableObject {
    @Published var regions: [StretchRegionData] = []
    @Published var isLoading: Bool = false
    @Published var error: APIError?

    private let apiClient: APIClientProtocol
    private let userDefaultsKey = "stretch-regions-cache"
    private var hasFetched = false

    init(apiClient: APIClientProtocol = APIClient.shared) {
        self.apiClient = apiClient
        // Load cached data from UserDefaults immediately
        if let cached = loadFromUserDefaults() {
            regions = cached
        }
    }

    /// Load regions from API, falling back to cached data on failure.
    func loadRegions() async {
        // If we already have in-memory data and have fetched this session, skip
        if hasFetched && !regions.isEmpty {
            return
        }

        isLoading = true
        error = nil

        do {
            let fetchedRegions = try await apiClient.getStretches()
            regions = fetchedRegions
            hasFetched = true
            saveToUserDefaults(fetchedRegions)
        } catch let apiError as APIError {
            // Fall back to UserDefaults cache if available
            if regions.isEmpty, let cached = loadFromUserDefaults() {
                regions = cached
            }
            if regions.isEmpty {
                error = apiError
            }
        } catch {
            if regions.isEmpty {
                self.error = .unknown(error.localizedDescription)
            }
        }

        isLoading = false
    }

    /// Force refresh from API (for pull-to-refresh)
    func refresh() async {
        hasFetched = false
        await loadRegions()
    }

    /// Select a random stretch for a specific region
    func selectRandomStretch(for region: BodyRegion) -> StretchDefinition? {
        guard let regionData = regions.first(where: { $0.region == region }) else {
            return nil
        }
        return regionData.stretches.randomElement()
    }

    /// Select random stretches for all enabled regions in the config
    func selectStretches(for config: StretchSessionConfig) -> [SelectedStretch] {
        var selected: [SelectedStretch] = []

        for regionConfig in config.regions where regionConfig.enabled {
            guard let definition = selectRandomStretch(for: regionConfig.region) else {
                continue
            }
            selected.append(SelectedStretch(
                region: regionConfig.region,
                definition: definition,
                durationSeconds: regionConfig.durationSeconds
            ))
        }

        return selected
    }

    // MARK: - UserDefaults Persistence

    private func saveToUserDefaults(_ regions: [StretchRegionData]) {
        if let data = try? JSONEncoder().encode(regions) {
            UserDefaults.standard.set(data, forKey: userDefaultsKey)
        }
    }

    private func loadFromUserDefaults() -> [StretchRegionData]? {
        guard let data = UserDefaults.standard.data(forKey: userDefaultsKey),
              let regions = try? JSONDecoder().decode([StretchRegionData].self, from: data) else {
            return nil
        }
        return regions.isEmpty ? nil : regions
    }
}
