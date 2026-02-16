import SwiftUI
import BradOSCore
import FirebaseAppCheck

struct StravaConnectionView: View {
    @EnvironmentObject var stravaAuth: StravaAuthManager
    @Environment(\.apiClient) private var apiClient: any APIClientProtocol

    @State var isSyncing = false
    @State var syncResult: SyncResult?
    @State var syncError: String?

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

    func syncHistoricalActivities() async {
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

    func syncStravaActivities() async throws -> (
        imported: Int, skipped: Int, message: String
    ) {
        // Use concrete APIClient for cycling methods (not in protocol yet)
        guard let client = apiClient as? APIClient else {
            throw NSError(
                domain: "Strava",
                code: -1,
                userInfo: [
                    NSLocalizedDescriptionKey: "API client not available"
                ]
            )
        }
        let response = try await client.syncCyclingActivities()
        return (response.imported, response.skipped, response.message)
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
                    Image(
                        systemName: showDebugTokenEntry
                            ? "chevron.up" : "chevron.down"
                    )
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
                    .disabled(
                        debugAccessToken.isEmpty
                            || debugRefreshToken.isEmpty
                            || debugAthleteId.isEmpty
                    )

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

    func injectDebugTokens() {
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
