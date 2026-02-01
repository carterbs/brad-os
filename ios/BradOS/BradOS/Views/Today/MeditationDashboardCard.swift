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
        VStack(alignment: .leading, spacing: Theme.Spacing.md) {
            HStack {
                Image(systemName: "brain.head.profile")
                    .font(.system(size: Theme.Typography.iconXS))
                    .foregroundColor(Theme.meditation)
                Text("Meditation")
                    .font(.headline)
                    .foregroundColor(Theme.textPrimary)
                Spacer()
            }

            Text("Loading meditation data...")
                .font(.subheadline)
                .foregroundColor(Theme.textSecondary)
        }
        .padding(Theme.Spacing.md)
        .background(Theme.meditation.opacity(0.1))
        .cornerRadius(Theme.CornerRadius.lg)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.CornerRadius.lg)
                .stroke(Theme.meditation.opacity(0.5), lineWidth: 1)
        )
    }

    // MARK: - Meditation Content

    private var meditationContent: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.md) {
            // Header
            HStack {
                Image(systemName: "brain.head.profile")
                    .font(.system(size: Theme.Typography.iconXS))
                    .foregroundColor(Theme.meditation)
                Text("Meditation")
                    .font(.headline)
                    .foregroundColor(Theme.textPrimary)
                Spacer()
            }

            // Status message and duration
            if let session = lastSession {
                VStack(alignment: .leading, spacing: 4) {
                    Text(statusMessage)
                        .font(.subheadline)
                        .foregroundColor(Theme.textSecondary)

                    let minutes = session.actualDurationSeconds / 60
                    Text("Last session: \(minutes) min")
                        .font(.caption)
                        .foregroundColor(Theme.textSecondary)
                }
            } else {
                Text("No meditation sessions yet")
                    .font(.subheadline)
                    .foregroundColor(Theme.textSecondary)
            }

            // Action button
            HStack {
                Spacer()
                actionButton
            }
        }
        .padding(Theme.Spacing.md)
        .background(Theme.meditation.opacity(0.1))
        .cornerRadius(Theme.CornerRadius.lg)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.CornerRadius.lg)
                .stroke(Theme.meditation.opacity(0.5), lineWidth: 1)
        )
    }

    // MARK: - Helpers

    private var actionButton: some View {
        HStack(spacing: 4) {
            Text("Meditate")
                .font(.subheadline)
                .fontWeight(.medium)
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
    .background(Theme.background)
    .preferredColorScheme(.dark)
}

#Preview("No Sessions") {
    MeditationDashboardCard(
        lastSession: nil,
        isLoading: false,
        onTap: {}
    )
    .padding()
    .background(Theme.background)
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
    .background(Theme.background)
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
    .background(Theme.background)
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
    .background(Theme.background)
    .preferredColorScheme(.dark)
}
