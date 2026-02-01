import SwiftUI
import BradOSCore

/// View displaying active mesocycle and history
struct MesoView: View {
    @Binding var navigationPath: NavigationPath
    @Environment(\.apiClient) private var apiClient

    // Data state
    @State private var activeMesocycle: Mesocycle?
    @State private var completedMesocycles: [Mesocycle] = []
    @State private var isLoading = true
    @State private var error: Error?
    @State private var showingNewMesocycleSheet: Bool = false

    var body: some View {
        ScrollView {
            VStack(spacing: Theme.Spacing.space6) {
                // Active Mesocycle Section
                activeMesocycleSection

                // Completed Mesocycles Section
                if !completedMesocycles.isEmpty {
                    completedMesocyclesSection
                }
            }
            .padding(Theme.Spacing.space4)
        }
        .navigationTitle("Mesocycle")
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                if activeMesocycle == nil {
                    Button(action: { showingNewMesocycleSheet = true }) {
                        Image(systemName: "plus")
                    }
                }
            }
        }
        .sheet(isPresented: $showingNewMesocycleSheet) {
            NewMesocycleSheet()
                .presentationDetents([.medium])
                .presentationDragIndicator(.visible)
        }
        .task {
            await loadMesocycleData()
        }
        .refreshable {
            await loadMesocycleData()
        }
    }

    // MARK: - Data Loading

    private func loadMesocycleData() async {
        isLoading = true
        error = nil

        do {
            // Fetch active mesocycle and all mesocycles in parallel
            async let activeTask = apiClient.getActiveMesocycle()
            async let allTask = apiClient.getMesocycles()

            let (active, all) = try await (activeTask, allTask)
            activeMesocycle = active
            completedMesocycles = all.filter { $0.status == .completed || $0.status == .cancelled }
        } catch {
            self.error = error
            #if DEBUG
            print("[MesoView] Failed to load mesocycle data: \(error)")
            #endif
        }

        isLoading = false
    }

    // MARK: - Active Mesocycle Section

    @ViewBuilder
    private var activeMesocycleSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            SectionHeader(title: "Active Mesocycle")

            if isLoading {
                loadingCard
            } else if let error = error {
                errorCard(error)
            } else if let meso = activeMesocycle {
                ActiveMesocycleCard(mesocycle: meso, navigationPath: $navigationPath, onRefresh: {
                    Task { await loadMesocycleData() }
                })
            } else {
                noActiveMesocycleCard
            }
        }
    }

    private var loadingCard: some View {
        HStack(spacing: Theme.Spacing.space3) {
            ProgressView()

            Text("Loading mesocycle...")
                .font(.subheadline)
                .foregroundColor(Theme.textSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, Theme.Spacing.space4)
    }

    private func errorCard(_ error: Error) -> some View {
        VStack(spacing: Theme.Spacing.space4) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: Theme.Typography.iconSM))
                .foregroundColor(Theme.destructive)

            Text("Failed to load")
                .font(.headline)
                .foregroundColor(Theme.textPrimary)

            Text(error.localizedDescription)
                .font(.caption)
                .foregroundColor(Theme.textSecondary)
                .multilineTextAlignment(.center)

            Button("Retry") {
                Task { await loadMesocycleData() }
            }
            .buttonStyle(SecondaryButtonStyle())
        }
        .frame(maxWidth: .infinity)
        .padding(Theme.Spacing.space6)
        .glassCard()
    }

    private var noActiveMesocycleCard: some View {
        VStack(spacing: Theme.Spacing.space4) {
            Image(systemName: "calendar.badge.plus")
                .font(.system(size: Theme.Typography.iconMD))
                .foregroundColor(Theme.textSecondary)

            Text("No Active Mesocycle")
                .font(.headline)
                .foregroundColor(Theme.textPrimary)

            Text("Start a new mesocycle to begin tracking your progressive overload.")
                .font(.subheadline)
                .foregroundColor(Theme.textSecondary)
                .multilineTextAlignment(.center)

            Button(action: { showingNewMesocycleSheet = true }) {
                Text("Start Mesocycle")
                    .fontWeight(.medium)
            }
            .buttonStyle(PrimaryButtonStyle())
            .padding(.top, Theme.Spacing.space2)
        }
        .frame(maxWidth: .infinity)
        .padding(Theme.Spacing.space6)
        .glassCard()
    }

    // MARK: - Completed Mesocycles Section

    @ViewBuilder
    private var completedMesocyclesSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            SectionHeader(title: "Completed")

            ForEach(completedMesocycles) { meso in
                CompletedMesocycleCard(mesocycle: meso)
            }
        }
    }
}

/// Container displaying active mesocycle with header and week cards
struct ActiveMesocycleCard: View {
    let mesocycle: Mesocycle
    @Binding var navigationPath: NavigationPath
    let onRefresh: () -> Void
    @Environment(\.apiClient) private var apiClient

    @State private var showingCancelAlert: Bool = false
    @State private var isCancelling = false

    /// The active week is the first week that has an incomplete workout
    private var activeWeekNumber: Int? {
        guard let weeks = mesocycle.weeks else { return nil }
        for week in weeks {
            if week.workouts.contains(where: { $0.status != .completed && $0.status != .skipped }) {
                return week.weekNumber
            }
        }
        return nil
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            // Header Card
            headerCard

            // Week Cards
            if let weeks = mesocycle.weeks {
                ForEach(weeks, id: \.weekNumber) { week in
                    WeekCard(
                        week: week,
                        isActiveWeek: week.weekNumber == activeWeekNumber,
                        navigationPath: $navigationPath
                    )
                }
            }

            // Cancel Button
            Button(action: { showingCancelAlert = true }) {
                Text("Cancel Mesocycle")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(SecondaryButtonStyle())
        }
        .alert("Cancel Mesocycle?", isPresented: $showingCancelAlert) {
            Button("Keep Going", role: .cancel) {}
            Button("Cancel Mesocycle", role: .destructive) {
                Task { await cancelMesocycle() }
            }
        } message: {
            Text("This will end your current mesocycle. Your progress will be saved but the mesocycle will be marked as cancelled.")
        }
        .disabled(isCancelling)
    }

    @ViewBuilder
    private var headerCard: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            // Header
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(mesocycle.planName ?? "Mesocycle")
                        .font(.headline)
                        .foregroundColor(Theme.textPrimary)

                    Text("Started \(formattedStartDate)")
                        .font(.caption)
                        .foregroundColor(Theme.textSecondary)
                }

                Spacer()

                if let activeWeek = activeWeekNumber {
                    GenericBadge(
                        text: activeWeek == 7 ? "Deload" : "Week \(activeWeek)",
                        color: activeWeek == 7 ? Theme.warning : Theme.interactivePrimary
                    )
                }
            }

            // Progress
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text("Progress")
                        .font(.caption)
                        .foregroundColor(Theme.textSecondary)
                    Spacer()
                    Text("\(mesocycle.completedWorkouts ?? 0)/\(mesocycle.totalWorkouts ?? 0) workouts")
                        .font(.caption)
                        .foregroundColor(Theme.textSecondary)
                        .monospacedDigit()
                }

                GeometryReader { geometry in
                    ZStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 2, style: .continuous)
                            .fill(Color.white.opacity(0.06))
                            .frame(height: Theme.Dimensions.progressBarHeight)
                        RoundedRectangle(cornerRadius: 2, style: .continuous)
                            .fill(Theme.lifting)
                            .frame(width: geometry.size.width * (mesocycle.progressPercentage ?? 0), height: Theme.Dimensions.progressBarHeight)
                    }
                }
                .frame(height: Theme.Dimensions.progressBarHeight)
            }
        }
        .glassCard(.elevated)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.CornerRadius.lg, style: .continuous)
                .stroke(Theme.lifting.opacity(0.5), lineWidth: 2)
        )
    }

    private var formattedStartDate: String {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        return formatter.string(from: mesocycle.startDate)
    }

    private func cancelMesocycle() async {
        isCancelling = true
        do {
            _ = try await apiClient.cancelMesocycle(id: mesocycle.id)
            onRefresh()
        } catch {
            #if DEBUG
            print("[ActiveMesocycleCard] Failed to cancel mesocycle: \(error)")
            #endif
        }
        isCancelling = false
    }

}

/// Card displaying a single week's workouts
struct WeekCard: View {
    let week: WeekSummary
    let isActiveWeek: Bool
    @Binding var navigationPath: NavigationPath

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space2) {
            // Week Header
            HStack {
                Text(week.isDeload ? "Deload Week" : "Week \(week.weekNumber)")
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .foregroundColor(isActiveWeek ? Theme.interactivePrimary : Theme.textPrimary)
                    .monospacedDigit()

                if week.isComplete {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.caption)
                        .foregroundColor(Theme.success)
                }

                Spacer()

                if isActiveWeek {
                    Text("Active")
                        .font(.caption2)
                        .fontWeight(.semibold)
                        .foregroundColor(Theme.textOnAccent)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Theme.interactivePrimary)
                        .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))
                }
            }

            // Workouts
            ForEach(week.workouts) { workout in
                workoutRow(workout)
            }
        }
        .glassCard()
        .overlay(
            RoundedRectangle(cornerRadius: Theme.CornerRadius.lg, style: .continuous)
                .stroke(isActiveWeek ? Theme.interactivePrimary : Theme.strokeSubtle, lineWidth: isActiveWeek ? 2 : 1)
        )
    }

    @ViewBuilder
    private func workoutRow(_ workout: WorkoutSummary) -> some View {
        let isPending = workout.status == .pending
        let isInProgress = workout.status == .inProgress

        HStack {
            Circle()
                .fill(statusColor(for: workout.status))
                .frame(width: 8, height: 8)

            Text(workout.dayName)
                .font(.subheadline)
                .foregroundColor(Theme.textPrimary)

            Spacer()

            Text(statusText(for: workout.status))
                .font(.caption)
                .fontWeight(.medium)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(statusColor(for: workout.status).opacity(0.2))
                .foregroundColor(statusColor(for: workout.status))
                .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))

            if isPending || isInProgress {
                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundColor(Theme.textSecondary)
            }
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
        .onTapGesture {
            if isPending || isInProgress {
                navigationPath.append(WorkoutDestination(workoutId: workout.id))
            }
        }
    }

    private func statusColor(for status: WorkoutStatus) -> Color {
        switch status {
        case .completed: return Theme.success
        case .skipped: return Theme.neutral
        case .inProgress: return Theme.warning
        case .pending: return Theme.BG.surface.opacity(0.35)
        }
    }

    private func statusText(for status: WorkoutStatus) -> String {
        switch status {
        case .completed: return "Completed"
        case .skipped: return "Skipped"
        case .inProgress: return "In Progress"
        case .pending: return "Scheduled"
        }
    }
}

/// Card displaying a completed mesocycle
struct CompletedMesocycleCard: View {
    let mesocycle: Mesocycle

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(mesocycle.planName ?? "Mesocycle")
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .foregroundColor(Theme.textPrimary)

                Text(dateRange)
                    .font(.caption)
                    .foregroundColor(Theme.textSecondary)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 4) {
                GenericBadge(
                    text: mesocycle.status == .completed ? "Completed" : "Cancelled",
                    color: mesocycle.status == .completed ? Theme.success : Theme.neutral
                )

                Text("\(mesocycle.completedWorkouts ?? 0)/\(mesocycle.totalWorkouts ?? 0) workouts")
                    .font(.caption)
                    .foregroundColor(Theme.textSecondary)
                    .monospacedDigit()
            }
        }
        .glassCard()
    }

    private var dateRange: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "MMM d"
        let start = formatter.string(from: mesocycle.startDate)

        if let endDate = Calendar.current.date(byAdding: .weekOfYear, value: 7, to: mesocycle.startDate) {
            let end = formatter.string(from: endDate)
            return "\(start) - \(end)"
        }
        return start
    }
}

/// Sheet for creating a new mesocycle
struct NewMesocycleSheet: View {
    @Environment(\.dismiss) private var dismiss

    @State private var selectedPlan: Plan? = Plan.mockPlans.first
    @State private var startDate: Date = Date()

    var body: some View {
        NavigationStack {
            Form {
                Section("Plan") {
                    Picker("Select Plan", selection: $selectedPlan) {
                        ForEach(Plan.mockPlans) { plan in
                            Text(plan.name).tag(plan as Plan?)
                        }
                    }
                    .pickerStyle(.menu)
                }

                Section("Start Date") {
                    DatePicker("Start Date", selection: $startDate, displayedComponents: .date)
                        .datePickerStyle(.graphical)
                }
            }
            .scrollContentBackground(.hidden)
            .background(AuroraBackground())
            .navigationTitle("New Mesocycle")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Start") {
                        // Start mesocycle action
                        dismiss()
                    }
                    .fontWeight(.semibold)
                    .disabled(selectedPlan == nil)
                }
            }
        }
    }
}

#Preview {
    NavigationStack {
        MesoView(navigationPath: .constant(NavigationPath()))
    }
    .environmentObject(AppState())
    .preferredColorScheme(.dark)
    .background(AuroraBackground())
}
