import SwiftUI

// MARK: - Cycling History View

/// History of cycling activities
struct CyclingHistoryView: View {
    @EnvironmentObject var viewModel: CyclingViewModel
    @EnvironmentObject var stravaAuth: StravaAuthManager

    var body: some View {
        ScrollView {
            LazyVStack(spacing: Theme.Spacing.space3) {
                if !stravaAuth.isConnected {
                    // Not connected to Strava
                    EmptyHistoryCard()
                } else if viewModel.activities.isEmpty {
                    // Connected but no activities yet
                    NoRidesCard()
                } else {
                    // Show activities
                    ForEach(viewModel.activities) { activity in
                        RideCard(activity: activity)
                    }
                }
            }
            .padding(Theme.Spacing.space5)
        }
    }
}

// MARK: - Ride Card

/// Card displaying a single ride activity
struct RideCard: View {
    let activity: CyclingActivityModel

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space2) {
            // Header row
            HStack {
                Text(activity.date, style: .date)
                    .font(.subheadline)
                    .foregroundStyle(Theme.textSecondary)

                // HR completeness indicator
                if let completeness = activity.hrCompleteness {
                    HRCompletenessIndicator(completeness: completeness)
                }

                Spacer()
                WorkoutTypeBadge(type: activity.type)
            }

            // Stats row
            HStack(spacing: Theme.Spacing.space4) {
                StatColumn(value: "\(activity.durationMinutes)", label: "min")
                StatColumn(value: "\(Int(activity.normalizedPower))", label: "NP")
                StatColumn(value: "\(Int(activity.tss))", label: "TSS")
                StatColumn(value: "\(Int(activity.avgHeartRate))", label: "HR")
            }
            .frame(maxWidth: .infinity)

            // Extra metrics row (EF, peak power)
            if activity.ef != nil || activity.peak5MinPower != nil {
                Divider()
                    .overlay(Theme.divider)

                HStack(spacing: Theme.Spacing.space4) {
                    if let ef = activity.ef {
                        StatColumn(value: String(format: "%.2f", ef), label: "EF")
                    }
                    if let peak = activity.peak5MinPower {
                        StatColumn(value: "\(peak)", label: "5m pk")
                    }
                }
                .frame(maxWidth: .infinity)
            }
        }
        .glassCard()
    }
}

// MARK: - HR Completeness Indicator

/// Shows HR data quality with a color-coded icon
struct HRCompletenessIndicator: View {
    let completeness: Int

    private var color: Color {
        if completeness >= 80 {
            return Theme.success
        } else if completeness >= 50 {
            return Theme.warning
        } else {
            return Theme.destructive
        }
    }

    private var iconName: String {
        completeness >= 80 ? "heart.fill" : "heart.slash.fill"
    }

    var body: some View {
        HStack(spacing: 2) {
            Image(systemName: iconName)
                .font(.caption2)
            Text("\(completeness)%")
                .font(.caption2)
                .fontWeight(.medium)
                .monospacedDigit()
        }
        .foregroundStyle(color)
    }
}

// MARK: - Stat Column

/// Individual stat display column
struct StatColumn: View {
    let value: String
    let label: String

    var body: some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.system(.title3, design: .rounded, weight: .semibold))
                .monospacedDigit()
                .foregroundColor(Theme.textPrimary)
            Text(label)
                .font(.caption)
                .foregroundStyle(Theme.textSecondary)
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Workout Type Badge

/// Badge displaying workout type with color coding
struct WorkoutTypeBadge: View {
    let type: CyclingActivityModel.CyclingWorkoutType

    var color: Color {
        switch type {
        case .vo2max: return Theme.destructive
        case .threshold: return Theme.warning
        case .endurance: return Theme.info
        case .tempo: return Color.orange
        case .fun: return Theme.success
        case .recovery: return Theme.info
        case .unknown: return Theme.textSecondary
        }
    }

    var body: some View {
        Text(type.rawValue.uppercased())
            .font(.caption2)
            .fontWeight(.semibold)
            .padding(.horizontal, Theme.Spacing.space2)
            .padding(.vertical, 2)
            .background(color.opacity(0.2))
            .foregroundStyle(color)
            .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.sm, style: .continuous))
    }
}

// MARK: - Empty History Card

/// Empty state when not connected to Strava
struct EmptyHistoryCard: View {
    var body: some View {
        VStack(spacing: Theme.Spacing.space3) {
            Image(systemName: "bicycle")
                .font(.system(size: Theme.Typography.iconXXL, weight: .regular))
                .foregroundStyle(Theme.textTertiary)

            Text("Connect Strava")
                .font(.title3)
                .fontWeight(.semibold)
                .foregroundColor(Theme.textPrimary)

            Text("Connect Strava to sync your Peloton rides and start tracking your training.")
                .font(.subheadline)
                .foregroundStyle(Theme.textSecondary)
                .multilineTextAlignment(.center)

            NavigationLink(destination: StravaConnectionView()) {
                Text("Connect Strava")
            }
            .buttonStyle(GlassPrimaryButtonStyle())
            .padding(.top, Theme.Spacing.space2)
        }
        .padding(Theme.Spacing.space6)
        .glassCard()
    }
}

// MARK: - No Rides Card

/// Empty state when connected but no rides yet
struct NoRidesCard: View {
    var body: some View {
        VStack(spacing: Theme.Spacing.space3) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: Theme.Typography.iconXXL, weight: .regular))
                .foregroundStyle(Theme.success)

            Text("Ready to Track")
                .font(.title3)
                .fontWeight(.semibold)
                .foregroundColor(Theme.textPrimary)

            Text("You're all set! Your Peloton rides will appear here once they sync from Strava.")
                .font(.subheadline)
                .foregroundStyle(Theme.textSecondary)
                .multilineTextAlignment(.center)
        }
        .padding(Theme.Spacing.space6)
        .glassCard()
    }
}

// MARK: - Previews

#Preview("With Rides") {
    CyclingHistoryView()
        .environmentObject(CyclingViewModel())
        .background(AuroraBackground().ignoresSafeArea())
        .preferredColorScheme(.dark)
}

#Preview("Empty State") {
    CyclingHistoryView()
        .environmentObject(CyclingViewModel())
        .background(AuroraBackground().ignoresSafeArea())
        .preferredColorScheme(.dark)
}
