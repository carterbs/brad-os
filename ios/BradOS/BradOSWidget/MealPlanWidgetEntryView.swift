import SwiftUI
import WidgetKit
import BradOSCore

struct MealPlanWidgetEntryView: View {
    let entry: MealPlanWidgetEntry

    var body: some View {
        if entry.isEmpty {
            emptyState
        } else {
            mealContent
        }
    }

    private var mealContent: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(entry.dayName)
                .font(.headline)
                .fontWeight(.bold)
                .foregroundColor(mealPlanColor)

            ForEach(sortedMeals) { meal in
                mealRow(meal)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .widgetURL(URL(string: "brados://mealplan"))
    }

    private var sortedMeals: [MealPlanEntry] {
        entry.meals.sorted { $0.slotSortOrder < $1.slotSortOrder }
    }

    private func mealRow(_ meal: MealPlanEntry) -> some View {
        HStack(spacing: 8) {
            Image(systemName: mealTypeIcon(meal.mealType))
                .font(.body)
                .foregroundColor(mealPlanColor)
                .frame(width: 24)

            VStack(alignment: .leading, spacing: 1) {
                Text(meal.displayLabel)
                    .font(.caption2)
                    .foregroundColor(.secondary)
                Text(meal.mealName ?? "\u{2014}")
                    .font(.subheadline)
                    .foregroundColor(meal.mealName != nil ? .primary : .secondary)
                    .lineLimit(1)
            }

            Spacer()
        }
        .padding(.vertical, 2)
    }

    private var emptyState: some View {
        VStack(spacing: 8) {
            Image(systemName: "fork.knife")
                .font(.title2)
                .foregroundColor(.secondary)
            Text("No Meal Plan")
                .font(.headline)
            Text("Open app to generate")
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .widgetURL(URL(string: "brados://mealplan"))
    }

    // MARK: - Helpers

    private var mealPlanColor: Color {
        ThemeColors.mealPlan
    }

    private func mealTypeIcon(_ type: MealType) -> String {
        switch type {
        case .breakfast: return "sunrise"
        case .lunch: return "sun.max"
        case .dinner: return "moon.stars"
        }
    }
}
