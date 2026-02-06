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

            ForEach(MealType.allCases, id: \.self) { mealType in
                mealRow(mealType: mealType)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .widgetURL(URL(string: "brados://mealplan"))
    }

    private func mealRow(mealType: MealType) -> some View {
        let entry = entry.meals.first { $0.mealType == mealType }

        return HStack(spacing: 8) {
            Image(systemName: mealTypeIcon(mealType))
                .font(.body)
                .foregroundColor(mealPlanColor)
                .frame(width: 24)

            VStack(alignment: .leading, spacing: 1) {
                Text(mealTypeLabel(mealType))
                    .font(.caption2)
                    .foregroundColor(.secondary)
                Text(entry?.mealName ?? "\u{2014}")
                    .font(.subheadline)
                    .foregroundColor(entry?.mealName != nil ? .primary : .secondary)
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
        Color(red: 1.0, green: 0.478, blue: 0.682) // #FF7AAE
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
