import SwiftUI
import Charts

// MARK: - Cycling Block View

/// Training block overview with week indicator, FTP, goals, and charts
struct CyclingBlockView: View {
    @EnvironmentObject var viewModel: CyclingViewModel
    @State private var showNewBlockSheet = false
    @State private var showBlockCompletedSheet = false

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
            NewBlockSheet(
                previousGoals: viewModel.currentBlock?.goals ?? [],
                onComplete: { goals, startDate in
                    Task {
                        await viewModel.startNewBlock(goals: goals, startDate: startDate)
                    }
                    showNewBlockSheet = false
                }
            )
        }
        .onAppear {
            checkBlockCompletion()
        }
    }

    // MARK: - Block Completion Check

    private func shouldShowBlockCompletion(block: TrainingBlockModel) -> Bool {
        // Block is complete if we've passed week 8 or the end date
        return block.currentWeek > 8 || Date() > block.endDate
    }

    private func checkBlockCompletion() {
        if let block = viewModel.currentBlock, shouldShowBlockCompletion(block: block) {
            // Auto-complete the block if needed
            Task {
                await viewModel.completeCurrentBlock()
            }
        }
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
        case .regainFitness: return "Fitness"
        case .maintainMuscle: return "Muscle"
        case .loseWeight: return "Weight Loss"
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

// MARK: - New Block Sheet

/// Sheet for starting a new training block
struct NewBlockSheet: View {
    @Environment(\.dismiss) private var dismiss
    let previousGoals: [TrainingBlockModel.TrainingGoal]
    let onComplete: ([TrainingBlockModel.TrainingGoal], Date) -> Void

    @State private var selectedGoals: Set<TrainingBlockModel.TrainingGoal> = []
    @State private var startDate = Date()

    var endDate: Date {
        Calendar.current.date(byAdding: .weekOfYear, value: 8, to: startDate) ?? startDate
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: Theme.Spacing.space6) {
                    // Goals section
                    VStack(alignment: .leading, spacing: Theme.Spacing.space3) {
                        Text("Goals")
                            .font(.headline)
                            .foregroundColor(Theme.textPrimary)

                        VStack(spacing: 0) {
                            ForEach(Array(TrainingBlockModel.TrainingGoal.allCases.enumerated()), id: \.element) { index, goal in
                                if index > 0 {
                                    Divider()
                                        .background(Theme.strokeSubtle)
                                }

                                Button {
                                    if selectedGoals.contains(goal) {
                                        selectedGoals.remove(goal)
                                    } else {
                                        selectedGoals.insert(goal)
                                    }
                                } label: {
                                    HStack {
                                        Text(goal.displayName)
                                            .foregroundColor(Theme.textPrimary)
                                        Spacer()
                                        if selectedGoals.contains(goal) {
                                            Image(systemName: "checkmark")
                                                .foregroundStyle(Theme.interactivePrimary)
                                        }
                                    }
                                    .padding(Theme.Spacing.space4)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .glassCard(.card, padding: 0)
                    }

                    // Date section
                    VStack(alignment: .leading, spacing: Theme.Spacing.space3) {
                        Text("Schedule")
                            .font(.headline)
                            .foregroundColor(Theme.textPrimary)

                        VStack(spacing: 0) {
                            DatePicker(
                                "Start Date",
                                selection: $startDate,
                                in: Date()...,
                                displayedComponents: .date
                            )
                            .foregroundColor(Theme.textPrimary)
                            .tint(Theme.interactivePrimary)
                            .padding(Theme.Spacing.space4)

                            Divider()
                                .background(Theme.strokeSubtle)

                            HStack {
                                Text("End Date")
                                    .foregroundColor(Theme.textSecondary)
                                Spacer()
                                Text(endDate, style: .date)
                                    .foregroundStyle(Theme.textSecondary)
                            }
                            .padding(Theme.Spacing.space4)
                        }
                        .glassCard(.card, padding: 0)
                    }

                    // Start button
                    Button {
                        onComplete(Array(selectedGoals), startDate)
                    } label: {
                        Text("Start Training Block")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(GlassPrimaryButtonStyle())
                    .disabled(selectedGoals.isEmpty)
                    .opacity(selectedGoals.isEmpty ? 0.5 : 1.0)
                }
                .padding(Theme.Spacing.space5)
            }
            .background(AuroraBackground().ignoresSafeArea())
            .navigationTitle("New Block")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.hidden, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        dismiss()
                    }
                    .foregroundColor(Theme.textSecondary)
                }
            }
            .onAppear {
                // Pre-populate with previous goals
                selectedGoals = Set(previousGoals)
            }
        }
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
