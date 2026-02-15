import SwiftUI

/// Placeholder for food scanning feature (not yet implemented)
struct FoodScannerView: View {
    var body: some View {
        VStack(spacing: Theme.Spacing.space4) {
            Image(systemName: "camera.viewfinder")
                .font(.system(size: Theme.Typography.iconLG))
                .foregroundColor(Theme.textSecondary)

            Text("Coming Soon")
                .font(.headline)
                .foregroundColor(Theme.textPrimary)

            Text("Food scanning with AI + depth sensor is under development.")
                .font(.subheadline)
                .foregroundColor(Theme.textSecondary)
                .multilineTextAlignment(.center)
        }
        .padding(Theme.Spacing.space6)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(AuroraBackground().ignoresSafeArea())
        .navigationTitle("Food Scanner")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.hidden, for: .navigationBar)
    }
}
