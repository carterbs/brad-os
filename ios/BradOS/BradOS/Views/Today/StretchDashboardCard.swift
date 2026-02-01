import SwiftUI
import BradOSCore

/// Dashboard card displaying stretch status with urgency states
struct StretchDashboardCard: View {
    let lastSession: StretchSession?
    let isLoading: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            cardContent
        }
        .buttonStyle(PlainButtonStyle())
    }

    @ViewBuilder
    private var cardContent: some View {
        if isLoading && lastSession == nil {
            loadingState
        } else {
            stretchContent
        }
    }

    // MARK: - Loading State

    private var loadingState: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            cardHeader

            Text("Loading stretch data...")
                .font(.subheadline)
                .foregroundColor(Theme.textSecondary)
        }
        .glassCard()
    }

    // MARK: - Stretch Content

    private var stretchContent: some View {
        let status = getStatusInfo()

        return VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            // Header
            cardHeader

            // Status message
            Text(status.message)
                .font(.subheadline)
                .foregroundColor(status.isUrgent ? Theme.warning : Theme.textSecondary)

            // Action link
            HStack {
                Spacer()
                actionLink
            }
        }
        .glassCard()
    }

    // MARK: - Card Header

    private var cardHeader: some View {
        HStack {
            cardHeaderIcon
            Text("Stretch")
                .font(.title3)
                .foregroundColor(Theme.textPrimary)
            Spacer()
        }
    }

    private var cardHeaderIcon: some View {
        Image(systemName: "figure.flexibility")
            .font(.system(size: Theme.Typography.cardHeaderIcon))
            .foregroundColor(Theme.stretch)
            .frame(width: Theme.Dimensions.iconFrameMD, height: Theme.Dimensions.iconFrameMD)
            .background(Theme.stretch.opacity(0.12))
            .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))
    }

    // MARK: - Helpers

    private var actionLink: some View {
        HStack(spacing: Theme.Spacing.space1) {
            Text("Stretch Now")
                .font(.callout.weight(.semibold))
            Image(systemName: "chevron.right")
                .font(.caption)
        }
        .foregroundColor(Theme.stretch)
    }

    private func getStatusInfo() -> (message: String, isUrgent: Bool) {
        guard let session = lastSession else {
            return ("No stretch sessions yet", false)
        }

        let daysSince = daysSinceDate(session.completedAt)

        switch daysSince {
        case 0:
            return ("Stretched today!", false)
        case 1:
            return ("Last stretched yesterday", false)
        case 2:
            return ("2 days ago", false)
        default:
            return ("\(daysSince) days ago - time to stretch!", true)
        }
    }

    private func daysSinceDate(_ date: Date) -> Int {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: Date())
        let sessionDate = calendar.startOfDay(for: date)
        let components = calendar.dateComponents([.day], from: sessionDate, to: today)
        return components.day ?? 0
    }
}

// MARK: - Previews

#Preview("Loading") {
    StretchDashboardCard(
        lastSession: nil,
        isLoading: true,
        onTap: {}
    )
    .padding()
    .background(AuroraBackground())
    .preferredColorScheme(.dark)
}

#Preview("No Sessions") {
    StretchDashboardCard(
        lastSession: nil,
        isLoading: false,
        onTap: {}
    )
    .padding()
    .background(AuroraBackground())
    .preferredColorScheme(.dark)
}

#Preview("Stretched Today") {
    StretchDashboardCard(
        lastSession: StretchSession(
            id: "1",
            completedAt: Date(),
            totalDurationSeconds: 480,
            regionsCompleted: 8,
            regionsSkipped: 0,
            stretches: nil
        ),
        isLoading: false,
        onTap: {}
    )
    .padding()
    .background(AuroraBackground())
    .preferredColorScheme(.dark)
}

#Preview("Stretched Yesterday") {
    StretchDashboardCard(
        lastSession: StretchSession(
            id: "1",
            completedAt: Calendar.current.date(byAdding: .day, value: -1, to: Date())!,
            totalDurationSeconds: 480,
            regionsCompleted: 8,
            regionsSkipped: 0,
            stretches: nil
        ),
        isLoading: false,
        onTap: {}
    )
    .padding()
    .background(AuroraBackground())
    .preferredColorScheme(.dark)
}

#Preview("Urgent - 3+ Days") {
    StretchDashboardCard(
        lastSession: StretchSession(
            id: "1",
            completedAt: Calendar.current.date(byAdding: .day, value: -4, to: Date())!,
            totalDurationSeconds: 480,
            regionsCompleted: 8,
            regionsSkipped: 0,
            stretches: nil
        ),
        isLoading: false,
        onTap: {}
    )
    .padding()
    .background(AuroraBackground())
    .preferredColorScheme(.dark)
}
