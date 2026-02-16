import SwiftUI
import Charts
import BradOSCore

/// View displaying exercise history with Swift Charts and API data
struct ExerciseHistoryView: View {
    let exerciseId: String
    let exerciseName: String

    @StateObject private var viewModel: ExerciseHistoryViewModel
    @State private var showingEditSheet = false

    init(exerciseId: String, exerciseName: String) {
        self.exerciseId = exerciseId
        self.exerciseName = exerciseName
        _viewModel = StateObject(
            wrappedValue: ExerciseHistoryViewModel(exerciseId: exerciseId)
        )
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
        .background(AuroraBackground().ignoresSafeArea())
        .navigationTitle(
            viewModel.history?.exercise.name ?? exerciseName
        )
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.hidden, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button(
                    action: {
                        Task { await viewModel.loadExerciseForEdit() }
                        showingEditSheet = true
                    },
                    label: {
                        Image(systemName: "pencil")
                            .foregroundColor(Theme.interactivePrimary)
                    }
                )
            }
        }
        .sheet(isPresented: $showingEditSheet) {
            EditExerciseSheet(
                viewModel: viewModel, isPresented: $showingEditSheet
            )
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
                if let pr = history.personalRecord {
                    prSection(pr)
                }

                if viewModel.hasHistory {
                    chartSection
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

            Text(
                pr.date.formatted(
                    date: .abbreviated, time: .omitted
                )
            )
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
                chartView
            } else if viewModel.chartData.count == 1 {
                singleDataPointView
            }
        }
    }

    @ViewBuilder
    private var chartView: some View {
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
                AxisValueLabel(
                    format: .dateTime.month(.abbreviated).day()
                )
            }
        }
        .frame(height: 200)
        .glassCard()
    }

    @ViewBuilder
    private var singleDataPointView: some View {
        let point = viewModel.chartData[0]
        HStack {
            VStack(alignment: .leading) {
                Text("\(Int(point.weight)) lbs")
                    .font(.title2)
                    .fontWeight(.bold)
                    .foregroundColor(Theme.interactivePrimary)
                    .monospacedDigit()
                Text(
                    point.date.formatted(
                        date: .abbreviated, time: .omitted
                    )
                )
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

    // MARK: - History Table Section

    @ViewBuilder
    private var historyTableSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            SectionHeader(title: "Set History")

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

            ForEach(viewModel.sortedEntries) { entry in
                HStack {
                    Text(
                        entry.date.formatted(
                            date: .numeric, time: .omitted
                        )
                    )
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
                        TextField(
                            "5", text: $viewModel.editWeightIncrement
                        )
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
            .background(AuroraBackground().ignoresSafeArea())
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
                    .disabled(
                        viewModel.isUpdating
                        || viewModel.editName
                            .trimmingCharacters(in: .whitespaces)
                            .isEmpty
                    )
                }
            }
            .interactiveDismissDisabled(viewModel.isUpdating)
        }
    }
}
