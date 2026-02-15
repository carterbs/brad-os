import SwiftUI

// MARK: - Actions & Helpers

extension CyclingOnboardingView {

    // MARK: - Actions

    func handleNext() {
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

    func finishOnboarding() {
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

    func generateScheduleAction() async {
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

    func iconForGoal(_ goal: TrainingBlockModel.TrainingGoal) -> String {
        switch goal {
        case .regainFitness: return "heart.fill"
        case .maintainMuscle: return "dumbbell.fill"
        case .loseWeight: return "scalemass.fill"
        }
    }

    func displayNameForGoal(_ goal: TrainingBlockModel.TrainingGoal) -> String {
        switch goal {
        case .regainFitness: return "Regain Fitness"
        case .maintainMuscle: return "Maintain Muscle"
        case .loseWeight: return "Lose Weight"
        }
    }

    func colorForSessionType(_ type: String) -> Color {
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

    struct DayOption {
        let number: Int
        let short: String
    }

    var dayOptions: [DayOption] {
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

    func updatePreferredDays(for count: Int) {
        switch count {
        case 2: preferredDays = [2, 6]
        case 3: preferredDays = [2, 4, 6]
        case 4: preferredDays = [2, 4, 6, 7]
        case 5: preferredDays = [1, 2, 4, 6, 7]
        default: break
        }
    }
}
