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
    // Background
    public static let bgDeep = Color(hex: "121826")
    public static let bgBase = Color(hex: "1A2332")
    public static let bgSurface = Color(hex: "151C2B")

    // Activity
    public static let lifting = Color(hex: "4F6AFF")
    public static let stretch = Color(hex: "21D6C2")
    public static let meditation = Color(hex: "B26BFF")
    public static let mealPlan = Color(hex: "FF7AAE")

    // Text
    public static let textPrimary = Color.white.opacity(0.92)
    public static let textSecondary = Color.white.opacity(0.78)
    public static let textTertiary = Color.white.opacity(0.56)
}
