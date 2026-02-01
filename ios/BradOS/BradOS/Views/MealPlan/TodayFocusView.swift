import SwiftUI
import BradOSCore

/// Layout B: Today's meals in a large focus card + horizontal day chips below
/// Tap a chip to swap it into the focus card with animation.
struct TodayFocusView: View {
    let plan: [MealPlanEntry]
    let changedSlots: Set<String>

    @State private var selectedDayIndex: Int

    private let dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    private let fullDayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

    init(plan: [MealPlanEntry], changedSlots: Set<String>) {
        self.plan = plan
        self.changedSlots = changedSlots
        // Default to today
        let weekday = Calendar.current.component(.weekday, from: Date())
        _selectedDayIndex = State(initialValue: (weekday + 5) % 7)
    }

    var body: some View {
        VStack(spacing: Theme.Spacing.md) {
            focusCard

            dayChipScroller
        }
    }

    // MARK: - Focus Card

    @ViewBuilder
    private var focusCard: some View {
        let entries = entriesForDay(selectedDayIndex)

        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            Text(fullDayNames[selectedDayIndex])
                .font(.headline)
                .fontWeight(.bold)
                .foregroundColor(Theme.mealPlan)

            ForEach(Array(MealType.allCases.enumerated()), id: \.element) { _, mealType in
                let entry = entries.first { $0.mealType == mealType }
                focusMealRow(mealType: mealType, entry: entry)
            }
        }
        .padding(Theme.Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.backgroundSecondary)
        .cornerRadius(Theme.CornerRadius.lg)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.CornerRadius.lg)
                .stroke(Theme.mealPlan.opacity(0.3), lineWidth: 1)
        )
        .animation(.easeInOut(duration: 0.25), value: selectedDayIndex)
    }

    @ViewBuilder
    private func focusMealRow(mealType: MealType, entry: MealPlanEntry?) -> some View {
        let entryId = entry?.id ?? ""
        let isChanged = changedSlots.contains(entryId)

        HStack(spacing: Theme.Spacing.sm) {
            Image(systemName: mealTypeIcon(mealType))
                .font(.body)
                .foregroundColor(Theme.mealPlan)
                .frame(width: 24)

            VStack(alignment: .leading, spacing: 2) {
                Text(mealTypeLabel(mealType))
                    .font(.caption)
                    .foregroundColor(Theme.textSecondary)
                Text(entry?.mealName ?? "\u{2014}")
                    .font(.body)
                    .foregroundColor(entry?.mealName != nil ? Theme.textPrimary : Theme.textSecondary)
                    .lineLimit(2)
            }

            Spacer()
        }
        .padding(.vertical, 10)
        .padding(.horizontal, Theme.Spacing.sm)
        .background(isChanged ? Theme.success.opacity(0.15) : Color.clear)
        .cornerRadius(Theme.CornerRadius.md)
    }

    // MARK: - Day Chip Scroller

    @ViewBuilder
    private var dayChipScroller: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(0..<7, id: \.self) { dayIndex in
                    dayChip(dayIndex)
                        .onTapGesture {
                            withAnimation(.easeInOut(duration: 0.25)) {
                                selectedDayIndex = dayIndex
                            }
                        }
                }
            }
            .padding(.horizontal, 2)
        }
    }

    @ViewBuilder
    private func dayChip(_ dayIndex: Int) -> some View {
        let entries = entriesForDay(dayIndex)
        let isSelected = dayIndex == selectedDayIndex
        let isToday = dayIndex == currentDayIndex

        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(dayNames[dayIndex])
                    .font(.caption)
                    .fontWeight(.semibold)
                    .foregroundColor(isSelected ? Theme.mealPlan : Theme.textPrimary)
                if isToday {
                    Circle()
                        .fill(Theme.mealPlan)
                        .frame(width: 5, height: 5)
                }
            }

            ForEach(entries) { entry in
                Text(entry.mealName ?? "\u{2014}")
                    .font(.system(size: 10))
                    .foregroundColor(Theme.textSecondary)
                    .lineLimit(1)
            }
        }
        .frame(width: 90, alignment: .leading)
        .frame(minHeight: 72)
        .padding(8)
        .background(isSelected ? Theme.mealPlan.opacity(0.15) : Theme.backgroundSecondary)
        .cornerRadius(Theme.CornerRadius.lg)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.CornerRadius.lg)
                .stroke(
                    isSelected ? Theme.mealPlan.opacity(0.5) : Theme.border.opacity(0.5),
                    lineWidth: 1
                )
        )
    }

    // MARK: - Helpers

    private func entriesForDay(_ dayIndex: Int) -> [MealPlanEntry] {
        plan.filter { $0.dayIndex == dayIndex }
            .sorted { mealTypeOrder($0.mealType) < mealTypeOrder($1.mealType) }
    }

    private var currentDayIndex: Int {
        let weekday = Calendar.current.component(.weekday, from: Date())
        return (weekday + 5) % 7
    }

    private func mealTypeOrder(_ type: MealType) -> Int {
        switch type {
        case .breakfast: return 0
        case .lunch: return 1
        case .dinner: return 2
        }
    }

    private func mealTypeIcon(_ type: MealType) -> String {
        switch type {
        case .breakfast: return "sunrise"
        case .lunch: return "sun.max"
        case .dinner: return "moon.stars"
        }
    }

    private func mealTypeLabel(_ type: MealType) -> String {
        switch type {
        case .breakfast: return "Breakfast"
        case .lunch: return "Lunch"
        case .dinner: return "Dinner"
        }
    }
}

// MARK: - MealType CaseIterable

extension MealType: @retroactive CaseIterable {
    public static var allCases: [MealType] { [.breakfast, .lunch, .dinner] }
}

#Preview("Today Focus") {
    ScrollView {
        TodayFocusView(
            plan: MealPlanSession.mockSession.plan,
            changedSlots: ["0-dinner", "2-lunch"]
        )
        .padding()
    }
    .background(Theme.background)
    .preferredColorScheme(.dark)
}
