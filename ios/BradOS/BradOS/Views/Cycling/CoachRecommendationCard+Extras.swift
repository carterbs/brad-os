import SwiftUI

// MARK: - Loading Card

/// Loading state for coach recommendation
struct CoachRecommendationLoadingCard: View {
    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space3) {
            HStack(spacing: Theme.Spacing.space2) {
                Image(systemName: "figure.outdoor.cycle")
                    .font(.system(size: Theme.Typography.cardHeaderIcon))
                    .foregroundColor(Theme.interactivePrimary)
                    .frame(
                        width: Theme.Dimensions.iconFrameMD,
                        height: Theme.Dimensions.iconFrameMD
                    )
                    .background(Theme.interactivePrimary.opacity(0.12))
                    .clipShape(RoundedRectangle(
                        cornerRadius: Theme.CornerRadius.sm,
                        style: .continuous
                    ))

                Text("AI Coach")
                    .font(.title3)
                    .fontWeight(.semibold)
                    .foregroundColor(Theme.textPrimary)
            }

            HStack(spacing: Theme.Spacing.space2) {
                ProgressView()
                    .progressViewStyle(CircularProgressViewStyle(
                        tint: Theme.interactivePrimary
                    ))
                Text("Analyzing your data...")
                    .font(.subheadline)
                    .foregroundStyle(Theme.textSecondary)
            }
            .frame(maxWidth: .infinity, alignment: .center)
            .padding(.vertical, Theme.Spacing.space4)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .glassCard()
    }
}

// MARK: - Error Card

/// Error state for coach recommendation
struct CoachRecommendationErrorCard: View {
    let error: String
    let onRetry: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.space3) {
            HStack(spacing: Theme.Spacing.space2) {
                Image(systemName: "figure.outdoor.cycle")
                    .font(.system(size: Theme.Typography.cardHeaderIcon))
                    .foregroundColor(Theme.interactivePrimary)
                    .frame(
                        width: Theme.Dimensions.iconFrameMD,
                        height: Theme.Dimensions.iconFrameMD
                    )
                    .background(Theme.interactivePrimary.opacity(0.12))
                    .clipShape(RoundedRectangle(
                        cornerRadius: Theme.CornerRadius.sm,
                        style: .continuous
                    ))

                Text("AI Coach")
                    .font(.title3)
                    .fontWeight(.semibold)
                    .foregroundColor(Theme.textPrimary)
            }

            VStack(spacing: Theme.Spacing.space2) {
                Image(systemName: "exclamationmark.triangle")
                    .font(.title2)
                    .foregroundStyle(Theme.warning)

                Text(error)
                    .font(.subheadline)
                    .foregroundStyle(Theme.textSecondary)
                    .multilineTextAlignment(.center)

                Button(action: onRetry) {
                    Text("Try Again")
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(Theme.interactivePrimary)
                }
                .padding(.top, Theme.Spacing.space1)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, Theme.Spacing.space3)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .glassCard()
    }
}

// MARK: - Previews

#Preview("Peloton-Oriented") {
    let recommendation = CyclingCoachRecommendation(
        session: CyclingCoachRecommendation.SessionRecommendation(
            type: "vo2max",
            durationMinutes: 45,
            targetTSS: CyclingCoachRecommendation.TSSRange(min: 45, max: 60),
            targetZones: "Z5-Z6 for work, Z1-Z2 for recovery",
            pelotonClassTypes: ["Power Zone Max", "HIIT & Hills", "Tabata"],
            pelotonTip: "You're well recovered today. Go for a 45-min PZ Max class."
        ),
        reasoning: "Your recovery score is 78 (Ready), and it's Tuesday.",
        coachingTips: [
            "Stay seated for the first 3 intervals to establish rhythm",
            "Use the final 10 seconds of each rest to prepare mentally"
        ],
        warnings: nil,
        suggestFTPTest: false
    )

    CoachRecommendationCard(recommendation: recommendation)
        .padding()
        .background(AuroraBackground().ignoresSafeArea())
        .preferredColorScheme(.dark)
}

#Preview("Fun Day") {
    let recommendation = CyclingCoachRecommendation(
        session: CyclingCoachRecommendation.SessionRecommendation(
            type: "fun",
            durationMinutes: 60,
            targetTSS: CyclingCoachRecommendation.TSSRange(min: 30, max: 80),
            targetZones: "Whatever feels good - Z2-Z4",
            pelotonClassTypes: ["Scenic Ride", "Music Ride", "Live DJ Ride"],
            pelotonTip: nil
        ),
        reasoning: "It's Saturday - your fun day! No structure required.",
        coachingTips: [
            "Consider exploring a new route",
            "Ride with friends if possible"
        ],
        warnings: nil,
        suggestFTPTest: true
    )

    CoachRecommendationCard(recommendation: recommendation)
        .padding()
        .background(AuroraBackground().ignoresSafeArea())
        .preferredColorScheme(.dark)
}

#Preview("Rest Day") {
    let recommendation = CyclingCoachRecommendation(
        session: CyclingCoachRecommendation.SessionRecommendation(
            type: "off",
            durationMinutes: 0,
            targetTSS: CyclingCoachRecommendation.TSSRange(min: 0, max: 0),
            targetZones: "None",
            pelotonClassTypes: nil,
            pelotonTip: nil
        ),
        reasoning: "Your recovery score is very low. Your body needs rest.",
        coachingTips: [
            "Focus on sleep and nutrition",
            "Light stretching is okay if it feels good"
        ],
        warnings: [
            CyclingCoachRecommendation.CoachWarning(
                type: "low_recovery",
                message: "Your HRV is 30% below baseline. Rest is critical today."
            )
        ],
        suggestFTPTest: false
    )

    CoachRecommendationCard(recommendation: recommendation)
        .padding()
        .background(AuroraBackground().ignoresSafeArea())
        .preferredColorScheme(.dark)
}

#Preview("Loading") {
    CoachRecommendationLoadingCard()
        .padding()
        .background(AuroraBackground().ignoresSafeArea())
        .preferredColorScheme(.dark)
}
