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
        .background(AuroraBackground())
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
                Button(action: {
                    Task { await viewModel.createExercise() }
                }) {
                    HStack(spacing: 4) {
                        if viewModel.isCreating {
                            ProgressView()
                                .progressViewStyle(CircularProgressViewStyle(tint: Theme.textOnAccent))
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
                    Button(action: { showingDeleteAlert = true }) {
                        Image(systemName: "trash")
                            .foregroundColor(Theme.destructive.opacity(0.7))
                            .padding(Theme.Spacing.space2)
                    }
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

/// View displaying exercise history with Swift Charts and API data
struct ExerciseHistoryView: View {
    let exerciseId: String
    let exerciseName: String

    @StateObject private var viewModel: ExerciseHistoryViewModel
    @State private var showingEditSheet = false

    init(exerciseId: String, exerciseName: String) {
        self.exerciseId = exerciseId
        self.exerciseName = exerciseName
        _viewModel = StateObject(wrappedValue: ExerciseHistoryViewModel(exerciseId: exerciseId))
    }

    var body: some View {
        Group {
            switch viewModel.historyState {
            case .idle, .loading:
                LoadingView(message: "Loading history...")

            case .error(let error):
                errorView(error)

            case .loaded(let history):
                contentView(history)
            }
        }
        .background(AuroraBackground())
        .navigationTitle(viewModel.history?.exercise.name ?? exerciseName)
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.hidden, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button(action: {
                    Task { await viewModel.loadExerciseForEdit() }
                    showingEditSheet = true
                }) {
                    Image(systemName: "pencil")
                        .foregroundColor(Theme.interactivePrimary)
                }
            }
        }
        .sheet(isPresented: $showingEditSheet) {
            EditExerciseSheet(viewModel: viewModel, isPresented: $showingEditSheet)
        }
        .task {
            await viewModel.loadHistory()
        }
    }

    // MARK: - Content View

    @ViewBuilder
    private func contentView(_ history: ExerciseHistory) -> some View {
        ScrollView {
            VStack(spacing: Theme.Spacing.space6) {
                // Personal Record Badge
                if let pr = history.personalRecord {
                    prSection(pr)
                }

                if viewModel.hasHistory {
                    // Weight Progression Chart
                    chartSection

                    // Set History Table
                    historyTableSection
                } else {
                    noHistoryView
                }
            }
            .padding(Theme.Spacing.space4)
        }
    }

    // MARK: - PR Section

    @ViewBuilder
    private func prSection(_ pr: PersonalRecord) -> some View {
        HStack(spacing: Theme.Spacing.space2) {
            GenericBadge(text: "PR", color: Theme.warning)

            Text("\(Int(pr.weight)) lbs x \(pr.reps) reps")
                .font(.headline)
                .foregroundColor(Theme.textPrimary)
                .monospacedDigit()

            Spacer()

            Text(pr.date.formatted(date: .abbreviated, time: .omitted))
                .font(.caption)
                .foregroundColor(Theme.textSecondary)
        }
        .glassCard()
    }

    // MARK: - Chart Section

    @ViewBuilder
    private var chartSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            SectionHeader(title: "Weight Progression")

            if viewModel.chartData.count >= 2 {
                Chart(viewModel.chartData, id: \.date) { point in
                    LineMark(
                        x: .value("Date", point.date),
                        y: .value("Weight", point.weight)
                    )
                    .foregroundStyle(Theme.interactivePrimary)
                    .interpolationMethod(.catmullRom)

                    PointMark(
                        x: .value("Date", point.date),
                        y: .value("Weight", point.weight)
                    )
                    .foregroundStyle(Theme.interactivePrimary)
                    .annotation(position: .top) {
                        Text("\(Int(point.weight))")
                            .font(.caption2)
                            .foregroundColor(Theme.textSecondary)
                            .monospacedDigit()
                    }
                }
                .chartYAxisLabel("lbs")
                .chartXAxis {
                    AxisMarks(values: .automatic) { _ in
                        AxisValueLabel(format: .dateTime.month(.abbreviated).day())
                    }
                }
                .frame(height: 200)
                .glassCard()
            } else if viewModel.chartData.count == 1 {
                // Show single data point without chart
                let point = viewModel.chartData[0]
                HStack {
                    VStack(alignment: .leading) {
                        Text("\(Int(point.weight)) lbs")
                            .font(.title2)
                            .fontWeight(.bold)
                            .foregroundColor(Theme.interactivePrimary)
                            .monospacedDigit()
                        Text(point.date.formatted(date: .abbreviated, time: .omitted))
                            .font(.caption)
                            .foregroundColor(Theme.textSecondary)
                    }
                    Spacer()
                    Text("1 session")
                        .font(.caption)
                        .foregroundColor(Theme.textSecondary)
                }
                .glassCard()
            }
        }
    }

    // MARK: - History Table Section

    @ViewBuilder
    private var historyTableSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            SectionHeader(title: "Set History")

            // Header row
            HStack {
                Text("Date")
                    .frame(maxWidth: .infinity, alignment: .leading)
                Text("Weight")
                    .frame(width: 70, alignment: .trailing)
                Text("Reps")
                    .frame(width: 50, alignment: .trailing)
                Text("Sets")
                    .frame(width: 40, alignment: .trailing)
            }
            .font(.caption)
            .fontWeight(.medium)
            .foregroundColor(Theme.textSecondary)
            .padding(.horizontal, Theme.Spacing.space4)

            // Data rows (reverse chronological)
            ForEach(viewModel.sortedEntries) { entry in
                HStack {
                    Text(entry.date.formatted(date: .numeric, time: .omitted))
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Text("\(Int(entry.bestWeight)) lbs")
                        .frame(width: 70, alignment: .trailing)
                        .monospacedDigit()
                    Text("\(entry.bestSetReps)")
                        .frame(width: 50, alignment: .trailing)
                        .monospacedDigit()
                    Text("\(entry.sets.count)")
                        .frame(width: 40, alignment: .trailing)
                        .monospacedDigit()
                }
                .font(.subheadline)
                .foregroundColor(Theme.textPrimary)
                .glassCard()
            }
        }
    }

    // MARK: - No History View

    @ViewBuilder
    private var noHistoryView: some View {
        EmptyStateView(
            iconName: "clock",
            title: "No History Yet",
            message: "Complete workouts with this exercise to see your progress here."
        )
        .padding(.top, Theme.Spacing.space7)
    }

    // MARK: - Error View

    @ViewBuilder
    private func errorView(_ error: Error) -> some View {
        EmptyStateView(
            iconName: "exclamationmark.triangle",
            title: "Exercise Not Found",
            message: error.localizedDescription,
            buttonTitle: "Try Again"
        ) {
            Task { await viewModel.loadHistory() }
        }
        .padding(Theme.Spacing.space4)
    }
}

/// Sheet for editing an exercise's name and weight increment
struct EditExerciseSheet: View {
    @ObservedObject var viewModel: ExerciseHistoryViewModel
    @Binding var isPresented: Bool

    var body: some View {
        NavigationStack {
            Form {
                Section("Exercise Name") {
                    TextField("Name", text: $viewModel.editName)
                        .foregroundColor(Theme.textPrimary)
                }

                Section("Weight Increment") {
                    HStack {
                        TextField("5", text: $viewModel.editWeightIncrement)
                            .keyboardType(.decimalPad)
                            .foregroundColor(Theme.textPrimary)
                        Text("lbs per progression")
                            .foregroundColor(Theme.textSecondary)
                    }
                }

                if let error = viewModel.editValidationError {
                    Section {
                        Text(error)
                            .foregroundColor(Theme.destructive)
                    }
                }

                if let error = viewModel.updateError {
                    Section {
                        Text(error)
                            .foregroundColor(Theme.destructive)
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(AuroraBackground())
            .navigationTitle("Edit Exercise")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.hidden, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        viewModel.clearUpdateError()
                        isPresented = false
                    }
                    .foregroundColor(Theme.interactivePrimary)
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Save") {
                        Task {
                            if await viewModel.updateExercise() {
                                isPresented = false
                            }
                        }
                    }
                    .fontWeight(.semibold)
                    .foregroundColor(Theme.interactivePrimary)
                    .disabled(viewModel.isUpdating || viewModel.editName.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .interactiveDismissDisabled(viewModel.isUpdating)
        }
    }
}

#Preview {
    NavigationStack {
        ExercisesView()
    }
    .preferredColorScheme(.dark)
    .background(AuroraBackground())
}
