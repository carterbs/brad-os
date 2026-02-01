import SwiftUI

/// A loading spinner view
struct LoadingView: View {
    var message: String = "Loading..."

    var body: some View {
        VStack(spacing: Theme.Spacing.space4) {
            ProgressView()
                .progressViewStyle(CircularProgressViewStyle(tint: Theme.interactivePrimary))
                .scaleEffect(1.5)

            Text(message)
                .font(.callout)
                .foregroundColor(Theme.textSecondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

#Preview {
    LoadingView()
        .background(AuroraBackground().ignoresSafeArea())
        .preferredColorScheme(.dark)
}
