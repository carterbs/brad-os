import SwiftUI

// MARK: - Onboarding Step

/// Steps in the cycling onboarding wizard
enum CyclingOnboardingStep: Int, CaseIterable {
    case ftp = 0
    case experience = 1
    case sessions = 2
    case goals = 3
    case preview = 4

    var title: String {
        switch self {
        case .ftp: return "Set Your FTP"
        case .experience: return "Experience"
        case .sessions: return "Sessions"
        case .goals: return "Goals"
        case .preview: return "Your Plan"
        }
    }

    var subtitle: String {
        switch self {
        case .ftp: return "Your Functional Threshold Power"
        case .experience: return "Help the AI tailor your plan"
        case .sessions: return "How often do you want to ride?"
        case .goals: return "What are you working toward?"
        case .preview: return "AI-generated training schedule"
        }
    }

    var systemImage: String {
        switch self {
        case .ftp: return "bolt.fill"
        case .experience: return "person.fill"
        case .sessions: return "calendar"
        case .goals: return "target"
        case .preview: return "brain.head.profile"
        }
    }
}

// MARK: - Onboarding Hours Option

private enum OnboardingHoursOption: String, CaseIterable {
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

// MARK: - Cycling Onboarding View

/// Wizard-style onboarding flow for cycling feature
struct CyclingOnboardingView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var cyclingVM: CyclingViewModel
    @StateObject private var coachClient = CyclingCoachClient()

    @State private var currentStep: CyclingOnboardingStep = .ftp
    @State private var ftpValue: String = ""
    @State private var experienceLevel: ExperienceLevel = .intermediate
    @State private var hoursOption: OnboardingHoursOption = .fourToFive
    @State private var sessionsPerWeek = 3
    @State private var preferredDays: Set<Int> = [2, 4, 6]
    @State private var selectedGoals: Set<TrainingBlockModel.TrainingGoal> = []
    @State private var startDate = Date()
    @State private var isSaving = false
    @State private var showError = false
    @State private var errorMessage = ""
    @State private var generatedSchedule: GenerateScheduleResponse?
    @State private var isGenerating = false
    @State private var generateError: String?

    // Callback when onboarding is complete
    var onComplete: (() -> Void)?

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Progress indicator
                progressIndicator
                    .padding(.top, Theme.Spacing.space4)
                    .padding(.horizontal, Theme.Spacing.space5)

                // Step content
                TabView(selection: $currentStep) {
                    ftpStep
                        .tag(CyclingOnboardingStep.ftp)

                    experienceStep
                        .tag(CyclingOnboardingStep.experience)

                    sessionsStep
                        .tag(CyclingOnboardingStep.sessions)

                    goalsStep
                        .tag(CyclingOnboardingStep.goals)

                    previewStep
                        .tag(CyclingOnboardingStep.preview)
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
                .animation(.easeInOut, value: currentStep)

                // Navigation buttons
                navigationButtons
                    .padding(Theme.Spacing.space5)
            }
            .background(AuroraBackground().ignoresSafeArea())
            .navigationTitle("Get Started")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.hidden, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Skip") {
                        dismiss()
                    }
                    .foregroundColor(Theme.textSecondary)
                }
            }
            .alert("Error", isPresented: $showError) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(errorMessage)
            }
        }
    }

    // MARK: - Progress Indicator

    private var progressIndicator: some View {
        HStack(spacing: Theme.Spacing.space2) {
            ForEach(CyclingOnboardingStep.allCases, id: \.rawValue) { step in
                Capsule()
                    .fill(step.rawValue <= currentStep.rawValue
                          ? Theme.interactivePrimary
                          : Color.white.opacity(0.2))
                    .frame(height: 4)
                    .animation(.easeInOut, value: currentStep)
            }
        }
    }

    // MARK: - FTP Step

    private var ftpStep: some View {
        ScrollView {
            VStack(spacing: Theme.Spacing.space6) {
                Spacer()
                    .frame(height: Theme.Spacing.space8)

                Image(systemName: CyclingOnboardingStep.ftp.systemImage)
                    .font(.system(size: 64))
                    .foregroundStyle(.yellow)
                    .frame(width: 120, height: 120)
                    .background(Color.yellow.opacity(0.15))
                    .clipShape(Circle())

                VStack(spacing: Theme.Spacing.space2) {
                    Text(CyclingOnboardingStep.ftp.title)
                        .font(.title2)
                        .fontWeight(.bold)
                        .foregroundColor(Theme.textPrimary)

                    Text("FTP is the maximum power you can sustain for ~1 hour. It's used to calculate training zones and TSS.")
                        .font(.subheadline)
                        .foregroundStyle(Theme.textSecondary)
                        .multilineTextAlignment(.center)
                }

                VStack(spacing: 0) {
                    HStack {
                        Text("FTP (watts)")
                            .foregroundColor(Theme.textSecondary)
                        Spacer()
                        TextField("e.g. 200", text: $ftpValue)
                            .keyboardType(.numberPad)
                            .multilineTextAlignment(.trailing)
                            .foregroundColor(Theme.textPrimary)
                            .frame(width: 100)
                    }
                    .padding(Theme.Spacing.space4)
                    .frame(minHeight: Theme.Dimensions.listRowMinHeight)
                }
                .glassCard(.card, padding: 0)

                if let ftp = Int(ftpValue), ftp > 0 {
                    powerZonesPreview(ftp: ftp)
                }

                VStack(alignment: .leading, spacing: Theme.Spacing.space2) {
                    HStack(spacing: Theme.Spacing.space2) {
                        Image(systemName: "info.circle.fill")
                            .foregroundStyle(Theme.info)
                        Text("Don't know your FTP?")
                            .font(.subheadline)
                            .fontWeight(.medium)
                            .foregroundColor(Theme.textPrimary)
                    }
                    Text("You can estimate it from a 20-minute max effort test (take 95% of average power) or skip for now and update later.")
                        .font(.caption)
                        .foregroundStyle(Theme.textSecondary)
                }
                .padding(Theme.Spacing.space4)
                .glassCard()

                Spacer()
            }
            .padding(Theme.Spacing.space5)
        }
    }

    private func powerZonesPreview(ftp: Int) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space3) {
            Text("Your Training Zones")
                .font(.subheadline)
                .fontWeight(.semibold)
                .foregroundColor(Theme.textPrimary)

            VStack(spacing: Theme.Spacing.space2) {
                PowerZoneRow(zone: "Z1 Recovery", range: "< \(Int(Double(ftp) * 0.55))W", color: Theme.info)
                PowerZoneRow(zone: "Z2 Endurance", range: "\(Int(Double(ftp) * 0.55))-\(Int(Double(ftp) * 0.75))W", color: Theme.success)
                PowerZoneRow(zone: "Z3 Tempo", range: "\(Int(Double(ftp) * 0.75))-\(Int(Double(ftp) * 0.90))W", color: Theme.warning)
                PowerZoneRow(zone: "Z4 Threshold", range: "\(Int(Double(ftp) * 0.90))-\(Int(Double(ftp) * 1.05))W", color: Color.orange)
                PowerZoneRow(zone: "Z5 VO2max", range: "> \(Int(Double(ftp) * 1.05))W", color: Theme.destructive)
            }
        }
        .padding(Theme.Spacing.space4)
        .glassCard()
    }

    // MARK: - Experience Step

    private var experienceStep: some View {
        ScrollView {
            VStack(spacing: Theme.Spacing.space6) {
                Spacer()
                    .frame(height: Theme.Spacing.space4)

                VStack(spacing: Theme.Spacing.space2) {
                    Text("Experience Level")
                        .font(.title2)
                        .fontWeight(.bold)
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
                        ForEach(OnboardingHoursOption.allCases, id: \.self) { option in
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

                Spacer()
            }
            .padding(Theme.Spacing.space5)
        }
    }

    // MARK: - Sessions Step

    private var sessionsStep: some View {
        ScrollView {
            VStack(spacing: Theme.Spacing.space6) {
                Spacer()
                    .frame(height: Theme.Spacing.space4)

                VStack(spacing: Theme.Spacing.space2) {
                    Text("Sessions Per Week")
                        .font(.title2)
                        .fontWeight(.bold)
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

                Spacer()
            }
            .padding(Theme.Spacing.space5)
        }
    }

    // MARK: - Goals Step

    private var goalsStep: some View {
        ScrollView {
            VStack(spacing: Theme.Spacing.space6) {
                Spacer()
                    .frame(height: Theme.Spacing.space4)

                VStack(spacing: Theme.Spacing.space2) {
                    Text("Training Goals")
                        .font(.title2)
                        .fontWeight(.bold)
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
                            HStack(spacing: Theme.Spacing.space3) {
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
                            .padding(Theme.Spacing.space3)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
                .glassCard(.card, padding: 0)

                Spacer()
            }
            .padding(Theme.Spacing.space5)
        }
    }

    // MARK: - Preview Step

    private var previewStep: some View {
        ScrollView {
            VStack(spacing: Theme.Spacing.space6) {
                Spacer()
                    .frame(height: Theme.Spacing.space4)

                VStack(spacing: Theme.Spacing.space2) {
                    Text("Your AI-Generated Plan")
                        .font(.title2)
                        .fontWeight(.bold)
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

                Spacer()
            }
            .padding(Theme.Spacing.space5)
        }
        .task {
            if generatedSchedule == nil && !isGenerating {
                await generateScheduleAction()
            }
        }
    }

    private var endDate: Date {
        Calendar.current.date(byAdding: .weekOfYear, value: 8, to: startDate) ?? startDate
    }

    // MARK: - Navigation Buttons

    private var navigationButtons: some View {
        HStack(spacing: Theme.Spacing.space4) {
            // Back button
            if currentStep != .ftp {
                Button {
                    withAnimation {
                        if let previousIndex = CyclingOnboardingStep.allCases.firstIndex(of: currentStep),
                           previousIndex > 0 {
                            currentStep = CyclingOnboardingStep.allCases[previousIndex - 1]
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

            // Next/Finish button
            Button {
                handleNext()
            } label: {
                HStack {
                    if isSaving {
                        ProgressView()
                            .tint(Theme.textPrimary)
                    } else {
                        Text(nextButtonTitle)
                        if currentStep != .preview {
                            Image(systemName: "chevron.right")
                        }
                    }
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(GlassPrimaryButtonStyle())
            .disabled(isSaving || !canAdvance)
            .opacity(canAdvance ? 1.0 : 0.5)
        }
    }

    private var nextButtonTitle: String {
        if currentStep == .preview {
            return generatedSchedule != nil ? "Start Training" : "Continue"
        }
        return "Continue"
    }

    private var canAdvance: Bool {
        switch currentStep {
        case .ftp: return true
        case .experience: return true
        case .sessions: return !preferredDays.isEmpty
        case .goals: return !selectedGoals.isEmpty
        case .preview: return generatedSchedule != nil && !isGenerating
        }
    }

    // MARK: - Actions

    private func handleNext() {
        withAnimation {
            switch currentStep {
            case .ftp:
                currentStep = .experience
            case .experience:
                currentStep = .sessions
            case .sessions:
                currentStep = .goals
            case .goals:
                currentStep = .preview
            case .preview:
                finishOnboarding()
            }
        }
    }

    private func finishOnboarding() {
        isSaving = true

        Task {
            var hasError = false

            // Save FTP if provided
            if let ftp = Int(ftpValue), ftp > 0 {
                let ftpSuccess = await cyclingVM.saveFTP(ftp)
                if !ftpSuccess {
                    hasError = true
                }
            }

            // Create training block if goals selected
            if !selectedGoals.isEmpty {
                await cyclingVM.startNewBlock(
                    goals: Array(selectedGoals),
                    startDate: startDate,
                    daysPerWeek: sessionsPerWeek,
                    weeklySessions: generatedSchedule?.sessions,
                    preferredDays: Array(preferredDays).sorted(),
                    experienceLevel: experienceLevel,
                    weeklyHoursAvailable: hoursOption.midpoint
                )
                if cyclingVM.currentBlock == nil {
                    hasError = true
                }
            }

            isSaving = false

            if hasError {
                errorMessage = cyclingVM.error ?? "Failed to save settings. Please try again."
                showError = true
            } else {
                onComplete?()
                dismiss()
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
            ftp: cyclingVM.currentFTP ?? Int(ftpValue)
        )

        do {
            generatedSchedule = try await coachClient.generateSchedule(request: request)
        } catch {
            generateError = "Could not generate schedule. Please try again."
        }

        isGenerating = false
    }

    // MARK: - Helpers

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
}

// MARK: - Supporting Views

struct PowerZoneRow: View {
    let zone: String
    let range: String
    let color: Color

    var body: some View {
        HStack {
            Circle()
                .fill(color)
                .frame(width: 8, height: 8)
            Text(zone)
                .font(.caption)
                .foregroundColor(Theme.textPrimary)
            Spacer()
            Text(range)
                .font(.caption)
                .monospacedDigit()
                .foregroundStyle(Theme.textSecondary)
        }
    }
}

// MARK: - Preview

#Preview {
    CyclingOnboardingView()
        .environmentObject(CyclingViewModel())
        .preferredColorScheme(.dark)
}
