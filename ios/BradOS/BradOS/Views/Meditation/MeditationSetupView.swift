import SwiftUI
import BradOSCore

/// Setup view for configuring meditation session
struct MeditationSetupView: View {
    @Binding var selectedDuration: MeditationDuration
    let onStart: () -> Void

    @State private var lastSession: MeditationSession?
    @State private var isLoadingLastSession: Bool = false

    private let storage = MeditationStorage.shared
    private let apiService = MeditationAPIService.shared

    var body: some View {
        VStack(spacing: Theme.Spacing.space7) {
            Spacer()

            // Icon
            Image(systemName: "brain.head.profile")
                .font(.system(size: Theme.Typography.iconXL))
                .foregroundColor(Theme.meditation)

            Text("Mindful Breathing")
                .font(.title)
                .fontWeight(.bold)
                .foregroundColor(Theme.textPrimary)

            Text("Focus on your breath to calm your mind")
                .font(.subheadline)
                .foregroundColor(Theme.textSecondary)
                .multilineTextAlignment(.center)

            Spacer()

            // Duration Selection
            durationSelectionSection

            // Last Session Info
            if isLoadingLastSession {
                ProgressView()
                    .tint(Theme.meditation)
            } else if let lastSession = lastSession {
                lastSessionSection(lastSession)
            }

            Spacer()

            // Start Button
            Button(action: onStart) {
                HStack {
                    Image(systemName: "play.fill")
                    Text("Begin Session")
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(PrimaryButtonStyle())
        }
        .padding(Theme.Spacing.space4)
        .onAppear {
            fetchLastSession()
        }
        .onChange(of: selectedDuration) { _, newDuration in
            // Save preference when changed, preserving existing category
            var config = storage.loadMeditationConfig()
            config.duration = newDuration.rawValue
            storage.saveMeditationConfig(config)
        }
    }

    // MARK: - API

    private func fetchLastSession() {
        isLoadingLastSession = true
        Task {
            do {
                let session = try await apiService.fetchLatestSession()
                await MainActor.run {
                    lastSession = session
                    isLoadingLastSession = false
                }
            } catch {
                await MainActor.run {
                    // If fetch fails, just don't show last session
                    lastSession = nil
                    isLoadingLastSession = false
                }
            }
        }
    }

    // MARK: - Duration Selection

    @ViewBuilder
    private var durationSelectionSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            Text("Duration")
                .font(.subheadline)
                .fontWeight(.medium)
                .foregroundColor(Theme.textSecondary)

            HStack(spacing: Theme.Spacing.space4) {
                ForEach(MeditationDuration.allCases) { duration in
                    MeditationDurationOption(
                        duration: duration,
                        isSelected: selectedDuration == duration,
                        onSelect: { selectedDuration = duration }
                    )
                }
            }
        }
    }

    // MARK: - Last Session

    @ViewBuilder
    private func lastSessionSection(_ session: MeditationSession) -> some View {
        HStack {
            Image(systemName: "clock")
                .foregroundColor(Theme.textSecondary)

            Text("Last session: \(formattedDate(session.completedAt))")
                .font(.caption)
                .foregroundColor(Theme.textSecondary)
        }
        .glassCard()
    }

    private func formattedDate(_ date: Date) -> String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .short
        return formatter.localizedString(for: date, relativeTo: Date())
    }
}

/// Duration option button for meditation
struct MeditationDurationOption: View {
    let duration: MeditationDuration
    let isSelected: Bool
    let onSelect: () -> Void

    var body: some View {
        Button(action: onSelect) {
            VStack(spacing: 4) {
                Text("\(duration.rawValue)")
                    .font(.title)
                    .fontWeight(.bold)
                    .foregroundColor(isSelected ? Theme.meditation : Theme.textPrimary)

                Text("min")
                    .font(.caption)
                    .foregroundColor(Theme.textSecondary)
            }
            .frame(maxWidth: .infinity)
            .glassCard(.card, radius: Theme.CornerRadius.md)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.CornerRadius.md, style: .continuous)
                    .stroke(isSelected ? Theme.meditation : Color.clear, lineWidth: 2)
            )
        }
        .buttonStyle(PlainButtonStyle())
        .accessibilityLabel("\(duration.rawValue) minutes")
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .accessibilityHint(isSelected ? "Currently selected" : "Double tap to select")
    }
}
