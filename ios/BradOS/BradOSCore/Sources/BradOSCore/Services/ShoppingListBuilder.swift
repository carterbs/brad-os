import Foundation

/// Builds a sectioned shopping list from meal IDs using cached recipe/ingredient data.
/// Items are aggregated by ingredient, grouped by store section, and sorted for
/// an efficient trip through the grocery store.
public enum ShoppingListBuilder {
    /// Build a sectioned shopping list from meal IDs
    @MainActor
    public static func build(
        fromMealIds mealIds: [String],
        using cache: RecipeCacheService
    ) -> [ShoppingListSection] {
        // 1. Get all (ingredient, quantity, unit) tuples
        let tuples = cache.ingredientTuples(forMealIds: mealIds)

        // 2. Aggregate by ingredientId
        let aggregated = aggregate(tuples)

        // 3. Group by storeSection
        let grouped = Dictionary(grouping: aggregated) { $0.storeSection }

        // 4. Build sections, sorted by store order, pantry last
        return grouped.map { (sectionName, items) in
            let section = StoreSection(rawValue: sectionName) ?? .pantryStaples
            return ShoppingListSection(
                id: sectionName,
                name: sectionName,
                sortOrder: section.sortOrder,
                items: items.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending },
                isPantryStaples: section.isPantryStaples
            )
        }
        .sorted { $0.sortOrder < $1.sortOrder }
    }

    /// Aggregate tuples by ingredient ID, summing quantities where units match
    private static func aggregate(
        _ tuples: [(ingredient: Ingredient, quantity: Double?, unit: String?)]
    ) -> [ShoppingListItem] {
        // Group by ingredient ID
        var groups: [String: (ingredient: Ingredient, quantities: [(Double?, String?)], count: Int)] = [:]

        for tuple in tuples {
            let key = tuple.ingredient.id
            if var existing = groups[key] {
                existing.quantities.append((tuple.quantity, tuple.unit))
                existing.count += 1
                groups[key] = existing
            } else {
                groups[key] = (
                    ingredient: tuple.ingredient,
                    quantities: [(tuple.quantity, tuple.unit)],
                    count: 1
                )
            }
        }

        return groups.map { (id, group) in
            let (totalQty, unit) = aggregateQuantities(group.quantities)
            return ShoppingListItem(
                id: id,
                name: group.ingredient.name,
                storeSection: group.ingredient.storeSection,
                totalQuantity: totalQty,
                unit: unit,
                mealCount: group.count
            )
        }
    }

    /// Sum quantities if all have the same unit, otherwise return nil
    private static func aggregateQuantities(_ entries: [(Double?, String?)]) -> (Double?, String?) {
        let nonNilEntries = entries.compactMap { qty, unit -> (Double, String)? in
            guard let qty = qty, let unit = unit else { return nil }
            return (qty, unit)
        }

        // If no entries have quantities, return nil
        guard !nonNilEntries.isEmpty else { return (nil, nil) }

        // If all entries have the same unit, sum quantities
        let units = Set(nonNilEntries.map { $0.1 })
        if units.count == 1 {
            let total = nonNilEntries.reduce(0.0) { $0 + $1.0 }
            return (total, nonNilEntries[0].1)
        }

        // Different units - can't aggregate
        return (nil, nil)
    }
}
