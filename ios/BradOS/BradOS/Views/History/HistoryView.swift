import SwiftUI
import BradOSCore

/// Calendar view showing activity history with filtering
struct HistoryView: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var viewModel: CalendarViewModel
    @State private var selectedDate = Date()
    @State private var selectedFilter: ActivityType?
    @State private var showingDayDetail: Bool = false
    @State private var selectedDayActivities: [CalendarActivity] = []
    @State private var pendingWorkoutId: String?
    @State private var pendingStretchSessionId: String?

    init(apiClient: APIClientProtocol = APIClient.shared) {
        _viewModel = StateObject(wrappedValue: CalendarViewModel(apiClient: apiClient))
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: Theme.Spacing.space6) {
                    // Filter Buttons
                    filterSection

                    // Calendar with loading/error states
                    if viewModel.isLoading {
                        LoadingView(message: "Loading calendar...")
                            .frame(minHeight: 300)
                    } else if let error = viewModel.error {
                        ErrorStateView(message: error) {
                            Task { await viewModel.fetchMonth() }
                        }
                        .frame(minHeight: 300)
                    } else {
                        MonthCalendarView(
                            viewModel: viewModel,
                            selectedDate: $selectedDate,
                            filter: selectedFilter,
                            onDayTapped: { _, activities in
                                selectedDayActivities = activities
                                showingDayDetail = !activities.isEmpty
                            }
                        )
                    }

                    // Legend
                    legendSection

                    // Health Trends
                    healthTrendsSection
                }
                .padding(Theme.Spacing.space4)
            }
            .background(AuroraBackground().ignoresSafeArea())
            .navigationTitle("History")
            .navigationBarTitleDisplayMode(.large)
            .toolbarBackground(.hidden, for: .navigationBar)
            .sheet(isPresented: $showingDayDetail) {
                DayDetailSheet(
                    date: selectedDate,
                    activities: selectedDayActivities,
                    onWorkoutTapped: { workoutId in
                        pendingWorkoutId = workoutId
                        showingDayDetail = false
                    },
                    onStretchTapped: { sessionId in
                        pendingStretchSessionId = sessionId
                        showingDayDetail = false
                    }
                )
                .presentationDetents([.medium, .large], selection: .constant(.large))
                .presentationDragIndicator(.visible)
            }
            .navigationDestination(isPresented: Binding(
                get: { pendingStretchSessionId != nil },
                set: { if !$0 { pendingStretchSessionId = nil } }
            )) {
                if let sessionId = pendingStretchSessionId {
                    StretchSessionDetailView(sessionId: sessionId)
                }
            }
            .onChange(of: showingDayDetail) { _, isShowing in
                // Navigate to workout after sheet dismisses
                if !isShowing, pendingWorkoutId != nil {
                    pendingWorkoutId = nil
                    appState.isShowingLiftingContext = true
                    // Note: The workout navigation will need to be handled by LiftingTabView
                    // For now, we navigate to the lifting context where the user can find the workout
                }
            }
            .task {
                await viewModel.fetchMonth()
            }
        }
    }

    // MARK: - Health Trends Section

    @ViewBuilder
    private var healthTrendsSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            SectionHeader(title: "Health Trends")

            VStack(spacing: 0) {
                NavigationLink(destination: HealthMetricHistoryView(.hrv)) {
                    SettingsRow(
                        title: "HRV History",
                        subtitle: "Heart rate variability trends",
                        iconName: "waveform.path.ecg",
                        iconColor: Theme.interactivePrimary,
                        accessory: {
                            Image(systemName: "chevron.right")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundColor(Theme.textTertiary)
                        }
                    )
                }
                .contentShape(Rectangle())
                .buttonStyle(.plain)

                Divider().background(Theme.divider)

                NavigationLink(destination: HealthMetricHistoryView(.rhr)) {
                    SettingsRow(
                        title: "RHR History",
                        subtitle: "Resting heart rate trends",
                        iconName: "heart.fill",
                        iconColor: Theme.destructive,
                        accessory: {
                            Image(systemName: "chevron.right")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundColor(Theme.textTertiary)
                        }
                    )
                }
                .contentShape(Rectangle())
                .buttonStyle(.plain)

                Divider().background(Theme.divider)

                NavigationLink(destination: SleepHistoryView()) {
                    SettingsRow(
                        title: "Sleep History",
                        subtitle: "Sleep duration and stage trends",
                        iconName: "bed.double.fill",
                        iconColor: Theme.interactiveSecondary,
                        accessory: {
                            Image(systemName: "chevron.right")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundColor(Theme.textTertiary)
                        }
                    )
                }
                .contentShape(Rectangle())
                .buttonStyle(.plain)
            }
            .glassCard(.card, padding: 0)
        }
    }

    // MARK: - Filter Section

    @ViewBuilder
    private var filterSection: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: Theme.Spacing.space2) {
                FilterChip(title: "All", isSelected: selectedFilter == nil) {
                    selectedFilter = nil
                }

                ForEach(ActivityType.allCases, id: \.self) { type in
                    FilterChip(
                        title: type.displayName,
                        isSelected: selectedFilter == type
                    ) {
                        selectedFilter = type
                    }
                }
            }
        }
    }

    // MARK: - Legend Section

    @ViewBuilder
    private var legendSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space2) {
            Text("Legend")
                .font(.caption)
                .foregroundColor(Theme.textSecondary)

            HStack(spacing: Theme.Spacing.space6) {
                ForEach(ActivityType.allCases, id: \.self) { type in
                    HStack(spacing: Theme.Spacing.space1) {
                        Circle()
                            .fill(type.color)
                            .frame(width: Theme.Dimensions.dotMD, height: Theme.Dimensions.dotMD)
                        Text(type.displayName)
                            .font(.caption)
                            .foregroundColor(Theme.textSecondary)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .glassCard()
    }
}

#Preview("History View") {
    HistoryView(apiClient: MockAPIClient())
        .environmentObject(AppState())
        .preferredColorScheme(.dark)
        .background(AuroraBackground().ignoresSafeArea())
}

#Preview("History View - Loading") {
    HistoryView(apiClient: MockAPIClient.withDelay(10.0))
        .environmentObject(AppState())
        .preferredColorScheme(.dark)
        .background(AuroraBackground().ignoresSafeArea())
}

#Preview("History View - Error") {
    HistoryView(apiClient: MockAPIClient.failing())
        .environmentObject(AppState())
        .preferredColorScheme(.dark)
        .background(AuroraBackground().ignoresSafeArea())
}
