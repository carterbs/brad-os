import Foundation

/// A single item on the shopping list (aggregated across meals)
public struct ShoppingListItem: Identifiable, Hashable, Sendable {
    public let id: String           // ingredientId
    public let name: String
    public let storeSection: String
    public let totalQuantity: Double?
    public let unit: String?
    public let mealCount: Int       // how many meals use this ingredient

    public init(
        id: String,
        name: String,
        storeSection: String,
        totalQuantity: Double?,
        unit: String?,
        mealCount: Int
    ) {
        self.id = id
        self.name = name
        self.storeSection = storeSection
        self.totalQuantity = totalQuantity
        self.unit = unit
        self.mealCount = mealCount
    }

    public var displayText: String {
        if let qty = totalQuantity, let unit = unit {
            return "\(ShoppingListItem.formatQuantity(qty)) \(unit) \(name)"
        }
        return name
    }

    private static func formatQuantity(_ qty: Double) -> String {
        if qty == qty.rounded() {
            return String(Int(qty))
        }
        return String(format: "%.1f", qty)
    }
}

/// A section of the shopping list (one per store area)
public struct ShoppingListSection: Identifiable, Hashable, Sendable {
    public let id: String           // section name
    public let name: String         // display name
    public let sortOrder: Int
    public let items: [ShoppingListItem]
    public let isPantryStaples: Bool

    public init(
        id: String,
        name: String,
        sortOrder: Int,
        items: [ShoppingListItem],
        isPantryStaples: Bool
    ) {
        self.id = id
        self.name = name
        self.sortOrder = sortOrder
        self.items = items
        self.isPantryStaples = isPantryStaples
    }
}

/// Store section definitions with sort order
public enum StoreSection: String, CaseIterable, Sendable {
    case produce = "Produce"
    case dairyAndEggs = "Dairy & Eggs"
    case meatAndSeafood = "Meat & Seafood"
    case deli = "Deli"
    case bakeryAndBread = "Bakery & Bread"
    case frozen = "Frozen"
    case cannedAndJarred = "Canned & Jarred"
    case pastaAndGrains = "Pasta & Grains"
    case snacksAndCereal = "Snacks & Cereal"
    case condimentsAndSpreads = "Condiments & Spreads"
    case pantryStaples = "Pantry Staples"

    public var sortOrder: Int {
        switch self {
        case .produce: return 1
        case .dairyAndEggs: return 2
        case .meatAndSeafood: return 3
        case .deli: return 4
        case .bakeryAndBread: return 5
        case .frozen: return 6
        case .cannedAndJarred: return 7
        case .pastaAndGrains: return 8
        case .snacksAndCereal: return 9
        case .condimentsAndSpreads: return 10
        case .pantryStaples: return 11
        }
    }

    public var isPantryStaples: Bool { self == .pantryStaples }
}
