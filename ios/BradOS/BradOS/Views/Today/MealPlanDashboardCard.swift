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
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            cardHeader

            Text("Loading meal plan...")
                .font(.subheadline)
                .foregroundColor(Theme.textSecondary)
        }
        .glassCard()
    }

    // MARK: - Meal Content

    private var mealContent: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            // Header
            cardHeader

            if todayMeals.isEmpty {
                Text("No finalized meal plan")
                    .font(.subheadline)
                    .foregroundColor(Theme.textSecondary)
            } else {
                // Meal rows for breakfast, lunch, dinner
                VStack(alignment: .leading, spacing: Theme.Spacing.space2) {
                    mealRow(for: .breakfast)
                    mealRow(for: .lunch)
                    mealRow(for: .dinner)
                }
            }

            // Action link
            HStack {
                Spacer()
                actionLink
            }
        }
        .glassCard()
    }

    // MARK: - Card Header

    private var cardHeader: some View {
        HStack {
            cardHeaderIcon
            Text("Meal Plan")
                .font(.title3)
                .foregroundColor(Theme.textPrimary)
            Spacer()
        }
    }

    private var cardHeaderIcon: some View {
        Image(systemName: "fork.knife")
            .font(.system(size: Theme.Typography.cardHeaderIcon))
            .foregroundColor(Theme.mealPlan)
            .frame(width: Theme.Dimensions.iconFrameMD, height: Theme.Dimensions.iconFrameMD)
            .background(Theme.mealPlan.opacity(0.12))
            .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))
    }

    // MARK: - Helpers

    private var actionLink: some View {
        HStack(spacing: Theme.Spacing.space1) {
            Text("View Plan")
                .font(.callout.weight(.semibold))
            Image(systemName: "chevron.right")
                .font(.caption)
        }
        .foregroundColor(Theme.mealPlan)
    }

    @ViewBuilder
    private func mealRow(for mealType: MealType) -> some View {
        let entry = todayMeals.first { $0.mealType == mealType }
        HStack(spacing: Theme.Spacing.space2) {
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
    .background(AuroraBackground())
    .preferredColorScheme(.dark)
}

#Preview("Empty") {
    MealPlanDashboardCard(
        todayMeals: [],
        isLoading: false,
        onTap: {}
    )
    .padding()
    .background(AuroraBackground())
    .preferredColorScheme(.dark)
}

#Preview("Loading") {
    MealPlanDashboardCard(
        todayMeals: [],
        isLoading: true,
        onTap: {}
    )
    .padding()
    .background(AuroraBackground())
    .preferredColorScheme(.dark)
}
