import SwiftUI
import BradOSCore

/// Container rendering 7 MealDayCards for a given meal type, with swipe-to-remove support
struct MealTypeCardsView: View {
    let mealType: MealType
    @ObservedObject var viewModel: MealPlanViewModel

    var body: some View {
        List {
            ForEach(viewModel.entriesForMealType(mealType)) { entry in
                MealDayCard(entry: entry, viewModel: viewModel)
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                    .listRowInsets(EdgeInsets(
                        top: Theme.Spacing.space1,
                        leading: 0,
                        bottom: Theme.Spacing.space1,
                        trailing: 0
                    ))
                    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                        if viewModel.isSlotInteractive(entry) {
                            Button(role: .destructive) {
                                viewModel.toggleRemove(for: entry)
                            } label: {
                                Label("Remove", systemImage: "trash")
                            }
                        }
                    }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
    }
}

// MARK: - Previews

#Preview("Breakfast Tab") {
    MealTypeCardsView(mealType: .breakfast, viewModel: .preview)
        .background(AuroraBackground())
        .preferredColorScheme(.dark)
}
