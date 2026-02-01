import SwiftUI

/// A section header with optional action button
struct SectionHeader: View {
    let title: String
    var actionTitle: String?
    var action: (() -> Void)?

    var body: some View {
        HStack {
            Text(title)
                .font(.system(size: 22, weight: .semibold))
                .foregroundColor(Theme.textPrimary)

            Spacer()

            if let actionTitle = actionTitle, let action = action {
                Button(action: action) {
                    Text(actionTitle)
                        .font(.callout.weight(.semibold))
                        .foregroundColor(Theme.interactivePrimary)
                }
            }
        }
    }
}

#Preview {
    VStack(spacing: Theme.Spacing.space4) {
        SectionHeader(title: "Recent Workouts")
        SectionHeader(title: "Plans", actionTitle: "See All") {}
    }
    .padding(Theme.Spacing.space5)
    .background(AuroraBackground())
    .preferredColorScheme(.dark)
}
