import SwiftUI

// MARK: - Onboarding Step

/// Steps in the cycling onboarding wizard
enum CyclingOnboardingStep: Int, CaseIterable {
    case strava = 0
    case ftp = 1
    case trainingBlock = 2

    var title: String {
        switch self {
        case .strava: return "Connect Strava"
        case .ftp: return "Set Your FTP"
        case .trainingBlock: return "Start Training"
        }
    }

    var subtitle: String {
        switch self {
        case .strava: return "Sync your Peloton rides automatically"
        case .ftp: return "Your Functional Threshold Power"
        case .trainingBlock: return "Create your 8-week training block"
        }
    }

    var systemImage: String {
        switch self {
        case .strava: return "figure.outdoor.cycle"
        case .ftp: return "bolt.fill"
        case .trainingBlock: return "calendar"
        }
    }
}

// MARK: - Cycling Onboarding View

/// Wizard-style onboarding flow for cycling feature
struct CyclingOnboardingView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var stravaAuth: StravaAuthManager

    @State private var currentStep: CyclingOnboardingStep = .strava
    @State private var ftpValue: String = ""
    @State private var selectedGoals: Set<TrainingBlockModel.TrainingGoal> = []
    @State private var startDate = Date()
    @State private var isSaving = false
    @State private var showError = false
    @State private var errorMessage = ""

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
                    stravaStep
                        .tag(CyclingOnboardingStep.strava)

                    ftpStep
                        .tag(CyclingOnboardingStep.ftp)

                    trainingBlockStep
                        .tag(CyclingOnboardingStep.trainingBlock)
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

    // MARK: - Strava Step

    private var stravaStep: some View {
        ScrollView {
            VStack(spacing: Theme.Spacing.space6) {
                Spacer()
                    .frame(height: Theme.Spacing.space8)

                // Icon
                Image(systemName: CyclingOnboardingStep.strava.systemImage)
                    .font(.system(size: 64))
                    .foregroundStyle(Color.orange)
                    .frame(width: 120, height: 120)
                    .background(Color.orange.opacity(0.15))
                    .clipShape(Circle())

                // Title & subtitle
                VStack(spacing: Theme.Spacing.space2) {
                    Text(CyclingOnboardingStep.strava.title)
                        .font(.title2)
                        .fontWeight(.bold)
                        .foregroundColor(Theme.textPrimary)

                    Text(CyclingOnboardingStep.strava.subtitle)
                        .font(.subheadline)
                        .foregroundStyle(Theme.textSecondary)
                        .multilineTextAlignment(.center)
                }

                // Status or connect button
                if stravaAuth.isConnected {
                    connectedStravaCard
                } else {
                    connectStravaCard
                }

                // Features list
                featuresList

                Spacer()
            }
            .padding(Theme.Spacing.space5)
        }
    }

    private var connectedStravaCard: some View {
        HStack(spacing: Theme.Spacing.space3) {
            Image(systemName: "checkmark.circle.fill")
                .font(.title2)
                .foregroundStyle(Theme.success)

            VStack(alignment: .leading, spacing: 2) {
                Text("Strava Connected")
                    .font(.headline)
                    .foregroundColor(Theme.textPrimary)

                if let athleteId = stravaAuth.athleteId {
                    Text("Athlete ID: \(athleteId)")
                        .font(.caption)
                        .foregroundStyle(Theme.textSecondary)
                }
            }

            Spacer()
        }
        .padding(Theme.Spacing.space4)
        .glassCard()
    }

    private var connectStravaCard: some View {
        VStack(spacing: Theme.Spacing.space4) {
            Button {
                Task {
                    do {
                        try await stravaAuth.startOAuthFlow()
                    } catch {
                        errorMessage = error.localizedDescription
                        showError = true
                    }
                }
            } label: {
                HStack {
                    Image(systemName: "link")
                    Text("Connect with Strava")
                }
                .frame(maxWidth: .infinity)
                .padding()
                .background(Color.orange)
                .foregroundStyle(.white)
                .cornerRadius(Theme.CornerRadius.md)
            }
            .disabled(stravaAuth.isLoading)
            .opacity(stravaAuth.isLoading ? 0.5 : 1.0)

            if stravaAuth.isLoading {
                ProgressView()
                    .tint(Theme.textPrimary)
            }

            if let error = stravaAuth.error {
                Text(error)
                    .font(.caption)
                    .foregroundColor(Theme.destructive)
                    .multilineTextAlignment(.center)
            }
        }
    }

    private var featuresList: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space3) {
            OnboardingFeatureRow(icon: "bicycle", text: "Sync Peloton rides automatically")
            OnboardingFeatureRow(icon: "bolt.fill", text: "Track power metrics (NP, TSS)")
            OnboardingFeatureRow(icon: "heart.fill", text: "Heart rate analysis")
        }
        .padding(Theme.Spacing.space4)
        .glassCard()
    }

    // MARK: - FTP Step

    private var ftpStep: some View {
        ScrollView {
            VStack(spacing: Theme.Spacing.space6) {
                Spacer()
                    .frame(height: Theme.Spacing.space8)

                // Icon
                Image(systemName: CyclingOnboardingStep.ftp.systemImage)
                    .font(.system(size: 64))
                    .foregroundStyle(.yellow)
                    .frame(width: 120, height: 120)
                    .background(Color.yellow.opacity(0.15))
                    .clipShape(Circle())

                // Title & subtitle
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

                // FTP input card
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

                // Power zones preview
                if let ftp = Int(ftpValue), ftp > 0 {
                    powerZonesPreview(ftp: ftp)
                }

                // Info card
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

    // MARK: - Training Block Step

    private var trainingBlockStep: some View {
        ScrollView {
            VStack(spacing: Theme.Spacing.space6) {
                Spacer()
                    .frame(height: Theme.Spacing.space4)

                // Icon
                Image(systemName: CyclingOnboardingStep.trainingBlock.systemImage)
                    .font(.system(size: 64))
                    .foregroundStyle(Theme.cycling)
                    .frame(width: 120, height: 120)
                    .background(Theme.cycling.opacity(0.15))
                    .clipShape(Circle())

                // Title & subtitle
                VStack(spacing: Theme.Spacing.space2) {
                    Text(CyclingOnboardingStep.trainingBlock.title)
                        .font(.title2)
                        .fontWeight(.bold)
                        .foregroundColor(Theme.textPrimary)

                    Text("An 8-week structured training block with progressive overload and recovery weeks.")
                        .font(.subheadline)
                        .foregroundStyle(Theme.textSecondary)
                        .multilineTextAlignment(.center)
                }

                // Goals selection
                goalsSelectionCard

                // Date selection
                dateSelectionCard

                // Schedule preview
                schedulePreviewCard

                Spacer()
            }
            .padding(Theme.Spacing.space5)
        }
    }

    private var goalsSelectionCard: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space3) {
            Text("Goals")
                .font(.subheadline)
                .fontWeight(.semibold)
                .foregroundColor(Theme.textPrimary)

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
                    }
                    .buttonStyle(.plain)
                }
            }
            .glassCard(.card, padding: 0)
        }
    }

    private var dateSelectionCard: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space3) {
            Text("Schedule")
                .font(.subheadline)
                .fontWeight(.semibold)
                .foregroundColor(Theme.textPrimary)

            VStack(spacing: 0) {
                DatePicker(
                    "Start Date",
                    selection: $startDate,
                    in: Date()...,
                    displayedComponents: .date
                )
                .foregroundColor(Theme.textPrimary)
                .tint(Theme.interactivePrimary)
                .padding(Theme.Spacing.space3)

                Divider()
                    .background(Theme.strokeSubtle)

                HStack {
                    Text("End Date")
                        .foregroundColor(Theme.textSecondary)
                    Spacer()
                    Text(endDate, style: .date)
                        .foregroundStyle(Theme.textSecondary)
                }
                .padding(Theme.Spacing.space3)
            }
            .glassCard(.card, padding: 0)
        }
    }

    private var schedulePreviewCard: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space3) {
            Text("Weekly Structure")
                .font(.subheadline)
                .fontWeight(.semibold)
                .foregroundColor(Theme.textPrimary)

            VStack(spacing: 0) {
                SchedulePreviewRow(day: "Tuesday", session: "VO2max Intervals", icon: "flame.fill", color: Theme.destructive)
                Divider().background(Theme.strokeSubtle)
                SchedulePreviewRow(day: "Thursday", session: "Threshold", icon: "bolt.fill", color: Theme.warning)
                Divider().background(Theme.strokeSubtle)
                SchedulePreviewRow(day: "Saturday", session: "Fun Ride", icon: "face.smiling.fill", color: Theme.success)
            }
            .glassCard(.card, padding: 0)
        }
    }

    private var endDate: Date {
        Calendar.current.date(byAdding: .weekOfYear, value: 8, to: startDate) ?? startDate
    }

    // MARK: - Navigation Buttons

    private var navigationButtons: some View {
        HStack(spacing: Theme.Spacing.space4) {
            // Back button
            if currentStep != .strava {
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
                        Text(currentStep == .trainingBlock ? "Start Training" : "Continue")
                        if currentStep != .trainingBlock {
                            Image(systemName: "chevron.right")
                        }
                    }
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(GlassPrimaryButtonStyle())
            .disabled(isSaving || (currentStep == .trainingBlock && selectedGoals.isEmpty))
            .opacity((currentStep == .trainingBlock && selectedGoals.isEmpty) ? 0.5 : 1.0)
        }
    }

    // MARK: - Actions

    private func handleNext() {
        withAnimation {
            switch currentStep {
            case .strava:
                currentStep = .ftp
            case .ftp:
                currentStep = .trainingBlock
            case .trainingBlock:
                finishOnboarding()
            }
        }
    }

    private func finishOnboarding() {
        isSaving = true

        // TODO: Save FTP and training block to backend
        // For now, just complete onboarding
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
            isSaving = false
            onComplete?()
            dismiss()
        }
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
}

// MARK: - Supporting Views

struct OnboardingFeatureRow: View {
    let icon: String
    let text: String

    var body: some View {
        HStack(spacing: Theme.Spacing.space3) {
            Image(systemName: icon)
                .foregroundStyle(Color.orange)
                .frame(width: 24)
            Text(text)
                .font(.subheadline)
                .foregroundColor(Theme.textPrimary)
            Spacer()
        }
    }
}

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

struct SchedulePreviewRow: View {
    let day: String
    let session: String
    let icon: String
    let color: Color

    var body: some View {
        HStack(spacing: Theme.Spacing.space3) {
            Image(systemName: icon)
                .foregroundStyle(color)
                .frame(width: 24)

            Text(day)
                .fontWeight(.medium)
                .foregroundColor(Theme.textPrimary)

            Spacer()

            Text(session)
                .font(.subheadline)
                .foregroundStyle(Theme.textSecondary)
        }
        .padding(Theme.Spacing.space3)
    }
}

// MARK: - Preview

#Preview {
    CyclingOnboardingView()
        .environmentObject(StravaAuthManager())
        .preferredColorScheme(.dark)
}
