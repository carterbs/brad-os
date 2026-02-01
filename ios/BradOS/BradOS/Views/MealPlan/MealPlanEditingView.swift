import SwiftUI
import BradOSCore

/// Tab options for the editing view's meal type picker
private enum EditingTab: String, CaseIterable {
    case breakfast = "Breakfast"
    case lunch = "Lunch"
    case dinner = "Dinner"
    case shopping = "Shopping"

    var mealType: MealType? {
        switch self {
        case .breakfast: return .breakfast
        case .lunch: return .lunch
        case .dinner: return .dinner
        case .shopping: return nil
        }
    }
}

/// Container for the meal plan editing experience with tabbed meal-type views
struct MealPlanEditingView: View {
    @ObservedObject var viewModel: MealPlanViewModel
    @State private var selectedTab: EditingTab = .breakfast

    var body: some View {
        VStack(spacing: 0) {
            // Segmented picker: Breakfast | Lunch | Dinner | Shopping
            Picker("Meal Type", selection: $selectedTab) {
                ForEach(EditingTab.allCases, id: \.self) { tab in
                    Text(tab.rawValue).tag(tab)
                }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, Theme.Spacing.md)
            .padding(.top, Theme.Spacing.sm)

            // Tab content
            switch selectedTab {
            case .breakfast, .lunch, .dinner:
                if let mealType = selectedTab.mealType {
                    MealTypeCardsView(mealType: mealType, viewModel: viewModel)
                }
            case .shopping:
                ScrollView {
                    ShoppingListView(viewModel: viewModel)
                        .padding(Theme.Spacing.md)
                }
            }

            Spacer(minLength: 0)

            // Bottom controls pinned at bottom
            VStack(spacing: Theme.Spacing.sm) {
                // Error display
                if let error = viewModel.error {
                    HStack(spacing: Theme.Spacing.sm) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .foregroundColor(Theme.error)
                        Text(error)
                            .font(.caption)
                            .foregroundColor(Theme.error)
                    }
                    .padding(.horizontal, Theme.Spacing.md)
                }

                // Collapsible freeform critique
                CollapsibleCritiqueView(viewModel: viewModel)
                    .padding(.horizontal, Theme.Spacing.md)

                // Queued actions button
                QueuedActionsButton(viewModel: viewModel)
                    .padding(.horizontal, Theme.Spacing.md)

                // Finalize button
                Button(action: {
                    Task { await viewModel.finalize() }
                }) {
                    HStack {
                        Image(systemName: "checkmark.seal")
                        Text("Finalize Plan")
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(PrimaryButtonStyle())
                .padding(.horizontal, Theme.Spacing.md)
            }
            .padding(.bottom, Theme.Spacing.sm)
        }
    }
}

#Preview("Editing View") {
    MealPlanEditingView(viewModel: .preview)
        .background(Theme.background)
        .preferredColorScheme(.dark)
}
