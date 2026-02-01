import SwiftUI
import BradOSCore

/// A badge displaying workout status with appropriate color
struct StatusBadge: View {
    let status: WorkoutStatus

    var body: some View {
        Text(status.rawValue.capitalized.replacingOccurrences(of: "_", with: " "))
            .font(.caption)
            .fontWeight(.medium)
            .padding(.horizontal, Theme.Spacing.sm)
            .padding(.vertical, Theme.Spacing.xs)
            .background(backgroundColor)
            .foregroundColor(Theme.textOnDark)
            .cornerRadius(Theme.CornerRadius.sm)
    }

    private var backgroundColor: Color {
        switch status {
        case .pending:
            return Theme.statusScheduled
        case .inProgress:
            return Theme.statusInProgress
        case .completed:
            return Theme.statusCompleted
        case .skipped:
            return Theme.statusSkipped
        }
    }
}

/// Generic status badge for any text and color
struct GenericBadge: View {
    let text: String
    let color: Color

    var body: some View {
        Text(text)
            .font(.caption)
            .fontWeight(.medium)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(color.opacity(0.2))
            .foregroundColor(color)
            .cornerRadius(Theme.CornerRadius.sm)
    }
}

#Preview {
    VStack(spacing: 16) {
        StatusBadge(status: .pending)
        StatusBadge(status: .inProgress)
        StatusBadge(status: .completed)
        StatusBadge(status: .skipped)

        GenericBadge(text: "Week 2", color: Theme.accent)
        GenericBadge(text: "Deload", color: Theme.warning)
    }
    .padding()
    .background(Theme.background)
    .preferredColorScheme(.dark)
}
