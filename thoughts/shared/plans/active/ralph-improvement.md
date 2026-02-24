# Barcode + CalendarActivity + Meal + ExerciseHistory: Add iOS Tests for 4 Untested BradOSCore Models

## Why

Four BradOSCore model files have zero test coverage: `Barcode.swift` (BarcodeType, Barcode,
CreateBarcodeDTO, UpdateBarcodeDTO), `CalendarActivity.swift` (ActivityType, CalendarActivity,
ActivitySummary, CalendarDayData), `Meal.swift` (MealType, Meal), and `APIModels.swift`'s
exercise-history cluster (ExerciseHistory, ExerciseHistoryEntry, HistorySet, PersonalRecord).
Each file has snake_case CodingKeys (a common decode-bug surface), custom decoders with default
values, and computed properties — exactly the logic that needs explicit test coverage. Adding 4
test files eliminates the remaining untested model gap and continues the iOS coverage improvement
from B toward B+.

## What

Add 4 new test-only Swift files covering untested BradOSCore model types. No source code changes
needed — every type to test is already `public` in BradOSCore with `Codable` conformance,
computed properties, and mock data.

### Current State

| File | Types | Test Coverage |
|------|-------|---------------|
| Barcode.swift | BarcodeType, Barcode, CreateBarcodeDTO, UpdateBarcodeDTO | ❌ None |
| CalendarActivity.swift | ActivityType, CalendarActivity, ActivitySummary, CalendarDayData | ❌ None |
| Meal.swift | MealType, Meal | ❌ None |
| APIModels.swift (exercise history) | ExerciseHistory, ExerciseHistoryEntry, HistorySet, PersonalRecord | ❌ None |

### Target State (after this task)

| New Test File | Types Covered | Tests |
|---------------|--------------|-------|
| BarcodeTests.swift | BarcodeType, Barcode, CreateBarcodeDTO, UpdateBarcodeDTO | ~13 |
| CalendarActivityTests.swift | ActivityType, CalendarActivity, ActivitySummary, CalendarDayData | ~14 |
| MealTests.swift | MealType, Meal | ~11 |
| ExerciseHistoryTests.swift | ExerciseHistory, ExerciseHistoryEntry, HistorySet, PersonalRecord | ~12 |
| **Total new** | | **~50** |

## Files

All new files are test-only — no source modifications required.

### Test File 1

#### CREATE: `ios/BradOS/BradOSCore/Tests/BradOSCoreTests/Models/BarcodeTests.swift`

Tests `BarcodeType`, `Barcode`, `CreateBarcodeDTO`, and `UpdateBarcodeDTO` — four types with
snake_case CodingKeys, enum raw values, and computed `displayName`.

```swift
import Testing
import Foundation
@testable import BradOSCore

@Suite("BarcodeType")
struct BarcodeTypeTests {

    // MARK: - Display Names

    @Test("code128 displayName is 'Code 128'")
    func code128DisplayName() {
        #expect(BarcodeType.code128.displayName == "Code 128")
    }

    @Test("code39 displayName is 'Code 39'")
    func code39DisplayName() {
        #expect(BarcodeType.code39.displayName == "Code 39")
    }

    @Test("qr displayName is 'QR Code'")
    func qrDisplayName() {
        #expect(BarcodeType.qr.displayName == "QR Code")
    }

    // MARK: - CaseIterable

    @Test("allCases has 3 elements")
    func allCasesCount() {
        #expect(BarcodeType.allCases.count == 3)
    }

    // MARK: - Codable

    @Test("decodes from raw string 'code128'")
    func decodesCode128() throws {
        let json = "\"code128\"".data(using: .utf8)!
        let type = try makeDecoder().decode(BarcodeType.self, from: json)
        #expect(type == .code128)
    }

    @Test("encodes to raw string 'qr'")
    func encodesQR() throws {
        let data = try makeEncoder().encode(BarcodeType.qr)
        let str = String(data: data, encoding: .utf8)!
        #expect(str == "\"qr\"")
    }
}

@Suite("Barcode")
struct BarcodeTests {

    // MARK: - Init & Properties

    @Test("init sets all properties")
    func initSetsProperties() {
        let now = Date()
        let barcode = Barcode(
            id: "b-1",
            label: "Gym",
            value: "12345",
            barcodeType: .code128,
            color: "#FF0000",
            sortOrder: 0,
            createdAt: now,
            updatedAt: now
        )
        #expect(barcode.id == "b-1")
        #expect(barcode.label == "Gym")
        #expect(barcode.value == "12345")
        #expect(barcode.barcodeType == .code128)
        #expect(barcode.color == "#FF0000")
        #expect(barcode.sortOrder == 0)
    }

    // MARK: - Codable

    @Test("decodes from JSON with snake_case keys")
    func decodesFromJSON() throws {
        let json = """
        {
            "id": "b-2",
            "label": "Library",
            "value": "ABC123",
            "barcode_type": "code39",
            "color": "#FACC15",
            "sort_order": 1,
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-02T00:00:00Z"
        }
        """.data(using: .utf8)!
        let barcode = try makeDecoder().decode(Barcode.self, from: json)
        #expect(barcode.id == "b-2")
        #expect(barcode.label == "Library")
        #expect(barcode.barcodeType == .code39)
        #expect(barcode.sortOrder == 1)
    }

    @Test("Codable roundtrip preserves all fields")
    func codableRoundtrip() throws {
        let original = Barcode(
            id: "b-3",
            label: "Test",
            value: "XYZ",
            barcodeType: .qr,
            color: "#FFFFFF",
            sortOrder: 2,
            createdAt: Date(timeIntervalSince1970: 1_700_000_000),
            updatedAt: Date(timeIntervalSince1970: 1_700_000_001)
        )
        let data = try makeEncoder().encode(original)
        let decoded = try makeDecoder().decode(Barcode.self, from: data)
        #expect(decoded.id == original.id)
        #expect(decoded.barcodeType == original.barcodeType)
        #expect(decoded.sortOrder == original.sortOrder)
    }

    // MARK: - Hashable

    @Test("Barcode is usable in Set")
    func hashableInSet() {
        let now = Date(timeIntervalSince1970: 1_700_000_000)
        let b1 = Barcode(
            id: "x", label: "A", value: "1",
            barcodeType: .qr, color: "#000", sortOrder: 0,
            createdAt: now, updatedAt: now
        )
        let b2 = Barcode(
            id: "x", label: "A", value: "1",
            barcodeType: .qr, color: "#000", sortOrder: 0,
            createdAt: now, updatedAt: now
        )
        let set: Set<Barcode> = [b1, b2]
        #expect(set.count == 1)
    }

    // MARK: - Mock Data

    @Test("mockBarcodes has 2 entries")
    func mockBarcodesCount() {
        #expect(Barcode.mockBarcodes.count == 2)
    }

    @Test("first mockBarcode is code128 type")
    func firstMockBarcodeType() {
        #expect(Barcode.mockBarcodes[0].barcodeType == .code128)
    }
}

@Suite("CreateBarcodeDTO")
struct CreateBarcodeDTOTests {

    @Test("encodes barcodeType as string rawValue via snake_case key")
    func encodesBarcodeTypeAsString() throws {
        let dto = CreateBarcodeDTO(
            label: "Test", value: "123", barcodeType: .qr, color: "#000"
        )
        let data = try makeEncoder().encode(dto)
        let obj = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        #expect(obj["barcode_type"] as? String == "qr")
    }

    @Test("sortOrder defaults to 0")
    func sortOrderDefault() throws {
        let dto = CreateBarcodeDTO(
            label: "X", value: "Y", barcodeType: .code128, color: "#FFF"
        )
        let data = try makeEncoder().encode(dto)
        let obj = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        #expect(obj["sort_order"] as? Int == 0)
    }
}

@Suite("UpdateBarcodeDTO")
struct UpdateBarcodeDTOTests {

    @Test("all-nil init omits all fields in JSON output")
    func allNilOmitsFields() throws {
        let dto = UpdateBarcodeDTO()
        let data = try makeEncoder().encode(dto)
        let obj = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        #expect(obj.isEmpty)
    }

    @Test("partial update encodes only set fields")
    func partialUpdate() throws {
        let dto = UpdateBarcodeDTO(label: "Updated", sortOrder: 3)
        let data = try makeEncoder().encode(dto)
        let obj = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        #expect(obj["label"] as? String == "Updated")
        #expect(obj["sort_order"] as? Int == 3)
        #expect(obj["value"] == nil)
    }
}
```

### Test File 2

#### CREATE: `ios/BradOS/BradOSCore/Tests/BradOSCoreTests/Models/CalendarActivityTests.swift`

Tests `ActivityType`, `CalendarActivity`, `ActivitySummary`, and `CalendarDayData` — including
display name computed properties, icon names, custom decoder with defaults, and day-level computed
booleans.

```swift
import Testing
import Foundation
@testable import BradOSCore

@Suite("ActivityType")
struct ActivityTypeTests {

    // MARK: - Display Names

    @Test("workout displayName is 'Lifting'")
    func workoutDisplayName() {
        #expect(ActivityType.workout.displayName == "Lifting")
    }

    @Test("stretch displayName is 'Stretch'")
    func stretchDisplayName() {
        #expect(ActivityType.stretch.displayName == "Stretch")
    }

    @Test("meditation displayName is 'Meditate'")
    func meditationDisplayName() {
        #expect(ActivityType.meditation.displayName == "Meditate")
    }

    // MARK: - Icon Names

    @Test("workout iconName is 'dumbbell.fill'")
    func workoutIconName() {
        #expect(ActivityType.workout.iconName == "dumbbell.fill")
    }

    @Test("stretch iconName is 'figure.flexibility'")
    func stretchIconName() {
        #expect(ActivityType.stretch.iconName == "figure.flexibility")
    }

    @Test("meditation iconName is 'brain.head.profile'")
    func meditationIconName() {
        #expect(ActivityType.meditation.iconName == "brain.head.profile")
    }

    // MARK: - CaseIterable

    @Test("allCases has 3 elements")
    func allCasesCount() {
        #expect(ActivityType.allCases.count == 3)
    }

    // MARK: - Codable

    @Test("decodes from raw string 'workout'")
    func decodesWorkout() throws {
        let json = "\"workout\"".data(using: .utf8)!
        let type = try makeDecoder().decode(ActivityType.self, from: json)
        #expect(type == .workout)
    }
}

@Suite("ActivitySummary")
struct ActivitySummaryTests {

    // MARK: - isDeload default via custom decoder

    @Test("isDeload defaults to false when absent from JSON")
    func isDeloadDefaultsFalse() throws {
        let json = """
        {
            "day_name": "Push Day",
            "exercise_count": 5
        }
        """.data(using: .utf8)!
        let summary = try makeDecoder().decode(ActivitySummary.self, from: json)
        #expect(summary.isDeload == false)
    }

    @Test("decodes workout summary fields with snake_case keys")
    func decodesWorkoutFields() throws {
        let json = """
        {
            "day_name": "Pull Day",
            "exercise_count": 4,
            "sets_completed": 12,
            "total_sets": 16,
            "week_number": 3,
            "is_deload": false
        }
        """.data(using: .utf8)!
        let summary = try makeDecoder().decode(ActivitySummary.self, from: json)
        #expect(summary.dayName == "Pull Day")
        #expect(summary.exerciseCount == 4)
        #expect(summary.setsCompleted == 12)
        #expect(summary.weekNumber == 3)
    }

    @Test("decodes stretch summary fields")
    func decodesStretchFields() throws {
        let json = """
        {
            "total_duration_seconds": 480,
            "regions_completed": 6,
            "regions_skipped": 1
        }
        """.data(using: .utf8)!
        let summary = try makeDecoder().decode(ActivitySummary.self, from: json)
        #expect(summary.totalDurationSeconds == 480)
        #expect(summary.regionsCompleted == 6)
        #expect(summary.regionsSkipped == 1)
    }

    @Test("decodes meditation summary fields")
    func decodesMeditationFields() throws {
        let json = """
        {
            "duration_seconds": 600,
            "meditation_type": "basic-breathing"
        }
        """.data(using: .utf8)!
        let summary = try makeDecoder().decode(ActivitySummary.self, from: json)
        #expect(summary.durationSeconds == 600)
        #expect(summary.meditationType == "basic-breathing")
    }
}

@Suite("CalendarDayData")
struct CalendarDayDataTests {

    // MARK: - Computed activity-presence booleans

    @Test("hasWorkout returns true when workout is present")
    func hasWorkoutTrue() {
        let activity = CalendarActivity(
            id: "w-1", type: .workout, date: Date(), summary: ActivitySummary()
        )
        let day = CalendarDayData(date: Date(), activities: [activity])
        #expect(day.hasWorkout == true)
    }

    @Test("hasWorkout returns false when no workout activity")
    func hasWorkoutFalse() {
        let stretch = CalendarActivity(
            id: "s-1", type: .stretch, date: Date(), summary: ActivitySummary()
        )
        let day = CalendarDayData(date: Date(), activities: [stretch])
        #expect(day.hasWorkout == false)
    }

    @Test("hasStretch returns true when stretch is present")
    func hasStretchTrue() {
        let activity = CalendarActivity(
            id: "s-1", type: .stretch, date: Date(), summary: ActivitySummary()
        )
        let day = CalendarDayData(date: Date(), activities: [activity])
        #expect(day.hasStretch == true)
    }

    @Test("hasMeditation returns true when meditation is present")
    func hasMeditationTrue() {
        let activity = CalendarActivity(
            id: "m-1", type: .meditation, date: Date(), summary: ActivitySummary()
        )
        let day = CalendarDayData(date: Date(), activities: [activity])
        #expect(day.hasMeditation == true)
    }

    @Test("empty activities day has all flags false")
    func emptyDayAllFalse() {
        let day = CalendarDayData(date: Date(), activities: [])
        #expect(day.hasWorkout == false)
        #expect(day.hasStretch == false)
        #expect(day.hasMeditation == false)
    }

    @Test("day with all three types has all flags true")
    func allTypesPresent() {
        let activities = [
            CalendarActivity(id: "w-1", type: .workout, date: Date(), summary: ActivitySummary()),
            CalendarActivity(id: "s-1", type: .stretch, date: Date(), summary: ActivitySummary()),
            CalendarActivity(id: "m-1", type: .meditation, date: Date(), summary: ActivitySummary()),
        ]
        let day = CalendarDayData(date: Date(), activities: activities)
        #expect(day.hasWorkout == true)
        #expect(day.hasStretch == true)
        #expect(day.hasMeditation == true)
    }
}

@Suite("CalendarActivity")
struct CalendarActivityTests {

    @Test("mockActivities has 3 entries")
    func mockActivitiesCount() {
        #expect(CalendarActivity.mockActivities.count == 3)
    }

    @Test("first mockActivity is workout type")
    func firstMockActivityIsWorkout() {
        #expect(CalendarActivity.mockActivities[0].type == .workout)
    }

    @Test("completedAt defaults to nil")
    func completedAtDefaultNil() {
        let activity = CalendarActivity(
            id: "a-1", type: .stretch, date: Date(), summary: ActivitySummary()
        )
        #expect(activity.completedAt == nil)
    }
}
```

### Test File 3

#### CREATE: `ios/BradOS/BradOSCore/Tests/BradOSCoreTests/Models/MealTests.swift`

Tests `MealType` and `Meal` — enum raw values, custom decoder with `prepAhead` default, snake_case
keys, and optional fields.

```swift
import Testing
import Foundation
@testable import BradOSCore

@Suite("MealType")
struct MealTypeTests {

    // MARK: - Raw Values

    @Test("breakfast raw value is 'breakfast'")
    func breakfastRawValue() {
        #expect(MealType.breakfast.rawValue == "breakfast")
    }

    @Test("lunch raw value is 'lunch'")
    func lunchRawValue() {
        #expect(MealType.lunch.rawValue == "lunch")
    }

    @Test("dinner raw value is 'dinner'")
    func dinnerRawValue() {
        #expect(MealType.dinner.rawValue == "dinner")
    }

    // MARK: - CaseIterable

    @Test("allCases has 3 elements")
    func allCasesCount() {
        #expect(MealType.allCases.count == 3)
    }

    // MARK: - Codable

    @Test("decodes from raw string 'lunch'")
    func decodesLunch() throws {
        let json = "\"lunch\"".data(using: .utf8)!
        let type = try makeDecoder().decode(MealType.self, from: json)
        #expect(type == .lunch)
    }
}

@Suite("Meal")
struct MealTests {

    // MARK: - Init & Properties

    @Test("init sets all required properties")
    func initSetsProperties() {
        let now = Date()
        let meal = Meal(
            id: "m-1",
            name: "Chicken Bowl",
            mealType: .lunch,
            effort: 3,
            hasRedMeat: false,
            createdAt: now,
            updatedAt: now
        )
        #expect(meal.id == "m-1")
        #expect(meal.name == "Chicken Bowl")
        #expect(meal.mealType == .lunch)
        #expect(meal.effort == 3)
        #expect(meal.hasRedMeat == false)
        #expect(meal.prepAhead == false)
        #expect(meal.url == nil)
        #expect(meal.lastPlanned == nil)
    }

    // MARK: - Custom Decoder

    @Test("prepAhead defaults to false when absent from JSON")
    func prepAheadDefaultsFalse() throws {
        let json = """
        {
            "id": "m-2",
            "name": "Oatmeal",
            "meal_type": "breakfast",
            "effort": 1,
            "has_red_meat": false,
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:00Z"
        }
        """.data(using: .utf8)!
        let meal = try makeDecoder().decode(Meal.self, from: json)
        #expect(meal.prepAhead == false)
    }

    @Test("decodes optional url field")
    func decodesOptionalURL() throws {
        let json = """
        {
            "id": "m-3",
            "name": "Salmon Bowl",
            "meal_type": "dinner",
            "effort": 4,
            "has_red_meat": false,
            "url": "https://example.com/salmon",
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:00Z"
        }
        """.data(using: .utf8)!
        let meal = try makeDecoder().decode(Meal.self, from: json)
        #expect(meal.url == "https://example.com/salmon")
    }

    @Test("decodes hasRedMeat flag via has_red_meat snake_case key")
    func decodesHasRedMeat() throws {
        let json = """
        {
            "id": "m-4",
            "name": "Steak",
            "meal_type": "dinner",
            "effort": 5,
            "has_red_meat": true,
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:00Z"
        }
        """.data(using: .utf8)!
        let meal = try makeDecoder().decode(Meal.self, from: json)
        #expect(meal.hasRedMeat == true)
    }

    // MARK: - Codable Roundtrip

    @Test("Codable roundtrip preserves all fields including prepAhead")
    func codableRoundtrip() throws {
        let original = Meal(
            id: "m-5",
            name: "Pasta",
            mealType: .dinner,
            effort: 3,
            hasRedMeat: false,
            prepAhead: true,
            url: "https://example.com/pasta",
            lastPlanned: nil,
            createdAt: Date(timeIntervalSince1970: 1_700_000_000),
            updatedAt: Date(timeIntervalSince1970: 1_700_000_000)
        )
        let data = try makeEncoder().encode(original)
        let decoded = try makeDecoder().decode(Meal.self, from: data)
        #expect(decoded.id == original.id)
        #expect(decoded.mealType == original.mealType)
        #expect(decoded.prepAhead == original.prepAhead)
        #expect(decoded.url == original.url)
    }

    // MARK: - Mock Data

    @Test("mockMeals has 4 entries")
    func mockMealsCount() {
        #expect(Meal.mockMeals.count == 4)
    }

    @Test("at least one mockMeal has hasRedMeat true")
    func mockMealsContainRedMeat() {
        let hasRedMeat = Meal.mockMeals.contains { $0.hasRedMeat }
        #expect(hasRedMeat == true)
    }

    @Test("mockMeals cover all three meal types")
    func mockMealsCoverAllTypes() {
        let types = Set(Meal.mockMeals.map { $0.mealType })
        #expect(types.contains(.breakfast))
        #expect(types.contains(.lunch))
        #expect(types.contains(.dinner))
    }
}
```

### Test File 4

#### CREATE: `ios/BradOS/BradOSCore/Tests/BradOSCoreTests/Models/ExerciseHistoryTests.swift`

Tests `ExerciseHistory`, `ExerciseHistoryEntry`, `HistorySet`, and `PersonalRecord` — nested types,
snake_case keys, and the computed `exercise` property that constructs an `Exercise` from history.

```swift
import Testing
import Foundation
@testable import BradOSCore

@Suite("HistorySet")
struct HistorySetTests {

    @Test("init sets all properties")
    func initSetsProperties() {
        let historySet = HistorySet(setNumber: 1, weight: 135.0, reps: 10)
        #expect(historySet.setNumber == 1)
        #expect(historySet.weight == 135.0)
        #expect(historySet.reps == 10)
    }

    @Test("decodes from JSON with snake_case set_number key")
    func decodesFromJSON() throws {
        let json = """
        {
            "set_number": 2,
            "weight": 185.0,
            "reps": 5
        }
        """.data(using: .utf8)!
        let historySet = try makeDecoder().decode(HistorySet.self, from: json)
        #expect(historySet.setNumber == 2)
        #expect(historySet.weight == 185.0)
        #expect(historySet.reps == 5)
    }

    @Test("Codable roundtrip preserves set_number")
    func codableRoundtrip() throws {
        let original = HistorySet(setNumber: 3, weight: 200.0, reps: 3)
        let data = try makeEncoder().encode(original)
        let decoded = try makeDecoder().decode(HistorySet.self, from: data)
        #expect(decoded.setNumber == original.setNumber)
        #expect(decoded.weight == original.weight)
    }
}

@Suite("PersonalRecord")
struct PersonalRecordTests {

    @Test("init sets all properties")
    func initSetsProperties() {
        let date = Date(timeIntervalSince1970: 1_700_000_000)
        let pr = PersonalRecord(weight: 225.0, reps: 1, date: date)
        #expect(pr.weight == 225.0)
        #expect(pr.reps == 1)
        #expect(pr.date == date)
    }

    @Test("Codable roundtrip preserves all fields")
    func codableRoundtrip() throws {
        let original = PersonalRecord(
            weight: 315.0,
            reps: 5,
            date: Date(timeIntervalSince1970: 1_700_000_000)
        )
        let data = try makeEncoder().encode(original)
        let decoded = try makeDecoder().decode(PersonalRecord.self, from: data)
        #expect(decoded.weight == original.weight)
        #expect(decoded.reps == original.reps)
        #expect(decoded.date == original.date)
    }
}

@Suite("ExerciseHistory")
struct ExerciseHistoryTests {

    // MARK: - Computed exercise property

    @Test("exercise computed property uses exerciseId as id")
    func exerciseComputedId() {
        let history = ExerciseHistory(
            exerciseId: "ex-1",
            exerciseName: "Squat",
            entries: [],
            personalRecord: nil
        )
        #expect(history.exercise.id == "ex-1")
    }

    @Test("exercise computed property uses exerciseName as name")
    func exerciseComputedName() {
        let history = ExerciseHistory(
            exerciseId: "ex-2",
            exerciseName: "Deadlift",
            entries: [],
            personalRecord: nil
        )
        #expect(history.exercise.name == "Deadlift")
    }

    @Test("exercise computed property defaults weightIncrement to 5")
    func exerciseWeightIncrementDefault() {
        let history = ExerciseHistory(
            exerciseId: "ex-3",
            exerciseName: "Bench Press",
            entries: [],
            personalRecord: nil
        )
        #expect(history.exercise.weightIncrement == 5)
    }

    // MARK: - Codable

    @Test("decodes from JSON with snake_case exercise_id key")
    func decodesFromJSON() throws {
        let json = """
        {
            "exercise_id": "ex-100",
            "exercise_name": "Overhead Press",
            "entries": [],
            "personal_record": null
        }
        """.data(using: .utf8)!
        let history = try makeDecoder().decode(ExerciseHistory.self, from: json)
        #expect(history.exerciseId == "ex-100")
        #expect(history.exerciseName == "Overhead Press")
        #expect(history.entries.isEmpty)
        #expect(history.personalRecord == nil)
    }

    @Test("decodes nested PersonalRecord")
    func decodesNestedPersonalRecord() throws {
        let json = """
        {
            "exercise_id": "ex-200",
            "exercise_name": "Squat",
            "entries": [],
            "personal_record": {
                "weight": 405.0,
                "reps": 1,
                "date": "2026-01-15T10:00:00Z"
            }
        }
        """.data(using: .utf8)!
        let history = try makeDecoder().decode(ExerciseHistory.self, from: json)
        #expect(history.personalRecord?.weight == 405.0)
        #expect(history.personalRecord?.reps == 1)
    }

    // MARK: - Mock Data

    @Test("mockHistory exerciseName is 'Bench Press'")
    func mockHistoryName() {
        #expect(ExerciseHistory.mockHistory.exerciseName == "Bench Press")
    }

    @Test("mockHistory personal record weight is 185")
    func mockHistoryPRWeight() {
        #expect(ExerciseHistory.mockHistory.personalRecord?.weight == 185)
    }
}

@Suite("ExerciseHistoryEntry")
struct ExerciseHistoryEntryTests {

    @Test("id is computed from workoutId (snake_case workout_id)")
    func idComputedFromWorkoutId() {
        let entry = ExerciseHistoryEntry(
            workoutId: "workout-abc",
            date: Date(),
            weekNumber: 1,
            mesocycleId: "meso-1",
            sets: [],
            bestWeight: 100.0,
            bestSetReps: 8
        )
        #expect(entry.id == "workout-abc")
    }

    @Test("decodes from JSON with snake_case keys")
    func decodesFromJSON() throws {
        let json = """
        {
            "workout_id": "w-999",
            "date": "2026-01-10T00:00:00Z",
            "week_number": 2,
            "mesocycle_id": "meso-x",
            "sets": [
                { "set_number": 1, "weight": 150.0, "reps": 8 }
            ],
            "best_weight": 150.0,
            "best_set_reps": 8
        }
        """.data(using: .utf8)!
        let entry = try makeDecoder().decode(ExerciseHistoryEntry.self, from: json)
        #expect(entry.workoutId == "w-999")
        #expect(entry.weekNumber == 2)
        #expect(entry.sets.count == 1)
        #expect(entry.bestWeight == 150.0)
    }
}
```

## QA

### Step 1: Run BradOSCore tests via SPM

```bash
cd ios/BradOS/BradOSCore && swift test 2>&1 | tail -40
```

All tests must pass. Expect ~110+ total tests (existing ~63 + new ~50). Run in a subagent to
avoid verbose output consuming context.

### Step 2: Verify new test files exist

```bash
find ios/BradOS/BradOSCore/Tests -name "BarcodeTests.swift" \
    -o -name "CalendarActivityTests.swift" \
    -o -name "MealTests.swift" \
    -o -name "ExerciseHistoryTests.swift" | sort
```

Should return 4 paths.

### Step 3: Build full app via xcodebuild

```bash
cd ios/BradOS && xcodebuild build \
    -scheme BradOS \
    -destination 'platform=iOS Simulator,name=iPhone 16' \
    -quiet 2>&1 | tail -20
```

Must succeed with no SwiftLint violations introduced.

### Step 4: Run BradOSCoreTests via xcodebuild

```bash
cd ios/BradOS && xcodebuild test \
    -scheme BradOS \
    -destination 'platform=iOS Simulator,name=iPhone 16' \
    -only-testing:BradOSCoreTests \
    -quiet 2>&1 | tail -30
```

All tests pass.

### Step 5: Run `npm run validate`

```bash
npm run validate
```

Typecheck and lint must pass. Test/architecture failures are pre-existing environment sandbox
issues unrelated to iOS model changes.

### Step 6: Spot-check specific behaviors

After `swift test`, verify these specific behaviors in the output:

- `BarcodeType.code128.displayName` → `"Code 128"` (space, not "Code128")
- `CalendarDayData` with only a stretch activity → `hasWorkout == false`, `hasStretch == true`
- `Meal` decoded without `prep_ahead` field → `prepAhead == false` (custom decoder default)
- `ExerciseHistoryEntry.id` == `workoutId` (computed from `workout_id` snake_case field)
- `ExerciseHistory.exercise.weightIncrement` == `5` (hardcoded default in computed property)

## Summary

| New File | Types Tested | Tests |
|----------|-------------|-------|
| BarcodeTests.swift | BarcodeType (displayName, CaseIterable, Codable), Barcode (Codable snake_case, Hashable, mock), CreateBarcodeDTO (barcodeType as string, sortOrder default), UpdateBarcodeDTO (optional-field omission) | ~13 |
| CalendarActivityTests.swift | ActivityType (displayName, iconName, CaseIterable), ActivitySummary (custom decoder, isDeload default, all three summary types), CalendarDayData (hasWorkout/hasStretch/hasMeditation), CalendarActivity (mock, completedAt default) | ~14 |
| MealTests.swift | MealType (raw values, CaseIterable), Meal (custom decoder, prepAhead default, optional url/lastPlanned, hasRedMeat, Codable roundtrip, mock data) | ~11 |
| ExerciseHistoryTests.swift | HistorySet (snake_case set_number, Codable), PersonalRecord (Codable roundtrip), ExerciseHistory (computed exercise id/name/weightIncrement, nested PR, mock), ExerciseHistoryEntry (id computed from workoutId) | ~12 |
| **Total** | | **~50** |

## Conventions

1. **Swift Testing framework** — use `import Testing`, `@Suite`, `@Test`, `#expect`. NOT XCTest.
2. **Test file location** — `ios/BradOS/BradOSCore/Tests/BradOSCoreTests/Models/`
3. **JSON helpers** — use `makeEncoder()` / `makeDecoder()` from `TestHelpers.swift` for all
   Codable tests.
4. **No force unwrapping** — use `try` or `#expect(...) != nil` patterns.
5. **No `swiftlint:disable`** — write code that passes SwiftLint by default.
6. **File length < 600 lines**, function body < 60 lines.
7. **Run `swift test` and `xcodebuild` in subagents** — they produce verbose output; tail the
   last 30–40 lines and capture failures before reporting.
