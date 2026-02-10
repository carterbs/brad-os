import SwiftUI

/// View for manually triggering HealthKit to Firebase sync for individual data types
struct HealthSyncView: View {
    @EnvironmentObject var healthKit: HealthKitManager
    @State private var syncService: HealthKitSyncService?
    @State private var syncingType: SyncType?
    @State private var lastResult: String?
    @State private var showResetConfirm = false

    private enum SyncType: String {
        case all = "All"
        case recovery = "Recovery"
        case weight = "Weight"
        case hrv = "HRV"
        case rhr = "RHR"
        case sleep = "Sleep"
    }

    var body: some View {
        ScrollView {
            VStack(spacing: Theme.Spacing.space6) {
                // Status
                statusSection

                // Sync Buttons
                syncButtonsSection

                // Backfill Reset
                backfillSection
            }
            .padding(Theme.Spacing.space5)
        }
        .background(AuroraBackground().ignoresSafeArea())
        .navigationTitle("Health Sync")
        .navigationBarTitleDisplayMode(.large)
        .toolbarBackground(.hidden, for: .navigationBar)
        .onAppear {
            syncService = HealthKitSyncService(healthKitManager: healthKit)
        }
        .alert("Reset Backfill?", isPresented: $showResetConfirm) {
            Button("Reset", role: .destructive) {
                syncService?.resetBackfill()
                lastResult = "Backfill flags reset. Next sync will re-sync all historical data."
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This will clear backfill flags so the next sync re-downloads all historical HRV, RHR, and sleep data from HealthKit (up to 10 years).")
        }
    }

    // MARK: - Status Section

    private var statusSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space3) {
            HStack(spacing: Theme.Spacing.space2) {
                Image(systemName: "arrow.triangle.2.circlepath")
                    .font(.system(size: Theme.Typography.cardHeaderIcon))
                    .foregroundColor(Theme.interactivePrimary)
                    .frame(width: Theme.Dimensions.iconFrameMD, height: Theme.Dimensions.iconFrameMD)
                    .background(Theme.interactivePrimary.opacity(0.12))
                    .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))

                Text("Sync Status")
                    .font(.title3)
                    .fontWeight(.semibold)
                    .foregroundColor(Theme.textPrimary)
            }

            if let result = lastResult {
                Text(result)
                    .font(.subheadline)
                    .foregroundColor(Theme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if syncingType != nil {
                HStack(spacing: Theme.Spacing.space2) {
                    ProgressView()
                        .tint(Theme.interactivePrimary)
                    Text("Syncing \(syncingType?.rawValue ?? "")...")
                        .font(.subheadline)
                        .foregroundColor(Theme.textSecondary)
                }
            }

            if let lastSync = syncService?.lastSyncDate {
                HStack(spacing: Theme.Spacing.space2) {
                    Image(systemName: "clock")
                        .font(.caption)
                        .foregroundColor(Theme.textTertiary)
                    Text("Last sync: \(lastSync, style: .relative) ago")
                        .font(.caption)
                        .foregroundColor(Theme.textTertiary)
                }
            }

            if let error = syncService?.lastError {
                HStack(alignment: .top, spacing: Theme.Spacing.space2) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.caption)
                        .foregroundColor(Theme.destructive)
                    Text(error)
                        .font(.caption)
                        .foregroundColor(Theme.destructive)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .glassCard()
    }

    // MARK: - Sync Buttons

    private var syncButtonsSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            SectionHeader(title: "Force Sync")

            VStack(spacing: 0) {
                syncRow(
                    title: "Sync All",
                    subtitle: "Recovery, weight, HRV, RHR, and sleep",
                    icon: "arrow.triangle.2.circlepath",
                    color: Theme.interactivePrimary,
                    type: .all
                )

                Divider().background(Theme.divider)

                syncRow(
                    title: "Recovery",
                    subtitle: "Today's HRV, RHR, sleep score",
                    icon: "heart.text.square.fill",
                    color: Theme.success,
                    type: .recovery
                )

                Divider().background(Theme.divider)

                syncRow(
                    title: "Weight",
                    subtitle: "Last 90 days from HealthKit",
                    icon: "scalemass.fill",
                    color: Theme.textSecondary,
                    type: .weight
                )

                Divider().background(Theme.divider)

                syncRow(
                    title: "HRV",
                    subtitle: "Heart rate variability history",
                    icon: "waveform.path.ecg",
                    color: Theme.interactivePrimary,
                    type: .hrv
                )

                Divider().background(Theme.divider)

                syncRow(
                    title: "RHR",
                    subtitle: "Resting heart rate history",
                    icon: "heart.fill",
                    color: Theme.destructive,
                    type: .rhr
                )

                Divider().background(Theme.divider)

                syncRow(
                    title: "Sleep",
                    subtitle: "Sleep stages and duration history",
                    icon: "bed.double.fill",
                    color: Theme.interactiveSecondary,
                    type: .sleep
                )
            }
            .glassCard(.card, padding: 0)
        }
    }

    private func syncRow(
        title: String,
        subtitle: String,
        icon: String,
        color: Color,
        type: SyncType
    ) -> some View {
        Button {
            Task { await performSync(type: type) }
        } label: {
            HStack(spacing: Theme.Spacing.space4) {
                Image(systemName: icon)
                    .foregroundColor(color)
                    .frame(width: 24)

                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.headline)
                        .foregroundColor(Theme.textPrimary)
                    Text(subtitle)
                        .font(.subheadline)
                        .foregroundColor(Theme.textSecondary)
                }

                Spacer()

                if syncingType == type {
                    ProgressView()
                        .tint(color)
                } else {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(Theme.textTertiary)
                }
            }
            .padding(Theme.Spacing.space4)
            .frame(minHeight: Theme.Dimensions.listRowMinHeight)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(syncingType != nil)
    }

    // MARK: - Backfill Section

    private var backfillSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            SectionHeader(title: "Advanced")

            VStack(spacing: 0) {
                Button {
                    showResetConfirm = true
                } label: {
                    HStack(spacing: Theme.Spacing.space4) {
                        Image(systemName: "clock.arrow.trianglehead.counterclockwise.rotate.90")
                            .foregroundColor(Theme.warning)
                            .frame(width: 24)

                        VStack(alignment: .leading, spacing: 2) {
                            Text("Reset Backfill")
                                .font(.headline)
                                .foregroundColor(Theme.textPrimary)
                            Text("Re-sync all historical data on next sync")
                                .font(.subheadline)
                                .foregroundColor(Theme.textSecondary)
                        }

                        Spacer()
                    }
                    .padding(Theme.Spacing.space4)
                    .frame(minHeight: Theme.Dimensions.listRowMinHeight)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            .glassCard(.card, padding: 0)
        }
    }

    // MARK: - Sync Logic

    private func performSync(type: SyncType) async {
        guard let service = syncService else { return }
        syncingType = type
        lastResult = nil

        let startTime = Date()

        switch type {
        case .all:
            await service.sync()
        case .recovery:
            await service.forceSyncRecovery()
        case .weight:
            await service.forceSyncWeight()
        case .hrv:
            await service.forceSyncHRV()
        case .rhr:
            await service.forceSyncRHR()
        case .sleep:
            await service.forceSyncSleep()
        }

        let duration = Date().timeIntervalSince(startTime)
        syncingType = nil

        if let error = service.lastError {
            lastResult = "\(type.rawValue) sync failed: \(error)"
        } else {
            lastResult = "\(type.rawValue) synced in \(String(format: "%.1f", duration))s"
        }
    }
}
