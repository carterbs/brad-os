import SwiftUI

struct MeditationCategoryView: View {
    let onSelectBreathing: () -> Void
    let onSelectReactivity: () -> Void

    var body: some View {
        VStack(spacing: Theme.Spacing.space7) {
            Spacer()

            // Icon
            Image(systemName: "brain.head.profile")
                .font(.system(size: Theme.Typography.iconXL))
                .foregroundColor(Theme.meditation)

            Text("Meditation")
                .font(.title)
                .fontWeight(.bold)
                .foregroundColor(Theme.textPrimary)

            Text("Choose your practice")
                .font(.subheadline)
                .foregroundColor(Theme.textSecondary)

            Spacer()

            // Category Cards
            VStack(spacing: Theme.Spacing.space4) {
                // Breathing Card
                Button(action: onSelectBreathing) {
                    HStack(spacing: Theme.Spacing.space4) {
                        Image(systemName: MeditationCategory.breathing.icon)
                            .font(.title2)
                            .foregroundColor(Theme.meditation)
                            .frame(width: 44, height: 44)

                        VStack(alignment: .leading, spacing: 2) {
                            Text(MeditationCategory.breathing.displayName)
                                .font(.headline)
                                .foregroundColor(Theme.textPrimary)
                            Text(MeditationCategory.breathing.subtitle)
                                .font(.caption)
                                .foregroundColor(Theme.textSecondary)
                        }

                        Spacer()

                        Image(systemName: "chevron.right")
                            .font(.caption)
                            .foregroundColor(Theme.textSecondary)
                    }
                    .glassCard()
                }
                .buttonStyle(PlainButtonStyle())

                // Reactivity Card
                Button(action: onSelectReactivity) {
                    HStack(spacing: Theme.Spacing.space4) {
                        Image(systemName: MeditationCategory.reactivity.icon)
                            .font(.title2)
                            .foregroundColor(Theme.meditation)
                            .frame(width: 44, height: 44)

                        VStack(alignment: .leading, spacing: 2) {
                            Text(MeditationCategory.reactivity.displayName)
                                .font(.headline)
                                .foregroundColor(Theme.textPrimary)
                            Text(MeditationCategory.reactivity.subtitle)
                                .font(.caption)
                                .foregroundColor(Theme.textSecondary)
                        }

                        Spacer()

                        Image(systemName: "chevron.right")
                            .font(.caption)
                            .foregroundColor(Theme.textSecondary)
                    }
                    .glassCard()
                }
                .buttonStyle(PlainButtonStyle())
            }

            Spacer()
        }
        .padding(Theme.Spacing.space4)
    }
}
