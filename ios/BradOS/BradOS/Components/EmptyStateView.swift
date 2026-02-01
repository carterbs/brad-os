import SwiftUI

/// A view displayed when there's no content
struct EmptyStateView: View {
    let iconName: String
    let title: String
    let message: String
    var buttonTitle: String?
    var buttonAction: (() -> Void)?
    var glowColor: Color?

    var body: some View {
        VStack(spacing: Theme.Spacing.space4) {
            Image(systemName: iconName)
                .font(.system(size: 56, weight: .regular))
                .foregroundColor(Theme.textTertiary)
                .auroraGlow(glowColor ?? Theme.interactivePrimary, intensity: .secondary, offset: CGPoint(x: -10, y: -10))

            Text(title)
                .font(.system(size: 20, weight: .semibold))
                .foregroundColor(Theme.textPrimary)

            Text(message)
                .font(.callout)
                .foregroundColor(Theme.textSecondary)
                .multilineTextAlignment(.center)

            if let buttonTitle = buttonTitle, let buttonAction = buttonAction {
                Button(action: buttonAction) {
                    Text(buttonTitle)
                }
                .buttonStyle(GlassPrimaryButtonStyle())
                .padding(.top, Theme.Spacing.space2)
            }
        }
        .padding(Theme.Spacing.space7)
    }
}

#Preview {
    EmptyStateView(
        iconName: "dumbbell",
        title: "No Workouts Yet",
        message: "Start a mesocycle to begin tracking your workouts.",
        buttonTitle: "Start Mesocycle"
    ) {}
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(AuroraBackground())
    .preferredColorScheme(.dark)
}
