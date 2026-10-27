import Foundation

/// Shared by the app and widget. Keep the API's ADULT_BREAKFAST_ENABLED flag in sync.
/// Hidden entries remain in saved sessions and caches so the feature is reversible.
public struct MealPlanFeatureFlags: Sendable {
    public let adultBreakfastEnabled: Bool

    public init(adultBreakfastEnabled: Bool = false) {
        self.adultBreakfastEnabled = adultBreakfastEnabled
    }

    /// Xcode build setting defaults to NO; a launch environment override supports QA.
    public static var current: MealPlanFeatureFlags {
        let value = ProcessInfo.processInfo.environment["ADULT_BREAKFAST_ENABLED"]
            ?? Bundle.main.object(forInfoDictionaryKey: "AdultBreakfastEnabled") as? String
            ?? "NO"
        return MealPlanFeatureFlags(adultBreakfastEnabled: ["true", "yes", "1"].contains(value.lowercased()))
    }

    public func includes(track: MealTrack, type: MealType) -> Bool {
        adultBreakfastEnabled || track != .adult || type != .breakfast
    }

    public func visibleEntries(in plan: [MealPlanEntry]) -> [MealPlanEntry] {
        plan.filter { includes(track: $0.mealTrack, type: $0.mealType) }
    }
}
