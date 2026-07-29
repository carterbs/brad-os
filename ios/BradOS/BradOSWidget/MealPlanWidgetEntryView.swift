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
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Image(systemName: "fork.knife")
                    .font(.caption2.weight(.bold))
                    .foregroundColor(.white)
                    .frame(width: 20, height: 20)
                    .background(mealPlanColor, in: RoundedRectangle(cornerRadius: 5, style: .continuous))

                VStack(alignment: .leading, spacing: 0) {
                    Text(entry.dayName)
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(ThemeColors.ink)
                    Text("FOOD FOR TODAY")
                        .font(.caption2.weight(.bold))
                        .foregroundColor(ThemeColors.mutedInk)
                }

                Spacer(minLength: 0)
            }

            LazyVGrid(
                columns: [
                    GridItem(.flexible(), spacing: 6),
                    GridItem(.flexible(), spacing: 6),
                ],
                spacing: 4
            ) {
                ForEach(displayedMeals) { meal in
                    mealTile(meal)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .widgetURL(URL(string: "brados://mealplan"))
    }

    private var displayedMeals: [WidgetMealSlot] {
        [
            WidgetMealSlot(label: "Family breakfast", icon: "sunrise", meal: meal(track: .family, type: .breakfast)),
            WidgetMealSlot(label: "Adult breakfast", icon: "sunrise", meal: meal(track: .adult, type: .breakfast)),
            WidgetMealSlot(label: "Lunch", icon: "sun.max", meal: meal(track: .family, type: .lunch) ?? meal(track: .adult, type: .lunch)),
            WidgetMealSlot(label: "Dinner", icon: "moon.stars", meal: meal(track: .family, type: .dinner) ?? meal(track: .adult, type: .dinner)),
        ]
    }

    private func meal(track: MealTrack, type: MealType) -> MealPlanEntry? {
        entry.meals.first { $0.mealTrack == track && $0.mealType == type }
    }

    private func mealTile(_ slot: WidgetMealSlot) -> some View {
        HStack(alignment: .top, spacing: 5) {
            Image(systemName: slot.icon)
                .font(.caption2.weight(.semibold))
                .foregroundColor(mealPlanColor)
                .frame(width: 14, height: 14)

            VStack(alignment: .leading, spacing: 0) {
                Text(slot.label.uppercased())
                    .font(.caption2.weight(.bold))
                    .foregroundColor(ThemeColors.mutedInk)
                Text(slot.meal?.mealName ?? "\u{2014}")
                    .font(.caption.weight(.medium))
                    .foregroundColor(slot.meal?.mealName != nil ? ThemeColors.ink : ThemeColors.mutedInk)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, minHeight: 42, alignment: .topLeading)
        .padding(.horizontal, 6)
        .padding(.vertical, 4)
        .background(ThemeColors.bgBase.opacity(0.7), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
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

    private var mealPlanColor: Color {
        ThemeColors.mealPlan
    }
}

private struct WidgetMealSlot: Identifiable {
    let label: String
    let icon: String
    let meal: MealPlanEntry?

    var id: String { label }
}
