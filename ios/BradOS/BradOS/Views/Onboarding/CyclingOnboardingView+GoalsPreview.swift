import SwiftUI

// MARK: - Goals & Preview Steps

extension CyclingOnboardingView {

    // MARK: - Goals Step

    var goalsStep: some View {
        ScrollView {
            VStack(spacing: Theme.Spacing.space6) {
                Spacer()
                    .frame(height: Theme.Spacing.space4)

                VStack(spacing: Theme.Spacing.space2) {
                    Text("Training Goals")
                        .font(.title2)
                        .fontWeight(.bold)
                        .foregroundColor(Theme.textPrimary)

                    Text("Select all that apply")
                        .font(.subheadline)
                        .foregroundStyle(Theme.textSecondary)
                }

                VStack(spacing: 0) {
                    ForEach(
                        Array(TrainingBlockModel.TrainingGoal.allCases.enumerated()),
                        id: \.element
                    ) { index, goal in
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
                            HStack(spacing: Theme.Spacing.space3) {
                                Image(systemName: iconForGoal(goal))
                                    .foregroundColor(Theme.cycling)
                                    .frame(width: 24)

                                Text(displayNameForGoal(goal))
                                    .foregroundColor(Theme.textPrimary)

                                Spacer()

                                if selectedGoals.contains(goal) {
                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundStyle(Theme.interactivePrimary)
                                } else {
                                    Image(systemName: "circle")
                                        .foregroundStyle(Theme.textTertiary)
                                }
                            }
                            .padding(Theme.Spacing.space3)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
                .glassCard(.card, padding: 0)

                Spacer()
            }
            .padding(Theme.Spacing.space5)
        }
    }

    // MARK: - Preview Step

    var previewStep: some View {
        ScrollView {
            VStack(spacing: Theme.Spacing.space6) {
                Spacer()
                    .frame(height: Theme.Spacing.space4)

                VStack(spacing: Theme.Spacing.space2) {
                    Text("Your AI-Generated Plan")
                        .font(.title2)
                        .fontWeight(.bold)
                        .foregroundColor(Theme.textPrimary)
                }

                if isGenerating {
                    previewLoadingContent
                } else if let schedule = generatedSchedule {
                    previewScheduleContent(schedule)
                } else if let error = generateError {
                    previewErrorContent(error)
                }

                Spacer()
            }
            .padding(Theme.Spacing.space5)
        }
        .task {
            if generatedSchedule == nil && !isGenerating {
                await generateScheduleAction()
            }
        }
    }

    private var previewLoadingContent: some View {
        VStack(spacing: Theme.Spacing.space4) {
            ProgressView()
                .progressViewStyle(CircularProgressViewStyle(
                    tint: Theme.interactivePrimary
                ))
                .scaleEffect(1.2)
            Text("Generating your training plan...")
                .font(.subheadline)
                .foregroundStyle(Theme.textSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, Theme.Spacing.space8)
        .glassCard()
    }

    @ViewBuilder
    private func previewScheduleContent(
        _ schedule: GenerateScheduleResponse
    ) -> some View {
        VStack(spacing: Theme.Spacing.space3) {
            ForEach(
                Array(schedule.sessions.enumerated()),
                id: \.element.id
            ) { index, session in
                previewSessionRow(index: index, session: session)
            }
        }

        VStack(alignment: .leading, spacing: Theme.Spacing.space2) {
            HStack(spacing: Theme.Spacing.space2) {
                Image(systemName: "brain.head.profile")
                    .font(.caption)
                    .foregroundStyle(Theme.interactivePrimary)
                Text("Coach's Rationale")
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .foregroundColor(Theme.textPrimary)
            }
            Text(schedule.rationale)
                .font(.caption)
                .foregroundStyle(Theme.textSecondary)
        }
        .padding(Theme.Spacing.space4)
        .glassCard()

        Button {
            Task { await generateScheduleAction() }
        } label: {
            HStack {
                Image(systemName: "arrow.clockwise")
                Text("Regenerate")
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(GlassSecondaryButtonStyle())
    }

    private func previewSessionRow(
        index: Int, session: WeeklySessionModel
    ) -> some View {
        HStack(spacing: Theme.Spacing.space3) {
            Text("\(index + 1)")
                .font(.caption)
                .fontWeight(.bold)
                .foregroundColor(Theme.interactivePrimary)
                .frame(width: 24, height: 24)
                .background(Theme.interactivePrimary.opacity(0.15))
                .clipShape(Circle())

            Image(systemName: session.systemImage)
                .font(.subheadline)
                .foregroundStyle(colorForSessionType(session.sessionType))
                .frame(width: 20)

            VStack(alignment: .leading, spacing: 2) {
                Text(session.displayName)
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .foregroundColor(Theme.textPrimary)

                Text(session.pelotonClassTypes.joined(separator: ", "))
                    .font(.caption)
                    .foregroundStyle(Theme.textSecondary)
                    .lineLimit(1)
            }

            Spacer()

            Text("\(session.suggestedDurationMinutes) min")
                .font(.caption)
                .fontWeight(.medium)
                .foregroundStyle(Theme.textSecondary)
        }
        .padding(Theme.Spacing.space3)
        .glassCard(.card, padding: 0)
    }

    @ViewBuilder
    private func previewErrorContent(_ error: String) -> some View {
        VStack(spacing: Theme.Spacing.space3) {
            Image(systemName: "exclamationmark.triangle")
                .font(.title2)
                .foregroundStyle(Theme.warning)
            Text(error)
                .font(.subheadline)
                .foregroundStyle(Theme.textSecondary)
                .multilineTextAlignment(.center)
            Button {
                Task { await generateScheduleAction() }
            } label: {
                Text("Try Again")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(GlassSecondaryButtonStyle())
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, Theme.Spacing.space4)
        .glassCard()
    }
}
