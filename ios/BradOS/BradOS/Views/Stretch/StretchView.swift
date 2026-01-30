import SwiftUI
import BradOSCore

/// Main stretch view managing session lifecycle
struct StretchView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var sessionManager = StretchSessionManager()

    @State private var config: StretchSessionConfig = StretchConfigStorage.shared.load()
    @State private var showCancelConfirmation = false
    @State private var showRecoveryPrompt = false
    @State private var recoveryInfo: (stretchName: String, regionName: String, progress: String)?

    // Session saving state (managed at parent level like MeditationView)
    @State private var isSavingSession = false
    @State private var saveError: String?
    @State private var hasSavedSession = false

    private let configStorage = StretchConfigStorage.shared
    private let sessionStorage = StretchSessionStorage.shared
    private let apiClient: APIClientProtocol = APIClient.shared

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.background
                    .ignoresSafeArea()

                switch sessionManager.status {
                case .idle:
                    if sessionManager.isWaitingForSpotifyReturn {
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
                            onStart: startSession,
                            onConfigChange: saveConfig
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
                            // Simple dismissal only - cleanup is handled by .onDisappear
                            // This matches MeditationView's pattern which avoids navigation issues
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
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    if sessionManager.status == .idle {
                        Button(action: {
                            appState.isShowingStretch = false
                        }) {
                            HStack(spacing: 4) {
                                Image(systemName: "chevron.left")
                                Text("Back")
                            }
                            .foregroundColor(Theme.accent)
                        }
                    }
                }
            }
            .onAppear {
                checkForRecoverableSession()
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
                    Text("You have an unfinished stretch session (\(info.progress) stretches, currently on \(info.stretchName)). Would you like to resume?")
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
            .onChange(of: scenePhase) { _, newPhase in
                guard sessionManager.status == .active || sessionManager.status == .paused else { return }
                if newPhase == .background {
                    // Persist session state so it can be recovered if the app is terminated
                    saveSessionState()
                }
            }
            .onDisappear {
                // Only cleanup if not dismissing from complete state.
                // When status is .complete, calling reset() changes status to .idle,
                // which triggers SwiftUI to re-render (showing StretchSetupView instead of
                // StretchCompleteView) while the view is being dismissed. This race condition
                // prevents navigation from completing properly.
                guard sessionManager.status != .complete else { return }
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

        Task {
            await sessionManager.start(with: config)
        }
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

/// Setup view for configuring stretch session
struct StretchSetupView: View {
    @Binding var config: StretchSessionConfig
    let onStart: () -> Void
    var onConfigChange: (() -> Void)? = nil

    @State private var spotifyUrl: String = ""
    @State private var editMode: EditMode = .inactive

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(spacing: Theme.Spacing.lg) {
                    // Region Selection with reordering
                    regionSelectionSection

                    // Duration Selection
                    durationSection

                    // Spotify Integration
                    spotifySection

                    // Start Button
                    startButton
                }
                .padding(Theme.Spacing.md)
            }
        }
        .onAppear {
            spotifyUrl = config.spotifyPlaylistUrl ?? ""
        }
    }

    // MARK: - Region Selection

    @ViewBuilder
    private var regionSelectionSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.md) {
            HStack {
                SectionHeader(title: "Body Regions")

                Spacer()

                Button(action: {
                    editMode = editMode == .active ? .inactive : .active
                }) {
                    Text(editMode == .active ? "Done" : "Reorder")
                        .font(.caption)
                        .foregroundColor(Theme.accent)
                }

                Button(action: toggleAll) {
                    Text(allSelected ? "Deselect All" : "Select All")
                        .font(.caption)
                        .foregroundColor(Theme.accent)
                }
            }

            if editMode == .active {
                // List mode for drag-drop reordering
                reorderableRegionList
            } else {
                // Grid mode for normal viewing
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: Theme.Spacing.sm) {
                    ForEach(config.regions.indices, id: \.self) { index in
                        RegionToggleCard(
                            region: config.regions[index].region,
                            isEnabled: config.regions[index].enabled,
                            durationSeconds: config.regions[index].durationSeconds,
                            onToggle: {
                                config.regions[index].enabled.toggle()
                                onConfigChange?()
                            },
                            onDurationToggle: {
                                config.regions[index].durationSeconds = config.regions[index].durationSeconds == 60 ? 120 : 60
                                onConfigChange?()
                            }
                        )
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var reorderableRegionList: some View {
        VStack(spacing: Theme.Spacing.xs) {
            ForEach(config.regions.indices, id: \.self) { index in
                ReorderableRegionRow(
                    config: $config.regions[index],
                    index: index,
                    totalCount: config.regions.count,
                    onMoveUp: {
                        if index > 0 {
                            config.regions.swapAt(index, index - 1)
                            onConfigChange?()
                        }
                    },
                    onMoveDown: {
                        if index < config.regions.count - 1 {
                            config.regions.swapAt(index, index + 1)
                            onConfigChange?()
                        }
                    }
                )
            }
        }
    }

    private var allSelected: Bool {
        config.regions.allSatisfy { $0.enabled }
    }

    private func toggleAll() {
        let newValue = !allSelected
        for index in config.regions.indices {
            config.regions[index].enabled = newValue
        }
        onConfigChange?()
    }

    // MARK: - Duration Section

    @ViewBuilder
    private var durationSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.md) {
            SectionHeader(title: "Default Duration")

            HStack(spacing: Theme.Spacing.md) {
                DurationOption(
                    duration: 60,
                    isSelected: config.regions.first?.durationSeconds == 60,
                    onSelect: { setAllDurations(60) }
                )

                DurationOption(
                    duration: 120,
                    isSelected: config.regions.first?.durationSeconds == 120,
                    onSelect: { setAllDurations(120) }
                )
            }

            Text("Tap individual regions to set custom durations")
                .font(.caption)
                .foregroundColor(Theme.textSecondary)
        }
    }

    private func setAllDurations(_ seconds: Int) {
        for index in config.regions.indices {
            config.regions[index].durationSeconds = seconds
        }
        onConfigChange?()
    }

    // MARK: - Spotify Section

    @ViewBuilder
    private var spotifySection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.md) {
            SectionHeader(title: "Spotify Playlist (Optional)")

            TextField("Paste Spotify playlist URL", text: $spotifyUrl)
                .textFieldStyle(.plain)
                .padding(Theme.Spacing.md)
                .background(Theme.backgroundSecondary)
                .cornerRadius(Theme.CornerRadius.md)
                .autocapitalization(.none)
                .autocorrectionDisabled()
                .onChange(of: spotifyUrl) { _, newValue in
                    config.spotifyPlaylistUrl = newValue.isEmpty ? nil : newValue
                    onConfigChange?()
                }

            Text("Music will open in the Spotify app when the session starts.")
                .font(.caption)
                .foregroundColor(Theme.textSecondary)
        }
    }

    // MARK: - Start Button

    @ViewBuilder
    private var startButton: some View {
        let enabledRegions = config.regions.filter { $0.enabled }
        let totalMinutes = enabledRegions.reduce(0) { $0 + $1.durationSeconds } / 60

        VStack(spacing: Theme.Spacing.sm) {
            Button(action: onStart) {
                HStack {
                    Image(systemName: "play.fill")
                    Text("Start Session")
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(enabledRegions.isEmpty)

            Text("\(enabledRegions.count) regions | ~\(totalMinutes) minutes")
                .font(.caption)
                .foregroundColor(Theme.textSecondary)
        }
        .padding(.top, Theme.Spacing.md)
    }
}

/// Toggle card for a body region with duration badge
struct RegionToggleCard: View {
    let region: BodyRegion
    let isEnabled: Bool
    let durationSeconds: Int
    let onToggle: () -> Void
    let onDurationToggle: () -> Void

    var body: some View {
        Button(action: onToggle) {
            HStack {
                Image(systemName: region.iconName)
                    .foregroundColor(isEnabled ? Theme.stretch : Theme.textSecondary)
                    .accessibilityHidden(true)

                Text(region.displayName)
                    .font(.subheadline)
                    .foregroundColor(isEnabled ? Theme.textPrimary : Theme.textSecondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)

                Spacer()

                if isEnabled {
                    // Duration badge - tappable
                    Button(action: onDurationToggle) {
                        Text("\(durationSeconds / 60)m")
                            .font(.caption)
                            .fontWeight(.medium)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(Theme.stretch.opacity(0.2))
                            .cornerRadius(4)
                            .foregroundColor(Theme.stretch)
                    }
                    .buttonStyle(PlainButtonStyle())
                    .accessibilityLabel("Duration: \(durationSeconds / 60) minute\(durationSeconds == 60 ? "" : "s")")
                    .accessibilityHint("Double tap to toggle between 1 and 2 minutes")
                }

                Image(systemName: isEnabled ? "checkmark.circle.fill" : "circle")
                    .foregroundColor(isEnabled ? Theme.stretch : Theme.textSecondary)
                    .accessibilityHidden(true)
            }
            .padding(Theme.Spacing.md)
            .background(isEnabled ? Theme.stretch.opacity(0.1) : Theme.backgroundSecondary)
            .cornerRadius(Theme.CornerRadius.md)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.CornerRadius.md)
                    .stroke(isEnabled ? Theme.stretch : Theme.border, lineWidth: 1)
            )
        }
        .buttonStyle(PlainButtonStyle())
        .accessibilityLabel("\(region.displayName), \(isEnabled ? "enabled" : "disabled")")
        .accessibilityHint("Double tap to \(isEnabled ? "disable" : "enable") this region")
        .accessibilityAddTraits(isEnabled ? [.isSelected] : [])
    }
}

/// Row for reordering regions with up/down buttons
struct ReorderableRegionRow: View {
    @Binding var config: StretchRegionConfig
    let index: Int
    let totalCount: Int
    let onMoveUp: () -> Void
    let onMoveDown: () -> Void

    var body: some View {
        HStack(spacing: Theme.Spacing.sm) {
            // Position indicator
            Text("\(index + 1)")
                .font(.caption)
                .foregroundColor(Theme.textSecondary)
                .frame(width: 20)

            // Region info
            Image(systemName: config.region.iconName)
                .foregroundColor(config.enabled ? Theme.stretch : Theme.textSecondary)
                .frame(width: 24)

            Text(config.region.displayName)
                .font(.subheadline)
                .foregroundColor(config.enabled ? Theme.textPrimary : Theme.textSecondary)

            Spacer()

            // Duration badge
            Text("\(config.durationSeconds / 60)m")
                .font(.caption)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(Theme.stretch.opacity(0.2))
                .cornerRadius(4)
                .foregroundColor(Theme.stretch)

            // Enabled toggle
            Button(action: { config.enabled.toggle() }) {
                Image(systemName: config.enabled ? "checkmark.circle.fill" : "circle")
                    .foregroundColor(config.enabled ? Theme.stretch : Theme.textSecondary)
            }

            // Move buttons
            VStack(spacing: 2) {
                Button(action: onMoveUp) {
                    Image(systemName: "chevron.up")
                        .font(.caption)
                        .foregroundColor(index == 0 ? Theme.textSecondary.opacity(0.3) : Theme.textSecondary)
                }
                .disabled(index == 0)

                Button(action: onMoveDown) {
                    Image(systemName: "chevron.down")
                        .font(.caption)
                        .foregroundColor(index == totalCount - 1 ? Theme.textSecondary.opacity(0.3) : Theme.textSecondary)
                }
                .disabled(index == totalCount - 1)
            }
        }
        .padding(Theme.Spacing.sm)
        .background(config.enabled ? Theme.stretch.opacity(0.1) : Theme.backgroundSecondary)
        .cornerRadius(Theme.CornerRadius.sm)
    }
}

/// Duration option button
struct DurationOption: View {
    let duration: Int
    let isSelected: Bool
    let onSelect: () -> Void

    private var durationLabel: String {
        duration == 60 ? "1 minute" : "2 minutes"
    }

    var body: some View {
        Button(action: onSelect) {
            VStack(spacing: 4) {
                Text("\(duration / 60)")
                    .font(.title)
                    .fontWeight(.bold)
                    .foregroundColor(isSelected ? Theme.stretch : Theme.textPrimary)

                Text(duration == 60 ? "minute" : "minutes")
                    .font(.caption)
                    .foregroundColor(Theme.textSecondary)
            }
            .frame(maxWidth: .infinity)
            .padding(Theme.Spacing.md)
            .background(isSelected ? Theme.stretch.opacity(0.1) : Theme.backgroundSecondary)
            .cornerRadius(Theme.CornerRadius.md)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.CornerRadius.md)
                    .stroke(isSelected ? Theme.stretch : Theme.border, lineWidth: 2)
            )
        }
        .buttonStyle(PlainButtonStyle())
        .accessibilityLabel(durationLabel)
        .accessibilityHint(isSelected ? "Currently selected" : "Double tap to select")
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
    }
}

/// Active stretch session view
struct StretchActiveView: View {
    @ObservedObject var sessionManager: StretchSessionManager
    let onCancel: () -> Void

    var body: some View {
        VStack(spacing: Theme.Spacing.md) {
            // Progress indicator at top
            progressSection
                .padding(.top, Theme.Spacing.md)

            // Current stretch display
            if let stretch = sessionManager.currentStretch,
               let region = sessionManager.currentRegion {
                currentStretchSection(stretch: stretch, region: region)
            }

            // Segment indicator
            segmentIndicator

            // Timer
            timerSection

            Spacer()

            // Controls
            controlsSection
        }
        .padding(.horizontal, Theme.Spacing.md)
        .padding(.bottom, Theme.Spacing.md)
    }

    // MARK: - Progress Section

    @ViewBuilder
    private var progressSection: some View {
        VStack(spacing: Theme.Spacing.sm) {
            Text("Stretch \(sessionManager.currentStretchIndex + 1) of \(sessionManager.totalStretches)")
                .font(.subheadline)
                .foregroundColor(Theme.textSecondary)

            // Progress dots
            HStack(spacing: Theme.Spacing.xs) {
                ForEach(0..<sessionManager.totalStretches, id: \.self) { index in
                    Circle()
                        .fill(dotColor(for: index))
                        .frame(width: 8, height: 8)
                }
            }
        }
    }

    private func dotColor(for index: Int) -> Color {
        if index < sessionManager.currentStretchIndex {
            // Completed
            let completed = sessionManager.completedStretches[safe: index]
            if let completed = completed, completed.skippedSegments == 2 {
                return Theme.statusSkipped
            }
            return Theme.stretch
        } else if index == sessionManager.currentStretchIndex {
            // Current
            return Theme.stretch
        } else {
            // Pending
            return Theme.backgroundTertiary
        }
    }

    // MARK: - Current Stretch Section

    @ViewBuilder
    private func currentStretchSection(stretch: Stretch, region: BodyRegion) -> some View {
        VStack(spacing: Theme.Spacing.sm) {
            // Show stretch image if available, otherwise show icon
            if let imagePath = stretch.image,
               let uiImage = loadStretchImage(imagePath) {
                Image(uiImage: uiImage)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(maxWidth: .infinity, maxHeight: 280)
                    .cornerRadius(Theme.CornerRadius.md)
            } else {
                Image(systemName: region.iconName)
                    .font(.system(size: 80))
                    .foregroundColor(Theme.stretch)
            }

            Text(stretch.name)
                .font(.title2)
                .fontWeight(.bold)
                .foregroundColor(Theme.textPrimary)
                .multilineTextAlignment(.center)

            Text(region.displayName)
                .font(.subheadline)
                .foregroundColor(Theme.stretch)

            Text(stretch.description)
                .font(.caption)
                .foregroundColor(Theme.textSecondary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal)
        }
    }

    /// Load stretch image from bundle
    /// Image paths are like "back/childs-pose.png", stored in Audio/stretching/
    private func loadStretchImage(_ imagePath: String) -> UIImage? {
        let components = imagePath.components(separatedBy: "/")
        let filename = (components.last ?? imagePath) as NSString
        let filenameWithoutExt = filename.deletingPathExtension
        let ext = filename.pathExtension.isEmpty ? "png" : filename.pathExtension
        let folder = components.count > 1 ? components.dropLast().joined(separator: "/") : ""
        let subdirectory = folder.isEmpty ? "Audio/stretching" : "Audio/stretching/\(folder)"

        guard let url = Bundle.main.url(
            forResource: filenameWithoutExt,
            withExtension: ext,
            subdirectory: subdirectory
        ) else {
            return nil
        }

        return UIImage(contentsOfFile: url.path)
    }

    // MARK: - Segment Indicator

    @ViewBuilder
    private var segmentIndicator: some View {
        if let stretch = sessionManager.currentStretch {
            HStack(spacing: Theme.Spacing.md) {
                // Segment 1
                segmentPill(
                    number: 1,
                    label: stretch.bilateral ? "Left Side" : "First Half",
                    isActive: sessionManager.currentSegment == 1
                )

                // Segment 2
                segmentPill(
                    number: 2,
                    label: stretch.bilateral ? "Right Side" : "Second Half",
                    isActive: sessionManager.currentSegment == 2
                )
            }
        }
    }

    @ViewBuilder
    private func segmentPill(number: Int, label: String, isActive: Bool) -> some View {
        VStack(spacing: 4) {
            Text("Segment \(number)")
                .font(.caption2)
                .foregroundColor(isActive ? Theme.stretch : Theme.textSecondary)

            Text(label)
                .font(.caption)
                .fontWeight(isActive ? .semibold : .regular)
                .foregroundColor(isActive ? Theme.textPrimary : Theme.textSecondary)
        }
        .padding(.horizontal, Theme.Spacing.md)
        .padding(.vertical, Theme.Spacing.sm)
        .background(isActive ? Theme.stretch.opacity(0.2) : Theme.backgroundSecondary)
        .cornerRadius(Theme.CornerRadius.sm)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.CornerRadius.sm)
                .stroke(isActive ? Theme.stretch : Color.clear, lineWidth: 1)
        )
    }

    // MARK: - Timer Section

    @ViewBuilder
    private var timerSection: some View {
        VStack(spacing: Theme.Spacing.sm) {
            Text(formattedTime)
                .font(.system(size: 64, weight: .bold, design: .rounded))
                .foregroundColor(Theme.textPrimary)
                .monospacedDigit()
                .accessibilityLabel(timerAccessibilityLabel)

            if sessionManager.status == .paused {
                Text("PAUSED")
                    .font(.headline)
                    .foregroundColor(Theme.warning)
            }

            // Progress bar for current segment
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(Theme.backgroundTertiary)

                    Capsule()
                        .fill(Theme.stretch)
                        .frame(width: geometry.size.width * progressFraction)
                }
            }
            .frame(height: 4)
            .padding(.horizontal, Theme.Spacing.xl)
            .accessibilityHidden(true)  // Timer value already announced
        }
    }

    private var formattedTime: String {
        let totalSeconds = Int(sessionManager.segmentRemaining)
        let minutes = totalSeconds / 60
        let seconds = totalSeconds % 60
        return String(format: "%d:%02d", minutes, seconds)
    }

    private var progressFraction: Double {
        let total = sessionManager.segmentDuration
        guard total > 0 else { return 0 }
        return sessionManager.segmentElapsed / total
    }

    // MARK: - Controls Section

    @ViewBuilder
    private var controlsSection: some View {
        VStack(spacing: Theme.Spacing.md) {
            HStack(spacing: Theme.Spacing.xl) {
                // Skip Segment button
                Button(action: { sessionManager.skipSegment() }) {
                    Image(systemName: "forward.fill")
                        .font(.title3)
                        .foregroundColor(Theme.textSecondary)
                }
                .buttonStyle(GlassCircleButtonStyle(size: 56))
                .accessibilityLabel("Skip Segment")
                .accessibilityHint("Skip to the next segment of this stretch")

                // Pause/Resume button
                Button(action: {
                    if sessionManager.status == .paused {
                        sessionManager.resume()
                    } else {
                        sessionManager.pause()
                    }
                }) {
                    Image(systemName: sessionManager.status == .paused ? "play.fill" : "pause.fill")
                        .font(.title)
                        .foregroundColor(.white)
                }
                .buttonStyle(GlassPrimaryCircleButtonStyle(size: 80, color: Theme.stretch))
                .accessibilityLabel(sessionManager.status == .paused ? "Resume" : "Pause")
                .accessibilityHint(sessionManager.status == .paused ? "Resume the stretching session" : "Pause the stretching session")

                // End button
                Button(action: onCancel) {
                    Image(systemName: "stop.fill")
                        .font(.title3)
                        .foregroundColor(Theme.textSecondary)
                }
                .buttonStyle(GlassCircleButtonStyle(size: 56))
                .accessibilityLabel("End Session")
                .accessibilityHint("End the stretching session early")
            }

            // Skip entire stretch button
            Button(action: { sessionManager.skipStretch() }) {
                Text("Skip Entire Stretch")
                    .font(.subheadline)
            }
            .buttonStyle(GlassSecondaryButtonStyle())
            .accessibilityLabel("Skip Entire Stretch")
            .accessibilityHint("Skip both segments of this stretch and move to the next one")
        }
    }

    // MARK: - Accessibility Helpers

    private var timerAccessibilityLabel: String {
        let totalSeconds = Int(sessionManager.segmentRemaining)
        let minutes = totalSeconds / 60
        let seconds = totalSeconds % 60
        if minutes > 0 {
            return "\(minutes) minute\(minutes == 1 ? "" : "s") and \(seconds) second\(seconds == 1 ? "" : "s") remaining"
        } else {
            return "\(seconds) second\(seconds == 1 ? "" : "s") remaining"
        }
    }
}

/// Stretch session completion view
/// Note: Session saving is handled by the parent StretchView (like MeditationView pattern)
/// to avoid navigation issues when dismissing while async work is in progress.
struct StretchCompleteView: View {
    @ObservedObject var sessionManager: StretchSessionManager
    let isSaving: Bool
    let saveError: String?
    let onDone: () -> Void
    let onStartAnother: () -> Void
    let onRetrySync: () -> Void

    @State private var showSuccessAnimation = false

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(spacing: Theme.Spacing.xl) {
                    // Success header with icon
                    VStack(spacing: Theme.Spacing.md) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 80))
                            .foregroundColor(Theme.stretch)
                            .scaleEffect(showSuccessAnimation ? 1.0 : 0.5)
                            .opacity(showSuccessAnimation ? 1.0 : 0.0)
                            .accessibilityHidden(true)

                        Text("Great Stretch!")
                            .font(.largeTitle)
                            .fontWeight(.bold)
                            .foregroundColor(Theme.textPrimary)
                            .opacity(showSuccessAnimation ? 1.0 : 0.0)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("Stretching session complete. Great stretch!")
                    .onAppear {
                        withAnimation(.spring(response: 0.5, dampingFraction: 0.7)) {
                            showSuccessAnimation = true
                        }
                    }
                    .padding(.top, Theme.Spacing.xl)

                    // Stats
                    VStack(spacing: Theme.Spacing.md) {
                        StatRow(label: "Duration", value: formattedDuration, valueColor: Theme.stretch)
                        StatRow(label: "Stretches Completed", value: "\(completedCount)", valueColor: Theme.stretch)
                        if skippedCount > 0 {
                            StatRow(label: "Stretches Skipped", value: "\(skippedCount)", valueColor: Theme.statusSkipped)
                        }
                    }
                    .padding(Theme.Spacing.md)
                    .cardStyle()
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel(sessionSummaryAccessibilityLabel)

                    // Stretch breakdown
                    if !sessionManager.completedStretches.isEmpty {
                        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                            Text("Session Details")
                                .font(.headline)
                                .foregroundColor(Theme.textPrimary)
                                .padding(.bottom, Theme.Spacing.xs)

                            ForEach(sessionManager.completedStretches) { completed in
                                HStack {
                                    Image(systemName: completed.region.iconName)
                                        .foregroundColor(Theme.stretch)
                                        .frame(width: 24)
                                        .accessibilityHidden(true)

                                    Text(completed.stretchName)
                                        .font(.subheadline)
                                        .foregroundColor(Theme.textPrimary)

                                    Spacer()

                                    if completed.skippedSegments == 2 {
                                        Text("Skipped")
                                            .font(.caption)
                                            .foregroundColor(Theme.statusSkipped)
                                    } else if completed.skippedSegments == 1 {
                                        Text("Partial")
                                            .font(.caption)
                                            .foregroundColor(Theme.warning)
                                    } else {
                                        Image(systemName: "checkmark.circle.fill")
                                            .foregroundColor(Theme.stretch)
                                            .accessibilityHidden(true)
                                    }
                                }
                                .padding(.vertical, 4)
                                .accessibilityElement(children: .combine)
                                .accessibilityLabel(stretchAccessibilityLabel(for: completed))
                            }
                        }
                        .padding(Theme.Spacing.md)
                        .cardStyle()
                    }

                    // Save status indicator (matches MeditationCompleteView pattern)
                    syncStatusView
                }
                .padding(.horizontal, Theme.Spacing.md)
                .padding(.bottom, Theme.Spacing.md)
            }

            // Actions pinned at bottom
            VStack(spacing: Theme.Spacing.md) {
                Button(action: onDone) {
                    Text("Done")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(PrimaryButtonStyle())

                Button(action: onStartAnother) {
                    Text("Start Another Session")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(SecondaryButtonStyle())
            }
            .padding(Theme.Spacing.md)
        }
    }

    // MARK: - Sync Status

    @ViewBuilder
    private var syncStatusView: some View {
        HStack(spacing: Theme.Spacing.sm) {
            if isSaving {
                ProgressView()
                    .tint(Theme.stretch)
                Text("Saving session...")
                    .font(.caption)
                    .foregroundColor(Theme.textSecondary)
            } else if let error = saveError {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundColor(Theme.warning)
                Text(error)
                    .font(.caption)
                    .foregroundColor(Theme.warning)
                Button("Retry", action: onRetrySync)
                    .font(.caption)
                    .foregroundColor(Theme.accent)
            } else {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundColor(Theme.success)
                Text("Session saved")
                    .font(.caption)
                    .foregroundColor(Theme.textSecondary)
            }
        }
        .padding(Theme.Spacing.sm)
    }

    // MARK: - Computed Properties

    private var formattedDuration: String {
        guard let startTime = sessionManager.sessionStartTime else {
            return "0m"
        }
        let totalSeconds = Int(Date().timeIntervalSince(startTime))
        let minutes = totalSeconds / 60
        let seconds = totalSeconds % 60
        if seconds == 0 {
            return "\(minutes)m"
        }
        return "\(minutes)m \(seconds)s"
    }

    private var completedCount: Int {
        sessionManager.completedStretches.filter { $0.skippedSegments < 2 }.count
    }

    private var skippedCount: Int {
        sessionManager.completedStretches.filter { $0.skippedSegments == 2 }.count
    }

    // MARK: - Accessibility Helpers

    private var sessionSummaryAccessibilityLabel: String {
        var label = "Session summary: Duration \(formattedDuration), \(completedCount) stretches completed"
        if skippedCount > 0 {
            label += ", \(skippedCount) stretches skipped"
        }
        return label
    }

    private func stretchAccessibilityLabel(for completed: CompletedStretch) -> String {
        if completed.skippedSegments == 2 {
            return "\(completed.stretchName), skipped"
        } else if completed.skippedSegments == 1 {
            return "\(completed.stretchName), partially completed"
        } else {
            return "\(completed.stretchName), completed"
        }
    }
}

/// Simple stat row for completion view
struct StatRow: View {
    let label: String
    let value: String
    var valueColor: Color = Theme.textPrimary

    var body: some View {
        HStack {
            Text(label)
                .font(.subheadline)
                .foregroundColor(Theme.textSecondary)
            Spacer()
            Text(value)
                .font(.subheadline)
                .fontWeight(.semibold)
                .foregroundColor(valueColor)
        }
    }
}

// MARK: - App Return Wait View

/// View shown while waiting for user to return to the app
/// Shows different messaging based on whether Spotify was configured
struct AppReturnWaitView: View {
    let hasSpotify: Bool
    let onStartNow: () -> Void

    var body: some View {
        VStack(spacing: Theme.Spacing.xl) {
            Spacer()

            // Icon
            Image(systemName: hasSpotify ? "music.note.list" : "figure.flexibility")
                .font(.system(size: 60))
                .foregroundColor(Theme.stretch)

            Text(hasSpotify ? "Opening Spotify..." : "Get Ready!")
                .font(.title2)
                .fontWeight(.semibold)
                .foregroundColor(Theme.textPrimary)

            Text(hasSpotify
                ? "Come back here when your music is playing"
                : "Switch away to start your music, then come back")
                .font(.subheadline)
                .foregroundColor(Theme.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)

            Spacer()

            // Start now button
            Button(action: onStartNow) {
                Text("Start Now")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(SecondaryButtonStyle())
            .padding(.horizontal, Theme.Spacing.md)
            .padding(.bottom, Theme.Spacing.xl)
        }
        .padding(Theme.Spacing.md)
    }
}

// MARK: - Array Extension

extension Array {
    subscript(safe index: Index) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}

#Preview {
    StretchView()
        .environmentObject(AppState())
        .preferredColorScheme(.dark)
}
