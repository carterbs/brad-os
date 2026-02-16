import SwiftUI

// MARK: - Shared Components & Helpers

extension TodayCoachDetailView {

    // MARK: - Shared Components

    func sectionHeader(
        icon: String,
        title: String,
        color: Color
    ) -> some View {
        HStack(spacing: Theme.Spacing.space2) {
            Image(systemName: icon)
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

            Text(title)
                .font(.title3)
                .fontWeight(.semibold)
                .foregroundColor(Theme.textPrimary)
        }
    }

    func priorityBadge(_ priority: CoachPriority) -> some View {
        HStack(spacing: Theme.Spacing.space1) {
            Circle()
                .fill(priorityColor(priority))
                .frame(
                    width: Theme.Dimensions.dotMD,
                    height: Theme.Dimensions.dotMD
                )
            Text(priorityLabel(priority))
                .font(.caption)
                .fontWeight(.medium)
        }
        .padding(.horizontal, Theme.Spacing.space2)
        .padding(.vertical, Theme.Spacing.space1)
        .background(priorityColor(priority).opacity(0.12))
        .foregroundColor(priorityColor(priority))
        .clipShape(
            RoundedRectangle(
                cornerRadius: Theme.CornerRadius.sm,
                style: .continuous
            )
        )
    }

    // MARK: - Helpers

    var recoveryStateColor: Color {
        guard let recovery = recovery else {
            return Theme.interactivePrimary
        }
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
        case .high: return "High Priority"
        case .normal: return "Normal"
        case .low: return "Low Priority"
        case .rest: return "Rest Day"
        case .skip: return "Skip Today"
        }
    }

    func sessionTypeColor(_ type: SessionType) -> Color {
        switch type {
        case .vo2max: return Theme.destructive
        case .threshold: return Theme.warning
        case .endurance: return Theme.info
        case .tempo: return Color.orange
        case .fun: return Theme.success
        case .recovery: return Theme.info
        case .off: return Theme.textSecondary
        }
    }
}
