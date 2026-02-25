import SwiftUI
import Charts

struct WeightGoalView: View {
    @State var viewModel = WeightGoalViewModel()
    @State var selectedDate: Date?

    var body: some View {
        ScrollView {
            VStack(spacing: Theme.Spacing.space6) {
                if viewModel.isLoading && viewModel.allWeightHistory.isEmpty {
                    loadingState
                } else {
                    // Current Weight
                    currentWeightSection

                    // Log Entry Section
                    logEntrySection

                    // Recent Trend States
                    if !viewModel.recentTrendStates.isEmpty {
                        recentTrendSection
                    }

                    // Weight Trend Chart
                    if !viewModel.weightHistory.isEmpty {
                        weightTrendChart
                    }

                    // 2-week projection summary (shown even without a goal)
                    if let projected = viewModel.twoWeekProjectedWeight,
                       let slope = viewModel.trendSlope {
                        twoWeekProjectionSection(projected: projected, weeklyRate: slope * 7)
                    }

                    // Prediction (requires a goal)
                    if let prediction = viewModel.prediction {
                        predictionSection(prediction)
                    }

                    // Goal Input
                    goalSection

                    // Projected Rate
                    if viewModel.weeklyRate != nil {
                        projectedRateSection
                    }

                    // Save Button
                    saveButtonSection

                    // Success Banner
                    if viewModel.saveSuccess {
                        successBanner
                    }

                    // Entry Success Banner
                    if viewModel.entryLogSuccess {
                        entrySuccessBanner
                    }
                }
            }
            .padding(Theme.Spacing.space5)
        }
        .background(AuroraBackground().ignoresSafeArea())
        .navigationTitle("Body Weight")
        .navigationBarTitleDisplayMode(.large)
        .toolbarBackground(.hidden, for: .navigationBar)
        .task {
            await viewModel.loadData()
        }
        .onChange(of: viewModel.targetWeight) {
            viewModel.updatePrediction()
        }
    }

    // MARK: - Loading State

    @ViewBuilder
    var loadingState: some View {
        VStack(spacing: Theme.Spacing.space4) {
            ProgressView()
                .tint(Theme.textSecondary)
            Text("Loading weight data...")
                .font(.subheadline)
                .foregroundStyle(Theme.textSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, Theme.Spacing.space8)
    }

    // MARK: - Current Weight Section

    @ViewBuilder
    var currentWeightSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            SectionHeader(title: "Current Weight")

            HStack {
                if let weight = viewModel.currentWeight {
                    Text("\(Int(weight))")
                        .font(.system(size: 34, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(Theme.textPrimary)
                    Text("lbs")
                        .font(.subheadline)
                        .foregroundStyle(Theme.textSecondary)
                } else if !viewModel.weightHistory.isEmpty, let latest = viewModel.weightHistory.last {
                    Text("\(Int(latest.weight))")
                        .font(.system(size: 34, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(Theme.textPrimary)
                    Text("lbs")
                        .font(.subheadline)
                        .foregroundStyle(Theme.textSecondary)
                    Text("(from sync)")
                        .font(.caption)
                        .foregroundStyle(Theme.textTertiary)
                } else {
                    Image(systemName: "scalemass")
                        .font(.title3)
                        .foregroundStyle(Theme.textTertiary)
                    Text("No weight data")
                        .font(.subheadline)
                        .foregroundStyle(Theme.textSecondary)
                }
                Spacer()
            }
            .padding(Theme.Spacing.space4)
            .frame(minHeight: Theme.Dimensions.listRowMinHeight)
            .glassCard(.card, padding: 0)
        }
    }

    // MARK: - Log Entry Section

    @ViewBuilder
    var logEntrySection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            SectionHeader(title: "Log Entry")

            VStack(spacing: 0) {
                // Weight Input
                HStack {
                    Text("Weight (lbs)")
                        .font(.subheadline)
                        .foregroundStyle(Theme.textSecondary)
                    Spacer()
                    TextField("Enter weight", text: $viewModel.entryWeight)
                        .keyboardType(.decimalPad)
                        .multilineTextAlignment(.trailing)
                        .font(.body)
                        .monospacedDigit()
                        .foregroundStyle(Theme.textPrimary)
                }
                .padding(Theme.Spacing.space4)
                .frame(minHeight: Theme.Dimensions.listRowMinHeight)

                Divider().background(Theme.divider)

                // Date Picker
                DatePicker(
                    "Date",
                    selection: $viewModel.entryDate,
                    displayedComponents: .date
                )
                .font(.subheadline)
                .foregroundStyle(Theme.textSecondary)
                .tint(Theme.interactivePrimary)
                .padding(Theme.Spacing.space4)
                .frame(minHeight: Theme.Dimensions.listRowMinHeight)
            }
            .glassCard(.card, padding: 0)

            // Save Button
            Button {
                Task { await viewModel.logBodyWeightEntry() }
            } label: {
                HStack {
                    if viewModel.isLoggingEntry {
                        ProgressView()
                            .tint(Theme.textPrimary)
                    } else {
                        Text("Log Entry")
                    }
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(GlassPrimaryButtonStyle())
            .disabled(viewModel.entryWeight.isEmpty || viewModel.isLoggingEntry)
            .opacity(viewModel.entryWeight.isEmpty ? 0.5 : 1.0)

            // Error Banner
            if let error = viewModel.error {
                HStack(spacing: Theme.Spacing.space2) {
                    Image(systemName: "exclamationmark.circle.fill")
                        .foregroundStyle(Theme.warning)
                    Text(error)
                        .font(.subheadline)
                        .foregroundStyle(Theme.warning)
                    Spacer()
                }
                .padding(Theme.Spacing.space4)
                .background(Theme.warning.opacity(0.08))
                .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.md, style: .continuous))
            }
        }
    }

    // MARK: - Recent Trend Section

    @ViewBuilder
    var recentTrendSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            SectionHeader(title: "Recent Trend")

            HStack(spacing: Theme.Spacing.space4) {
                ForEach(viewModel.recentTrendStates, id: \.windowDays) { trend in
                    trendStateCard(trend)
                }
                Spacer()
            }
        }
    }

    @ViewBuilder
    private func trendStateCard(_ trend: RecentWeightTrend) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space2) {
            HStack(spacing: Theme.Spacing.space2) {
                Image(systemName: trendStateIcon(trend.state))
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(trendStateColor(trend.state))

                Text("\(trend.windowDays)d")
                    .font(.caption2)
                    .fontWeight(.medium)
                    .foregroundStyle(Theme.textSecondary)
            }

            HStack(spacing: Theme.Spacing.space1) {
                Text(String(format: "%+.1f", trend.deltaLbs))
                    .font(.headline)
                    .monospacedDigit()
                    .foregroundStyle(trendStateColor(trend.state))

                Text("lbs")
                    .font(.caption)
                    .foregroundStyle(Theme.textSecondary)
            }

            Text(trendStateLabel(trend.state))
                .font(.caption)
                .foregroundStyle(Theme.textSecondary)
        }
        .padding(Theme.Spacing.space3)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(trendStateColor(trend.state).opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.md, style: .continuous))
    }

    private func trendStateIcon(_ state: WeightTrendState) -> String {
        switch state {
        case .losing: return "arrow.down.right"
        case .stable: return "minus"
        case .gaining: return "arrow.up.right"
        }
    }

    private func trendStateColor(_ state: WeightTrendState) -> Color {
        switch state {
        case .losing: return Theme.success
        case .stable: return Theme.textSecondary
        case .gaining: return Theme.warning
        }
    }

    private func trendStateLabel(_ state: WeightTrendState) -> String {
        switch state {
        case .losing: return "Losing"
        case .stable: return "Stable"
        case .gaining: return "Gaining"
        }
    }

    // MARK: - Goal Section

    @ViewBuilder
    var goalSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            SectionHeader(title: "Goal")

            VStack(spacing: 0) {
                // Target Weight Input
                HStack {
                    Text("Target Weight (lbs)")
                        .font(.subheadline)
                        .foregroundStyle(Theme.textSecondary)
                    Spacer()
                    TextField("Enter weight", text: $viewModel.targetWeight)
                        .keyboardType(.decimalPad)
                        .multilineTextAlignment(.trailing)
                        .font(.body)
                        .monospacedDigit()
                        .foregroundStyle(Theme.textPrimary)
                }
                .padding(Theme.Spacing.space4)
                .frame(minHeight: Theme.Dimensions.listRowMinHeight)

                Divider().background(Theme.divider)

                // Target Date Picker
                DatePicker(
                    "Target Date",
                    selection: $viewModel.targetDate,
                    in: Date()...,
                    displayedComponents: .date
                )
                .font(.subheadline)
                .foregroundStyle(Theme.textSecondary)
                .tint(Theme.interactivePrimary)
                .padding(Theme.Spacing.space4)
                .frame(minHeight: Theme.Dimensions.listRowMinHeight)
            }
            .glassCard(.card, padding: 0)
        }
    }

    // MARK: - Projected Rate Section

    @ViewBuilder
    var projectedRateSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            SectionHeader(title: "Goal Rate")

            VStack(spacing: 0) {
                HStack {
                    if let rate = viewModel.weeklyRate {
                        Text(String(format: "%.1f lbs/week", abs(rate)))
                            .font(.headline)
                            .monospacedDigit()
                            .foregroundStyle(Theme.textPrimary)
                    }
                    Spacer()
                    Text(viewModel.rateLabel)
                        .font(.caption)
                        .fontWeight(.medium)
                        .padding(.horizontal, Theme.Spacing.space2)
                        .padding(.vertical, Theme.Spacing.space1)
                        .background(viewModel.rateColor.opacity(0.15))
                        .foregroundStyle(viewModel.rateColor)
                        .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))
                }
                .padding(Theme.Spacing.space4)
                .frame(minHeight: Theme.Dimensions.listRowMinHeight)

                if let rate = viewModel.weeklyRate {
                    Divider().background(Theme.divider)

                    HStack(alignment: .top, spacing: Theme.Spacing.space2) {
                        Image(systemName: viewModel.rateGuidanceIcon(rate: rate))
                            .font(.caption)
                            .foregroundStyle(viewModel.rateColor)
                        Text(viewModel.rateGuidanceMessage(rate: rate))
                            .font(.caption)
                            .foregroundStyle(Theme.textSecondary)
                        Spacer()
                    }
                    .padding(Theme.Spacing.space4)
                }
            }
            .glassCard(.card, padding: 0)
        }
    }

    // MARK: - Save Button

    @ViewBuilder
    var saveButtonSection: some View {
        Button {
            Task { await viewModel.saveGoal() }
        } label: {
            HStack {
                if viewModel.isSaving {
                    ProgressView()
                        .tint(Theme.textPrimary)
                } else {
                    Text("Save Goal")
                }
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(GlassPrimaryButtonStyle())
        .disabled(viewModel.targetWeight.isEmpty || viewModel.isSaving)
        .opacity(viewModel.targetWeight.isEmpty ? 0.5 : 1.0)
    }

    // MARK: - Success Banner

    @ViewBuilder
    var successBanner: some View {
        HStack(spacing: Theme.Spacing.space2) {
            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(Theme.success)
            Text("Goal saved")
                .font(.subheadline)
                .foregroundStyle(Theme.success)
            Spacer()
        }
        .padding(Theme.Spacing.space4)
        .background(Theme.success.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.md, style: .continuous))
        .transition(.move(edge: .bottom).combined(with: .opacity))
        .onAppear {
            DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
                withAnimation { viewModel.saveSuccess = false }
            }
        }
    }

    // MARK: - Entry Success Banner

    @ViewBuilder
    var entrySuccessBanner: some View {
        HStack(spacing: Theme.Spacing.space2) {
            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(Theme.success)
            Text("Weight entry logged")
                .font(.subheadline)
                .foregroundStyle(Theme.success)
            Spacer()
        }
        .padding(Theme.Spacing.space4)
        .background(Theme.success.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.md, style: .continuous))
        .transition(.move(edge: .bottom).combined(with: .opacity))
        .onAppear {
            DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
                withAnimation { viewModel.entryLogSuccess = false }
            }
        }
    }
}

// MARK: - Preview

#Preview {
    NavigationStack {
        WeightGoalView()
    }
    .preferredColorScheme(.dark)
}
