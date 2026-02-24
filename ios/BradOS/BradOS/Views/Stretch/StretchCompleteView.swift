import SwiftUI
import BradOSCore

/// Stretch session completion view
/// Note: Session saving is handled by the parent StretchView (like MeditationView pattern)
/// to avoid navigation issues when dismissing while async work is in progress.
struct StretchCompleteView: View {
    @ObservedObject var sessionManager: StretchSessionService
    let isSaving: Bool
    let saveError: String?
    let onDone: () -> Void
    let onStartAnother: () -> Void
    let onRetrySync: () -> Void

    @State private var showSuccessAnimation = false

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(spacing: Theme.Spacing.space7) {
                    // Success header with icon
                    VStack(spacing: Theme.Spacing.space4) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: Theme.Typography.iconXXL))
                            .foregroundColor(Theme.stretch)
                            .scaleEffect(showSuccessAnimation ? 1.0 : 0.5)
                            .opacity(showSuccessAnimation ? 1.0 : 0.0)
                            .accessibilityHidden(true)

                        Text("Great Stretch!")
                            .font(.largeTitle)
                            .fontWeight(.bold)
                            .foregroundColor(Theme.textPrimary)
                            .opacity(showSuccessAnimation ? 1.0 : 0.0)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("Stretching session complete. Great stretch!")
                    .onAppear {
                        withAnimation(.spring(response: 0.5, dampingFraction: 0.7)) {
                            showSuccessAnimation = true
                        }
                    }
                    .padding(.top, Theme.Spacing.space7)

                    // Stats -- 2-column grid, Glass L1
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: Theme.Spacing.space3) {
                        StatCard(
                            icon: "clock",
                            value: formattedDuration,
                            label: "Duration",
                            valueColor: Theme.stretch
                        )
                        StatCard(
                            icon: "checkmark.circle",
                            value: "\(completedCount)",
                            label: "Completed",
                            valueColor: Theme.stretch
                        )
                        if skippedCount > 0 {
                            StatCard(
                                icon: "forward.fill",
                                value: "\(skippedCount)",
                                label: "Skipped",
                                valueColor: Theme.neutral
                            )
                        }
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel(sessionSummaryAccessibilityLabel)

                    // Stretch breakdown
                    if !sessionManager.completedStretches.isEmpty {
                        stretchBreakdownSection
                    }

                    // Save status indicator (matches MeditationCompleteView pattern)
                    syncStatusView
                }
                .padding(.horizontal, Theme.Spacing.space4)
                .padding(.bottom, Theme.Spacing.space4)
            }

            // Actions pinned at bottom
            VStack(spacing: Theme.Spacing.space4) {
                Button(action: onDone) {
                    Text("Done")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(PrimaryButtonStyle())

                Button(action: onStartAnother) {
                    Text("Start Another Session")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(SecondaryButtonStyle())
            }
            .padding(Theme.Spacing.space4)
        }
    }

    // MARK: - Stretch Breakdown

    @ViewBuilder
    private var stretchBreakdownSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space2) {
            Text("Session Details")
                .font(.headline)
                .foregroundColor(Theme.textPrimary)
                .padding(.bottom, Theme.Spacing.space1)

            ForEach(sessionManager.completedStretches) { completed in
                HStack {
                    Image(systemName: completed.region.iconName)
                        .foregroundColor(Theme.stretch)
                        .frame(width: Theme.Dimensions.iconFrameMD)
                        .accessibilityHidden(true)

                    Text(completed.stretchName)
                        .font(.subheadline)
                        .foregroundColor(Theme.textPrimary)

                    Spacer()

                    if completed.skippedSegments == 2 {
                        Text("Skipped")
                            .font(.caption)
                            .foregroundColor(Theme.neutral)
                    } else if completed.skippedSegments == 1 {
                        Text("Partial")
                            .font(.caption)
                            .foregroundColor(Theme.warning)
                    } else {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundColor(Theme.stretch)
                            .accessibilityHidden(true)
                    }
                }
                .padding(.vertical, 4)
                .accessibilityElement(children: .combine)
                .accessibilityLabel(stretchAccessibilityLabel(for: completed))
            }
        }
        .glassCard()
    }

    // MARK: - Sync Status

    @ViewBuilder
    private var syncStatusView: some View {
        HStack(spacing: Theme.Spacing.space2) {
            if isSaving {
                ProgressView()
                    .tint(Theme.stretch)
                Text("Saving session...")
                    .font(.caption)
                    .foregroundColor(Theme.textSecondary)
            } else if let error = saveError {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundColor(Theme.warning)
                Text(error)
                    .font(.caption)
                    .foregroundColor(Theme.warning)
                Button("Retry", action: onRetrySync)
                    .font(.caption)
                    .foregroundColor(Theme.interactivePrimary)
            } else {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundColor(Theme.success)
                Text("Session saved")
                    .font(.caption)
                    .foregroundColor(Theme.textSecondary)
            }
        }
        .padding(Theme.Spacing.space2)
    }

    // MARK: - Computed Properties

    private var formattedDuration: String {
        guard let startTime = sessionManager.sessionStartTime else {
            return "0m"
        }
        let totalSeconds = Int(Date().timeIntervalSince(startTime))
        let minutes = totalSeconds / 60
        let seconds = totalSeconds % 60
        if seconds == 0 {
            return "\(minutes)m"
        }
        return "\(minutes)m \(seconds)s"
    }

    private var completedCount: Int {
        sessionManager.completedStretches.filter { $0.skippedSegments < 2 }.count
    }

    private var skippedCount: Int {
        sessionManager.completedStretches.filter { $0.skippedSegments == 2 }.count
    }

    // MARK: - Accessibility Helpers

    private var sessionSummaryAccessibilityLabel: String {
        var label = "Session summary: Duration \(formattedDuration), \(completedCount) stretches completed"
        if skippedCount > 0 {
            label += ", \(skippedCount) stretches skipped"
        }
        return label
    }

    private func stretchAccessibilityLabel(for completed: CompletedStretch) -> String {
        if completed.skippedSegments == 2 {
            return "\(completed.stretchName), skipped"
        } else if completed.skippedSegments == 1 {
            return "\(completed.stretchName), partially completed"
        } else {
            return "\(completed.stretchName), completed"
        }
    }
}

/// Stat card for completion view -- Glass L1, icon 18pt, display value monospacedDigit, footnote label
struct StatCard: View {
    let icon: String
    let value: String
    let label: String
    var valueColor: Color = Theme.textPrimary

    var body: some View {
        VStack(spacing: Theme.Spacing.space2) {
            Image(systemName: icon)
                .font(.system(size: 18))
                .foregroundColor(valueColor)

            Text(value)
                .font(.title2)
                .fontWeight(.semibold)
                .foregroundColor(valueColor)
                .monospacedDigit()

            Text(label)
                .font(.footnote)
                .foregroundColor(Theme.textSecondary)
        }
        .frame(maxWidth: .infinity)
        .glassCard()
    }
}

/// Simple stat row for completion view (legacy, kept for StretchSessionDetailView)
struct StatRow: View {
    let label: String
    let value: String
    var valueColor: Color = Theme.textPrimary

    var body: some View {
        HStack {
            Text(label)
                .font(.subheadline)
                .foregroundColor(Theme.textSecondary)
            Spacer()
            Text(value)
                .font(.subheadline)
                .fontWeight(.semibold)
                .foregroundColor(valueColor)
        }
    }
}
