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
                                NextUpCard(session: nextSession, weekProgress: "\(viewModel.sessionsCompletedThisWeek + 1) of \(viewModel.weeklySessionsTotal)")
                            } else if viewModel.sessionsCompletedThisWeek >= viewModel.weeklySessionsTotal && viewModel.weeklySessionsTotal > 0 {
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

// MARK: - Week Indicator Card

/// Card showing current week in training block
struct WeekIndicatorCard: View {
    let block: TrainingBlockModel

    var phaseName: String {
        switch block.currentWeek {
        case 1...2: return "Adaptation"
        case 3...4: return "Build"
        case 5: return "Recovery"
        case 6...7: return "Peak"
        case 8: return "Test"
        default: return "Training"
        }
    }

    var phaseColor: Color {
        switch block.currentWeek {
        case 1...2: return Theme.info
        case 3...4: return Theme.warning
        case 5: return Theme.success
        case 6...7: return Theme.interactivePrimary
        case 8: return Theme.destructive
        default: return Theme.textSecondary
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space3) {
            // Header
            HStack {
                Text("Week \(block.currentWeek) of 8")
                    .font(.title2)
                    .fontWeight(.bold)
                    .foregroundColor(Theme.textPrimary)

                Spacer()

                Text(phaseName)
                    .font(.caption)
                    .fontWeight(.medium)
                    .padding(.horizontal, Theme.Spacing.space2)
                    .padding(.vertical, Theme.Spacing.space1)
                    .background(phaseColor.opacity(0.2))
                    .foregroundStyle(phaseColor)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))
            }

            // Progress bar
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    // Track
                    RoundedRectangle(cornerRadius: 4, style: .continuous)
                        .fill(Color.white.opacity(0.06))
                        .frame(height: 8)

                    // Fill
                    RoundedRectangle(cornerRadius: 4, style: .continuous)
                        .fill(
                            LinearGradient(
                                colors: [Theme.interactivePrimary, Theme.interactiveSecondary],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                        .frame(width: geometry.size.width * CGFloat(block.currentWeek) / 8, height: 8)
                }
            }
            .frame(height: 8)

            // Goals
            HStack(spacing: Theme.Spacing.space2) {
                ForEach(block.goals, id: \.self) { goal in
                    Text(goal.displayName)
                        .font(.caption)
                        .fontWeight(.medium)
                        .padding(.horizontal, Theme.Spacing.space2)
                        .padding(.vertical, Theme.Spacing.space1)
                        .background(Color.white.opacity(0.06))
                        .foregroundStyle(Theme.textSecondary)
                        .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))
                }
            }
        }
        .glassCard()
        .auroraGlow(phaseColor)
    }
}

// MARK: - Training Goal Display Name

extension TrainingBlockModel.TrainingGoal {
    var displayName: String {
        switch self {
        case .regainFitness: return "Regain Fitness"
        case .maintainMuscle: return "Maintain Muscle"
        case .loseWeight: return "Lose Weight"
        }
    }
}

// MARK: - FTP Card with Warning

/// Card displaying current FTP with staleness warning
struct FTPCardWithWarning: View {
    let ftp: Int
    let ftpLastTested: Date?
    let currentWeek: Int

    private var isFTPStale: Bool {
        guard let lastTested = ftpLastTested else { return true }
        let weeksSinceTest = Calendar.current.dateComponents([.weekOfYear], from: lastTested, to: Date()).weekOfYear ?? 0
        return weeksSinceTest > 4
    }

    private var isRecoveryWeek: Bool {
        currentWeek == 4 || currentWeek == 8
    }

    private var shouldSuggestFTPTest: Bool {
        isFTPStale && isRecoveryWeek
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space3) {
            HStack {
                VStack(alignment: .leading, spacing: Theme.Spacing.space1) {
                    Text("FTP")
                        .font(.subheadline)
                        .foregroundStyle(Theme.textSecondary)
                    HStack(alignment: .firstTextBaseline, spacing: 4) {
                        Text("\(ftp)")
                            .font(.system(size: 32, weight: .bold, design: .rounded))
                            .monospacedDigit()
                            .foregroundColor(Theme.textPrimary)
                        Text("watts")
                            .font(.subheadline)
                            .foregroundStyle(Theme.textSecondary)
                    }
                }
                Spacer()
                Image(systemName: "bolt.fill")
                    .font(.system(size: 28))
                    .foregroundStyle(.yellow)
            }

            // FTP staleness warning
            if isFTPStale {
                HStack(spacing: Theme.Spacing.space2) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.caption)
                        .foregroundStyle(Theme.warning)
                    Text(ftpWarningMessage)
                        .font(.caption)
                        .foregroundStyle(Theme.warning)
                    Spacer()
                }
                .padding(Theme.Spacing.space2)
                .background(Theme.warning.opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))
            }

            // FTP test suggestion during recovery week
            if shouldSuggestFTPTest {
                HStack(spacing: Theme.Spacing.space2) {
                    Image(systemName: "chart.bar.fill")
                        .font(.caption)
                        .foregroundStyle(Theme.info)
                    Text("This is a recovery week - great time for an FTP test!")
                        .font(.caption)
                        .foregroundStyle(Theme.info)
                    Spacer()
                }
                .padding(Theme.Spacing.space2)
                .background(Theme.info.opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))
            }
        }
        .glassCard()
    }

    private var ftpWarningMessage: String {
        if let lastTested = ftpLastTested {
            let weeks = Calendar.current.dateComponents([.weekOfYear], from: lastTested, to: Date()).weekOfYear ?? 0
            return "FTP last tested \(weeks) weeks ago. Consider retesting."
        } else {
            return "FTP has never been tested. Consider scheduling a test."
        }
    }
}

// MARK: - FTP Card (Legacy)

/// Card displaying current FTP
struct FTPCard: View {
    let ftp: Int

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: Theme.Spacing.space1) {
                Text("FTP")
                    .font(.subheadline)
                    .foregroundStyle(Theme.textSecondary)
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text("\(ftp)")
                        .font(.system(size: 32, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .foregroundColor(Theme.textPrimary)
                    Text("watts")
                        .font(.subheadline)
                        .foregroundStyle(Theme.textSecondary)
                }
            }
            Spacer()
            Image(systemName: "bolt.fill")
                .font(.system(size: 28))
                .foregroundStyle(.yellow)
        }
        .glassCard()
    }
}

// MARK: - Block Completed Card

/// Card shown when training block is complete
struct BlockCompletedCard: View {
    let block: TrainingBlockModel
    let onStartNew: () -> Void

    var body: some View {
        VStack(spacing: Theme.Spacing.space4) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 48))
                .foregroundStyle(Theme.success)

            Text("Block Complete!")
                .font(.title2)
                .fontWeight(.bold)
                .foregroundColor(Theme.textPrimary)

            Text("Congratulations on completing your 8-week training block. Ready to start a new one?")
                .font(.subheadline)
                .foregroundStyle(Theme.textSecondary)
                .multilineTextAlignment(.center)

            // Goals achieved
            HStack(spacing: Theme.Spacing.space2) {
                ForEach(block.goals, id: \.self) { goal in
                    HStack(spacing: 4) {
                        Image(systemName: "checkmark")
                            .font(.caption2)
                        Text(goal.displayName)
                    }
                    .font(.caption)
                    .fontWeight(.medium)
                    .padding(.horizontal, Theme.Spacing.space2)
                    .padding(.vertical, Theme.Spacing.space1)
                    .background(Theme.success.opacity(0.2))
                    .foregroundStyle(Theme.success)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))
                }
            }

            Button(action: onStartNew) {
                Text("Start New Block")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(GlassPrimaryButtonStyle())
            .padding(.top, Theme.Spacing.space2)
        }
        .padding(Theme.Spacing.space6)
        .glassCard()
    }
}

// MARK: - No Block Card

/// Empty state when no training block is active
struct NoBlockCard: View {
    var onStartBlock: (() -> Void)?

    var body: some View {
        VStack(spacing: Theme.Spacing.space3) {
            Image(systemName: "calendar.badge.plus")
                .font(.system(size: Theme.Typography.iconXXL, weight: .regular))
                .foregroundStyle(Theme.textTertiary)

            Text("No Active Training Block")
                .font(.title3)
                .fontWeight(.semibold)
                .foregroundColor(Theme.textPrimary)

            Text("Start an 8-week training block to track your cycling progress and get AI-powered recommendations.")
                .font(.subheadline)
                .foregroundStyle(Theme.textSecondary)
                .multilineTextAlignment(.center)

            Button(action: {
                onStartBlock?()
            }) {
                Text("Start Training Block")
            }
            .buttonStyle(GlassPrimaryButtonStyle())
            .padding(.top, Theme.Spacing.space2)
        }
        .padding(Theme.Spacing.space6)
        .glassCard()
    }
}

// MARK: - TSS History Chart

/// Chart showing TSS history over the last 8 weeks
struct TSSHistoryChart: View {
    let data: [TSSDataPoint]

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space3) {
            HStack(spacing: Theme.Spacing.space2) {
                Image(systemName: "chart.bar.fill")
                    .font(.system(size: Theme.Typography.cardHeaderIcon))
                    .foregroundColor(Theme.interactivePrimary)
                    .frame(width: Theme.Dimensions.iconFrameMD, height: Theme.Dimensions.iconFrameMD)
                    .background(Theme.interactivePrimary.opacity(0.12))
                    .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))

                Text("Weekly TSS")
                    .font(.title3)
                    .fontWeight(.semibold)
                    .foregroundColor(Theme.textPrimary)
            }

            Chart(data) { point in
                BarMark(
                    x: .value("Week", point.weekLabel),
                    y: .value("TSS", point.tss)
                )
                .foregroundStyle(
                    LinearGradient(
                        colors: [Theme.interactivePrimary, Theme.interactiveSecondary],
                        startPoint: .bottom,
                        endPoint: .top
                    )
                )
                .cornerRadius(4)
            }
            .chartYAxis {
                AxisMarks(position: .leading) { _ in
                    AxisValueLabel()
                        .foregroundStyle(Theme.textSecondary)
                }
            }
            .chartXAxis {
                AxisMarks { _ in
                    AxisValueLabel()
                        .foregroundStyle(Theme.textSecondary)
                }
            }
            .frame(height: 160)
        }
        .glassCard()
    }
}

// MARK: - Training Load Trend Chart

/// Chart showing CTL, ATL, and TSB trends
struct TrainingLoadTrendChart: View {
    let data: [TrainingLoadDataPoint]

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space3) {
            HStack(spacing: Theme.Spacing.space2) {
                Image(systemName: "chart.line.uptrend.xyaxis")
                    .font(.system(size: Theme.Typography.cardHeaderIcon))
                    .foregroundColor(Theme.info)
                    .frame(width: Theme.Dimensions.iconFrameMD, height: Theme.Dimensions.iconFrameMD)
                    .background(Theme.info.opacity(0.12))
                    .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))

                Text("Training Load Trend")
                    .font(.title3)
                    .fontWeight(.semibold)
                    .foregroundColor(Theme.textPrimary)
            }

            Chart {
                ForEach(data) { point in
                    LineMark(
                        x: .value("Date", point.date),
                        y: .value("CTL", point.ctl)
                    )
                    .foregroundStyle(by: .value("Metric", "Fitness (CTL)"))
                    .interpolationMethod(.catmullRom)

                    LineMark(
                        x: .value("Date", point.date),
                        y: .value("ATL", point.atl)
                    )
                    .foregroundStyle(by: .value("Metric", "Fatigue (ATL)"))
                    .interpolationMethod(.catmullRom)
                }
            }
            .chartForegroundStyleScale([
                "Fitness (CTL)": Color.blue,
                "Fatigue (ATL)": Color.orange
            ])
            .chartLegend(position: .bottom)
            .chartYAxis {
                AxisMarks(position: .leading) { _ in
                    AxisValueLabel()
                        .foregroundStyle(Theme.textSecondary)
                }
            }
            .chartXAxis {
                AxisMarks(values: .stride(by: .day, count: 7)) { _ in
                    AxisValueLabel(format: .dateTime.month(.abbreviated).day())
                        .foregroundStyle(Theme.textSecondary)
                }
            }
            .frame(height: 180)

            // TSB indicator
            if let latest = data.last {
                HStack {
                    Text("Current Form (TSB):")
                        .font(.caption)
                        .foregroundStyle(Theme.textSecondary)
                    Text("\(Int(latest.tsb))")
                        .font(.caption)
                        .fontWeight(.semibold)
                        .foregroundStyle(latest.tsb >= 0 ? Theme.success : Theme.destructive)
                    Spacer()
                }
            }
        }
        .glassCard()
    }
}

// MARK: - Data Models for Charts

/// Data point for TSS history chart
struct TSSDataPoint: Identifiable {
    let id = UUID()
    let weekLabel: String
    let tss: Int
}

/// Data point for training load trend chart
struct TrainingLoadDataPoint: Identifiable {
    let id = UUID()
    let date: Date
    let ctl: Double
    let atl: Double
    let tsb: Double
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
