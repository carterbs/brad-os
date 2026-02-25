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
                }
            }
            .padding(Theme.Spacing.space5)
        }
        .background(AuroraBackground().ignoresSafeArea())
        .navigationTitle("Weight Goal")
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
}

// MARK: - Preview

#Preview {
    NavigationStack {
        WeightGoalView()
    }
    .preferredColorScheme(.dark)
}
