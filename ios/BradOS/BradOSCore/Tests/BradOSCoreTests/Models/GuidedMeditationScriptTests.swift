import Testing
import Foundation
@testable import BradOSCore

@Suite("GuidedMeditationScript")
struct GuidedMeditationScriptTests {

    // MARK: - Init & Properties

    @Test("init sets all required properties")
    func initSetsProperties() {
        let script = GuidedMeditationScript(
            id: "script-1", category: "breathing", title: "Morning Calm",
            subtitle: "Start your day with peace", orderIndex: 0,
            durationSeconds: 600
        )
        #expect(script.id == "script-1")
        #expect(script.category == "breathing")
        #expect(script.title == "Morning Calm")
        #expect(script.subtitle == "Start your day with peace")
        #expect(script.orderIndex == 0)
        #expect(script.durationSeconds == 600)
        #expect(script.segments == nil)
        #expect(script.interjections == nil)
    }

    @Test("init with segments and interjections")
    func initWithOptionals() {
        let segment = GuidedMeditationSegment(
            id: "seg-1", startSeconds: 0, text: "Begin", phase: "opening"
        )
        let interjection = GuidedMeditationInterjection(
            windowStartSeconds: 60, windowEndSeconds: 120,
            textOptions: ["Notice your breath", "Feel your body"]
        )
        let script = GuidedMeditationScript(
            id: "s1", category: "reactivity", title: "Test",
            subtitle: "Sub", orderIndex: 1, durationSeconds: 300,
            segments: [segment], interjections: [interjection]
        )
        #expect(script.segments?.count == 1)
        #expect(script.interjections?.count == 1)
    }

    // MARK: - formattedDuration

    @Test("formattedDuration converts seconds to minutes")
    func formattedDuration10Min() {
        let script = GuidedMeditationScript(
            id: "s1", category: "c", title: "T", subtitle: "S",
            orderIndex: 0, durationSeconds: 600
        )
        #expect(script.formattedDuration == "10 min")
    }

    @Test("formattedDuration for 5-minute script")
    func formattedDuration5Min() {
        let script = GuidedMeditationScript(
            id: "s1", category: "c", title: "T", subtitle: "S",
            orderIndex: 0, durationSeconds: 300
        )
        #expect(script.formattedDuration == "5 min")
    }

    @Test("formattedDuration for 20-minute script")
    func formattedDuration20Min() {
        let script = GuidedMeditationScript(
            id: "s1", category: "c", title: "T", subtitle: "S",
            orderIndex: 0, durationSeconds: 1200
        )
        #expect(script.formattedDuration == "20 min")
    }

    @Test("formattedDuration truncates sub-minute remainder")
    func formattedDurationTruncates() {
        let script = GuidedMeditationScript(
            id: "s1", category: "c", title: "T", subtitle: "S",
            orderIndex: 0, durationSeconds: 650  // 10 min 50 sec
        )
        // Integer division: 650/60 = 10
        #expect(script.formattedDuration == "10 min")
    }

    // MARK: - Codable (listing format — no segments/interjections)

    @Test("decodes from listing JSON without segments")
    func decodesListingJSON() throws {
        let json = """
        {
            "id": "gm-1",
            "category": "breathing",
            "title": "Deep Calm",
            "subtitle": "A journey inward",
            "orderIndex": 2,
            "durationSeconds": 900
        }
        """.data(using: .utf8)!

        let script = try makeDecoder().decode(GuidedMeditationScript.self, from: json)
        #expect(script.id == "gm-1")
        #expect(script.category == "breathing")
        #expect(script.orderIndex == 2)
        #expect(script.segments == nil)
        #expect(script.interjections == nil)
    }

    // MARK: - Codable (detail format — with segments/interjections)

    @Test("decodes from detail JSON with segments and interjections")
    func decodesDetailJSON() throws {
        let json = """
        {
            "id": "gm-2",
            "category": "reactivity",
            "title": "Observing Reactions",
            "subtitle": "Notice without judgment",
            "orderIndex": 0,
            "durationSeconds": 600,
            "segments": [
                {"id": "seg-1", "startSeconds": 0, "text": "Welcome", "phase": "opening"},
                {"id": "seg-2", "startSeconds": 30, "text": "Settle in", "phase": "opening"},
                {"id": "seg-3", "startSeconds": 300, "text": "Slowly return", "phase": "closing"}
            ],
            "interjections": [
                {
                    "windowStartSeconds": 120,
                    "windowEndSeconds": 240,
                    "textOptions": ["Notice any tension", "Let thoughts pass"]
                }
            ]
        }
        """.data(using: .utf8)!

        let script = try makeDecoder().decode(GuidedMeditationScript.self, from: json)
        #expect(script.segments?.count == 3)
        #expect(script.segments?.first?.phase == "opening")
        #expect(script.segments?.last?.phase == "closing")
        #expect(script.interjections?.count == 1)
        #expect(script.interjections?.first?.textOptions.count == 2)
    }

    @Test("encodes and decodes roundtrip without optionals")
    func roundtripWithoutOptionals() throws {
        let original = GuidedMeditationScript(
            id: "rt-1", category: "breathing", title: "Calm",
            subtitle: "Sub", orderIndex: 5, durationSeconds: 300
        )
        let data = try makeEncoder().encode(original)
        let decoded = try makeDecoder().decode(GuidedMeditationScript.self, from: data)
        #expect(decoded.id == original.id)
        #expect(decoded.category == original.category)
        #expect(decoded.title == original.title)
        #expect(decoded.orderIndex == original.orderIndex)
        #expect(decoded.durationSeconds == original.durationSeconds)
    }

    @Test("encodes and decodes roundtrip with segments")
    func roundtripWithSegments() throws {
        let original = GuidedMeditationScript(
            id: "rt-2", category: "reactivity", title: "Focus",
            subtitle: "S", orderIndex: 0, durationSeconds: 600,
            segments: [
                GuidedMeditationSegment(
                    id: "seg-1", startSeconds: 0, text: "Begin", phase: "opening"
                )
            ],
            interjections: [
                GuidedMeditationInterjection(
                    windowStartSeconds: 60, windowEndSeconds: 120,
                    textOptions: ["Breathe deeply"]
                )
            ]
        )
        let data = try makeEncoder().encode(original)
        let decoded = try makeDecoder().decode(GuidedMeditationScript.self, from: data)
        #expect(decoded.segments?.count == 1)
        #expect(decoded.interjections?.count == 1)
        #expect(decoded.interjections?.first?.textOptions.first == "Breathe deeply")
    }
}
