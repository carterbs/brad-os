import SwiftUI
import UIKit
import BradOSCore

/// Active stretch session view
struct StretchActiveView: View {
    @ObservedObject var sessionManager: StretchSessionManager
    let onCancel: () -> Void

    var body: some View {
        VStack(spacing: Theme.Spacing.space4) {
            // Progress indicator at top
            progressSection
                .padding(.top, Theme.Spacing.space4)

            // Current stretch display
            if let stretch = sessionManager.currentStretch,
               let region = sessionManager.currentRegion {
                currentStretchSection(stretch: stretch, region: region)
            }

            // Segment indicator
            segmentIndicator

            // Timer
            timerSection

            Spacer()

            // Controls
            controlsSection
        }
        .padding(.horizontal, Theme.Spacing.space4)
        .padding(.bottom, Theme.Spacing.space4)
    }

    // MARK: - Progress Section

    @ViewBuilder
    private var progressSection: some View {
        VStack(spacing: Theme.Spacing.space2) {
            Text("Stretch \(sessionManager.currentStretchIndex + 1) of \(sessionManager.totalStretches)")
                .font(.subheadline)
                .foregroundColor(Theme.textSecondary)

            // Progress dots
            HStack(spacing: Theme.Spacing.space1) {
                ForEach(0..<sessionManager.totalStretches, id: \.self) { index in
                    Circle()
                        .fill(dotColor(for: index))
                        .frame(width: Theme.Dimensions.dotMD, height: Theme.Dimensions.dotMD)
                }
            }
        }
    }

    private func dotColor(for index: Int) -> Color {
        if index < sessionManager.currentStretchIndex {
            // Completed
            let completed = sessionManager.completedStretches[safe: index]
            if let completed = completed, completed.skippedSegments == 2 {
                return Theme.neutral
            }
            return Theme.stretch
        } else if index == sessionManager.currentStretchIndex {
            // Current
            return Theme.stretch
        } else {
            // Pending
            return Color.white.opacity(0.06)
        }
    }

    // MARK: - Current Stretch Section

    @ViewBuilder
    private func currentStretchSection(stretch: StretchDefinition, region: BodyRegion) -> some View {
        VStack(spacing: Theme.Spacing.space2) {
            // Show stretch image if available, otherwise show icon
            if let imagePath = stretch.image,
               let uiImage = loadStretchImage(imagePath) {
                Image(uiImage: uiImage)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(maxWidth: .infinity, maxHeight: 280)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.md, style: .continuous))
            } else {
                Image(systemName: region.iconName)
                    .font(.system(size: Theme.Typography.iconXXL))
                    .foregroundColor(Theme.stretch)
            }

            Text(stretch.name)
                .font(.title2)
                .fontWeight(.bold)
                .foregroundColor(Theme.textPrimary)
                .multilineTextAlignment(.center)

            Text(region.displayName)
                .font(.subheadline)
                .foregroundColor(Theme.stretch)

            Text(stretch.description)
                .font(.caption)
                .foregroundColor(Theme.textSecondary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal)
        }
    }

    /// Load stretch image from bundle
    /// Image paths are like "back/childs-pose.png", stored in Audio/stretching/
    private func loadStretchImage(_ imagePath: String) -> UIImage? {
        let components = imagePath.components(separatedBy: "/")
        let filename = (components.last ?? imagePath) as NSString
        let filenameWithoutExt = filename.deletingPathExtension
        let ext = filename.pathExtension.isEmpty ? "png" : filename.pathExtension
        let folder = components.count > 1 ? components.dropLast().joined(separator: "/") : ""
        let subdirectory = folder.isEmpty ? "Audio/stretching" : "Audio/stretching/\(folder)"

        guard let url = Bundle.main.url(
            forResource: filenameWithoutExt,
            withExtension: ext,
            subdirectory: subdirectory
        ) else {
            return nil
        }

        return UIImage(contentsOfFile: url.path)
    }

    // MARK: - Segment Indicator

    @ViewBuilder
    private var segmentIndicator: some View {
        if let stretch = sessionManager.currentStretch {
            HStack(spacing: Theme.Spacing.space4) {
                // Segment 1
                segmentPill(
                    number: 1,
                    label: stretch.bilateral ? "Left Side" : "First Half",
                    isActive: sessionManager.currentSegment == 1
                )

                // Segment 2
                segmentPill(
                    number: 2,
                    label: stretch.bilateral ? "Right Side" : "Second Half",
                    isActive: sessionManager.currentSegment == 2
                )
            }
        }
    }

    @ViewBuilder
    private func segmentPill(number: Int, label: String, isActive: Bool) -> some View {
        VStack(spacing: 4) {
            Text("Segment \(number)")
                .font(.caption2)
                .foregroundColor(isActive ? Theme.stretch : Theme.textSecondary)

            Text(label)
                .font(.caption)
                .fontWeight(isActive ? .semibold : .regular)
                .foregroundColor(isActive ? Theme.textPrimary : Theme.textSecondary)
        }
        .padding(.horizontal, Theme.Spacing.space4)
        .padding(.vertical, Theme.Spacing.space2)
        .background(
            isActive
                ? AnyShapeStyle(.ultraThinMaterial)
                : AnyShapeStyle(Color.white.opacity(0.06))
        )
        .background(isActive ? Theme.stretch.opacity(0.2) : Color.clear)
        .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous)
                .stroke(isActive ? Theme.stretch : Color.clear, lineWidth: 1)
        )
    }

    // MARK: - Timer Section

    @ViewBuilder
    private var timerSection: some View {
        VStack(spacing: Theme.Spacing.space2) {
            Text(formattedTime)
                .font(.system(size: 34, weight: .bold, design: .rounded))
                .foregroundColor(Theme.textPrimary)
                .monospacedDigit()
                .auroraGlow(Theme.stretch)
                .accessibilityLabel(timerAccessibilityLabel)

            if sessionManager.status == .paused {
                Text("PAUSED")
                    .font(.headline)
                    .foregroundColor(Theme.warning)
            }

            // Progress bar for current segment
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(Color.white.opacity(0.06))

                    Capsule()
                        .fill(Theme.stretch)
                        .frame(width: geometry.size.width * progressFraction)
                }
            }
            .frame(height: Theme.Dimensions.progressBarHeight)
            .padding(.horizontal, Theme.Spacing.space7)
            .accessibilityHidden(true)
        }
    }

    private var formattedTime: String {
        let totalSeconds = Int(sessionManager.segmentRemaining)
        let minutes = totalSeconds / 60
        let seconds = totalSeconds % 60
        return String(format: "%d:%02d", minutes, seconds)
    }

    private var progressFraction: Double {
        let total = sessionManager.segmentDuration
        guard total > 0 else { return 0 }
        return sessionManager.segmentElapsed / total
    }

    // MARK: - Controls Section

    @ViewBuilder
    private var controlsSection: some View {
        VStack(spacing: Theme.Spacing.space4) {
            HStack(spacing: Theme.Spacing.space7) {
                // Skip Segment button
                Button(action: { sessionManager.skipSegment() }) {
                    Image(systemName: "forward.fill")
                        .font(.title3)
                        .foregroundColor(Theme.textSecondary)
                }
                .buttonStyle(GlassCircleButtonStyle(size: 56))
                .accessibilityLabel("Skip Segment")
                .accessibilityHint("Skip to the next segment of this stretch")

                // Pause/Resume button
                Button(action: {
                    if sessionManager.status == .paused {
                        sessionManager.resume()
                    } else {
                        sessionManager.pause()
                    }
                }) {
                    Image(systemName: sessionManager.status == .paused ? "play.fill" : "pause.fill")
                        .font(.title)
                        .foregroundColor(Theme.textOnAccent)
                }
                .buttonStyle(GlassPrimaryCircleButtonStyle(size: 80, color: Theme.stretch))
                .accessibilityLabel(sessionManager.status == .paused ? "Resume" : "Pause")
                .accessibilityHint(sessionManager.status == .paused ? "Resume the stretching session" : "Pause the stretching session")

                // End button
                Button(action: onCancel) {
                    Image(systemName: "stop.fill")
                        .font(.title3)
                        .foregroundColor(Theme.textSecondary)
                }
                .buttonStyle(GlassCircleButtonStyle(size: 56))
                .accessibilityLabel("End Session")
                .accessibilityHint("End the stretching session early")
            }

            // Play full instructions button
            Button(action: { sessionManager.playFullNarration() }) {
                HStack(spacing: Theme.Spacing.space2) {
                    Image(systemName: "speaker.wave.2.fill")
                        .font(.subheadline)
                    Text("Play Instructions")
                        .font(.subheadline)
                }
            }
            .buttonStyle(GlassSecondaryButtonStyle())
            .accessibilityLabel("Play Instructions")
            .accessibilityHint("Play the full narration for this stretch")

            // Skip entire stretch button
            Button(action: { sessionManager.skipStretch() }) {
                Text("Skip Entire Stretch")
                    .font(.subheadline)
            }
            .buttonStyle(GlassSecondaryButtonStyle())
            .accessibilityLabel("Skip Entire Stretch")
            .accessibilityHint("Skip both segments of this stretch and move to the next one")
        }
    }

    // MARK: - Accessibility Helpers

    private var timerAccessibilityLabel: String {
        let totalSeconds = Int(sessionManager.segmentRemaining)
        let minutes = totalSeconds / 60
        let seconds = totalSeconds % 60
        if minutes > 0 {
            return "\(minutes) minute\(minutes == 1 ? "" : "s") and \(seconds) second\(seconds == 1 ? "" : "s") remaining"
        } else {
            return "\(seconds) second\(seconds == 1 ? "" : "s") remaining"
        }
    }
}
