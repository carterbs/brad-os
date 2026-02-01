import SwiftUI
import BradOSCore

/// Calendar view showing activity history without filtering
/// This is the standalone calendar page that shows all activities
struct CalendarView: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var viewModel: CalendarViewModel

    @State private var selectedDate: Date = Date()
    @State private var showingDayDetail: Bool = false
    @State private var selectedDayActivities: [CalendarActivity] = []
    @State private var pendingWorkoutId: String? = nil

    init(apiClient: APIClientProtocol = APIClient.shared) {
        _viewModel = StateObject(wrappedValue: CalendarViewModel(apiClient: apiClient))
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: Theme.Spacing.space6) {
                    // Calendar (no filter section)
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
                            filter: nil,  // No filter for calendar page
                            onDayTapped: { date, activities in
                                selectedDayActivities = activities
                                showingDayDetail = !activities.isEmpty
                            }
                        )
                    }

                    // Legend
                    legendSection
                }
                .padding(Theme.Spacing.space4)
            }
            .background(AuroraBackground().ignoresSafeArea())
            .navigationTitle("Calendar")
            .navigationBarTitleDisplayMode(.large)
            .toolbarBackground(.hidden, for: .navigationBar)
            .sheet(isPresented: $showingDayDetail) {
                DayDetailSheet(
                    date: selectedDate,
                    activities: selectedDayActivities,
                    onWorkoutTapped: { workoutId in
                        pendingWorkoutId = workoutId
                        showingDayDetail = false
                    }
                )
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
            }
            .onChange(of: showingDayDetail) { _, isShowing in
                // Navigate to workout after sheet dismisses
                if !isShowing, let workoutId = pendingWorkoutId {
                    pendingWorkoutId = nil
                    appState.isShowingLiftingContext = true
                }
            }
            .task {
                await viewModel.fetchMonth()
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

#Preview("Calendar View") {
    CalendarView(apiClient: MockAPIClient())
        .environmentObject(AppState())
        .preferredColorScheme(.dark)
        .background(AuroraBackground().ignoresSafeArea())
}

#Preview("Calendar View - Loading") {
    CalendarView(apiClient: MockAPIClient.withDelay(10.0))
        .environmentObject(AppState())
        .preferredColorScheme(.dark)
        .background(AuroraBackground().ignoresSafeArea())
}

#Preview("Calendar View - Error") {
    CalendarView(apiClient: MockAPIClient.failing())
        .environmentObject(AppState())
        .preferredColorScheme(.dark)
        .background(AuroraBackground().ignoresSafeArea())
}
