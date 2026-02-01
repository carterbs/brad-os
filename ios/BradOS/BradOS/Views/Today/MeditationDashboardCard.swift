import SwiftUI
import BradOSCore

/// Dashboard card displaying meditation status with duration
struct MeditationDashboardCard: View {
    let lastSession: MeditationSession?
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
            meditationContent
        }
    }

    // MARK: - Loading State

    private var loadingState: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            cardHeader

            Text("Loading meditation data...")
                .font(.subheadline)
                .foregroundColor(Theme.textSecondary)
        }
        .glassCard()
    }

    // MARK: - Meditation Content

    private var meditationContent: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            // Header
            cardHeader

            // Status message and duration
            if let session = lastSession {
                VStack(alignment: .leading, spacing: Theme.Spacing.space1) {
                    Text(statusMessage)
                        .font(.subheadline)
                        .foregroundColor(Theme.textSecondary)

                    let minutes = session.actualDurationSeconds / 60
                    Text("Last session: \(minutes) min")
                        .font(.caption)
                        .foregroundColor(Theme.textSecondary)
                        .monospacedDigit()
                }
            } else {
                Text("No meditation sessions yet")
                    .font(.subheadline)
                    .foregroundColor(Theme.textSecondary)
            }

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
            Text("Meditation")
                .font(.title3)
                .foregroundColor(Theme.textPrimary)
            Spacer()
        }
    }

    private var cardHeaderIcon: some View {
        Image(systemName: "brain.head.profile")
            .font(.system(size: Theme.Typography.cardHeaderIcon))
            .foregroundColor(Theme.meditation)
            .frame(width: Theme.Dimensions.iconFrameMD, height: Theme.Dimensions.iconFrameMD)
            .background(Theme.meditation.opacity(0.12))
            .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))
    }

    // MARK: - Helpers

    private var actionLink: some View {
        HStack(spacing: Theme.Spacing.space1) {
            Text("Meditate")
                .font(.callout.weight(.semibold))
            Image(systemName: "chevron.right")
                .font(.caption)
        }
        .foregroundColor(Theme.meditation)
    }

    private var statusMessage: String {
        guard let session = lastSession else {
            return "No meditation sessions yet"
        }

        let daysSince = daysSinceDate(session.completedAt)

        switch daysSince {
        case 0:
            return "Meditated today!"
        case 1:
            return "Last meditated yesterday"
        default:
            return "\(daysSince) days ago"
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
    MeditationDashboardCard(
        lastSession: nil,
        isLoading: true,
        onTap: {}
    )
    .padding()
    .background(AuroraBackground().ignoresSafeArea())
    .preferredColorScheme(.dark)
}

#Preview("No Sessions") {
    MeditationDashboardCard(
        lastSession: nil,
        isLoading: false,
        onTap: {}
    )
    .padding()
    .background(AuroraBackground().ignoresSafeArea())
    .preferredColorScheme(.dark)
}

#Preview("Meditated Today") {
    MeditationDashboardCard(
        lastSession: MeditationSession(
            id: "1",
            completedAt: Date(),
            sessionType: "basic-breathing",
            plannedDurationSeconds: 600,
            actualDurationSeconds: 600,
            completedFully: true
        ),
        isLoading: false,
        onTap: {}
    )
    .padding()
    .background(AuroraBackground().ignoresSafeArea())
    .preferredColorScheme(.dark)
}

#Preview("Meditated Yesterday") {
    MeditationDashboardCard(
        lastSession: MeditationSession(
            id: "1",
            completedAt: Calendar.current.date(byAdding: .day, value: -1, to: Date())!,
            sessionType: "basic-breathing",
            plannedDurationSeconds: 600,
            actualDurationSeconds: 600,
            completedFully: true
        ),
        isLoading: false,
        onTap: {}
    )
    .padding()
    .background(AuroraBackground().ignoresSafeArea())
    .preferredColorScheme(.dark)
}

#Preview("Multiple Days Ago") {
    MeditationDashboardCard(
        lastSession: MeditationSession(
            id: "1",
            completedAt: Calendar.current.date(byAdding: .day, value: -3, to: Date())!,
            sessionType: "basic-breathing",
            plannedDurationSeconds: 300,
            actualDurationSeconds: 300,
            completedFully: true
        ),
        isLoading: false,
        onTap: {}
    )
    .padding()
    .background(AuroraBackground().ignoresSafeArea())
    .preferredColorScheme(.dark)
}
