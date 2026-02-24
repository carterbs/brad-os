import Testing
import Foundation
@testable import BradOSCore

@Suite("HealthSyncModels")
struct HealthSyncModelsTests {

    // MARK: - HRVSyncEntry

    @Test("HRVSyncEntry encodes to JSON with correct keys")
    func hrvSyncEntryEncodesCorrectly() throws {
        let entry = HRVSyncEntry(
            date: "2026-02-24",
            avgMs: 35.5,
            minMs: 28.0,
            maxMs: 42.0,
            sampleCount: 5,
            source: "healthkit"
        )

        let data = try JSONEncoder().encode(entry)
        let dict = try JSONSerialization.jsonObject(with: data) as? [String: Any]

        #expect(dict?["date"] as? String == "2026-02-24")
        #expect(dict?["avgMs"] as? Double == 35.5)
        #expect(dict?["minMs"] as? Double == 28.0)
        #expect(dict?["maxMs"] as? Double == 42.0)
        #expect(dict?["sampleCount"] as? Int == 5)
        #expect(dict?["source"] as? String == "healthkit")
    }

    // MARK: - HRVHistoryEntry

    @Test("HRVHistoryEntry decodes from JSON")
    func hrvHistoryEntryDecodesFromJSON() throws {
        let json = """
        {"id":"hrv-001","date":"2026-02-01","avgMs":38.5}
        """.data(using: .utf8)!

        let entry = try JSONDecoder().decode(HRVHistoryEntry.self, from: json)
        #expect(entry.id == "hrv-001")
        #expect(entry.date == "2026-02-01")
        #expect(abs(entry.avgMs - 38.5) < 0.001)
    }

    @Test("HRVHistoryEntry Identifiable uses id property")
    func hrvHistoryEntryIdentifiable() {
        let entry = HRVHistoryEntry(id: "hrv-abc", date: "2026-02-01", avgMs: 35.0)
        #expect(entry.id == "hrv-abc")
    }

    // MARK: - RHRSyncEntry

    @Test("RHRSyncEntry encodes to JSON with correct keys")
    func rhrSyncEntryEncodesCorrectly() throws {
        let entry = RHRSyncEntry(
            date: "2026-02-24",
            avgBpm: 58.5,
            sampleCount: 3,
            source: "healthkit"
        )

        let data = try JSONEncoder().encode(entry)
        let dict = try JSONSerialization.jsonObject(with: data) as? [String: Any]

        #expect(dict?["date"] as? String == "2026-02-24")
        #expect(dict?["avgBpm"] as? Double == 58.5)
        #expect(dict?["sampleCount"] as? Int == 3)
        #expect(dict?["source"] as? String == "healthkit")
    }

    // MARK: - RHRHistoryEntry

    @Test("RHRHistoryEntry round-trip encoding")
    func rhrHistoryEntryRoundTrip() throws {
        let original = RHRHistoryEntry(id: "rhr-001", date: "2026-02-10", avgBpm: 57.0)

        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(RHRHistoryEntry.self, from: data)

        #expect(decoded.id == original.id)
        #expect(decoded.date == original.date)
        #expect(abs(decoded.avgBpm - original.avgBpm) < 0.001)
    }

    // MARK: - SleepSyncEntry

    @Test("SleepSyncEntry encodes all fields")
    func sleepSyncEntryEncodesAllFields() throws {
        let entry = SleepSyncEntry(
            date: "2026-02-24",
            totalSleepMinutes: 420,
            inBedMinutes: 440,
            coreMinutes: 210,
            deepMinutes: 84,
            remMinutes: 105,
            awakeMinutes: 20,
            sleepEfficiency: 95.4,
            source: "healthkit"
        )

        let data = try JSONEncoder().encode(entry)
        let dict = try JSONSerialization.jsonObject(with: data) as? [String: Any]

        #expect(dict?["date"] as? String == "2026-02-24")
        #expect(dict?["totalSleepMinutes"] as? Int == 420)
        #expect(dict?["inBedMinutes"] as? Int == 440)
        #expect(dict?["coreMinutes"] as? Int == 210)
        #expect(dict?["deepMinutes"] as? Int == 84)
        #expect(dict?["remMinutes"] as? Int == 105)
        #expect(dict?["awakeMinutes"] as? Int == 20)
        #expect(dict?["source"] as? String == "healthkit")
    }

    // MARK: - SleepHistoryEntry

    @Test("SleepHistoryEntry decodes from JSON")
    func sleepHistoryEntryDecodesFromJSON() throws {
        let json = """
        {
          "id": "sleep-001",
          "date": "2026-02-01",
          "totalSleepMinutes": 420,
          "coreMinutes": 210,
          "deepMinutes": 84,
          "remMinutes": 105,
          "awakeMinutes": 20,
          "sleepEfficiency": 95.4
        }
        """.data(using: .utf8)!

        let entry = try JSONDecoder().decode(SleepHistoryEntry.self, from: json)
        #expect(entry.id == "sleep-001")
        #expect(entry.date == "2026-02-01")
        #expect(entry.totalSleepMinutes == 420)
        #expect(abs(entry.sleepEfficiency - 95.4) < 0.01)
    }

    @Test("SleepHistoryEntry Identifiable uses id property")
    func sleepHistoryEntryIdentifiable() {
        let entry = SleepHistoryEntry(
            id: "sleep-xyz",
            date: "2026-02-01",
            totalSleepMinutes: 420,
            coreMinutes: 210,
            deepMinutes: 84,
            remMinutes: 105,
            awakeMinutes: 20,
            sleepEfficiency: 90.0
        )
        #expect(entry.id == "sleep-xyz")
    }

    @Test("SleepHistoryEntry round-trip preserves all fields")
    func sleepHistoryEntryRoundTrip() throws {
        let original = SleepHistoryEntry(
            id: "sleep-001",
            date: "2026-02-15",
            totalSleepMinutes: 430,
            coreMinutes: 215,
            deepMinutes: 86,
            remMinutes: 108,
            awakeMinutes: 18,
            sleepEfficiency: 92.5
        )

        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(SleepHistoryEntry.self, from: data)

        #expect(decoded.id == original.id)
        #expect(decoded.date == original.date)
        #expect(decoded.totalSleepMinutes == original.totalSleepMinutes)
        #expect(decoded.coreMinutes == original.coreMinutes)
        #expect(decoded.deepMinutes == original.deepMinutes)
        #expect(decoded.remMinutes == original.remMinutes)
        #expect(decoded.awakeMinutes == original.awakeMinutes)
        #expect(abs(decoded.sleepEfficiency - original.sleepEfficiency) < 0.001)
    }
}
