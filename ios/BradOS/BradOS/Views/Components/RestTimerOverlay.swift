import SwiftUI

/// Full-screen rest timer overlay with circular progress indicator
struct RestTimerOverlay: View {
    let elapsedSeconds: Int
    let targetSeconds: Int
    let isComplete: Bool
    let onDismiss: () -> Void

    var body: some View {
        ZStack {
            // Scrim background
            Theme.scrimStandard
                .ignoresSafeArea()

            VStack(spacing: Theme.Spacing.space7) {
                Spacer()

                // Circular progress indicator
                ZStack {
                    // Background circle
                    Circle()
                        .stroke(Color.white.opacity(0.06), lineWidth: 12)
                        .frame(width: Theme.Dimensions.timerCircle, height: Theme.Dimensions.timerCircle)

                    // Progress arc
                    Circle()
                        .trim(from: 0, to: progress)
                        .stroke(
                            progressColor,
                            style: StrokeStyle(lineWidth: 12, lineCap: .round)
                        )
                        .frame(width: Theme.Dimensions.timerCircle, height: Theme.Dimensions.timerCircle)
                        .rotationEffect(.degrees(-90))
                        .animation(.easeInOut(duration: 0.3), value: progress)

                    // Center content
                    VStack(spacing: Theme.Spacing.space1) {
                        Text(timeString)
                            .font(.system(size: 34, weight: .bold))
                            .monospacedDigit()
                            .foregroundColor(isComplete ? Theme.success : Theme.textPrimary)

                        Text(statusText)
                            .font(.subheadline)
                            .fontWeight(.medium)
                            .foregroundColor(isComplete ? Theme.success : Theme.textSecondary)
                    }
                }

                // Status indicator
                if isComplete {
                    HStack(spacing: Theme.Spacing.space2) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.title2)
                        Text("Ready for Next Set")
                            .font(.headline)
                    }
                    .foregroundColor(Theme.success)
                    .padding(.top, Theme.Spacing.space4)
                }

                Spacer()

                // Dismiss button — glass secondary style
                Button(action: onDismiss) {
                    HStack {
                        Image(systemName: "xmark")
                        Text("Dismiss")
                    }
                }
                .buttonStyle(GlassSecondaryButtonStyle())
                .padding(.bottom, Theme.Spacing.space7)
            }
        }
        .transition(.opacity)
    }

    // MARK: - Computed Properties

    private var progress: Double {
        guard targetSeconds > 0 else { return 0 }
        if isComplete {
            return 1.0
        }
        return min(1.0, Double(elapsedSeconds) / Double(targetSeconds))
    }

    private var progressColor: Color {
        if isComplete {
            return Theme.success
        } else if progress > 0.75 {
            return Theme.warning
        } else {
            return Theme.interactivePrimary
        }
    }

    private var timeString: String {
        let displaySeconds: Int
        let prefix: String

        if isComplete {
            // Show overtime (how long past the target)
            displaySeconds = elapsedSeconds - targetSeconds
            prefix = "+"
        } else {
            // Show countdown
            displaySeconds = max(0, targetSeconds - elapsedSeconds)
            prefix = ""
        }

        let minutes = displaySeconds / 60
        let seconds = displaySeconds % 60
        return "\(prefix)\(minutes):\(String(format: "%02d", seconds))"
    }

    private var statusText: String {
        if isComplete {
            return "Rest Complete!"
        } else {
            return "Resting..."
        }
    }
}

/// Compact rest timer bar for bottom of screen
struct RestTimerBar: View {
    let elapsedSeconds: Int
    let targetSeconds: Int
    let isComplete: Bool
    let onTap: () -> Void
    let onDismiss: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Rest Timer")
                        .font(.caption)
                        .foregroundColor(Theme.textSecondary)

                    Text(timeString)
                        .font(.title2)
                        .fontWeight(.bold)
                        .foregroundColor(isComplete ? Theme.success : Theme.textPrimary)
                        .monospacedDigit()
                }

                Spacer()

                if isComplete {
                    Text("Ready!")
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .foregroundColor(Theme.success)
                }

                // Progress ring
                ZStack {
                    Circle()
                        .stroke(Color.white.opacity(0.06), lineWidth: 3)
                        .frame(width: Theme.Dimensions.progressRing, height: Theme.Dimensions.progressRing)

                    Circle()
                        .trim(from: 0, to: progress)
                        .stroke(
                            isComplete ? Theme.success : Theme.interactivePrimary,
                            style: StrokeStyle(lineWidth: 3, lineCap: .round)
                        )
                        .frame(width: Theme.Dimensions.progressRing, height: Theme.Dimensions.progressRing)
                        .rotationEffect(.degrees(-90))
                }

                Button(action: onDismiss) {
                    Image(systemName: "xmark.circle.fill")
                        .font(.title2)
                        .foregroundColor(Theme.textSecondary)
                }
                .padding(.leading, Theme.Spacing.space2)
            }
            .glassCard(.elevated, radius: Theme.CornerRadius.md)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.CornerRadius.md, style: .continuous)
                    .stroke(isComplete ? Theme.success : Theme.interactivePrimary, lineWidth: 1)
            )
        }
        .buttonStyle(PlainButtonStyle())
        .padding(.horizontal, Theme.Spacing.space4)
        .shadow(color: Theme.Shadow.smColor, radius: Theme.Shadow.smBlur, y: Theme.Shadow.smY)
    }

    private var progress: Double {
        guard targetSeconds > 0 else { return 0 }
        return min(1.0, Double(elapsedSeconds) / Double(targetSeconds))
    }

    private var timeString: String {
        let displaySeconds: Int
        let prefix: String

        if isComplete {
            displaySeconds = elapsedSeconds - targetSeconds
            prefix = "+"
        } else {
            displaySeconds = max(0, targetSeconds - elapsedSeconds)
            prefix = ""
        }

        let minutes = displaySeconds / 60
        let seconds = displaySeconds % 60
        return "\(prefix)\(minutes):\(String(format: "%02d", seconds))"
    }
}

#Preview("Overlay - Counting") {
    RestTimerOverlay(
        elapsedSeconds: 45,
        targetSeconds: 90,
        isComplete: false,
        onDismiss: {}
    )
}

#Preview("Overlay - Complete") {
    RestTimerOverlay(
        elapsedSeconds: 100,
        targetSeconds: 90,
        isComplete: true,
        onDismiss: {}
    )
}

#Preview("Bar - Counting") {
    VStack {
        Spacer()
        RestTimerBar(
            elapsedSeconds: 45,
            targetSeconds: 90,
            isComplete: false,
            onTap: {},
            onDismiss: {}
        )
    }
    .background(AuroraBackground().ignoresSafeArea())
}

#Preview("Bar - Complete") {
    VStack {
        Spacer()
        RestTimerBar(
            elapsedSeconds: 100,
            targetSeconds: 90,
            isComplete: true,
            onTap: {},
            onDismiss: {}
        )
    }
    .background(AuroraBackground().ignoresSafeArea())
}
