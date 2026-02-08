import SwiftUI

// MARK: - Cycling History View

/// History of cycling activities
struct CyclingHistoryView: View {
    @EnvironmentObject var viewModel: CyclingViewModel

    var body: some View {
        ScrollView {
            LazyVStack(spacing: Theme.Spacing.space3) {
                if viewModel.activities.isEmpty {
                    EmptyHistoryCard()
                } else {
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
                Spacer()
                WorkoutTypeBadge(type: activity.type)
            }

            // Stats row
            HStack(spacing: Theme.Spacing.space4) {
                StatColumn(value: "\(activity.durationMinutes)", label: "min")
                StatColumn(value: "\(activity.normalizedPower)", label: "NP")
                StatColumn(value: "\(activity.tss)", label: "TSS")
                StatColumn(value: "\(activity.avgHeartRate)", label: "HR")
            }
            .frame(maxWidth: .infinity)
        }
        .glassCard()
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

/// Empty state when no rides recorded
struct EmptyHistoryCard: View {
    var body: some View {
        VStack(spacing: Theme.Spacing.space3) {
            Image(systemName: "bicycle")
                .font(.system(size: Theme.Typography.iconXXL, weight: .regular))
                .foregroundStyle(Theme.textTertiary)

            Text("No Rides Yet")
                .font(.title3)
                .fontWeight(.semibold)
                .foregroundColor(Theme.textPrimary)

            Text("Connect Strava to sync your Peloton rides and start tracking your training.")
                .font(.subheadline)
                .foregroundStyle(Theme.textSecondary)
                .multilineTextAlignment(.center)

            Button(action: {
                // TODO: Connect Strava flow
            }) {
                Text("Connect Strava")
            }
            .buttonStyle(GlassPrimaryButtonStyle())
            .padding(.top, Theme.Spacing.space2)
        }
        .padding(Theme.Spacing.space6)
        .glassCard()
    }
}

// MARK: - Previews

#Preview("With Rides") {
    let viewModel = CyclingViewModel()

    return CyclingHistoryView()
        .environmentObject(viewModel)
        .background(AuroraBackground().ignoresSafeArea())
        .preferredColorScheme(.dark)
        .task {
            await viewModel.loadData()
        }
}

#Preview("Empty State") {
    let viewModel = CyclingViewModel()

    return CyclingHistoryView()
        .environmentObject(viewModel)
        .background(AuroraBackground().ignoresSafeArea())
        .preferredColorScheme(.dark)
}
