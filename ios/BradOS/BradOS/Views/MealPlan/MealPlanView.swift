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
            VStack(spacing: 0) {
                daymarkHeader

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
            }
            .toolbar(.hidden, for: .navigationBar)
            .task {
                await viewModel.loadExistingSession()
                #if DEBUG
                if ProcessInfo.processInfo.environment["BRAD_OS_FORCE_MEAL_PLAN_REFRESH"] == "1" {
                    await viewModel.forceRefresh()
                }
                #endif
            }
        }
    }

    // MARK: - Empty State (No Session)

    private var daymarkHeader: some View {
        HStack(spacing: Theme.Spacing.space3) {
            if appState.isShowingMealPlan {
                Button {
                    appState.isShowingMealPlan = false
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 17, weight: .semibold))
                        .frame(width: 44, height: 44)
                }
                .foregroundColor(Theme.interactivePrimary)
                .accessibilityLabel("Back")
            }

            Text("Meal Plan")
                .font(.system(size: 34, weight: .bold))
                .foregroundColor(Theme.textPrimary)

            Spacer()

            Button {
                Task { await viewModel.forceRefresh() }
            } label: {
                Group {
                    if viewModel.isRefreshing {
                        ProgressView()
                            .tint(Theme.interactivePrimary)
                    } else {
                        Image(systemName: "arrow.clockwise")
                            .font(.system(size: 17, weight: .semibold))
                    }
                }
                .frame(width: 44, height: 44)
            }
            .foregroundColor(Theme.interactivePrimary)
            .disabled(viewModel.isLoading || viewModel.isRefreshing)
            .accessibilityLabel("Refresh meal plan")
        }
        .padding(.horizontal, Theme.Spacing.space5)
        .padding(.vertical, Theme.Spacing.space4)
        .background(Theme.Background.base)
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(Theme.divider)
                .frame(height: 1)
        }
    }

    @ViewBuilder
    private var emptyState: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            Spacer()

            HStack(spacing: Theme.Spacing.space3) {
                Rectangle()
                    .fill(Theme.interactivePrimary)
                    .frame(width: 28, height: 3)

                Text("FOOD FOR THE WEEK")
                    .font(.caption.weight(.semibold))
                    .tracking(1.2)
                    .foregroundColor(Theme.textSecondary)
            }

            Text("Plan your meals")
                .font(.system(size: 28, weight: .bold))
                .foregroundColor(Theme.textPrimary)

            Text(
                "Generate a 7-day meal plan based on your saved meals. "
                + "You can refine it with feedback before finalizing."
            )
                .font(.body)
                .foregroundColor(Theme.textSecondary)

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
            .padding(.top, Theme.Spacing.space2)

            if let error = viewModel.error {
                Text(error)
                    .font(.caption)
                    .foregroundColor(Theme.destructive)
            }

            Spacer()
        }
        .padding(Theme.Spacing.space5)
    }

    // MARK: - Loading State

    @ViewBuilder
    private var loadingState: some View {
        VStack(spacing: Theme.Spacing.space4) {
            ProgressView()
                .tint(Theme.mealPlan)
                .scaleEffect(1.5)

            Text("Loading meal plan...")
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
                .foregroundColor(Theme.interactivePrimary)
            Text("Finalized")
                .font(.caption)
                .fontWeight(.medium)
                .foregroundColor(Theme.textPrimary)
        }
        .padding(.horizontal, Theme.Spacing.space2)
        .padding(.vertical, Theme.Spacing.space1)
        .background(Theme.interactivePrimary.opacity(0.10))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.CornerRadius.lg, style: .continuous)
                .stroke(Theme.interactivePrimary.opacity(0.25), lineWidth: 1)
        )
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
