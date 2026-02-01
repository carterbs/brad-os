import SwiftUI
import BradOSCore

/// Grid view of available activity types
struct ActivitiesView: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var viewModel: CalendarViewModel

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

                        // Stretch
                        ActivityCard(activityType: .stretch) {
                            appState.isShowingStretch = true
                        }

                        // Meditation
                        ActivityCard(activityType: .meditation) {
                            appState.isShowingMeditation = true
                        }

                        // Meal Plan (not an ActivityType — not tracked on calendar)
                        Button(action: { appState.isShowingMealPlan = true }) {
                            VStack(spacing: 10) {
                                Image(systemName: "fork.knife")
                                    .font(.system(size: Theme.Typography.activityGridIcon))
                                    .foregroundColor(Theme.mealPlan)

                                Text("Meal Plan")
                                    .font(.headline)
                                    .foregroundColor(Theme.textPrimary)

                                Text("Weekly meals")
                                    .font(.footnote)
                                    .foregroundColor(Theme.textSecondary)
                            }
                            .frame(maxWidth: .infinity, minHeight: 100)
                            .glassCard(.card, padding: Theme.Spacing.space6)
                        }
                        .buttonStyle(PlainButtonStyle())
                    }

                    // Recent Activity Section
                    recentActivitySection
                }
                .padding(Theme.Spacing.space5)
            }
            .background(AuroraBackground().ignoresSafeArea())
            .navigationTitle("Activities")
            .navigationBarTitleDisplayMode(.large)
            .toolbarBackground(.hidden, for: .navigationBar)
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
                appState.selectedTab = .history
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
            if let completed = activity.summary.regionsCompleted {
                return "\(completed) regions"
            }
            return ""
        case .meditation:
            if let duration = activity.summary.durationSeconds {
                return "\(duration / 60) minutes"
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

#Preview("Activities") {
    ActivitiesView(apiClient: MockAPIClient())
        .environmentObject(AppState())
        .background(AuroraBackground().ignoresSafeArea())
        .preferredColorScheme(.dark)
}

#Preview("Activities - Loading") {
    ActivitiesView(apiClient: MockAPIClient.withDelay(10.0))
        .environmentObject(AppState())
        .background(AuroraBackground().ignoresSafeArea())
        .preferredColorScheme(.dark)
}

#Preview("Activities - Empty") {
    ActivitiesView(apiClient: MockAPIClient.empty)
        .environmentObject(AppState())
        .background(AuroraBackground().ignoresSafeArea())
        .preferredColorScheme(.dark)
}
