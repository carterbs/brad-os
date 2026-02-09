import SwiftUI

// MARK: - Wizard Step

private enum WizardStep: Int, CaseIterable {
    case experience = 0
    case sessions = 1
    case goals = 2
    case preview = 3
    case startDate = 4

    var title: String {
        switch self {
        case .experience: return "Experience"
        case .sessions: return "Sessions"
        case .goals: return "Goals"
        case .preview: return "Your Plan"
        case .startDate: return "Start Date"
        }
    }
}

// MARK: - Hours Available Option

private enum HoursOption: String, CaseIterable {
    case twoToThree = "2-3h"
    case fourToFive = "4-5h"
    case sixToEight = "6-8h"
    case eightToTen = "8-10h"

    var midpoint: Double {
        switch self {
        case .twoToThree: return 2.5
        case .fourToFive: return 4.5
        case .sixToEight: return 7.0
        case .eightToTen: return 9.0
        }
    }
}

// MARK: - Training Block Setup View

struct TrainingBlockSetupView: View {
    @EnvironmentObject var cyclingVM: CyclingViewModel
    @StateObject private var coachClient = CyclingCoachClient()

    @State private var currentStep: WizardStep = .experience
    @State private var experienceLevel: ExperienceLevel = .intermediate
    @State private var hoursOption: HoursOption = .fourToFive
    @State private var sessionsPerWeek = 3
    @State private var preferredDays: Set<Int> = [2, 4, 6] // Tue, Thu, Sat
    @State private var selectedGoals: Set<TrainingBlockModel.TrainingGoal> = []
    @State private var generatedSchedule: GenerateScheduleResponse?
    @State private var isGenerating = false
    @State private var startDate = Date()
    @State private var isSaving = false
    @State private var showSuccess = false
    @State private var showError = false
    @State private var generateError: String?

    var endDate: Date {
        Calendar.current.date(byAdding: .weekOfYear, value: 8, to: startDate) ?? startDate
    }

    var body: some View {
        ScrollView {
            VStack(spacing: Theme.Spacing.space6) {
                if let block = cyclingVM.currentBlock, block.status == .active {
                    activeBlockSection(block: block)
                } else {
                    // Progress indicator
                    progressIndicator

                    // Step content
                    stepContent
                        .transition(.asymmetric(
                            insertion: .move(edge: .trailing).combined(with: .opacity),
                            removal: .move(edge: .leading).combined(with: .opacity)
                        ))
                        .id(currentStep)

                    // Navigation buttons
                    navigationButtons
                }
            }
            .padding(Theme.Spacing.space5)
        }
        .background(AuroraBackground().ignoresSafeArea())
        .navigationTitle("Training Block")
        .navigationBarTitleDisplayMode(.large)
        .toolbarBackground(.hidden, for: .navigationBar)
        .animation(.easeInOut(duration: 0.3), value: currentStep)
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

    // MARK: - Progress Indicator

    private var progressIndicator: some View {
        HStack(spacing: Theme.Spacing.space2) {
            ForEach(WizardStep.allCases, id: \.rawValue) { step in
                Capsule()
                    .fill(step.rawValue <= currentStep.rawValue
                          ? Theme.interactivePrimary
                          : Color.white.opacity(0.2))
                    .frame(height: 4)
            }
        }
    }

    // MARK: - Step Content

    @ViewBuilder
    private var stepContent: some View {
        switch currentStep {
        case .experience:
            experienceStep
        case .sessions:
            sessionsStep
        case .goals:
            goalsStep
        case .preview:
            previewStep
        case .startDate:
            startDateStep
        }
    }

    // MARK: - Step 1: Experience & Availability

    private var experienceStep: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space6) {
            VStack(alignment: .leading, spacing: Theme.Spacing.space2) {
                Text("Experience Level")
                    .font(.title3)
                    .fontWeight(.semibold)
                    .foregroundColor(Theme.textPrimary)
                Text("This helps the AI coach tailor your plan")
                    .font(.subheadline)
                    .foregroundStyle(Theme.textSecondary)
            }

            VStack(spacing: Theme.Spacing.space3) {
                ForEach(ExperienceLevel.allCases, id: \.self) { level in
                    Button {
                        experienceLevel = level
                    } label: {
                        HStack(spacing: Theme.Spacing.space3) {
                            Image(systemName: level.systemImage)
                                .font(.title3)
                                .foregroundStyle(experienceLevel == level ? Theme.interactivePrimary : Theme.textSecondary)
                                .frame(width: 32)

                            VStack(alignment: .leading, spacing: 2) {
                                Text(level.displayName)
                                    .font(.headline)
                                    .foregroundColor(Theme.textPrimary)
                                Text(level.description)
                                    .font(.caption)
                                    .foregroundStyle(Theme.textSecondary)
                                    .lineLimit(2)
                            }

                            Spacer()

                            if experienceLevel == level {
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundStyle(Theme.interactivePrimary)
                            }
                        }
                        .padding(Theme.Spacing.space4)
                    }
                    .buttonStyle(.plain)
                    .glassCard(.card, padding: 0)
                    .overlay(
                        RoundedRectangle(cornerRadius: Theme.CornerRadius.lg, style: .continuous)
                            .stroke(experienceLevel == level ? Theme.interactivePrimary.opacity(0.5) : Color.clear, lineWidth: 1.5)
                    )
                }
            }

            VStack(alignment: .leading, spacing: Theme.Spacing.space3) {
                Text("Weekly Hours Available")
                    .font(.headline)
                    .foregroundColor(Theme.textPrimary)

                HStack(spacing: Theme.Spacing.space2) {
                    ForEach(HoursOption.allCases, id: \.self) { option in
                        Button {
                            hoursOption = option
                        } label: {
                            Text(option.rawValue)
                                .font(.subheadline)
                                .fontWeight(.medium)
                                .foregroundColor(hoursOption == option ? Theme.textPrimary : Theme.textSecondary)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, Theme.Spacing.space3)
                                .background(hoursOption == option ? Theme.interactivePrimary.opacity(0.2) : Color.white.opacity(0.04))
                                .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))
                                .overlay(
                                    RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous)
                                        .stroke(hoursOption == option ? Theme.interactivePrimary.opacity(0.5) : Theme.strokeSubtle, lineWidth: 1)
                                )
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    // MARK: - Step 2: Sessions & Days

    private var sessionsStep: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space6) {
            VStack(alignment: .leading, spacing: Theme.Spacing.space2) {
                Text("Sessions Per Week")
                    .font(.title3)
                    .fontWeight(.semibold)
                    .foregroundColor(Theme.textPrimary)
            }

            HStack(spacing: Theme.Spacing.space2) {
                ForEach([2, 3, 4, 5], id: \.self) { count in
                    Button {
                        sessionsPerWeek = count
                        updatePreferredDays(for: count)
                    } label: {
                        Text("\(count)")
                            .font(.title3)
                            .fontWeight(.semibold)
                            .foregroundColor(sessionsPerWeek == count ? Theme.textPrimary : Theme.textSecondary)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, Theme.Spacing.space4)
                            .background(sessionsPerWeek == count ? Theme.interactivePrimary.opacity(0.2) : Color.white.opacity(0.04))
                            .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.md, style: .continuous))
                            .overlay(
                                RoundedRectangle(cornerRadius: Theme.CornerRadius.md, style: .continuous)
                                    .stroke(sessionsPerWeek == count ? Theme.interactivePrimary.opacity(0.5) : Theme.strokeSubtle, lineWidth: 1)
                            )
                    }
                    .buttonStyle(.plain)
                }
            }

            VStack(alignment: .leading, spacing: Theme.Spacing.space3) {
                Text("Preferred Days")
                    .font(.headline)
                    .foregroundColor(Theme.textPrimary)

                Text("These are suggestions \u{2014} ride whenever works for you")
                    .font(.caption)
                    .foregroundStyle(Theme.textSecondary)

                HStack(spacing: Theme.Spacing.space2) {
                    ForEach(dayOptions, id: \.number) { day in
                        Button {
                            if preferredDays.contains(day.number) {
                                preferredDays.remove(day.number)
                            } else {
                                preferredDays.insert(day.number)
                            }
                        } label: {
                            Text(day.short)
                                .font(.subheadline)
                                .fontWeight(.medium)
                                .foregroundColor(preferredDays.contains(day.number) ? Theme.textPrimary : Theme.textTertiary)
                                .frame(width: 42, height: 42)
                                .background(preferredDays.contains(day.number) ? Theme.interactivePrimary.opacity(0.25) : Color.white.opacity(0.04))
                                .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))
                                .overlay(
                                    RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous)
                                        .stroke(preferredDays.contains(day.number) ? Theme.interactivePrimary.opacity(0.5) : Theme.strokeSubtle, lineWidth: 1)
                                )
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    // MARK: - Step 3: Goals

    private var goalsStep: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space6) {
            VStack(alignment: .leading, spacing: Theme.Spacing.space2) {
                Text("Training Goals")
                    .font(.title3)
                    .fontWeight(.semibold)
                    .foregroundColor(Theme.textPrimary)
                Text("Select all that apply")
                    .font(.subheadline)
                    .foregroundStyle(Theme.textSecondary)
            }

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
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundStyle(Theme.interactivePrimary)
                            } else {
                                Image(systemName: "circle")
                                    .foregroundStyle(Theme.textTertiary)
                            }
                        }
                        .padding(Theme.Spacing.space4)
                        .frame(minHeight: Theme.Dimensions.listRowMinHeight)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            .glassCard(.card, padding: 0)
        }
    }

    // MARK: - Step 4: AI Schedule Preview

    private var previewStep: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space6) {
            VStack(alignment: .leading, spacing: Theme.Spacing.space2) {
                Text("Your AI-Generated Plan")
                    .font(.title3)
                    .fontWeight(.semibold)
                    .foregroundColor(Theme.textPrimary)
            }

            if isGenerating {
                VStack(spacing: Theme.Spacing.space4) {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: Theme.interactivePrimary))
                        .scaleEffect(1.2)
                    Text("Generating your training plan...")
                        .font(.subheadline)
                        .foregroundStyle(Theme.textSecondary)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, Theme.Spacing.space8)
                .glassCard()
            } else if let schedule = generatedSchedule {
                // Sessions list
                VStack(spacing: Theme.Spacing.space3) {
                    ForEach(Array(schedule.sessions.enumerated()), id: \.element.id) { index, session in
                        HStack(spacing: Theme.Spacing.space3) {
                            Text("\(index + 1)")
                                .font(.caption)
                                .fontWeight(.bold)
                                .foregroundColor(Theme.interactivePrimary)
                                .frame(width: 24, height: 24)
                                .background(Theme.interactivePrimary.opacity(0.15))
                                .clipShape(Circle())

                            Image(systemName: session.systemImage)
                                .font(.subheadline)
                                .foregroundStyle(colorForSessionType(session.sessionType))
                                .frame(width: 20)

                            VStack(alignment: .leading, spacing: 2) {
                                Text(session.displayName)
                                    .font(.subheadline)
                                    .fontWeight(.medium)
                                    .foregroundColor(Theme.textPrimary)

                                Text(session.pelotonClassTypes.joined(separator: ", "))
                                    .font(.caption)
                                    .foregroundStyle(Theme.textSecondary)
                                    .lineLimit(1)
                            }

                            Spacer()

                            Text("\(session.suggestedDurationMinutes) min")
                                .font(.caption)
                                .fontWeight(.medium)
                                .foregroundStyle(Theme.textSecondary)
                        }
                        .padding(Theme.Spacing.space3)
                        .glassCard(.card, padding: 0)
                    }
                }

                // Rationale
                VStack(alignment: .leading, spacing: Theme.Spacing.space2) {
                    HStack(spacing: Theme.Spacing.space2) {
                        Image(systemName: "brain.head.profile")
                            .font(.caption)
                            .foregroundStyle(Theme.interactivePrimary)
                        Text("Coach's Rationale")
                            .font(.subheadline)
                            .fontWeight(.semibold)
                            .foregroundColor(Theme.textPrimary)
                    }
                    Text(schedule.rationale)
                        .font(.caption)
                        .foregroundStyle(Theme.textSecondary)
                }
                .padding(Theme.Spacing.space4)
                .glassCard()

                // Regenerate button
                Button {
                    Task { await generateScheduleAction() }
                } label: {
                    HStack {
                        Image(systemName: "arrow.clockwise")
                        Text("Regenerate")
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(GlassSecondaryButtonStyle())
            } else if let error = generateError {
                VStack(spacing: Theme.Spacing.space3) {
                    Image(systemName: "exclamationmark.triangle")
                        .font(.title2)
                        .foregroundStyle(Theme.warning)
                    Text(error)
                        .font(.subheadline)
                        .foregroundStyle(Theme.textSecondary)
                        .multilineTextAlignment(.center)
                    Button {
                        Task { await generateScheduleAction() }
                    } label: {
                        Text("Try Again")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(GlassSecondaryButtonStyle())
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, Theme.Spacing.space4)
                .glassCard()
            }
        }
        .task {
            if generatedSchedule == nil && !isGenerating {
                await generateScheduleAction()
            }
        }
    }

    // MARK: - Step 5: Start Date

    private var startDateStep: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space6) {
            VStack(alignment: .leading, spacing: Theme.Spacing.space2) {
                Text("When do you want to start?")
                    .font(.title3)
                    .fontWeight(.semibold)
                    .foregroundColor(Theme.textPrimary)
            }

            VStack(spacing: 0) {
                DatePicker(
                    "Start Date",
                    selection: $startDate,
                    in: Date()...,
                    displayedComponents: .date
                )
                .foregroundColor(Theme.textPrimary)
                .tint(Theme.interactivePrimary)
                .padding(Theme.Spacing.space4)
                .frame(minHeight: Theme.Dimensions.listRowMinHeight)

                Divider()
                    .background(Theme.strokeSubtle)

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
            .disabled(isSaving)
        }
    }

    // MARK: - Navigation Buttons

    private var navigationButtons: some View {
        HStack(spacing: Theme.Spacing.space4) {
            if currentStep != .experience {
                Button {
                    withAnimation {
                        if let prev = WizardStep(rawValue: currentStep.rawValue - 1) {
                            currentStep = prev
                        }
                    }
                } label: {
                    HStack {
                        Image(systemName: "chevron.left")
                        Text("Back")
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(GlassSecondaryButtonStyle())
            }

            if currentStep != .startDate {
                Button {
                    handleNext()
                } label: {
                    HStack {
                        Text(nextButtonTitle)
                        Image(systemName: "chevron.right")
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(GlassPrimaryButtonStyle())
                .disabled(!canAdvance)
                .opacity(canAdvance ? 1.0 : 0.5)
            }
        }
    }

    private var nextButtonTitle: String {
        switch currentStep {
        case .preview:
            return generatedSchedule != nil ? "Looks Good" : "Next"
        default:
            return "Next"
        }
    }

    private var canAdvance: Bool {
        switch currentStep {
        case .experience: return true
        case .sessions: return !preferredDays.isEmpty
        case .goals: return !selectedGoals.isEmpty
        case .preview: return generatedSchedule != nil && !isGenerating
        case .startDate: return true
        }
    }

    // MARK: - Active Block Section

    @ViewBuilder
    private func activeBlockSection(block: TrainingBlockModel) -> some View {
        VStack(spacing: Theme.Spacing.space4) {
            // Week indicator with progress bar and phase
            WeekIndicatorCard(block: block)

            // Session queue (if weekly sessions available)
            if block.weeklySessions != nil {
                SessionQueueCard(
                    block: block,
                    sessionsCompleted: cyclingVM.sessionsCompletedThisWeek,
                    activities: cyclingVM.activities
                )

                // Next Up card
                if let nextSession = cyclingVM.nextSession {
                    NextUpCard(
                        session: nextSession,
                        weekProgress: "\(cyclingVM.sessionsCompletedThisWeek + 1) of \(cyclingVM.weeklySessionsTotal)"
                    )
                } else if cyclingVM.sessionsCompletedThisWeek >= cyclingVM.weeklySessionsTotal && cyclingVM.weeklySessionsTotal > 0 {
                    WeekCompleteCard(sessionsTotal: cyclingVM.weeklySessionsTotal)
                }
            }

            // Complete block early
            Button(role: .destructive) {
                completeBlockEarly()
            } label: {
                Text("Complete Block Early")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(GlassSecondaryButtonStyle())
        }
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

    private func colorForSessionType(_ type: String) -> Color {
        switch SessionType(rawValue: type) {
        case .vo2max: return Theme.destructive
        case .threshold: return Theme.warning
        case .endurance: return Theme.info
        case .tempo: return Color.orange
        case .fun: return Theme.success
        case .recovery: return Theme.info
        case .off: return Theme.textSecondary
        case .none: return Theme.textSecondary
        }
    }

    private struct DayOption {
        let number: Int
        let short: String
    }

    private var dayOptions: [DayOption] {
        [
            DayOption(number: 1, short: "Mon"),
            DayOption(number: 2, short: "Tue"),
            DayOption(number: 3, short: "Wed"),
            DayOption(number: 4, short: "Thu"),
            DayOption(number: 5, short: "Fri"),
            DayOption(number: 6, short: "Sat"),
            DayOption(number: 7, short: "Sun"),
        ]
    }

    private func updatePreferredDays(for count: Int) {
        switch count {
        case 2: preferredDays = [2, 6]
        case 3: preferredDays = [2, 4, 6]
        case 4: preferredDays = [2, 4, 6, 7]
        case 5: preferredDays = [1, 2, 4, 6, 7]
        default: break
        }
    }

    // MARK: - Actions

    private func handleNext() {
        withAnimation {
            if let next = WizardStep(rawValue: currentStep.rawValue + 1) {
                currentStep = next
            }
        }
    }

    private func generateScheduleAction() async {
        isGenerating = true
        generateError = nil

        let request = GenerateScheduleRequest(
            sessionsPerWeek: sessionsPerWeek,
            preferredDays: Array(preferredDays).sorted(),
            goals: Array(selectedGoals),
            experienceLevel: experienceLevel,
            weeklyHoursAvailable: hoursOption.midpoint,
            ftp: cyclingVM.currentFTP
        )

        do {
            generatedSchedule = try await coachClient.generateSchedule(request: request)
        } catch {
            generateError = "Could not generate schedule. Please try again."
        }

        isGenerating = false
    }

    private func startBlock() {
        isSaving = true
        Task {
            await cyclingVM.startNewBlock(
                goals: Array(selectedGoals),
                startDate: startDate,
                daysPerWeek: sessionsPerWeek,
                weeklySessions: generatedSchedule?.sessions,
                preferredDays: Array(preferredDays).sorted(),
                experienceLevel: experienceLevel,
                weeklyHoursAvailable: hoursOption.midpoint
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

#Preview {
    NavigationStack {
        TrainingBlockSetupView()
            .environmentObject(CyclingViewModel())
    }
    .preferredColorScheme(.dark)
}
