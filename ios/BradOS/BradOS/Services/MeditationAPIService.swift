import Foundation

/// Service for meditation-related API operations
/// Wraps APIClient for meditation-specific functionality
final class MeditationAPIService: ObservableObject {
    static let shared = MeditationAPIService()

    // MARK: - Dependencies

    private let apiClient: APIClientProtocol

    // MARK: - Published State

    @Published var latestSession: MeditationSession?
    @Published var stats: MeditationStats?
    @Published var isLoading: Bool = false
    @Published var error: Error?

    // MARK: - Offline Queue

    /// Sessions waiting to be uploaded when network becomes available
    private var pendingUploads: [MeditationSession] = []
    private let pendingUploadsKey = "meditation-pending-uploads"

    // MARK: - Initialization

    init(apiClient: APIClientProtocol = APIClient.shared) {
        self.apiClient = apiClient
        loadPendingUploads()
    }

    // MARK: - Session Creation

    /// Save a completed meditation session to the server
    /// - Parameter session: The session to save
    /// - Returns: The saved session with server-assigned ID
    func saveSession(_ session: MeditationSession) async throws -> MeditationSession {
        do {
            let savedSession = try await apiClient.createMeditationSession(session)

            // Update latest session
            await MainActor.run {
                self.latestSession = savedSession
                self.error = nil
            }

            // Try to upload any pending sessions
            await uploadPendingSessions()

            return savedSession
        } catch {
            // Queue for later upload if network fails
            await queueForLaterUpload(session)

            await MainActor.run {
                self.error = error
            }

            throw error
        }
    }

    /// Save session without throwing - for fire-and-forget calls
    /// Errors are captured in the error property
    func saveSessionSilently(_ session: MeditationSession) {
        Task {
            do {
                _ = try await saveSession(session)
            } catch {
                // Error is already captured in saveSession
                print("[MeditationAPIService] Failed to save session: \(error.localizedDescription)")
            }
        }
    }

    // MARK: - Session Fetching

    /// Fetch the latest meditation session from the server
    func fetchLatestSession() async throws -> MeditationSession? {
        await MainActor.run {
            self.isLoading = true
        }

        do {
            let session = try await apiClient.getLatestMeditationSession()

            await MainActor.run {
                self.latestSession = session
                self.isLoading = false
                self.error = nil
            }

            return session
        } catch {
            await MainActor.run {
                self.isLoading = false
                self.error = error
            }

            throw error
        }
    }

    /// Fetch latest session without throwing
    func fetchLatestSessionSilently() {
        Task {
            do {
                _ = try await fetchLatestSession()
            } catch {
                print("[MeditationAPIService] Failed to fetch latest session: \(error.localizedDescription)")
            }
        }
    }

    // MARK: - Statistics

    /// Fetch meditation statistics from the server
    func fetchStats() async throws -> MeditationStats {
        await MainActor.run {
            self.isLoading = true
        }

        do {
            let stats = try await apiClient.getMeditationStats()

            await MainActor.run {
                self.stats = stats
                self.isLoading = false
                self.error = nil
            }

            return stats
        } catch {
            await MainActor.run {
                self.isLoading = false
                self.error = error
            }

            throw error
        }
    }

    // MARK: - Offline Queue Management

    /// Queue a session for later upload when network is unavailable
    private func queueForLaterUpload(_ session: MeditationSession) async {
        await MainActor.run {
            // Avoid duplicates
            if !pendingUploads.contains(where: { $0.id == session.id }) {
                pendingUploads.append(session)
                savePendingUploads()
            }
        }
    }

    /// Attempt to upload any pending sessions
    func uploadPendingSessions() async {
        guard !pendingUploads.isEmpty else { return }

        var successfullyUploaded: [String] = []

        for session in pendingUploads {
            do {
                _ = try await apiClient.createMeditationSession(session)
                successfullyUploaded.append(session.id)
            } catch let apiError as APIError {
                // Stop trying if we hit a network error
                if apiError.code == .networkError {
                    break
                }
                // For other errors (like duplicate), mark as uploaded anyway
                successfullyUploaded.append(session.id)
            } catch {
                // Non-API error, stop trying
                break
            }
        }

        // Remove successfully uploaded sessions
        if !successfullyUploaded.isEmpty {
            let idsToRemove = successfullyUploaded
            await MainActor.run {
                pendingUploads.removeAll { idsToRemove.contains($0.id) }
                savePendingUploads()
            }
        }
    }

    /// Check if there are pending uploads
    var hasPendingUploads: Bool {
        !pendingUploads.isEmpty
    }

    /// Number of sessions waiting to upload
    var pendingUploadCount: Int {
        pendingUploads.count
    }

    // MARK: - Persistence for Pending Uploads

    private func savePendingUploads() {
        do {
            let data = try JSONEncoder().encode(pendingUploads)
            UserDefaults.standard.set(data, forKey: pendingUploadsKey)
        } catch {
            print("[MeditationAPIService] Failed to save pending uploads: \(error)")
        }
    }

    private func loadPendingUploads() {
        guard let data = UserDefaults.standard.data(forKey: pendingUploadsKey) else {
            return
        }

        do {
            pendingUploads = try JSONDecoder().decode([MeditationSession].self, from: data)
        } catch {
            print("[MeditationAPIService] Failed to load pending uploads: \(error)")
            pendingUploads = []
        }
    }

    /// Clear all pending uploads (for testing/debugging)
    func clearPendingUploads() {
        pendingUploads = []
        UserDefaults.standard.removeObject(forKey: pendingUploadsKey)
    }
}
