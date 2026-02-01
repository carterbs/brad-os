import SwiftUI
import BradOSCore

/// Main meal plan view managing generation, critique, and finalization
struct MealPlanView: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var viewModel: MealPlanViewModel

    init(apiClient: APIClientProtocol = APIClient.shared) {
        let recipeCache = RecipeCacheService(apiClient: apiClient)
        _viewModel = StateObject(wrappedValue: MealPlanViewModel(apiClient: apiClient, recipeCache: recipeCache))
    }

    var body: some View {
        NavigationStack {
            ZStack {
                AuroraBackground()

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
                        .foregroundColor(Theme.interactivePrimary)
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
        VStack(spacing: Theme.Spacing.space4) {
            Spacer()

            Image(systemName: "fork.knife")
                .font(.system(size: Theme.Typography.iconXL))
                .foregroundColor(Theme.mealPlan)

            Text("Weekly Meal Plan")
                .font(.title2)
                .fontWeight(.bold)
                .foregroundColor(Theme.textPrimary)

            Text("Generate a 7-day meal plan based on your saved meals. You can refine it with feedback before finalizing.")
                .font(.subheadline)
                .foregroundColor(Theme.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, Theme.Spacing.space6)

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
            .padding(.horizontal, Theme.Spacing.space7)

            if let error = viewModel.error {
                Text(error)
                    .font(.caption)
                    .foregroundColor(Theme.destructive)
            }

            Spacer()
        }
        .padding(Theme.Spacing.space4)
    }

    // MARK: - Loading State

    @ViewBuilder
    private var loadingState: some View {
        VStack(spacing: Theme.Spacing.space4) {
            ProgressView()
                .tint(Theme.mealPlan)
                .scaleEffect(1.5)

            Text("Generating meal plan...")
                .font(.subheadline)
                .foregroundColor(Theme.textSecondary)
        }
        .padding(Theme.Spacing.space7)
    }

    // MARK: - Session Content

    @ViewBuilder
    private func sessionContent(_ session: MealPlanSession) -> some View {
        if session.isFinalized {
            finalizedContent(session)
        } else {
            MealPlanEditingView(viewModel: viewModel)
        }
    }

    // MARK: - Finalized Content (read-only)

    @ViewBuilder
    private func finalizedContent(_ session: MealPlanSession) -> some View {
        ScrollView {
            VStack(spacing: 20) {
                finalizedBadge

                TodayFocusView(
                    plan: viewModel.currentPlan,
                    changedSlots: viewModel.changedSlots
                )

                SaveToGroceryListButton(viewModel: viewModel)

                newPlanButton
            }
            .padding(Theme.Spacing.space4)
        }
    }

    // MARK: - Finalized Badge

    @ViewBuilder
    private var finalizedBadge: some View {
        HStack(spacing: Theme.Spacing.space2) {
            Image(systemName: "checkmark.seal.fill")
                .font(.caption)
                .foregroundColor(Theme.success.opacity(0.8))
            Text("Finalized")
                .font(.caption)
                .fontWeight(.medium)
                .foregroundColor(Theme.success.opacity(0.8))
        }
        .padding(.horizontal, Theme.Spacing.space2)
        .padding(.vertical, Theme.Spacing.space1)
        .background(Theme.success.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.lg, style: .continuous))
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
        .padding(.top, Theme.Spacing.space2)
    }
}

#Preview("Meal Plan - Empty") {
    MealPlanView(apiClient: MockAPIClient.empty)
        .environmentObject(AppState())
        .preferredColorScheme(.dark)
        .background(AuroraBackground())
}

#Preview("Meal Plan - With Session") {
    MealPlanView(apiClient: MockAPIClient())
        .environmentObject(AppState())
        .preferredColorScheme(.dark)
        .background(AuroraBackground())
}
