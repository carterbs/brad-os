import SwiftUI

// MARK: - Detail Sections

extension TodayCoachDetailView {

    // MARK: - Lifting Section

    func liftingSection(
        _ lifting: TodayCoachRecommendation.LiftingSection
    ) -> some View {
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
                liftingWorkoutDetail(workout)
            }

            priorityBadge(lifting.liftingPriority)
        }
        .glassCard()
    }

    private func liftingWorkoutDetail(
        _ workout: TodayCoachRecommendation.LiftingSection.WorkoutDetails
    ) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space2) {
            HStack {
                Image(
                    systemName: workout.isDeload
                        ? "figure.cooldown" : "dumbbell.fill"
                )
                    .font(.title3)
                    .foregroundStyle(Theme.lifting)

                liftingWorkoutInfo(workout)

                Spacer()

                exerciseCountBadge(workout.exerciseCount)
            }

            liftingWorkoutStatus(workout.status)
        }
    }

    private func liftingWorkoutInfo(
        _ workout: TodayCoachRecommendation.LiftingSection.WorkoutDetails
    ) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(workout.planDayName)
                .font(.headline)
                .foregroundColor(Theme.textPrimary)
            Text(
                workout.isDeload
                    ? "Deload Week"
                    : "Week \(workout.weekNumber)"
            )
                .font(.subheadline)
                .foregroundStyle(
                    workout.isDeload
                        ? Theme.warning : Theme.textSecondary
                )
        }
    }

    private func exerciseCountBadge(_ count: Int) -> some View {
        VStack(alignment: .trailing, spacing: 2) {
            Text("\(count)")
                .font(.system(
                    size: 28,
                    weight: .bold,
                    design: .rounded
                ))
                .monospacedDigit()
                .foregroundStyle(Theme.textPrimary)
            Text(count == 1 ? "exercise" : "exercises")
                .font(.caption)
                .foregroundStyle(Theme.textSecondary)
        }
    }

    @ViewBuilder
    private func liftingWorkoutStatus(_ status: String) -> some View {
        if status == "completed" {
            workoutStatusBanner(
                icon: "checkmark.circle.fill",
                text: "Workout completed",
                color: Theme.success
            )
        } else if status == "in_progress" {
            workoutStatusBanner(
                icon: "arrow.clockwise.circle.fill",
                text: "Workout in progress",
                color: Theme.info
            )
        }
    }

    private func workoutStatusBanner(
        icon: String,
        text: String,
        color: Color
    ) -> some View {
        HStack(spacing: Theme.Spacing.space2) {
            Image(systemName: icon)
                .font(.caption)
                .foregroundStyle(color)
            Text(text)
                .font(.footnote)
                .foregroundStyle(color)
        }
        .padding(Theme.Spacing.space2)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(color.opacity(0.1))
        .clipShape(
            RoundedRectangle(
                cornerRadius: Theme.CornerRadius.sm,
                style: .continuous
            )
        )
    }

    // MARK: - Cycling Section

    func cyclingSection(
        _ cycling: TodayCoachRecommendation.CyclingSection
    ) -> some View {
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
                cyclingSessionDetail(session)
            }
        }
        .glassCard()
    }

    @ViewBuilder
    private func cyclingSessionDetail(
        _ session: CyclingCoachRecommendation.SessionRecommendation
    ) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space2) {
            cyclingSessionHeader(session)
            cyclingSessionMetrics(session)

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
                .clipShape(
                    RoundedRectangle(
                        cornerRadius: Theme.CornerRadius.sm,
                        style: .continuous
                    )
                )
            }
        }
    }

    private func cyclingSessionHeader(
        _ session: CyclingCoachRecommendation.SessionRecommendation
    ) -> some View {
        HStack {
            Image(systemName: session.sessionType.systemImage)
                .font(.title3)
                .foregroundStyle(sessionTypeColor(session.sessionType))

            VStack(alignment: .leading, spacing: 2) {
                Text(session.sessionType.displayName)
                    .font(.headline)
                    .foregroundColor(Theme.textPrimary)
                if let types = session.pelotonClassTypes,
                   let primary = types.first {
                    Text(primary)
                        .font(.subheadline)
                        .foregroundStyle(Theme.textSecondary)
                }
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 2) {
                Text("\(session.durationMinutes)")
                    .font(.system(
                        size: 28,
                        weight: .bold,
                        design: .rounded
                    ))
                    .monospacedDigit()
                    .foregroundStyle(Theme.textPrimary)
                Text("minutes")
                    .font(.caption)
                    .foregroundStyle(Theme.textSecondary)
            }
        }
    }

    @ViewBuilder
    private func cyclingSessionMetrics(
        _ session: CyclingCoachRecommendation.SessionRecommendation
    ) -> some View {
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
    }

    // MARK: - Stretching Section

    var stretchingSection: some View {
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
                stretchRegionChips
            }

            priorityBadge(
                recommendation.sections.stretching.stretchPriority
            )
        }
        .glassCard()
    }

    @ViewBuilder
    private var stretchRegionChips: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space2) {
            Text("Suggested regions")
                .font(.footnote)
                .foregroundColor(Theme.textTertiary)

            FlowLayout(spacing: Theme.Spacing.space2) {
                ForEach(
                    recommendation.sections.stretching.suggestedRegions,
                    id: \.self
                ) { region in
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

    // MARK: - Meditation Section

    var meditationSection: some View {
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
                let mins = recommendation.sections.meditation
                    .suggestedDurationMinutes
                Text("\(mins) min")
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .monospacedDigit()
                    .foregroundColor(Theme.textPrimary)
            }

            priorityBadge(
                recommendation.sections.meditation.meditationPriority
            )
        }
        .glassCard()
    }

    // MARK: - Warnings Section

    var warningsSection: some View {
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
                .clipShape(
                    RoundedRectangle(
                        cornerRadius: Theme.CornerRadius.sm,
                        style: .continuous
                    )
                )
            }
        }
        .glassCard()
    }
}
