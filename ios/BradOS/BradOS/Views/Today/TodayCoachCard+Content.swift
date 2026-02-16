import SwiftUI

// MARK: - Coach Content & UI Components

extension TodayCoachCard {

    // MARK: - Coach Content

    @ViewBuilder
    func coachContent(_ recommendation: TodayCoachRecommendation) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            // Header with recovery state badge
            HStack {
                cardHeaderIcon(color: recoveryStateColor)
                Text("Today Coach")
                    .font(.title3)
                    .fontWeight(.semibold)
                    .foregroundColor(Theme.textPrimary)
                Spacer()
                recoveryBadge
            }

            // Daily briefing
            Text(recommendation.dailyBriefing)
                .font(.subheadline)
                .foregroundColor(Theme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)

            // Section rows
            coachSectionRows(recommendation)

            // Warnings
            if !recommendation.warnings.isEmpty {
                warningsSection(recommendation.warnings)
            }

            // View details link
            HStack {
                Spacer()
                HStack(spacing: Theme.Spacing.space1) {
                    Text("View Details")
                        .font(.callout.weight(.semibold))
                    Image(systemName: "chevron.right")
                        .font(.caption)
                }
                .foregroundColor(recoveryStateColor)
            }
        }
        .glassCard()
        .auroraGlow(recoveryStateColor)
    }

    @ViewBuilder
    private func coachSectionRows(_ recommendation: TodayCoachRecommendation) -> some View {
        VStack(spacing: Theme.Spacing.space2) {
            coachRecoveryRow(recommendation)
            coachActivityRows(recommendation)
            coachWellnessRows(recommendation)
        }
    }

    @ViewBuilder
    private func coachRecoveryRow(_ rec: TodayCoachRecommendation) -> some View {
        sectionRow(
            icon: "heart.text.square.fill",
            title: "Recovery",
            insight: rec.sections.recovery.insight,
            trailingText: rec.sections.recovery.status.capitalized,
            color: recoveryStatusColor(rec.sections.recovery.statusColor)
        )
    }

    @ViewBuilder
    private func coachActivityRows(_ rec: TodayCoachRecommendation) -> some View {
        if let lifting = rec.sections.lifting {
            sectionRow(
                icon: "dumbbell.fill",
                title: "Lifting",
                insight: lifting.insight,
                trailingText: lifting.workout?.planDayName
                    ?? priorityLabel(lifting.liftingPriority),
                color: Theme.lifting
            )
        }

        if let cycling = rec.sections.cycling {
            sectionRow(
                icon: "figure.outdoor.cycle",
                title: "Cycling",
                insight: cycling.insight,
                trailingText: cycling.session?.sessionType.displayName,
                color: Theme.cycling
            )
        }
    }

    @ViewBuilder
    private func coachWellnessRows(_ rec: TodayCoachRecommendation) -> some View {
        sectionRow(
            icon: "figure.flexibility",
            title: "Stretching",
            insight: rec.sections.stretching.insight,
            trailingText: priorityLabel(
                rec.sections.stretching.stretchPriority
            ),
            color: priorityColor(
                rec.sections.stretching.stretchPriority
            )
        )

        sectionRow(
            icon: "brain.head.profile.fill",
            title: "Meditation",
            insight: rec.sections.meditation.insight,
            trailingText: "\(rec.sections.meditation.suggestedDurationMinutes) min",
            color: Theme.meditation
        )

        if let weight = rec.sections.weight {
            sectionRow(
                icon: "scalemass.fill",
                title: "Weight",
                insight: weight.insight,
                trailingText: nil,
                color: Theme.textSecondary
            )
        }
    }

    // MARK: - Card Header

    func cardHeader(iconColor: Color) -> some View {
        HStack(spacing: Theme.Spacing.space2) {
            cardHeaderIcon(color: iconColor)
            Text("Today Coach")
                .font(.title3)
                .fontWeight(.semibold)
                .foregroundColor(Theme.textPrimary)
            Spacer()
        }
    }

    func cardHeaderIcon(color: Color) -> some View {
        Image(systemName: "brain.fill")
            .font(.system(size: Theme.Typography.cardHeaderIcon))
            .foregroundColor(color)
            .frame(
                width: Theme.Dimensions.iconFrameMD,
                height: Theme.Dimensions.iconFrameMD
            )
            .background(color.opacity(0.12))
            .clipShape(
                RoundedRectangle(
                    cornerRadius: Theme.CornerRadius.sm,
                    style: .continuous
                )
            )
    }

    // MARK: - Recovery Badge

    @ViewBuilder
    var recoveryBadge: some View {
        if let recovery = recovery {
            HStack(spacing: Theme.Spacing.space1) {
                Circle()
                    .fill(recoveryStateColor)
                    .frame(
                        width: Theme.Dimensions.dotMD,
                        height: Theme.Dimensions.dotMD
                    )
                Text(recovery.state.displayName)
                    .font(.caption)
                    .fontWeight(.medium)
            }
            .padding(.horizontal, Theme.Spacing.space2)
            .padding(.vertical, Theme.Spacing.space1)
            .background(recoveryStateColor.opacity(0.2))
            .foregroundColor(recoveryStateColor)
            .clipShape(
                RoundedRectangle(
                    cornerRadius: Theme.CornerRadius.sm,
                    style: .continuous
                )
            )
        }
    }

    // MARK: - Section Row

    func sectionRow(
        icon: String,
        title: String,
        insight: String,
        trailingText: String?,
        color: Color
    ) -> some View {
        HStack(spacing: Theme.Spacing.space3) {
            Image(systemName: icon)
                .font(.system(size: Theme.Typography.listRowIcon))
                .foregroundColor(color)
                .frame(width: Theme.Dimensions.iconFrameSM)

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .foregroundColor(Theme.textPrimary)

                Text(insight)
                    .font(.footnote)
                    .foregroundColor(Theme.textTertiary)
                    .lineLimit(1)
            }

            Spacer()

            if let trailingText = trailingText {
                Text(trailingText)
                    .font(.caption)
                    .fontWeight(.medium)
                    .foregroundColor(color)
            }

            Image(systemName: "chevron.right")
                .font(.system(size: 10))
                .foregroundColor(Theme.textTertiary)
        }
        .padding(.vertical, Theme.Spacing.space2)
    }

    // MARK: - Warnings

    func warningsSection(
        _ warnings: [TodayCoachRecommendation.CoachWarning]
    ) -> some View {
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
                .clipShape(
                    RoundedRectangle(
                        cornerRadius: Theme.CornerRadius.sm,
                        style: .continuous
                    )
                )
            }
        }
    }

    // MARK: - Helpers

    var recoveryStateColor: Color {
        guard let recovery = recovery else { return Theme.textSecondary }
        switch recovery.state {
        case .ready: return Theme.success
        case .moderate: return Theme.warning
        case .recover: return Theme.destructive
        }
    }

    func recoveryStatusColor(_ status: RecoveryStatus) -> Color {
        switch status {
        case .great: return Theme.success
        case .good: return Theme.success
        case .caution: return Theme.warning
        case .warning: return Theme.destructive
        }
    }

    func priorityColor(_ priority: CoachPriority) -> Color {
        switch priority {
        case .high: return Theme.warning
        case .normal: return Theme.textSecondary
        case .low: return Theme.textTertiary
        case .rest: return Theme.info
        case .skip: return Theme.textTertiary
        }
    }

    func priorityLabel(_ priority: CoachPriority) -> String {
        switch priority {
        case .high: return "Priority"
        case .normal: return "Normal"
        case .low: return "Low"
        case .rest: return "Rest"
        case .skip: return "Skip"
        }
    }
}
