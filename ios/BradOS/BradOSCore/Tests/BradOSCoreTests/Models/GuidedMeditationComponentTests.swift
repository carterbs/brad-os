import Testing
import Foundation
@testable import BradOSCore

@Suite("GuidedMeditationSegment")
struct GuidedMeditationSegmentTests {

    @Test("init sets all properties")
    func initSetsProperties() {
        let segment = GuidedMeditationSegment(
            id: "seg-1", startSeconds: 30,
            text: "Take a deep breath", phase: "opening"
        )
        #expect(segment.id == "seg-1")
        #expect(segment.startSeconds == 30)
        #expect(segment.text == "Take a deep breath")
        #expect(segment.phase == "opening")
    }

    @Test("decodes from JSON")
    func decodesFromJSON() throws {
        let json = """
        {
            "id": "seg-5",
            "startSeconds": 180,
            "text": "Now bring awareness to your body",
            "phase": "teachings"
        }
        """.data(using: .utf8)!

        let segment = try makeDecoder().decode(GuidedMeditationSegment.self, from: json)
        #expect(segment.id == "seg-5")
        #expect(segment.startSeconds == 180)
        #expect(segment.phase == "teachings")
    }

    @Test("encodes and decodes roundtrip")
    func roundtrip() throws {
        let original = GuidedMeditationSegment(
            id: "rt-seg", startSeconds: 0, text: "Welcome", phase: "opening"
        )
        let data = try makeEncoder().encode(original)
        let decoded = try makeDecoder().decode(GuidedMeditationSegment.self, from: data)
        #expect(decoded.id == original.id)
        #expect(decoded.startSeconds == original.startSeconds)
        #expect(decoded.text == original.text)
        #expect(decoded.phase == original.phase)
    }

    @Test("supports all three phases")
    func allPhases() {
        let phases = ["opening", "teachings", "closing"]
        for phase in phases {
            let segment = GuidedMeditationSegment(
                id: "s", startSeconds: 0, text: "Text", phase: phase
            )
            #expect(segment.phase == phase)
        }
    }

    @Test("Identifiable uses id property")
    func identifiable() {
        let segment = GuidedMeditationSegment(
            id: "unique-seg-id", startSeconds: 0, text: "T", phase: "opening"
        )
        #expect(segment.id == "unique-seg-id")
    }
}

@Suite("GuidedMeditationInterjection")
struct GuidedMeditationInterjectionTests {

    @Test("init sets all properties")
    func initSetsProperties() {
        let interjection = GuidedMeditationInterjection(
            windowStartSeconds: 60,
            windowEndSeconds: 180,
            textOptions: ["Notice your breath", "Feel the stillness"]
        )
        #expect(interjection.windowStartSeconds == 60)
        #expect(interjection.windowEndSeconds == 180)
        #expect(interjection.textOptions.count == 2)
    }

    @Test("decodes from JSON")
    func decodesFromJSON() throws {
        let json = """
        {
            "windowStartSeconds": 120,
            "windowEndSeconds": 300,
            "textOptions": ["Let go of tension", "Return to stillness", "Observe your thoughts"]
        }
        """.data(using: .utf8)!

        let interjection = try makeDecoder().decode(
            GuidedMeditationInterjection.self, from: json
        )
        #expect(interjection.windowStartSeconds == 120)
        #expect(interjection.windowEndSeconds == 300)
        #expect(interjection.textOptions.count == 3)
        #expect(interjection.textOptions[0] == "Let go of tension")
    }

    @Test("encodes and decodes roundtrip")
    func roundtrip() throws {
        let original = GuidedMeditationInterjection(
            windowStartSeconds: 30, windowEndSeconds: 90,
            textOptions: ["Focus"]
        )
        let data = try makeEncoder().encode(original)
        let decoded = try makeDecoder().decode(
            GuidedMeditationInterjection.self, from: data
        )
        #expect(decoded.windowStartSeconds == original.windowStartSeconds)
        #expect(decoded.windowEndSeconds == original.windowEndSeconds)
        #expect(decoded.textOptions == original.textOptions)
    }

    @Test("handles empty textOptions array")
    func emptyTextOptions() throws {
        let json = """
        {
            "windowStartSeconds": 0,
            "windowEndSeconds": 60,
            "textOptions": []
        }
        """.data(using: .utf8)!

        let interjection = try makeDecoder().decode(
            GuidedMeditationInterjection.self, from: json
        )
        #expect(interjection.textOptions.isEmpty)
    }

    @Test("window end is after window start")
    func windowOrdering() {
        let interjection = GuidedMeditationInterjection(
            windowStartSeconds: 60, windowEndSeconds: 180,
            textOptions: ["A"]
        )
        #expect(interjection.windowEndSeconds > interjection.windowStartSeconds)
    }
}

@Suite("GuidedMeditationCategoryResponse")
struct GuidedMeditationCategoryResponseTests {

    @Test("init sets all properties")
    func initSetsProperties() {
        let category = GuidedMeditationCategoryResponse(
            id: "breathing", name: "Breathing", scriptCount: 5
        )
        #expect(category.id == "breathing")
        #expect(category.name == "Breathing")
        #expect(category.scriptCount == 5)
    }

    @Test("decodes from JSON")
    func decodesFromJSON() throws {
        let json = """
        {
            "id": "reactivity",
            "name": "Reactivity",
            "scriptCount": 8
        }
        """.data(using: .utf8)!

        let category = try makeDecoder().decode(
            GuidedMeditationCategoryResponse.self, from: json
        )
        #expect(category.id == "reactivity")
        #expect(category.name == "Reactivity")
        #expect(category.scriptCount == 8)
    }

    @Test("encodes and decodes roundtrip")
    func roundtrip() throws {
        let original = GuidedMeditationCategoryResponse(
            id: "cat-1", name: "Focus", scriptCount: 3
        )
        let data = try makeEncoder().encode(original)
        let decoded = try makeDecoder().decode(
            GuidedMeditationCategoryResponse.self, from: data
        )
        #expect(decoded.id == original.id)
        #expect(decoded.name == original.name)
        #expect(decoded.scriptCount == original.scriptCount)
    }

    @Test("Identifiable uses id property")
    func identifiable() {
        let category = GuidedMeditationCategoryResponse(
            id: "my-id", name: "N", scriptCount: 0
        )
        #expect(category.id == "my-id")
    }
}
