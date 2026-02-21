import SwiftUI
import BradOSCore

/// Filter chip button — Aurora Glass spec
/// H:32pt, pill radius, glass fills with stroke
struct FilterChip: View {
    let title: String
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
                Button {
                    viewModel.previousMonth()
                } label: {
                    Image(systemName: "chevron.left")
                        .foregroundColor(Theme.textPrimary)
                }

                Spacer()

                Text(monthYearString)
                    .font(.headline)
                    .monospacedDigit()
                    .foregroundColor(Theme.textPrimary)

                Spacer()

                Button {
                    viewModel.nextMonth()
                } label: {
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
            calendarGrid
        }
        .glassCard()
    }

    @ViewBuilder
    private var calendarGrid: some View {
        let columns = Array(
            repeating: GridItem(.flexible()), count: 7
        )
        LazyVGrid(columns: columns, spacing: Theme.Spacing.space2) {
            ForEach(daysInMonth, id: \.self) { date in
                if let date = date {
                    CalendarDayCell(
                        date: date,
                        isSelected: calendar.isDate(
                            date, inSameDayAs: selectedDate
                        ),
                        isToday: calendar.isDateInToday(date),
                        activities: viewModel.activitiesForDate(date),
                        filter: filter
                    ) {
                        selectedDate = date
                        onDayTapped(
                            date,
                            viewModel.activitiesForDate(
                                date, filter: filter
                            )
                        )
                    }
                } else {
                    Color.clear
                        .frame(height: 44)
                }
            }
        }
    }

    private var monthYearString: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "MMMM yyyy"
        return formatter.string(from: viewModel.currentMonth)
    }

    private var daysInMonth: [Date?] {
        let components = calendar.dateComponents(
            [.year, .month], from: viewModel.currentMonth
        )
        guard let range = calendar.range(
            of: .day, in: .month, for: viewModel.currentMonth
        ),
              let firstDayOfMonth = calendar.date(from: components)
        else { return [] }

        let firstWeekday = calendar.component(
            .weekday, from: firstDayOfMonth
        )
        let leadingEmptyDays = firstWeekday - 1

        var days: [Date?] = Array(
            repeating: nil, count: leadingEmptyDays
        )

        for day in range {
            if let date = calendar.date(
                byAdding: .day, value: day - 1, to: firstDayOfMonth
            ) {
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
                            .frame(
                                width: Theme.Dimensions.dotSM,
                                height: Theme.Dimensions.dotSM
                            )
                    }
                }
                .frame(height: Theme.Dimensions.dotSM)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 44)
            .background(backgroundColor)
            .clipShape(
                RoundedRectangle(
                    cornerRadius: Theme.CornerRadius.md,
                    style: .continuous
                )
            )
            .shadow(
                color: isToday && !isSelected
                    ? Theme.interactivePrimary.opacity(0.35)
                    : Color.clear,
                radius: 8, x: 0, y: 2
            )
        }
        .buttonStyle(PlainButtonStyle())
    }

    private func dotColor(for type: ActivityType) -> Color {
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
    var onWorkoutTapped: ((String) -> Void)?
    var onStretchTapped: ((String) -> Void)?

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
            if activity.id.hasPrefix("workout-") {
                let id = String(activity.id.dropFirst("workout-".count))
                onWorkoutTapped?(id)
            }
        case .stretch:
            if activity.id.hasPrefix("stretch-") {
                let id = String(activity.id.dropFirst("stretch-".count))
                onStretchTapped?(id)
            }
        case .meditation:
            break
        }
        dismiss()
    }
}
