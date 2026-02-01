import Foundation

/// Identifies a specific slot in the meal plan (day + meal type)
public struct MealSlot: Hashable, Sendable {
    public let dayIndex: Int
    public let mealType: MealType

    public init(dayIndex: Int, mealType: MealType) {
        self.dayIndex = dayIndex
        self.mealType = mealType
    }

    /// Create a MealSlot from a MealPlanEntry
    public init(entry: MealPlanEntry) {
        self.dayIndex = entry.dayIndex
        self.mealType = entry.mealType
    }
}

/// An action the user wants to apply to a meal slot
public enum MealPlanAction: Hashable, Sendable {
    case swap
    case remove
}

/// Tracks queued critique actions before batch submission
public struct QueuedCritiqueActions: Sendable {
    private var actions: [MealSlot: MealPlanAction] = [:]

    public init() {}

    /// Toggle swap for a slot. If already swapping, removes the action. If removing, switches to swap.
    public mutating func toggleSwap(slot: MealSlot) {
        if actions[slot] == .swap {
            actions.removeValue(forKey: slot)
        } else {
            actions[slot] = .swap
        }
    }

    /// Toggle remove for a slot. If already removing, removes the action. If swapping, switches to remove.
    public mutating func toggleRemove(slot: MealSlot) {
        if actions[slot] == .remove {
            actions.removeValue(forKey: slot)
        } else {
            actions[slot] = .remove
        }
    }

    /// Get the current action for a slot, if any
    public func action(for slot: MealSlot) -> MealPlanAction? {
        actions[slot]
    }

    /// Number of slots marked for swap
    public var swapCount: Int {
        actions.values.filter { $0 == .swap }.count
    }

    /// Number of slots marked for removal
    public var removeCount: Int {
        actions.values.filter { $0 == .remove }.count
    }

    /// Whether any actions are queued
    public var isEmpty: Bool {
        actions.isEmpty
    }

    /// Total number of queued actions
    public var count: Int {
        actions.count
    }

    /// Clear all queued actions
    public mutating func clear() {
        actions.removeAll()
    }

    // MARK: - Critique Text Generation

    private static let dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

    private static func mealTypeOrder(_ type: MealType) -> Int {
        switch type {
        case .breakfast: return 0
        case .lunch: return 1
        case .dinner: return 2
        }
    }

    /// Generate natural language critique text from the queued actions
    public func generateCritiqueText(plan: [MealPlanEntry]) -> String {
        guard !actions.isEmpty else { return "" }

        // Build lookup from slot to entry for meal names
        let entryLookup = Dictionary(
            plan.map { (MealSlot(entry: $0), $0) },
            uniquingKeysWith: { first, _ in first }
        )

        // Sort actions by day index, then meal type for consistent output
        let sorted = actions.sorted { lhs, rhs in
            if lhs.key.dayIndex != rhs.key.dayIndex {
                return lhs.key.dayIndex < rhs.key.dayIndex
            }
            return Self.mealTypeOrder(lhs.key.mealType) < Self.mealTypeOrder(rhs.key.mealType)
        }

        let swaps = sorted.filter { $0.value == .swap }
        let removes = sorted.filter { $0.value == .remove }

        var parts: [String] = []

        if !swaps.isEmpty {
            let swapDescriptions = swaps.map { slot, _ in
                let dayName = Self.dayNames[slot.dayIndex]
                let mealName = entryLookup[slot]?.mealName ?? "Unknown"
                return "\(dayName) \(slot.mealType.rawValue) (\(mealName))"
            }
            parts.append("Swap \(swapDescriptions.joined(separator: " and ")) for something different.")
        }

        if !removes.isEmpty {
            let removeDescriptions = removes.map { slot, _ in
                let dayName = Self.dayNames[slot.dayIndex]
                let mealName = entryLookup[slot]?.mealName ?? "Unknown"
                return "\(dayName) \(slot.mealType.rawValue) (\(mealName))"
            }
            parts.append("Remove \(removeDescriptions.joined(separator: " and ")) from the plan.")
        }

        return parts.joined(separator: " ")
    }
}
