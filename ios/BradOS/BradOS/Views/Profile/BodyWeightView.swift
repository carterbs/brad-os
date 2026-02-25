import SwiftUI
import Charts

struct BodyWeightView: View {
    @State var viewModel = BodyWeightViewModel()
    @State private var selectedDate: Date?

    var body: some View {
        ScrollView {
            VStack(spacing: Theme.Spacing.space6) {
                if viewModel.isLoading && viewModel.allWeightHistory.isEmpty {
                    loadingState
                } else {
                    currentWeightSection
                    entrySection

                    if !viewModel.recentTrends.isEmpty {
                        recentTrendsSection
                    }

                    if !viewModel.weightHistory.isEmpty {
                        bodyWeightChart
                    }

                    if viewModel.logSuccess {
                        logSuccessBanner
                    }

                    if let error = viewModel.error {
                        errorBanner(error)
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
    }

    // MARK: - Loading State

    @ViewBuilder
    private var loadingState: some View {
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
    private var currentWeightSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            SectionHeader(title: "Current Weight")

            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    if let weight = viewModel.currentWeight {
                        Text(String(format: "%.1f", weight))
                            .font(.system(size: 34, weight: .bold, design: .rounded))
                            .monospacedDigit()
                            .foregroundStyle(Theme.textPrimary)
                        Text("lbs")
                            .font(.subheadline)
                            .foregroundStyle(Theme.textSecondary)
                    } else {
                        Text("No weight logged")
                            .font(.subheadline)
                            .foregroundStyle(Theme.textSecondary)
                    }

                    if let currentDate = viewModel.currentWeightDate {
                        Text(currentDate)
                            .font(.caption)
                            .foregroundStyle(Theme.textTertiary)
                    }
                }

                Spacer()

                if viewModel.currentWeight != nil {
                    Image(systemName: "scalemass.fill")
                        .font(.title2)
                        .foregroundStyle(Theme.interactivePrimary)
                }
            }
            .padding(Theme.Spacing.space4)
            .frame(minHeight: Theme.Dimensions.listRowMinHeight)
            .glassCard(.card, padding: 0)
        }
    }

    // MARK: - Entry Section

    @ViewBuilder
    private var entrySection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            SectionHeader(title: "Log New Entry")

            VStack(spacing: 0) {
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

                Divider().background(Theme.divider)

                Button {
                    Task { await viewModel.logEntry() }
                } label: {
                    HStack {
                        if viewModel.isLogging {
                            ProgressView()
                                .tint(Theme.textPrimary)
                        } else {
                            Text("Log Entry")
                                .foregroundStyle(Theme.textPrimary)
                        }
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(GlassPrimaryButtonStyle())
                .disabled(viewModel.isLogging)
                .padding(Theme.Spacing.space4)
                .frame(minHeight: Theme.Dimensions.listRowMinHeight)
            }
            .glassCard(.card, padding: 0)
        }
    }

    // MARK: - Trends Section

    @ViewBuilder
    private var recentTrendsSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space4) {
            SectionHeader(title: "Recent Trend States")

            VStack(spacing: 0) {
                ForEach(viewModel.recentTrends.indices, id: \.self) { index in
                    let summary = viewModel.recentTrends[index]

                    HStack(spacing: Theme.Spacing.space4) {
                        Text(summary.windowLabel)
                            .font(.subheadline)
                            .foregroundStyle(Theme.textPrimary)

                        Spacer()

                        HStack(spacing: Theme.Spacing.space2) {
                            Text(summary.formattedDelta)
                                .font(.subheadline)
                                .monospacedDigit()
                                .foregroundStyle(Theme.textSecondary)
                            Image(systemName: summary.state.iconName)
                                .foregroundStyle(Theme.interactivePrimary)
                        }
                    }
                    .padding(Theme.Spacing.space4)
                    .frame(minHeight: Theme.Dimensions.listRowMinHeight)

                    if index < viewModel.recentTrends.count - 1 {
                        Divider().background(Theme.divider)
                    }
                }
            }
            .glassCard(.card, padding: 0)
        }
    }

    // MARK: - Feedback

    @ViewBuilder
    private func errorBanner(_ message: String) -> some View {
        HStack(spacing: Theme.Spacing.space2) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(Theme.warning)
            Text(message)
                .font(.subheadline)
                .foregroundStyle(Theme.warning)
            Spacer()
        }
        .padding(Theme.Spacing.space4)
        .background(Theme.warning.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.md, style: .continuous))
    }

    @ViewBuilder
    private var logSuccessBanner: some View {
        HStack(spacing: Theme.Spacing.space2) {
            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(Theme.success)
            Text("Weight entry saved")
                .font(.subheadline)
                .foregroundStyle(Theme.success)
            Spacer()
        }
        .padding(Theme.Spacing.space4)
        .background(Theme.success.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.md, style: .continuous))
    }
}

#Preview {
    NavigationStack {
        BodyWeightView()
    }
    .preferredColorScheme(.dark)
}
