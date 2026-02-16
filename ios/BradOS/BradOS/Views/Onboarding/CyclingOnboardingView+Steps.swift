import SwiftUI

// MARK: - Step Views

extension CyclingOnboardingView {

    // MARK: - FTP Step

    var ftpStep: some View {
        ScrollView {
            VStack(spacing: Theme.Spacing.space6) {
                Spacer()
                    .frame(height: Theme.Spacing.space8)

                Image(systemName: CyclingOnboardingStep.ftp.systemImage)
                    .font(.system(size: 64))
                    .foregroundStyle(.yellow)
                    .frame(width: 120, height: 120)
                    .background(Color.yellow.opacity(0.15))
                    .clipShape(Circle())

                VStack(spacing: Theme.Spacing.space2) {
                    Text(CyclingOnboardingStep.ftp.title)
                        .font(.title2)
                        .fontWeight(.bold)
                        .foregroundColor(Theme.textPrimary)

                    Text(
                        "FTP is the maximum power you can sustain for ~1 hour. " +
                        "It's used to calculate training zones and TSS."
                    )
                        .font(.subheadline)
                        .foregroundStyle(Theme.textSecondary)
                        .multilineTextAlignment(.center)
                }

                VStack(spacing: 0) {
                    HStack {
                        Text("FTP (watts)")
                            .foregroundColor(Theme.textSecondary)
                        Spacer()
                        TextField("e.g. 200", text: $ftpValue)
                            .keyboardType(.numberPad)
                            .multilineTextAlignment(.trailing)
                            .foregroundColor(Theme.textPrimary)
                            .frame(width: 100)
                    }
                    .padding(Theme.Spacing.space4)
                    .frame(minHeight: Theme.Dimensions.listRowMinHeight)
                }
                .glassCard(.card, padding: 0)

                if let ftp = Int(ftpValue), ftp > 0 {
                    powerZonesPreview(ftp: ftp)
                }

                VStack(alignment: .leading, spacing: Theme.Spacing.space2) {
                    HStack(spacing: Theme.Spacing.space2) {
                        Image(systemName: "info.circle.fill")
                            .foregroundStyle(Theme.info)
                        Text("Don't know your FTP?")
                            .font(.subheadline)
                            .fontWeight(.medium)
                            .foregroundColor(Theme.textPrimary)
                    }
                    Text(
                        "You can estimate it from a 20-minute max effort test " +
                        "(take 95% of average power) or skip for now and update later."
                    )
                        .font(.caption)
                        .foregroundStyle(Theme.textSecondary)
                }
                .padding(Theme.Spacing.space4)
                .glassCard()

                Spacer()
            }
            .padding(Theme.Spacing.space5)
        }
    }

    func powerZonesPreview(ftp: Int) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space3) {
            Text("Your Training Zones")
                .font(.subheadline)
                .fontWeight(.semibold)
                .foregroundColor(Theme.textPrimary)

            VStack(spacing: Theme.Spacing.space2) {
                PowerZoneRow(zone: "Z1 Recovery", range: "< \(Int(Double(ftp) * 0.55))W", color: Theme.info)
                PowerZoneRow(
                    zone: "Z2 Endurance",
                    range: "\(Int(Double(ftp) * 0.55))-\(Int(Double(ftp) * 0.75))W",
                    color: Theme.success
                )
                PowerZoneRow(
                    zone: "Z3 Tempo",
                    range: "\(Int(Double(ftp) * 0.75))-\(Int(Double(ftp) * 0.90))W",
                    color: Theme.warning
                )
                PowerZoneRow(
                    zone: "Z4 Threshold",
                    range: "\(Int(Double(ftp) * 0.90))-\(Int(Double(ftp) * 1.05))W",
                    color: Color.orange
                )
                PowerZoneRow(zone: "Z5 VO2max", range: "> \(Int(Double(ftp) * 1.05))W", color: Theme.destructive)
            }
        }
        .padding(Theme.Spacing.space4)
        .glassCard()
    }

    // MARK: - Experience Step

    var experienceStep: some View {
        ScrollView {
            VStack(spacing: Theme.Spacing.space6) {
                Spacer()
                    .frame(height: Theme.Spacing.space4)

                VStack(spacing: Theme.Spacing.space2) {
                    Text("Experience Level")
                        .font(.title2)
                        .fontWeight(.bold)
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
                        ForEach(OnboardingHoursOption.allCases, id: \.self) { option in
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

                Spacer()
            }
            .padding(Theme.Spacing.space5)
        }
    }

    // MARK: - Sessions Step

    var sessionsStep: some View {
        ScrollView {
            VStack(spacing: Theme.Spacing.space6) {
                Spacer()
                    .frame(height: Theme.Spacing.space4)

                VStack(spacing: Theme.Spacing.space2) {
                    Text("Sessions Per Week")
                        .font(.title2)
                        .fontWeight(.bold)
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

                Spacer()
            }
            .padding(Theme.Spacing.space5)
        }
    }
}
