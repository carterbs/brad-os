import SwiftUI

// MARK: - Color Hex Initializer

public extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3: // RGB (12-bit)
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6: // RGB (24-bit)
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: // ARGB (32-bit)
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (1, 1, 1, 0)
        }

        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}

// MARK: - Shared Color Palette

/// Color constants shared between the app and widget extension.
/// The app's Theme.swift references these; the widget imports them directly.
public enum ThemeColors {
    // Daymark foundations — shared with WidgetKit.
    public static let bgDeep = Color(hex: "EFEAE0")
    public static let bgBase = Color(hex: "F7F3EC")
    public static let bgSurface = Color(hex: "FFFCF6")
    public static let ink = Color(hex: "26302D")
    public static let mutedInk = Color(hex: "6F746D")
    public static let highlight = Color(hex: "3E5462")
    public static let divider = Color(hex: "DED6CA")

    // Activity
    public static let lifting = Color(hex: "8C6A4B")
    public static let stretch = Color(hex: "55705B")
    public static let meditation = Color(hex: "8A6C92")
    public static let mealPlan = Color(hex: "C66B4E")
    public static let cycling = Color(hex: "C69140")

    // Text
    public static let textPrimary = ink
    public static let textSecondary = mutedInk
    public static let textTertiary = Color(hex: "8A989A")
}
