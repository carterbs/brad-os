import SwiftUI

struct TrainingBlockSetupView: View {
    @EnvironmentObject var cyclingVM: CyclingViewModel

    @State private var startDate = Date()
    @State private var selectedGoals: Set<TrainingBlockModel.TrainingGoal> = []
    @State private var isSaving = false
    @State private var showSuccess = false
    @State private var showError = false

    var endDate: Date {
        Calendar.current.date(byAdding: .weekOfYear, value: 8, to: startDate) ?? startDate
    }

    var body: some View {
        ScrollView {
            VStack(spacing: Theme.Spacing.space6) {
                if let block = cyclingVM.currentBlock, block.status == .active {
                    // Active Block Section
                    activeBlockSection(block: block)
                } else {
                    // New Block Section
                    newBlockSection

                    // Goals Section
                    goalsSection

                    // Schedule Section
                    scheduleSection

                    // Start Button Section
                    startButtonSection

                }
            }
            .padding(Theme.Spacing.space5)
        }
        .background(AuroraBackground().ignoresSafeArea())
        .navigationTitle("Training Block")
        .navigationBarTitleDisplayMode(.large)
        .toolbarBackground(.hidden, for: .navigationBar)
        .alert("Block Created", isPresented: $showSuccess) {
            Button("OK", role: .cancel) {}
        } message: {
            Text("Your 8-week training block has been created.")
        }
        .alert("Error", isPresented: $showError) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(cyclingVM.error ?? "Failed to create training block. Please try again.")
        }
    }

    // MARK: - Active Block Section

    @ViewBuilder
    private func activeBlockSection(block: TrainingBlockModel) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            SectionHeader(title: "Active Block")

            VStack(spacing: 0) {
                HStack {
                    Text("Week \(block.currentWeek) of 8")
                        .font(.headline)
                        .foregroundColor(Theme.textPrimary)
                    Spacer()
                    Text("Ends \(block.endDate, style: .date)")
                        .foregroundStyle(Theme.textSecondary)
                }
                .padding(Theme.Spacing.space4)
                .frame(minHeight: Theme.Dimensions.listRowMinHeight)

                Divider()
                    .background(Theme.strokeSubtle)

                Button(role: .destructive) {
                    completeBlockEarly()
                } label: {
                    HStack {
                        Spacer()
                        Text("Complete Block Early")
                            .foregroundColor(Theme.destructive)
                        Spacer()
                    }
                }
                .padding(Theme.Spacing.space4)
                .frame(minHeight: Theme.Dimensions.listRowMinHeight)
            }
            .glassCard(.card, padding: 0)
        }
    }

    // MARK: - New Block Section

    @ViewBuilder
    private var newBlockSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            SectionHeader(title: "New Block")

            VStack(spacing: 0) {
                // Start Date Picker
                DatePicker(
                    "Start Date",
                    selection: $startDate,
                    displayedComponents: .date
                )
                .foregroundColor(Theme.textPrimary)
                .tint(Theme.interactivePrimary)
                .padding(Theme.Spacing.space4)
                .frame(minHeight: Theme.Dimensions.listRowMinHeight)

                Divider()
                    .background(Theme.strokeSubtle)

                // End Date Display
                HStack {
                    Text("End Date")
                        .foregroundColor(Theme.textSecondary)
                    Spacer()
                    Text(endDate, style: .date)
                        .foregroundStyle(Theme.textSecondary)
                }
                .padding(Theme.Spacing.space4)
                .frame(minHeight: Theme.Dimensions.listRowMinHeight)
            }
            .glassCard(.card, padding: 0)
        }
    }

    // MARK: - Goals Section

    @ViewBuilder
    private var goalsSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            SectionHeader(title: "Goals")

            VStack(spacing: 0) {
                ForEach(Array(TrainingBlockModel.TrainingGoal.allCases.enumerated()), id: \.element) { index, goal in
                    if index > 0 {
                        Divider()
                            .background(Theme.strokeSubtle)
                    }

                    Button {
                        if selectedGoals.contains(goal) {
                            selectedGoals.remove(goal)
                        } else {
                            selectedGoals.insert(goal)
                        }
                    } label: {
                        HStack(spacing: Theme.Spacing.space4) {
                            Image(systemName: iconForGoal(goal))
                                .foregroundColor(Theme.cycling)
                                .frame(width: 24)

                            Text(displayNameForGoal(goal))
                                .foregroundColor(Theme.textPrimary)

                            Spacer()

                            if selectedGoals.contains(goal) {
                                Image(systemName: "checkmark")
                                    .foregroundStyle(Theme.interactivePrimary)
                            }
                        }
                        .padding(Theme.Spacing.space4)
                        .frame(minHeight: Theme.Dimensions.listRowMinHeight)
                    }
                    .buttonStyle(.plain)
                }
            }
            .glassCard(.card, padding: 0)
        }
    }

    // MARK: - Schedule Section

    @ViewBuilder
    private var scheduleSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            SectionHeader(title: "Schedule")

            VStack(spacing: 0) {
                ScheduleRow(day: "Tuesday", session: "VO2max Intervals", icon: "flame.fill", color: Theme.destructive)

                Divider()
                    .background(Theme.strokeSubtle)

                ScheduleRow(day: "Thursday", session: "Threshold", icon: "bolt.fill", color: Theme.warning)

                Divider()
                    .background(Theme.strokeSubtle)

                ScheduleRow(day: "Saturday", session: "Fun Ride", icon: "face.smiling.fill", color: Theme.success)
            }
            .glassCard(.card, padding: 0)
        }
    }

    // MARK: - Start Button Section

    @ViewBuilder
    private var startButtonSection: some View {
        Button(action: startBlock) {
            HStack {
                if isSaving {
                    ProgressView()
                        .tint(Theme.textPrimary)
                } else {
                    Text("Start Training Block")
                }
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(GlassPrimaryButtonStyle())
        .disabled(selectedGoals.isEmpty || isSaving)
        .opacity(selectedGoals.isEmpty ? 0.5 : 1.0)
    }

    // MARK: - Helper Functions

    private func iconForGoal(_ goal: TrainingBlockModel.TrainingGoal) -> String {
        switch goal {
        case .regainFitness: return "heart.fill"
        case .maintainMuscle: return "dumbbell.fill"
        case .loseWeight: return "scalemass.fill"
        }
    }

    private func displayNameForGoal(_ goal: TrainingBlockModel.TrainingGoal) -> String {
        switch goal {
        case .regainFitness: return "Regain Fitness"
        case .maintainMuscle: return "Maintain Muscle"
        case .loseWeight: return "Lose Weight"
        }
    }

    // MARK: - Actions

    private func startBlock() {
        isSaving = true
        Task {
            await cyclingVM.startNewBlock(
                goals: Array(selectedGoals),
                startDate: startDate
            )
            isSaving = false

            if cyclingVM.currentBlock != nil {
                showSuccess = true
            } else {
                showError = true
            }
        }
    }

    private func completeBlockEarly() {
        Task {
            await cyclingVM.completeCurrentBlock()
        }
    }
}

// MARK: - Schedule Row

struct ScheduleRow: View {
    let day: String
    let session: String
    let icon: String
    let color: Color

    var body: some View {
        HStack(spacing: Theme.Spacing.space4) {
            Image(systemName: icon)
                .foregroundStyle(color)
                .frame(width: 24)

            Text(day)
                .fontWeight(.medium)
                .foregroundColor(Theme.textPrimary)

            Spacer()

            Text(session)
                .foregroundStyle(Theme.textSecondary)
        }
        .padding(Theme.Spacing.space4)
        .frame(minHeight: Theme.Dimensions.listRowMinHeight)
    }
}

#Preview {
    NavigationStack {
        TrainingBlockSetupView()
            .environmentObject(CyclingViewModel())
    }
    .preferredColorScheme(.dark)
}
