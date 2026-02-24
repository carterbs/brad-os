import SwiftUI
import BradOSCore

/// Main meal plan view managing generation, critique, and finalization
struct MealPlanView: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var viewModel: MealPlanViewModel

    init(apiClient: APIClientProtocol? = nil) {
        if let apiClient = apiClient {
            let recipeCache = RecipeCacheService(apiClient: apiClient)
            _viewModel = StateObject(wrappedValue: MealPlanViewModel(apiClient: apiClient, recipeCache: recipeCache))
        } else {
            _viewModel = StateObject(wrappedValue: ViewModelFactory.makeMealPlanViewModel())
        }
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
            .toolbarBackground(.hidden, for: .navigationBar)
            .toolbar {
                // Only show back button when presented as sheet (isShowingMealPlan)
                // When shown in Meals tab, no back button needed
                if appState.isShowingMealPlan {
                    ToolbarItem(placement: .navigationBarLeading) {
                        Button(action: {
                            appState.isShowingMealPlan = false
                        }, label: {
                            HStack(spacing: 4) {
                                Image(systemName: "chevron.left")
                                Text("Back")
                            }
                            .foregroundColor(Theme.interactivePrimary)
                        })
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
                .font(.headline)
                .fontWeight(.bold)
                .foregroundColor(Theme.textPrimary)

            Text(
                "Generate a 7-day meal plan based on your saved meals. "
                + "You can refine it with feedback before finalizing."
            )
                .font(.subheadline)
                .foregroundColor(Theme.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, Theme.Spacing.space6)

            Button(action: {
                Task { await viewModel.generatePlan() }
            }, label: {
                HStack {
                    Image(systemName: "sparkles")
                    Text("Generate Plan")
                }
                .frame(maxWidth: .infinity)
            })
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
    private func finalizedContent(_: MealPlanSession) -> some View {
        ScrollView {
            VStack(spacing: 20) {
                finalizedBadge

                TodayFocusView(
                    plan: viewModel.currentPlan,
                    changedSlots: viewModel.changedSlots,
                    prepAheadMealIds: viewModel.prepAheadMealIds
                )

                SaveToGroceryListButton(viewModel: viewModel)

                newPlanButton
            }
            .padding(Theme.Spacing.space4)
            .padding(.bottom, Theme.Spacing.space7)
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

    @State private var showNewPlanConfirmation = false

    @ViewBuilder
    private var newPlanButton: some View {
        Button(action: {
            showNewPlanConfirmation = true
        }, label: {
            HStack {
                Image(systemName: "arrow.counterclockwise")
                Text("Start New Plan")
            }
            .frame(maxWidth: .infinity)
        })
        .buttonStyle(SecondaryButtonStyle())
        .padding(.top, Theme.Spacing.space2)
        .alert("Start New Plan?", isPresented: $showNewPlanConfirmation) {
            Button("Cancel", role: .cancel) {}
            Button("Start Fresh", role: .destructive) {
                viewModel.startNewPlan()
            }
        } message: {
            Text("Are you sure? This will start a fresh meal plan.")
        }
    }
}

#Preview("Meal Plan - Empty") {
    MealPlanView(apiClient: MockAPIClient.empty)
        .environmentObject(AppState())
        .preferredColorScheme(.dark)
        .background(AuroraBackground().ignoresSafeArea())
}

#Preview("Meal Plan - With Session") {
    MealPlanView(apiClient: MockAPIClient())
        .environmentObject(AppState())
        .preferredColorScheme(.dark)
        .background(AuroraBackground().ignoresSafeArea())
}
