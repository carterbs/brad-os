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
