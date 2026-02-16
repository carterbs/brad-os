import SwiftUI
import Charts

// MARK: - Cycling Block View

/// Training block overview with week indicator, FTP, goals, and charts
struct CyclingBlockView: View {
    @EnvironmentObject var viewModel: CyclingViewModel
    @State private var showNewBlockSheet = false
    @State private var showBlockCompletedSheet = false
    @State private var showBlockError = false

    var body: some View {
        ScrollView {
            VStack(spacing: Theme.Spacing.space4) {
                if let block = viewModel.currentBlock {
                    // Check if block has ended
                    if shouldShowBlockCompletion(block: block) {
                        BlockCompletedCard(
                            block: block,
                            onStartNew: { showNewBlockSheet = true }
                        )
                    } else {
                        // Week indicator
                        WeekIndicatorCard(block: block)

                        // Session queue (if weekly sessions available)
                        if block.weeklySessions != nil {
                            SessionQueueCard(
                                block: block,
                                sessionsCompleted: viewModel.sessionsCompletedThisWeek,
                                activities: viewModel.activities
                            )

                            // Next Up card
                            if let nextSession = viewModel.nextSession {
                                NextUpCard(
                                    session: nextSession,
                                    weekProgress: "\(viewModel.sessionsCompletedThisWeek + 1) of \(viewModel.weeklySessionsTotal)"
                                )
                            } else if viewModel.sessionsCompletedThisWeek >= viewModel.weeklySessionsTotal
                                        && viewModel.weeklySessionsTotal > 0 {
                                WeekCompleteCard(sessionsTotal: viewModel.weeklySessionsTotal)
                            }
                        }

                        // FTP card with staleness warning
                        if let ftp = viewModel.currentFTP {
                            FTPCardWithWarning(
                                ftp: ftp,
                                ftpLastTested: viewModel.ftpLastTested,
                                currentWeek: block.currentWeek
                            )
                        }

                        // Training load
                        if let load = viewModel.trainingLoad {
                            TrainingLoadCard(load: load)
                        }

                        // VO2 Max estimate
                        if let vo2max = viewModel.vo2maxEstimate {
                            VO2MaxCard(
                                estimate: vo2max,
                                history: viewModel.vo2maxHistory
                            )
                        }

                        // Efficiency Factor trend
                        if !viewModel.efHistory.isEmpty {
                            EfficiencyFactorChart(data: viewModel.efHistory)
                        }

                        // TSS history chart
                        if let tssHistory = viewModel.tssHistory, !tssHistory.isEmpty {
                            TSSHistoryChart(data: tssHistory)
                        }

                        // CTL/ATL/TSB trend chart
                        if let loadHistory = viewModel.loadHistory, !loadHistory.isEmpty {
                            TrainingLoadTrendChart(data: loadHistory)
                        }
                    }
                } else {
                    // No active block
                    NoBlockCard(onStartBlock: { showNewBlockSheet = true })
                }
            }
            .padding(Theme.Spacing.space5)
        }
        .sheet(isPresented: $showNewBlockSheet) {
            NavigationStack {
                TrainingBlockSetupView()
                    .environmentObject(viewModel)
                    .navigationTitle("New Block")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbarBackground(.hidden, for: .navigationBar)
                    .toolbar {
                        ToolbarItem(placement: .navigationBarLeading) {
                            Button("Cancel") {
                                showNewBlockSheet = false
                            }
                            .foregroundColor(Theme.textSecondary)
                        }
                    }
            }
        }
        .alert("Error", isPresented: $showBlockError) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(viewModel.error ?? "Failed to create training block. Please try again.")
        }
        .onAppear {
            checkBlockCompletion()
        }
        .onChange(of: viewModel.currentBlock?.id) { _, _ in
            if viewModel.currentBlock != nil {
                showNewBlockSheet = false
            }
        }
    }

    // MARK: - Block Completion Check

    private func shouldShowBlockCompletion(block: TrainingBlockModel) -> Bool {
        return block.currentWeek > 8 || Date() > block.endDate
    }

    private func checkBlockCompletion() {
        if let block = viewModel.currentBlock, shouldShowBlockCompletion(block: block) {
            Task {
                await viewModel.completeCurrentBlock()
            }
        }
    }
}

// MARK: - Session Queue Card

/// Shows this week's session queue with completion status
struct SessionQueueCard: View {
    let block: TrainingBlockModel
    let sessionsCompleted: Int
    let activities: [CyclingActivityModel]

    var sessions: [WeeklySessionModel] {
        block.weeklySessions ?? []
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space3) {
            HStack {
                Text("This Week")
                    .font(.title3)
                    .fontWeight(.semibold)
                    .foregroundColor(Theme.textPrimary)

                Spacer()

                Text("\(sessionsCompleted) of \(sessions.count) done")
                    .font(.caption)
                    .fontWeight(.medium)
                    .foregroundStyle(Theme.textSecondary)
            }

            VStack(spacing: Theme.Spacing.space2) {
                ForEach(Array(sessions.enumerated()), id: \.element.id) { index, session in
                    let isCompleted = index < sessionsCompleted
                    let isNext = index == sessionsCompleted

                    HStack(spacing: Theme.Spacing.space3) {
                        if isCompleted {
                            Image(systemName: "checkmark.circle.fill")
                                .font(.subheadline)
                                .foregroundStyle(Theme.success)
                        } else {
                            Circle()
                                .strokeBorder(isNext ? Theme.interactivePrimary : Theme.textTertiary, lineWidth: 1.5)
                                .frame(width: 18, height: 18)
                        }

                        Image(systemName: session.systemImage)
                            .font(.caption)
                            .foregroundStyle(colorForSessionType(session.sessionType))
                            .frame(width: 16)

                        Text(session.displayName)
                            .font(.subheadline)
                            .fontWeight(isNext ? .semibold : .regular)
                            .foregroundColor(isCompleted ? Theme.textSecondary : Theme.textPrimary)

                        Spacer()

                        if isCompleted {
                            Text(completedDayLabel(for: index))
                                .font(.caption)
                                .foregroundStyle(Theme.textTertiary)
                        } else if isNext {
                            Text("Up next")
                                .font(.caption)
                                .fontWeight(.medium)
                                .foregroundStyle(Theme.interactivePrimary)
                        }
                    }
                    .padding(.vertical, Theme.Spacing.space1)
                    .opacity(isCompleted ? 0.7 : (isNext ? 1.0 : 0.5))
                }
            }
        }
        .glassCard()
    }

    private func completedDayLabel(for index: Int) -> String {
        let calendar = Calendar.current
        let startOfWeek = calendar.dateInterval(of: .weekOfYear, for: Date())?.start ?? Date()
        let thisWeekActivities = activities.filter { $0.date >= startOfWeek }.sorted { $0.date < $1.date }

        guard index < thisWeekActivities.count else { return "Done" }
        let formatter = DateFormatter()
        formatter.dateFormat = "EEE"
        return "Done \(formatter.string(from: thisWeekActivities[index].date))"
    }

    private func colorForSessionType(_ type: String) -> Color {
        switch SessionType(rawValue: type) {
        case .vo2max: return Theme.destructive
        case .threshold: return Theme.warning
        case .endurance: return Theme.info
        case .tempo: return Color.orange
        case .fun: return Theme.success
        case .recovery: return Theme.info
        case .off: return Theme.textSecondary
        case .none: return Theme.textSecondary
        }
    }
}

// MARK: - Next Up Card

/// Prominent card for the next incomplete session
struct NextUpCard: View {
    let session: WeeklySessionModel
    let weekProgress: String

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space3) {
            HStack {
                Text("Next Up")
                    .font(.caption)
                    .fontWeight(.semibold)
                    .foregroundStyle(Theme.interactivePrimary)
                Spacer()
                Text("Session \(weekProgress)")
                    .font(.caption)
                    .foregroundStyle(Theme.textSecondary)
            }

            HStack(spacing: Theme.Spacing.space3) {
                Image(systemName: session.systemImage)
                    .font(.title2)
                    .foregroundStyle(sessionColor)

                VStack(alignment: .leading, spacing: 2) {
                    Text(session.displayName)
                        .font(.headline)
                        .foregroundColor(Theme.textPrimary)

                    Text(session.pelotonClassTypes.joined(separator: ", "))
                        .font(.caption)
                        .foregroundStyle(Theme.textSecondary)
                        .lineLimit(1)
                }

                Spacer()

                Text("\(session.suggestedDurationMinutes) min")
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .foregroundStyle(Theme.textSecondary)
            }

            if !session.description.isEmpty {
                Text(session.description)
                    .font(.caption)
                    .foregroundStyle(Theme.textSecondary)
            }
        }
        .glassCard()
        .auroraGlow(sessionColor)
    }

    private var sessionColor: Color {
        switch SessionType(rawValue: session.sessionType) {
        case .vo2max: return Theme.destructive
        case .threshold: return Theme.warning
        case .endurance: return Theme.info
        case .tempo: return Color.orange
        case .fun: return Theme.success
        case .recovery: return Theme.info
        default: return Theme.interactivePrimary
        }
    }
}

// MARK: - Week Complete Card

/// Shown when all weekly sessions are done
struct WeekCompleteCard: View {
    let sessionsTotal: Int

    var body: some View {
        HStack(spacing: Theme.Spacing.space3) {
            Image(systemName: "checkmark.circle.fill")
                .font(.title2)
                .foregroundStyle(Theme.success)

            Text("All \(sessionsTotal) sessions done this week. Nice work.")
                .font(.subheadline)
                .foregroundColor(Theme.textPrimary)

            Spacer()
        }
        .glassCard()
        .auroraGlow(Theme.success)
    }
}

// MARK: - Previews

#Preview("With Block") {
    CyclingBlockView()
        .environmentObject(CyclingViewModel())
        .background(AuroraBackground().ignoresSafeArea())
        .preferredColorScheme(.dark)
}

#Preview("Without Block") {
    CyclingBlockView()
        .environmentObject(CyclingViewModel())
        .background(AuroraBackground().ignoresSafeArea())
        .preferredColorScheme(.dark)
}
