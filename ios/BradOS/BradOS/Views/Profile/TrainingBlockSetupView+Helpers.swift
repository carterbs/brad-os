import SwiftUI

// MARK: - Helper Functions & Actions

extension TrainingBlockSetupView {

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

    // MARK: - Actions

    func handleNext() {
        withAnimation {
            if let next = WizardStep(rawValue: currentStep.rawValue + 1) {
                currentStep = next
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
            ftp: cyclingVM.currentFTP
        )

        do {
            generatedSchedule = try await coachClient.generateSchedule(request: request)
        } catch {
            generateError = "Could not generate schedule. Please try again."
        }

        isGenerating = false
    }

    func startBlock() {
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

    func completeBlockEarly() {
        Task {
            await cyclingVM.completeCurrentBlock()
        }
    }
}
