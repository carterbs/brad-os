import Foundation

/// Protocol for meal plan cache operations (for testability)
public protocol MealPlanCacheServiceProtocol: Sendable {
    func getCachedSession() -> MealPlanSession?
    func cache(_ session: MealPlanSession)
    func invalidate()
    func isCached(sessionId: String) -> Bool
}

/// Disk-based cache for finalized meal plan sessions.
/// Stores in the App Group shared container so the widget extension can also read cached data.
public final class MealPlanCacheService: MealPlanCacheServiceProtocol, @unchecked Sendable {
    public static let shared = MealPlanCacheService()

    /// Notification posted when the cache is updated or invalidated
    public static let cacheDidChangeNotification = Notification.Name("MealPlanCacheDidChange")

    private let cacheDirectory: URL
    private let fileName = "latest-session.json"

    private let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }()

    private let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }()

    public init(containerURL: URL? = nil) {
        if let containerURL {
            cacheDirectory = containerURL.appendingPathComponent("meal-plan-cache", isDirectory: true)
        } else if let groupURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: "group.com.bradcarter.brad-os") {
            cacheDirectory = groupURL.appendingPathComponent("meal-plan-cache", isDirectory: true)
        } else {
            // Fallback for unit tests or when App Group is unavailable
            let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            cacheDirectory = caches.appendingPathComponent("meal-plan-cache", isDirectory: true)
        }

        try? FileManager.default.createDirectory(at: cacheDirectory, withIntermediateDirectories: true)
    }

    private var cacheFileURL: URL {
        cacheDirectory.appendingPathComponent(fileName)
    }

    public func getCachedSession() -> MealPlanSession? {
        guard FileManager.default.fileExists(atPath: cacheFileURL.path) else {
            return nil
        }
        do {
            let data = try Data(contentsOf: cacheFileURL)
            return try decoder.decode(MealPlanSession.self, from: data)
        } catch {
            #if DEBUG
            print("[MealPlanCacheService] Failed to read cache: \(error)")
            #endif
            return nil
        }
    }

    public func cache(_ session: MealPlanSession) {
        guard session.isFinalized else {
            #if DEBUG
            print("[MealPlanCacheService] Skipping cache for non-finalized session")
            #endif
            return
        }
        do {
            let data = try encoder.encode(session)
            try data.write(to: cacheFileURL, options: .atomic)
            NotificationCenter.default.post(name: Self.cacheDidChangeNotification, object: nil)
        } catch {
            #if DEBUG
            print("[MealPlanCacheService] Failed to write cache: \(error)")
            #endif
        }
    }

    public func invalidate() {
        try? FileManager.default.removeItem(at: cacheFileURL)
        NotificationCenter.default.post(name: Self.cacheDidChangeNotification, object: nil)
    }

    public func isCached(sessionId: String) -> Bool {
        guard let session = getCachedSession() else { return false }
        return session.id == sessionId
    }
}
