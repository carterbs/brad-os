import SwiftUI

/// View displaying exercise library with API integration
struct ExercisesView: View {
    @StateObject private var viewModel = ExercisesViewModel()
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
        .background(Theme.background)
        .navigationTitle("Exercises")
        .navigationBarTitleDisplayMode(.large)
        .searchable(text: $searchText, prompt: "Search exercises")
        .task {
            await viewModel.loadExercises()
        }
    }

    // MARK: - Content View

    @ViewBuilder
    private var contentView: some View {
        ScrollView {
            VStack(spacing: Theme.Spacing.md) {
                addExerciseSection

                if filteredExercises.isEmpty {
                    emptyStateView
                } else {
                    exerciseListSection
                }
            }
            .padding(Theme.Spacing.md)
        }
    }

    // MARK: - Add Exercise Section

    @ViewBuilder
    private var addExerciseSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            Text("Add Exercise")
                .font(.subheadline)
                .fontWeight(.medium)
                .foregroundColor(Theme.textPrimary)

            // Name field
            TextField("Exercise name", text: $viewModel.newExerciseName)
                .textFieldStyle(.plain)
                .padding(Theme.Spacing.sm)
                .background(Theme.backgroundTertiary)
                .cornerRadius(Theme.CornerRadius.sm)

            HStack(spacing: Theme.Spacing.sm) {
                // Weight increment field
                HStack(spacing: 4) {
                    Text("+")
                        .foregroundColor(Theme.textSecondary)
                    TextField("5", text: $viewModel.newWeightIncrement)
                        .keyboardType(.decimalPad)
                        .frame(width: 50)
                        .multilineTextAlignment(.center)
                    Text("lbs/progression")
                        .font(.caption)
                        .foregroundColor(Theme.textSecondary)
                }
                .padding(Theme.Spacing.sm)
                .background(Theme.backgroundTertiary)
                .cornerRadius(Theme.CornerRadius.sm)

                Spacer()

                // Add button
                Button(action: {
                    Task { await viewModel.createExercise() }
                }) {
                    HStack(spacing: 4) {
                        if viewModel.isCreating {
                            ProgressView()
                                .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                .scaleEffect(0.8)
                        }
                        Text(viewModel.isCreating ? "Adding..." : "Add Exercise")
                    }
                    .font(.subheadline)
                    .fontWeight(.medium)
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(viewModel.newExerciseName.trimmingCharacters(in: .whitespaces).isEmpty || viewModel.isCreating)
            }

            // Validation error
            if let error = viewModel.formValidationError {
                Text(error)
                    .font(.caption)
                    .foregroundColor(Theme.error)
            }

            // API error
            if let error = viewModel.createError {
                Text(error)
                    .font(.caption)
                    .foregroundColor(Theme.error)
            }
        }
        .padding(Theme.Spacing.md)
        .background(Theme.backgroundSecondary)
        .cornerRadius(Theme.CornerRadius.md)
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
        VStack(alignment: .leading, spacing: Theme.Spacing.md) {
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
        VStack(spacing: Theme.Spacing.md) {
            EmptyStateView(
                iconName: "exclamationmark.triangle",
                title: "Failed to Load",
                message: error.localizedDescription,
                buttonTitle: "Try Again"
            ) {
                Task { await viewModel.loadExercises() }
            }
        }
        .padding(Theme.Spacing.md)
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

                    HStack(spacing: Theme.Spacing.sm) {
                        Text("+\(exercise.weightIncrement.formatted()) lbs per progression")
                            .font(.caption)
                            .foregroundColor(Theme.textSecondary)

                        if exercise.isCustom {
                            Text("*")
                                .foregroundColor(Theme.textSecondary)
                            Text("Custom")
                                .font(.caption)
                                .foregroundColor(Theme.accent)
                        }
                    }
                }

                Spacer()

                if isDeleting {
                    ProgressView()
                        .scaleEffect(0.8)
                        .padding(Theme.Spacing.sm)
                } else {
                    Button(action: { showingDeleteAlert = true }) {
                        Image(systemName: "trash")
                            .foregroundColor(Theme.error.opacity(0.7))
                            .padding(Theme.Spacing.sm)
                    }
                    .buttonStyle(PlainButtonStyle())
                }

                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundColor(Theme.textSecondary)
            }
            .padding(Theme.Spacing.md)
            .background(Theme.backgroundSecondary)
            .cornerRadius(Theme.CornerRadius.md)
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

/// View displaying exercise history with charts
struct ExerciseHistoryView: View {
    let exerciseId: Int
    let exerciseName: String

    var body: some View {
        ScrollView {
            VStack(spacing: Theme.Spacing.lg) {
                // Progress Chart Placeholder
                progressChartSection

                // History List Placeholder
                historySection
            }
            .padding(Theme.Spacing.md)
        }
        .background(Theme.background)
        .navigationTitle(exerciseName)
        .navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder
    private var progressChartSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.md) {
            SectionHeader(title: "Progress")

            VStack(spacing: Theme.Spacing.md) {
                // Placeholder chart
                RoundedRectangle(cornerRadius: Theme.CornerRadius.md)
                    .fill(Theme.backgroundTertiary)
                    .frame(height: 200)
                    .overlay(
                        VStack {
                            Image(systemName: "chart.line.uptrend.xyaxis")
                                .font(.system(size: 40))
                                .foregroundColor(Theme.textSecondary)
                            Text("Progress Chart")
                                .font(.caption)
                                .foregroundColor(Theme.textSecondary)
                        }
                    )

                // Stats
                HStack(spacing: Theme.Spacing.lg) {
                    VStack {
                        Text("135")
                            .font(.title2)
                            .fontWeight(.bold)
                            .foregroundColor(Theme.accent)
                        Text("Current (lbs)")
                            .font(.caption)
                            .foregroundColor(Theme.textSecondary)
                    }

                    Divider()
                        .frame(height: 40)

                    VStack {
                        Text("95")
                            .font(.title2)
                            .fontWeight(.bold)
                            .foregroundColor(Theme.textSecondary)
                        Text("Starting (lbs)")
                            .font(.caption)
                            .foregroundColor(Theme.textSecondary)
                    }

                    Divider()
                        .frame(height: 40)

                    VStack {
                        Text("+40")
                            .font(.title2)
                            .fontWeight(.bold)
                            .foregroundColor(Theme.success)
                        Text("Gained (lbs)")
                            .font(.caption)
                            .foregroundColor(Theme.textSecondary)
                    }
                }
                .frame(maxWidth: .infinity)
            }
            .padding(Theme.Spacing.md)
            .cardStyle()
        }
    }

    @ViewBuilder
    private var historySection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.md) {
            SectionHeader(title: "Recent Sessions")

            // Placeholder history items
            ForEach(0..<5, id: \.self) { index in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Week \(5 - index)")
                            .font(.subheadline)
                            .fontWeight(.medium)
                            .foregroundColor(Theme.textPrimary)

                        Text(Calendar.current.date(byAdding: .weekOfYear, value: -index, to: Date())!.formatted(date: .abbreviated, time: .omitted))
                            .font(.caption)
                            .foregroundColor(Theme.textSecondary)
                    }

                    Spacer()

                    Text("3x10 @ \(135 - index * 5) lbs")
                        .font(.subheadline)
                        .foregroundColor(Theme.textSecondary)
                }
                .padding(Theme.Spacing.md)
                .background(Theme.backgroundSecondary)
                .cornerRadius(Theme.CornerRadius.md)
            }
        }
    }
}

#Preview {
    NavigationStack {
        ExercisesView()
    }
    .preferredColorScheme(.dark)
}
