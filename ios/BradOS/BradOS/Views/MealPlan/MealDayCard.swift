import SwiftUI
import BradOSCore

/// Individual card for one day within a meal-type tab.
/// Supports tap-to-swap and swipe-to-remove interactions.
struct MealDayCard: View {
    let entry: MealPlanEntry
    @ObservedObject var viewModel: MealPlanViewModel

    private let dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

    private var action: MealPlanAction? {
        viewModel.actionForEntry(entry)
    }

    private var isInteractive: Bool {
        viewModel.isSlotInteractive(entry)
    }

    private var isChanged: Bool {
        viewModel.changedSlots.contains(entry.id)
    }

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(dayNames[safe: entry.dayIndex] ?? "Day \(entry.dayIndex)")
                    .font(.caption)
                    .foregroundColor(Theme.textSecondary)

                if let mealName = entry.mealName {
                    Text(mealName)
                        .font(.body)
                        .foregroundColor(Theme.textPrimary)
                        .strikethrough(action == .remove, color: Theme.destructive)
                        .lineLimit(2)
                } else {
                    Text("\u{2014}")
                        .font(.body)
                        .foregroundColor(Theme.textSecondary)
                }
            }

            Spacer()

            // Effort badge
            if let effort = viewModel.effortForEntry(entry) {
                Text("\(effort)")
                    .font(.caption2)
                    .monospaced()
                    .monospacedDigit()
                    .foregroundColor(Theme.textSecondary)
                    .padding(Theme.Spacing.space1)
                    .background(Theme.mealPlan.opacity(0.2))
                    .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))
            }

            // Action badge
            if action == .swap {
                Text("swap")
                    .font(.caption2)
                    .foregroundColor(Theme.mealPlan)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Theme.mealPlan.opacity(0.2))
                    .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))
            }
        }
        .padding(.horizontal, Theme.Spacing.space4)
        .padding(.vertical, 10)
        .background(backgroundColor)
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.lg, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.CornerRadius.lg, style: .continuous)
                .stroke(borderColor, lineWidth: 1)
        )
        .opacity(isInteractive ? 1.0 : 0.5)
        .contentShape(Rectangle())
        .onTapGesture {
            guard isInteractive else { return }
            viewModel.toggleSwap(for: entry)
        }
        .animation(.easeInOut(duration: 0.2), value: action)
        .animation(.easeInOut(duration: 0.5), value: isChanged)
    }

    // MARK: - Visual States

    private var backgroundColor: Color {
        if isChanged {
            return Theme.success.opacity(0.3)
        }
        switch action {
        case .swap:
            return Theme.mealPlan.opacity(0.15)
        case .remove:
            return Theme.destructive.opacity(0.15)
        case nil:
            return Color.white.opacity(0.06)
        }
    }

    private var borderColor: Color {
        if isChanged {
            return Theme.success.opacity(0.5)
        }
        switch action {
        case .swap:
            return Theme.mealPlan
        case .remove:
            return Theme.destructive
        case nil:
            return Theme.strokeSubtle
        }
    }
}

// MARK: - Previews

#Preview("Normal") {
    MealDayCard(
        entry: MealPlanEntry(dayIndex: 0, mealType: .breakfast, mealId: "m1", mealName: "Scrambled Eggs"),
        viewModel: .preview
    )
    .padding()
    .background(AuroraBackground())
    .preferredColorScheme(.dark)
}

#Preview("Non-interactive") {
    MealDayCard(
        entry: MealPlanEntry(dayIndex: 4, mealType: .dinner, mealId: nil, mealName: "Eating out"),
        viewModel: .preview
    )
    .padding()
    .background(AuroraBackground())
    .preferredColorScheme(.dark)
}
