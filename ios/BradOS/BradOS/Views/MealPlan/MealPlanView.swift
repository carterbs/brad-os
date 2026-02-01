import SwiftUI
import BradOSCore

/// Main meal plan view managing generation, critique, and finalization
struct MealPlanView: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var viewModel: MealPlanViewModel

    init(apiClient: APIClientProtocol = APIClient.shared) {
        _viewModel = StateObject(wrappedValue: MealPlanViewModel(apiClient: apiClient))
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.background
                    .ignoresSafeArea()

                if viewModel.isLoading {
                    loadingState
                } else if let session = viewModel.session {
                    sessionContent(session)
                } else {
                    emptyState
                }
            }
            .navigationTitle("Meal Plan")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button(action: {
                        appState.isShowingMealPlan = false
                    }) {
                        HStack(spacing: 4) {
                            Image(systemName: "chevron.left")
                            Text("Back")
                        }
                        .foregroundColor(Theme.accent)
                    }
                }
            }
            .task {
                await viewModel.loadExistingSession()
            }
        }
    }

    // MARK: - Empty State (No Session)

    @ViewBuilder
    private var emptyState: some View {
        VStack(spacing: Theme.Spacing.md) {
            Spacer()

            Image(systemName: "fork.knife")
                .font(.system(size: 60))
                .foregroundColor(Theme.mealPlan)

            Text("Weekly Meal Plan")
                .font(.title2)
                .fontWeight(.bold)
                .foregroundColor(Theme.textPrimary)

            Text("Generate a 7-day meal plan based on your saved meals. You can refine it with feedback before finalizing.")
                .font(.subheadline)
                .foregroundColor(Theme.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, Theme.Spacing.lg)

            Button(action: {
                Task { await viewModel.generatePlan() }
            }) {
                HStack {
                    Image(systemName: "sparkles")
                    Text("Generate Plan")
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(PrimaryButtonStyle())
            .padding(.horizontal, Theme.Spacing.xl)

            if let error = viewModel.error {
                Text(error)
                    .font(.caption)
                    .foregroundColor(Theme.error)
            }

            Spacer()
        }
        .padding(Theme.Spacing.md)
    }

    // MARK: - Loading State

    @ViewBuilder
    private var loadingState: some View {
        VStack(spacing: Theme.Spacing.md) {
            ProgressView()
                .tint(Theme.mealPlan)
                .scaleEffect(1.5)

            Text("Generating meal plan...")
                .font(.subheadline)
                .foregroundColor(Theme.textSecondary)
        }
        .padding(Theme.Spacing.xl)
    }

    // MARK: - Session Content

    @ViewBuilder
    private func sessionContent(_ session: MealPlanSession) -> some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(spacing: Theme.Spacing.md) {
                    // Finalized badge
                    if session.isFinalized {
                        finalizedBadge
                    }

                    // Meal plan grid
                    MealPlanGridView(
                        plan: viewModel.currentPlan,
                        changedSlots: viewModel.changedSlots
                    )

                    // Error display
                    if let error = viewModel.error {
                        HStack(spacing: Theme.Spacing.sm) {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .foregroundColor(Theme.error)
                            Text(error)
                                .font(.caption)
                                .foregroundColor(Theme.error)
                        }
                        .padding(Theme.Spacing.sm)
                    }

                    // Critique and finalize (only if not finalized)
                    if !session.isFinalized {
                        CritiqueInputView(viewModel: viewModel)

                        finalizeButton
                    } else {
                        // Offer to start a new plan
                        newPlanButton
                    }
                }
                .padding(Theme.Spacing.md)
            }
        }
    }

    // MARK: - Finalized Badge

    @ViewBuilder
    private var finalizedBadge: some View {
        HStack(spacing: Theme.Spacing.sm) {
            Image(systemName: "checkmark.seal.fill")
                .foregroundColor(Theme.success)
            Text("Plan Finalized")
                .font(.subheadline)
                .fontWeight(.semibold)
                .foregroundColor(Theme.success)
        }
        .padding(.horizontal, Theme.Spacing.md)
        .padding(.vertical, Theme.Spacing.sm)
        .background(Theme.success.opacity(0.15))
        .cornerRadius(Theme.CornerRadius.md)
    }

    // MARK: - Finalize Button

    @ViewBuilder
    private var finalizeButton: some View {
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
        .padding(.top, Theme.Spacing.sm)
    }

    // MARK: - New Plan Button

    @ViewBuilder
    private var newPlanButton: some View {
        Button(action: {
            viewModel.startNewPlan()
        }) {
            HStack {
                Image(systemName: "arrow.counterclockwise")
                Text("Start New Plan")
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(SecondaryButtonStyle())
        .padding(.top, Theme.Spacing.sm)
    }
}

#Preview("Meal Plan - Empty") {
    MealPlanView(apiClient: MockAPIClient.empty)
        .environmentObject(AppState())
        .preferredColorScheme(.dark)
}

#Preview("Meal Plan - With Session") {
    MealPlanView(apiClient: MockAPIClient())
        .environmentObject(AppState())
        .preferredColorScheme(.dark)
}
