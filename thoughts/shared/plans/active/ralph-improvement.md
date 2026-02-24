# Health Sync: Add iOS Tests for HealthKit Sync Layer

## Why

The HealthKit sync layer has zero iOS test coverage. It contains critical business logic — recovery score calculation (70% HRV + 20% RHR + 10% sleep weighting), baseline computation (60-day rolling medians with standard deviation), chart utilities (SMA, linear regression, date deduplication), and two ViewModels that filter/transform data. All of this is untested. Adding tests reaches Medium iOS coverage and catches regressions in the scoring algorithm that directly affects training recommendations.

## What

Move pure health data models and chart utilities from the main app target into BradOSCore (where the test infrastructure lives), add health API methods to `APIClientProtocol`/`MockAPIClient`, refactor ViewModels for dependency injection, then write comprehensive tests covering:

1. **RecoveryData** — score calculation, state thresholds, edge cases
2. **RecoveryBaseline** — median/stddev calculation, default baseline
3. **SleepMetrics** — efficiency and deep sleep percentage computed properties
4. **HealthSyncModels** — Codable encoding/decoding round-trips
5. **Chart utilities** — SMA, linear regression, date parsing, deduplication
6. **HealthMetricHistoryViewModel** — data loading, range filtering, trend calculation
7. **SleepHistoryViewModel** — data loading, averages, range filtering

## Architecture Constraint

Tests live in `BradOSCoreTests` (SPM test target). Only code inside `BradOSCore/Sources/` is testable from that target. Currently, all health models and ViewModels live in the main app target (`ios/BradOS/BradOS/`). They must be moved to `BradOSCore/Sources/BradOSCore/` to be testable, following the established pattern (e.g., `Workout`, `DashboardViewModel` are already in BradOSCore).

## Files

### Phase 1: Move Pure Data Models to BradOSCore

#### CREATE: `ios/BradOS/BradOSCore/Sources/BradOSCore/Models/RecoveryData.swift`

Move from `ios/BradOS/BradOS/Models/RecoveryData.swift`. Contains these types (add `public` access to all types, properties, initializers, and methods):

- `enum RecoveryState: String, Codable, CaseIterable` — `.ready`/`.moderate`/`.recover` with `displayName` computed property
- `struct RecoveryData: Codable, Equatable` — full recovery assessment with `static func calculate(date:hrvMs:hrvBaseline:rhrBpm:sleepMetrics:) -> RecoveryData`
- `struct RecoveryBaseline: Codable, Equatable` — 60-day rolling medians with `static func calculate(hrvReadings:rhrReadings:)`, `static var default`, and private `standardDeviation()` helper
- `struct SleepMetrics: Equatable` — sleep stage breakdown with computed `efficiency` and `deepPercent`
- `struct HRVReading: Equatable` — date + valueMs
- `struct RHRReading: Equatable` — date + valueBpm

These types have zero dependencies on HealthKit or app-specific code — pure data + pure calculation logic. The only change needed is adding `public` access modifiers.

Key memberwise initializers to add explicitly (since Swift auto-generates internal ones):

```swift
public struct RecoveryData: Codable, Equatable {
    public let date: Date
    public let hrvMs: Double
    public let hrvVsBaseline: Double
    public let rhrBpm: Double
    public let rhrVsBaseline: Double
    public let sleepHours: Double
    public let sleepEfficiency: Double
    public let deepSleepPercent: Double
    public let score: Int
    public let state: RecoveryState

    public init(date: Date, hrvMs: Double, hrvVsBaseline: Double,
                rhrBpm: Double, rhrVsBaseline: Double, sleepHours: Double,
                sleepEfficiency: Double, deepSleepPercent: Double,
                score: Int, state: RecoveryState) { ... }

    public static func calculate(...) -> RecoveryData { ... }
}

public struct SleepMetrics: Equatable {
    public var inBed: TimeInterval = 0
    public var totalSleep: TimeInterval = 0
    public var core: TimeInterval = 0
    public var deep: TimeInterval = 0
    public var rem: TimeInterval = 0
    public var awake: TimeInterval = 0
    public var efficiency: Double { ... }
    public var deepPercent: Double { ... }
    public init(inBed: TimeInterval = 0, totalSleep: TimeInterval = 0,
                core: TimeInterval = 0, deep: TimeInterval = 0,
                rem: TimeInterval = 0, awake: TimeInterval = 0) { ... }
}
```

**After moving:** Delete `ios/BradOS/BradOS/Models/RecoveryData.swift` from the main app target. Add `import BradOSCore` to files that reference these types.

#### CREATE: `ios/BradOS/BradOSCore/Sources/BradOSCore/Models/HealthSyncModels.swift`

Move from `ios/BradOS/BradOS/Models/HealthSyncModels.swift`. Add `public` access. Contains:

- `struct HRVSyncEntry: Encodable` — date, avgMs, minMs, maxMs, sampleCount, source
- `struct HRVHistoryEntry: Codable, Identifiable` — id, date, avgMs
- `struct RHRSyncEntry: Encodable` — date, avgBpm, sampleCount, source
- `struct RHRHistoryEntry: Codable, Identifiable` — id, date, avgBpm
- `struct SleepSyncEntry: Encodable` — full sleep stage breakdown for sync
- `struct SleepHistoryEntry: Codable, Identifiable` — sleep data from backend

Pure Codable DTOs with no dependencies.

**After moving:** Delete `ios/BradOS/BradOS/Models/HealthSyncModels.swift`. Add `import BradOSCore` where needed.

### Phase 2: Move Chart Utilities to BradOSCore

#### CREATE: `ios/BradOS/BradOSCore/Sources/BradOSCore/Models/HealthChartModels.swift`

Extract from top of `ios/BradOS/BradOS/ViewModels/HealthMetricHistoryViewModel.swift`. All types and free functions get `public` access:

```swift
import Foundation

public enum HealthChartRange: String, CaseIterable {
    case oneWeek = "1W"
    case twoWeeks = "2W"
    case oneMonth = "1M"
    case sixMonths = "6M"
    case oneYear = "1Y"

    public var days: Int {
        switch self {
        case .oneWeek: return 7
        case .twoWeeks: return 14
        case .oneMonth: return 30
        case .sixMonths: return 180
        case .oneYear: return 365
        }
    }
}

public struct HealthMetricChartPoint: Identifiable {
    public let id = UUID()
    public let date: Date
    public let value: Double
    public init(date: Date, value: Double) { ... }
}

public struct SleepChartPoint: Identifiable {
    public let id = UUID()
    public let date: Date
    public let totalHours: Double
    public let coreHours: Double
    public let deepHours: Double
    public let remHours: Double
    public let efficiency: Double
    public init(date: Date, totalHours: Double, coreHours: Double,
                deepHours: Double, remHours: Double, efficiency: Double) { ... }
}

public func calculateSMA(points: [HealthMetricChartPoint], window: Int) -> [HealthMetricChartPoint]
// Logic unchanged from original

public func linearRegressionSlope(points: [HealthMetricChartPoint]) -> Double
// Logic unchanged from original

public func parseDatePoints(_ items: [(dateString: String, value: Double)]) -> [HealthMetricChartPoint]
// Logic unchanged from original
```

### Phase 3: Add Health API Methods to Protocol + Mock

#### MODIFY: `ios/BradOS/BradOSCore/Sources/BradOSCore/Protocols/APIClientProtocol.swift`

Add at end of protocol, before closing brace:

```swift
    // MARK: - Health Sync

    /// Get HRV history entries
    func getHRVHistory(days: Int) async throws -> [HRVHistoryEntry]

    /// Get RHR history entries
    func getRHRHistory(days: Int) async throws -> [RHRHistoryEntry]

    /// Get sleep history entries
    func getSleepHistory(days: Int) async throws -> [SleepHistoryEntry]
```

#### MODIFY: `ios/BradOS/BradOSCore/Sources/BradOSCore/Services/MockAPIClient.swift`

Add mock data properties after existing mock data:

```swift
    public var mockHRVHistory: [HRVHistoryEntry] = []
    public var mockRHRHistory: [RHRHistoryEntry] = []
    public var mockSleepHistory: [SleepHistoryEntry] = []
```

Add implementations after existing methods:

```swift
    // MARK: - Health Sync

    public func getHRVHistory(days: Int) async throws -> [HRVHistoryEntry] {
        await simulateDelay()
        try checkForError()
        return mockHRVHistory
    }

    public func getRHRHistory(days: Int) async throws -> [RHRHistoryEntry] {
        await simulateDelay()
        try checkForError()
        return mockRHRHistory
    }

    public func getSleepHistory(days: Int) async throws -> [SleepHistoryEntry] {
        await simulateDelay()
        try checkForError()
        return mockSleepHistory
    }
```

Update `init()` to populate with mock entries:

```swift
    mockHRVHistory = HRVHistoryEntry.mockEntries
    mockRHRHistory = RHRHistoryEntry.mockEntries
    mockSleepHistory = SleepHistoryEntry.mockEntries
```

Update `static var empty` to include:

```swift
    client.mockHRVHistory = []
    client.mockRHRHistory = []
    client.mockSleepHistory = []
```

#### MODIFY: `ios/BradOS/BradOS/Services/APIClient+Cycling.swift` (or wherever real health API methods live)

Ensure the real `APIClient` conforms to the new protocol methods. The methods `getHRVHistory(days:)`, `getRHRHistory(days:)`, `getSleepHistory(days:)` likely already exist on `APIClient` — they just need to satisfy the protocol requirement. If `APIClient` already has these methods and conforms to `APIClientProtocol`, no changes needed here. If it doesn't conform (uses a separate extension without protocol), add the conformance.

#### CREATE: `ios/BradOS/BradOSCore/Sources/BradOSCore/Models/HealthSyncModels+Mock.swift`

Mock data extensions for previews and test setup:

```swift
import Foundation

public extension HRVHistoryEntry {
    static let mockEntries: [HRVHistoryEntry] = {
        let today = Date()
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.locale = Locale(identifier: "en_US_POSIX")
        return (0..<30).map { dayOffset in
            let date = Calendar.current.date(byAdding: .day, value: -dayOffset, to: today)!
            return HRVHistoryEntry(
                id: "hrv-\(dayOffset)",
                date: formatter.string(from: date),
                avgMs: 35.0 + Double.random(in: -10...10)
            )
        }
    }()
}

public extension RHRHistoryEntry {
    static let mockEntries: [RHRHistoryEntry] = {
        // Same pattern, avgBpm: 58.0 + Double.random(in: -5...5)
    }()
}

public extension SleepHistoryEntry {
    static let mockEntries: [SleepHistoryEntry] = {
        // Same pattern with realistic sleep stage data
    }()
}
```

### Phase 4: Move ViewModels to BradOSCore

#### CREATE: `ios/BradOS/BradOSCore/Sources/BradOSCore/ViewModels/HealthMetricHistoryViewModel.swift`

Refactored from `ios/BradOS/BradOS/ViewModels/HealthMetricHistoryViewModel.swift`. Key changes from original:

1. **Dependency injection**: `init(_ metric: HealthMetric, apiClient: any APIClientProtocol)` instead of using `APIClient.shared`
2. **Remove DebugLogger**: Replace `DebugLogger.error(...)` with simple `print(...)` — errors are already stored in `self.error` for UI display
3. **HealthMetric enum**: Move here with `Theme` color references replaced by `ThemeColors` equivalents (ThemeColors is in BradOSCore):
   - `Theme.interactivePrimary` → `ThemeColors.lifting` (same blue accent)
   - `Theme.destructive` → `Color.red`
4. **All types `public`**: `HealthMetric`, `HealthMetricHistoryViewModel`, `SleepHistoryViewModel`
5. **Make `fileprivate` properties `public`**: `errorMessage` and `defaultYRange` on `HealthMetric`

```swift
import Foundation
import SwiftUI

public enum HealthMetric {
    case hrv
    case rhr

    public var navigationTitle: String { /* unchanged */ }
    public var currentSectionTitle: String { /* unchanged */ }
    public var trendTitle: String { /* unchanged */ }
    public var icon: String { /* unchanged - SF Symbol names are just strings */ }
    public var color: Color {
        switch self {
        case .hrv: return ThemeColors.lifting
        case .rhr: return Color.red
        }
    }
    public var unit: String { /* unchanged */ }
    public var noDataText: String { /* unchanged */ }
    public var chartLabel: String { /* unchanged */ }
    public var iconBeforeValue: Bool { /* unchanged */ }
    public var errorMessage: String { /* was fileprivate, now public */ }
    public var defaultYRange: (min: Double, max: Double) { /* was fileprivate, now public */ }
}

@MainActor
@Observable
public class HealthMetricHistoryViewModel {
    public let metric: HealthMetric
    public var allHistory: [HealthMetricChartPoint] = []
    public var allSmoothedHistory: [HealthMetricChartPoint] = []
    public var selectedRange: HealthChartRange = .sixMonths
    public var isLoading = false
    public var error: String?
    public var trendSlope: Double?

    private let apiClient: any APIClientProtocol

    public init(_ metric: HealthMetric, apiClient: any APIClientProtocol) {
        self.metric = metric
        self.apiClient = apiClient
    }

    public var history: [HealthMetricChartPoint] { /* filter by selectedRange — unchanged */ }
    public var smoothedHistory: [HealthMetricChartPoint] { /* unchanged */ }
    public var currentValue: Double? { /* unchanged */ }
    public var projectedTrendPoints: [HealthMetricChartPoint] { /* unchanged */ }
    public var chartYDomain: ClosedRange<Double> { /* unchanged */ }

    public func loadData() async {
        // Same logic but uses self.apiClient instead of APIClient.shared
        // Replace DebugLogger.error with print
    }

    private func updateTrend() { /* unchanged */ }
}

@MainActor
@Observable
public class SleepHistoryViewModel {
    public var allHistory: [SleepChartPoint] = []
    public var selectedRange: HealthChartRange = .sixMonths
    public var isLoading = false
    public var error: String?

    private let apiClient: any APIClientProtocol

    public init(apiClient: any APIClientProtocol) {
        self.apiClient = apiClient
    }

    public var history: [SleepChartPoint] { /* unchanged */ }
    public var currentEntry: SleepChartPoint? { /* unchanged */ }
    public var averageSleepHours: Double? { /* unchanged */ }
    public var averageEfficiency: Double? { /* unchanged */ }
    public var totalSleepPoints: [HealthMetricChartPoint] { /* unchanged */ }
    public var smoothedTotalSleep: [HealthMetricChartPoint] { /* unchanged */ }
    public var chartYDomain: ClosedRange<Double> { /* unchanged */ }

    public func loadData() async {
        // Same logic but uses self.apiClient
        // Replace DebugLogger.error with print
    }
}
```

**After moving:** Delete the ViewModel code and utility functions from `ios/BradOS/BradOS/ViewModels/HealthMetricHistoryViewModel.swift` (the file should be fully deleted since everything moves to BradOSCore across two files: HealthChartModels.swift and this ViewModel file).

### Phase 5: Update Main App References

These files need `import BradOSCore` added and potentially minor call-site updates:

| File | Changes |
|------|---------|
| `ios/BradOS/BradOS/Services/HealthKitManager.swift` | Add `import BradOSCore` (uses `HRVReading`, `RHRReading`, `RecoveryBaseline`) |
| `ios/BradOS/BradOS/Services/HealthKitManager+SleepRecovery.swift` | Add `import BradOSCore` (uses `SleepMetrics`, `RecoveryData`, `RecoveryBaseline`) |
| `ios/BradOS/BradOS/Services/HealthKitSyncService.swift` | Add `import BradOSCore` (uses `RecoveryData`, `RecoveryBaseline`, sync model types) |
| `ios/BradOS/BradOS/Services/HealthKitSyncService+HistorySync.swift` | Add `import BradOSCore` (uses `HRVSyncEntry`, `RHRSyncEntry`, `SleepSyncEntry`, etc.) |
| `ios/BradOS/BradOS/Views/Profile/HealthMetricHistoryView.swift` | Add `import BradOSCore`. Update VM init: `HealthMetricHistoryViewModel(metric, apiClient: APIClient.shared)` |
| `ios/BradOS/BradOS/Views/Profile/HealthSyncView.swift` | Add `import BradOSCore` if it references moved types |
| `ios/BradOS/BradOS/Views/Health/HealthView.swift` | Add `import BradOSCore` if it references `HealthMetric` or chart types |
| Any Sleep history view that creates `SleepHistoryViewModel` | Update: `SleepHistoryViewModel(apiClient: APIClient.shared)` |

#### DELETE these files (replaced by BradOSCore versions):

- `ios/BradOS/BradOS/Models/RecoveryData.swift`
- `ios/BradOS/BradOS/Models/HealthSyncModels.swift`
- `ios/BradOS/BradOS/ViewModels/HealthMetricHistoryViewModel.swift`

### Phase 6: Regenerate Xcode Project

```bash
cd ios/BradOS && xcodegen generate
```

The main app's `project.yml` uses source globs, so deleted files disappear automatically. BradOSCore uses SPM with directory-based source discovery, so new files are auto-included.

### Phase 7: Write Tests

#### CREATE: `ios/BradOS/BradOSCore/Tests/BradOSCoreTests/Models/RecoveryDataTests.swift`

~20 tests covering:

```swift
import Testing
@testable import BradOSCore

@Suite("RecoveryData")
struct RecoveryDataTests {

    // MARK: - RecoveryState
    @Test("RecoveryState displayName returns correct strings")
    // Verify .ready → "Ready", .moderate → "Moderate", .recover → "Recover"

    @Test("RecoveryState raw values are correct for Codable")
    // Verify .ready → "ready", .moderate → "moderate", .recover → "recover"

    // MARK: - RecoveryData.calculate — Score & State
    @Test("calculate returns 'ready' state for above-baseline HRV and good sleep")
    // HRV=50 (baseline 40, stddev 10), RHR=55 (baseline 60), sleep 7.5h/87% eff/20% deep → score≥70

    @Test("calculate returns 'moderate' state for near-baseline values")
    // HRV=38, RHR=62, mediocre sleep → 50≤score<70

    @Test("calculate returns 'recover' state for well-below-baseline HRV")
    // HRV=15, RHR=75, poor sleep → score<50

    @Test("calculate score is clamped 0-100")
    // HRV=200 (extremely high) → score ≤ 100

    // MARK: - RecoveryData.calculate — Component Values
    @Test("calculate hrvVsBaseline is percentage difference from median")
    // HRV=48, median=40 → (48-40)/40*100 = 20%

    @Test("calculate rhrVsBaseline is BPM difference from median")
    // RHR=65, median=60 → 65-60 = 5.0

    @Test("calculate converts sleep totalSleep seconds to hours")
    // totalSleep=7.5*3600 → sleepHours=7.5

    // MARK: - RecoveryData.calculate — Edge Cases
    @Test("calculate handles zero stddev baseline gracefully")
    // stdDev=0 → should not crash, HRV delta defaults to 0

    @Test("calculate handles zero median baseline gracefully")
    // median=0 → should not crash, no divide-by-zero

    // MARK: - RecoveryBaseline
    @Test("RecoveryBaseline.calculate computes median and stddev")
    // [30,35,40,45,50] → median=40, stddev>0; [55,58,60,62,65] → median=60

    @Test("RecoveryBaseline.calculate with empty arrays returns zeros")
    // [] → median=0, stddev=0

    @Test("RecoveryBaseline.calculate with single value returns that value")
    // [42] → median=42, stddev=0

    @Test("RecoveryBaseline.default returns documented values")
    // hrvMedian=36.0, hrvStdDev=15.0, rhrMedian=60.0

    // MARK: - SleepMetrics
    @Test("SleepMetrics efficiency is totalSleep/inBed percentage")
    // inBed=8h, totalSleep=7h → 87.5%

    @Test("SleepMetrics efficiency is 0 when inBed is 0")

    @Test("SleepMetrics deepPercent is deep/totalSleep percentage")
    // totalSleep=7h, deep=1.4h → 20%

    @Test("SleepMetrics deepPercent is 0 when totalSleep is 0")

    @Test("SleepMetrics default initializer has all zeros")

    // MARK: - Codable Round-Trip
    @Test("RecoveryData encodes and decodes correctly")
    // Create via .calculate(), encode, decode, verify score/state/hrvMs match

    @Test("RecoveryBaseline encodes and decodes correctly")
    // Round-trip, verify equality
}
```

#### CREATE: `ios/BradOS/BradOSCore/Tests/BradOSCoreTests/Models/HealthSyncModelsTests.swift`

~9 tests covering JSON encoding/decoding:

```swift
@Suite("HealthSyncModels")
struct HealthSyncModelsTests {

    @Test("HRVSyncEntry encodes to JSON with correct keys")
    // Encode, parse as dictionary, verify date/avgMs/source keys

    @Test("HRVHistoryEntry decodes from JSON")
    // Decode from JSON string, verify id/date/avgMs

    @Test("HRVHistoryEntry Identifiable uses id property")

    @Test("RHRSyncEntry encodes to JSON with correct keys")
    // Verify avgBpm, sampleCount keys

    @Test("RHRHistoryEntry round-trip encoding")
    // Encode, decode, verify values match

    @Test("SleepSyncEntry encodes all fields")
    // Verify all 9 fields present in JSON

    @Test("SleepHistoryEntry decodes from JSON")
    // Decode, verify totalSleepMinutes, deepMinutes, sleepEfficiency

    @Test("SleepHistoryEntry Identifiable uses id property")

    @Test("SleepHistoryEntry round-trip preserves all fields")
}
```

#### CREATE: `ios/BradOS/BradOSCore/Tests/BradOSCoreTests/Models/HealthChartModelsTests.swift`

~15 tests covering chart utility functions:

```swift
@Suite("HealthChartModels")
struct HealthChartModelsTests {

    // MARK: - HealthChartRange
    @Test("HealthChartRange.days returns correct values")
    // oneWeek=7, twoWeeks=14, oneMonth=30, sixMonths=180, oneYear=365

    @Test("HealthChartRange raw values are display strings")
    // "1W", "2W", "1M", "6M", "1Y"

    @Test("HealthChartRange.allCases has 5 cases")

    // MARK: - calculateSMA
    @Test("calculateSMA with window=3 computes rolling average")
    // [10,20,30,40,50] window=3 → [10, 15, 20, 30, 40]

    @Test("calculateSMA returns original points when fewer than 2")
    // Single point → returned as-is

    @Test("calculateSMA returns empty for empty input")

    @Test("calculateSMA window=1 returns original values")

    // MARK: - linearRegressionSlope
    @Test("linearRegressionSlope for perfectly increasing data")
    // 2 units/day → slope ≈ 2.0

    @Test("linearRegressionSlope for flat data returns ~0")

    @Test("linearRegressionSlope for decreasing data returns negative")
    // -1.5 units/day → slope ≈ -1.5

    @Test("linearRegressionSlope returns 0 for empty/single point")

    // MARK: - parseDatePoints
    @Test("parseDatePoints converts date strings to sorted points")
    // Out-of-order dates → sorted ascending

    @Test("parseDatePoints deduplicates by date keeping latest")
    // Two entries for same date → keeps the later one

    @Test("parseDatePoints skips invalid date strings")
    // "not-a-date" → filtered out

    @Test("parseDatePoints returns empty for empty input")
}
```

#### CREATE: `ios/BradOS/BradOSCore/Tests/BradOSCoreTests/ViewModels/HealthMetricHistoryViewModelTests.swift`

~12 tests covering ViewModel behavior with MockAPIClient:

```swift
@Suite("HealthMetricHistoryViewModel")
struct HealthMetricHistoryViewModelTests {

    // MARK: - Initial State
    @Test("initial state is empty with no loading")
    @MainActor
    // Verify allHistory empty, isLoading false, error nil, currentValue nil, trendSlope nil

    // MARK: - Data Loading
    @Test("loadData populates allHistory from HRV API")
    @MainActor
    // Mock 10 HRV entries → allHistory populated, error nil

    @Test("loadData populates allHistory from RHR API")
    @MainActor
    // Mock 10 RHR entries with .rhr metric → allHistory populated

    @Test("loadData sets error on API failure")
    @MainActor
    // MockAPIClient.failing() → error set, allHistory empty, isLoading false

    @Test("loadData calculates smoothed history (7-day SMA)")
    @MainActor
    // 14 entries → allSmoothedHistory populated, same count as allHistory

    // MARK: - Range Filtering
    @Test("history filters by selectedRange")
    @MainActor
    // 60 days of data: oneWeek → ≤8, oneMonth → ~30, sixMonths → all 60

    // MARK: - Computed Properties
    @Test("currentValue returns last point's value")
    @MainActor

    @Test("trendSlope is nil with insufficient data")
    @MainActor
    // <7 smoothed points → trendSlope nil

    @Test("trendSlope is computed with sufficient data")
    @MainActor
    // 28+ data points → trendSlope is a Double

    @Test("chartYDomain provides padded range")
    @MainActor
    // Domain lower bound < min value, upper bound > max value

    @Test("projectedTrendPoints are empty when no trend")
    @MainActor

    @Test("projectedTrendPoints extend 14 days when trend exists")
    @MainActor
}
```

#### CREATE: `ios/BradOS/BradOSCore/Tests/BradOSCoreTests/ViewModels/SleepHistoryViewModelTests.swift`

~12 tests covering SleepHistoryViewModel:

```swift
@Suite("SleepHistoryViewModel")
struct SleepHistoryViewModelTests {

    // MARK: - Initial State
    @Test("initial state is empty")
    @MainActor
    // allHistory empty, isLoading false, error nil, currentEntry nil, averageSleepHours nil

    // MARK: - Data Loading
    @Test("loadData populates history from sleep API")
    @MainActor

    @Test("loadData sets error on failure")
    @MainActor

    @Test("loadData converts minutes to hours")
    @MainActor
    // 420 min → 7.0 hours, 240 min → 4.0 hours, etc.

    @Test("loadData deduplicates entries by date")
    @MainActor
    // Two entries same date → 1 entry in allHistory

    // MARK: - Computed Properties
    @Test("averageSleepHours computes 7-day average")
    @MainActor
    // 7 entries × 420min = 7.0h avg

    @Test("averageEfficiency computes 7-day average")
    @MainActor
    // 7 entries × 90% = 90.0%

    @Test("currentEntry returns last history entry")
    @MainActor

    // MARK: - Range Filtering
    @Test("history filters by selectedRange")
    @MainActor

    // MARK: - Chart Helpers
    @Test("totalSleepPoints maps history to HealthMetricChartPoints")
    @MainActor

    @Test("smoothedTotalSleep applies 7-day SMA")
    @MainActor

    @Test("chartYDomain provides padded range")
    @MainActor
}
```

## Test Summary

| Test File | Count | What It Covers |
|-----------|-------|----------------|
| `RecoveryDataTests.swift` | ~20 | Score calculation (all 3 states), baseline median/stddev, sleep metrics computed props, edge cases, Codable |
| `HealthSyncModelsTests.swift` | ~9 | JSON encoding/decoding for all 6 DTO structs |
| `HealthChartModelsTests.swift` | ~15 | SMA window math, linear regression, date parsing/dedup, HealthChartRange |
| `HealthMetricHistoryViewModelTests.swift` | ~12 | VM loading, error handling, range filtering, trend computation |
| `SleepHistoryViewModelTests.swift` | ~12 | VM loading, minute→hour conversion, dedup, averages, filtering |
| **Total** | **~68** | **Full coverage of health sync pure logic and ViewModels** |

## QA

### Step 1: Build BradOSCore tests via SPM

```bash
cd ios/BradOS/BradOSCore && swift test 2>&1 | tail -30
```

All tests must pass including the new health tests. This verifies the SPM package compiles and tests run.

### Step 2: Build full app via xcodebuild

```bash
cd ios/BradOS && xcodebuild build \
  -project BradOS.xcodeproj \
  -scheme BradOS \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  2>&1 | tail -20
```

Must succeed — verifies all `import BradOSCore` additions and deleted files don't break compilation.

### Step 3: Run BradOSCoreTests via xcodebuild

```bash
cd ios/BradOS && xcodebuild test \
  -project BradOS.xcodeproj \
  -scheme BradOS \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:BradOSCoreTests \
  2>&1 | tail -30
```

All ~90 tests pass (existing 22 + new ~68).

### Step 4: Run the app on simulator and exercise health features

Use `/explore-ios` or manual simulator testing:

1. **Profile → Health Sync** — verify all sync buttons still appear and are tappable
2. **Health → tap HRV card** → HRV History view loads chart data
3. **Health → tap RHR card** → RHR History view loads chart data
4. **Health → tap Sleep card** → Sleep History view loads chart data
5. **Verify range picker** — tap 1W/2W/1M/6M/1Y, chart updates

This validates the refactored ViewModels with `APIClient.shared` injection work correctly at runtime.

### Step 5: Spot-check recovery scoring

Add a temporary print statement in `RecoveryDataTests` to verify exact scoring:
- Baseline: hrvMedian=40, stdDev=10, rhrMedian=60
- Input: HRV=50 (+1σ), RHR=55 (-1σ), sleep 7h/87%/20%
- Expected HRV score: 50 + (1.0 * 25) = 75 → 75 * 0.7 = 52.5
- Expected RHR score: 50 + (1.0 * 25) = 75 → 75 * 0.2 = 15.0
- Expected sleep score: ~93 → 93 * 0.1 = 9.3
- Total: ~76-77 → state = "ready"

Verify the test produces this expected result.

### Step 6: Run `npm run validate`

Ensure TypeScript side is unaffected by the iOS changes.

## Conventions

1. **Testing framework**: Swift Testing (`import Testing`, `@Suite`, `@Test`, `#expect`) — NOT XCTest. Matches all 22 existing BradOSCore tests.

2. **Test file location**: `ios/BradOS/BradOSCore/Tests/BradOSCoreTests/{Models,ViewModels}/` — matches existing directory structure.

3. **Mock pattern**: Use `MockAPIClient` with configurable properties, `MockAPIClient.empty`, `MockAPIClient.failing()` — matches DashboardViewModelTests pattern.

4. **`@MainActor` on async VM tests** — required for `@Observable` ViewModels. Matches CalendarViewModelTests, DashboardViewModelTests.

5. **No force unwrapping** — use optional chaining and `?? 0` in assertions per SwiftLint rules.

6. **No `swiftlint:disable`** — fix the code instead.

7. **All types in BradOSCore must be `public`** — required for cross-module access from tests via `@testable import`.

8. **File length < 600 lines** — if a test file exceeds this, split into separate files (e.g., `RecoveryBaselineTests.swift`).

9. **Function body < 60 lines** — keep individual test functions focused.

10. **Run `xcodegen generate` after file moves** — project.yml uses XcodeGen for the main app target.

11. **Git Worktree Workflow** — all changes in a worktree branch, merged to main after validation.

12. **Subagent Usage** — run `swift test`, `xcodebuild`, and `npm run validate` in subagents to conserve context.
