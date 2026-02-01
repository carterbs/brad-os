import SwiftUI
import BradOSCore

/// A card displaying an activity type for the Activities grid
struct ActivityCard: View {
    let activityType: ActivityType
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: Theme.Spacing.space3) {
                Image(systemName: activityType.iconName)
                    .font(.system(size: Theme.Typography.activityGridIcon, weight: .regular))
                    .foregroundColor(activityType.color)
                    .frame(width: Theme.Dimensions.iconFrameLG, height: Theme.Dimensions.iconFrameLG)
                    .background(activityType.color.opacity(0.12))
                    .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))

                Text(activityType.displayName)
                    .font(.headline)
                    .foregroundColor(Theme.textPrimary)
            }
            .frame(maxWidth: .infinity, minHeight: 100)
            .glassCard(.card, padding: Theme.Spacing.space6)
        }
        .buttonStyle(PlainButtonStyle())
        .scaleEffect(1.0) // Press handled by button style
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
            HStack(spacing: Theme.Spacing.space3) {
                Image(systemName: iconName)
                    .font(.system(size: Theme.Typography.cardHeaderIcon, weight: .medium))
                    .foregroundColor(color)
                    .frame(width: Theme.Dimensions.iconFrameMD, height: Theme.Dimensions.iconFrameMD)
                    .background(color.opacity(0.12))
                    .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))

                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.headline)
                        .foregroundColor(Theme.textPrimary)

                    if let subtitle = subtitle {
                        Text(subtitle)
                            .font(.subheadline)
                            .foregroundColor(Theme.textSecondary)
                    }
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(Theme.textTertiary)
            }
            .glassCard()
        }
        .buttonStyle(PlainButtonStyle())
    }
}

#Preview {
    VStack(spacing: Theme.Spacing.space4) {
        ActivityCard(activityType: .workout) {}
        ActivityCard(activityType: .stretch) {}

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
    .padding(Theme.Spacing.space5)
    .background(AuroraBackground().ignoresSafeArea())
    .preferredColorScheme(.dark)
}
