import SwiftUI
import BradOSCore

/// View displaying workout plans library
struct PlansView: View {
    @Binding var navigationPath: NavigationPath
    @Environment(\.apiClient) private var apiClient

    @State private var plans: [Plan] = []
    @State private var isLoading: Bool = true
    @State private var error: String?
    @State private var showingNewPlanSheet: Bool = false

    var body: some View {
        ScrollView {
            VStack(spacing: Theme.Spacing.space4) {
                if isLoading {
                    LoadingView()
                        .frame(maxWidth: .infinity, minHeight: 200)
                } else if let error = error {
                    ErrorStateView(
                        message: error,
                        retryAction: { Task { await loadPlans() } }
                    )
                    .frame(maxWidth: .infinity, minHeight: 200)
                } else if plans.isEmpty {
                    EmptyStateView(
                        iconName: "list.bullet.clipboard",
                        title: "No Plans Yet",
                        message: "Create your first workout plan to get started.",
                        buttonTitle: "Create Plan"
                    ) {
                        showingNewPlanSheet = true
                    }
                    .frame(maxHeight: .infinity)
                } else {
                    ForEach(plans) { plan in
                        PlanCard(plan: plan) {
                            navigationPath.append(PlanDestination(planId: plan.id))
                        }
                    }
                }
            }
            .padding(Theme.Spacing.space4)
        }
        .navigationTitle("Plans")
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button(action: { showingNewPlanSheet = true }) {
                    Image(systemName: "plus")
                }
            }
        }
        .sheet(isPresented: $showingNewPlanSheet) {
            CreatePlanSheet(onPlanCreated: { newPlan in
                plans.append(newPlan)
            })
            .presentationDetents([.large])
            .presentationDragIndicator(.visible)
        }
        .task {
            await loadPlans()
        }
    }

    private func loadPlans() async {
        isLoading = true
        error = nil
        do {
            plans = try await apiClient.getPlans()
            isLoading = false
        } catch {
            self.error = "Failed to load plans: \(error.localizedDescription)"
            isLoading = false
        }
    }
}

/// Card displaying a workout plan
struct PlanCard: View {
    let plan: Plan
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
                HStack {
                    Text(plan.name)
                        .font(.headline)
                        .foregroundColor(Theme.textPrimary)

                    Spacer()

                    Image(systemName: "chevron.right")
                        .foregroundColor(Theme.textSecondary)
                }

                HStack(spacing: Theme.Spacing.space6) {
                    Label("\(plan.durationWeeks) weeks", systemImage: "calendar")
                    Label("\(plan.days?.count ?? 0) days/week", systemImage: "repeat")
                }
                .font(.caption)
                .foregroundColor(Theme.textSecondary)
                .monospacedDigit()

                if let days = plan.days, !days.isEmpty {
                    Divider()
                        .background(Theme.divider)

                    VStack(alignment: .leading, spacing: 4) {
                        ForEach(days.prefix(3)) { day in
                            HStack {
                                Text(day.dayOfWeekName)
                                    .font(.caption)
                                    .foregroundColor(Theme.textSecondary)
                                    .frame(width: 80, alignment: .leading)

                                Text(day.name)
                                    .font(.caption)
                                    .foregroundColor(Theme.textPrimary)
                            }
                        }

                        if days.count > 3 {
                            Text("+\(days.count - 3) more days")
                                .font(.caption)
                                .foregroundColor(Theme.interactivePrimary)
                        }
                    }
                }
            }
            .glassCard()
        }
        .buttonStyle(PlainButtonStyle())
    }
}

/// Detail view for a single plan
struct PlanDetailView: View {
    let planId: String
    @Environment(\.apiClient) private var apiClient
    @Environment(\.dismiss) private var dismiss

    @State private var plan: Plan?
    @State private var isLoading: Bool = true
    @State private var error: String?
    @State private var showingEditSheet: Bool = false
    @State private var showingDeleteAlert: Bool = false
    @State private var isDeleting: Bool = false

    var body: some View {
        ScrollView {
            if isLoading {
                LoadingView()
                    .frame(maxWidth: .infinity, minHeight: 300)
            } else if let error = error {
                ErrorStateView(
                    message: error,
                    retryAction: { Task { await loadPlan() } }
                )
                .frame(maxWidth: .infinity, minHeight: 300)
            } else if let plan = plan {
                VStack(spacing: Theme.Spacing.space6) {
                    // Plan Info
                    planInfoSection(plan)

                    // Days
                    if let days = plan.days {
                        daysSection(days)
                    }

                    // Actions
                    actionsSection
                }
                .padding(Theme.Spacing.space4)
            }
        }
        .navigationTitle(plan?.name ?? "Plan")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Menu {
                    Button(action: { showingEditSheet = true }) {
                        Label("Edit Plan", systemImage: "pencil")
                    }
                    Button(role: .destructive, action: { showingDeleteAlert = true }) {
                        Label("Delete Plan", systemImage: "trash")
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
                .disabled(isDeleting)
            }
        }
        .alert("Delete Plan?", isPresented: $showingDeleteAlert) {
            Button("Cancel", role: .cancel) {}
            Button("Delete", role: .destructive) {
                Task { await deletePlan() }
            }
        } message: {
            Text("This will permanently delete this plan. Any mesocycles using this plan will not be affected.")
        }
        .task {
            await loadPlan()
        }
    }

    private func loadPlan() async {
        isLoading = true
        error = nil
        do {
            plan = try await apiClient.getPlan(id: planId)
            isLoading = false
        } catch {
            self.error = "Failed to load plan: \(error.localizedDescription)"
            isLoading = false
        }
    }

    private func deletePlan() async {
        isDeleting = true
        do {
            try await apiClient.deletePlan(id: planId)
            dismiss()
        } catch {
            self.error = "Failed to delete plan: \(error.localizedDescription)"
            isDeleting = false
        }
    }

    @ViewBuilder
    private func planInfoSection(_ plan: Plan) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            SectionHeader(title: "Plan Details")

            HStack(spacing: Theme.Spacing.space6) {
                VStack {
                    Text("\(plan.durationWeeks)")
                        .font(.title)
                        .fontWeight(.bold)
                        .foregroundColor(Theme.interactivePrimary)
                        .monospacedDigit()
                    Text("weeks")
                        .font(.caption)
                        .foregroundColor(Theme.textSecondary)
                }

                Divider()
                    .frame(height: 40)

                VStack {
                    Text("\(plan.days?.count ?? 0)")
                        .font(.title)
                        .fontWeight(.bold)
                        .foregroundColor(Theme.interactivePrimary)
                        .monospacedDigit()
                    Text("days/week")
                        .font(.caption)
                        .foregroundColor(Theme.textSecondary)
                }

                Divider()
                    .frame(height: 40)

                VStack {
                    Text("\(totalExercises)")
                        .font(.title)
                        .fontWeight(.bold)
                        .foregroundColor(Theme.interactivePrimary)
                        .monospacedDigit()
                    Text("exercises")
                        .font(.caption)
                        .foregroundColor(Theme.textSecondary)
                }
            }
            .frame(maxWidth: .infinity)
            .glassCard()
        }
    }

    private var totalExercises: Int {
        plan?.days?.reduce(0) { $0 + ($1.exercises?.count ?? 0) } ?? 0
    }

    @ViewBuilder
    private func daysSection(_ days: [PlanDay]) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            SectionHeader(title: "Workout Days")

            ForEach(days) { day in
                PlanDayCard(day: day)
            }
        }
    }

    @ViewBuilder
    private var actionsSection: some View {
        VStack(spacing: Theme.Spacing.space4) {
            Button(action: { /* Start mesocycle with this plan */ }) {
                HStack {
                    Image(systemName: "play.fill")
                    Text("Start Mesocycle")
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(PrimaryButtonStyle())
        }
    }
}

/// Card displaying a plan day
struct PlanDayCard: View {
    let day: PlanDay

    @State private var isExpanded: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header
            Button(action: { withAnimation { isExpanded.toggle() } }) {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(day.name)
                            .font(.subheadline)
                            .fontWeight(.medium)
                            .foregroundColor(Theme.textPrimary)

                        Text(day.dayOfWeekName)
                            .font(.caption)
                            .foregroundColor(Theme.textSecondary)
                    }

                    Spacer()

                    Text("\(day.exercises?.count ?? 0) exercises")
                        .font(.caption)
                        .foregroundColor(Theme.textSecondary)
                        .monospacedDigit()

                    Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                        .font(.caption)
                        .foregroundColor(Theme.textSecondary)
                }
                .padding(Theme.Spacing.space4)
            }
            .buttonStyle(PlainButtonStyle())

            // Expanded content
            if isExpanded, let exercises = day.exercises {
                Divider()
                    .background(Theme.divider)

                VStack(spacing: 0) {
                    ForEach(exercises) { exercise in
                        HStack {
                            Text(exercise.exerciseName ?? "Exercise")
                                .font(.subheadline)
                                .foregroundColor(Theme.textPrimary)

                            Spacer()

                            Text("\(exercise.sets)\u{00D7}\(exercise.reps) @ \(Int(exercise.weight)) lbs")
                                .font(.caption)
                                .foregroundColor(Theme.textSecondary)
                                .monospacedDigit()
                        }
                        .padding(.horizontal, Theme.Spacing.space4)
                        .padding(.vertical, Theme.Spacing.space2)
                    }
                }
            }
        }
        .glassCard(padding: 0)
    }
}

/// Sheet for creating a new plan
struct CreatePlanSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.apiClient) private var apiClient

    var onPlanCreated: ((Plan) -> Void)?

    @State private var planName: String = ""
    @State private var durationWeeks: Int = 6
    @State private var isCreating: Bool = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Plan Name") {
                    TextField("e.g., Push Pull Legs", text: $planName)
                }

                Section("Duration") {
                    Stepper("\(durationWeeks) weeks", value: $durationWeeks, in: 4...12)
                }

                Section {
                    Text("After creating the plan, you'll be able to add workout days and exercises.")
                        .font(.caption)
                        .foregroundColor(Theme.textSecondary)
                }

                if let error = error {
                    Section {
                        Text(error)
                            .font(.caption)
                            .foregroundColor(Theme.destructive)
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(AuroraBackground())
            .navigationTitle("New Plan")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        dismiss()
                    }
                    .disabled(isCreating)
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    if isCreating {
                        ProgressView()
                    } else {
                        Button("Create") {
                            Task { await createPlan() }
                        }
                        .fontWeight(.semibold)
                        .disabled(planName.isEmpty)
                    }
                }
            }
        }
    }

    private func createPlan() async {
        isCreating = true
        error = nil
        do {
            let newPlan = try await apiClient.createPlan(name: planName, durationWeeks: durationWeeks)
            onPlanCreated?(newPlan)
            dismiss()
        } catch {
            self.error = "Failed to create plan: \(error.localizedDescription)"
            isCreating = false
        }
    }
}

#Preview {
    NavigationStack {
        PlansView(navigationPath: .constant(NavigationPath()))
    }
    .environment(\.apiClient, MockAPIClient())
    .preferredColorScheme(.dark)
    .background(AuroraBackground())
}
