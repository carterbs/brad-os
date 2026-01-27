import SwiftUI
import BradOSCore

/// A card displaying an activity type for the Activities page
struct ActivityCard: View {
    let activityType: ActivityType
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: Theme.Spacing.md) {
                Image(systemName: activityType.iconName)
                    .font(.system(size: 40))
                    .foregroundColor(activityType.color)

                Text(activityType.displayName)
                    .font(.headline)
                    .foregroundColor(Theme.textPrimary)
            }
            .frame(maxWidth: .infinity, minHeight: 100)
            .padding(Theme.Spacing.lg)
            .background(Theme.backgroundSecondary)
            .cornerRadius(Theme.CornerRadius.lg)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.CornerRadius.lg)
                    .stroke(Theme.border, lineWidth: 1)
            )
        }
        .buttonStyle(PlainButtonStyle())
    }
}

/// A smaller activity card for dashboard quick access
struct ActivityQuickCard: View {
    let title: String
    let subtitle: String?
    let iconName: String
    let color: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: Theme.Spacing.md) {
                Image(systemName: iconName)
                    .font(.system(size: 24))
                    .foregroundColor(color)
                    .frame(width: 40)

                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.subheadline)
                        .fontWeight(.medium)
                        .foregroundColor(Theme.textPrimary)

                    if let subtitle = subtitle {
                        Text(subtitle)
                            .font(.caption)
                            .foregroundColor(Theme.textSecondary)
                    }
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundColor(Theme.textSecondary)
            }
            .padding(Theme.Spacing.md)
            .background(Theme.backgroundSecondary)
            .cornerRadius(Theme.CornerRadius.md)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.CornerRadius.md)
                    .stroke(Theme.border, lineWidth: 1)
            )
        }
        .buttonStyle(PlainButtonStyle())
    }
}

#Preview {
    VStack(spacing: 16) {
        ActivityCard(activityType: .workout) {}
        ActivityCard(activityType: .stretch) {}
        ActivityCard(activityType: .meditation) {}

        ActivityQuickCard(
            title: "Today's Workout",
            subtitle: "Push Day - 5 exercises",
            iconName: "dumbbell.fill",
            color: Theme.lifting
        ) {}

        ActivityQuickCard(
            title: "Stretch",
            subtitle: "Last: Yesterday",
            iconName: "figure.flexibility",
            color: Theme.stretch
        ) {}
    }
    .padding()
    .background(Theme.background)
    .preferredColorScheme(.dark)
}
