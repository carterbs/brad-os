# iOS Unit Testing Implementation Plan

## Overview

Add comprehensive unit test coverage to the iOS app using Swift Testing framework via a Swift Package architecture, targeting sub-15 second test execution. This provides Go/TypeScript-like test speed by testing with `swift test` instead of `xcodebuild test`.

## Current State Analysis

### Existing Infrastructure
- **No test target**: Zero tests exist in the iOS codebase
- **XcodeGen project**: `ios/BradOS/project.yml` generates `BradOS.xcodeproj`
- **Swift 5.9 / iOS 17.0**: Modern Swift features available

### Testability Patterns Already in Place

**MockAPIClient** (`Services/MockAPIClient.swift:1-508`):
```swift
// Static factory methods for test scenarios
static func withDelay(_ seconds: TimeInterval) -> MockAPIClient  // :482
static func failing(with error: APIError? = nil) -> MockAPIClient  // :489
static var empty: MockAPIClient  // :496
```

**Protocol-based DI** (`Services/APIClientProtocol.swift:1-129`):
- All ViewModels accept `APIClientProtocol` in init
- 30+ API methods defined for comprehensive mocking

**UserDefaults Injection** (`Services/WorkoutStateManager.swift:51`):
```swift
init(userDefaults: UserDefaults = .standard)
```

**LoadState Enum** (`ViewModels/LoadState.swift:1-24`):
```swift
enum LoadState<T> {
    case idle, loading, loaded(T), error(Error)
}
```

**ViewModel Preview Helpers** (`ViewModels/DashboardViewModel.swift:221-292`):
```swift
static var preview: DashboardViewModel
static var loading: DashboardViewModel
static var error: DashboardViewModel
static var empty: DashboardViewModel
```

### Files That Can Move to Package (~25 files)

**Models/** (10 files - no iOS framework deps):
- `Exercise.swift`, `Workout.swift`, `Mesocycle.swift`, `Plan.swift`
- `StretchSession.swift`, `MeditationSession.swift`, `Stretch.swift`
- `CalendarActivity.swift`, `APIModels.swift`, `MeditationManifest.swift`

**ViewModels/** (6 files - depend only on APIClientProtocol):
- `LoadState.swift`, `DashboardViewModel.swift`, `CalendarViewModel.swift`
- `ProfileViewModel.swift`, `ExercisesViewModel.swift`, `ExerciseHistoryViewModel.swift`

**Services/** (7 files - testable business logic):
- `APIClientProtocol.swift`, `APIError.swift`, `APIResponse.swift`
- `MockAPIClient.swift`, `WorkoutStateManager.swift`
- `MeditationStorage.swift` (needs UserDefaults protocol)

**Storage/** (2 files - need UserDefaults abstraction):
- `StretchConfigStorage.swift`, `StretchSessionStorage.swift`

### Files That Stay in App (iOS framework deps)
- `RestTimerManager.swift` (AVAudioSession, UNUserNotificationCenter)
- `NotificationManager.swift` (UNUserNotificationCenter)
- `StretchSessionManager.swift` (MediaPlayer, UIApplication)
- `StretchAudioManager.swift`, `MeditationAudioEngine.swift` (AVFoundation)
- All View files

## Desired End State

```bash
$ cd ios/BradOS/BradOSCore && swift test

Test Suite 'All tests' passed.
    Executed 190 tests with 0 failures in 3.2 seconds
```

- **~190 unit tests** covering all business logic from specs
- **< 5 second execution** (target: < 15s)
- **Test-first development** enabled for future iOS features
- **CI/CD ready** - `swift test` runs without simulator

## Key Discoveries

### Swift Testing Framework (Modern Approach)
```swift
import Testing

@Suite("DashboardViewModel")
struct DashboardViewModelTests {
    @Test("loads all data in parallel")
    @MainActor
    func loadsAllData() async {
        let mock = MockAPIClient()
        let vm = DashboardViewModel(apiClient: mock)
        await vm.loadDashboard()
        #expect(vm.workout != nil)
    }
}
```

### @MainActor Testing Pattern
ViewModels are `@MainActor`, so tests must be marked `@MainActor` or use `await`:
```swift
@Test @MainActor func testViewModel() async { ... }
```

### UserDefaults Protocol Pattern
Needed for testing storage classes:
```swift
public protocol UserDefaultsProtocol {
    func data(forKey: String) -> Data?
    func set(_ value: Any?, forKey: String)
    func removeObject(forKey: String)
}
extension UserDefaults: UserDefaultsProtocol {}
```

## What We're NOT Doing

1. **UI Testing** - Not testing SwiftUI views (would require XCTest + simulator)
2. **Integration Testing** - Not testing actual network calls
3. **Audio Testing** - RestTimerManager, StretchAudioManager stay in app
4. **Notification Testing** - NotificationManager stays in app (UNUserNotificationCenter)
5. **Refactoring StretchSessionManager** - Complex state machine stays in app for now

## Implementation Approach

Create a local Swift Package (`BradOSCore`) containing all testable business logic. The app becomes a thin shell that imports the package and adds iOS-specific functionality.

```
ios/BradOS/
├── BradOSCore/                    # NEW: Swift Package
│   ├── Package.swift
│   ├── Sources/BradOSCore/
│   │   ├── Models/
│   │   ├── Protocols/
│   │   ├── ViewModels/
│   │   └── Services/
│   └── Tests/BradOSCoreTests/
├── BradOS/                        # Existing app (imports BradOSCore)
└── project.yml                    # Updated to reference package
```

---

## Phase 1: Create BradOSCore Swift Package

### Overview
Set up the Swift Package with Swift Testing framework enabled.

### Changes Required

**Create `ios/BradOS/BradOSCore/Package.swift`:**
```swift
// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "BradOSCore",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "BradOSCore", targets: ["BradOSCore"])
    ],
    targets: [
        .target(
            name: "BradOSCore",
            path: "Sources/BradOSCore"
        ),
        .testTarget(
            name: "BradOSCoreTests",
            dependencies: ["BradOSCore"],
            path: "Tests/BradOSCoreTests"
        )
    ]
)
```

**Create directory structure:**
```
ios/BradOS/BradOSCore/
├── Package.swift
├── Sources/BradOSCore/
│   ├── Models/
│   ├── Protocols/
│   ├── ViewModels/
│   ├── Services/
│   └── BradOSCore.swift  # Re-exports
└── Tests/BradOSCoreTests/
    ├── Models/
    ├── ViewModels/
    ├── Services/
    └── Helpers/
```

### Success Criteria
- [ ] `cd ios/BradOS/BradOSCore && swift build` succeeds
- [ ] `swift test` runs (even with 0 tests)

### Confirmation Gate
Run `swift build` and `swift test` - both should succeed before proceeding.

---

## Phase 2: Extract Testable Code to Package

### Overview
Move Models, ViewModels, Services, and Protocols from app to package. Update app to import package.

### Changes Required

#### 2.1 Create Abstraction Protocols

**Create `Sources/BradOSCore/Protocols/UserDefaultsProtocol.swift`:**
```swift
import Foundation

/// Protocol for UserDefaults dependency injection in tests
public protocol UserDefaultsProtocol {
    func data(forKey defaultName: String) -> Data?
    func set(_ value: Any?, forKey defaultName: String)
    func removeObject(forKey defaultName: String)
}

extension UserDefaults: UserDefaultsProtocol {}
```

**Create `Sources/BradOSCore/Protocols/MockUserDefaults.swift`:**
```swift
import Foundation

/// In-memory UserDefaults for testing
public final class MockUserDefaults: UserDefaultsProtocol {
    private var storage: [String: Any] = [:]

    public init() {}

    public func data(forKey defaultName: String) -> Data? {
        storage[defaultName] as? Data
    }

    public func set(_ value: Any?, forKey defaultName: String) {
        if let value = value {
            storage[defaultName] = value
        } else {
            storage.removeValue(forKey: defaultName)
        }
    }

    public func removeObject(forKey defaultName: String) {
        storage.removeValue(forKey: defaultName)
    }

    public func clearAll() {
        storage.removeAll()
    }
}
```

#### 2.2 Move Files to Package

**Models** (copy to `Sources/BradOSCore/Models/`):
| Source | Destination |
|--------|-------------|
| `BradOS/Models/Exercise.swift` | `Sources/BradOSCore/Models/Exercise.swift` |
| `BradOS/Models/Workout.swift` | `Sources/BradOSCore/Models/Workout.swift` |
| `BradOS/Models/Mesocycle.swift` | `Sources/BradOSCore/Models/Mesocycle.swift` |
| `BradOS/Models/Plan.swift` | `Sources/BradOSCore/Models/Plan.swift` |
| `BradOS/Models/StretchSession.swift` | `Sources/BradOSCore/Models/StretchSession.swift` |
| `BradOS/Models/MeditationSession.swift` | `Sources/BradOSCore/Models/MeditationSession.swift` |
| `BradOS/Models/Stretch.swift` | `Sources/BradOSCore/Models/Stretch.swift` |
| `BradOS/Models/CalendarActivity.swift` | `Sources/BradOSCore/Models/CalendarActivity.swift` |
| `BradOS/Models/APIModels.swift` | `Sources/BradOSCore/Models/APIModels.swift` |
| `BradOS/Models/MeditationManifest.swift` | `Sources/BradOSCore/Models/MeditationManifest.swift` |

**ViewModels** (copy to `Sources/BradOSCore/ViewModels/`):
| Source | Destination |
|--------|-------------|
| `BradOS/ViewModels/LoadState.swift` | `Sources/BradOSCore/ViewModels/LoadState.swift` |
| `BradOS/ViewModels/DashboardViewModel.swift` | `Sources/BradOSCore/ViewModels/DashboardViewModel.swift` |
| `BradOS/ViewModels/CalendarViewModel.swift` | `Sources/BradOSCore/ViewModels/CalendarViewModel.swift` |
| `BradOS/ViewModels/ProfileViewModel.swift` | `Sources/BradOSCore/ViewModels/ProfileViewModel.swift` |
| `BradOS/ViewModels/ExercisesViewModel.swift` | `Sources/BradOSCore/ViewModels/ExercisesViewModel.swift` |
| `BradOS/ViewModels/ExerciseHistoryViewModel.swift` | `Sources/BradOSCore/ViewModels/ExerciseHistoryViewModel.swift` |

**Protocols** (copy to `Sources/BradOSCore/Protocols/`):
| Source | Destination |
|--------|-------------|
| `BradOS/Services/APIClientProtocol.swift` | `Sources/BradOSCore/Protocols/APIClientProtocol.swift` |

**Services** (copy to `Sources/BradOSCore/Services/`):
| Source | Destination |
|--------|-------------|
| `BradOS/Services/APIError.swift` | `Sources/BradOSCore/Services/APIError.swift` |
| `BradOS/Services/APIResponse.swift` | `Sources/BradOSCore/Services/APIResponse.swift` |
| `BradOS/Services/MockAPIClient.swift` | `Sources/BradOSCore/Services/MockAPIClient.swift` |
| `BradOS/Services/WorkoutStateManager.swift` | `Sources/BradOSCore/Services/WorkoutStateManager.swift` |
| `BradOS/Storage/MeditationStorage.swift` | `Sources/BradOSCore/Services/MeditationStorage.swift` |

#### 2.3 Add Public Access Modifiers

All types, properties, and methods that need to be used by the app or tests must be `public`:

```swift
// Before (in app)
struct Workout: Identifiable, Codable { ... }

// After (in package)
public struct Workout: Identifiable, Codable, Sendable { ... }
```

```swift
// Before (in app)
class DashboardViewModel: ObservableObject { ... }

// After (in package)
@MainActor
public class DashboardViewModel: ObservableObject { ... }
```

#### 2.4 Update WorkoutStateManager for UserDefaults Protocol

**Modify `Sources/BradOSCore/Services/WorkoutStateManager.swift`:**
```swift
// Change line 47 from:
private let userDefaults: UserDefaults

// To:
private let userDefaults: UserDefaultsProtocol

// Change line 51 from:
init(userDefaults: UserDefaults = .standard)

// To:
public init(userDefaults: UserDefaultsProtocol = UserDefaults.standard)
```

#### 2.5 Update MeditationStorage for UserDefaults Protocol

**Modify `Sources/BradOSCore/Services/MeditationStorage.swift`:**
```swift
// Change to use UserDefaultsProtocol
private let userDefaults: UserDefaultsProtocol

public init(userDefaults: UserDefaultsProtocol = UserDefaults.standard) {
    self.userDefaults = userDefaults
}
```

#### 2.6 Create Re-export File

**Create `Sources/BradOSCore/BradOSCore.swift`:**
```swift
// Re-export all public types for clean imports
@_exported import Foundation
```

#### 2.7 Update project.yml

**Modify `ios/BradOS/project.yml`:**
```yaml
packages:
  BradOSCore:
    path: BradOSCore

targets:
  BradOS:
    dependencies:
      - package: BradOSCore
    sources:
      - path: BradOS
        excludes:
          - "*.xcassets"
          - "Resources/Audio"
          # Exclude files now in package
          - "Models/Exercise.swift"
          - "Models/Workout.swift"
          # ... (all moved files)
```

#### 2.8 Add Imports to App Files

Add `import BradOSCore` to all view files that use models/viewmodels.

#### 2.9 Remove Moved Files from App

After confirming build works, delete original files from `BradOS/` directory.

### Success Criteria
- [ ] `cd ios/BradOS/BradOSCore && swift build` succeeds
- [ ] `xcodegen generate` succeeds
- [ ] `xcodebuild -scheme BradOS build` succeeds
- [ ] App runs in simulator with no runtime errors

### Confirmation Gate
Build and run app in simulator. Verify all features still work.

---

## Phase 3: Core Infrastructure Tests

### Overview
Write foundational tests for LoadState, APIError, Model Codable conformance, and WorkoutStateManager.

### Changes Required

#### 3.1 Test Helpers

**Create `Tests/BradOSCoreTests/Helpers/TestHelpers.swift`:**
```swift
import Foundation
@testable import BradOSCore

/// JSON encoder configured like the app
func makeEncoder() -> JSONEncoder {
    let encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .iso8601
    return encoder
}

/// JSON decoder configured like the app
func makeDecoder() -> JSONDecoder {
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601
    return decoder
}
```

#### 3.2 LoadState Tests

**Create `Tests/BradOSCoreTests/ViewModels/LoadStateTests.swift`:**
```swift
import Testing
@testable import BradOSCore

@Suite("LoadState")
struct LoadStateTests {

    @Test("idle state has no data and is not loading")
    func idleState() {
        let state: LoadState<String> = .idle
        #expect(state.data == nil)
        #expect(state.isLoading == false)
        #expect(state.error == nil)
    }

    @Test("loading state is loading")
    func loadingState() {
        let state: LoadState<String> = .loading
        #expect(state.isLoading == true)
        #expect(state.data == nil)
    }

    @Test("loaded state has data")
    func loadedState() {
        let state: LoadState<String> = .loaded("test data")
        #expect(state.data == "test data")
        #expect(state.isLoading == false)
        #expect(state.error == nil)
    }

    @Test("error state has error")
    func errorState() {
        let testError = NSError(domain: "test", code: 1)
        let state: LoadState<String> = .error(testError)
        #expect(state.error != nil)
        #expect(state.isLoading == false)
        #expect(state.data == nil)
    }

    @Test("loaded with empty array has data")
    func loadedWithEmptyArray() {
        let state: LoadState<[String]> = .loaded([])
        #expect(state.data != nil)
        #expect(state.data?.isEmpty == true)
    }
}
```

#### 3.3 APIError Tests

**Create `Tests/BradOSCoreTests/Services/APIErrorTests.swift`:**
```swift
import Testing
@testable import BradOSCore

@Suite("APIError")
struct APIErrorTests {

    @Test("validation error has correct message")
    func validationError() {
        let error = APIError.validation("Name is required")
        #expect(error.message == "Name is required")
        #expect(error.isValidationError)
    }

    @Test("notFound error has correct message")
    func notFoundError() {
        let error = APIError.notFound("Exercise 42 not found")
        #expect(error.message == "Exercise 42 not found")
    }

    @Test("network error wraps underlying error")
    func networkError() {
        let underlying = NSError(domain: "network", code: -1009)
        let error = APIError.network(underlying)
        #expect(error.message.contains("network"))
    }

    @Test("internalError has message")
    func internalError() {
        let error = APIError.internalError("Server error")
        #expect(error.message == "Server error")
    }
}
```

#### 3.4 Model Codable Tests

**Create `Tests/BradOSCoreTests/Models/WorkoutTests.swift`:**
```swift
import Testing
import Foundation
@testable import BradOSCore

@Suite("Workout")
struct WorkoutTests {

    @Test("decodes from server JSON with snake_case keys")
    func decodesFromServerJSON() throws {
        let json = """
        {
            "id": 1,
            "mesocycle_id": 10,
            "plan_day_id": 5,
            "week_number": 2,
            "scheduled_date": "2026-01-15T00:00:00Z",
            "status": "pending"
        }
        """.data(using: .utf8)!

        let decoder = makeDecoder()
        let workout = try decoder.decode(Workout.self, from: json)

        #expect(workout.id == 1)
        #expect(workout.mesocycleId == 10)
        #expect(workout.planDayId == 5)
        #expect(workout.weekNumber == 2)
        #expect(workout.status == .pending)
    }

    @Test("encodes and decodes roundtrip")
    func encodesDecodesRoundtrip() throws {
        let original = Workout.mockTodayWorkout

        let encoder = makeEncoder()
        let data = try encoder.encode(original)

        let decoder = makeDecoder()
        let decoded = try decoder.decode(Workout.self, from: data)

        #expect(decoded.id == original.id)
        #expect(decoded.status == original.status)
    }

    @Test("statusDisplayName returns correct strings", arguments: [
        (WorkoutStatus.pending, "Scheduled"),
        (WorkoutStatus.inProgress, "In Progress"),
        (WorkoutStatus.completed, "Completed"),
        (WorkoutStatus.skipped, "Skipped")
    ])
    func statusDisplayName(status: WorkoutStatus, expected: String) {
        var workout = Workout.mockTodayWorkout
        workout.status = status
        #expect(workout.statusDisplayName == expected)
    }

    @Test("decodes in_progress status correctly")
    func decodesInProgressStatus() throws {
        let json = """
        {
            "id": 1,
            "mesocycle_id": 1,
            "plan_day_id": 1,
            "week_number": 1,
            "scheduled_date": "2026-01-15T00:00:00Z",
            "status": "in_progress"
        }
        """.data(using: .utf8)!

        let workout = try makeDecoder().decode(Workout.self, from: json)
        #expect(workout.status == .inProgress)
    }
}
```

**Create `Tests/BradOSCoreTests/Models/ExerciseTests.swift`:**
```swift
import Testing
import Foundation
@testable import BradOSCore

@Suite("Exercise")
struct ExerciseTests {

    @Test("decodes from server JSON")
    func decodesFromServerJSON() throws {
        let json = """
        {
            "id": 1,
            "name": "Bench Press",
            "weight_increment": 5.0,
            "is_custom": true,
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-15T00:00:00Z"
        }
        """.data(using: .utf8)!

        let exercise = try makeDecoder().decode(Exercise.self, from: json)

        #expect(exercise.id == 1)
        #expect(exercise.name == "Bench Press")
        #expect(exercise.weightIncrement == 5.0)
        #expect(exercise.isCustom == true)
    }

    @Test("mockExercises contains expected data")
    func mockExercisesHasData() {
        let exercises = Exercise.mockExercises
        #expect(!exercises.isEmpty)
        #expect(exercises.contains { $0.name == "Bench Press" })
    }
}
```

#### 3.5 WorkoutStateManager Tests

**Create `Tests/BradOSCoreTests/Services/WorkoutStateManagerTests.swift`:**
```swift
import Testing
import Foundation
@testable import BradOSCore

@Suite("WorkoutStateManager")
struct WorkoutStateManagerTests {

    @Test("initializeForWorkout creates empty state")
    func initializeCreatesEmptyState() {
        let defaults = MockUserDefaults()
        let manager = WorkoutStateManager(userDefaults: defaults)

        manager.initializeForWorkout(workoutId: 123)

        #expect(manager.currentState?.workoutId == 123)
        #expect(manager.currentState?.sets.isEmpty == true)
        #expect(manager.currentState?.pendingEdits.isEmpty == true)
    }

    @Test("updateSet persists set state")
    func updateSetPersistsState() {
        let defaults = MockUserDefaults()
        let manager = WorkoutStateManager(userDefaults: defaults)
        manager.initializeForWorkout(workoutId: 1)

        manager.updateSet(setId: 10, reps: 8, weight: 135.0, status: .completed)

        let stored = manager.currentState?.sets[10]
        #expect(stored?.actualReps == 8)
        #expect(stored?.actualWeight == 135.0)
        #expect(stored?.status == .completed)
    }

    @Test("updatePendingEdit stores edit")
    func updatePendingEditStoresEdit() {
        let defaults = MockUserDefaults()
        let manager = WorkoutStateManager(userDefaults: defaults)
        manager.initializeForWorkout(workoutId: 1)

        manager.updatePendingEdit(setId: 5, weight: 140.0, reps: nil)

        let edit = manager.getPendingEdit(setId: 5)
        #expect(edit?.weight == 140.0)
        #expect(edit?.reps == nil)
    }

    @Test("clearState removes all data")
    func clearStateRemovesData() {
        let defaults = MockUserDefaults()
        let manager = WorkoutStateManager(userDefaults: defaults)
        manager.initializeForWorkout(workoutId: 1)
        manager.updateSet(setId: 1, reps: 10, weight: 100, status: .completed)

        manager.clearState()

        #expect(manager.currentState == nil)
    }

    @Test("hasStateForWorkout returns true for matching ID")
    func hasStateForWorkoutMatching() {
        let defaults = MockUserDefaults()
        let manager = WorkoutStateManager(userDefaults: defaults)
        manager.initializeForWorkout(workoutId: 42)

        #expect(manager.hasStateForWorkout(workoutId: 42) == true)
        #expect(manager.hasStateForWorkout(workoutId: 99) == false)
    }

    @Test("loadState returns nil for corrupted data")
    func loadStateHandlesCorruptedData() {
        let defaults = MockUserDefaults()
        defaults.set(Data("invalid json".utf8), forKey: "brad_os_workout_state")

        let manager = WorkoutStateManager(userDefaults: defaults)

        #expect(manager.currentState == nil)
    }

    @Test("saveTimerState persists timer")
    func saveTimerStatePersists() {
        let defaults = MockUserDefaults()
        let manager = WorkoutStateManager(userDefaults: defaults)
        manager.initializeForWorkout(workoutId: 1)

        let timer = StoredTimerState(
            startedAt: Date(),
            targetSeconds: 90,
            exerciseId: 5,
            setNumber: 2
        )
        manager.saveTimerState(timer)

        let stored = manager.getTimerState()
        #expect(stored?.targetSeconds == 90)
        #expect(stored?.exerciseId == 5)
        #expect(stored?.setNumber == 2)
    }

    @Test("clearTimerState removes timer")
    func clearTimerStateRemoves() {
        let defaults = MockUserDefaults()
        let manager = WorkoutStateManager(userDefaults: defaults)
        manager.initializeForWorkout(workoutId: 1)
        manager.saveTimerState(StoredTimerState(
            startedAt: Date(), targetSeconds: 60, exerciseId: 1, setNumber: 1
        ))

        manager.clearTimerState()

        #expect(manager.getTimerState() == nil)
    }

    @Test("state persists across manager instances")
    func statePersistsAcrossInstances() {
        let defaults = MockUserDefaults()

        // First manager saves state
        let manager1 = WorkoutStateManager(userDefaults: defaults)
        manager1.initializeForWorkout(workoutId: 999)
        manager1.updateSet(setId: 1, reps: 12, weight: 200, status: .completed)

        // Second manager loads same state
        let manager2 = WorkoutStateManager(userDefaults: defaults)

        #expect(manager2.currentState?.workoutId == 999)
        #expect(manager2.currentState?.sets[1]?.actualReps == 12)
    }
}
```

### Success Criteria
- [ ] `swift test` passes all tests
- [ ] Test count: ~40 tests in Phase 3

### Confirmation Gate
`swift test` shows all passing with <5s execution time.

---

## Phase 4: ViewModel Tests

### Overview
Test all ViewModels for loading states, error handling, computed properties, and actions.

### Changes Required

#### 4.1 DashboardViewModel Tests

**Create `Tests/BradOSCoreTests/ViewModels/DashboardViewModelTests.swift`:**
```swift
import Testing
@testable import BradOSCore

@Suite("DashboardViewModel")
struct DashboardViewModelTests {

    // MARK: - Loading States

    @Test("initial state has no data")
    @MainActor
    func initialStateHasNoData() {
        let vm = DashboardViewModel(apiClient: MockAPIClient.empty)

        #expect(vm.workout == nil)
        #expect(vm.latestStretchSession == nil)
        #expect(vm.latestMeditationSession == nil)
        #expect(vm.isLoading == false)
    }

    @Test("loadDashboard fetches all data")
    @MainActor
    func loadDashboardFetchesAllData() async {
        let mock = MockAPIClient()
        mock.mockWorkout = Workout.mockTodayWorkout
        mock.mockStretchSession = StretchSession.mockRecentSession
        mock.mockMeditationSession = MeditationSession.mockRecentSession

        let vm = DashboardViewModel(apiClient: mock)
        await vm.loadDashboard()

        #expect(vm.workout != nil)
        #expect(vm.latestStretchSession != nil)
        #expect(vm.latestMeditationSession != nil)
        #expect(vm.isLoading == false)
    }

    @Test("loadDashboard handles API error")
    @MainActor
    func loadDashboardHandlesError() async {
        let mock = MockAPIClient.failing(with: .network(NSError(domain: "", code: -1)))

        let vm = DashboardViewModel(apiClient: mock)
        await vm.loadDashboard()

        #expect(vm.workoutError != nil)
        #expect(vm.isLoading == false)
    }

    @Test("individual card errors are independent")
    @MainActor
    func individualCardErrorsIndependent() async {
        let mock = MockAPIClient()
        mock.mockWorkout = nil
        mock.mockStretchSession = StretchSession.mockRecentSession
        mock.mockMeditationSession = MeditationSession.mockRecentSession

        let vm = DashboardViewModel(apiClient: mock)
        await vm.loadDashboard()

        // Workout is nil but not an error
        #expect(vm.workout == nil)
        #expect(vm.latestStretchSession != nil)
        #expect(vm.latestMeditationSession != nil)
    }

    // MARK: - Computed Properties

    @Test("hasWorkoutScheduled is true when workout exists")
    @MainActor
    func hasWorkoutScheduledTrue() {
        let vm = DashboardViewModel(apiClient: MockAPIClient())
        vm.workout = Workout.mockTodayWorkout

        #expect(vm.hasWorkoutScheduled == true)
    }

    @Test("hasWorkoutScheduled is false when no workout")
    @MainActor
    func hasWorkoutScheduledFalse() {
        let vm = DashboardViewModel(apiClient: MockAPIClient())

        #expect(vm.hasWorkoutScheduled == false)
    }

    @Test("canStartWorkout is true when status is pending")
    @MainActor
    func canStartWorkoutPending() {
        let vm = DashboardViewModel(apiClient: MockAPIClient())
        var workout = Workout.mockTodayWorkout
        workout.status = .pending
        vm.workout = workout

        #expect(vm.canStartWorkout == true)
    }

    @Test("canStartWorkout is false when status is in_progress")
    @MainActor
    func canStartWorkoutInProgress() {
        let vm = DashboardViewModel(apiClient: MockAPIClient())
        var workout = Workout.mockTodayWorkout
        workout.status = .inProgress
        vm.workout = workout

        #expect(vm.canStartWorkout == false)
    }

    @Test("canContinueWorkout is true when status is in_progress")
    @MainActor
    func canContinueWorkoutInProgress() {
        let vm = DashboardViewModel(apiClient: MockAPIClient())
        var workout = Workout.mockTodayWorkout
        workout.status = .inProgress
        vm.workout = workout

        #expect(vm.canContinueWorkout == true)
    }

    // MARK: - Actions

    @Test("startWorkout throws when no workout")
    @MainActor
    func startWorkoutThrowsWhenNoWorkout() async {
        let vm = DashboardViewModel(apiClient: MockAPIClient())

        await #expect(throws: APIError.self) {
            try await vm.startWorkout()
        }
    }

    @Test("startWorkout updates workout status")
    @MainActor
    func startWorkoutUpdatesStatus() async throws {
        let mock = MockAPIClient()
        var workout = Workout.mockTodayWorkout
        workout.status = .pending
        mock.mockWorkout = workout

        let vm = DashboardViewModel(apiClient: mock)
        vm.workout = workout

        try await vm.startWorkout()

        #expect(vm.workout?.status == .inProgress)
    }

    @Test("skipWorkout throws when no workout")
    @MainActor
    func skipWorkoutThrowsWhenNoWorkout() async {
        let vm = DashboardViewModel(apiClient: MockAPIClient())

        await #expect(throws: APIError.self) {
            try await vm.skipWorkout()
        }
    }
}
```

#### 4.2 CalendarViewModel Tests

**Create `Tests/BradOSCoreTests/ViewModels/CalendarViewModelTests.swift`:**
```swift
import Testing
import Foundation
@testable import BradOSCore

@Suite("CalendarViewModel")
struct CalendarViewModelTests {

    @Test("timezoneOffset calculates correctly")
    @MainActor
    func timezoneOffsetCalculation() {
        let vm = CalendarViewModel(apiClient: MockAPIClient())
        let offset = vm.timezoneOffset

        // Should be minutes from GMT (can be positive or negative)
        #expect(offset >= -720 && offset <= 720)
    }

    @Test("loadCalendarData fetches for current month")
    @MainActor
    func loadCalendarDataFetchesCurrentMonth() async {
        let mock = MockAPIClient()
        mock.mockCalendarData = CalendarData.mockData

        let vm = CalendarViewModel(apiClient: mock)
        await vm.loadCalendarData()

        #expect(vm.calendarData != nil)
        #expect(vm.isLoading == false)
    }

    @Test("navigateToNextMonth increments month")
    @MainActor
    func navigateToNextMonth() {
        let vm = CalendarViewModel(apiClient: MockAPIClient())
        let initialMonth = vm.currentMonth

        vm.navigateToNextMonth()

        let expected = Calendar.current.date(byAdding: .month, value: 1, to: initialMonth)!
        #expect(Calendar.current.isDate(vm.currentMonth, equalTo: expected, toGranularity: .month))
    }

    @Test("navigateToPreviousMonth decrements month")
    @MainActor
    func navigateToPreviousMonth() {
        let vm = CalendarViewModel(apiClient: MockAPIClient())
        let initialMonth = vm.currentMonth

        vm.navigateToPreviousMonth()

        let expected = Calendar.current.date(byAdding: .month, value: -1, to: initialMonth)!
        #expect(Calendar.current.isDate(vm.currentMonth, equalTo: expected, toGranularity: .month))
    }

    @Test("filter changes activity visibility", arguments: [
        (nil, true, true, true),           // All visible
        ("workout", true, false, false),   // Only workouts
        ("stretch", false, true, false),   // Only stretches
        ("meditation", false, false, true) // Only meditation
    ])
    @MainActor
    func filterChangesVisibility(
        filter: String?,
        workoutVisible: Bool,
        stretchVisible: Bool,
        meditationVisible: Bool
    ) {
        let vm = CalendarViewModel(apiClient: MockAPIClient())
        vm.selectedFilter = filter

        #expect(vm.shouldShowActivity(type: "workout") == workoutVisible)
        #expect(vm.shouldShowActivity(type: "stretch") == stretchVisible)
        #expect(vm.shouldShowActivity(type: "meditation") == meditationVisible)
    }
}
```

#### 4.3 ExercisesViewModel Tests

**Create `Tests/BradOSCoreTests/ViewModels/ExercisesViewModelTests.swift`:**
```swift
import Testing
@testable import BradOSCore

@Suite("ExercisesViewModel")
struct ExercisesViewModelTests {

    @Test("initial state is idle")
    @MainActor
    func initialStateIsIdle() {
        let vm = ExercisesViewModel(apiClient: MockAPIClient())

        #expect(vm.exercisesState.data == nil)
        #expect(vm.exercisesState.isLoading == false)
    }

    @Test("loadExercises fetches exercises")
    @MainActor
    func loadExercisesFetches() async {
        let mock = MockAPIClient()
        mock.mockExercises = Exercise.mockExercises

        let vm = ExercisesViewModel(apiClient: mock)
        await vm.loadExercises()

        #expect(vm.exercisesState.data != nil)
        #expect(vm.exercisesState.data?.isEmpty == false)
    }

    @Test("createExercise validates empty name")
    @MainActor
    func createExerciseValidatesEmptyName() async {
        let vm = ExercisesViewModel(apiClient: MockAPIClient())

        let result = await vm.createExercise(name: "", weightIncrement: 5)

        #expect(result == false)
        #expect(vm.validationError != nil)
        #expect(vm.validationError?.contains("required") == true)
    }

    @Test("createExercise validates name length")
    @MainActor
    func createExerciseValidatesNameLength() async {
        let vm = ExercisesViewModel(apiClient: MockAPIClient())
        let longName = String(repeating: "a", count: 101)

        let result = await vm.createExercise(name: longName, weightIncrement: 5)

        #expect(result == false)
        #expect(vm.validationError?.contains("100") == true)
    }

    @Test("createExercise validates positive weight increment")
    @MainActor
    func createExerciseValidatesPositiveIncrement() async {
        let vm = ExercisesViewModel(apiClient: MockAPIClient())

        let result = await vm.createExercise(name: "Test", weightIncrement: 0)

        #expect(result == false)
        #expect(vm.validationError?.contains("positive") == true)
    }

    @Test("createExercise succeeds with valid data")
    @MainActor
    func createExerciseSucceeds() async {
        let mock = MockAPIClient()
        let vm = ExercisesViewModel(apiClient: mock)

        let result = await vm.createExercise(name: "New Exercise", weightIncrement: 2.5)

        #expect(result == true)
        #expect(vm.validationError == nil)
    }

    @Test("deleteExercise removes from list")
    @MainActor
    func deleteExerciseRemoves() async {
        let mock = MockAPIClient()
        mock.mockExercises = Exercise.mockExercises

        let vm = ExercisesViewModel(apiClient: mock)
        await vm.loadExercises()

        let exerciseToDelete = mock.mockExercises.first!
        await vm.deleteExercise(id: exerciseToDelete.id)

        // Mock doesn't actually remove, but API was called
        #expect(vm.error == nil)
    }
}
```

#### 4.4 ProfileViewModel Tests

**Create `Tests/BradOSCoreTests/ViewModels/ProfileViewModelTests.swift`:**
```swift
import Testing
@testable import BradOSCore

@Suite("ProfileViewModel")
struct ProfileViewModelTests {

    @Test("loadStats fetches mesocycles and meditation stats")
    @MainActor
    func loadStatsFetches() async {
        let mock = MockAPIClient()
        mock.mockMesocycles = [Mesocycle.mockActiveMesocycle] + Mesocycle.mockCompletedMesocycles
        mock.mockMeditationStats = MeditationStats.mockStats

        let vm = ProfileViewModel(apiClient: mock)
        await vm.loadStats()

        #expect(vm.isLoading == false)
        #expect(vm.totalMesocycles > 0)
    }

    @Test("mesocyclesCompleted counts only completed status")
    @MainActor
    func mesocyclesCompletedCounts() async {
        let mock = MockAPIClient()
        mock.mockMesocycles = Mesocycle.mockCompletedMesocycles

        let vm = ProfileViewModel(apiClient: mock)
        await vm.loadStats()

        #expect(vm.mesocyclesCompleted == mock.mockMesocycles.filter { $0.status == .completed }.count)
    }

    @Test("meditation minutes calculated from stats")
    @MainActor
    func meditationMinutesCalculated() async {
        let mock = MockAPIClient()
        mock.mockMeditationStats = MeditationStats(
            totalSessions: 10,
            totalDurationSeconds: 3600 // 60 minutes
        )

        let vm = ProfileViewModel(apiClient: mock)
        await vm.loadStats()

        #expect(vm.meditationMinutes == 60)
    }

    @Test("error state is set on API failure")
    @MainActor
    func errorStateOnFailure() async {
        let mock = MockAPIClient.failing()

        let vm = ProfileViewModel(apiClient: mock)
        await vm.loadStats()

        #expect(vm.error != nil)
    }
}
```

### Success Criteria
- [ ] `swift test` passes all tests
- [ ] Test count: ~80 additional tests in Phase 4 (120 total)

### Confirmation Gate
`swift test` shows all passing with <5s execution time.

---

## Phase 5: Business Logic Tests

### Overview
Test specific business logic: date calculations, urgency states, validation helpers.

### Changes Required

#### 5.1 Date Extension Tests

First, add date helper extension to package:

**Create `Sources/BradOSCore/Extensions/Date+Helpers.swift`:**
```swift
import Foundation

public extension Date {
    /// Days since this date (negative if in future)
    func daysSince(_ calendar: Calendar = .current) -> Int {
        calendar.dateComponents([.day], from: self, to: Date()).day ?? 0
    }

    /// Whether this date is today
    func isToday(_ calendar: Calendar = .current) -> Bool {
        calendar.isDateInToday(self)
    }

    /// Whether this date is yesterday
    func isYesterday(_ calendar: Calendar = .current) -> Bool {
        calendar.isDateInYesterday(self)
    }
}
```

**Create `Tests/BradOSCoreTests/Extensions/DateHelpersTests.swift`:**
```swift
import Testing
import Foundation
@testable import BradOSCore

@Suite("Date+Helpers")
struct DateHelpersTests {

    @Test("daysSince returns 0 for today")
    func daysSinceToday() {
        let today = Date()
        #expect(today.daysSince() == 0)
    }

    @Test("daysSince returns 1 for yesterday")
    func daysSinceYesterday() {
        let yesterday = Calendar.current.date(byAdding: .day, value: -1, to: Date())!
        #expect(yesterday.daysSince() == 1)
    }

    @Test("daysSince returns correct value for past dates")
    func daysSincePast() {
        let fiveDaysAgo = Calendar.current.date(byAdding: .day, value: -5, to: Date())!
        #expect(fiveDaysAgo.daysSince() == 5)
    }

    @Test("isToday returns true for today")
    func isTodayTrue() {
        #expect(Date().isToday() == true)
    }

    @Test("isToday returns false for yesterday")
    func isTodayFalse() {
        let yesterday = Calendar.current.date(byAdding: .day, value: -1, to: Date())!
        #expect(yesterday.isToday() == false)
    }

    @Test("isYesterday returns true for yesterday")
    func isYesterdayTrue() {
        let yesterday = Calendar.current.date(byAdding: .day, value: -1, to: Date())!
        #expect(yesterday.isYesterday() == true)
    }
}
```

#### 5.2 Stretch Urgency Tests

**Create `Sources/BradOSCore/Helpers/StretchUrgency.swift`:**
```swift
import Foundation

/// Calculates urgency state for stretch card
public struct StretchUrgency {
    public let message: String
    public let isUrgent: Bool

    public init(daysSince: Int) {
        switch daysSince {
        case 0:
            message = "Stretched today!"
            isUrgent = false
        case 1:
            message = "Last stretched yesterday"
            isUrgent = false
        case 2:
            message = "2 days ago"
            isUrgent = false
        default:
            message = "\(daysSince) days ago - time to stretch!"
            isUrgent = true
        }
    }
}
```

**Create `Tests/BradOSCoreTests/Helpers/StretchUrgencyTests.swift`:**
```swift
import Testing
@testable import BradOSCore

@Suite("StretchUrgency")
struct StretchUrgencyTests {

    @Test("0 days shows stretched today")
    func zeroDays() {
        let urgency = StretchUrgency(daysSince: 0)
        #expect(urgency.message == "Stretched today!")
        #expect(urgency.isUrgent == false)
    }

    @Test("1 day shows yesterday")
    func oneDay() {
        let urgency = StretchUrgency(daysSince: 1)
        #expect(urgency.message == "Last stretched yesterday")
        #expect(urgency.isUrgent == false)
    }

    @Test("2 days is not urgent")
    func twoDays() {
        let urgency = StretchUrgency(daysSince: 2)
        #expect(urgency.message == "2 days ago")
        #expect(urgency.isUrgent == false)
    }

    @Test("3 days is urgent")
    func threeDays() {
        let urgency = StretchUrgency(daysSince: 3)
        #expect(urgency.message.contains("time to stretch"))
        #expect(urgency.isUrgent == true)
    }

    @Test("5 days is urgent", arguments: [3, 4, 5, 7, 14, 30])
    func manyDaysUrgent(days: Int) {
        let urgency = StretchUrgency(daysSince: days)
        #expect(urgency.isUrgent == true)
        #expect(urgency.message.contains("\(days) days ago"))
    }
}
```

#### 5.3 MeditationStorage Tests

**Create `Tests/BradOSCoreTests/Services/MeditationStorageTests.swift`:**
```swift
import Testing
import Foundation
@testable import BradOSCore

@Suite("MeditationStorage")
struct MeditationStorageTests {

    @Test("saveMeditationState persists data")
    func saveStatePersists() {
        let defaults = MockUserDefaults()
        let storage = MeditationStorage(userDefaults: defaults)

        let state = MeditationSessionPersisted(
            duration: .ten,
            startedAt: Date(),
            status: .active
        )
        storage.saveMeditationState(state)

        let loaded = storage.loadMeditationState()
        #expect(loaded?.duration == .ten)
        #expect(loaded?.status == .active)
    }

    @Test("loadMeditationState returns nil when no data")
    func loadStateReturnsNil() {
        let defaults = MockUserDefaults()
        let storage = MeditationStorage(userDefaults: defaults)

        let loaded = storage.loadMeditationState()
        #expect(loaded == nil)
    }

    @Test("clearMeditationState removes data")
    func clearStateRemoves() {
        let defaults = MockUserDefaults()
        let storage = MeditationStorage(userDefaults: defaults)

        storage.saveMeditationState(MeditationSessionPersisted(
            duration: .five,
            startedAt: Date(),
            status: .active
        ))
        storage.clearMeditationState()

        #expect(storage.loadMeditationState() == nil)
    }

    @Test("isSessionStale returns true after 1 hour")
    func isSessionStaleAfterOneHour() {
        let defaults = MockUserDefaults()
        let storage = MeditationStorage(userDefaults: defaults)

        let oldDate = Calendar.current.date(byAdding: .hour, value: -2, to: Date())!
        let state = MeditationSessionPersisted(
            duration: .ten,
            startedAt: oldDate,
            status: .paused,
            pausedAt: oldDate
        )
        storage.saveMeditationState(state)

        #expect(storage.isSessionStale() == true)
    }

    @Test("isSessionStale returns false within 1 hour")
    func isSessionNotStaleWithinOneHour() {
        let defaults = MockUserDefaults()
        let storage = MeditationStorage(userDefaults: defaults)

        let recentDate = Calendar.current.date(byAdding: .minute, value: -30, to: Date())!
        let state = MeditationSessionPersisted(
            duration: .ten,
            startedAt: recentDate,
            status: .paused,
            pausedAt: recentDate
        )
        storage.saveMeditationState(state)

        #expect(storage.isSessionStale() == false)
    }
}
```

### Success Criteria
- [ ] `swift test` passes all tests
- [ ] Test count: ~30 additional tests in Phase 5 (150 total)

### Confirmation Gate
`swift test` shows all passing with <5s execution time.

---

## Phase 6: Storage Tests

### Overview
Complete remaining storage service tests.

### Changes Required

#### 6.1 StretchSession Model Tests

**Create `Tests/BradOSCoreTests/Models/StretchSessionTests.swift`:**
```swift
import Testing
import Foundation
@testable import BradOSCore

@Suite("StretchSession")
struct StretchSessionTests {

    @Test("decodes from server JSON")
    func decodesFromServerJSON() throws {
        let json = """
        {
            "id": "abc-123",
            "completed_at": "2026-01-15T10:30:00Z",
            "total_duration_seconds": 480,
            "regions_completed": 8,
            "regions_skipped": 0
        }
        """.data(using: .utf8)!

        let session = try makeDecoder().decode(StretchSession.self, from: json)

        #expect(session.id == "abc-123")
        #expect(session.totalDurationSeconds == 480)
        #expect(session.regionsCompleted == 8)
    }

    @Test("formattedDuration calculates correctly")
    func formattedDuration() {
        let session = StretchSession(
            id: "1",
            completedAt: Date(),
            totalDurationSeconds: 600, // 10 minutes
            regionsCompleted: 5,
            regionsSkipped: 0,
            stretches: nil
        )

        #expect(session.formattedDuration == "10 min")
    }

    @Test("mockRecentSession has valid data")
    func mockHasValidData() {
        let mock = StretchSession.mockRecentSession

        #expect(mock.id.isEmpty == false)
        #expect(mock.totalDurationSeconds > 0)
        #expect(mock.regionsCompleted > 0)
    }
}
```

#### 6.2 MeditationSession Model Tests

**Create `Tests/BradOSCoreTests/Models/MeditationSessionTests.swift`:**
```swift
import Testing
import Foundation
@testable import BradOSCore

@Suite("MeditationSession")
struct MeditationSessionTests {

    @Test("decodes from server JSON")
    func decodesFromServerJSON() throws {
        let json = """
        {
            "id": 42,
            "completed_at": "2026-01-15T10:30:00Z",
            "session_type": "basic-breathing",
            "planned_duration_seconds": 600,
            "actual_duration_seconds": 595,
            "completed_fully": true
        }
        """.data(using: .utf8)!

        let session = try makeDecoder().decode(MeditationSession.self, from: json)

        #expect(session.id == 42)
        #expect(session.sessionType == "basic-breathing")
        #expect(session.completedFully == true)
    }

    @Test("formattedDuration shows minutes")
    func formattedDurationMinutes() {
        let session = MeditationSession(
            id: 1,
            completedAt: Date(),
            sessionType: "test",
            plannedDurationSeconds: 600,
            actualDurationSeconds: 600,
            completedFully: true
        )

        #expect(session.formattedDuration == "10 min")
    }

    @Test("mockRecentSession has valid data")
    func mockHasValidData() {
        let mock = MeditationSession.mockRecentSession

        #expect(mock.id > 0)
        #expect(mock.plannedDurationSeconds > 0)
    }
}
```

#### 6.3 Additional WorkoutExercise Tests

**Create `Tests/BradOSCoreTests/Models/WorkoutExerciseTests.swift`:**
```swift
import Testing
@testable import BradOSCore

@Suite("WorkoutExercise")
struct WorkoutExerciseTests {

    @Test("formattedRestTime shows seconds under 60")
    func formattedRestTimeSeconds() {
        let exercise = WorkoutExercise(
            exerciseId: 1,
            exerciseName: "Test",
            sets: [],
            totalSets: 3,
            completedSets: 0,
            restSeconds: 45
        )

        #expect(exercise.formattedRestTime == "45s")
    }

    @Test("formattedRestTime shows minutes for 60+")
    func formattedRestTimeMinutes() {
        let exercise = WorkoutExercise(
            exerciseId: 1,
            exerciseName: "Test",
            sets: [],
            totalSets: 3,
            completedSets: 0,
            restSeconds: 120
        )

        #expect(exercise.formattedRestTime == "2m")
    }

    @Test("formattedRestTime shows mixed for non-even minutes")
    func formattedRestTimeMixed() {
        let exercise = WorkoutExercise(
            exerciseId: 1,
            exerciseName: "Test",
            sets: [],
            totalSets: 3,
            completedSets: 0,
            restSeconds: 90
        )

        #expect(exercise.formattedRestTime == "1m 30s")
    }
}
```

### Success Criteria
- [ ] `swift test` passes all tests
- [ ] Test count: ~40 additional tests in Phase 6 (~190 total)
- [ ] Execution time < 5 seconds

### Confirmation Gate
Final `swift test` output:
```
Test Suite 'All tests' passed.
    Executed ~190 tests with 0 failures in X.X seconds
```

---

## Testing Strategy

### Automated Tests
```bash
# Run all tests
cd ios/BradOS/BradOSCore && swift test

# Run specific test suite
swift test --filter "DashboardViewModelTests"

# Run with verbose output
swift test --verbose
```

### Manual Verification
1. Build app: `xcodegen generate && xcodebuild -scheme BradOS build`
2. Run app in simulator: Verify all features still work
3. Check test coverage: Focus on critical paths (ViewModel actions, state persistence)

### CI/CD Integration
Add to GitHub Actions:
```yaml
- name: Run iOS Unit Tests
  run: |
    cd ios/BradOS/BradOSCore
    swift test
```

---

## References

### Research Sources
- [Swift Testing Framework - Apple](https://developer.apple.com/xcode/swift-testing/)
- [60x Faster Xcode Tests via Swift Package](https://justin.searls.co/posts/i-made-xcodes-tests-60-times-faster/)
- [WWDC24: Meet Swift Testing](https://developer.apple.com/videos/play/wwdc2024/10179/)

### Existing iOS Implementation Plans
- `thoughts/shared/plans/2026-01-26-ios-dashboard.md`
- `thoughts/shared/plans/2026-01-26-ios-stretching.md`
- `thoughts/shared/plans/2026-01-26-ios-meditation.md`
- `thoughts/shared/plans/2026-01-26-ios-workout-tracking.md`
- `thoughts/shared/plans/2026-01-26-ios-calendar-history.md`
- `thoughts/shared/plans/2026-01-26-ios-exercise-library.md`
- `thoughts/shared/plans/2026-01-26-ios-profile-settings.md`

### Key Files
- `ios/BradOS/project.yml` - XcodeGen configuration
- `ios/BradOS/BradOS/Services/MockAPIClient.swift` - Existing mock patterns
- `ios/BradOS/BradOS/Services/WorkoutStateManager.swift` - UserDefaults injection pattern
- `ios/BradOS/BradOS/ViewModels/DashboardViewModel.swift` - ViewModel + preview pattern
