import SwiftUI

/// Calendar view showing activity history with filtering
struct HistoryView: View {
    @StateObject private var viewModel: CalendarViewModel
    @State private var selectedDate: Date = Date()
    @State private var selectedFilter: ActivityType? = nil
    @State private var showingDayDetail: Bool = false
    @State private var selectedDayActivities: [CalendarActivity] = []

    init(apiClient: APIClientProtocol = APIClient.shared) {
        _viewModel = StateObject(wrappedValue: CalendarViewModel(apiClient: apiClient))
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: Theme.Spacing.lg) {
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
                }
                .padding(Theme.Spacing.md)
            }
            .background(Theme.background)
            .navigationTitle("History")
            .navigationBarTitleDisplayMode(.large)
            .sheet(isPresented: $showingDayDetail) {
                DayDetailSheet(
                    date: selectedDate,
                    activities: selectedDayActivities
                )
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
            }
            .task {
                await viewModel.fetchMonth()
            }
        }
    }

    // MARK: - Filter Section

    @ViewBuilder
    private var filterSection: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: Theme.Spacing.sm) {
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
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            Text("Legend")
                .font(.caption)
                .foregroundColor(Theme.textSecondary)

            HStack(spacing: Theme.Spacing.lg) {
                ForEach(ActivityType.allCases, id: \.self) { type in
                    HStack(spacing: Theme.Spacing.xs) {
                        Circle()
                            .fill(type.color)
                            .frame(width: 8, height: 8)
                        Text(type.displayName)
                            .font(.caption)
                            .foregroundColor(Theme.textSecondary)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Theme.Spacing.md)
        .background(Theme.backgroundSecondary)
        .cornerRadius(Theme.CornerRadius.md)
    }
}

/// Filter chip button
struct FilterChip: View {
    let title: String
    var color: Color = Theme.accent
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.subheadline)
                .fontWeight(isSelected ? .semibold : .regular)
                .foregroundColor(isSelected ? .white : Theme.textPrimary)
                .padding(.horizontal, Theme.Spacing.md)
                .padding(.vertical, Theme.Spacing.sm)
                .background(isSelected ? color : Theme.backgroundTertiary)
                .cornerRadius(Theme.CornerRadius.lg)
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
        VStack(spacing: Theme.Spacing.md) {
            // Month Navigation
            HStack {
                Button(action: { viewModel.previousMonth() }) {
                    Image(systemName: "chevron.left")
                        .foregroundColor(Theme.textPrimary)
                }

                Spacer()

                Text(monthYearString)
                    .font(.headline)
                    .foregroundColor(Theme.textPrimary)

                Spacer()

                Button(action: { viewModel.nextMonth() }) {
                    Image(systemName: "chevron.right")
                        .foregroundColor(Theme.textPrimary)
                }
            }
            .padding(.horizontal, Theme.Spacing.sm)

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
            LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 7), spacing: Theme.Spacing.sm) {
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
        .padding(Theme.Spacing.md)
        .background(Theme.backgroundSecondary)
        .cornerRadius(Theme.CornerRadius.md)
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
                    .fontWeight(isToday ? .bold : .regular)
                    .foregroundColor(textColor)

                // Activity dots
                HStack(spacing: 2) {
                    ForEach(activityTypes, id: \.self) { type in
                        Circle()
                            .fill(type.color)
                            .frame(width: 6, height: 6)
                    }
                }
                .frame(height: 6)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 44)
            .background(backgroundColor)
            .cornerRadius(Theme.CornerRadius.sm)
        }
        .buttonStyle(PlainButtonStyle())
    }

    private var textColor: Color {
        if isSelected {
            return .white
        } else if isToday {
            return Theme.accent
        } else {
            return Theme.textPrimary
        }
    }

    private var backgroundColor: Color {
        if isSelected {
            return Theme.accent
        } else if isToday {
            return Theme.accent.opacity(0.2)
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

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: Theme.Spacing.md) {
                    if activities.isEmpty {
                        EmptyStateView(
                            iconName: "calendar.badge.minus",
                            title: "No Activities",
                            message: "No activities recorded for this day."
                        )
                    } else {
                        ForEach(activities) { activity in
                            DayActivityCard(activity: activity)
                        }
                    }
                }
                .padding(Theme.Spacing.md)
            }
            .background(Theme.background)
            .navigationTitle(formattedDate)
            .navigationBarTitleDisplayMode(.inline)
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
}

/// Card showing activity details in day detail sheet
struct DayActivityCard: View {
    let activity: CalendarActivity

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
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
                        .foregroundColor(Theme.textSecondary)
                }
            }

            Divider()
                .background(Theme.border)

            // Activity-specific details
            activityDetails
        }
        .padding(Theme.Spacing.md)
        .background(Theme.backgroundSecondary)
        .cornerRadius(Theme.CornerRadius.md)
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
                        .foregroundColor(Theme.textSecondary)
                }
            }

        case .stretch:
            VStack(alignment: .leading, spacing: 4) {
                if let regions = activity.summary.regionsCompleted {
                    Text("\(regions) regions stretched")
                        .font(.subheadline)
                        .foregroundColor(Theme.textPrimary)
                }
                if let duration = activity.summary.totalDurationSeconds {
                    Text("\(duration / 60) minutes")
                        .font(.caption)
                        .foregroundColor(Theme.textSecondary)
                }
            }

        case .meditation:
            VStack(alignment: .leading, spacing: 4) {
                if let duration = activity.summary.durationSeconds {
                    Text("\(duration / 60) minute session")
                        .font(.subheadline)
                        .foregroundColor(Theme.textPrimary)
                }
            }
        }
    }

    private func formatTime(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }
}

#Preview("History View") {
    HistoryView(apiClient: MockAPIClient())
        .preferredColorScheme(.dark)
}

#Preview("History View - Loading") {
    HistoryView(apiClient: MockAPIClient.withDelay(10.0))
        .preferredColorScheme(.dark)
}

#Preview("History View - Error") {
    HistoryView(apiClient: MockAPIClient.failing())
        .preferredColorScheme(.dark)
}
