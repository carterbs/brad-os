import SwiftUI
import BradOSCore

/// Calendar view showing activity history with filtering
struct HistoryView: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var viewModel: CalendarViewModel
    @State private var selectedDate: Date = Date()
    @State private var selectedFilter: ActivityType? = nil
    @State private var showingDayDetail: Bool = false
    @State private var selectedDayActivities: [CalendarActivity] = []
    @State private var pendingWorkoutId: String? = nil
    @State private var pendingStretchSessionId: String? = nil

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
                            onDayTapped: { date, activities in
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
                if !isShowing, let workoutId = pendingWorkoutId {
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
                        color: type.color,
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

/// Filter chip button — Aurora Glass spec
/// H:32pt, pill radius, glass fills with stroke
struct FilterChip: View {
    let title: String
    var color: Color = Theme.interactivePrimary
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.footnote)
                .fontWeight(.medium)
                .foregroundColor(isSelected ? Theme.interactivePrimary : Theme.textSecondary)
                .padding(.horizontal, Theme.Spacing.space3)
                .frame(height: 32)
                .background(
                    isSelected
                        ? Theme.interactivePrimary.opacity(0.20)
                        : Color.white.opacity(0.06)
                )
                .clipShape(Capsule(style: .continuous))
                .overlay(
                    Capsule(style: .continuous)
                        .stroke(
                            isSelected
                                ? Theme.interactivePrimary.opacity(0.50)
                                : Color.white.opacity(0.10),
                            lineWidth: 1
                        )
                )
        }
        .buttonStyle(PlainButtonStyle())
    }
}

/// Monthly calendar view
struct MonthCalendarView: View {
    @ObservedObject var viewModel: CalendarViewModel
    @Binding var selectedDate: Date
    let filter: ActivityType?
    let onDayTapped: (Date, [CalendarActivity]) -> Void

    private let calendar = Calendar.current
    private let daysOfWeek = ["S", "M", "T", "W", "T", "F", "S"]

    var body: some View {
        VStack(spacing: Theme.Spacing.space4) {
            // Month Navigation — Glass L1 container
            HStack {
                Button(action: { viewModel.previousMonth() }) {
                    Image(systemName: "chevron.left")
                        .foregroundColor(Theme.textPrimary)
                }

                Spacer()

                Text(monthYearString)
                    .font(.headline)
                    .monospacedDigit()
                    .foregroundColor(Theme.textPrimary)

                Spacer()

                Button(action: { viewModel.nextMonth() }) {
                    Image(systemName: "chevron.right")
                        .foregroundColor(Theme.textPrimary)
                }
            }
            .padding(.horizontal, Theme.Spacing.space2)
            .padding(.vertical, Theme.Spacing.space2)
            .glassCard(.card, padding: 0)

            // Days of Week Header
            HStack {
                ForEach(daysOfWeek, id: \.self) { day in
                    Text(day)
                        .font(.caption)
                        .fontWeight(.medium)
                        .foregroundColor(Theme.textSecondary)
                        .frame(maxWidth: .infinity)
                }
            }

            // Calendar Grid
            LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 7), spacing: Theme.Spacing.space2) {
                ForEach(daysInMonth, id: \.self) { date in
                    if let date = date {
                        CalendarDayCell(
                            date: date,
                            isSelected: calendar.isDate(date, inSameDayAs: selectedDate),
                            isToday: calendar.isDateInToday(date),
                            activities: viewModel.activitiesForDate(date),
                            filter: filter
                        ) {
                            selectedDate = date
                            onDayTapped(date, viewModel.activitiesForDate(date, filter: filter))
                        }
                    } else {
                        Color.clear
                            .frame(height: 44)
                    }
                }
            }
        }
        .glassCard()
    }

    private var monthYearString: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "MMMM yyyy"
        return formatter.string(from: viewModel.currentMonth)
    }

    private var daysInMonth: [Date?] {
        guard let range = calendar.range(of: .day, in: .month, for: viewModel.currentMonth),
              let firstDayOfMonth = calendar.date(from: calendar.dateComponents([.year, .month], from: viewModel.currentMonth))
        else { return [] }

        let firstWeekday = calendar.component(.weekday, from: firstDayOfMonth)
        let leadingEmptyDays = firstWeekday - 1

        var days: [Date?] = Array(repeating: nil, count: leadingEmptyDays)

        for day in range {
            if let date = calendar.date(byAdding: .day, value: day - 1, to: firstDayOfMonth) {
                days.append(date)
            }
        }

        return days
    }
}

/// Individual calendar day cell
struct CalendarDayCell: View {
    let date: Date
    let isSelected: Bool
    let isToday: Bool
    let activities: [CalendarActivity]
    let filter: ActivityType?
    let action: () -> Void

    private let calendar = Calendar.current

    var body: some View {
        Button(action: action) {
            VStack(spacing: 2) {
                Text("\(calendar.component(.day, from: date))")
                    .font(.subheadline)
                    .monospacedDigit()
                    .fontWeight(isToday ? .bold : .regular)
                    .foregroundColor(textColor)

                // Activity dots — 5pt diameter, 3pt gap
                HStack(spacing: 3) {
                    ForEach(activityTypes, id: \.self) { type in
                        Circle()
                            .fill(dotColor(for: type))
                            .frame(width: Theme.Dimensions.dotSM, height: Theme.Dimensions.dotSM)
                    }
                }
                .frame(height: Theme.Dimensions.dotSM)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 44)
            .background(backgroundColor)
            .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.md, style: .continuous))
            .shadow(
                color: isToday && !isSelected ? Theme.interactivePrimary.opacity(0.35) : Color.clear,
                radius: 8, x: 0, y: 2
            )
        }
        .buttonStyle(PlainButtonStyle())
    }

    private func dotColor(for type: ActivityType) -> Color {
        // When selected, use white for dots that would blend with the accent background
        if isSelected && type.color == Theme.interactivePrimary {
            return Color.white
        }
        return type.color
    }

    private var textColor: Color {
        if isSelected {
            return Color.white
        } else if isToday {
            return Color.white
        } else {
            return Theme.textPrimary
        }
    }

    private var backgroundColor: Color {
        if isSelected {
            return Theme.interactivePrimary
        } else if isToday {
            return Theme.interactivePrimary
        } else {
            return Color.clear
        }
    }

    private var activityTypes: [ActivityType] {
        let types = Set(activities.map { $0.type })
        if let filter = filter {
            return types.contains(filter) ? [filter] : []
        }
        return Array(types).sorted { $0.rawValue < $1.rawValue }
    }
}

/// Sheet showing details for a selected day
struct DayDetailSheet: View {
    let date: Date
    let activities: [CalendarActivity]
    var onWorkoutTapped: ((String) -> Void)? = nil
    var onStretchTapped: ((String) -> Void)? = nil

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: Theme.Spacing.space4) {
                    if activities.isEmpty {
                        EmptyStateView(
                            iconName: "calendar.badge.minus",
                            title: "No Activities",
                            message: "No activities recorded for this day."
                        )
                    } else {
                        ForEach(activities) { activity in
                            DayActivityCard(
                                activity: activity,
                                onTap: {
                                    handleActivityTap(activity)
                                }
                            )
                        }
                    }
                }
                .padding(Theme.Spacing.space4)
            }
            .background(AuroraBackground().ignoresSafeArea())
            .navigationTitle(formattedDate)
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.hidden, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
    }

    private var formattedDate: String {
        let formatter = DateFormatter()
        formatter.dateStyle = .long
        return formatter.string(from: date)
    }

    private func handleActivityTap(_ activity: CalendarActivity) {
        switch activity.type {
        case .workout:
            // Extract workout ID from activity.id (format: "workout-{id}")
            if activity.id.hasPrefix("workout-") {
                let workoutId = String(activity.id.dropFirst("workout-".count))
                onWorkoutTapped?(workoutId)
            }
        case .stretch:
            // Extract session ID from activity.id (format: "stretch-{uuid}")
            // The UUID is everything after "stretch-"
            if activity.id.hasPrefix("stretch-") {
                let sessionId = String(activity.id.dropFirst("stretch-".count))
                onStretchTapped?(sessionId)
            }
        case .meditation:
            // No detail page for meditation, just dismiss
            break
        }
        dismiss()
    }
}

/// Card showing activity details in day detail sheet — Glass L4 (overlay)
struct DayActivityCard: View {
    let activity: CalendarActivity
    var onTap: (() -> Void)? = nil

    private var hasDetailView: Bool {
        activity.type == .workout || activity.type == .stretch
    }

    var body: some View {
        Button(action: { onTap?() }) {
            VStack(alignment: .leading, spacing: Theme.Spacing.space2) {
                HStack {
                    Image(systemName: activity.type.iconName)
                        .foregroundColor(activity.type.color)

                    Text(activity.type.displayName)
                        .font(.headline)
                        .foregroundColor(Theme.textPrimary)

                    Spacer()

                    if let completedAt = activity.completedAt {
                        Text(formatTime(completedAt))
                            .font(.caption)
                            .monospacedDigit()
                            .foregroundColor(Theme.textSecondary)
                    }

                    // Show chevron for activities with detail views
                    if hasDetailView {
                        Image(systemName: "chevron.right")
                            .font(.caption)
                            .foregroundColor(Theme.textSecondary)
                    }
                }

                Divider()
                    .background(Theme.divider)

                // Activity-specific details
                activityDetails
            }
            .glassCard(.overlay)
        }
        .buttonStyle(PlainButtonStyle())
    }

    @ViewBuilder
    private var activityDetails: some View {
        switch activity.type {
        case .workout:
            VStack(alignment: .leading, spacing: 4) {
                if let dayName = activity.summary.dayName {
                    Text(dayName)
                        .font(.subheadline)
                        .foregroundColor(Theme.textPrimary)
                }
                if let sets = activity.summary.setsCompleted, let total = activity.summary.totalSets {
                    Text("\(sets)/\(total) sets completed")
                        .font(.caption)
                        .monospacedDigit()
                        .foregroundColor(Theme.textSecondary)
                }
            }

        case .stretch:
            VStack(alignment: .leading, spacing: 4) {
                if let regions = activity.summary.regionsCompleted, regions > 0 {
                    Text("\(regions) \(regions == 1 ? "region" : "regions") stretched")
                        .font(.subheadline)
                        .monospacedDigit()
                        .foregroundColor(Theme.textPrimary)
                }
                if let duration = activity.summary.totalDurationSeconds, duration > 0 {
                    if duration < 60 {
                        Text("< 1 minute")
                            .font(.caption)
                            .monospacedDigit()
                            .foregroundColor(Theme.textSecondary)
                    } else {
                        let minutes = duration / 60
                        Text("\(minutes) \(minutes == 1 ? "minute" : "minutes")")
                            .font(.caption)
                            .monospacedDigit()
                            .foregroundColor(Theme.textSecondary)
                    }
                }
            }

        case .meditation:
            VStack(alignment: .leading, spacing: 4) {
                if let meditationType = activity.summary.meditationType {
                    Text(Self.formatMeditationType(meditationType))
                        .font(.subheadline)
                        .foregroundColor(Theme.textPrimary)
                }
                if let duration = activity.summary.durationSeconds, duration > 0 {
                    if duration < 60 {
                        Text("< 1 minute")
                            .font(.caption)
                            .monospacedDigit()
                            .foregroundColor(Theme.textSecondary)
                    } else {
                        let minutes = duration / 60
                        Text("\(minutes) \(minutes == 1 ? "minute" : "minutes")")
                            .font(.caption)
                            .monospacedDigit()
                            .foregroundColor(Theme.textSecondary)
                    }
                }
            }
        }
    }

    static func formatMeditationType(_ sessionType: String) -> String {
        if sessionType == "basic-breathing" {
            return "Breathing"
        } else if sessionType.hasPrefix("reactivity-") {
            return "Reactivity Series"
        }
        return "Meditation"
    }

    private func formatTime(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.timeStyle = .short
        return formatter.string(from: date)
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
