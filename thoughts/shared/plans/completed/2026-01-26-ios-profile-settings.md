# iOS Profile & Settings Implementation Plan

## Overview

Implement the Profile & Settings feature for the native iOS app, providing users with activity statistics (mesocycles, meditation sessions) and iOS notification management. This translates the PWA's Profile page functionality to native iOS using SwiftUI and the UserNotifications framework.

## Current State Analysis

### What Exists

**ProfileView** (`ios/BradOS/BradOS/Views/Profile/ProfileView.swift`):
- Statistics section with 4 `StatCard` components displaying mock data (lines 6-9)
- Settings section with non-functional notification toggle (line 10)
- About section with version info
- Reusable `StatCard` component (lines 180-211)
- Reusable `SettingsRow` component (lines 214-245)

**Theme System** (`ios/BradOS/BradOS/Theme/Theme.swift`):
- Colors: `success` (green), `warning` (orange/yellow), `error` (red)
- Status colors already defined for enabled/warning/error states

### What's Missing

1. **Real data integration** - Stats are hardcoded mock values
2. **Notification permission management** - Toggle doesn't interact with iOS notification system
3. **Permission state UI** - No status indicators (enabled/denied/not-determined)
4. **Test notification flow** - No way to verify notifications work
5. **Error/loading states** - No handling for API failures or loading

## Desired End State

Per the spec (`ios/specs/profile-settings.md`), the Profile page will:

1. **Display real activity statistics**:
   - Mesocycles completed (filtered from all mesocycles)
   - Total mesocycles
   - Meditation sessions count
   - Total meditation time in minutes

2. **Manage iOS notification permissions**:
   - Show current permission state with colored status icon
   - "Enable Notifications" button when permission not determined
   - Recovery instructions when permission denied
   - "Send Test Notification" button when enabled

3. **Handle all permission states**:
   - `.notDetermined` → Yellow warning icon, "Notifications not set up", show enable button
   - `.authorized` → Green check icon, "Notifications enabled", show test button
   - `.denied` → Red X icon, "Notifications blocked", show Settings instructions

## Key Discoveries

### iOS Notification System (differs from PWA)

The PWA uses browser `Notification` API + service workers. iOS uses `UserNotifications` framework:

```swift
import UserNotifications

// Check permission
UNUserNotificationCenter.current().getNotificationSettings { settings in
    settings.authorizationStatus // .notDetermined, .authorized, .denied, .provisional
}

// Request permission
UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
    // Handle result
}

// Schedule local notification
let content = UNMutableNotificationContent()
content.title = "Test Notification"
content.body = "This is a test"
let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 5, repeats: false)
let request = UNNotificationRequest(identifier: "test", content: content, trigger: trigger)
UNUserNotificationCenter.current().add(request)
```

### API Endpoints Needed

From PWA implementation analysis:

| Endpoint | Returns | Used For |
|----------|---------|----------|
| `GET /api/mesocycles` | `Mesocycle[]` | Count total and completed mesocycles |
| `GET /api/meditation-sessions/stats` | `{ totalSessions, totalMinutes }` | Meditation statistics |

### Existing Patterns to Follow

- **State management**: `@State` for local UI, `@StateObject` for observable objects
- **Async loading**: Use `Task { }` in `.onAppear` or `.task` modifier
- **View structure**: `NavigationStack` → `ScrollView` → `VStack` with sections
- **Styling**: All colors/spacing from `Theme.*` constants

## What We're NOT Doing

1. **API client implementation** - Handled in separate task; assume `APIClient` exists
2. **Push notifications via APNs** - Only local notifications for now (no server-side push)
3. **PWA installation detection** - Not applicable for native app
4. **Export Data / Clear Data** - Out of scope for this feature
5. **Privacy Policy / Terms links** - Placeholder UI already exists

## Implementation Approach

Use MVVM pattern with:
- `ProfileViewModel` as `@Observable` class managing state and API calls
- `NotificationManager` as singleton for iOS notification APIs
- Keep view layer thin, focused on presentation

---

## Phase 1: Activity Statistics Integration

### Overview
Replace mock statistics with real data fetched from the API using the API client.

### Changes Required

#### 1.1 Create ProfileViewModel

**New file**: `ios/BradOS/BradOS/ViewModels/ProfileViewModel.swift`

```swift
import Foundation

@Observable
class ProfileViewModel {
    // Stats
    var mesocyclesCompleted: Int = 0
    var totalMesocycles: Int = 0
    var meditationSessions: Int = 0
    var meditationMinutes: Int = 0

    // Loading state
    var isLoading: Bool = false
    var error: String? = nil

    func loadStats() async {
        isLoading = true
        error = nil

        do {
            // Use API client to fetch data
            async let mesocycles = APIClient.shared.getMesocycles()
            async let meditationStats = APIClient.shared.getMeditationStats()

            let (mesoData, medData) = try await (mesocycles, meditationStats)

            // Calculate mesocycle stats
            self.totalMesocycles = mesoData.count
            self.mesocyclesCompleted = mesoData.filter { $0.status == "completed" }.count

            // Meditation stats come pre-aggregated
            self.meditationSessions = medData.totalSessions
            self.meditationMinutes = medData.totalMinutes

            isLoading = false
        } catch {
            self.error = error.localizedDescription
            isLoading = false
        }
    }
}
```

#### 1.2 Create API Response Models

**New file**: `ios/BradOS/BradOS/Models/ProfileStats.swift`

```swift
import Foundation

struct MeditationStats: Codable {
    let totalSessions: Int
    let totalMinutes: Int

    enum CodingKeys: String, CodingKey {
        case totalSessions = "totalSessions"
        case totalMinutes = "totalMinutes"
    }
}

// Mesocycle model already exists at Models/Mesocycle.swift
// Just need to ensure it has `status` field for filtering
```

#### 1.3 Update ProfileView

**Modify**: `ios/BradOS/BradOS/Views/Profile/ProfileView.swift`

Changes:
- Replace `@State` mock data with `@State private var viewModel = ProfileViewModel()`
- Add `.task { await viewModel.loadStats() }` modifier
- Update `statsSection` to use `viewModel.*` properties
- Add loading/error states

```swift
// Line 5-10: Replace mock @State vars with:
@State private var viewModel = ProfileViewModel()

// Line 12-30: Add .task modifier after .navigationBarTitleDisplayMode:
.task {
    await viewModel.loadStats()
}

// Lines 41-72: Update StatCard values to use viewModel:
StatCard(
    title: "Mesocycles",
    value: "\(viewModel.mesocyclesCompleted)",
    // ...
)
```

### Success Criteria

- [ ] ProfileView displays real data from API (not mock values)
- [ ] Loading state shown while fetching
- [ ] Error state shown if API fails
- [ ] Stats refresh when view appears
- [ ] Build succeeds with no warnings

### Confirmation Gate
Verify stats display correctly with test API data before proceeding.

---

## Phase 2: iOS Notification Manager

### Overview
Create a notification manager that wraps `UNUserNotificationCenter` for permission checking, requesting, and scheduling.

### Changes Required

#### 2.1 Create NotificationManager

**New file**: `ios/BradOS/BradOS/Services/NotificationManager.swift`

```swift
import Foundation
import UserNotifications

@Observable
class NotificationManager {
    static let shared = NotificationManager()

    // Permission state
    var authorizationStatus: UNAuthorizationStatus = .notDetermined
    var isAuthorized: Bool { authorizationStatus == .authorized }
    var isDenied: Bool { authorizationStatus == .denied }
    var canRequest: Bool { authorizationStatus == .notDetermined }

    private init() {
        Task {
            await refreshAuthorizationStatus()
        }
    }

    /// Refresh the current authorization status from system
    func refreshAuthorizationStatus() async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        await MainActor.run {
            self.authorizationStatus = settings.authorizationStatus
        }
    }

    /// Request notification permission from user
    func requestAuthorization() async -> Bool {
        do {
            let granted = try await UNUserNotificationCenter.current()
                .requestAuthorization(options: [.alert, .sound, .badge])
            await refreshAuthorizationStatus()
            return granted
        } catch {
            print("Failed to request notification authorization: \(error)")
            return false
        }
    }

    /// Schedule a test notification for 5 seconds from now
    func scheduleTestNotification() async throws {
        let content = UNMutableNotificationContent()
        content.title = "Test Notification"
        content.body = "Your notifications are working!"
        content.sound = .default

        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 5, repeats: false)
        let request = UNNotificationRequest(
            identifier: "test-notification-\(UUID().uuidString)",
            content: content,
            trigger: trigger
        )

        try await UNUserNotificationCenter.current().add(request)
    }

    /// Schedule a rest timer notification
    func scheduleRestTimerNotification(
        delaySeconds: TimeInterval,
        exerciseName: String,
        setNumber: Int
    ) async throws {
        let content = UNMutableNotificationContent()
        content.title = "Rest Complete"
        content.body = "Time for \(exerciseName) - Set \(setNumber)"
        content.sound = .default
        content.interruptionLevel = .timeSensitive

        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: delaySeconds, repeats: false)
        let request = UNNotificationRequest(
            identifier: "rest-timer",
            content: content,
            trigger: trigger
        )

        try await UNUserNotificationCenter.current().add(request)
    }

    /// Cancel rest timer notification
    func cancelRestTimerNotification() {
        UNUserNotificationCenter.current()
            .removePendingNotificationRequests(withIdentifiers: ["rest-timer"])
    }
}
```

#### 2.2 Add Info.plist Entry

**Modify**: `ios/BradOS/BradOS/Info.plist`

Add notification usage description (may already exist):

```xml
<key>NSUserNotificationsUsageDescription</key>
<string>BradOS uses notifications to alert you when rest timers complete during workouts.</string>
```

### Success Criteria

- [ ] `NotificationManager.shared` accessible throughout app
- [ ] `refreshAuthorizationStatus()` correctly reads system state
- [ ] `requestAuthorization()` presents system permission dialog
- [ ] `scheduleTestNotification()` delivers notification after 5 seconds
- [ ] Permission state updates reactively when changed

### Confirmation Gate
Test notification flow manually in Simulator/device before proceeding.

---

## Phase 3: Notification Settings UI

### Overview
Update the settings section to show real notification permission state and provide enable/test actions.

### Changes Required

#### 3.1 Create NotificationSettingsView Component

**New file**: `ios/BradOS/BradOS/Components/NotificationSettingsView.swift`

```swift
import SwiftUI

struct NotificationSettingsView: View {
    @State private var notificationManager = NotificationManager.shared
    @State private var isEnabling = false
    @State private var isTesting = false
    @State private var showTestConfirmation = false
    @State private var error: String? = nil

    var body: some View {
        VStack(spacing: 0) {
            // Status Row
            statusRow

            // Enable Button (when not determined)
            if notificationManager.canRequest {
                Divider().background(Theme.border)
                enableButton
            }

            // Test Button (when authorized)
            if notificationManager.isAuthorized {
                Divider().background(Theme.border)
                testButton
            }

            // Denied Instructions
            if notificationManager.isDenied {
                Divider().background(Theme.border)
                deniedInstructions
            }

            // Error Display
            if let error = error {
                Divider().background(Theme.border)
                errorBanner(error)
            }

            // Test Confirmation
            if showTestConfirmation {
                Divider().background(Theme.border)
                confirmationBanner
            }
        }
        .background(Theme.backgroundSecondary)
        .cornerRadius(Theme.CornerRadius.md)
        .task {
            await notificationManager.refreshAuthorizationStatus()
        }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.willEnterForegroundNotification)) { _ in
            Task {
                await notificationManager.refreshAuthorizationStatus()
            }
        }
    }

    // MARK: - Status Row

    @ViewBuilder
    private var statusRow: some View {
        HStack(spacing: Theme.Spacing.md) {
            Image(systemName: statusIconName)
                .foregroundColor(statusColor)
                .frame(width: 24)

            VStack(alignment: .leading, spacing: 2) {
                Text("Notifications")
                    .font(.subheadline)
                    .foregroundColor(Theme.textPrimary)

                Text(statusText)
                    .font(.caption)
                    .foregroundColor(Theme.textSecondary)
            }

            Spacer()

            // Status indicator circle
            Circle()
                .fill(statusColor)
                .frame(width: 10, height: 10)
        }
        .padding(Theme.Spacing.md)
    }

    private var statusIconName: String {
        switch notificationManager.authorizationStatus {
        case .authorized, .provisional, .ephemeral:
            return "bell.fill"
        case .denied:
            return "bell.slash.fill"
        case .notDetermined:
            return "bell.badge.fill"
        @unknown default:
            return "bell.fill"
        }
    }

    private var statusColor: Color {
        switch notificationManager.authorizationStatus {
        case .authorized, .provisional, .ephemeral:
            return Theme.success
        case .denied:
            return Theme.error
        case .notDetermined:
            return Theme.warning
        @unknown default:
            return Theme.textSecondary
        }
    }

    private var statusText: String {
        switch notificationManager.authorizationStatus {
        case .authorized, .provisional, .ephemeral:
            return "Notifications enabled"
        case .denied:
            return "Notifications blocked"
        case .notDetermined:
            return "Notifications not set up"
        @unknown default:
            return "Unknown status"
        }
    }

    // MARK: - Enable Button

    @ViewBuilder
    private var enableButton: some View {
        Button {
            Task {
                isEnabling = true
                error = nil
                let granted = await notificationManager.requestAuthorization()
                isEnabling = false
                if !granted {
                    error = "Permission was not granted"
                }
            }
        } label: {
            HStack {
                if isEnabling {
                    ProgressView()
                        .tint(Theme.textPrimary)
                } else {
                    Text("Enable Notifications")
                }
            }
            .frame(maxWidth: .infinity)
            .padding(Theme.Spacing.md)
        }
        .disabled(isEnabling)
    }

    // MARK: - Test Button

    @ViewBuilder
    private var testButton: some View {
        Button {
            Task {
                isTesting = true
                error = nil
                showTestConfirmation = false

                do {
                    try await notificationManager.scheduleTestNotification()
                    showTestConfirmation = true

                    // Auto-hide confirmation after 5 seconds
                    try? await Task.sleep(for: .seconds(5))
                    showTestConfirmation = false
                } catch {
                    self.error = "Failed to schedule notification"
                }

                isTesting = false
            }
        } label: {
            HStack {
                Image(systemName: "paperplane.fill")
                if isTesting {
                    ProgressView()
                        .tint(Theme.textPrimary)
                } else {
                    Text("Send Test Notification")
                }
            }
            .frame(maxWidth: .infinity)
            .padding(Theme.Spacing.md)
        }
        .disabled(isTesting)
    }

    // MARK: - Denied Instructions

    @ViewBuilder
    private var deniedInstructions: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            Text("To enable notifications:")
                .font(.caption)
                .fontWeight(.medium)
                .foregroundColor(Theme.textPrimary)

            Text("1. Open Settings\n2. Tap BradOS\n3. Tap Notifications\n4. Enable Allow Notifications")
                .font(.caption)
                .foregroundColor(Theme.textSecondary)

            Button {
                if let url = URL(string: UIApplication.openSettingsURLString) {
                    UIApplication.shared.open(url)
                }
            } label: {
                Text("Open Settings")
                    .font(.caption)
                    .fontWeight(.medium)
            }
            .padding(.top, Theme.Spacing.xs)
        }
        .padding(Theme.Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.error.opacity(0.1))
    }

    // MARK: - Banners

    @ViewBuilder
    private func errorBanner(_ message: String) -> some View {
        HStack {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundColor(Theme.error)
            Text(message)
                .font(.caption)
                .foregroundColor(Theme.error)
            Spacer()
            Button {
                error = nil
            } label: {
                Image(systemName: "xmark")
                    .foregroundColor(Theme.textSecondary)
            }
        }
        .padding(Theme.Spacing.md)
        .background(Theme.error.opacity(0.1))
    }

    @ViewBuilder
    private var confirmationBanner: some View {
        HStack {
            Image(systemName: "checkmark.circle.fill")
                .foregroundColor(Theme.success)
            Text("Test notification scheduled! Check in 5 seconds.")
                .font(.caption)
                .foregroundColor(Theme.success)
            Spacer()
        }
        .padding(Theme.Spacing.md)
        .background(Theme.success.opacity(0.1))
    }
}

#Preview {
    VStack {
        NotificationSettingsView()
    }
    .padding()
    .background(Theme.background)
    .preferredColorScheme(.dark)
}
```

#### 3.2 Update ProfileView Settings Section

**Modify**: `ios/BradOS/BradOS/Views/Profile/ProfileView.swift`

Replace the notification toggle row with the new component:

```swift
// Lines 78-126: Replace settingsSection with:

@ViewBuilder
private var settingsSection: some View {
    VStack(alignment: .leading, spacing: Theme.Spacing.md) {
        SectionHeader(title: "Settings")

        // Notification Settings Component
        NotificationSettingsView()

        // Other Settings
        VStack(spacing: 0) {
            // Data Management
            SettingsRow(
                title: "Export Data",
                subtitle: "Download your workout history",
                iconName: "square.and.arrow.up.fill",
                iconColor: Theme.accent
            ) {
                Image(systemName: "chevron.right")
                    .foregroundColor(Theme.textSecondary)
            }

            Divider()
                .background(Theme.border)

            // Clear Data (destructive)
            SettingsRow(
                title: "Clear All Data",
                subtitle: "This cannot be undone",
                iconName: "trash.fill",
                iconColor: Theme.error
            ) {
                Image(systemName: "chevron.right")
                    .foregroundColor(Theme.textSecondary)
            }
        }
        .background(Theme.backgroundSecondary)
        .cornerRadius(Theme.CornerRadius.md)
    }
}
```

Also remove the `@State private var notificationsEnabled` line (line 10) as it's no longer needed.

### Success Criteria

- [ ] Status shows correct icon/color/text for each permission state
- [ ] "Enable Notifications" button appears when permission not determined
- [ ] Tapping enable shows system permission dialog
- [ ] After granting, status updates to "enabled" with green indicator
- [ ] "Send Test Notification" button appears when authorized
- [ ] Test notification arrives after 5 seconds
- [ ] Confirmation banner shows and auto-hides
- [ ] Denied state shows recovery instructions with Settings link
- [ ] Permission state refreshes when returning from Settings app

### Confirmation Gate
Test all three permission states (not determined, authorized, denied) before proceeding.

---

## Phase 4: Error Handling & Polish

### Overview
Add loading states, error handling, and polish the user experience.

### Changes Required

#### 4.1 Add Loading State to Stats Section

**Modify**: `ios/BradOS/BradOS/Views/Profile/ProfileView.swift`

Update `statsSection` to handle loading/error:

```swift
@ViewBuilder
private var statsSection: some View {
    VStack(alignment: .leading, spacing: Theme.Spacing.md) {
        SectionHeader(title: "Statistics")

        if viewModel.isLoading {
            // Loading skeleton
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: Theme.Spacing.md) {
                ForEach(0..<4) { _ in
                    StatCardSkeleton()
                }
            }
        } else if let error = viewModel.error {
            // Error state
            VStack(spacing: Theme.Spacing.sm) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.largeTitle)
                    .foregroundColor(Theme.error)
                Text("Failed to load statistics")
                    .font(.subheadline)
                    .foregroundColor(Theme.textPrimary)
                Text(error)
                    .font(.caption)
                    .foregroundColor(Theme.textSecondary)
                Button("Retry") {
                    Task { await viewModel.loadStats() }
                }
                .buttonStyle(.bordered)
            }
            .frame(maxWidth: .infinity)
            .padding(Theme.Spacing.lg)
            .background(Theme.backgroundSecondary)
            .cornerRadius(Theme.CornerRadius.md)
        } else {
            // Normal stats grid
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: Theme.Spacing.md) {
                StatCard(
                    title: "Mesocycles",
                    value: "\(viewModel.mesocyclesCompleted)",
                    subtitle: "completed",
                    iconName: "trophy.fill",
                    color: Theme.lifting
                )
                // ... rest of StatCards
            }
        }
    }
}
```

#### 4.2 Create StatCard Skeleton

**Add to**: `ios/BradOS/BradOS/Views/Profile/ProfileView.swift` (after StatCard)

```swift
struct StatCardSkeleton: View {
    @State private var isAnimating = false

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            RoundedRectangle(cornerRadius: 4)
                .fill(Theme.border)
                .frame(width: 20, height: 20)

            RoundedRectangle(cornerRadius: 4)
                .fill(Theme.border)
                .frame(width: 60, height: 28)

            RoundedRectangle(cornerRadius: 4)
                .fill(Theme.border)
                .frame(width: 80, height: 12)
        }
        .padding(Theme.Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.backgroundSecondary)
        .cornerRadius(Theme.CornerRadius.md)
        .opacity(isAnimating ? 0.5 : 1.0)
        .animation(.easeInOut(duration: 0.8).repeatForever(autoreverses: true), value: isAnimating)
        .onAppear { isAnimating = true }
    }
}
```

#### 4.3 Add Pull-to-Refresh

**Modify**: `ios/BradOS/BradOS/Views/Profile/ProfileView.swift`

Add refresh capability to ScrollView:

```swift
ScrollView {
    VStack(spacing: Theme.Spacing.lg) {
        // ... sections
    }
    .padding(Theme.Spacing.md)
}
.refreshable {
    await viewModel.loadStats()
}
```

### Success Criteria

- [ ] Loading skeleton shows while fetching data
- [ ] Error state displays with retry button when API fails
- [ ] Pull-to-refresh reloads statistics
- [ ] Smooth animations for loading states
- [ ] No crashes or hangs on slow network

### Confirmation Gate
Test with simulated slow/failing network conditions.

---

## Testing Strategy

### Unit Tests

**NotificationManager tests** (`ios/BradOS/BradOSTests/Services/NotificationManagerTests.swift`):
- Test permission state computed properties
- Test that scheduling creates valid notification request
- Mock `UNUserNotificationCenter` for isolated testing

**ProfileViewModel tests** (`ios/BradOS/BradOSTests/ViewModels/ProfileViewModelTests.swift`):
- Test mesocycle filtering logic (completed count)
- Test loading/error state transitions
- Mock API client responses

### Manual Testing Checklist

| Scenario | Expected Result |
|----------|-----------------|
| Fresh install, open Profile | Stats load, notification status is "not set up" |
| Tap "Enable Notifications" | System dialog appears |
| Grant permission | Status changes to "enabled", test button appears |
| Deny permission | Status changes to "blocked", instructions appear |
| Tap "Send Test Notification" | Confirmation shows, notification arrives in 5s |
| Tap "Open Settings" from denied state | iOS Settings opens to app |
| Return from Settings after enabling | Status updates to "enabled" |
| Pull down on Profile page | Stats refresh |
| API error during load | Error state with retry button |
| No mesocycles/meditations | Stats show 0 values |

---

## References

### Spec Document
- `ios/specs/profile-settings.md` - Full Gherkin requirements

### PWA Implementation (for reference)
- `packages/client/src/pages/ProfilePage.tsx` - PWA profile page
- `packages/client/src/components/Settings/NotificationSettings.tsx` - PWA notification settings
- `packages/client/src/hooks/useNotificationPermission.ts` - Permission hook pattern

### iOS Documentation
- [UNUserNotificationCenter](https://developer.apple.com/documentation/usernotifications/unusernotificationcenter)
- [Requesting authorization](https://developer.apple.com/documentation/usernotifications/asking-permission-to-use-notifications)

### Existing iOS Code
- `ios/BradOS/BradOS/Views/Profile/ProfileView.swift:1-251` - Current profile view
- `ios/BradOS/BradOS/Theme/Theme.swift:1-130` - Theme system
- `ios/BradOS/BradOS/Components/SectionHeader.swift` - Section header component
