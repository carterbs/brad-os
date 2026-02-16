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
                                .foregroundStyle(
                                    experienceLevel == level ? Theme.interactivePrimary : Theme.textSecondary
                                )
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
                            .stroke(
                            experienceLevel == level ? Theme.interactivePrimary.opacity(0.5) : Color.clear,
                            lineWidth: 1.5
                        )
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
                                .foregroundColor(
                                    hoursOption == option ? Theme.textPrimary : Theme.textSecondary
                                )
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, Theme.Spacing.space3)
                                .background(
                                    hoursOption == option
                                        ? Theme.interactivePrimary.opacity(0.2) : Color.white.opacity(0.04)
                                )
                                .clipShape(
                                    RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous)
                                )
                                .overlay(
                                    RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous)
                                        .stroke(
                                            hoursOption == option
                                                ? Theme.interactivePrimary.opacity(0.5) : Theme.strokeSubtle,
                                            lineWidth: 1
                                        )
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
                            .foregroundColor(
                                sessionsPerWeek == count ? Theme.textPrimary : Theme.textSecondary
                            )
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, Theme.Spacing.space4)
                            .background(
                                sessionsPerWeek == count
                                    ? Theme.interactivePrimary.opacity(0.2) : Color.white.opacity(0.04)
                            )
                            .clipShape(
                                RoundedRectangle(cornerRadius: Theme.CornerRadius.md, style: .continuous)
                            )
                            .overlay(
                                RoundedRectangle(cornerRadius: Theme.CornerRadius.md, style: .continuous)
                                    .stroke(
                                        sessionsPerWeek == count
                                            ? Theme.interactivePrimary.opacity(0.5) : Theme.strokeSubtle,
                                        lineWidth: 1
                                    )
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
                                .foregroundColor(
                                    preferredDays.contains(day.number) ? Theme.textPrimary : Theme.textTertiary
                                )
                                .frame(width: 42, height: 42)
                                .background(
                                    preferredDays.contains(day.number)
                                        ? Theme.interactivePrimary.opacity(0.25) : Color.white.opacity(0.04)
                                )
                                .clipShape(
                                    RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous)
                                )
                                .overlay(
                                    RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous)
                                        .stroke(
                                            preferredDays.contains(day.number)
                                                ? Theme.interactivePrimary.opacity(0.5) : Theme.strokeSubtle,
                                            lineWidth: 1
                                        )
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
}
