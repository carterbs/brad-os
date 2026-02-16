import SwiftUI
import BradOSCore

/// Setup view for configuring stretch session
struct StretchSetupView: View {
    @Binding var config: StretchSessionConfig
    var isLoadingData: Bool = false
    var hasDataError: Bool = false
    let onStart: () -> Void
    var onConfigChange: (() -> Void)?
    var onRetryLoad: (() -> Void)?

    @State private var spotifyUrl: String = ""
    @State private var editMode: EditMode = .inactive

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(spacing: Theme.Spacing.space6) {
                    // Data loading status
                    if isLoadingData {
                        HStack(spacing: Theme.Spacing.space2) {
                            ProgressView()
                                .tint(Theme.stretch)
                            Text("Loading stretch data...")
                                .font(.caption)
                                .foregroundColor(Theme.textSecondary)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(Theme.Spacing.space3)
                        .glassCard()
                    } else if hasDataError {
                        HStack(spacing: Theme.Spacing.space2) {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .foregroundColor(Theme.warning)
                            Text("Could not load stretch data")
                                .font(.caption)
                                .foregroundColor(Theme.warning)
                            Spacer()
                            if let onRetryLoad {
                                Button("Retry", action: onRetryLoad)
                                    .font(.caption)
                                    .foregroundColor(Theme.interactivePrimary)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(Theme.Spacing.space3)
                        .glassCard()
                    }

                    // Region Selection with reordering
                    regionSelectionSection

                    // Duration Selection
                    durationSection

                    // Spotify Integration
                    spotifySection

                    // Start Button
                    startButton
                }
                .padding(Theme.Spacing.space4)
                .padding(.bottom, Theme.Spacing.space8)
            }
        }
        .onAppear {
            spotifyUrl = config.spotifyPlaylistUrl ?? ""
        }
    }

    // MARK: - Region Selection

    @ViewBuilder
    private var regionSelectionSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            HStack {
                SectionHeader(title: "Body Regions")

                Spacer()

                Button(
                    action: {
                        editMode = editMode == .active ? .inactive : .active
                    },
                    label: {
                        Text(editMode == .active ? "Done" : "Reorder")
                            .font(.caption)
                            .foregroundColor(Theme.interactivePrimary)
                            .frame(minHeight: 44)
                            .contentShape(Rectangle())
                    }
                )

                Button(action: toggleAll) {
                    Text(allSelected ? "Deselect All" : "Select All")
                        .font(.caption)
                        .foregroundColor(Theme.interactivePrimary)
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                }
            }

            if editMode == .active {
                // List mode for drag-drop reordering
                reorderableRegionList
            } else {
                // Grid mode for normal viewing
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: Theme.Spacing.space2) {
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
                                let current = config.regions[index].durationSeconds
                                config.regions[index].durationSeconds = current == 60 ? 120 : 60
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
        VStack(spacing: Theme.Spacing.space1) {
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
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            SectionHeader(title: "Default Duration")

            HStack(spacing: Theme.Spacing.space4) {
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
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            SectionHeader(title: "Spotify Playlist (Optional)")

            TextField("Paste Spotify playlist URL", text: $spotifyUrl)
                .textFieldStyle(.plain)
                .padding(Theme.Spacing.space4)
                .background(Color.white.opacity(0.06))
                .background(.ultraThinMaterial)
                .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.md, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.CornerRadius.md, style: .continuous)
                        .stroke(Theme.strokeSubtle, lineWidth: 1)
                )
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

        VStack(spacing: Theme.Spacing.space2) {
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
        .padding(.top, Theme.Spacing.space4)
    }
}

/// Toggle card for a body region -- filter chip style
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
                    .font(.footnote)
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
                            .padding(.horizontal, Theme.Spacing.space2)
                            .padding(.vertical, Theme.Spacing.space1)
                            .background(Theme.stretch.opacity(0.2))
                            .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))
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
            .padding(Theme.Spacing.space4)
            .background(Color.white.opacity(0.06))
            .background(.ultraThinMaterial)
            .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.md, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.CornerRadius.md, style: .continuous)
                    .stroke(Theme.strokeSubtle, lineWidth: 1)
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
        HStack(spacing: Theme.Spacing.space2) {
            // Position indicator
            Text("\(index + 1)")
                .font(.caption)
                .foregroundColor(Theme.textSecondary)
                .frame(width: Theme.Dimensions.iconFrameSM)

            // Region info
            Image(systemName: config.region.iconName)
                .foregroundColor(config.enabled ? Theme.stretch : Theme.textSecondary)
                .frame(width: Theme.Dimensions.iconFrameMD)

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
                .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))
                .foregroundColor(Theme.stretch)

            // Enabled toggle
            Button(
                action: { config.enabled.toggle() },
                label: {
                    Image(systemName: config.enabled ? "checkmark.circle.fill" : "circle")
                        .foregroundColor(config.enabled ? Theme.stretch : Theme.textSecondary)
                }
            )

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
                        .foregroundColor(
                            index == totalCount - 1 ? Theme.textSecondary.opacity(0.3) : Theme.textSecondary
                        )
                }
                .disabled(index == totalCount - 1)
            }
        }
        .padding(Theme.Spacing.space2)
        .background(
            config.enabled
                ? AnyShapeStyle(.ultraThinMaterial)
                : AnyShapeStyle(Color.white.opacity(0.06))
        )
        .background(config.enabled ? Theme.stretch.opacity(0.1) : Color.clear)
        .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous)
                .stroke(Theme.strokeSubtle, lineWidth: 1)
        )
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
            .padding(Theme.Spacing.space4)
            .background(
                isSelected
                    ? AnyShapeStyle(.ultraThinMaterial)
                    : AnyShapeStyle(Color.white.opacity(0.06))
            )
            .background(isSelected ? Theme.stretch.opacity(0.18) : Color.clear)
            .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.md, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.CornerRadius.md, style: .continuous)
                    .stroke(isSelected ? Theme.stretch.opacity(0.50) : Color.white.opacity(0.10), lineWidth: 2)
            )
        }
        .buttonStyle(PlainButtonStyle())
        .accessibilityLabel(durationLabel)
        .accessibilityHint(isSelected ? "Currently selected" : "Double tap to select")
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
    }
}
