import SwiftUI
import BradOSCore

/// Card displaying a plan day
struct PlanDayCard: View {
    let day: PlanDay

    @State private var isExpanded: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header
            Button(action: { withAnimation { isExpanded.toggle() } }, label: {
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

                    Image(
                        systemName: isExpanded
                            ? "chevron.up" : "chevron.down"
                    )
                    .font(.caption)
                    .foregroundColor(Theme.textSecondary)
                }
                .padding(Theme.Spacing.space4)
            })
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

                            Text(
                                "\(exercise.sets)\u{00D7}\(exercise.reps)"
                                + " @ \(Int(exercise.weight)) lbs"
                            )
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
                    Stepper(
                        "\(durationWeeks) weeks",
                        value: $durationWeeks, in: 4...12
                    )
                }

                Section {
                    Text(
                        "After creating the plan, you'll be able to "
                        + "add workout days and exercises."
                    )
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
            .background(AuroraBackground().ignoresSafeArea())
            .navigationTitle("New Plan")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.hidden, for: .navigationBar)
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
            let newPlan = try await apiClient.createPlan(
                name: planName, durationWeeks: durationWeeks
            )
            onPlanCreated?(newPlan)
            dismiss()
        } catch {
            self.error = "Failed to create plan: \(error.localizedDescription)"
            isCreating = false
        }
    }
}
