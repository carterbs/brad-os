import SwiftUI
import BradOSCore

/// Dashboard card displaying today's meals from a finalized meal plan
struct MealPlanDashboardCard: View {
    let todayMeals: [MealPlanEntry]
    let isLoading: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            cardContent
        }
        .buttonStyle(PlainButtonStyle())
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
        VStack(alignment: .leading, spacing: Theme.Spacing.md) {
            HStack {
                Image(systemName: "fork.knife")
                    .font(.system(size: 20))
                    .foregroundColor(Theme.mealPlan)
                Text("Meal Plan")
                    .font(.headline)
                    .foregroundColor(Theme.textPrimary)
                Spacer()
            }

            Text("Loading meal plan...")
                .font(.subheadline)
                .foregroundColor(Theme.textSecondary)
        }
        .padding(Theme.Spacing.md)
        .background(Theme.mealPlan.opacity(0.1))
        .cornerRadius(Theme.CornerRadius.lg)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.CornerRadius.lg)
                .stroke(Theme.mealPlan.opacity(0.5), lineWidth: 1)
        )
    }

    // MARK: - Meal Content

    private var mealContent: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.md) {
            // Header
            HStack {
                Image(systemName: "fork.knife")
                    .font(.system(size: 20))
                    .foregroundColor(Theme.mealPlan)
                Text("Meal Plan")
                    .font(.headline)
                    .foregroundColor(Theme.textPrimary)
                Spacer()
            }

            if todayMeals.isEmpty {
                Text("No finalized meal plan")
                    .font(.subheadline)
                    .foregroundColor(Theme.textSecondary)
            } else {
                // Meal rows for breakfast, lunch, dinner
                VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                    mealRow(for: .breakfast)
                    mealRow(for: .lunch)
                    mealRow(for: .dinner)
                }
            }

            // Action button
            HStack {
                Spacer()
                HStack(spacing: 4) {
                    Text("View Plan")
                        .font(.subheadline)
                        .fontWeight(.medium)
                    Image(systemName: "chevron.right")
                        .font(.caption)
                }
                .foregroundColor(Theme.mealPlan)
            }
        }
        .padding(Theme.Spacing.md)
        .background(Theme.mealPlan.opacity(0.1))
        .cornerRadius(Theme.CornerRadius.lg)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.CornerRadius.lg)
                .stroke(Theme.mealPlan.opacity(0.5), lineWidth: 1)
        )
    }

    // MARK: - Helpers

    @ViewBuilder
    private func mealRow(for mealType: MealType) -> some View {
        let entry = todayMeals.first { $0.mealType == mealType }
        HStack(spacing: Theme.Spacing.sm) {
            Image(systemName: mealTypeIcon(mealType))
                .font(.caption)
                .foregroundColor(Theme.textSecondary)
                .frame(width: 16)
            Text(entry?.mealName ?? "\u{2014}")
                .font(.subheadline)
                .foregroundColor(entry?.mealName != nil ? Theme.textPrimary : Theme.textSecondary)
                .lineLimit(1)
        }
    }

    private func mealTypeIcon(_ mealType: MealType) -> String {
        switch mealType {
        case .breakfast: return "sunrise"
        case .lunch: return "sun.max"
        case .dinner: return "moon.stars"
        }
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
    .background(Theme.background)
    .preferredColorScheme(.dark)
}

#Preview("Empty") {
    MealPlanDashboardCard(
        todayMeals: [],
        isLoading: false,
        onTap: {}
    )
    .padding()
    .background(Theme.background)
    .preferredColorScheme(.dark)
}

#Preview("Loading") {
    MealPlanDashboardCard(
        todayMeals: [],
        isLoading: true,
        onTap: {}
    )
    .padding()
    .background(Theme.background)
    .preferredColorScheme(.dark)
}
