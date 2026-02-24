import BradOSCore
import SwiftUI

/// Card showing activity details in day detail sheet -- Glass L4 (overlay)
struct DayActivityCard: View {
    let activity: CalendarActivity
    var onTap: (() -> Void)?

    private var hasDetailView: Bool {
        activity.type == .workout || activity.type == .stretch
    }

    var body: some View {
        Button {
            onTap?()
        } label: {
            VStack(alignment: .leading, spacing: Theme.Spacing.space2) {
                HStack {
                    Image(systemName: activity.type.iconName)
                        .foregroundColor(activity.type.color)

                    Text(activity.type.displayName)
                        .font(.headline)
                        .foregroundColor(Theme.textPrimary)

                    Spacer()

                    if let completedAt = activity.completedAt {
                        Text(formatTime(completedAt))
                            .font(.caption)
                            .monospacedDigit()
                            .foregroundColor(Theme.textSecondary)
                    }

                    if hasDetailView {
                        Image(systemName: "chevron.right")
                            .font(.caption)
                            .foregroundColor(Theme.textSecondary)
                    }
                }

                Divider()
                    .background(Theme.divider)

                activityDetails
            }
            .glassCard(.overlay)
        }
        .buttonStyle(PlainButtonStyle())
    }

    @ViewBuilder
    private var activityDetails: some View {
        switch activity.type {
        case .workout:
            workoutDetails
        case .stretch:
            stretchDetails
        case .meditation:
            meditationDetails
        case .cycling:
            cyclingDetails
        }
    }

    @ViewBuilder
    private var workoutDetails: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let dayName = activity.summary.dayName {
                Text(dayName)
                    .font(.subheadline)
                    .foregroundColor(Theme.textPrimary)
            }
            if let sets = activity.summary.setsCompleted,
               let total = activity.summary.totalSets {
                Text("\(sets)/\(total) sets completed")
                    .font(.caption)
                    .monospacedDigit()
                    .foregroundColor(Theme.textSecondary)
            }
        }
    }

    @ViewBuilder
    private var stretchDetails: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let regions = activity.summary.regionsCompleted,
               regions > 0 {
                let label = regions == 1 ? "region" : "regions"
                Text("\(regions) \(label) stretched")
                    .font(.subheadline)
                    .monospacedDigit()
                    .foregroundColor(Theme.textPrimary)
            }
            if let duration = activity.summary.totalDurationSeconds,
               duration > 0 {
                durationText(duration)
            }
        }
    }

    @ViewBuilder
    private var meditationDetails: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let meditationType = activity.summary.meditationType {
                Text(Self.formatMeditationType(meditationType))
                    .font(.subheadline)
                    .foregroundColor(Theme.textPrimary)
            }
            if let duration = activity.summary.durationSeconds,
               duration > 0 {
                durationText(duration)
            }
        }
    }

    @ViewBuilder
    private var cyclingDetails: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let cyclingType = activity.summary.cyclingType {
                Text(formatCyclingType(cyclingType))
                    .font(.subheadline)
                    .foregroundColor(Theme.textPrimary)
            }
            if let durationMinutes = activity.summary.durationMinutes {
                Text(Self.formatActivityMinutes(durationMinutes))
                    .font(.caption)
                    .monospacedDigit()
                    .foregroundColor(Theme.textSecondary)
            }
            if let tss = activity.summary.tss {
                Text("TSS \(tss)")
                    .font(.caption)
                    .monospacedDigit()
                    .foregroundColor(Theme.textSecondary)
            }
        }
    }

    @ViewBuilder
    private func durationText(_ duration: Int) -> some View {
        if duration < 60 {
            Text("< 1 minute")
                .font(.caption)
                .monospacedDigit()
                .foregroundColor(Theme.textSecondary)
        } else {
            let minutes = duration / 60
            let label = minutes == 1 ? "minute" : "minutes"
            Text("\(minutes) \(label)")
                .font(.caption)
                .monospacedDigit()
                .foregroundColor(Theme.textSecondary)
        }
    }

    static func formatMeditationType(_ sessionType: String) -> String {
        if sessionType == "basic-breathing" {
            return "Breathing"
        } else if sessionType.hasPrefix("reactivity-") {
            return "Reactivity Series"
        }
        return "Meditation"
    }

    static func formatActivityMinutes(_ minutes: Int) -> String {
        let label = minutes == 1 ? "minute" : "minutes"
        return "\(minutes) \(label)"
    }

    private func formatCyclingType(_ cyclingType: String) -> String {
        if cyclingType.isEmpty {
            return "Cycling"
        }
        return cyclingType
            .replacingOccurrences(of: "-", with: " ")
            .capitalized
    }

    private func formatTime(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }
}
