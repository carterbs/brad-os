import Testing
import Foundation
@testable import BradOSCore

@Suite("ShoppingListFormatter")
struct ShoppingListFormatterTests {

    // MARK: - Helpers

    private func makeItem(
        id: String = "item-1",
        name: String,
        storeSection: String = "Produce",
        totalQuantity: Double? = nil,
        unit: String? = nil,
        mealCount: Int = 1
    ) -> ShoppingListItem {
        ShoppingListItem(
            id: id,
            name: name,
            storeSection: storeSection,
            totalQuantity: totalQuantity,
            unit: unit,
            mealCount: mealCount
        )
    }

    private func makeSection(
        name: String,
        sortOrder: Int,
        items: [ShoppingListItem],
        isPantryStaples: Bool = false
    ) -> ShoppingListSection {
        ShoppingListSection(
            id: name,
            name: name,
            sortOrder: sortOrder,
            items: items,
            isPantryStaples: isPantryStaples
        )
    }

    // MARK: - Tests

    @Test("Format produces expected string")
    func formatProducesExpectedString() {
        let sections = [
            makeSection(name: "Produce", sortOrder: 1, items: [
                makeItem(id: "ing-1", name: "Broccoli", totalQuantity: 2, unit: "cups"),
                makeItem(id: "ing-2", name: "Tomato", totalQuantity: 3, unit: "whole"),
            ]),
            makeSection(name: "Meat & Seafood", sortOrder: 3, items: [
                makeItem(id: "ing-3", name: "Chicken Breast", totalQuantity: 1.5, unit: "lb"),
            ]),
        ]

        let result = ShoppingListFormatter.formatForClipboard(sections)

        let expected = """
        Produce
        2 cups Broccoli
        3 whole Tomato

        Meat & Seafood
        1.5 lb Chicken Breast
        """

        #expect(result == expected)
    }

    @Test("Pantry Staples section has note")
    func pantryStaplesSectionHasNote() {
        let sections = [
            makeSection(name: "Pantry Staples", sortOrder: 11, items: [
                makeItem(id: "ing-salt", name: "Salt"),
            ], isPantryStaples: true),
        ]

        let result = ShoppingListFormatter.formatForClipboard(sections)

        #expect(result.contains("Pantry Staples (you may already have these)"))
    }

    @Test("Empty list returns empty string")
    func emptyListReturnsEmptyString() {
        let result = ShoppingListFormatter.formatForClipboard([])

        #expect(result == "")
    }

    @Test("Sections separated by blank line")
    func sectionsSeparatedByBlankLine() {
        let sections = [
            makeSection(name: "Produce", sortOrder: 1, items: [
                makeItem(id: "ing-1", name: "Lettuce"),
            ]),
            makeSection(name: "Dairy & Eggs", sortOrder: 2, items: [
                makeItem(id: "ing-2", name: "Milk", totalQuantity: 1, unit: "gallon"),
            ]),
            makeSection(name: "Meat & Seafood", sortOrder: 3, items: [
                makeItem(id: "ing-3", name: "Chicken"),
            ]),
        ]

        let result = ShoppingListFormatter.formatForClipboard(sections)
        let lines = result.components(separatedBy: "\n")

        // Find blank lines (separators between sections)
        let blankLineIndices = lines.enumerated().compactMap { index, line in
            line.isEmpty ? index : nil
        }

        // Should have 2 blank lines separating 3 sections
        #expect(blankLineIndices.count == 2)
    }

    @Test("Items without quantity show name only")
    func itemsWithoutQuantityShowNameOnly() {
        let sections = [
            makeSection(name: "Pantry Staples", sortOrder: 11, items: [
                makeItem(id: "ing-salt", name: "Salt"),
                makeItem(id: "ing-pepper", name: "Black Pepper"),
            ], isPantryStaples: true),
        ]

        let result = ShoppingListFormatter.formatForClipboard(sections)

        #expect(result.contains("Salt"))
        #expect(result.contains("Black Pepper"))
        // Should not have quantity/unit formatting for these items
        #expect(!result.contains("nil"))
    }

    @Test("Integer quantities display without decimals")
    func integerQuantitiesDisplayWithoutDecimals() {
        let sections = [
            makeSection(name: "Produce", sortOrder: 1, items: [
                makeItem(id: "ing-1", name: "Apples", totalQuantity: 3.0, unit: "whole"),
            ]),
        ]

        let result = ShoppingListFormatter.formatForClipboard(sections)

        #expect(result.contains("3 whole Apples"))
        #expect(!result.contains("3.0"))
    }
}
