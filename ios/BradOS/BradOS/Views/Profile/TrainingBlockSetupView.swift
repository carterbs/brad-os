import SwiftUI

// MARK: - Wizard Step

enum WizardStep: Int, CaseIterable {
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

enum HoursOption: String, CaseIterable {
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
    @StateObject var coachClient = CyclingCoachClient()

    @State var currentStep: WizardStep = .experience
    @State var experienceLevel: ExperienceLevel = .intermediate
    @State var hoursOption: HoursOption = .fourToFive
    @State var sessionsPerWeek = 3
    @State var preferredDays: Set<Int> = [2, 4, 6] // Tue, Thu, Sat
    @State var selectedGoals: Set<TrainingBlockModel.TrainingGoal> = []
    @State var generatedSchedule: GenerateScheduleResponse?
    @State var isGenerating = false
    @State var startDate = Date()
    @State var isSaving = false
    @State var showSuccess = false
    @State var showError = false
    @State var generateError: String?

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

    var progressIndicator: some View {
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
    var stepContent: some View {
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

    // MARK: - Navigation Buttons

    var navigationButtons: some View {
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

    var nextButtonTitle: String {
        switch currentStep {
        case .preview:
            return generatedSchedule != nil ? "Looks Good" : "Next"
        default:
            return "Next"
        }
    }

    var canAdvance: Bool {
        switch currentStep {
        case .experience: return true
        case .sessions: return !preferredDays.isEmpty
        case .goals: return !selectedGoals.isEmpty
        case .preview: return generatedSchedule != nil && !isGenerating
        case .startDate: return true
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
