import SwiftUI

/// A view displayed when an error occurs
struct ErrorStateView: View {
    let message: String
    let retryAction: () -> Void

    var body: some View {
        VStack(spacing: Theme.Spacing.space4) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 48, weight: .regular))
                .foregroundColor(Theme.destructive)

            Text("Something went wrong")
                .font(.system(size: 20, weight: .semibold))
                .foregroundColor(Theme.textPrimary)

            Text(message)
                .font(.callout)
                .foregroundColor(Theme.textSecondary)
                .multilineTextAlignment(.center)

            Button("Try Again", action: retryAction)
                .buttonStyle(GlassPrimaryButtonStyle())
                .padding(.top, Theme.Spacing.space2)
        }
        .padding(Theme.Spacing.space7)
    }
}

#Preview {
    ErrorStateView(message: "Failed to load calendar data") {}
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(AuroraBackground())
        .preferredColorScheme(.dark)
}
