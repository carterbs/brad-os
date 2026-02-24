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
