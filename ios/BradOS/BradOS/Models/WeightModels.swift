import Foundation

/// A weight entry from the backend (synced from HealthKit)
struct WeightHistoryEntry: Codable, Identifiable {
    let id: String
    let date: String       // YYYY-MM-DD
    let weightLbs: Double
    let source: String     // "healthkit" or "manual"
    let syncedAt: String   // ISO 8601

    /// Parse the date string into a Date
    var parsedDate: Date? {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        return formatter.date(from: date)
    }
}

/// The weight goal stored in Firebase
struct WeightGoalResponse: Codable {
    let userId: String?
    let targetWeightLbs: Double
    let targetDate: String     // YYYY-MM-DD
    let startWeightLbs: Double
    let startDate: String      // YYYY-MM-DD
}
