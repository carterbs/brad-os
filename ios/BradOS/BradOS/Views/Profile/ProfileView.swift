import SwiftUI

/// User profile and settings view
struct ProfileView: View {
    @StateObject private var viewModel = ProfileViewModel()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: Theme.Spacing.lg) {
                    // Stats Section
                    statsSection

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
            .refreshable {
                await viewModel.loadStats()
            }
            .task {
                await viewModel.loadStats()
            }
        }
    }

    // MARK: - Stats Section

    @ViewBuilder
    private var statsSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.md) {
            SectionHeader(title: "Statistics")

            if viewModel.isLoading {
                // Loading skeleton
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: Theme.Spacing.md) {
                    ForEach(0..<4, id: \.self) { _ in
                        StatCardSkeleton()
                    }
                }
            } else if let error = viewModel.error {
                // Error state
                VStack(spacing: Theme.Spacing.sm) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.largeTitle)
                        .foregroundColor(Theme.error)

                    Text("Failed to load statistics")
                        .font(.subheadline)
                        .foregroundColor(Theme.textPrimary)

                    Text(error)
                        .font(.caption)
                        .foregroundColor(Theme.textSecondary)

                    Button("Retry") {
                        Task { await viewModel.loadStats() }
                    }
                    .buttonStyle(.bordered)
                    .tint(Theme.accent)
                }
                .frame(maxWidth: .infinity)
                .padding(Theme.Spacing.lg)
                .background(Theme.backgroundSecondary)
                .cornerRadius(Theme.CornerRadius.md)
            } else {
                // Normal stats grid
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: Theme.Spacing.md) {
                    StatCard(
                        title: "Mesocycles",
                        value: "\(viewModel.mesocyclesCompleted)",
                        subtitle: "completed",
                        iconName: "trophy.fill",
                        color: Theme.lifting
                    )

                    StatCard(
                        title: "Total Mesos",
                        value: "\(viewModel.totalMesocycles)",
                        subtitle: "all time",
                        iconName: "chart.bar.fill",
                        color: Theme.accent
                    )

                    StatCard(
                        title: "Meditations",
                        value: "\(viewModel.meditationSessions)",
                        subtitle: "sessions",
                        iconName: "brain.head.profile",
                        color: Theme.meditation
                    )

                    StatCard(
                        title: "Meditation",
                        value: "\(viewModel.meditationMinutes)",
                        subtitle: "minutes",
                        iconName: "clock.fill",
                        color: Theme.meditation
                    )
                }
            }
        }
    }

    // MARK: - Settings Section

    @ViewBuilder
    private var settingsSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.md) {
            SectionHeader(title: "Settings")

            // Notification Settings Component (will be replaced with NotificationSettingsView)
            NotificationSettingsView()

            // Other Settings
            VStack(spacing: 0) {
                // Data Management
                SettingsRow(
                    title: "Export Data",
                    subtitle: "Download your workout history",
                    iconName: "square.and.arrow.up.fill",
                    iconColor: Theme.accent
                ) {
                    Image(systemName: "chevron.right")
                        .foregroundColor(Theme.textSecondary)
                }

                Divider()
                    .background(Theme.border)

                // Clear Data (destructive)
                SettingsRow(
                    title: "Clear All Data",
                    subtitle: "This cannot be undone",
                    iconName: "trash.fill",
                    iconColor: Theme.error
                ) {
                    Image(systemName: "chevron.right")
                        .foregroundColor(Theme.textSecondary)
                }
            }
            .background(Theme.backgroundSecondary)
            .cornerRadius(Theme.CornerRadius.md)
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

                Divider()
                    .background(Theme.border)

                SettingsRow(
                    title: "Privacy Policy",
                    subtitle: nil,
                    iconName: "lock.fill",
                    iconColor: Theme.textSecondary
                ) {
                    Image(systemName: "chevron.right")
                        .foregroundColor(Theme.textSecondary)
                }

                Divider()
                    .background(Theme.border)

                SettingsRow(
                    title: "Terms of Service",
                    subtitle: nil,
                    iconName: "doc.text.fill",
                    iconColor: Theme.textSecondary
                ) {
                    Image(systemName: "chevron.right")
                        .foregroundColor(Theme.textSecondary)
                }
            }
            .background(Theme.backgroundSecondary)
            .cornerRadius(Theme.CornerRadius.md)
        }
    }
}

/// Card displaying a statistic
struct StatCard: View {
    let title: String
    let value: String
    let subtitle: String
    let iconName: String
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            HStack {
                Image(systemName: iconName)
                    .foregroundColor(color)
                Spacer()
            }

            Text(value)
                .font(.system(size: 28, weight: .bold, design: .rounded))
                .foregroundColor(Theme.textPrimary)

            Text(subtitle)
                .font(.caption)
                .foregroundColor(Theme.textSecondary)
        }
        .padding(Theme.Spacing.md)
        .background(Theme.backgroundSecondary)
        .cornerRadius(Theme.CornerRadius.md)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.CornerRadius.md)
                .stroke(Theme.border, lineWidth: 1)
        )
    }
}

/// Loading skeleton for StatCard
struct StatCardSkeleton: View {
    @State private var isAnimating = false

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            RoundedRectangle(cornerRadius: 4)
                .fill(Theme.border)
                .frame(width: 20, height: 20)

            RoundedRectangle(cornerRadius: 4)
                .fill(Theme.border)
                .frame(width: 60, height: 28)

            RoundedRectangle(cornerRadius: 4)
                .fill(Theme.border)
                .frame(width: 80, height: 12)
        }
        .padding(Theme.Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.backgroundSecondary)
        .cornerRadius(Theme.CornerRadius.md)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.CornerRadius.md)
                .stroke(Theme.border, lineWidth: 1)
        )
        .opacity(isAnimating ? 0.5 : 1.0)
        .animation(.easeInOut(duration: 0.8).repeatForever(autoreverses: true), value: isAnimating)
        .onAppear { isAnimating = true }
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
