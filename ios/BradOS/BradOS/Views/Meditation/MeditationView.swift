import SwiftUI
import UIKit
import AVFoundation
import BradOSCore

/// Meditation session states
enum MeditationSessionState {
    case categorySelection    // First screen - choose breathing or reactivity
    case setup                // Breathing duration picker
    case guidedBrowser        // List of guided meditations
    case guidedPreparing      // Audio pre-fetch progress
    case active               // Breathing session
    case guidedActive         // Guided session playing
    case complete             // Session complete
}

/// Breathing phase for meditation (spec: 4-2-6-2 = 14 second cycle)
enum BreathingPhase: String, CaseIterable {
    case inhale = "Inhale"
    case holdIn = "Hold"
    case exhale = "Exhale"
    case rest = "Rest"

    var duration: Double {
        switch self {
        case .inhale: return 4.0
        case .holdIn: return 2.0
        case .exhale: return 6.0
        case .rest: return 2.0
        }
    }

    var next: BreathingPhase {
        switch self {
        case .inhale: return .holdIn
        case .holdIn: return .exhale
        case .exhale: return .rest
        case .rest: return .inhale
        }
    }

    /// Scale factor for the breathing circle (1.0 to 1.8)
    var targetScale: CGFloat {
        switch self {
        case .inhale: return 1.8   // Grows to 1.8
        case .holdIn: return 1.8   // Stays at 1.8
        case .exhale: return 1.0   // Shrinks to 1.0
        case .rest: return 1.0     // Stays at 1.0
        }
    }

    /// Starting scale for the phase
    var startScale: CGFloat {
        switch self {
        case .inhale: return 1.0
        case .holdIn: return 1.8
        case .exhale: return 1.8
        case .rest: return 1.0
        }
    }

    /// Opacity for the breathing circle (0.6 to 1.0)
    var targetOpacity: Double {
        switch self {
        case .inhale: return 1.0   // Fades to 1.0
        case .holdIn: return 1.0   // Stays at 1.0
        case .exhale: return 0.6   // Fades to 0.6
        case .rest: return 0.6     // Stays at 0.6
        }
    }

    /// Starting opacity for the phase
    var startOpacity: Double {
        switch self {
        case .inhale: return 0.6
        case .holdIn: return 1.0
        case .exhale: return 1.0
        case .rest: return 0.6
        }
    }

    /// VoiceOver description for the phase
    var accessibilityLabel: String {
        switch self {
        case .inhale: return "Inhale for 4 seconds"
        case .holdIn: return "Hold breath for 2 seconds"
        case .exhale: return "Exhale for 6 seconds"
        case .rest: return "Rest for 2 seconds"
        }
    }
}

/// Main meditation view managing session lifecycle
struct MeditationView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.scenePhase) var scenePhase

    @State private var sessionState: MeditationSessionState = .categorySelection
    @State private var selectedDuration: MeditationDuration = .five
    @State private var completedSession: MeditationSession?
    @State private var showRecoveryPrompt: Bool = false
    @State private var recoverableSession: MeditationSessionPersisted?
    @State private var isSavingSession: Bool = false
    @State private var saveError: Error?

    // Guided meditation state
    @State private var selectedCategory: MeditationCategory?
    @State private var selectedScript: GuidedMeditationScript?
    @State private var preparedSegments: [PreparedAudioSegment] = []
    @State private var resolvedInterjections: [ResolvedInterjection] = []

    private let storage = MeditationStorage.shared
    private let apiService = ServiceFactory.meditationAPIService

    var body: some View {
        NavigationStack {
            ZStack {
                AuroraBackground()

                switch sessionState {
                case .categorySelection:
                    MeditationCategoryView(
                        onSelectBreathing: {
                            selectedCategory = .breathing
                            saveCategoryPreference(.breathing)
                            sessionState = .setup
                        },
                        onSelectReactivity: {
                            selectedCategory = .reactivity
                            saveCategoryPreference(.reactivity)
                            sessionState = .guidedBrowser
                        }
                    )

                case .setup:
                    MeditationSetupView(
                        selectedDuration: $selectedDuration,
                        onStart: startSession
                    )

                case .guidedBrowser:
                    GuidedMeditationBrowserView(
                        onSelectScript: { script in
                            selectedScript = script
                            sessionState = .guidedPreparing
                        },
                        onBack: {
                            sessionState = .categorySelection
                        }
                    )

                case .guidedPreparing:
                    if let script = selectedScript {
                        GuidedMeditationPreparingView(
                            script: script,
                            onReady: { segments, interjections in
                                preparedSegments = segments
                                resolvedInterjections = interjections
                                sessionState = .guidedActive
                            },
                            onCancel: {
                                sessionState = .guidedBrowser
                            }
                        )
                    }

                case .active:
                    MeditationActiveView(
                        duration: selectedDuration,
                        recoveredState: recoverableSession,
                        onComplete: { session in
                            completedSession = session
                            sessionState = .complete
                            storage.clearMeditationState()
                            saveSessionToServer(session)
                        }
                    )

                case .guidedActive:
                    if let script = selectedScript {
                        GuidedMeditationActiveView(
                            script: script,
                            preparedSegments: preparedSegments,
                            resolvedInterjections: resolvedInterjections,
                            onComplete: { session in
                                completedSession = session
                                sessionState = .complete
                                storage.clearMeditationState()
                                saveSessionToServer(session)
                            }
                        )
                    }

                case .complete:
                    if let session = completedSession {
                        MeditationCompleteView(
                            session: session,
                            meditationTitle: completedMeditationTitle,
                            isSaving: isSavingSession,
                            saveError: saveError,
                            onDone: {
                                appState.isShowingMeditation = false
                            },
                            onStartAnother: {
                                recoverableSession = nil
                                sessionState = .categorySelection
                            },
                            onRetrySync: {
                                saveSessionToServer(session)
                            }
                        )
                    }
                }
            }
            .navigationTitle("Meditation")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.hidden, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    if sessionState == .categorySelection {
                        Button(action: {
                            appState.isShowingMeditation = false
                        }, label: {
                            HStack(spacing: 4) {
                                Image(systemName: "chevron.left")
                                Text("Back")
                            }
                            .foregroundColor(Theme.interactivePrimary)
                        })
                    } else if sessionState == .setup {
                        Button(action: {
                            sessionState = .categorySelection
                        }, label: {
                            HStack(spacing: 4) {
                                Image(systemName: "chevron.left")
                                Text("Back")
                            }
                            .foregroundColor(Theme.interactivePrimary)
                        })
                    }
                }
            }
            .onAppear {
                loadSavedPreferences()
                checkForRecoverableSession()
            }
            .alert("Resume Session?", isPresented: $showRecoveryPrompt) {
                Button("Resume") {
                    if let recovered = recoverableSession {
                        if storage.isGuidedSession(recovered) {
                            // Guided session recovery - re-fetch script and rebuild audio
                            if let scriptId = recovered.guidedScriptId {
                                selectedCategory = .reactivity
                                Task {
                                    do {
                                        let service = ServiceFactory.guidedMeditationService
                                        let fullScript = try await service.loadFullScript(id: scriptId)
                                        await MainActor.run {
                                            selectedScript = fullScript
                                            sessionState = .guidedPreparing
                                        }
                                    } catch {
                                        // If we can't load the script, fall back to category selection
                                        await MainActor.run {
                                            storage.clearMeditationState()
                                            sessionState = .categorySelection
                                        }
                                    }
                                }
                            }
                        } else {
                            // Breathing session recovery (existing behavior)
                            selectedDuration = MeditationDuration(rawValue: recovered.durationMinutes) ?? .five
                            sessionState = .active
                        }
                    }
                }
                Button("Start Fresh", role: .cancel) {
                    recoverableSession = nil
                    storage.clearMeditationState()
                }
            } message: {
                Text("You have an unfinished meditation session. Would you like to resume?")
            }
        }
    }

    private var completedMeditationTitle: String {
        if let script = selectedScript {
            return script.title
        }
        if selectedCategory == .breathing {
            return "Mindful Breathing"
        }
        return "Meditation"
    }

    private func loadSavedPreferences() {
        let config = storage.loadMeditationConfig()
        selectedDuration = MeditationDuration(rawValue: config.duration) ?? .five
        if let categoryStr = config.selectedCategory,
           let category = MeditationCategory(rawValue: categoryStr) {
            selectedCategory = category
        }
    }

    private func checkForRecoverableSession() {
        if let recovered = storage.recoverableSession() {
            recoverableSession = recovered
            showRecoveryPrompt = true
        }
    }

    private func startSession() {
        // Save duration preference and category
        let config = MeditationConfig(
            duration: selectedDuration.rawValue,
            selectedCategory: selectedCategory?.rawValue
        )
        storage.saveMeditationConfig(config)
        recoverableSession = nil
        sessionState = .active
    }

    private func saveCategoryPreference(_ category: MeditationCategory) {
        var config = storage.loadMeditationConfig()
        config.selectedCategory = category.rawValue
        storage.saveMeditationConfig(config)
    }

    private func saveSessionToServer(_ session: MeditationSession) {
        isSavingSession = true
        saveError = nil

        Task {
            do {
                _ = try await apiService.saveSession(session)
                await MainActor.run {
                    isSavingSession = false
                    saveError = nil
                }
            } catch {
                await MainActor.run {
                    isSavingSession = false
                    saveError = error
                }
            }
        }
    }
}

#Preview {
    MeditationView()
        .environmentObject(AppState())
        .preferredColorScheme(.dark)
}
