import SwiftUI
import BradOSCore

/// A badge displaying workout status with appropriate color
struct StatusBadge: View {
    let status: WorkoutStatus

    var body: some View {
        Text(status.rawValue.capitalized.replacingOccurrences(of: "_", with: " "))
            .font(.caption)
            .fontWeight(.medium)
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .frame(height: 24)
            .background(statusColor.opacity(0.2))
            .foregroundColor(statusColor)
            .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))
    }

    private var statusColor: Color {
        switch status {
        case .pending:
            return Theme.info
        case .inProgress:
            return Theme.warning
        case .completed:
            return Theme.success
        case .skipped:
            return Theme.neutral
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
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .frame(height: 24)
            .background(color.opacity(0.2))
            .foregroundColor(color)
            .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))
    }
}

#Preview {
    VStack(spacing: Theme.Spacing.space4) {
        StatusBadge(status: .pending)
        StatusBadge(status: .inProgress)
        StatusBadge(status: .completed)
        StatusBadge(status: .skipped)

        GenericBadge(text: "Week 2", color: Theme.interactivePrimary)
        GenericBadge(text: "Deload", color: Theme.warning)
    }
    .padding()
    .background(AuroraBackground())
    .preferredColorScheme(.dark)
}
