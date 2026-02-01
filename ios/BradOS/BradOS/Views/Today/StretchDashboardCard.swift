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
        VStack(alignment: .leading, spacing: Theme.Spacing.md) {
            HStack {
                Image(systemName: "figure.flexibility")
                    .font(.system(size: Theme.Typography.iconXS))
                    .foregroundColor(Theme.stretch)
                Text("Stretch")
                    .font(.headline)
                    .foregroundColor(Theme.textPrimary)
                Spacer()
            }

            Text("Loading stretch data...")
                .font(.subheadline)
                .foregroundColor(Theme.textSecondary)
        }
        .padding(Theme.Spacing.md)
        .background(Theme.stretch.opacity(0.1))
        .cornerRadius(Theme.CornerRadius.lg)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.CornerRadius.lg)
                .stroke(Theme.stretch.opacity(0.5), lineWidth: 1)
        )
    }

    // MARK: - Stretch Content

    private var stretchContent: some View {
        let status = getStatusInfo()

        return VStack(alignment: .leading, spacing: Theme.Spacing.md) {
            // Header
            HStack {
                Image(systemName: "figure.flexibility")
                    .font(.system(size: Theme.Typography.iconXS))
                    .foregroundColor(Theme.stretch)
                Text("Stretch")
                    .font(.headline)
                    .foregroundColor(Theme.textPrimary)
                Spacer()
            }

            // Status message
            Text(status.message)
                .font(.subheadline)
                .foregroundColor(status.isUrgent ? Theme.warning : Theme.textSecondary)

            // Action button
            HStack {
                Spacer()
                actionButton
            }
        }
        .padding(Theme.Spacing.md)
        .background(Theme.stretch.opacity(0.1))
        .cornerRadius(Theme.CornerRadius.lg)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.CornerRadius.lg)
                .stroke(status.isUrgent ? Theme.warning : Theme.stretch.opacity(0.5), lineWidth: 1)
        )
    }

    // MARK: - Helpers

    private var actionButton: some View {
        HStack(spacing: 4) {
            Text("Stretch Now")
                .font(.subheadline)
                .fontWeight(.medium)
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
    .background(Theme.background)
    .preferredColorScheme(.dark)
}

#Preview("No Sessions") {
    StretchDashboardCard(
        lastSession: nil,
        isLoading: false,
        onTap: {}
    )
    .padding()
    .background(Theme.background)
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
    .background(Theme.background)
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
    .background(Theme.background)
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
    .background(Theme.background)
    .preferredColorScheme(.dark)
}
