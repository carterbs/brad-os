import SwiftUI
import BradOSCore
import FirebaseAppCheck

struct StravaConnectionView: View {
    @EnvironmentObject var stravaAuth: StravaAuthManager
    @Environment(\.apiClient) private var apiClient: any APIClientProtocol

    @State private var isSyncing = false
    @State private var syncResult: SyncResult?
    @State private var syncError: String?

    #if DEBUG
    @State private var showDebugTokenEntry = false
    @State private var debugAccessToken = ""
    @State private var debugRefreshToken = ""
    @State private var debugAthleteId = ""
    @State private var debugError: String?
    @State private var debugSuccess = false
    #endif

    struct SyncResult {
        let imported: Int
        let skipped: Int
        let message: String
    }

    var body: some View {
        ScrollView {
            VStack(spacing: Theme.Spacing.space6) {
                if stravaAuth.isConnected {
                    // Connected Account Section
                    connectedAccountSection

                    // Sync Status Section
                    syncStatusSection

                    // Disconnect Section
                    disconnectSection
                } else {
                    // Connect Section
                    connectSection

                    // Features Section
                    featuresSection

                    #if DEBUG
                    // Debug Token Entry Section
                    debugTokenSection
                    #endif
                }
            }
            .padding(Theme.Spacing.space5)
        }
        .background(AuroraBackground().ignoresSafeArea())
        .navigationTitle("Strava")
        .navigationBarTitleDisplayMode(.large)
        .toolbarBackground(.hidden, for: .navigationBar)
    }

    // MARK: - Connected Account Section

    @ViewBuilder
    private var connectedAccountSection: some View {
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
    private var syncStatusSection: some View {
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
                    Text("New Peloton rides will automatically sync to your training log.")
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
                            Image(systemName: "arrow.triangle.2.circlepath")
                        }
                        Text(isSyncing ? "Syncing..." : "Sync Historical Rides")
                        Spacer()
                    }
                    .foregroundColor(isSyncing ? Theme.textSecondary : Color.orange)
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

    private func syncHistoricalActivities() async {
        isSyncing = true
        syncResult = nil
        syncError = nil

        do {
            let response = try await syncStravaActivities()
            syncResult = SyncResult(
                imported: response.imported,
                skipped: response.skipped,
                message: response.message
            )
        } catch {
            syncError = error.localizedDescription
        }

        isSyncing = false
    }

    private func syncStravaActivities() async throws -> (imported: Int, skipped: Int, message: String) {
        // Use concrete APIClient for cycling methods (not in protocol yet)
        guard let client = apiClient as? APIClient else {
            throw NSError(domain: "Strava", code: -1, userInfo: [NSLocalizedDescriptionKey: "API client not available"])
        }
        let response = try await client.syncCyclingActivities()
        return (response.imported, response.skipped, response.message)
    }

    // MARK: - Disconnect Section

    @ViewBuilder
    private var disconnectSection: some View {
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
    private var connectSection: some View {
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

    // MARK: - Debug Token Section

    #if DEBUG
    @ViewBuilder
    private var debugTokenSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            Button {
                showDebugTokenEntry.toggle()
            } label: {
                HStack {
                    Image(systemName: "wrench.and.screwdriver")
                    Text("Developer: Inject Tokens")
                    Spacer()
                    Image(systemName: showDebugTokenEntry ? "chevron.up" : "chevron.down")
                }
                .foregroundColor(Theme.textSecondary)
                .padding(Theme.Spacing.space4)
            }
            .glassCard(.card, padding: 0)

            if showDebugTokenEntry {
                VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
                    Text("Get tokens from strava.com/settings/api")
                        .font(.caption)
                        .foregroundStyle(Theme.textSecondary)

                    TextField("Access Token", text: $debugAccessToken)
                        .textFieldStyle(.roundedBorder)
                        .autocapitalization(.none)
                        .disableAutocorrection(true)

                    TextField("Refresh Token", text: $debugRefreshToken)
                        .textFieldStyle(.roundedBorder)
                        .autocapitalization(.none)
                        .disableAutocorrection(true)

                    TextField("Athlete ID (from profile URL)", text: $debugAthleteId)
                        .textFieldStyle(.roundedBorder)
                        .keyboardType(.numberPad)

                    Button {
                        injectDebugTokens()
                    } label: {
                        HStack {
                            Spacer()
                            Text("Inject Tokens")
                            Spacer()
                        }
                        .padding()
                        .background(Theme.interactivePrimary)
                        .foregroundStyle(.white)
                        .cornerRadius(Theme.CornerRadius.md)
                    }
                    .disabled(debugAccessToken.isEmpty || debugRefreshToken.isEmpty || debugAthleteId.isEmpty)

                    if let error = debugError {
                        Text(error)
                            .font(.caption)
                            .foregroundColor(Theme.destructive)
                    }

                    if debugSuccess {
                        Text("Tokens injected! Restart the view to see connection.")
                            .font(.caption)
                            .foregroundColor(Theme.success)
                    }
                }
                .padding(Theme.Spacing.space4)
                .glassCard(.card, padding: 0)
            }
        }
    }

    private func injectDebugTokens() {
        guard let athleteId = Int(debugAthleteId) else {
            debugError = "Athlete ID must be a number"
            return
        }

        do {
            try KeychainService.shared.injectStravaTokens(
                accessToken: debugAccessToken,
                refreshToken: debugRefreshToken,
                athleteId: athleteId
            )
            debugError = nil
            debugSuccess = true

            // Reload auth state
            Task { @MainActor in
                // Force the auth manager to reload
                stravaAuth.isConnected = true
                stravaAuth.athleteId = athleteId
            }
        } catch {
            debugError = error.localizedDescription
            debugSuccess = false
        }
    }
    #endif

    // MARK: - Features Section

    @ViewBuilder
    private var featuresSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            SectionHeader(title: "What Gets Synced")

            VStack(spacing: 0) {
                FeatureRow(icon: "bicycle", text: "Peloton ride data")

                Divider()
                    .background(Theme.strokeSubtle)

                FeatureRow(icon: "bolt.fill", text: "Power metrics (NP, TSS)")

                Divider()
                    .background(Theme.strokeSubtle)

                FeatureRow(icon: "heart.fill", text: "Heart rate data")

                Divider()
                    .background(Theme.strokeSubtle)

                FeatureRow(icon: "clock.fill", text: "Ride duration and date")
            }
            .glassCard(.card, padding: 0)
        }
    }
}

// MARK: - Feature Row

struct FeatureRow: View {
    let icon: String
    let text: String

    var body: some View {
        HStack(spacing: Theme.Spacing.space4) {
            Image(systemName: icon)
                .foregroundStyle(Color.orange)
                .frame(width: 24)

            Text(text)
                .foregroundColor(Theme.textPrimary)

            Spacer()
        }
        .padding(Theme.Spacing.space4)
        .frame(minHeight: Theme.Dimensions.listRowMinHeight)
    }
}

#Preview {
    NavigationStack {
        StravaConnectionView()
            .environmentObject(StravaAuthManager())
    }
    .preferredColorScheme(.dark)
}
