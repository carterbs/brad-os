import SwiftUI
import BradOSCore

/// Shopping list view with sectioned items and Reminders export
struct ShoppingListView: View {
    @ObservedObject var viewModel: MealPlanViewModel

    var body: some View {
        if viewModel.shoppingList.isEmpty {
            emptyState
        } else {
            VStack(spacing: Theme.Spacing.md) {
                ForEach(viewModel.shoppingList) { section in
                    sectionCard(section)
                }

                remindersButton

                if let errorMsg = viewModel.remindersError {
                    Text(errorMsg)
                        .font(.caption)
                        .foregroundColor(.red)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, Theme.Spacing.md)
                }
            }
        }
    }

    // MARK: - Empty State

    @ViewBuilder
    private var emptyState: some View {
        VStack(spacing: Theme.Spacing.md) {
            Spacer()

            Image(systemName: "cart")
                .font(.system(size: 48))
                .foregroundColor(Theme.textSecondary)

            Text("Generate a meal plan to see your shopping list")
                .font(.subheadline)
                .foregroundColor(Theme.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, Theme.Spacing.lg)

            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Section Card

    @ViewBuilder
    private func sectionCard(_ section: ShoppingListSection) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            // Section header
            HStack {
                Text(section.name)
                    .font(.subheadline)
                    .fontWeight(.bold)
                    .foregroundColor(Theme.textPrimary)

                Spacer()

                Text("\(section.items.count)")
                    .font(.caption)
                    .foregroundColor(Theme.textSecondary)
                    .padding(.horizontal, Theme.Spacing.sm)
                    .padding(.vertical, 2)
                    .background(Theme.backgroundTertiary)
                    .cornerRadius(Theme.CornerRadius.sm)
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
                    .padding(.leading, Theme.Spacing.xs)
            }
        }
        .padding(Theme.Spacing.md)
        .background(Theme.backgroundSecondary)
        .cornerRadius(Theme.CornerRadius.md)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.CornerRadius.md)
                .stroke(Theme.border, lineWidth: 1)
        )
    }

    // MARK: - Reminders Button

    @ViewBuilder
    private var remindersButton: some View {
        Button(action: {
            Task { await viewModel.exportToReminders() }
        }) {
            HStack {
                if viewModel.isExportingToReminders {
                    ProgressView()
                        .tint(.white)
                } else if viewModel.remindersExportResult != nil {
                    Image(systemName: "checkmark")
                    Text("Sent to Reminders!")
                } else {
                    Image(systemName: "checklist")
                    Text("Send to Reminders")
                }
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(PrimaryButtonStyle())
        .disabled(viewModel.isExportingToReminders)
        .padding(.top, Theme.Spacing.sm)
    }
}

#Preview("Shopping List") {
    ZStack {
        Theme.background
            .ignoresSafeArea()

        ScrollView {
            ShoppingListView(viewModel: .preview)
                .padding(Theme.Spacing.md)
        }
    }
    .preferredColorScheme(.dark)
}
