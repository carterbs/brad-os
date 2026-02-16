import SwiftUI

/// Full-screen detail view for Today Coach showing expanded sections for each domain.
struct TodayCoachDetailView: View {
    let recommendation: TodayCoachRecommendation
    let recovery: RecoveryData?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: Theme.Spacing.space6) {
                    briefingSection
                    recoverySection
                    if let lifting = recommendation.sections.lifting {
                        liftingSection(lifting)
                    }
                    if let cycling = recommendation.sections.cycling {
                        cyclingSection(cycling)
                    }
                    stretchingSection
                    meditationSection
                    if let weight = recommendation.sections.weight {
                        weightSection(weight)
                    }
                    if !recommendation.warnings.isEmpty {
                        warningsSection
                    }
                }
                .padding(Theme.Spacing.space5)
            }
            .background(AuroraBackground().ignoresSafeArea())
            .navigationTitle("Today Coach")
            .navigationBarTitleDisplayMode(.large)
            .toolbarBackground(.hidden, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 22))
                            .foregroundStyle(Theme.textTertiary)
                    }
                }
            }
        }
    }

    // MARK: - Daily Briefing

    private var briefingSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space3) {
            HStack(spacing: Theme.Spacing.space2) {
                Image(systemName: "brain.fill")
                    .font(.system(size: Theme.Typography.cardHeaderIcon))
                    .foregroundColor(recoveryStateColor)
                    .frame(
                        width: Theme.Dimensions.iconFrameMD,
                        height: Theme.Dimensions.iconFrameMD
                    )
                    .background(recoveryStateColor.opacity(0.12))
                    .clipShape(
                        RoundedRectangle(
                            cornerRadius: Theme.CornerRadius.sm,
                            style: .continuous
                        )
                    )

                Text("Daily Briefing")
                    .font(.title3)
                    .fontWeight(.semibold)
                    .foregroundColor(Theme.textPrimary)

                Spacer()

                if let recovery = recovery {
                    recoveryBadge(recovery)
                }
            }

            Text(recommendation.dailyBriefing)
                .font(.body)
                .foregroundColor(Theme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .glassCard()
        .auroraGlow(recoveryStateColor)
    }

    // MARK: - Recovery Section

    private var recoverySection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space3) {
            sectionHeader(
                icon: "heart.text.square.fill",
                title: "Recovery",
                color: recoveryStatusColor(
                    recommendation.sections.recovery.statusColor
                )
            )

            Text(recommendation.sections.recovery.insight)
                .font(.subheadline)
                .foregroundColor(Theme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)

            if let recovery = recovery {
                Divider().overlay(Theme.divider)

                // Key metrics
                VStack(spacing: Theme.Spacing.space3) {
                    metricRow(
                        icon: "waveform.path.ecg",
                        label: "HRV",
                        value: String(format: "%.0f ms", recovery.hrvMs),
                        trend: recovery.hrvVsBaseline,
                        positiveIsGood: true
                    )
                    metricRow(
                        icon: "heart.fill",
                        label: "RHR",
                        value: String(format: "%.0f bpm", recovery.rhrBpm),
                        trend: -recovery.rhrVsBaseline,
                        positiveIsGood: true
                    )
                    metricRow(
                        icon: "bed.double.fill",
                        label: "Sleep",
                        value: String(format: "%.1f hrs", recovery.sleepHours),
                        trend: nil,
                        positiveIsGood: true
                    )
                }
            }
        }
        .glassCard()
    }

    // MARK: - Weight Section

    func weightSection(
        _ weight: TodayCoachRecommendation.WeightSection
    ) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space3) {
            sectionHeader(
                icon: "scalemass.fill",
                title: "Weight",
                color: Theme.textSecondary
            )

            Text(weight.insight)
                .font(.subheadline)
                .foregroundColor(Theme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .glassCard()
    }

    func metricRow(
        icon: String,
        label: String,
        value: String,
        trend: Double?,
        positiveIsGood: Bool
    ) -> some View {
        HStack(spacing: Theme.Spacing.space3) {
            Image(systemName: icon)
                .font(.system(size: Theme.Typography.listRowIcon))
                .foregroundColor(Theme.textSecondary)
                .frame(width: Theme.Dimensions.iconFrameSM)

            Text(label)
                .font(.subheadline)
                .foregroundColor(Theme.textSecondary)

            Spacer()

            HStack(spacing: Theme.Spacing.space1) {
                Text(value)
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .monospacedDigit()
                    .foregroundColor(Theme.textPrimary)

                if let trend = trend {
                    let isPositive = trend >= 0
                    let color = (positiveIsGood == isPositive)
                        ? Theme.success : Theme.destructive
                    HStack(spacing: 2) {
                        Image(
                            systemName: isPositive
                                ? "arrow.up.right"
                                : "arrow.down.right"
                        )
                            .font(.system(size: 10, weight: .semibold))
                        Text(String(format: "%.0f%%", abs(trend)))
                            .font(.caption)
                            .fontWeight(.medium)
                            .monospacedDigit()
                    }
                    .foregroundColor(color)
                }
            }
        }
    }

    func recoveryBadge(_ recovery: RecoveryData) -> some View {
        HStack(spacing: Theme.Spacing.space1) {
            Circle()
                .fill(recoveryStateColor)
                .frame(
                    width: Theme.Dimensions.dotMD,
                    height: Theme.Dimensions.dotMD
                )
            Text(recovery.state.displayName)
                .font(.caption)
                .fontWeight(.medium)
        }
        .padding(.horizontal, Theme.Spacing.space2)
        .padding(.vertical, Theme.Spacing.space1)
        .background(recoveryStateColor.opacity(0.2))
        .foregroundColor(recoveryStateColor)
        .clipShape(
            RoundedRectangle(
                cornerRadius: Theme.CornerRadius.sm,
                style: .continuous
            )
        )
    }
}

// MARK: - Flow Layout

/// Simple wrapping horizontal layout for chips/tags
struct FlowLayout: Layout {
    var spacing: CGFloat

    func sizeThatFits(
        proposal: ProposedViewSize,
        subviews: Subviews,
        cache: inout ()
    ) -> CGSize {
        let result = arrange(
            proposal: proposal,
            subviews: subviews
        )
        return result.size
    }

    func placeSubviews(
        in bounds: CGRect,
        proposal: ProposedViewSize,
        subviews: Subviews,
        cache: inout ()
    ) {
        let result = arrange(
            proposal: proposal,
            subviews: subviews
        )
        for (index, position) in result.positions.enumerated() {
            subviews[index].place(
                at: CGPoint(
                    x: bounds.minX + position.x,
                    y: bounds.minY + position.y
                ),
                proposal: .unspecified
            )
        }
    }

    private func arrange(
        proposal: ProposedViewSize,
        subviews: Subviews
    ) -> (size: CGSize, positions: [CGPoint]) {
        let maxWidth = proposal.width ?? .infinity
        var positions: [CGPoint] = []
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        var maxX: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > maxWidth, x > 0 {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            positions.append(CGPoint(x: x, y: y))
            rowHeight = max(rowHeight, size.height)
            x += size.width + spacing
            maxX = max(maxX, x - spacing)
        }

        return (CGSize(width: maxX, height: y + rowHeight), positions)
    }
}
