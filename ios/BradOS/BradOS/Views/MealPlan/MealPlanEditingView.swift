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
            HStack(spacing: 0) {
                ForEach(EditingTab.allCases, id: \.self) { tab in
                    Button {
                        withAnimation(Theme.Motion.standardSpring) {
                            selectedTab = tab
                        }
                    } label: {
                        Text(tab.rawValue)
                            .font(.footnote.weight(.semibold))
                            .foregroundColor(selectedTab == tab ? Theme.interactivePrimary : Theme.textSecondary)
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .overlay(alignment: .bottom) {
                                Rectangle()
                                    .fill(selectedTab == tab ? Theme.mealPlan : .clear)
                                    .frame(height: 2)
                            }
                    }
                    .buttonStyle(.plain)
                }
            }
            .overlay(alignment: .bottom) {
                Rectangle()
                    .fill(Theme.divider)
                    .frame(height: 1)
            }

            // Tab content
            switch selectedTab {
            case .breakfast, .lunch, .dinner:
                if let mealType = selectedTab.mealType {
                    MealTypeCardsView(mealType: mealType, viewModel: viewModel)
                }
            case .shopping:
                ScrollView {
                    ShoppingListView(viewModel: viewModel)
                        .padding(Theme.Spacing.space4)
                        .padding(.bottom, Theme.Spacing.space7)
                }
            }

            Spacer(minLength: 0)

            // Bottom controls pinned at bottom
            VStack(spacing: Theme.Spacing.space2) {
                // Error display
                if let error = viewModel.error {
                    HStack(spacing: Theme.Spacing.space2) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .foregroundColor(Theme.destructive)
                        Text(error)
                            .font(.caption)
                            .foregroundColor(Theme.destructive)
                    }
                    .padding(.horizontal, Theme.Spacing.space4)
                }

                // Collapsible freeform critique
                CollapsibleCritiqueView(viewModel: viewModel)
                    .padding(.horizontal, Theme.Spacing.space4)

                // Queued actions button
                QueuedActionsButton(viewModel: viewModel)
                    .padding(.horizontal, Theme.Spacing.space4)

                // Finalize button
                Button(action: {
                    Task { await viewModel.finalize() }
                }, label: {
                    HStack {
                        Image(systemName: "checkmark.seal")
                        Text("Finalize Plan")
                    }
                    .frame(maxWidth: .infinity)
                })
                .buttonStyle(PrimaryButtonStyle())
                .padding(.horizontal, Theme.Spacing.space4)
            }
            .padding(.bottom, Theme.Spacing.space2)
        }
    }
}

#Preview("Editing View") {
    MealPlanEditingView(viewModel: .preview)
        .background(AuroraBackground().ignoresSafeArea())
        .preferredColorScheme(.dark)
}
