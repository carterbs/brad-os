import SwiftUI
import BradOSCore

/// Shopping list view with sectioned items and Reminders export
struct ShoppingListView: View {
    @ObservedObject var viewModel: MealPlanViewModel

    var body: some View {
        if viewModel.shoppingList.isEmpty {
            emptyState
        } else {
            VStack(spacing: Theme.Spacing.space4) {
                ForEach(viewModel.shoppingList) { section in
                    sectionCard(section)
                }

                remindersButton
            }
        }
    }

    // MARK: - Empty State

    @ViewBuilder
    private var emptyState: some View {
        VStack(spacing: Theme.Spacing.space4) {
            Spacer()

            Image(systemName: "cart")
                .font(.system(size: Theme.Typography.iconLG))
                .foregroundColor(Theme.textSecondary)

            Text("Generate a meal plan to see your shopping list")
                .font(.subheadline)
                .foregroundColor(Theme.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, Theme.Spacing.space6)

            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Section Card

    @ViewBuilder
    private func sectionCard(_ section: ShoppingListSection) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space2) {
            // Section header
            HStack {
                Text(section.name)
                    .font(.subheadline)
                    .fontWeight(.bold)
                    .foregroundColor(Theme.textPrimary)

                Spacer()

                Text("\(section.items.count)")
                    .font(.caption)
                    .monospacedDigit()
                    .foregroundColor(Theme.textSecondary)
                    .padding(.horizontal, Theme.Spacing.space2)
                    .padding(.vertical, 2)
                    .background(Color.white.opacity(0.06))
                    .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))
            }

            if section.isPantryStaples {
                Text("(you may already have these)")
                    .font(.caption)
                    .foregroundColor(Theme.textSecondary)
                    .italic()
            }

            // Items
            ForEach(section.items) { item in
                Text(item.displayText)
                    .font(.subheadline)
                    .foregroundColor(Theme.textPrimary)
                    .padding(.leading, Theme.Spacing.space1)
            }
        }
        .glassCard()
    }

    // MARK: - Save to Grocery List Button

    @ViewBuilder
    private var remindersButton: some View {
        SaveToGroceryListButton(viewModel: viewModel)
    }
}

// MARK: - Save to Grocery List Button (reusable)

/// Standalone button for exporting the shopping list to Apple Reminders.
/// Used in both the shopping list tab and the finalized plan view.
struct SaveToGroceryListButton: View {
    @ObservedObject var viewModel: MealPlanViewModel

    var body: some View {
        VStack(spacing: Theme.Spacing.space2) {
            Button(action: {
                Task { await viewModel.exportToReminders() }
            }) {
                HStack(spacing: Theme.Spacing.space2) {
                    if viewModel.isExportingToReminders {
                        ProgressView()
                            .tint(Theme.textOnAccent)
                    } else if viewModel.remindersExportResult != nil {
                        Image(systemName: "checkmark.circle.fill")
                        Text("Saved to Grocery List!")
                    } else {
                        Image(systemName: "cart.badge.plus")
                        Text("Save to Grocery List")
                    }
                }
                .font(.subheadline)
                .fontWeight(.semibold)
                .frame(maxWidth: .infinity)
                .padding(.vertical, Theme.Spacing.space2)
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(viewModel.isExportingToReminders)

            if let errorMsg = viewModel.remindersError {
                Text(errorMsg)
                    .font(.caption)
                    .foregroundColor(Theme.destructive)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, Theme.Spacing.space4)
            }
        }
    }
}

#Preview("Shopping List") {
    ZStack {
        AuroraBackground()

        ScrollView {
            ShoppingListView(viewModel: .preview)
                .padding(Theme.Spacing.space4)
        }
    }
    .preferredColorScheme(.dark)
}
