import SwiftUI
import BradOSCore

/// Container rendering 7 MealDayCards for a given meal type, with swipe-to-remove support
struct MealTypeCardsView: View {
    let mealType: MealType
    @ObservedObject var viewModel: MealPlanViewModel

    var body: some View {
        List {
            if mealType == .breakfast {
                breakfastSection(title: "Family Breakfast", track: .family)
                breakfastSection(title: "Brad Breakfast", track: .adult)
            } else {
                ForEach(viewModel.entriesForMealType(mealType)) { entry in
                    mealRow(entry)
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
    }

    @ViewBuilder
    private func breakfastSection(title: String, track: MealTrack) -> some View {
        let entries = viewModel.entriesForMealType(.breakfast).filter { $0.mealTrack == track }
        if !entries.isEmpty {
            Section {
                ForEach(entries) { entry in
                    mealRow(entry)
                }
            } header: {
                Text(title)
                    .font(.caption)
                    .fontWeight(.semibold)
                    .foregroundColor(Theme.textSecondary)
                    .textCase(nil)
            }
        }
    }

    private func mealRow(_ entry: MealPlanEntry) -> some View {
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

// MARK: - Previews

#Preview("Breakfast Tab") {
    MealTypeCardsView(mealType: .breakfast, viewModel: .preview)
        .background(AuroraBackground().ignoresSafeArea())
        .preferredColorScheme(.dark)
}
