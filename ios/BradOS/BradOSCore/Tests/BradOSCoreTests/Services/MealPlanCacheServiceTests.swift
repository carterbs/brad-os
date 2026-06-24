import Foundation
import Testing
@testable import BradOSCore

@Suite("MealPlanCacheService")
struct MealPlanCacheServiceTests {

    // MARK: - Helpers

    private func makeTempDir() -> URL {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    private func makeSession(id: String = "test-session", isFinalized: Bool = true) -> MealPlanSession {
        MealPlanSession(
            id: id,
            plan: [
                MealPlanEntry(dayIndex: 0, mealType: .breakfast, mealId: "m1", mealName: "Eggs"),
                MealPlanEntry(dayIndex: 0, mealTrack: .adult, mealType: .breakfast, mealId: "m4", mealName: "Protein Oats"),
                MealPlanEntry(dayIndex: 0, mealType: .lunch, mealId: "m2", mealName: "Salad"),
                MealPlanEntry(dayIndex: 0, mealType: .dinner, mealId: "m3", mealName: "Salmon"),
            ],
            mealsSnapshot: [],
            history: [],
            isFinalized: isFinalized,
            createdAt: Date(),
            updatedAt: Date()
        )
    }

    // MARK: - Tests

    @Test("write and read a finalized session roundtrips correctly")
    func writeAndReadRoundtrip() {
        let dir = makeTempDir()
        let service = MealPlanCacheService(containerURL: dir)
        let session = makeSession()

        service.cache(session)
        let loaded = service.getCachedSession()

        #expect(loaded != nil)
        #expect(loaded?.id == session.id)
        #expect(loaded?.isFinalized == true)
        #expect(loaded?.plan.count == 4)
        #expect(loaded?.plan[0].mealName == "Eggs")
        #expect(loaded?.plan[1].mealTrack == .adult)
        #expect(loaded?.plan[1].mealName == "Protein Oats")
        #expect(loaded?.plan[2].mealName == "Salad")
        #expect(loaded?.plan[3].mealName == "Salmon")
    }

    @Test("reading when no file exists returns nil")
    func readWhenNoFileReturnsNil() {
        let dir = makeTempDir()
        let service = MealPlanCacheService(containerURL: dir)

        let result = service.getCachedSession()

        #expect(result == nil)
    }

    @Test("reading corrupt JSON returns nil")
    func readCorruptJSONReturnsNil() {
        let dir = makeTempDir()
        let service = MealPlanCacheService(containerURL: dir)

        // Write corrupt data to the cache file location
        let cacheDir = dir.appendingPathComponent("meal-plan-cache", isDirectory: true)
        try? FileManager.default.createDirectory(at: cacheDir, withIntermediateDirectories: true)
        let cacheFile = cacheDir.appendingPathComponent("latest-session.json")
        try? Data("{ not valid json ~~~".utf8).write(to: cacheFile)

        let result = service.getCachedSession()

        #expect(result == nil)
    }

    @Test("invalidation deletes the file so getCachedSession returns nil")
    func invalidationDeletesFile() {
        let dir = makeTempDir()
        let service = MealPlanCacheService(containerURL: dir)
        let session = makeSession()

        service.cache(session)
        #expect(service.getCachedSession() != nil)

        service.invalidate()
        #expect(service.getCachedSession() == nil)
    }

    @Test("isCached returns true for matching session, false for different ID")
    func isCachedMatchesSessionId() {
        let dir = makeTempDir()
        let service = MealPlanCacheService(containerURL: dir)
        let session = makeSession(id: "session-abc")

        service.cache(session)

        #expect(service.isCached(sessionId: "session-abc") == true)
        #expect(service.isCached(sessionId: "session-xyz") == false)
    }

    @Test("non-finalized sessions are not cached")
    func nonFinalizedSessionsSkipped() {
        let dir = makeTempDir()
        let service = MealPlanCacheService(containerURL: dir)
        let session = makeSession(isFinalized: false)

        service.cache(session)

        #expect(service.getCachedSession() == nil)
    }

    @Test("caching overwrites previous session")
    func cachingOverwritesPreviousSession() {
        let dir = makeTempDir()
        let service = MealPlanCacheService(containerURL: dir)

        let first = makeSession(id: "first-session")
        let second = makeSession(id: "second-session")

        service.cache(first)
        #expect(service.getCachedSession()?.id == "first-session")

        service.cache(second)
        #expect(service.getCachedSession()?.id == "second-session")
        #expect(service.isCached(sessionId: "first-session") == false)
    }

    @Test("old cache without meal_track still decodes as family")
    func oldCacheWithoutMealTrackStillDecodesAsFamily() {
        let dir = makeTempDir()
        _ = MealPlanCacheService(containerURL: dir)
        let cacheDir = dir.appendingPathComponent("meal-plan-cache", isDirectory: true)
        let cacheFile = cacheDir.appendingPathComponent("latest-session.json")
        let json = """
        {
            "id": "legacy-session",
            "plan": [
                {"day_index": 0, "meal_type": "breakfast", "meal_id": "m1", "meal_name": "Eggs"}
            ],
            "meals_snapshot": [],
            "history": [],
            "is_finalized": true,
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:00Z"
        }
        """
        try? Data(json.utf8).write(to: cacheFile)

        let service = MealPlanCacheService(containerURL: dir)
        let loaded = service.getCachedSession()

        #expect(loaded?.plan.first?.mealTrack == .family)
    }
}
