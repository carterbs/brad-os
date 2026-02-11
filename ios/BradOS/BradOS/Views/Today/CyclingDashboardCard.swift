import SwiftUI
import BradOSCore

/// Dashboard card displaying next cycling session with proper states
struct CyclingDashboardCard: View {
    let nextSession: WeeklySessionModel?
    let weekProgress: String?
    let isLoading: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            cardContent
        }
        .buttonStyle(PlainButtonStyle())
        .disabled(isLoading && nextSession == nil)
    }

    @ViewBuilder
    private var cardContent: some View {
        if isLoading && nextSession == nil {
            loadingState
        } else if let session = nextSession {
            sessionContent(session)
        } else {
            noSessionState
        }
    }

    // MARK: - Loading State

    private var loadingState: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            cardHeader(iconColor: Theme.cycling)

            Text("Loading cycling session...")
                .font(.subheadline)
                .foregroundColor(Theme.textSecondary)
        }
        .glassCard()
    }

    // MARK: - No Session State

    private var noSessionState: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            cardHeader(iconColor: Theme.textSecondary)

            Text("No training block configured.")
                .font(.subheadline)
                .foregroundColor(Theme.textSecondary)
        }
        .glassCard()
    }

    // MARK: - Session Content

    @ViewBuilder
    private func sessionContent(_ session: WeeklySessionModel) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            // Header with badge
            HStack {
                cardHeaderIcon(color: sessionColor(session.sessionTypeEnum))
                Text("Cycling")
                    .font(.title3)
                    .foregroundColor(Theme.textPrimary)
                Spacer()
                if let progress = weekProgress {
                    weekBadge(progress)
                }
            }

            // Session type and details
            VStack(alignment: .leading, spacing: Theme.Spacing.space1) {
                Text(session.displayName)
                    .font(.title3)
                    .fontWeight(.medium)
                    .foregroundColor(Theme.textPrimary)

                HStack(spacing: 4) {
                    Text("\(session.suggestedDurationMinutes) min")
                        .font(.subheadline)
                        .foregroundColor(Theme.textSecondary)
                        .monospacedDigit()

                    if !session.pelotonClassTypes.isEmpty {
                        Text("\u{2022}")
                            .foregroundColor(Theme.textTertiary)
                        Text(classTypesString(session.pelotonClassTypes))
                            .font(.subheadline)
                            .foregroundColor(Theme.textSecondary)
                    }
                }
            }

            // Action link
            HStack {
                Spacer()
                actionLink
            }
        }
        .glassCard()
        .auroraGlow(sessionColor(session.sessionTypeEnum))
    }

    // MARK: - Card Header

    private func cardHeader(iconColor: Color) -> some View {
        HStack {
            cardHeaderIcon(color: iconColor)
            Text("Cycling")
                .font(.title3)
                .foregroundColor(Theme.textPrimary)
            Spacer()
        }
    }

    private func cardHeaderIcon(color: Color) -> some View {
        Image(systemName: "figure.outdoor.cycle")
            .font(.system(size: Theme.Typography.cardHeaderIcon))
            .foregroundColor(color)
            .frame(width: Theme.Dimensions.iconFrameMD, height: Theme.Dimensions.iconFrameMD)
            .background(color.opacity(0.12))
            .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))
    }

    // MARK: - Helpers

    @ViewBuilder
    private func weekBadge(_ progress: String) -> some View {
        Text(progress)
            .font(.caption)
            .fontWeight(.medium)
            .padding(.horizontal, Theme.Spacing.space2)
            .padding(.vertical, Theme.Spacing.space1)
            .background(Theme.neutral.opacity(0.2))
            .foregroundColor(Theme.neutral)
            .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))
    }

    private var actionLink: some View {
        HStack(spacing: Theme.Spacing.space1) {
            Text("View Session")
                .font(.callout.weight(.semibold))
            Image(systemName: "chevron.right")
                .font(.caption)
        }
        .foregroundColor(Theme.cycling)
    }

    private func sessionColor(_ sessionType: SessionType) -> Color {
        switch sessionType {
        case .vo2max:
            return Theme.destructive
        case .threshold:
            return Theme.warning
        case .endurance, .fun:
            return Theme.cycling
        case .tempo:
            return Theme.interactiveSecondary
        case .recovery:
            return Theme.info
        case .off:
            return Theme.neutral
        }
    }

    private func classTypesString(_ types: [String]) -> String {
        if types.count == 1 {
            return types[0]
        } else if types.count == 2 {
            return types.joined(separator: " or ")
        } else {
            let firstTwo = types.prefix(2).joined(separator: ", ")
            return "\(firstTwo), or \(types[2])"
        }
    }
}

// MARK: - Previews

#Preview("Loading") {
    CyclingDashboardCard(
        nextSession: nil,
        weekProgress: nil,
        isLoading: true,
        onTap: {}
    )
    .padding()
    .background(AuroraBackground().ignoresSafeArea())
    .preferredColorScheme(.dark)
}

#Preview("No Session") {
    CyclingDashboardCard(
        nextSession: nil,
        weekProgress: nil,
        isLoading: false,
        onTap: {}
    )
    .padding()
    .background(AuroraBackground().ignoresSafeArea())
    .preferredColorScheme(.dark)
}

#Preview("VO2 Max") {
    CyclingDashboardCard(
        nextSession: WeeklySessionModel(
            order: 1,
            sessionType: "vo2max",
            pelotonClassTypes: ["Power Zone Max", "HIIT"],
            suggestedDurationMinutes: 45,
            description: "High-intensity intervals at 120% FTP",
            preferredDay: 2
        ),
        weekProgress: "2 of 4",
        isLoading: false,
        onTap: {}
    )
    .padding()
    .background(AuroraBackground().ignoresSafeArea())
    .preferredColorScheme(.dark)
}

#Preview("Threshold") {
    CyclingDashboardCard(
        nextSession: WeeklySessionModel(
            order: 2,
            sessionType: "threshold",
            pelotonClassTypes: ["Power Zone", "Climb"],
            suggestedDurationMinutes: 60,
            description: "Sweet spot intervals at 88-93% FTP",
            preferredDay: 4
        ),
        weekProgress: "3 of 4",
        isLoading: false,
        onTap: {}
    )
    .padding()
    .background(AuroraBackground().ignoresSafeArea())
    .preferredColorScheme(.dark)
}

#Preview("Endurance") {
    CyclingDashboardCard(
        nextSession: WeeklySessionModel(
            order: 3,
            sessionType: "endurance",
            pelotonClassTypes: ["Power Zone Endurance", "Scenic"],
            suggestedDurationMinutes: 75,
            description: "Easy aerobic ride at 65-75% FTP",
            preferredDay: 6
        ),
        weekProgress: "1 of 4",
        isLoading: false,
        onTap: {}
    )
    .padding()
    .background(AuroraBackground().ignoresSafeArea())
    .preferredColorScheme(.dark)
}

#Preview("Recovery") {
    CyclingDashboardCard(
        nextSession: WeeklySessionModel(
            order: 4,
            sessionType: "recovery",
            pelotonClassTypes: ["Low Impact", "Recovery"],
            suggestedDurationMinutes: 30,
            description: "Active recovery at <60% FTP",
            preferredDay: 1
        ),
        weekProgress: "4 of 4",
        isLoading: false,
        onTap: {}
    )
    .padding()
    .background(AuroraBackground().ignoresSafeArea())
    .preferredColorScheme(.dark)
}
