import SwiftUI
import Charts
import BradOSCore

/// View displaying exercise library with API integration
struct ExercisesView: View {
    @StateObject private var viewModel = ExercisesViewModel(apiClient: APIClient.shared)
    @State private var searchText = ""

    private var filteredExercises: [Exercise] {
        if searchText.isEmpty {
            return viewModel.exercises
        }
        return viewModel.exercises.filter {
            $0.name.localizedCaseInsensitiveContains(searchText)
        }
    }

    var body: some View {
        Group {
            switch viewModel.exercisesState {
            case .idle, .loading:
                LoadingView(message: "Loading exercises...")

            case .error(let error):
                errorView(error)

            case .loaded:
                contentView
            }
        }
        .background(AuroraBackground().ignoresSafeArea())
        .navigationTitle("Exercises")
        .navigationBarTitleDisplayMode(.large)
        .toolbarBackground(.hidden, for: .navigationBar)
        .searchable(text: $searchText, prompt: "Search exercises")
        .task {
            await viewModel.loadExercises()
        }
    }

    // MARK: - Content View

    @ViewBuilder
    private var contentView: some View {
        ScrollView {
            VStack(spacing: Theme.Spacing.space4) {
                addExerciseSection

                if filteredExercises.isEmpty {
                    emptyStateView
                } else {
                    exerciseListSection
                }
            }
            .padding(Theme.Spacing.space4)
        }
    }

    // MARK: - Add Exercise Section

    @ViewBuilder
    private var addExerciseSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space2) {
            Text("Add Exercise")
                .font(.subheadline)
                .fontWeight(.medium)
                .foregroundColor(Theme.textPrimary)

            // Name field
            TextField("Exercise name", text: $viewModel.newExerciseName)
                .textFieldStyle(.plain)
                .padding(Theme.Spacing.space2)
                .frame(height: Theme.Dimensions.inputHeight)
                .background(Color.white.opacity(0.06))
                .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.md, style: .continuous))

            HStack(spacing: Theme.Spacing.space2) {
                // Weight increment field
                HStack(spacing: 4) {
                    Text("+")
                        .foregroundColor(Theme.textSecondary)
                    TextField("5", text: $viewModel.newWeightIncrement)
                        .keyboardType(.decimalPad)
                        .frame(width: 50)
                        .multilineTextAlignment(.center)
                        .monospacedDigit()
                    Text("lbs/progression")
                        .font(.caption)
                        .foregroundColor(Theme.textSecondary)
                }
                .padding(Theme.Spacing.space2)
                .frame(height: Theme.Dimensions.inputHeight)
                .background(Color.white.opacity(0.06))
                .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.md, style: .continuous))

                Spacer()

                // Add button
                Button(
                    action: {
                        Task { await viewModel.createExercise() }
                    },
                    label: {
                        HStack(spacing: 4) {
                            if viewModel.isCreating {
                                ProgressView()
                                    .progressViewStyle(
                                        CircularProgressViewStyle(tint: Theme.textOnAccent)
                                    )
                                    .scaleEffect(0.8)
                            }
                            Text(viewModel.isCreating ? "Adding..." : "Add Exercise")
                        }
                        .font(.subheadline)
                        .fontWeight(.medium)
                    }
                )
                .buttonStyle(PrimaryButtonStyle())
                .disabled(
                    viewModel.newExerciseName
                        .trimmingCharacters(in: .whitespaces).isEmpty
                    || viewModel.isCreating
                )
            }

            // Validation error
            if let error = viewModel.formValidationError {
                Text(error)
                    .font(.caption)
                    .foregroundColor(Theme.destructive)
            }

            // API error
            if let error = viewModel.createError {
                Text(error)
                    .font(.caption)
                    .foregroundColor(Theme.destructive)
            }
        }
        .glassCard()
    }

    // MARK: - Empty State

    @ViewBuilder
    private var emptyStateView: some View {
        if searchText.isEmpty {
            EmptyStateView(
                iconName: "dumbbell",
                title: "No Exercises",
                message: "No exercises found. Add your first exercise above!"
            )
        } else {
            EmptyStateView(
                iconName: "magnifyingglass",
                title: "No Results",
                message: "No exercises match '\(searchText)'"
            )
        }
    }

    // MARK: - Exercise List

    @ViewBuilder
    private var exerciseListSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            SectionHeader(title: "All Exercises")

            ForEach(filteredExercises) { exercise in
                ExerciseRow(
                    exercise: exercise,
                    isDeleting: viewModel.deletingExerciseId == exercise.id,
                    onDelete: {
                        Task { await viewModel.deleteExercise(exercise) }
                    }
                )
            }
        }
        .alert("Cannot Delete", isPresented: .init(
            get: { viewModel.deleteError != nil },
            set: { if !$0 { viewModel.clearDeleteError() } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(viewModel.deleteError ?? "")
        }
    }

    // MARK: - Error View

    @ViewBuilder
    private func errorView(_ error: Error) -> some View {
        VStack(spacing: Theme.Spacing.space4) {
            EmptyStateView(
                iconName: "exclamationmark.triangle",
                title: "Failed to Load",
                message: error.localizedDescription,
                buttonTitle: "Try Again"
            ) {
                Task { await viewModel.loadExercises() }
            }
        }
        .padding(Theme.Spacing.space4)
    }
}

/// Row displaying an exercise with navigation and delete actions
struct ExerciseRow: View {
    let exercise: Exercise
    let isDeleting: Bool
    let onDelete: () -> Void

    @State private var showingDeleteAlert = false

    var body: some View {
        NavigationLink(value: ExerciseHistoryDestination(
            exerciseId: exercise.id,
            exerciseName: exercise.name
        )) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(exercise.name)
                        .font(.subheadline)
                        .foregroundColor(Theme.textPrimary)

                    HStack(spacing: Theme.Spacing.space2) {
                        Text("+\(exercise.weightIncrement.formatted()) lbs per progression")
                            .font(.caption)
                            .foregroundColor(Theme.textSecondary)
                            .monospacedDigit()

                        if exercise.isCustom {
                            Text("*")
                                .foregroundColor(Theme.textSecondary)
                            Text("Custom")
                                .font(.caption)
                                .foregroundColor(Theme.interactivePrimary)
                        }
                    }
                }

                Spacer()

                if isDeleting {
                    ProgressView()
                        .scaleEffect(0.8)
                        .padding(Theme.Spacing.space2)
                } else {
                    Button(
                        action: { showingDeleteAlert = true },
                        label: {
                            Image(systemName: "trash")
                                .foregroundColor(Theme.destructive.opacity(0.7))
                                .padding(Theme.Spacing.space2)
                        }
                    )
                    .buttonStyle(PlainButtonStyle())
                }

                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundColor(Theme.textSecondary)
            }
            .glassCard()
        }
        .buttonStyle(PlainButtonStyle())
        .alert("Delete Exercise?", isPresented: $showingDeleteAlert) {
            Button("Cancel", role: .cancel) {}
            Button("Delete", role: .destructive, action: onDelete)
        } message: {
            Text("Are you sure you want to delete \(exercise.name)?")
        }
    }
}

#Preview {
    NavigationStack {
        ExercisesView()
    }
    .preferredColorScheme(.dark)
    .background(AuroraBackground().ignoresSafeArea())
}
