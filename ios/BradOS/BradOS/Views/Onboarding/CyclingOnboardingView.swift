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

enum OnboardingHoursOption: String, CaseIterable {
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
    @Environment(\.dismiss) var dismiss
    @EnvironmentObject var cyclingVM: CyclingViewModel
    @StateObject var coachClient = ServiceFactory.makeCyclingCoachClient()

    @State var currentStep: CyclingOnboardingStep = .ftp
    @State var ftpValue: String = ""
    @State var experienceLevel: ExperienceLevel = .intermediate
    @State var hoursOption: OnboardingHoursOption = .fourToFive
    @State var sessionsPerWeek = 3
    @State var preferredDays: Set<Int> = [2, 4, 6]
    @State var selectedGoals: Set<TrainingBlockModel.TrainingGoal> = []
    @State var startDate = Date()
    @State var isSaving = false
    @State var showError = false
    @State var errorMessage = ""
    @State var generatedSchedule: GenerateScheduleResponse?
    @State var isGenerating = false
    @State var generateError: String?

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

    var progressIndicator: some View {
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

    // MARK: - Navigation Buttons

    var navigationButtons: some View {
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

    var nextButtonTitle: String {
        if currentStep == .preview {
            return generatedSchedule != nil ? "Start Training" : "Continue"
        }
        return "Continue"
    }

    var canAdvance: Bool {
        switch currentStep {
        case .ftp: return true
        case .experience: return true
        case .sessions: return !preferredDays.isEmpty
        case .goals: return !selectedGoals.isEmpty
        case .preview: return generatedSchedule != nil && !isGenerating
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
