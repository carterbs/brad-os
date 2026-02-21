import Foundation
import BradOSCore

/// Service for meditation-related API operations
/// Wraps APIClient for meditation-specific functionality
final class MeditationAPIService: ObservableObject {
    static let shared = MeditationAPIService()

    // MARK: - Dependencies

    private let apiClient: APIClientProtocol

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

            // Try to upload any pending sessions
            await uploadPendingSessions()

            return savedSession
        } catch {
            // Queue for later upload if network fails
            await queueForLaterUpload(session)

            throw error
        }
    }

    // MARK: - Session Fetching

    /// Fetch the latest meditation session from the server
    func fetchLatestSession() async throws -> MeditationSession? {
        do {
            let session = try await apiClient.getLatestMeditationSession()
            return session
        } catch {
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
}
