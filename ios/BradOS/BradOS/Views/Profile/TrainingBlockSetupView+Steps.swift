import SwiftUI

// MARK: - Step Views

extension TrainingBlockSetupView {

    // MARK: - Step 1: Experience & Availability

    var experienceStep: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space6) {
            VStack(alignment: .leading, spacing: Theme.Spacing.space2) {
                Text("Experience Level")
                    .font(.title3)
                    .fontWeight(.semibold)
                    .foregroundColor(Theme.textPrimary)
                Text("This helps the AI coach tailor your plan")
                    .font(.subheadline)
                    .foregroundStyle(Theme.textSecondary)
            }

            VStack(spacing: Theme.Spacing.space3) {
                ForEach(ExperienceLevel.allCases, id: \.self) { level in
                    Button {
                        experienceLevel = level
                    } label: {
                        HStack(spacing: Theme.Spacing.space3) {
                            Image(systemName: level.systemImage)
                                .font(.title3)
                                .foregroundStyle(experienceLevel == level ? Theme.interactivePrimary : Theme.textSecondary)
                                .frame(width: 32)

                            VStack(alignment: .leading, spacing: 2) {
                                Text(level.displayName)
                                    .font(.headline)
                                    .foregroundColor(Theme.textPrimary)
                                Text(level.description)
                                    .font(.caption)
                                    .foregroundStyle(Theme.textSecondary)
                                    .lineLimit(2)
                            }

                            Spacer()

                            if experienceLevel == level {
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundStyle(Theme.interactivePrimary)
                            }
                        }
                        .padding(Theme.Spacing.space4)
                    }
                    .buttonStyle(.plain)
                    .glassCard(.card, padding: 0)
                    .overlay(
                        RoundedRectangle(cornerRadius: Theme.CornerRadius.lg, style: .continuous)
                            .stroke(experienceLevel == level ? Theme.interactivePrimary.opacity(0.5) : Color.clear, lineWidth: 1.5)
                    )
                }
            }

            VStack(alignment: .leading, spacing: Theme.Spacing.space3) {
                Text("Weekly Hours Available")
                    .font(.headline)
                    .foregroundColor(Theme.textPrimary)

                HStack(spacing: Theme.Spacing.space2) {
                    ForEach(HoursOption.allCases, id: \.self) { option in
                        Button {
                            hoursOption = option
                        } label: {
                            Text(option.rawValue)
                                .font(.subheadline)
                                .fontWeight(.medium)
                                .foregroundColor(hoursOption == option ? Theme.textPrimary : Theme.textSecondary)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, Theme.Spacing.space3)
                                .background(hoursOption == option ? Theme.interactivePrimary.opacity(0.2) : Color.white.opacity(0.04))
                                .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))
                                .overlay(
                                    RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous)
                                        .stroke(hoursOption == option ? Theme.interactivePrimary.opacity(0.5) : Theme.strokeSubtle, lineWidth: 1)
                                )
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    // MARK: - Step 2: Sessions & Days

    var sessionsStep: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space6) {
            VStack(alignment: .leading, spacing: Theme.Spacing.space2) {
                Text("Sessions Per Week")
                    .font(.title3)
                    .fontWeight(.semibold)
                    .foregroundColor(Theme.textPrimary)
            }

            HStack(spacing: Theme.Spacing.space2) {
                ForEach([2, 3, 4, 5], id: \.self) { count in
                    Button {
                        sessionsPerWeek = count
                        updatePreferredDays(for: count)
                    } label: {
                        Text("\(count)")
                            .font(.title3)
                            .fontWeight(.semibold)
                            .foregroundColor(sessionsPerWeek == count ? Theme.textPrimary : Theme.textSecondary)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, Theme.Spacing.space4)
                            .background(sessionsPerWeek == count ? Theme.interactivePrimary.opacity(0.2) : Color.white.opacity(0.04))
                            .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.md, style: .continuous))
                            .overlay(
                                RoundedRectangle(cornerRadius: Theme.CornerRadius.md, style: .continuous)
                                    .stroke(sessionsPerWeek == count ? Theme.interactivePrimary.opacity(0.5) : Theme.strokeSubtle, lineWidth: 1)
                            )
                    }
                    .buttonStyle(.plain)
                }
            }

            VStack(alignment: .leading, spacing: Theme.Spacing.space3) {
                Text("Preferred Days")
                    .font(.headline)
                    .foregroundColor(Theme.textPrimary)

                Text("These are suggestions \u{2014} ride whenever works for you")
                    .font(.caption)
                    .foregroundStyle(Theme.textSecondary)

                HStack(spacing: Theme.Spacing.space2) {
                    ForEach(dayOptions, id: \.number) { day in
                        Button {
                            if preferredDays.contains(day.number) {
                                preferredDays.remove(day.number)
                            } else {
                                preferredDays.insert(day.number)
                            }
                        } label: {
                            Text(day.short)
                                .font(.subheadline)
                                .fontWeight(.medium)
                                .foregroundColor(preferredDays.contains(day.number) ? Theme.textPrimary : Theme.textTertiary)
                                .frame(width: 42, height: 42)
                                .background(preferredDays.contains(day.number) ? Theme.interactivePrimary.opacity(0.25) : Color.white.opacity(0.04))
                                .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))
                                .overlay(
                                    RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous)
                                        .stroke(preferredDays.contains(day.number) ? Theme.interactivePrimary.opacity(0.5) : Theme.strokeSubtle, lineWidth: 1)
                                )
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    // MARK: - Step 3: Goals

    var goalsStep: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space6) {
            VStack(alignment: .leading, spacing: Theme.Spacing.space2) {
                Text("Training Goals")
                    .font(.title3)
                    .fontWeight(.semibold)
                    .foregroundColor(Theme.textPrimary)
                Text("Select all that apply")
                    .font(.subheadline)
                    .foregroundStyle(Theme.textSecondary)
            }

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
                        HStack(spacing: Theme.Spacing.space4) {
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
                        .padding(Theme.Spacing.space4)
                        .frame(minHeight: Theme.Dimensions.listRowMinHeight)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            .glassCard(.card, padding: 0)
        }
    }

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
                        .progressViewStyle(CircularProgressViewStyle(tint: Theme.interactivePrimary))
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
    func schedulePreviewContent(_ schedule: GenerateScheduleResponse) -> some View {
        // Sessions list
        VStack(spacing: Theme.Spacing.space3) {
            ForEach(Array(schedule.sessions.enumerated()), id: \.element.id) { index, session in
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
        }

        // Rationale
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

        // Regenerate button
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
            // Week indicator with progress bar and phase
            WeekIndicatorCard(block: block)

            // Session queue (if weekly sessions available)
            if block.weeklySessions != nil {
                SessionQueueCard(
                    block: block,
                    sessionsCompleted: cyclingVM.sessionsCompletedThisWeek,
                    activities: cyclingVM.activities
                )

                // Next Up card
                if let nextSession = cyclingVM.nextSession {
                    NextUpCard(
                        session: nextSession,
                        weekProgress: "\(cyclingVM.sessionsCompletedThisWeek + 1) of \(cyclingVM.weeklySessionsTotal)"
                    )
                } else if cyclingVM.sessionsCompletedThisWeek >= cyclingVM.weeklySessionsTotal && cyclingVM.weeklySessionsTotal > 0 {
                    WeekCompleteCard(sessionsTotal: cyclingVM.weeklySessionsTotal)
                }
            }

            // Complete block early
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
