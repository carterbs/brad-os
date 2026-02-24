import Testing
import Foundation
@testable import BradOSCore

@Suite("MeditationStats")
struct MeditationStatsTests {

    // MARK: - Init & Properties

    @Test("init sets required and optional properties")
    func initSetsProperties() {
        let stats = MeditationStats(
            totalSessions: 42, totalMinutes: 315,
            currentStreak: 7, longestStreak: 14
        )
        #expect(stats.totalSessions == 42)
        #expect(stats.totalMinutes == 315)
        #expect(stats.currentStreak == 7)
        #expect(stats.longestStreak == 14)
    }

    @Test("streaks default to nil")
    func streaksDefaultToNil() {
        let stats = MeditationStats(
            totalSessions: 10, totalMinutes: 50
        )
        #expect(stats.currentStreak == nil)
        #expect(stats.longestStreak == nil)
    }

    // MARK: - Computed Properties

    @Test("displayCurrentStreak returns value when present")
    func displayCurrentStreakPresent() {
        let stats = MeditationStats(
            totalSessions: 10, totalMinutes: 50, currentStreak: 5
        )
        #expect(stats.displayCurrentStreak == 5)
    }

    @Test("displayCurrentStreak returns 0 when nil")
    func displayCurrentStreakNil() {
        let stats = MeditationStats(
            totalSessions: 10, totalMinutes: 50
        )
        #expect(stats.displayCurrentStreak == 0)
    }

    @Test("displayLongestStreak returns value when present")
    func displayLongestStreakPresent() {
        let stats = MeditationStats(
            totalSessions: 10, totalMinutes: 50, longestStreak: 21
        )
        #expect(stats.displayLongestStreak == 21)
    }

    @Test("displayLongestStreak returns 0 when nil")
    func displayLongestStreakNil() {
        let stats = MeditationStats(
            totalSessions: 10, totalMinutes: 50
        )
        #expect(stats.displayLongestStreak == 0)
    }

    // MARK: - Codable

    @Test("decodes from server JSON with streaks")
    func decodesWithStreaks() throws {
        let json = """
        {
            "totalSessions": 100,
            "totalMinutes": 750,
            "currentStreak": 12,
            "longestStreak": 30
        }
        """.data(using: .utf8)!

        let stats = try makeDecoder().decode(MeditationStats.self, from: json)
        #expect(stats.totalSessions == 100)
        #expect(stats.totalMinutes == 750)
        #expect(stats.currentStreak == 12)
        #expect(stats.longestStreak == 30)
    }

    @Test("decodes from server JSON without streaks")
    func decodesWithoutStreaks() throws {
        let json = """
        {
            "totalSessions": 5,
            "totalMinutes": 25
        }
        """.data(using: .utf8)!

        let stats = try makeDecoder().decode(MeditationStats.self, from: json)
        #expect(stats.totalSessions == 5)
        #expect(stats.totalMinutes == 25)
        #expect(stats.currentStreak == nil)
        #expect(stats.longestStreak == nil)
    }

    @Test("encodes and decodes roundtrip")
    func roundtrip() throws {
        let original = MeditationStats(
            totalSessions: 42, totalMinutes: 315,
            currentStreak: 7, longestStreak: 14
        )
        let data = try makeEncoder().encode(original)
        let decoded = try makeDecoder().decode(MeditationStats.self, from: data)
        #expect(decoded.totalSessions == original.totalSessions)
        #expect(decoded.totalMinutes == original.totalMinutes)
        #expect(decoded.currentStreak == original.currentStreak)
        #expect(decoded.longestStreak == original.longestStreak)
    }

    @Test("encodes and decodes roundtrip with nil streaks")
    func roundtripNilStreaks() throws {
        let original = MeditationStats(
            totalSessions: 1, totalMinutes: 5
        )
        let data = try makeEncoder().encode(original)
        let decoded = try makeDecoder().decode(MeditationStats.self, from: data)
        #expect(decoded.totalSessions == original.totalSessions)
        #expect(decoded.currentStreak == nil)
        #expect(decoded.longestStreak == nil)
    }

    // MARK: - Mock Data

    @Test("mockStats has valid data")
    func mockStatsValid() {
        let mock = MeditationStats.mockStats
        #expect(mock.totalSessions == 42)
        #expect(mock.totalMinutes == 315)
        #expect(mock.currentStreak == 7)
        #expect(mock.longestStreak == 14)
    }

    @Test("mockStats display properties return streak values")
    func mockStatsDisplayProperties() {
        let mock = MeditationStats.mockStats
        #expect(mock.displayCurrentStreak == 7)
        #expect(mock.displayLongestStreak == 14)
    }
}
