# Stretching + Meditation: Add iOS Tests to Reach 4+ Files Each

## Why

Stretching has 2 test files and Meditation has 1 test file. Both have untested models in BradOSCore — `StretchDefinition`, `StretchRegionData`, `CompletedStretch`, `StretchRegionConfig`, all four `GuidedMeditation*` types, and `MeditationStats`. Getting each feature to 4+ test files strengthens overall iOS test coverage from B- to B with zero refactoring — all target types already live in BradOSCore and are immediately testable.

## What

Add 5 new test files (2 stretching, 3 meditation) covering untested BradOSCore models. No source code changes needed — every type to test is already `public` in BradOSCore with `Codable` conformance, computed properties, and mock data.

### Current State

| Feature | Test Files | What's Tested |
|---------|-----------|---------------|
| Stretching | `StretchSessionTests.swift` (13 tests) | StretchSession, BodyRegion, StretchSessionConfig |
| Stretching | `StretchUrgencyTests.swift` (9 tests) | StretchUrgency urgency calculations |
| Meditation | `MeditationSessionTests.swift` (12 tests) | MeditationSession, MeditationDuration |

### Target State (after this task)

| Feature | Test Files | Total |
|---------|-----------|-------|
| Stretching | 2 existing + 2 new | **4** |
| Meditation | 1 existing + 3 new | **4** |

## Files

All new files are test-only — no source modifications required.

### Stretching Test File 1

#### CREATE: `ios/BradOS/BradOSCore/Tests/BradOSCoreTests/Models/StretchDefinitionTests.swift`

Tests `StretchDefinition` and `StretchRegionData` — two Codable model types with properties, optional fields, and Hashable conformance.

```swift
import Testing
import Foundation
@testable import BradOSCore

@Suite("StretchDefinition")
struct StretchDefinitionTests {

    // MARK: - Init & Properties

    @Test("init sets all properties correctly")
    func initSetsProperties() {
        let def = StretchDefinition(
            id: "stretch-1",
            name: "Cat-Cow",
            description: "Spinal mobility stretch",
            bilateral: false,
            image: "cat-cow.jpg"
        )
        #expect(def.id == "stretch-1")
        #expect(def.name == "Cat-Cow")
        #expect(def.description == "Spinal mobility stretch")
        #expect(def.bilateral == false)
        #expect(def.image == "cat-cow.jpg")
    }

    @Test("image defaults to nil")
    func imageDefaultsToNil() {
        let def = StretchDefinition(
            id: "s1", name: "Stretch", description: "Desc", bilateral: true
        )
        #expect(def.image == nil)
    }

    // MARK: - Codable

    @Test("decodes from JSON with all fields")
    func decodesFullJSON() throws {
        let json = """
        {
            "id": "s-1",
            "name": "Pigeon Pose",
            "description": "Deep hip opener",
            "bilateral": true,
            "image": "pigeon.png"
        }
        """.data(using: .utf8)!

        let def = try makeDecoder().decode(StretchDefinition.self, from: json)
        #expect(def.id == "s-1")
        #expect(def.name == "Pigeon Pose")
        #expect(def.bilateral == true)
        #expect(def.image == "pigeon.png")
    }

    @Test("decodes from JSON without optional image")
    func decodesWithoutImage() throws {
        let json = """
        {
            "id": "s-2",
            "name": "Neck Roll",
            "description": "Gentle neck stretch",
            "bilateral": false
        }
        """.data(using: .utf8)!

        let def = try makeDecoder().decode(StretchDefinition.self, from: json)
        #expect(def.id == "s-2")
        #expect(def.image == nil)
    }

    @Test("encodes and decodes roundtrip")
    func encodesDecodesRoundtrip() throws {
        let original = StretchDefinition(
            id: "rt-1", name: "Cobra", description: "Back stretch",
            bilateral: false, image: "cobra.jpg"
        )
        let data = try makeEncoder().encode(original)
        let decoded = try makeDecoder().decode(StretchDefinition.self, from: data)
        #expect(decoded.id == original.id)
        #expect(decoded.name == original.name)
        #expect(decoded.bilateral == original.bilateral)
        #expect(decoded.image == original.image)
    }

    // MARK: - Hashable / Identifiable

    @Test("conforms to Identifiable via id property")
    func identifiable() {
        let def = StretchDefinition(
            id: "unique-id", name: "X", description: "Y", bilateral: false
        )
        #expect(def.id == "unique-id")
    }

    @Test("equal definitions have same hash")
    func hashableEquality() {
        let a = StretchDefinition(
            id: "s1", name: "A", description: "B", bilateral: true, image: nil
        )
        let b = StretchDefinition(
            id: "s1", name: "A", description: "B", bilateral: true, image: nil
        )
        #expect(a == b)
        #expect(a.hashValue == b.hashValue)
    }
}

@Suite("StretchRegionData")
struct StretchRegionDataTests {

    @Test("init sets all properties including nested stretches")
    func initSetsProperties() {
        let stretch = StretchDefinition(
            id: "s1", name: "Trap Stretch", description: "Upper trap",
            bilateral: true
        )
        let region = StretchRegionData(
            id: "neck-region",
            region: .neck,
            displayName: "Neck",
            iconName: "person.crop.circle",
            stretches: [stretch]
        )
        #expect(region.id == "neck-region")
        #expect(region.region == .neck)
        #expect(region.stretches.count == 1)
        #expect(region.stretches.first?.name == "Trap Stretch")
    }

    @Test("decodes from server JSON with nested stretches")
    func decodesFromServerJSON() throws {
        let json = """
        {
            "id": "back-region",
            "region": "back",
            "displayName": "Back",
            "iconName": "figure.stand",
            "stretches": [
                {
                    "id": "s1",
                    "name": "Cat-Cow",
                    "description": "Spinal flex",
                    "bilateral": false
                },
                {
                    "id": "s2",
                    "name": "Child Pose",
                    "description": "Back release",
                    "bilateral": false,
                    "image": "child-pose.png"
                }
            ]
        }
        """.data(using: .utf8)!

        let region = try makeDecoder().decode(StretchRegionData.self, from: json)
        #expect(region.region == .back)
        #expect(region.stretches.count == 2)
        #expect(region.stretches[1].image == "child-pose.png")
    }

    @Test("encodes and decodes roundtrip")
    func roundtrip() throws {
        let original = StretchRegionData(
            id: "glutes-region", region: .glutes,
            displayName: "Glutes", iconName: "figure.cooldown",
            stretches: [
                StretchDefinition(
                    id: "s1", name: "Pigeon", description: "Hip opener",
                    bilateral: true
                )
            ]
        )
        let data = try makeEncoder().encode(original)
        let decoded = try makeDecoder().decode(StretchRegionData.self, from: data)
        #expect(decoded.id == original.id)
        #expect(decoded.region == original.region)
        #expect(decoded.stretches.count == 1)
    }

    @Test("decodes with empty stretches array")
    func decodesEmptyStretches() throws {
        let json = """
        {
            "id": "empty-region",
            "region": "calves",
            "displayName": "Calves",
            "iconName": "shoe",
            "stretches": []
        }
        """.data(using: .utf8)!

        let region = try makeDecoder().decode(StretchRegionData.self, from: json)
        #expect(region.stretches.isEmpty)
    }
}
```

**Test count: ~12** (7 StretchDefinition + 4 StretchRegionData)

---

### Stretching Test File 2

#### CREATE: `ios/BradOS/BradOSCore/Tests/BradOSCoreTests/Models/CompletedStretchTests.swift`

Tests `CompletedStretch` (computed `id`, encoding/decoding, skippedSegments) and `StretchRegionConfig` (computed `id`, Codable).

```swift
import Testing
import Foundation
@testable import BradOSCore

@Suite("CompletedStretch")
struct CompletedStretchTests {

    @Test("computed id combines region and stretchId")
    func computedId() {
        let stretch = CompletedStretch(
            region: .hamstrings,
            stretchId: "stretch-42",
            stretchName: "Standing Hamstring",
            durationSeconds: 60,
            skippedSegments: 0
        )
        #expect(stretch.id == "hamstrings-stretch-42")
    }

    @Test("computed id uses snake_case for hipFlexors region")
    func computedIdHipFlexors() {
        let stretch = CompletedStretch(
            region: .hipFlexors,
            stretchId: "s1",
            stretchName: "Lunge Stretch",
            durationSeconds: 120,
            skippedSegments: 1
        )
        #expect(stretch.id == "hip_flexors-s1")
    }

    @Test("skippedSegments can be 0, 1, or 2")
    func skippedSegmentsValues() {
        for skip in [0, 1, 2] {
            let stretch = CompletedStretch(
                region: .back, stretchId: "s1", stretchName: "Cobra",
                durationSeconds: 60, skippedSegments: skip
            )
            #expect(stretch.skippedSegments == skip)
        }
    }

    @Test("decodes from JSON")
    func decodesFromJSON() throws {
        let json = """
        {
            "region": "shoulders",
            "stretchId": "s-10",
            "stretchName": "Shoulder Cross",
            "durationSeconds": 60,
            "skippedSegments": 1
        }
        """.data(using: .utf8)!

        let stretch = try makeDecoder().decode(CompletedStretch.self, from: json)
        #expect(stretch.region == .shoulders)
        #expect(stretch.stretchId == "s-10")
        #expect(stretch.stretchName == "Shoulder Cross")
        #expect(stretch.durationSeconds == 60)
        #expect(stretch.skippedSegments == 1)
    }

    @Test("encodes and decodes roundtrip")
    func roundtrip() throws {
        let original = CompletedStretch(
            region: .quads, stretchId: "q1", stretchName: "Quad Pull",
            durationSeconds: 120, skippedSegments: 0
        )
        let data = try makeEncoder().encode(original)
        let decoded = try makeDecoder().decode(CompletedStretch.self, from: data)
        #expect(decoded.region == original.region)
        #expect(decoded.stretchId == original.stretchId)
        #expect(decoded.stretchName == original.stretchName)
        #expect(decoded.durationSeconds == original.durationSeconds)
        #expect(decoded.skippedSegments == original.skippedSegments)
    }

    @Test("Hashable conformance for equal instances")
    func hashable() {
        let a = CompletedStretch(
            region: .neck, stretchId: "n1", stretchName: "Neck Tilt",
            durationSeconds: 60, skippedSegments: 0
        )
        let b = CompletedStretch(
            region: .neck, stretchId: "n1", stretchName: "Neck Tilt",
            durationSeconds: 60, skippedSegments: 0
        )
        #expect(a == b)
    }

    @Test("StretchSession decodes with stretches array")
    func sessionWithStretches() throws {
        let json = """
        {
            "id": "session-1",
            "completedAt": "2026-02-20T15:00:00Z",
            "totalDurationSeconds": 480,
            "regionsCompleted": 4,
            "regionsSkipped": 0,
            "stretches": [
                {
                    "region": "neck",
                    "stretchId": "s1",
                    "stretchName": "Neck Tilt",
                    "durationSeconds": 60,
                    "skippedSegments": 0
                },
                {
                    "region": "back",
                    "stretchId": "s2",
                    "stretchName": "Cat-Cow",
                    "durationSeconds": 60,
                    "skippedSegments": 1
                }
            ]
        }
        """.data(using: .utf8)!

        let session = try makeDecoder().decode(StretchSession.self, from: json)
        #expect(session.stretches?.count == 2)
        #expect(session.stretches?.first?.region == .neck)
        #expect(session.stretches?.last?.skippedSegments == 1)
    }
}

@Suite("StretchRegionConfig")
struct StretchRegionConfigTests {

    @Test("computed id is region rawValue")
    func computedId() {
        let config = StretchRegionConfig(
            region: .hamstrings, durationSeconds: 60, enabled: true
        )
        #expect(config.id == "hamstrings")
    }

    @Test("computed id for hipFlexors uses snake_case")
    func computedIdHipFlexors() {
        let config = StretchRegionConfig(
            region: .hipFlexors, durationSeconds: 120, enabled: false
        )
        #expect(config.id == "hip_flexors")
    }

    @Test("encodes and decodes roundtrip")
    func roundtrip() throws {
        let original = StretchRegionConfig(
            region: .calves, durationSeconds: 120, enabled: true
        )
        let data = try makeEncoder().encode(original)
        let decoded = try makeDecoder().decode(StretchRegionConfig.self, from: data)
        #expect(decoded.region == original.region)
        #expect(decoded.durationSeconds == original.durationSeconds)
        #expect(decoded.enabled == original.enabled)
    }

    @Test("supports both 60 and 120 second durations")
    func durationValues() {
        let short = StretchRegionConfig(region: .neck, durationSeconds: 60, enabled: true)
        let long = StretchRegionConfig(region: .neck, durationSeconds: 120, enabled: true)
        #expect(short.durationSeconds == 60)
        #expect(long.durationSeconds == 120)
    }

    @Test("Hashable conformance for equal configs")
    func hashable() {
        let a = StretchRegionConfig(region: .back, durationSeconds: 60, enabled: true)
        let b = StretchRegionConfig(region: .back, durationSeconds: 60, enabled: true)
        #expect(a == b)
    }

    @Test("StretchSessionConfig with mixed enabled regions")
    func mixedEnabledRegions() throws {
        var config = StretchSessionConfig.defaultConfig
        config.regions[0].enabled = false  // disable first region
        config.regions[1].durationSeconds = 120  // longer for second

        let data = try makeEncoder().encode(config)
        let decoded = try makeDecoder().decode(StretchSessionConfig.self, from: data)

        #expect(decoded.regions[0].enabled == false)
        #expect(decoded.regions[1].durationSeconds == 120)
        #expect(decoded.regions[2].enabled == true)
    }

    @Test("StretchSessionConfig with Spotify URL")
    func spotifyUrl() throws {
        let config = StretchSessionConfig(
            regions: [StretchRegionConfig(region: .neck, durationSeconds: 60, enabled: true)],
            spotifyPlaylistUrl: "https://open.spotify.com/playlist/abc123"
        )
        let data = try makeEncoder().encode(config)
        let decoded = try makeDecoder().decode(StretchSessionConfig.self, from: data)
        #expect(decoded.spotifyPlaylistUrl == "https://open.spotify.com/playlist/abc123")
    }
}
```

**Test count: ~14** (7 CompletedStretch + 7 StretchRegionConfig)

---

### Meditation Test File 1

#### CREATE: `ios/BradOS/BradOSCore/Tests/BradOSCoreTests/Models/GuidedMeditationScriptTests.swift`

Tests `GuidedMeditationScript` — the richest guided meditation type with `formattedDuration`, optional `segments`/`interjections`, and multiple properties.

```swift
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
```

**Test count: ~11**

---

### Meditation Test File 2

#### CREATE: `ios/BradOS/BradOSCore/Tests/BradOSCoreTests/Models/GuidedMeditationComponentTests.swift`

Tests `GuidedMeditationSegment`, `GuidedMeditationInterjection`, and `GuidedMeditationCategoryResponse`.

```swift
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
```

**Test count: ~14** (5 Segment + 5 Interjection + 4 CategoryResponse)

---

### Meditation Test File 3

#### CREATE: `ios/BradOS/BradOSCore/Tests/BradOSCoreTests/Models/MeditationStatsTests.swift`

Tests `MeditationStats` — computed properties (`displayCurrentStreak`, `displayLongestStreak`), optional streak fields, mock data, and Codable.

```swift
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
```

**Test count: ~13**

---

## Test Summary

| New File | Feature | Tests | What It Covers |
|----------|---------|-------|----------------|
| `StretchDefinitionTests.swift` | Stretching | ~12 | StretchDefinition (Codable, optional image, Hashable), StretchRegionData (nested stretches, Codable) |
| `CompletedStretchTests.swift` | Stretching | ~14 | CompletedStretch (computed id, Codable, skippedSegments), StretchRegionConfig (computed id, Codable), StretchSessionConfig advanced scenarios |
| `GuidedMeditationScriptTests.swift` | Meditation | ~11 | GuidedMeditationScript (formattedDuration, listing vs detail JSON, optional segments/interjections, Codable roundtrip) |
| `GuidedMeditationComponentTests.swift` | Meditation | ~14 | GuidedMeditationSegment (phases, Codable), GuidedMeditationInterjection (window properties, empty options, Codable), GuidedMeditationCategoryResponse (Codable, Identifiable) |
| `MeditationStatsTests.swift` | Meditation | ~13 | MeditationStats (displayCurrentStreak/displayLongestStreak nil fallback, Codable with/without optional streaks, mock validation) |
| **Total new** | | **~64** | |

### Final File Counts

| Feature | Before | After | Files |
|---------|--------|-------|-------|
| Stretching | 2 | **4** | StretchSessionTests, StretchUrgencyTests, **StretchDefinitionTests**, **CompletedStretchTests** |
| Meditation | 1 | **4** | MeditationSessionTests, **GuidedMeditationScriptTests**, **GuidedMeditationComponentTests**, **MeditationStatsTests** |

## QA

### Step 1: Run BradOSCore tests via SPM

```bash
cd ios/BradOS/BradOSCore && swift test 2>&1 | tail -30
```

All tests must pass. Expect ~96+ total tests (existing ~34 + new ~64 — adjusted if actual counts differ slightly).

### Step 2: Verify test file counts

```bash
# Stretching test files (expect 4)
find ios/BradOS/BradOSCore/Tests -name "*Stretch*Tests.swift" -o -name "*CompletedStretch*Tests.swift" | wc -l

# Meditation test files (expect 4)
find ios/BradOS/BradOSCore/Tests -name "*Meditation*Tests.swift" -o -name "*GuidedMeditation*Tests.swift" | wc -l
```

### Step 3: Build full app via xcodebuild

```bash
xcodebuild -project ios/BradOS/BradOS.xcodeproj \
  -scheme BradOS \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -derivedDataPath ~/.cache/brad-os-derived-data \
  -skipPackagePluginValidation \
  build 2>&1 | tail -20
```

Must succeed — verifies no SwiftLint violations in test files and BradOSCore compiles cleanly.

### Step 4: Run BradOSCoreTests via xcodebuild

```bash
xcodebuild test \
  -project ios/BradOS/BradOS.xcodeproj \
  -scheme BradOS \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -derivedDataPath ~/.cache/brad-os-derived-data \
  -skipPackagePluginValidation \
  -only-testing:BradOSCoreTests \
  2>&1 | tail -30
```

All tests pass.

### Step 5: Run `npm run validate`

Ensure TypeScript side is unaffected (no source changes to validate, but confirms nothing is broken).

### Step 6: Spot-check specific test behaviors

Manually verify a few edge-case tests match expected behavior:
- `CompletedStretch.id` for `hipFlexors` region produces `"hip_flexors-..."` (snake_case from rawValue)
- `GuidedMeditationScript.formattedDuration` with 650 seconds produces `"10 min"` (integer division truncation)
- `MeditationStats.displayCurrentStreak` returns 0 when `currentStreak` is nil (nil-coalescing fallback)

## Conventions

1. **Swift Testing framework** — `import Testing`, `@Suite`, `@Test`, `#expect`. NOT XCTest. Matches all existing BradOSCore tests.

2. **Test file location** — `ios/BradOS/BradOSCore/Tests/BradOSCoreTests/Models/`. All new files go in the Models subdirectory matching the source file location.

3. **Test helpers** — Use `makeEncoder()` and `makeDecoder()` from `TestHelpers.swift` for all JSON encoding/decoding tests.

4. **No source file modifications** — This task is purely additive test files. Every type being tested is already `public` in BradOSCore.

5. **No force unwrapping** — Use `#expect(x?.y == value)` pattern per SwiftLint rules.

6. **No `swiftlint:disable`** — Fix code structure instead.

7. **File length < 600 lines** — Each test file is well under this limit.

8. **Function body < 60 lines** — Each test function is focused and short.

9. **Git Worktree Workflow** — All changes in a worktree branch, merged to main after validation.

10. **Subagent Usage** — Run `swift test`, `xcodebuild build`, and `xcodebuild test` in subagents to conserve context.
