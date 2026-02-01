import SwiftUI

/// User profile and settings view
struct ProfileView: View {
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: Theme.Spacing.lg) {
                    // Settings Section
                    settingsSection

                    // About Section
                    aboutSection
                }
                .padding(Theme.Spacing.md)
            }
            .background(Theme.background)
            .navigationTitle("Profile")
            .navigationBarTitleDisplayMode(.large)
        }
    }

    // MARK: - Settings Section

    @ViewBuilder
    private var settingsSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.md) {
            SectionHeader(title: "Settings")

            VStack(spacing: 0) {
                NavigationLink(destination: BarcodeWalletView()) {
                    SettingsRow(
                        title: "Barcode Wallet",
                        subtitle: "Manage membership barcodes",
                        iconName: "barcode",
                        iconColor: Theme.accent
                    ) {
                        Image(systemName: "chevron.right")
                            .font(.caption)
                            .foregroundColor(Theme.textSecondary)
                    }
                }
                .buttonStyle(.plain)
            }
            .background(Theme.backgroundSecondary)
            .cornerRadius(Theme.CornerRadius.md)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.CornerRadius.md)
                    .stroke(Theme.border, lineWidth: 1)
            )

            NotificationSettingsView()
        }
    }

    // MARK: - About Section

    @ViewBuilder
    private var aboutSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.md) {
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
            .background(Theme.backgroundSecondary)
            .cornerRadius(Theme.CornerRadius.md)
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
        HStack(spacing: Theme.Spacing.md) {
            Image(systemName: iconName)
                .foregroundColor(iconColor)
                .frame(width: 24)

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.subheadline)
                    .foregroundColor(Theme.textPrimary)

                if let subtitle = subtitle {
                    Text(subtitle)
                        .font(.caption)
                        .foregroundColor(Theme.textSecondary)
                }
            }

            Spacer()

            accessory()
        }
        .padding(Theme.Spacing.md)
    }
}

#Preview {
    ProfileView()
        .preferredColorScheme(.dark)
}
