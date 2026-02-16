import SwiftUI

// MARK: - Preview & Active Block Steps

extension TrainingBlockSetupView {

    // MARK: - Step 4: AI Schedule Preview

    var previewStep: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space6) {
            VStack(alignment: .leading, spacing: Theme.Spacing.space2) {
                Text("Your AI-Generated Plan")
                    .font(.title3)
                    .fontWeight(.semibold)
                    .foregroundColor(Theme.textPrimary)
            }

            if isGenerating {
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
            } else if let schedule = generatedSchedule {
                schedulePreviewContent(schedule)
            } else if let error = generateError {
                generateErrorContent(error)
            }
        }
        .task {
            if generatedSchedule == nil && !isGenerating {
                await generateScheduleAction()
            }
        }
    }

    @ViewBuilder
    func schedulePreviewContent(
        _ schedule: GenerateScheduleResponse
    ) -> some View {
        scheduleSessionsList(schedule.sessions)
        scheduleRationale(schedule.rationale)
        regenerateButton
    }

    @ViewBuilder
    private func scheduleSessionsList(
        _ sessions: [WeeklySessionModel]
    ) -> some View {
        VStack(spacing: Theme.Spacing.space3) {
            ForEach(
                Array(sessions.enumerated()),
                id: \.element.id
            ) { index, session in
                scheduleSessionRow(index: index, session: session)
            }
        }
    }

    private func scheduleSessionRow(
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

    private func scheduleRationale(_ rationale: String) -> some View {
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
            Text(rationale)
                .font(.caption)
                .foregroundStyle(Theme.textSecondary)
        }
        .padding(Theme.Spacing.space4)
        .glassCard()
    }

    private var regenerateButton: some View {
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

    @ViewBuilder
    func generateErrorContent(_ error: String) -> some View {
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

    // MARK: - Step 5: Start Date

    var startDateStep: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space6) {
            VStack(alignment: .leading, spacing: Theme.Spacing.space2) {
                Text("When do you want to start?")
                    .font(.title3)
                    .fontWeight(.semibold)
                    .foregroundColor(Theme.textPrimary)
            }

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
                .frame(minHeight: Theme.Dimensions.listRowMinHeight)

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
                .frame(minHeight: Theme.Dimensions.listRowMinHeight)
            }
            .glassCard(.card, padding: 0)

            Button(action: startBlock) {
                HStack {
                    if isSaving {
                        ProgressView()
                            .tint(Theme.textPrimary)
                    } else {
                        Text("Start Training Block")
                    }
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(GlassPrimaryButtonStyle())
            .disabled(isSaving)
        }
    }

    // MARK: - Active Block Section

    @ViewBuilder
    func activeBlockSection(block: TrainingBlockModel) -> some View {
        VStack(spacing: Theme.Spacing.space4) {
            WeekIndicatorCard(block: block)

            if block.weeklySessions != nil {
                SessionQueueCard(
                    block: block,
                    sessionsCompleted: cyclingVM.sessionsCompletedThisWeek,
                    activities: cyclingVM.activities
                )

                if let nextSession = cyclingVM.nextSession {
                    NextUpCard(
                        session: nextSession,
                        weekProgress: "\(cyclingVM.sessionsCompletedThisWeek + 1) of \(cyclingVM.weeklySessionsTotal)"
                    )
                } else if cyclingVM.sessionsCompletedThisWeek >= cyclingVM.weeklySessionsTotal
                            && cyclingVM.weeklySessionsTotal > 0 {
                    WeekCompleteCard(
                        sessionsTotal: cyclingVM.weeklySessionsTotal
                    )
                }
            }

            Button(role: .destructive) {
                completeBlockEarly()
            } label: {
                Text("Complete Block Early")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(GlassSecondaryButtonStyle())
        }
    }
}
