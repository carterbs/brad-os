import SwiftUI
import BradOSCore

struct GuidedMeditationBrowserView: View {
    let onSelectScript: (GuidedMeditationScript) -> Void
    let onBack: () -> Void

    @StateObject private var service = ServiceFactory.makeGuidedMeditationService()
    @State private var isLoading: Bool = true
    @State private var loadError: Error?
    @State private var completedScriptIds: Set<String> = []

    private let apiClient: APIClientProtocol = DefaultAPIClient.instance

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Button(action: onBack) {
                    HStack(spacing: 4) {
                        Image(systemName: "chevron.left")
                        Text("Back")
                    }
                    .foregroundColor(Theme.interactivePrimary)
                }

                Spacer()
            }
            .padding(.horizontal, Theme.Spacing.space4)
            .padding(.top, Theme.Spacing.space2)

            if isLoading {
                Spacer()
                ProgressView()
                    .tint(Theme.meditation)
                Text("Loading meditations...")
                    .font(.caption)
                    .foregroundColor(Theme.textSecondary)
                    .padding(.top, Theme.Spacing.space2)
                Spacer()
            } else if let error = loadError {
                Spacer()
                VStack(spacing: Theme.Spacing.space4) {
                    Image(systemName: "exclamationmark.triangle")
                        .font(.largeTitle)
                        .foregroundColor(Theme.warning)
                    Text("Failed to load meditations")
                        .font(.headline)
                        .foregroundColor(Theme.textPrimary)
                    Text(error.localizedDescription)
                        .font(.caption)
                        .foregroundColor(Theme.textSecondary)
                        .multilineTextAlignment(.center)
                    Button("Retry") {
                        loadScripts()
                    }
                    .buttonStyle(SecondaryButtonStyle())
                }
                .padding(Theme.Spacing.space4)
                Spacer()
            } else {
                // Title area
                VStack(spacing: Theme.Spacing.space2) {
                    Text("Reactivity Series")
                        .font(.title2)
                        .fontWeight(.bold)
                        .foregroundColor(Theme.textPrimary)
                    Text("14 guided meditations for parents")
                        .font(.subheadline)
                        .foregroundColor(Theme.textSecondary)

                    if !completedScriptIds.isEmpty {
                        Text("\(completedScriptIds.count)/\(service.scripts.count) completed")
                            .font(.caption)
                            .fontWeight(.medium)
                            .foregroundColor(Theme.meditation)
                            .padding(.top, 2)
                    }
                }
                .padding(.top, Theme.Spacing.space4)
                .padding(.bottom, Theme.Spacing.space2)

                // Script List
                ScrollView {
                    LazyVStack(spacing: Theme.Spacing.space3) {
                        ForEach(Array(service.scripts.enumerated()), id: \.element.id) { index, script in
                            let isCompleted = completedScriptIds.contains(script.id)
                            Button(action: { onSelectScript(script) }, label: {
                                HStack(spacing: Theme.Spacing.space4) {
                                    // Order number or checkmark
                                    if isCompleted {
                                        Image(systemName: "checkmark.circle.fill")
                                            .font(.title3)
                                            .foregroundColor(Theme.success)
                                            .frame(width: 32)
                                    } else {
                                        Text("\(index + 1)")
                                            .font(.title3)
                                            .fontWeight(.bold)
                                            .foregroundColor(Theme.meditation.opacity(0.6))
                                            .frame(width: 32)
                                    }

                                    // Title and subtitle
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(script.title)
                                            .font(.subheadline)
                                            .fontWeight(.medium)
                                            .foregroundColor(Theme.textPrimary)
                                            .lineLimit(1)
                                        Text(script.subtitle)
                                            .font(.caption)
                                            .foregroundColor(Theme.textSecondary)
                                            .lineLimit(2)
                                    }

                                    Spacer()

                                    // Duration badge
                                    Text(script.formattedDuration)
                                        .font(.caption2)
                                        .fontWeight(.medium)
                                        .foregroundColor(Theme.textSecondary)
                                        .padding(.horizontal, 8)
                                        .padding(.vertical, 4)
                                        .background(Theme.meditation.opacity(0.1))
                                        .clipShape(Capsule())

                                    Image(systemName: "chevron.right")
                                        .font(.caption)
                                        .foregroundColor(Theme.textSecondary)
                                }
                                .glassCard()
                            })
                            .buttonStyle(PlainButtonStyle())
                        }
                    }
                    .padding(.horizontal, Theme.Spacing.space4)
                    .padding(.bottom, Theme.Spacing.space4)
                }
            }
        }
        .onAppear {
            loadScripts()
            loadCompletedSessions()
        }
    }

    private func loadScripts() {
        isLoading = true
        loadError = nil
        Task {
            do {
                try await service.loadScripts(category: "reactivity")
                isLoading = false
            } catch {
                loadError = error
                isLoading = false
            }
        }
    }

    private func loadCompletedSessions() {
        Task {
            do {
                let sessions = try await apiClient.getMeditationSessions()
                let reactivityIds = sessions
                    .filter { $0.completedFully && $0.sessionType.hasPrefix("reactivity-") }
                    .map { String($0.sessionType.dropFirst("reactivity-".count)) }
                await MainActor.run {
                    completedScriptIds = Set(reactivityIds)
                }
            } catch {
                // Silently fail - completion tracking is non-critical
            }
        }
    }
}
