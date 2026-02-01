import SwiftUI
import BradOSCore

/// Weekly grid displaying the 7-day meal plan as day cards
struct MealPlanGridView: View {
    let plan: [MealPlanEntry]
    let changedSlots: Set<String>

    private let dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

    var body: some View {
        VStack(spacing: 12) {
            ForEach(0..<7, id: \.self) { dayIndex in
                DayCard(
                    dayName: dayNames[dayIndex],
                    entries: entriesForDay(dayIndex),
                    changedSlots: changedSlots
                )
            }
        }
    }

    private func entriesForDay(_ dayIndex: Int) -> [MealPlanEntry] {
        let dayEntries = plan.filter { $0.dayIndex == dayIndex }
        // Sort by meal type order: breakfast, lunch, dinner
        return dayEntries.sorted { mealTypeOrder($0.mealType) < mealTypeOrder($1.mealType) }
    }

    private func mealTypeOrder(_ type: MealType) -> Int {
        switch type {
        case .breakfast: return 0
        case .lunch: return 1
        case .dinner: return 2
        }
    }
}

/// A card displaying one day's meals
private struct DayCard: View {
    let dayName: String
    let entries: [MealPlanEntry]
    let changedSlots: Set<String>

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Day header
            Text(dayName)
                .font(.headline)
                .fontWeight(.semibold)
                .foregroundColor(Theme.mealPlan)
                .padding(.horizontal, Theme.Spacing.space4)
                .padding(.top, Theme.Spacing.space2)
                .padding(.bottom, Theme.Spacing.space1)

            // Meal rows
            if entries.isEmpty {
                Text("No meals planned")
                    .font(.caption)
                    .foregroundColor(Theme.textSecondary)
                    .padding(.horizontal, Theme.Spacing.space4)
                    .padding(.vertical, Theme.Spacing.space2)
            } else {
                ForEach(entries) { entry in
                    MealRow(entry: entry, isHighlighted: changedSlots.contains(entry.id))
                }
            }
        }
        .glassCard(padding: 0)
    }
}

/// A single meal row within a day card
private struct MealRow: View {
    let entry: MealPlanEntry
    let isHighlighted: Bool

    var body: some View {
        HStack(spacing: Theme.Spacing.space2) {
            // Meal type icon
            Image(systemName: mealTypeIcon)
                .font(.caption)
                .foregroundColor(Theme.textSecondary)
                .frame(width: 20)

            // Meal type label
            Text(mealTypeLabel)
                .font(.caption)
                .foregroundColor(Theme.textSecondary)
                .frame(width: 56, alignment: .leading)

            // Meal name
            if let mealName = entry.mealName {
                Text(mealName)
                    .font(.body)
                    .foregroundColor(Theme.textPrimary)
                    .lineLimit(2)
            } else {
                Text("\u{2014}")
                    .font(.body)
                    .foregroundColor(Theme.textSecondary)
            }

            Spacer()
        }
        .padding(.horizontal, Theme.Spacing.space4)
        .padding(.vertical, 10)
        .background(
            isHighlighted
                ? Theme.success.opacity(0.3)
                : Color.clear
        )
        .animation(.easeInOut(duration: 0.5), value: isHighlighted)
    }

    private var mealTypeIcon: String {
        switch entry.mealType {
        case .breakfast: return "sunrise"
        case .lunch: return "sun.max"
        case .dinner: return "moon.stars"
        }
    }

    private var mealTypeLabel: String {
        switch entry.mealType {
        case .breakfast: return "Breakfast"
        case .lunch: return "Lunch"
        case .dinner: return "Dinner"
        }
    }
}

#Preview("Meal Plan Grid") {
    ScrollView {
        MealPlanGridView(
            plan: MealPlanSession.mockSession.plan,
            changedSlots: ["0-dinner", "2-lunch"]
        )
        .padding()
    }
    .background(AuroraBackground())
    .preferredColorScheme(.dark)
}
