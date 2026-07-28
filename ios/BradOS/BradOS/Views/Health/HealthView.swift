import SwiftUI
import BradOSCore

/// Grid view of available health activities and metrics
struct HealthView: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var viewModel: CalendarViewModel
    @State private var isShowingHistory = false

    init(apiClient: APIClientProtocol? = nil) {
        let client = apiClient ?? DefaultAPIClient.instance
        _viewModel = StateObject(wrappedValue: CalendarViewModel(apiClient: client))
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: Theme.Spacing.space6) {
                    VStack(spacing: 0) {
                        ActivityCard(activityType: .workout) {
                            appState.isShowingLiftingContext = true
                        }

                        ActivityCard(activityType: .stretch) {
                            appState.isShowingStretch = true
                        }

                        ActivityCard(activityType: .meditation) {
                            appState.isShowingMeditation = true
                        }
                    }

                    // Recent Activity Section
                    recentActivitySection

                    // Health Metrics Section
                    healthMetricsSection
                }
                .padding(Theme.Spacing.space5)
            }
            .background(AuroraBackground().ignoresSafeArea())
            .navigationTitle("Health")
            .navigationBarTitleDisplayMode(.large)
            .toolbarBackground(.hidden, for: .navigationBar)
            .navigationDestination(isPresented: $isShowingHistory) {
                HistoryView()
            }
            .task {
                await viewModel.fetchMonth()
            }
        }
    }

    // MARK: - Recent Activity Section

    @ViewBuilder
    private var recentActivitySection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            SectionHeader(
                title: "Recent Activity",
                actionTitle: "See All",
                action: { isShowingHistory = true }
            )

            if viewModel.isLoading {
                // Show loading placeholders
                ForEach(0..<3, id: \.self) { _ in
                    RecentActivityRowPlaceholder()
                }
            } else {
                let activities = viewModel.recentActivities(limit: 3)
                if activities.isEmpty {
                    Text("No recent activities")
                        .font(.subheadline)
                        .foregroundColor(Theme.textSecondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .daymarkSection(padding: Theme.Spacing.space4)
                } else {
                    ForEach(activities) { activity in
                        RecentActivityRow(activity: activity)
                    }
                }
            }
        }
    }

    // MARK: - Health Metrics Section

    @ViewBuilder
    private var healthMetricsSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            SectionHeader(title: "Health Metrics")

            VStack(spacing: 0) {
                NavigationLink(destination: HealthMetricHistoryView(.hrv)) {
                    SettingsRow(
                        title: "HRV History",
                        subtitle: "Heart rate variability trends",
                        iconName: "waveform.path.ecg",
                        iconColor: Theme.interactivePrimary
                    ) {
                        Image(systemName: "chevron.right")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(Theme.textTertiary)
                    }
                }
                .contentShape(Rectangle())
                .buttonStyle(.plain)

                Divider().background(Theme.divider)

                NavigationLink(destination: HealthMetricHistoryView(.rhr)) {
                    SettingsRow(
                        title: "RHR History",
                        subtitle: "Resting heart rate trends",
                        iconName: "heart.fill",
                        iconColor: Theme.destructive
                    ) {
                        Image(systemName: "chevron.right")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(Theme.textTertiary)
                    }
                }
                .contentShape(Rectangle())
                .buttonStyle(.plain)

                Divider().background(Theme.divider)

                NavigationLink(destination: SleepHistoryView()) {
                    SettingsRow(
                        title: "Sleep History",
                        subtitle: "Sleep duration and stage trends",
                        iconName: "bed.double.fill",
                        iconColor: Theme.interactiveSecondary
                    ) {
                        Image(systemName: "chevron.right")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(Theme.textTertiary)
                    }
                }
                .contentShape(Rectangle())
                .buttonStyle(.plain)
            }
            .daymarkListGroup()
        }
    }
}

/// Placeholder row for loading state
struct RecentActivityRowPlaceholder: View {
    var body: some View {
        HStack(spacing: Theme.Spacing.space4) {
            RoundedRectangle(cornerRadius: Theme.CornerRadius.sm)
                .fill(Color.white.opacity(0.06))
                .frame(width: 36, height: 36)

            VStack(alignment: .leading, spacing: 4) {
                RoundedRectangle(cornerRadius: Theme.CornerRadius.sm)
                    .fill(Color.white.opacity(0.06))
                    .frame(width: 100, height: 14)

                RoundedRectangle(cornerRadius: Theme.CornerRadius.sm)
                    .fill(Color.white.opacity(0.06))
                    .frame(width: 60, height: 12)
            }

            Spacer()

            RoundedRectangle(cornerRadius: Theme.CornerRadius.sm)
                .fill(Color.white.opacity(0.06))
                .frame(width: 50, height: 12)
        }
        .daymarkSection(padding: Theme.Spacing.space4)
    }
}

/// Row displaying a recent activity
struct RecentActivityRow: View {
    let activity: CalendarActivity

    var body: some View {
        HStack(spacing: Theme.Spacing.space4) {
            // Activity type icon
            Image(systemName: activity.type.iconName)
                .font(.system(size: Theme.Typography.iconXS))
                .foregroundColor(activity.type.color)
                .frame(width: 36, height: 36)
                .background(activity.type.color.opacity(0.2))
                .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))

            VStack(alignment: .leading, spacing: 2) {
                Text(activityTitle)
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .foregroundColor(Theme.textPrimary)

                Text(activitySubtitle)
                    .font(.caption)
                    .foregroundColor(Theme.textSecondary)
            }

            Spacer()

            Text(formattedDate)
                .font(.caption)
                .foregroundColor(Theme.textSecondary)
        }
        .daymarkSection(padding: Theme.Spacing.space4)
    }

    private var activityTitle: String {
        switch activity.type {
        case .workout:
            return activity.summary.dayName ?? "Workout"
        case .stretch:
            return "Stretch Session"
        case .meditation:
            if let meditationType = activity.summary.meditationType {
                return DayActivityCard.formatMeditationType(meditationType)
            }
            return "Meditation"
        case .cycling:
            if let cyclingType = activity.summary.cyclingType {
                return formatCyclingActivityTitle(cyclingType)
            }
            return "Cycling"
        }
    }

    private var activitySubtitle: String {
        switch activity.type {
        case .workout:
            if let sets = activity.summary.setsCompleted, let total = activity.summary.totalSets {
                return "\(sets)/\(total) sets completed"
            }
            return ""
        case .stretch:
            if let completed = activity.summary.regionsCompleted, completed > 0 {
                return "\(completed) \(completed == 1 ? "region" : "regions")"
            }
            return ""
        case .meditation:
            if let duration = activity.summary.durationSeconds, duration > 0 {
                if duration < 60 {
                    return "< 1 minute"
                } else {
                    let minutes = duration / 60
                    return "\(minutes) \(minutes == 1 ? "minute" : "minutes")"
                }
            }
            return ""
        case .cycling:
            let durationMinutes = activity.summary.durationMinutes ?? 0
            let durationText = durationMinutes > 0 ? DayActivityCard.formatActivityMinutes(durationMinutes) : nil
            if let tss = activity.summary.tss {
                if let durationText {
                    return "\(durationText), \(tss) TSS"
                }
                return "\(tss) TSS"
            }
            return durationText ?? ""
        }
    }

    private var formattedDate: String {
        let calendar = Calendar.current
        if calendar.isDateInToday(activity.date) {
            return "Today"
        } else if calendar.isDateInYesterday(activity.date) {
            return "Yesterday"
        } else {
            let formatter = DateFormatter()
            formatter.dateFormat = "MMM d"
            return formatter.string(from: activity.date)
        }
    }

    private func formatCyclingActivityTitle(_ cyclingType: String) -> String {
        if cyclingType.isEmpty {
            return "Cycling"
        }
        let title = cyclingType
            .replacingOccurrences(of: "-", with: " ")
            .capitalized
        return "Cycling (\(title))"
    }
}

#Preview("Health") {
    HealthView(apiClient: MockAPIClient())
        .environmentObject(AppState())
        .background(AuroraBackground().ignoresSafeArea())
        .preferredColorScheme(.dark)
}

#Preview("Health - Loading") {
    HealthView(apiClient: MockAPIClient.withDelay(10.0))
        .environmentObject(AppState())
        .background(AuroraBackground().ignoresSafeArea())
        .preferredColorScheme(.dark)
}

#Preview("Health - Empty") {
    HealthView(apiClient: MockAPIClient.empty)
        .environmentObject(AppState())
        .background(AuroraBackground().ignoresSafeArea())
        .preferredColorScheme(.dark)
}
