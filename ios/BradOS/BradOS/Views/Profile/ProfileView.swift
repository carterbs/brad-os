import SwiftUI

/// User profile and settings view
struct ProfileView: View {
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: Theme.Spacing.space6) {
                    // Settings Section
                    settingsSection

                    // About Section
                    aboutSection
                }
                .padding(Theme.Spacing.space5)
            }
            .background(AuroraBackground().ignoresSafeArea())
            .navigationTitle("Profile")
            .navigationBarTitleDisplayMode(.large)
            .toolbarBackground(.hidden, for: .navigationBar)
        }
    }

    // MARK: - Settings Section

    @ViewBuilder
    private var settingsSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            SectionHeader(title: "Settings")

            VStack(spacing: 0) {
                NavigationLink(destination: BarcodeWalletView()) {
                    SettingsRow(
                        title: "Barcode Wallet",
                        subtitle: "Manage membership barcodes",
                        iconName: "barcode",
                        iconColor: Theme.interactivePrimary
                    ) {
                        Image(systemName: "chevron.right")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(Theme.textTertiary)
                    }
                }
                .buttonStyle(.plain)
            }
            .glassCard(.card, padding: 0)

            NotificationSettingsView()
        }
    }

    // MARK: - About Section

    @ViewBuilder
    private var aboutSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            SectionHeader(title: "About")

            VStack(spacing: 0) {
                SettingsRow(
                    title: "Version",
                    subtitle: nil,
                    iconName: "info.circle.fill",
                    iconColor: Theme.textSecondary
                ) {
                    Text("1.0.0")
                        .font(.subheadline)
                        .foregroundColor(Theme.textSecondary)
                }
            }
            .glassCard(.card, padding: 0)
        }
    }
}

/// Row in settings list
struct SettingsRow<Accessory: View>: View {
    let title: String
    let subtitle: String?
    let iconName: String
    let iconColor: Color
    @ViewBuilder let accessory: () -> Accessory

    var body: some View {
        HStack(spacing: Theme.Spacing.space4) {
            Image(systemName: iconName)
                .foregroundColor(iconColor)
                .frame(width: 24)

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

            accessory()
        }
        .padding(Theme.Spacing.space4)
        .frame(minHeight: Theme.Dimensions.listRowMinHeight)
    }
}

#Preview {
    ProfileView()
        .preferredColorScheme(.dark)
}
