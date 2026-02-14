import SwiftUI

/// User profile and settings view
struct ProfileView: View {
    @EnvironmentObject var cyclingVM: CyclingViewModel

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: Theme.Spacing.space6) {
                    // Cycling Section
                    cyclingSection

                    // Health Section
                    healthSection

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

    // MARK: - Cycling Section

    @ViewBuilder
    private var cyclingSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            SectionHeader(title: "Cycling")

            VStack(spacing: 0) {
                NavigationLink(destination: FTPEntryView()) {
                    SettingsRow(
                        title: "FTP",
                        subtitle: "Functional Threshold Power",
                        iconName: "bolt.fill",
                        iconColor: Theme.cycling
                    ) {
                        HStack(spacing: Theme.Spacing.space2) {
                            if let ftp = cyclingVM.currentFTP {
                                Text("\(ftp)W")
                                    .font(.subheadline)
                                    .foregroundColor(Theme.textSecondary)
                            }
                            Image(systemName: "chevron.right")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundColor(Theme.textTertiary)
                        }
                    }
                }
                .contentShape(Rectangle())
                .buttonStyle(.plain)

                Divider()
                    .background(Theme.strokeSubtle)

                NavigationLink(destination: TrainingBlockSetupView()) {
                    SettingsRow(
                        title: "Training Block",
                        subtitle: "8-week training plan",
                        iconName: "calendar",
                        iconColor: Theme.cycling
                    ) {
                        Image(systemName: "chevron.right")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(Theme.textTertiary)
                    }
                }
                .contentShape(Rectangle())
                .buttonStyle(.plain)

                Divider()
                    .background(Theme.strokeSubtle)

                NavigationLink(destination: StravaConnectionView()) {
                    SettingsRow(
                        title: "Strava",
                        subtitle: "Connect to sync rides",
                        iconName: "figure.outdoor.cycle",
                        iconColor: Color.orange
                    ) {
                        Image(systemName: "chevron.right")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(Theme.textTertiary)
                    }
                }
                .contentShape(Rectangle())
                .buttonStyle(.plain)
            }
            .glassCard(.card, padding: 0)
        }
    }

    // MARK: - Health Section

    @ViewBuilder
    private var healthSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            SectionHeader(title: "Health")

            VStack(spacing: 0) {
                NavigationLink(destination: WeightGoalView()) {
                    SettingsRow(
                        title: "Weight Goal",
                        subtitle: "Track weight targets",
                        iconName: "scalemass.fill",
                        iconColor: Theme.success
                    ) {
                        Image(systemName: "chevron.right")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(Theme.textTertiary)
                    }
                }
                .contentShape(Rectangle())
                .buttonStyle(.plain)

                Divider().background(Theme.divider)

                NavigationLink(destination: HRVHistoryView()) {
                    SettingsRow(
                        title: "HRV History",
                        subtitle: "Heart rate variability trends",
                        iconName: "waveform.path.ecg",
                        iconColor: Theme.interactivePrimary
                    ) {
                        Image(systemName: "chevron.right")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(Theme.textTertiary)
                    }
                }
                .contentShape(Rectangle())
                .buttonStyle(.plain)

                Divider().background(Theme.divider)

                NavigationLink(destination: RHRHistoryView()) {
                    SettingsRow(
                        title: "RHR History",
                        subtitle: "Resting heart rate trends",
                        iconName: "heart.fill",
                        iconColor: Theme.destructive
                    ) {
                        Image(systemName: "chevron.right")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(Theme.textTertiary)
                    }
                }
                .contentShape(Rectangle())
                .buttonStyle(.plain)

                Divider().background(Theme.divider)

                NavigationLink(destination: SleepHistoryView()) {
                    SettingsRow(
                        title: "Sleep History",
                        subtitle: "Sleep duration and stage trends",
                        iconName: "bed.double.fill",
                        iconColor: Theme.interactiveSecondary
                    ) {
                        Image(systemName: "chevron.right")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(Theme.textTertiary)
                    }
                }
                .contentShape(Rectangle())
                .buttonStyle(.plain)

                Divider().background(Theme.divider)

                NavigationLink(destination: FoodScannerView()) {
                    SettingsRow(
                        title: "Food Scanner",
                        subtitle: "Scan meals with AI + depth sensor",
                        iconName: "camera.fill",
                        iconColor: Theme.mealPlan
                    ) {
                        Image(systemName: "chevron.right")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(Theme.textTertiary)
                    }
                }
                .contentShape(Rectangle())
                .buttonStyle(.plain)
            }
            .glassCard(.card, padding: 0)
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
                .contentShape(Rectangle())
                .buttonStyle(.plain)

                Divider()
                    .background(Theme.strokeSubtle)

                NavigationLink(destination: TextToSpeechView()) {
                    SettingsRow(
                        title: "Text to Speech",
                        subtitle: "Speak text aloud",
                        iconName: "waveform",
                        iconColor: Theme.interactiveSecondary
                    ) {
                        Image(systemName: "chevron.right")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(Theme.textTertiary)
                    }
                }
                .contentShape(Rectangle())
                .buttonStyle(.plain)

                Divider()
                    .background(Theme.strokeSubtle)

                NavigationLink(destination: HealthSyncView()) {
                    SettingsRow(
                        title: "Health Sync",
                        subtitle: "Force sync HealthKit data",
                        iconName: "arrow.triangle.2.circlepath",
                        iconColor: Theme.interactivePrimary
                    ) {
                        Image(systemName: "chevron.right")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(Theme.textTertiary)
                    }
                }
                .contentShape(Rectangle())
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
        .environmentObject(CyclingViewModel())
        .preferredColorScheme(.dark)
}
