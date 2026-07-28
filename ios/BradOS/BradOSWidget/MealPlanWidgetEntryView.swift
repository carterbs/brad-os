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
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: "fork.knife")
                    .font(.caption.weight(.bold))
                    .foregroundColor(.white)
                    .frame(width: 24, height: 24)
                    .background(mealPlanColor, in: RoundedRectangle(cornerRadius: 6, style: .continuous))

                VStack(alignment: .leading, spacing: 1) {
                    Text(entry.dayName)
                        .font(.headline.weight(.semibold))
                        .foregroundColor(ThemeColors.ink)
                    Text("FOOD FOR TODAY")
                        .font(.caption2.weight(.bold))
                        .foregroundColor(ThemeColors.mutedInk)
                }
            }

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
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: mealTypeIcon(meal.mealType))
                .font(.caption.weight(.semibold))
                .foregroundColor(mealPlanColor)
                .frame(width: 24)

            VStack(alignment: .leading, spacing: 1) {
                Text(meal.displayLabel)
                    .font(.caption2.weight(.bold))
                    .foregroundColor(ThemeColors.mutedInk)
                Text(meal.mealName ?? "\u{2014}")
                    .font(.subheadline)
                    .foregroundColor(meal.mealName != nil ? ThemeColors.ink : ThemeColors.mutedInk)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer()
        }
        .padding(.vertical, 2)
    }

    private var emptyState: some View {
        VStack(spacing: 8) {
            Image(systemName: "fork.knife")
                .font(.title2)
                .foregroundColor(mealPlanColor)
            Text("No Meal Plan")
                .font(.headline)
            Text("Open app to generate")
                .font(.caption)
                .foregroundColor(ThemeColors.mutedInk)
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
