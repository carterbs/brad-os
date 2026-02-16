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
        .background(AuroraBackground().ignoresSafeArea())
        .navigationTitle("Mesocycle")
        .navigationBarTitleDisplayMode(.large)
        .toolbarBackground(.hidden, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                if activeMesocycle == nil {
                        Button(
                        action: { showingNewMesocycleSheet = true },
                        label: { Image(systemName: "plus") }
                    )
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

            Button(
                action: { showingNewMesocycleSheet = true },
                label: {
                    Text("Start Mesocycle")
                        .fontWeight(.medium)
                }
            )
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

    /// Whether any workout across all weeks is currently in progress
    private var hasAnyInProgressWorkout: Bool {
        guard let weeks = mesocycle.weeks else { return false }
        return weeks.contains { week in
            week.workouts.contains { $0.status == .inProgress }
        }
    }

    /// The active week is the first week that has an incomplete workout
    private var activeWeekNumber: Int? {
        guard let weeks = mesocycle.weeks else { return nil }
        return weeks.first(where: { week in
            week.workouts.contains(where: {
                $0.status != .completed && $0.status != .skipped
            })
        })?.weekNumber
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
                        hasInProgressWorkout: hasAnyInProgressWorkout,
                        navigationPath: $navigationPath
                    )
                }
            }

            // Cancel Button
            Button(
                action: { showingCancelAlert = true },
                label: {
                    Text("Cancel Mesocycle")
                        .frame(maxWidth: .infinity)
                }
            )
            .buttonStyle(SecondaryButtonStyle())
        }
        .alert("Cancel Mesocycle?", isPresented: $showingCancelAlert) {
            Button("Keep Going", role: .cancel) {}
            Button("Cancel Mesocycle", role: .destructive) {
                Task { await cancelMesocycle() }
            }
        } message: {
            Text(
                "This will end your current mesocycle. "
                + "Your progress will be saved but the mesocycle will be marked as cancelled."
            )
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
                            .frame(
                                width: geometry.size.width * mesocycle.progressPercentage,
                                height: Theme.Dimensions.progressBarHeight
                            )
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

#Preview {
    NavigationStack {
        MesoView(navigationPath: .constant(NavigationPath()))
    }
    .environmentObject(AppState())
    .preferredColorScheme(.dark)
    .background(AuroraBackground().ignoresSafeArea())
}
