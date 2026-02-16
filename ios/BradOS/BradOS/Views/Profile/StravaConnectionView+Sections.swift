import SwiftUI
import BradOSCore

// MARK: - Strava Connection Sections

extension StravaConnectionView {

    // MARK: - Connected Account Section

    @ViewBuilder
    var connectedAccountSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            SectionHeader(title: "Connected Account")

            VStack(spacing: 0) {
                HStack(spacing: Theme.Spacing.space4) {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(Theme.success)
                        .font(.title2)

                    VStack(alignment: .leading, spacing: 2) {
                        Text("Strava Connected")
                            .font(.headline)
                            .foregroundColor(Theme.textPrimary)

                        if let athleteId = stravaAuth.athleteId {
                            Text("Athlete ID: \(athleteId)")
                                .font(.caption)
                                .foregroundStyle(Theme.textSecondary)
                        }
                    }

                    Spacer()
                }
                .padding(Theme.Spacing.space4)
                .frame(minHeight: Theme.Dimensions.listRowMinHeight)
            }
            .glassCard(.card, padding: 0)
        }
    }

    // MARK: - Sync Status Section

    @ViewBuilder
    var syncStatusSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            SectionHeader(title: "Sync Status")

            VStack(spacing: 0) {
                HStack {
                    Text("Auto-sync")
                        .foregroundColor(Theme.textPrimary)
                    Spacer()
                    Text("Enabled")
                        .foregroundStyle(Theme.success)
                }
                .padding(Theme.Spacing.space4)
                .frame(minHeight: Theme.Dimensions.listRowMinHeight)

                Divider()
                    .background(Theme.strokeSubtle)

                HStack {
                    Text(
                        "New Peloton rides will automatically sync " +
                        "to your training log."
                    )
                        .font(.caption)
                        .foregroundStyle(Theme.textSecondary)
                    Spacer()
                }
                .padding(Theme.Spacing.space4)

                Divider()
                    .background(Theme.strokeSubtle)

                // Sync Now Button
                Button {
                    Task {
                        await syncHistoricalActivities()
                    }
                } label: {
                    HStack {
                        if isSyncing {
                            ProgressView()
                                .tint(Theme.textPrimary)
                                .scaleEffect(0.8)
                        } else {
                            Image(
                                systemName: "arrow.triangle.2.circlepath"
                            )
                        }
                        Text(
                            isSyncing
                                ? "Syncing..."
                                : "Sync Historical Rides"
                        )
                        Spacer()
                    }
                    .foregroundColor(
                        isSyncing ? Theme.textSecondary : Color.orange
                    )
                    .padding(Theme.Spacing.space4)
                    .frame(minHeight: Theme.Dimensions.listRowMinHeight)
                }
                .disabled(isSyncing)

                // Sync Result
                if let result = syncResult {
                    Divider()
                        .background(Theme.strokeSubtle)

                    HStack {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(Theme.success)
                        Text(result.message)
                            .font(.caption)
                            .foregroundStyle(Theme.textSecondary)
                        Spacer()
                    }
                    .padding(Theme.Spacing.space4)
                }

                if let error = syncError {
                    Divider()
                        .background(Theme.strokeSubtle)

                    HStack {
                        Image(systemName: "exclamationmark.circle.fill")
                            .foregroundStyle(Theme.destructive)
                        Text(error)
                            .font(.caption)
                            .foregroundStyle(Theme.destructive)
                        Spacer()
                    }
                    .padding(Theme.Spacing.space4)
                }
            }
            .glassCard(.card, padding: 0)
        }
    }

    // MARK: - Disconnect Section

    @ViewBuilder
    var disconnectSection: some View {
        Button(role: .destructive) {
            Task {
                try? await stravaAuth.disconnect()
            }
        } label: {
            HStack {
                Spacer()
                Text("Disconnect Strava")
                Spacer()
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(DestructiveButtonStyle())
    }

    // MARK: - Connect Section

    @ViewBuilder
    var connectSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            VStack(spacing: Theme.Spacing.space5) {
                // Strava Logo placeholder
                Image(systemName: "figure.outdoor.cycle")
                    .font(.system(size: 48))
                    .foregroundColor(Color.orange)

                Text("Connect Strava to sync your Peloton rides")
                    .multilineTextAlignment(.center)
                    .foregroundStyle(Theme.textSecondary)

                Button {
                    Task {
                        try? await stravaAuth.startOAuthFlow()
                    }
                } label: {
                    HStack {
                        Image(systemName: "link")
                        Text("Connect with Strava")
                    }
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.orange)
                    .foregroundStyle(.white)
                    .cornerRadius(Theme.CornerRadius.md)
                }
                .disabled(stravaAuth.isLoading)
                .opacity(stravaAuth.isLoading ? 0.5 : 1.0)

                if stravaAuth.isLoading {
                    ProgressView()
                        .tint(Theme.textPrimary)
                }

                if let error = stravaAuth.error {
                    Text(error)
                        .font(.caption)
                        .foregroundColor(Theme.destructive)
                        .multilineTextAlignment(.center)
                }
            }
            .padding(Theme.Spacing.space6)
            .glassCard(.card, padding: 0)
        }
    }

    // MARK: - Features Section

    @ViewBuilder
    var featuresSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            SectionHeader(title: "What Gets Synced")

            VStack(spacing: 0) {
                FeatureRow(icon: "bicycle", text: "Peloton ride data")

                Divider()
                    .background(Theme.strokeSubtle)

                FeatureRow(
                    icon: "bolt.fill",
                    text: "Power metrics (NP, TSS)"
                )

                Divider()
                    .background(Theme.strokeSubtle)

                FeatureRow(icon: "heart.fill", text: "Heart rate data")

                Divider()
                    .background(Theme.strokeSubtle)

                FeatureRow(
                    icon: "clock.fill",
                    text: "Ride duration and date"
                )
            }
            .glassCard(.card, padding: 0)
        }
    }
}
