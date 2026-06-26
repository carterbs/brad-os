---
name: metric-history-view
description: >
  Build a new health metric history view page following the established HRV/RHR/Sleep pattern.
  Use when adding a new metric history screen (e.g., weight, VO2 max, body fat, steps).
  Handles the ViewModel, View, navigation wiring, and XcodeGen regeneration.
allowed-tools: Read, Edit, Write, Glob, Grep, Bash(cd * && xcodegen *), Bash(xcodebuild *)
---

# Metric History View Builder

This skill creates a new health metric history view following the exact pattern used by HRV, RHR, and Sleep history views.

## Architecture Overview

Every metric history page has three parts:

1. **ViewModel** — Added to `ios/BradOS/BradOS/ViewModels/HealthMetricHistoryViewModel.swift`
2. **View** — New file at `ios/BradOS/BradOS/Views/Profile/{Metric}HistoryView.swift`
3. **Navigation wiring** — Links added to `ProfileView.swift` and optionally `RecoveryDetailView.swift`

After creating files, regenerate the Xcode project with XcodeGen and verify the build.

## Prerequisites

Before building, determine these parameters from the user:

| Parameter | Example (HRV) | Example (Sleep) |
|-----------|---------------|-----------------|
| Metric name | "HRV" | "Sleep" |
| Unit label | "ms" | "hrs" |
| Accent color | `Theme.interactivePrimary` | `Theme.interactiveSecondary` |
| SF Symbol icon | `"waveform.path.ecg"` | `"bed.double.fill"` |
| API method | `apiClient.getHRVHistory(days:)` | `apiClient.getSleepHistory(days:)` |
| Value extractor | `entry.avgMs` | `Double(entry.totalSleepMinutes) / 60.0` |
| Format string | `"%.0f ms"` | `"%.1f hrs"` |
| Extra sections? | No | Yes (stage breakdown) |

If an API endpoint doesn't exist yet, that must be created first (backend + APIClient).

## Shared Infrastructure (DO NOT recreate)

These already exist and must be reused:

```
ios/BradOS/BradOS/ViewModels/HealthMetricHistoryViewModel.swift
```

- `HealthChartRange` enum — 1W/2W/1M/6M/1Y with `.days` computed property
- `HealthMetricChartPoint` struct — generic `(id, date, value)` for charts

```
ios/BradOS/BradOS/Components/SectionHeader.swift
```

- `SectionHeader(title:)` — section title component

```
ios/BradOS/BradOS/Views/History/HistoryView.swift
```

- `FilterChip(title:, color:, isSelected:, action:)` — range picker chip. The `color` param defaults to `Theme.interactivePrimary`; pass a custom color for non-default accents.

```
ios/BradOS/BradOS/Components/GlassCard.swift
```

- `.glassCard()` / `.glassCard(.card, padding: 0)` view modifier

## Step 1: Create the ViewModel

Append a new `@Observable` class to `HealthMetricHistoryViewModel.swift`.

**For simple single-value metrics** (like HRV, RHR, weight), use `HealthMetricChartPoint` directly:

```swift
// MARK: - {Metric} History ViewModel

@MainActor
@Observable
class {Metric}HistoryViewModel {

    // MARK: - State

    var allHistory: [HealthMetricChartPoint] = []
    var allSmoothedHistory: [HealthMetricChartPoint] = []
    var selectedRange: HealthChartRange = .sixMonths
    var isLoading = false
    var error: String?

    private let apiClient = APIClient.shared

    // MARK: - Computed

    var history: [HealthMetricChartPoint] {
        let cutoff = Calendar.current.date(byAdding: .day, value: -selectedRange.days, to: Date()) ?? Date()
        return allHistory.filter { $0.date >= cutoff }
    }

    var smoothedHistory: [HealthMetricChartPoint] {
        let cutoff = Calendar.current.date(byAdding: .day, value: -selectedRange.days, to: Date()) ?? Date()
        return allSmoothedHistory.filter { $0.date >= cutoff }
    }

    var currentValue: Double? {
        allHistory.last?.value
    }

    var chartYDomain: ClosedRange<Double> {
        let values = history.map(\.value)
        let minVal = values.min() ?? {DEFAULT_MIN}
        let maxVal = values.max() ?? {DEFAULT_MAX}
        let padding = max((maxVal - minVal) * 0.1, {MIN_PADDING})
        return (minVal - padding)...(maxVal + padding)
    }

    // MARK: - Loading

    func loadData() async {
        isLoading = true
        error = nil
        defer { isLoading = false }

        do {
            let entries = try await apiClient.get{Metric}History(days: 365)
            let formatter = DateFormatter()
            formatter.dateFormat = "yyyy-MM-dd"
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.timeZone = .current

            let points = entries.compactMap { entry -> HealthMetricChartPoint? in
                guard let date = formatter.date(from: entry.date) else { return nil }
                return HealthMetricChartPoint(date: date, value: {VALUE_EXTRACTOR})
            }.sorted { $0.date < $1.date }

            // Deduplicate by date (keep latest per day)
            var seen = Set<String>()
            var deduped: [HealthMetricChartPoint] = []
            for point in points.reversed() {
                let key = formatter.string(from: point.date)
                if !seen.contains(key) {
                    seen.insert(key)
                    deduped.append(point)
                }
            }
            allHistory = deduped.reversed()
            allSmoothedHistory = calculateSMA(points: allHistory, window: 7)
        } catch {
            self.error = "Failed to load {metric} history"
            print("[{Metric}HistoryVM] Error: \(error)")
        }
    }

    // MARK: - SMA

    private func calculateSMA(points: [HealthMetricChartPoint], window: Int) -> [HealthMetricChartPoint] {
        guard points.count >= 2 else { return points }

        return points.enumerated().map { index, point in
            let windowStart = max(0, index - window + 1)
            let windowSlice = points[windowStart...index]
            let avg = windowSlice.map(\.value).reduce(0, +) / Double(windowSlice.count)
            return HealthMetricChartPoint(date: point.date, value: avg)
        }
    }
}
```

**For multi-field metrics** (like Sleep with stage breakdowns), create a custom data point struct first, then adapt the ViewModel. See `SleepChartPoint` and `SleepHistoryViewModel` as the reference.

## Step 2: Create the View

Create `ios/BradOS/BradOS/Views/Profile/{Metric}HistoryView.swift`.

The view follows this exact structure:

```swift
import SwiftUI
import Charts

struct {Metric}HistoryView: View {
    @State private var viewModel = {Metric}HistoryViewModel()
    @State private var selectedDate: Date?

    var body: some View {
        ScrollView {
            VStack(spacing: Theme.Spacing.space6) {
                if viewModel.isLoading && viewModel.allHistory.isEmpty {
                    loadingState
                } else {
                    currentValueSection

                    if !viewModel.history.isEmpty {
                        trendChart
                    }

                    // Optional: additional sections (breakdowns, averages, etc.)
                }
            }
            .padding(Theme.Spacing.space5)
        }
        .background(AuroraBackground().ignoresSafeArea())
        .navigationTitle("{Metric} History")
        .navigationBarTitleDisplayMode(.large)
        .toolbarBackground(.hidden, for: .navigationBar)
        .task {
            await viewModel.loadData()
        }
    }

    // ... sections follow
}
```

### Required sections

Every metric history view MUST have these sections:

#### Loading State

```swift
@ViewBuilder
private var loadingState: some View {
    VStack(spacing: Theme.Spacing.space4) {
        ProgressView()
            .tint(Theme.textSecondary)
        Text("Loading {metric} data...")
            .font(.subheadline)
            .foregroundStyle(Theme.textSecondary)
    }
    .frame(maxWidth: .infinity)
    .padding(.top, Theme.Spacing.space8)
}
```

#### Current Value Section

- `SectionHeader(title: "Current {Metric}")` or `"Last Night"` for sleep-like metrics
- HStack with SF Symbol icon, large value (34pt bold rounded, `.monospacedDigit()`), unit label
- Empty state with dimmed icon + "No {metric} data"
- Wrapped in `.glassCard(.card, padding: 0)`

#### Trend Chart

- Header: `SectionHeader(title: "{Metric} Trend")` + `HealthChartRange` `FilterChip` picker
- Pass `color:` to `FilterChip` if accent is not `Theme.interactivePrimary`
- Selected point detail: date + formatted value, shown on drag
- Chart layers (in order):
  1. `PointMark` — daily values, accent color @ 0.5 opacity, symbolSize 20
  2. `LineMark` — 7-day SMA, accent color, `.catmullRom`, lineWidth 2
  3. Selection indicator: `RuleMark` + large `PointMark` (accent, size 50) + white center dot (size 20)
- Chart config:
  - `.chartYScale(domain: viewModel.chartYDomain)`
  - Y axis: leading position, `Theme.textSecondary` labels
  - X axis: `.stride(by: .month, count: 2)`, abbreviated month, `Theme.textTertiary`
  - `.frame(height: 200)`
- Drag gesture overlay for selection (clear rectangle, DragGesture, `chart.value(atX:)`)
- Legend: Daily dot + 7-Day Avg line
- Entire chart section wrapped in `.glassCard()`

#### Nearest Point Helper

```swift
private func nearestPoint(to date: Date) -> HealthMetricChartPoint? {
    viewModel.history.min(by: {
        abs($0.date.timeIntervalSince(date)) < abs($1.date.timeIntervalSince(date))
    })
}
```

#### Preview

```swift
#Preview {
    NavigationStack {
        {Metric}HistoryView()
    }
    .preferredColorScheme(.dark)
}
```

### Optional sections

Add these only when the metric has richer data:

- **Stage/component breakdown** (like Sleep's deep/core/REM) — list of rows with colored icons, labels, and 7-day average values in a `.glassCard(.card, padding: 0)` with dividers
- **Summary stats card** — average values over 7 days

## Step 3: Wire Up Navigation

### ProfileView (`ios/BradOS/BradOS/Views/Profile/ProfileView.swift`)

Add a `NavigationLink` in the health data section, after the existing RHR/Sleep entries:

```swift
Divider().background(Theme.divider)

NavigationLink(destination: {Metric}HistoryView()) {
    SettingsRow(
        title: "{Metric} History",
        subtitle: "{Description of trends}",
        iconName: "{sf.symbol.name}",
        iconColor: {Theme.accentColor}
    ) {
        Image(systemName: "chevron.right")
            .font(.system(size: 14, weight: .semibold))
            .foregroundColor(Theme.textTertiary)
    }
}
.buttonStyle(.plain)
```

### RecoveryDetailView (`ios/BradOS/BradOS/Views/Today/RecoveryDetailView.swift`)

Only add here if the metric is part of the recovery score or displayed on the recovery detail screen.

## Step 4: Regenerate Xcode Project & Build

```bash
cd ios/BradOS && xcodegen generate
```

Then build to verify:

```bash
xcodebuild -project ios/BradOS/BradOS.xcodeproj \
  -scheme BradOS \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -derivedDataPath ~/.cache/brad-os-derived-data \
  build
```

Run the build in a subagent (Task tool with `subagent_type=Bash`) to conserve context.

## Reference Files

Read these files to see the complete implemented patterns:

| File | What to learn |
|------|---------------|
| `ios/BradOS/BradOS/Views/Profile/HRVHistoryView.swift` | Simplest single-value metric view |
| `ios/BradOS/BradOS/Views/Profile/RHRHistoryView.swift` | Single-value with custom accent color (`Theme.destructive`) |
| `ios/BradOS/BradOS/Views/Profile/SleepHistoryView.swift` | Multi-field metric with stage breakdown section |
| `ios/BradOS/BradOS/ViewModels/HealthMetricHistoryViewModel.swift` | All three ViewModels + shared types |
| `ios/BradOS/BradOS/Views/Profile/ProfileView.swift` | Navigation link wiring pattern |
| `ios/BradOS/BradOS/Views/Today/RecoveryDetailView.swift` | Recovery detail navigation wiring |

## Checklist

Before considering the task complete:

- [ ] ViewModel appended to `HealthMetricHistoryViewModel.swift`
- [ ] View created at `Views/Profile/{Metric}HistoryView.swift`
- [ ] NavigationLink added to `ProfileView.swift`
- [ ] NavigationLink added to `RecoveryDetailView.swift` (if applicable)
- [ ] XcodeGen regenerated (`cd ios/BradOS && xcodegen generate`)
- [ ] Build succeeds with no errors
- [ ] Aurora Glass design system followed (use `/aurora-glass` skill if unsure)
