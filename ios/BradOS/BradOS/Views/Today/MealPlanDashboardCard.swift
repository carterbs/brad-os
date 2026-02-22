import SwiftUI
import BradOSCore

/// Shared meal day content — day name header + meal rows with icons and labels.
/// Used in both the Today dashboard card and the Meal Plan focus card.
struct MealDayContent: View {
    let dayName: String
    let meals: [MealPlanEntry]
    var changedSlots: Set<String> = []
    var prepAheadMealIds: Set<String> = []

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space3) {
            Text(dayName)
                .font(.headline)
                .fontWeight(.bold)
                .foregroundColor(Theme.mealPlan)

            ForEach(MealType.allCases, id: \.self) { mealType in
                mealRow(mealType: mealType)
            }
        }
    }

    @ViewBuilder
    private func mealRow(mealType: MealType) -> some View {
        let entry = meals.first { $0.mealType == mealType }
        let entryId = entry?.id ?? ""
        let isChanged = changedSlots.contains(entryId)

        HStack(spacing: Theme.Spacing.space3) {
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

            if let mealId = entry?.mealId, prepAheadMealIds.contains(mealId) {
                Text("prep")
                    .font(.caption2)
                    .foregroundColor(Theme.warning)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Theme.warning.opacity(0.2))
                    .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))
            }
        }
        .padding(.vertical, Theme.Spacing.space1)
        .background(isChanged ? Theme.success.opacity(0.15) : Color.clear)
        .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))
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

/// Dashboard card displaying today's meals from a finalized meal plan
struct MealPlanDashboardCard: View {
    let todayMeals: [MealPlanEntry]
    let isLoading: Bool
    let onTap: () -> Void
    var onLongPress: (() -> Void)?
    var prepAheadMealIds: Set<String> = []
    var prepAheadMeals: [MealPlanEntry] = []

    private let dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

    var body: some View {
        Button(action: onTap) {
            cardContent
        }
        .buttonStyle(PlainButtonStyle())
        .onLongPressGesture {
            let impact = UIImpactFeedbackGenerator(style: .medium)
            impact.impactOccurred()
            onLongPress?()
        }
    }

    @ViewBuilder
    private var cardContent: some View {
        if isLoading && todayMeals.isEmpty {
            loadingState
        } else {
            mealContent
        }
    }

    // MARK: - Loading State

    private var loadingState: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            Text("Meal Plan")
                .font(.headline)
                .foregroundColor(Theme.textSecondary)
            Text("Loading...")
                .font(.subheadline)
                .foregroundColor(Theme.textTertiary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .glassCard()
    }

    // MARK: - Meal Content

    private var mealContent: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space3) {
            if todayMeals.isEmpty {
                Text("No finalized meal plan")
                    .font(.subheadline)
                    .foregroundColor(Theme.textSecondary)
            } else {
                MealDayContent(dayName: todayDayName, meals: todayMeals, prepAheadMealIds: prepAheadMealIds)
            }

            if !prepAheadMeals.isEmpty {
                prepAheadSection
            }

            HStack {
                Spacer()
                HStack(spacing: Theme.Spacing.space1) {
                    Text("View Plan")
                        .font(.callout.weight(.semibold))
                    Image(systemName: "chevron.right")
                        .font(.caption)
                }
                .foregroundColor(Theme.mealPlan)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .glassCard()
        .auroraGlow(Theme.mealPlan, intensity: .primary)
    }

    // MARK: - Prep Ahead Section

    private var prepAheadSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space2) {
            Divider()
                .overlay(Theme.strokeSubtle)

            Text("Prep Ahead")
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundColor(Theme.warning)

            ForEach(prepAheadMeals) { entry in
                HStack(spacing: Theme.Spacing.space3) {
                    Image(systemName: "clock.arrow.circlepath")
                        .font(.caption)
                        .foregroundColor(Theme.warning)
                        .frame(width: 24)

                    Text(entry.mealName ?? "\u{2014}")
                        .font(.subheadline)
                        .foregroundColor(Theme.textPrimary)
                        .lineLimit(1)

                    Spacer()

                    Text(dayNames[entry.dayIndex])
                        .font(.caption2)
                        .foregroundColor(Theme.textSecondary)
                }
            }
        }
    }

    private var todayDayName: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "EEEE"
        return formatter.string(from: Date())
    }
}

// MARK: - Previews

#Preview("With Meals") {
    MealPlanDashboardCard(
        todayMeals: [
            MealPlanEntry(dayIndex: 0, mealType: .breakfast, mealId: "m1", mealName: "Scrambled Eggs"),
            MealPlanEntry(dayIndex: 0, mealType: .lunch, mealId: "m2", mealName: "Chicken Caesar Salad"),
            MealPlanEntry(dayIndex: 0, mealType: .dinner, mealId: "m3", mealName: "Salmon with Rice"),
        ],
        isLoading: false,
        onTap: {}
    )
    .padding()
    .background(AuroraBackground().ignoresSafeArea())
    .preferredColorScheme(.dark)
}

#Preview("Empty") {
    MealPlanDashboardCard(
        todayMeals: [],
        isLoading: false,
        onTap: {}
    )
    .padding()
    .background(AuroraBackground().ignoresSafeArea())
    .preferredColorScheme(.dark)
}

#Preview("Loading") {
    MealPlanDashboardCard(
        todayMeals: [],
        isLoading: true,
        onTap: {}
    )
    .padding()
    .background(AuroraBackground().ignoresSafeArea())
    .preferredColorScheme(.dark)
}
