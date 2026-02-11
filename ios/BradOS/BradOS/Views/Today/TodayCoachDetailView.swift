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
                    .frame(width: Theme.Dimensions.iconFrameMD, height: Theme.Dimensions.iconFrameMD)
                    .background(recoveryStateColor.opacity(0.12))
                    .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))

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
                color: recoveryStatusColor(recommendation.sections.recovery.statusColor)
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

    // MARK: - Lifting Section

    private func liftingSection(_ lifting: TodayCoachRecommendation.LiftingSection) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space3) {
            sectionHeader(
                icon: "dumbbell.fill",
                title: "Lifting",
                color: Theme.lifting
            )

            Text(lifting.insight)
                .font(.subheadline)
                .foregroundColor(Theme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)

            // Workout details if available
            if let workout = lifting.workout {
                Divider().overlay(Theme.divider)

                VStack(alignment: .leading, spacing: Theme.Spacing.space2) {
                    HStack {
                        Image(systemName: workout.isDeload ? "figure.cooldown" : "dumbbell.fill")
                            .font(.title3)
                            .foregroundStyle(Theme.lifting)

                        VStack(alignment: .leading, spacing: 2) {
                            Text(workout.planDayName)
                                .font(.headline)
                                .foregroundColor(Theme.textPrimary)
                            Text(workout.isDeload ? "Deload Week" : "Week \(workout.weekNumber)")
                                .font(.subheadline)
                                .foregroundStyle(workout.isDeload ? Theme.warning : Theme.textSecondary)
                        }

                        Spacer()

                        VStack(alignment: .trailing, spacing: 2) {
                            Text("\(workout.exerciseCount)")
                                .font(.system(size: 28, weight: .bold, design: .rounded))
                                .monospacedDigit()
                                .foregroundStyle(Theme.textPrimary)
                            Text(workout.exerciseCount == 1 ? "exercise" : "exercises")
                                .font(.caption)
                                .foregroundStyle(Theme.textSecondary)
                        }
                    }

                    // Workout status
                    if workout.status == "completed" {
                        HStack(spacing: Theme.Spacing.space2) {
                            Image(systemName: "checkmark.circle.fill")
                                .font(.caption)
                                .foregroundStyle(Theme.success)
                            Text("Workout completed")
                                .font(.footnote)
                                .foregroundStyle(Theme.success)
                        }
                        .padding(Theme.Spacing.space2)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Theme.success.opacity(0.1))
                        .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))
                    } else if workout.status == "in_progress" {
                        HStack(spacing: Theme.Spacing.space2) {
                            Image(systemName: "arrow.clockwise.circle.fill")
                                .font(.caption)
                                .foregroundStyle(Theme.info)
                            Text("Workout in progress")
                                .font(.footnote)
                                .foregroundStyle(Theme.info)
                        }
                        .padding(Theme.Spacing.space2)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Theme.info.opacity(0.1))
                        .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))
                    }
                }
            }

            priorityBadge(lifting.liftingPriority)
        }
        .glassCard()
    }

    // MARK: - Cycling Section

    private func cyclingSection(_ cycling: TodayCoachRecommendation.CyclingSection) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space3) {
            sectionHeader(
                icon: "figure.outdoor.cycle",
                title: "Cycling",
                color: Theme.cycling
            )

            Text(cycling.insight)
                .font(.subheadline)
                .foregroundColor(Theme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)

            // Peloton session details if available
            if let session = cycling.session {
                Divider().overlay(Theme.divider)

                VStack(alignment: .leading, spacing: Theme.Spacing.space2) {
                    HStack {
                        Image(systemName: session.sessionType.systemImage)
                            .font(.title3)
                            .foregroundStyle(sessionTypeColor(session.sessionType))

                        VStack(alignment: .leading, spacing: 2) {
                            Text(session.sessionType.displayName)
                                .font(.headline)
                                .foregroundColor(Theme.textPrimary)
                            if let types = session.pelotonClassTypes, let primary = types.first {
                                Text(primary)
                                    .font(.subheadline)
                                    .foregroundStyle(Theme.textSecondary)
                            }
                        }

                        Spacer()

                        VStack(alignment: .trailing, spacing: 2) {
                            Text("\(session.durationMinutes)")
                                .font(.system(size: 28, weight: .bold, design: .rounded))
                                .monospacedDigit()
                                .foregroundStyle(Theme.textPrimary)
                            Text("minutes")
                                .font(.caption)
                                .foregroundStyle(Theme.textSecondary)
                        }
                    }

                    // Target zones and TSS
                    HStack {
                        Text("Zones:")
                            .font(.subheadline)
                            .foregroundStyle(Theme.textSecondary)
                        Text(session.targetZones)
                            .font(.subheadline)
                            .foregroundStyle(Theme.textPrimary)
                    }

                    HStack {
                        Text("Target TSS:")
                            .font(.subheadline)
                            .foregroundStyle(Theme.textSecondary)
                        Text("\(session.targetTSS.min)-\(session.targetTSS.max)")
                            .font(.subheadline)
                            .fontWeight(.medium)
                            .monospacedDigit()
                            .foregroundStyle(Theme.textPrimary)
                    }

                    // Peloton tip
                    if let tip = session.pelotonTip, !tip.isEmpty {
                        HStack(alignment: .top, spacing: Theme.Spacing.space2) {
                            Image(systemName: "lightbulb.fill")
                                .font(.caption)
                                .foregroundStyle(Theme.interactivePrimary)
                            Text(tip)
                                .font(.footnote)
                                .foregroundStyle(Theme.textSecondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(Theme.Spacing.space3)
                        .background(Theme.interactivePrimary.opacity(0.08))
                        .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))
                    }
                }
            }
        }
        .glassCard()
    }

    // MARK: - Stretching Section

    private var stretchingSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space3) {
            sectionHeader(
                icon: "figure.flexibility",
                title: "Stretching",
                color: Theme.stretch
            )

            Text(recommendation.sections.stretching.insight)
                .font(.subheadline)
                .foregroundColor(Theme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)

            if !recommendation.sections.stretching.suggestedRegions.isEmpty {
                Divider().overlay(Theme.divider)

                VStack(alignment: .leading, spacing: Theme.Spacing.space2) {
                    Text("Suggested regions")
                        .font(.footnote)
                        .foregroundColor(Theme.textTertiary)

                    FlowLayout(spacing: Theme.Spacing.space2) {
                        ForEach(recommendation.sections.stretching.suggestedRegions, id: \.self) { region in
                            Text(region)
                                .font(.footnote)
                                .fontWeight(.medium)
                                .foregroundColor(Theme.stretch)
                                .padding(.horizontal, 14)
                                .padding(.vertical, Theme.Spacing.space1)
                                .background(Theme.stretch.opacity(0.12))
                                .clipShape(Capsule(style: .continuous))
                        }
                    }
                }
            }

            priorityBadge(recommendation.sections.stretching.stretchPriority)
        }
        .glassCard()
    }

    // MARK: - Meditation Section

    private var meditationSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space3) {
            sectionHeader(
                icon: "brain.head.profile.fill",
                title: "Meditation",
                color: Theme.meditation
            )

            Text(recommendation.sections.meditation.insight)
                .font(.subheadline)
                .foregroundColor(Theme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)

            Divider().overlay(Theme.divider)

            HStack {
                Image(systemName: "timer")
                    .font(.system(size: Theme.Typography.listRowIcon))
                    .foregroundColor(Theme.meditation)
                Text("Suggested duration:")
                    .font(.subheadline)
                    .foregroundColor(Theme.textSecondary)
                Text("\(recommendation.sections.meditation.suggestedDurationMinutes) min")
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .monospacedDigit()
                    .foregroundColor(Theme.textPrimary)
            }

            priorityBadge(recommendation.sections.meditation.meditationPriority)
        }
        .glassCard()
    }

    // MARK: - Weight Section

    private func weightSection(_ weight: TodayCoachRecommendation.WeightSection) -> some View {
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

    // MARK: - Warnings Section

    private var warningsSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space3) {
            sectionHeader(
                icon: "exclamationmark.triangle.fill",
                title: "Warnings",
                color: Theme.warning
            )

            ForEach(recommendation.warnings, id: \.type) { warning in
                HStack(alignment: .top, spacing: Theme.Spacing.space2) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.caption)
                        .foregroundStyle(Theme.warning)
                    Text(warning.message)
                        .font(.subheadline)
                        .foregroundStyle(Theme.warning)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(Theme.Spacing.space3)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Theme.warning.opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))
            }
        }
        .glassCard()
    }

    // MARK: - Shared Components

    private func sectionHeader(icon: String, title: String, color: Color) -> some View {
        HStack(spacing: Theme.Spacing.space2) {
            Image(systemName: icon)
                .font(.system(size: Theme.Typography.cardHeaderIcon))
                .foregroundColor(color)
                .frame(width: Theme.Dimensions.iconFrameMD, height: Theme.Dimensions.iconFrameMD)
                .background(color.opacity(0.12))
                .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))

            Text(title)
                .font(.title3)
                .fontWeight(.semibold)
                .foregroundColor(Theme.textPrimary)
        }
    }

    private func metricRow(
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
                    let color = (positiveIsGood == isPositive) ? Theme.success : Theme.destructive
                    HStack(spacing: 2) {
                        Image(systemName: isPositive ? "arrow.up.right" : "arrow.down.right")
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

    private func recoveryBadge(_ recovery: RecoveryData) -> some View {
        HStack(spacing: Theme.Spacing.space1) {
            Circle()
                .fill(recoveryStateColor)
                .frame(width: Theme.Dimensions.dotMD, height: Theme.Dimensions.dotMD)
            Text(recovery.state.displayName)
                .font(.caption)
                .fontWeight(.medium)
        }
        .padding(.horizontal, Theme.Spacing.space2)
        .padding(.vertical, Theme.Spacing.space1)
        .background(recoveryStateColor.opacity(0.2))
        .foregroundColor(recoveryStateColor)
        .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))
    }

    private func priorityBadge(_ priority: CoachPriority) -> some View {
        HStack(spacing: Theme.Spacing.space1) {
            Circle()
                .fill(priorityColor(priority))
                .frame(width: Theme.Dimensions.dotMD, height: Theme.Dimensions.dotMD)
            Text(priorityLabel(priority))
                .font(.caption)
                .fontWeight(.medium)
        }
        .padding(.horizontal, Theme.Spacing.space2)
        .padding(.vertical, Theme.Spacing.space1)
        .background(priorityColor(priority).opacity(0.12))
        .foregroundColor(priorityColor(priority))
        .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))
    }

    // MARK: - Helpers

    private var recoveryStateColor: Color {
        guard let recovery = recovery else { return Theme.interactivePrimary }
        switch recovery.state {
        case .ready: return Theme.success
        case .moderate: return Theme.warning
        case .recover: return Theme.destructive
        }
    }

    private func recoveryStatusColor(_ status: RecoveryStatus) -> Color {
        switch status {
        case .great: return Theme.success
        case .good: return Theme.success
        case .caution: return Theme.warning
        case .warning: return Theme.destructive
        }
    }

    private func priorityColor(_ priority: CoachPriority) -> Color {
        switch priority {
        case .high: return Theme.warning
        case .normal: return Theme.textSecondary
        case .low: return Theme.textTertiary
        case .rest: return Theme.info
        case .skip: return Theme.textTertiary
        }
    }

    private func priorityLabel(_ priority: CoachPriority) -> String {
        switch priority {
        case .high: return "High Priority"
        case .normal: return "Normal"
        case .low: return "Low Priority"
        case .rest: return "Rest Day"
        case .skip: return "Skip Today"
        }
    }

    private func sessionTypeColor(_ type: SessionType) -> Color {
        switch type {
        case .vo2max: return Theme.destructive
        case .threshold: return Theme.warning
        case .endurance: return Theme.info
        case .tempo: return Color.orange
        case .fun: return Theme.success
        case .recovery: return Theme.info
        case .off: return Theme.textSecondary
        }
    }
}

// MARK: - Flow Layout

/// Simple wrapping horizontal layout for chips/tags
struct FlowLayout: Layout {
    var spacing: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = arrange(proposal: proposal, subviews: subviews)
        return result.size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = arrange(proposal: proposal, subviews: subviews)
        for (index, position) in result.positions.enumerated() {
            subviews[index].place(at: CGPoint(x: bounds.minX + position.x, y: bounds.minY + position.y), proposal: .unspecified)
        }
    }

    private func arrange(proposal: ProposedViewSize, subviews: Subviews) -> (size: CGSize, positions: [CGPoint]) {
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
