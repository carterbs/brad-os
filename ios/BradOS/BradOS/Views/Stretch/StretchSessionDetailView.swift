import SwiftUI

/// Detail view for a completed stretch session accessed from history
struct StretchSessionDetailView: View {
    let sessionId: String

    @Environment(\.apiClient) private var apiClient
    @Environment(\.dismiss) private var dismiss

    @State private var session: StretchSession?
    @State private var isLoading = true
    @State private var error: String?

    var body: some View {
        ScrollView {
            if isLoading {
                LoadingView(message: "Loading session...")
                    .frame(minHeight: 300)
            } else if let error = error {
                ErrorStateView(message: error) {
                    Task { await loadSession() }
                }
                .frame(minHeight: 300)
            } else if let session = session {
                sessionContent(session)
            }
        }
        .background(Theme.background)
        .navigationTitle("Stretch Session")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await loadSession()
        }
    }

    // MARK: - Content

    @ViewBuilder
    private func sessionContent(_ session: StretchSession) -> some View {
        VStack(spacing: Theme.Spacing.lg) {
            // Summary card
            summaryCard(session)

            // Stretch list
            if let stretches = session.stretches, !stretches.isEmpty {
                stretchList(stretches)
            }
        }
        .padding(Theme.Spacing.md)
    }

    @ViewBuilder
    private func summaryCard(_ session: StretchSession) -> some View {
        VStack(spacing: Theme.Spacing.md) {
            // Date and time header
            VStack(spacing: Theme.Spacing.xs) {
                Text(formattedDate(session.completedAt))
                    .font(.headline)
                    .foregroundColor(Theme.textPrimary)

                Text(formattedTime(session.completedAt))
                    .font(.subheadline)
                    .foregroundColor(Theme.textSecondary)
            }

            Divider()
                .background(Theme.border)

            // Stats
            VStack(spacing: Theme.Spacing.sm) {
                StatRow(
                    label: "Duration",
                    value: session.formattedDuration,
                    valueColor: Theme.stretch
                )

                StatRow(
                    label: "Regions Completed",
                    value: "\(session.regionsCompleted)",
                    valueColor: Theme.stretch
                )

                if session.regionsSkipped > 0 {
                    StatRow(
                        label: "Regions Skipped",
                        value: "\(session.regionsSkipped)",
                        valueColor: Theme.statusSkipped
                    )
                }
            }
        }
        .padding(Theme.Spacing.md)
        .cardStyle()
    }

    @ViewBuilder
    private func stretchList(_ stretches: [CompletedStretch]) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            Text("Stretches")
                .font(.headline)
                .foregroundColor(Theme.textPrimary)
                .padding(.bottom, Theme.Spacing.xs)

            ForEach(stretches) { stretch in
                stretchRow(stretch)
            }
        }
        .padding(Theme.Spacing.md)
        .cardStyle()
    }

    @ViewBuilder
    private func stretchRow(_ stretch: CompletedStretch) -> some View {
        HStack {
            Image(systemName: stretch.region.iconName)
                .foregroundColor(Theme.stretch)
                .frame(width: 24)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                Text(stretch.stretchName)
                    .font(.subheadline)
                    .foregroundColor(stretch.skippedSegments == 2 ? Theme.textSecondary : Theme.textPrimary)

                Text("\(stretch.region.displayName) • \(stretch.durationSeconds / 60) min")
                    .font(.caption)
                    .foregroundColor(Theme.textSecondary)
            }

            Spacer()

            completionIndicator(for: stretch)
        }
        .padding(.vertical, 4)
        .opacity(stretch.skippedSegments == 2 ? 0.6 : 1.0)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(stretchAccessibilityLabel(for: stretch))
    }

    @ViewBuilder
    private func completionIndicator(for stretch: CompletedStretch) -> some View {
        if stretch.skippedSegments == 2 {
            Text("Skipped")
                .font(.caption)
                .foregroundColor(Theme.statusSkipped)
        } else if stretch.skippedSegments == 1 {
            Text("1/2")
                .font(.caption)
                .foregroundColor(Theme.warning)
        } else {
            Image(systemName: "checkmark.circle.fill")
                .foregroundColor(Theme.stretch)
                .accessibilityHidden(true)
        }
    }

    // MARK: - Data Loading

    private func loadSession() async {
        isLoading = true
        error = nil

        do {
            session = try await apiClient.getStretchSession(id: sessionId)
        } catch {
            self.error = "Failed to load session"
        }

        isLoading = false
    }

    // MARK: - Formatting Helpers

    private func formattedDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateStyle = .long
        return formatter.string(from: date)
    }

    private func formattedTime(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }

    private func stretchAccessibilityLabel(for stretch: CompletedStretch) -> String {
        if stretch.skippedSegments == 2 {
            return "\(stretch.stretchName), \(stretch.region.displayName), skipped"
        } else if stretch.skippedSegments == 1 {
            return "\(stretch.stretchName), \(stretch.region.displayName), partially completed"
        } else {
            return "\(stretch.stretchName), \(stretch.region.displayName), completed"
        }
    }
}

// MARK: - Previews

#Preview("Stretch Session Detail") {
    NavigationStack {
        StretchSessionDetailView(sessionId: "mock-session-id")
    }
    .environment(\.apiClient, MockAPIClient.withStretchSession())
    .preferredColorScheme(.dark)
}

#Preview("Stretch Session Detail - Loading") {
    NavigationStack {
        StretchSessionDetailView(sessionId: "mock-session-id")
    }
    .environment(\.apiClient, MockAPIClient.withDelay(10.0))
    .preferredColorScheme(.dark)
}

// MARK: - MockAPIClient Extension for Previews

private extension MockAPIClient {
    static func withStretchSession() -> MockAPIClient {
        let client = MockAPIClient()
        client.mockStretchSession = StretchSession(
            id: "mock-session-id",
            completedAt: Date(),
            totalDurationSeconds: 720,
            regionsCompleted: 6,
            regionsSkipped: 2,
            stretches: [
                CompletedStretch(region: .neck, stretchId: "neck-forward", stretchName: "Forward Tilt", durationSeconds: 60, skippedSegments: 0),
                CompletedStretch(region: .shoulders, stretchId: "shoulders-cross", stretchName: "Cross-Body Stretch", durationSeconds: 120, skippedSegments: 1),
                CompletedStretch(region: .back, stretchId: "back-cat-cow", stretchName: "Cat-Cow", durationSeconds: 60, skippedSegments: 0),
                CompletedStretch(region: .hipFlexors, stretchId: "hip-lunge", stretchName: "Lunge Stretch", durationSeconds: 120, skippedSegments: 2),
                CompletedStretch(region: .hamstrings, stretchId: "hamstring-seated", stretchName: "Seated Forward Fold", durationSeconds: 60, skippedSegments: 0),
                CompletedStretch(region: .calves, stretchId: "calves-wall", stretchName: "Wall Stretch", durationSeconds: 60, skippedSegments: 0),
            ]
        )
        return client
    }
}
