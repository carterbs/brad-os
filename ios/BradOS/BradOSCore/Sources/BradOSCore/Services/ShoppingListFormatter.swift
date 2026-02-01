import Foundation
#if canImport(UIKit)
import UIKit
#endif

/// Formats a shopping list for clipboard output as plain text.
public enum ShoppingListFormatter {
    /// Format shopping list for clipboard (plain text, one item per line)
    public static func formatForClipboard(_ sections: [ShoppingListSection]) -> String {
        guard !sections.isEmpty else { return "" }

        var lines: [String] = []

        for (index, section) in sections.enumerated() {
            if index > 0 {
                lines.append("")
            }

            if section.isPantryStaples {
                lines.append("\(section.name) (you may already have these)")
            } else {
                lines.append(section.name)
            }

            for item in section.items {
                lines.append(item.displayText)
            }
        }

        return lines.joined(separator: "\n")
    }

    /// Copy to system clipboard
    #if canImport(UIKit)
    public static func copyToClipboard(_ sections: [ShoppingListSection]) {
        let text = formatForClipboard(sections)
        UIPasteboard.general.string = text
    }
    #endif
}
