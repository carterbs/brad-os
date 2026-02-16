import SwiftUI

// MARK: - Coach Recommendation Card

/// Displays the AI coach's training recommendation with Peloton-oriented display
struct CoachRecommendationCard: View {
    let recommendation: CyclingCoachRecommendation
    let ftp: Int?

    private var isFunDay: Bool {
        recommendation.session.sessionType == .fun
    }

    private var isRestDay: Bool {
        recommendation.session.sessionType == .off
    }

    private var hasPelotonClasses: Bool {
        guard let types = recommendation.session.pelotonClassTypes else { return false }
        return !types.isEmpty
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            // Header
            headerSection

            // Special fun day display
            if isFunDay {
                funDaySection
            } else if isRestDay {
                restDaySection
            } else {
                // Regular session display
                regularSessionSection
            }

            // Peloton tip
            if let tip = recommendation.session.pelotonTip, !tip.isEmpty {
                pelotonTipSection(tip)
            }

            // Reasoning
            reasoningSection

            // Coaching tips
            if let tips = recommendation.coachingTips, !tips.isEmpty {
                coachingTipsSection(tips)
            }

            // Warnings
            if let warnings = recommendation.warnings, !warnings.isEmpty {
                warningsSection(warnings)
            }

            // FTP test suggestion
            if recommendation.suggestFTPTest {
                ftpTestSuggestion
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .glassCard()
    }

    // MARK: - Header

    private var headerSection: some View {
        HStack(spacing: Theme.Spacing.space2) {
            Image(systemName: "figure.outdoor.cycle")
                .font(.system(size: Theme.Typography.cardHeaderIcon))
                .foregroundColor(Theme.interactivePrimary)
                .frame(width: Theme.Dimensions.iconFrameMD, height: Theme.Dimensions.iconFrameMD)
                .background(Theme.interactivePrimary.opacity(0.12))
                .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))

            Text("AI Coach")
                .font(.title3)
                .fontWeight(.semibold)
                .foregroundColor(Theme.textPrimary)

            Spacer()

            Text("Today")
                .font(.caption)
                .foregroundStyle(Theme.textSecondary)
        }
    }

    // MARK: - Fun Day Section

    private var funDaySection: some View {
        VStack(spacing: Theme.Spacing.space4) {
            // Fun day hero
            VStack(spacing: Theme.Spacing.space3) {
                Image(systemName: "face.smiling.fill")
                    .font(.system(size: 48))
                    .foregroundStyle(Theme.success)

                Text("Enjoy Your Ride!")
                    .font(.title2)
                    .fontWeight(.bold)
                    .foregroundColor(Theme.textPrimary)

                Text("No structure today - just get out and have fun!")
                    .font(.subheadline)
                    .foregroundStyle(Theme.textSecondary)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, Theme.Spacing.space4)

            // Duration and TSS
            HStack(spacing: Theme.Spacing.space6) {
                VStack(spacing: 4) {
                    Text("\(recommendation.session.durationMinutes)")
                        .font(.system(size: 28, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(Theme.textPrimary)
                    Text("minutes")
                        .font(.caption)
                        .foregroundStyle(Theme.textSecondary)
                }

                VStack(spacing: 4) {
                    Text("\(recommendation.session.targetTSS.min)-\(recommendation.session.targetTSS.max)")
                        .font(.system(size: 28, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(Theme.textPrimary)
                    Text("TSS")
                        .font(.caption)
                        .foregroundStyle(Theme.textSecondary)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(Theme.Spacing.space3)
            .background(Color.white.opacity(0.04))
            .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))

            // Peloton class suggestions for fun day
            if hasPelotonClasses {
                pelotonAlternatives
            }
        }
    }

    // MARK: - Rest Day Section

    private var restDaySection: some View {
        VStack(spacing: Theme.Spacing.space4) {
            VStack(spacing: Theme.Spacing.space3) {
                Image(systemName: "moon.fill")
                    .font(.system(size: 48))
                    .foregroundStyle(Theme.info)

                Text("Rest Day")
                    .font(.title2)
                    .fontWeight(.bold)
                    .foregroundColor(Theme.textPrimary)

                Text("Your body needs recovery. Take the day off!")
                    .font(.subheadline)
                    .foregroundStyle(Theme.textSecondary)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, Theme.Spacing.space4)
        }
    }

    // MARK: - Regular Session Section

    private var regularSessionSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            // Session type prominently displayed
            sessionOverview

            // Peloton class types
            if hasPelotonClasses {
                pelotonAlternatives
            }

            // Target TSS
            targetMetrics
        }
    }

    // MARK: - Session Overview

    private var sessionOverview: some View {
        HStack(spacing: Theme.Spacing.space3) {
            // Session type icon
            Image(systemName: recommendation.session.sessionType.systemImage)
                .font(.title2)
                .foregroundStyle(sessionTypeColor)

            VStack(alignment: .leading, spacing: 2) {
                Text(recommendation.session.sessionType.displayName)
                    .font(.headline)
                    .foregroundColor(Theme.textPrimary)

                if hasPelotonClasses, let primary = recommendation.session.pelotonClassTypes?.first {
                    Text(primary)
                        .font(.subheadline)
                        .foregroundStyle(Theme.textSecondary)
                }
            }

            Spacer()

            // Duration
            VStack(alignment: .trailing, spacing: 2) {
                Text("\(recommendation.session.durationMinutes)")
                    .font(.system(size: 28, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(Theme.textPrimary)
                Text("minutes")
                    .font(.caption)
                    .foregroundStyle(Theme.textSecondary)
            }
        }
    }

    // MARK: - Peloton Alternatives

    private var pelotonAlternatives: some View {
        Group {
            if let types = recommendation.session.pelotonClassTypes, types.count > 1 {
                HStack(alignment: .top, spacing: Theme.Spacing.space2) {
                    Text("Also works:")
                        .font(.caption)
                        .foregroundStyle(Theme.textTertiary)

                    Text(types.dropFirst().joined(separator: ", "))
                        .font(.caption)
                        .foregroundStyle(Theme.textSecondary)
                }
            }
        }
    }

    // MARK: - Peloton Tip Section

    private func pelotonTipSection(_ tip: String) -> some View {
        HStack(alignment: .top, spacing: Theme.Spacing.space2) {
            Image(systemName: "lightbulb.fill")
                .font(.caption)
                .foregroundStyle(Theme.interactivePrimary)
            Text(tip)
                .font(.footnote)
                .foregroundStyle(Theme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(Theme.Spacing.space3)
        .background(Theme.interactivePrimary.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))
    }

    // MARK: - Target Metrics

    private var targetMetrics: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space2) {
            // Target zones
            HStack {
                Text("Zones:")
                    .font(.subheadline)
                    .foregroundStyle(Theme.textSecondary)
                Text(recommendation.session.targetZones)
                    .font(.subheadline)
                    .foregroundStyle(Theme.textPrimary)
            }

            // Target TSS
            HStack {
                Text("Target TSS:")
                    .font(.subheadline)
                    .foregroundStyle(Theme.textSecondary)
                Text("\(recommendation.session.targetTSS.min)-\(recommendation.session.targetTSS.max)")
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .monospacedDigit()
                    .foregroundStyle(Theme.textPrimary)
            }
        }
    }

    // MARK: - Reasoning Section

    private var reasoningSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space1) {
            Text("Why this session?")
                .font(.subheadline)
                .fontWeight(.semibold)
                .foregroundStyle(Theme.textPrimary)

            Text(recommendation.reasoning)
                .font(.footnote)
                .foregroundStyle(Theme.textSecondary)
                .lineLimit(nil)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    // MARK: - Coaching Tips Section

    private func coachingTipsSection(_ tips: [String]) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space2) {
            Text("Coaching Tips")
                .font(.subheadline)
                .fontWeight(.semibold)
                .foregroundStyle(Theme.textPrimary)

            ForEach(tips, id: \.self) { tip in
                HStack(alignment: .top, spacing: Theme.Spacing.space2) {
                    Image(systemName: "lightbulb.fill")
                        .font(.caption)
                        .foregroundStyle(Theme.warning)
                    Text(tip)
                        .font(.footnote)
                        .foregroundStyle(Theme.textSecondary)
                }
            }
        }
    }

    // MARK: - Warnings Section

    private func warningsSection(_ warnings: [CyclingCoachRecommendation.CoachWarning]) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space2) {
            ForEach(warnings, id: \.type) { warning in
                HStack(alignment: .top, spacing: Theme.Spacing.space2) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.caption)
                        .foregroundStyle(Theme.warning)
                    Text(warning.message)
                        .font(.footnote)
                        .foregroundStyle(Theme.warning)
                }
                .padding(Theme.Spacing.space2)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Theme.warning.opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))
            }
        }
    }

    // MARK: - FTP Test Suggestion

    private var ftpTestSuggestion: some View {
        HStack(spacing: Theme.Spacing.space2) {
            Image(systemName: "chart.bar.fill")
                .font(.caption)
                .foregroundStyle(Theme.info)
            Text("Consider scheduling an FTP test this week")
                .font(.footnote)
                .foregroundStyle(Theme.info)
            Spacer()
        }
        .padding(Theme.Spacing.space2)
        .background(Theme.info.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))
    }

    // MARK: - Helpers

    private var sessionTypeColor: Color {
        switch recommendation.session.sessionType {
        case .vo2max:
            return Theme.destructive
        case .threshold:
            return Theme.warning
        case .endurance:
            return Theme.info
        case .tempo:
            return Color.orange
        case .fun:
            return Theme.success
        case .recovery:
            return Theme.info
        case .off:
            return Theme.textSecondary
        }
    }
}
