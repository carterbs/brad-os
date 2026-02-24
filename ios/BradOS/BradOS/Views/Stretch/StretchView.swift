import SwiftUI
import BradOSCore

/// Main stretch view managing session lifecycle
struct StretchView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var sessionManager = ServiceFactory.makeStretchSessionManager()
    @StateObject private var dataService = ServiceFactory.makeStretchDataService()
    @StateObject private var audioPreparer = ServiceFactory.makeStretchAudioPreparer()

    @State private var config: StretchSessionConfig = ServiceFactory.loadStretchConfig()
    @State private var showCancelConfirmation = false
    @State private var showRecoveryPrompt = false
    @State private var recoveryInfo: (stretchName: String, regionName: String, progress: String)?
    @State private var isPreparing = false
    @State private var preparationTask: Task<Void, Never>?

    // Session saving state (managed at parent level like MeditationView)
    @State private var isSavingSession = false
    @State private var saveError: String?
    @State private var hasSavedSession = false

    private let configStorage = ServiceFactory.stretchConfigStorage
    private let sessionStorage = ServiceFactory.stretchSessionStorage
    private let apiClient: APIClientProtocol = DefaultAPIClient.instance

    var body: some View {
        NavigationStack {
            ZStack {
                AuroraBackground()

                switch sessionManager.status {
                case .idle:
                    if isPreparing {
                        StretchPreparationView(
                            audioPreparer: audioPreparer,
                            onCancel: cancelPreparation
                        )
                    } else if sessionManager.isWaitingForSpotifyReturn {
                        // Waiting for user to return to the app
                        AppReturnWaitView(
                            hasSpotify: config.spotifyPlaylistUrl?.isEmpty == false,
                            onStartNow: {
                                sessionManager.cancelSpotifyWait()
                            }
                        )
                    } else {
                        StretchSetupView(
                            config: $config,
                            isLoadingData: dataService.isLoading,
                            hasDataError: dataService.error != nil,
                            onStart: startSession,
                            onConfigChange: saveConfig,
                            onRetryLoad: { Task { await dataService.refresh() } }
                        )
                    }

                case .active, .paused:
                    StretchActiveView(
                        sessionManager: sessionManager,
                        onCancel: { showCancelConfirmation = true }
                    )

                case .complete:
                    StretchCompleteView(
                        sessionManager: sessionManager,
                        isSaving: isSavingSession,
                        saveError: saveError,
                        onDone: {
                            appState.isShowingStretch = false
                        },
                        onStartAnother: {
                            sessionStorage.clear()
                            hasSavedSession = false
                            saveError = nil
                            sessionManager.reset()
                        },
                        onRetrySync: {
                            saveSessionToServer()
                        }
                    )
                }
            }
            .navigationTitle("Stretch")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.hidden, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    if sessionManager.status == .idle {
                        Button(
                            action: {
                                appState.isShowingStretch = false
                            },
                            label: {
                                HStack(spacing: 4) {
                                    Image(systemName: "chevron.left")
                                    Text("Back")
                                }
                                .foregroundColor(Theme.interactivePrimary)
                            }
                        )
                    }
                }
            }
            .onAppear {
                checkForRecoverableSession()
            }
            .task {
                await dataService.loadRegions()
            }
            .alert("End Session?", isPresented: $showCancelConfirmation) {
                Button("Continue Stretching", role: .cancel) {}
                Button("End Session", role: .destructive) {
                    sessionStorage.clear()
                    sessionManager.endSession()
                }
            } message: {
                Text("Are you sure you want to end this stretch session?")
            }
            .alert("Resume Session?", isPresented: $showRecoveryPrompt) {
                Button("Resume", role: nil) {
                    resumeSession()
                }
                Button("Start Over", role: .destructive) {
                    sessionStorage.clear()
                }
            } message: {
                if let info = recoveryInfo {
                    let message = "You have an unfinished stretch session " +
                        "(\(info.progress) stretches, currently on \(info.stretchName)). " +
                        "Would you like to resume?"
                    Text(message)
                } else {
                    Text("You have an unfinished stretch session. Would you like to resume?")
                }
            }
            .onChange(of: sessionManager.status) { _, newStatus in
                // Save state when session is active or paused
                if newStatus == .active || newStatus == .paused {
                    saveSessionState()
                }
                // Save session to server when complete (like MeditationView)
                if newStatus == .complete {
                    sessionStorage.clear()
                    saveSessionToServer()
                }
            }
            .onChange(of: sessionManager.currentStretchIndex) { _, _ in
                if sessionManager.status == .active || sessionManager.status == .paused {
                    saveSessionState()
                }
            }
            .onChange(of: sessionManager.currentSegment) { _, _ in
                if sessionManager.status == .active || sessionManager.status == .paused {
                    saveSessionState()
                }
            }
            .onChange(of: sessionManager.isReadyForAudioPrep) { _, isReady in
                guard isReady else { return }
                prepareAudioAndStart()
            }
            .onChange(of: scenePhase) { _, newPhase in
                guard sessionManager.status == .active || sessionManager.status == .paused else { return }
                if newPhase == .background {
                    saveSessionState()
                }
            }
            .onDisappear {
                guard sessionManager.status != .complete else { return }
                cancelPreparation()
                sessionManager.reset()
            }
        }
    }

    private func checkForRecoverableSession() {
        if let info = sessionStorage.getRecoveryInfo() {
            recoveryInfo = info
            showRecoveryPrompt = true
        }
    }

    private func resumeSession() {
        guard let state = sessionStorage.load() else { return }
        sessionManager.restore(from: state)
    }

    private func saveSessionState() {
        let state = sessionManager.exportState()
        sessionStorage.save(state)
    }

    private func startSession() {
        // Save config before starting
        configStorage.save(config)

        // Select stretches from data service
        let stretches = dataService.selectStretches(for: config)
        guard !stretches.isEmpty else { return }

        // Open Spotify and wait for user to return before prepping audio
        Task {
            await sessionManager.start(with: config, stretches: stretches)
        }
    }

    /// Called after Spotify wait ends -- prep TTS audio then start the session
    private func prepareAudioAndStart() {
        isPreparing = true

        preparationTask = Task {
            let prepared = try? await audioPreparer.prepareAudio(
                for: sessionManager.selectedStretches)
            let audio = prepared ?? PreparedStretchAudio(
                stretchAudio: [:],
                stretchNameAudio: [:],
                switchSidesURL: URL(fileURLWithPath: ""),
                halfwayURL: URL(fileURLWithPath: ""),
                sessionCompleteURL: URL(fileURLWithPath: "")
            )

            guard !Task.isCancelled else { return }

            isPreparing = false
            await sessionManager.beginSession(audio: audio)
        }
    }

    private func cancelPreparation() {
        preparationTask?.cancel()
        preparationTask = nil
        isPreparing = false
    }

    private func saveConfig() {
        configStorage.save(config)
    }

    private func saveSessionToServer() {
        guard !hasSavedSession else { return }
        hasSavedSession = true
        isSavingSession = true
        saveError = nil

        // Calculate total duration from session start to now
        let totalDurationSeconds: Int
        if let startTime = sessionManager.sessionStartTime {
            totalDurationSeconds = Int(Date().timeIntervalSince(startTime))
        } else {
            // Fallback: sum up individual stretch durations
            totalDurationSeconds = sessionManager.completedStretches.reduce(0) { $0 + $1.durationSeconds }
        }

        // Count completed vs skipped
        let completedCount = sessionManager.completedStretches.filter { $0.skippedSegments < 2 }.count
        let skippedCount = sessionManager.completedStretches.filter { $0.skippedSegments == 2 }.count

        // Build the session record
        let session = StretchSession(
            id: UUID().uuidString,  // Server will assign real ID
            completedAt: Date(),
            totalDurationSeconds: totalDurationSeconds,
            regionsCompleted: completedCount,
            regionsSkipped: skippedCount,
            stretches: sessionManager.completedStretches
        )

        Task {
            do {
                _ = try await apiClient.createStretchSession(session)
                await MainActor.run {
                    isSavingSession = false
                }
                #if DEBUG
                print("[StretchView] Session saved successfully")
                #endif
            } catch {
                await MainActor.run {
                    isSavingSession = false
                    saveError = "Could not save session"
                }
                #if DEBUG
                print("[StretchView] Failed to save session: \(error)")
                #endif
            }
        }
    }
}

#Preview {
    StretchView()
        .environmentObject(AppState())
        .background(AuroraBackground().ignoresSafeArea())
        .preferredColorScheme(.dark)
}
