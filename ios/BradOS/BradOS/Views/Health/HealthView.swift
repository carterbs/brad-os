import SwiftUI
import BradOSCore

/// Grid view of available health activities and metrics
struct HealthView: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var viewModel: CalendarViewModel
    @State private var isShowingHistory = false

    private let columns = [
        GridItem(.flexible()),
        GridItem(.flexible())
    ]

    init(apiClient: APIClientProtocol = APIClient.shared) {
        _viewModel = StateObject(wrappedValue: CalendarViewModel(apiClient: apiClient))
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: Theme.Spacing.space6) {
                    // Activity Cards Grid
                    LazyVGrid(columns: columns, spacing: Theme.Spacing.space3) {
                        // Lifting - Full width
                        ActivityCard(activityType: .workout) {
                            appState.isShowingLiftingContext = true
                        }
                        .gridCellColumns(2)

                        // Cycling
                        Button(action: { appState.isShowingCycling = true }) {
                            VStack(spacing: Theme.Spacing.space3) {
                                Image(systemName: "figure.outdoor.cycle")
                                    .font(.system(size: Theme.Typography.activityGridIcon, weight: .regular))
                                    .foregroundColor(Theme.cycling)
                                    .frame(width: Theme.Dimensions.iconFrameLG, height: Theme.Dimensions.iconFrameLG)
                                    .background(Theme.cycling.opacity(0.12))
                                    .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))

                                Text("Cycling")
                                    .font(.headline)
                                    .foregroundColor(Theme.textPrimary)
                            }
                            .frame(maxWidth: .infinity, minHeight: 100)
                            .glassCard(.card, padding: Theme.Spacing.space6)
                        }
                        .buttonStyle(PlainButtonStyle())

                        // Stretch
                        ActivityCard(activityType: .stretch) {
                            appState.isShowingStretch = true
                        }

                        // Meditation
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
            SectionHeader(title: "Recent Activity", actionTitle: "See All") {
                isShowingHistory = true
            }

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
                        .frame(maxWidth: .infinity, alignment: .center)
                        .glassCard()
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
                NavigationLink(destination: HRVHistoryView()) {
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

                NavigationLink(destination: RHRHistoryView()) {
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
            .glassCard()
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
        .glassCard()
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
        .glassCard()
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
