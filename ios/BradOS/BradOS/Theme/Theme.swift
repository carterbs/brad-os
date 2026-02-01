import SwiftUI

/// App theme colors matching the web app's dark blue-gray palette
struct Theme {
    // MARK: - Background Colors
    static let background = Color(hex: "2c363d")
    static let backgroundSecondary = Color(hex: "333d44")
    static let backgroundTertiary = Color(hex: "3a454c")
    static let backgroundHover = Color(hex: "424d55")

    // MARK: - Border & Disabled
    static let border = Color(hex: "4a565e")
    static let disabled = Color(hex: "525f67")

    // MARK: - Text Colors
    static let textPrimary = Color(hex: "c5d0d8")
    static let textSecondary = Color(hex: "9ca3af")
    static let textOnDark = Color(hex: "e2e8f0")

    // MARK: - Accent Colors
    static let accent = Color(hex: "6366f1") // Indigo
    static let accentLight = Color(hex: "818cf8")

    // MARK: - Activity Colors
    static let lifting = Color(hex: "6366f1") // Indigo
    static let stretch = Color(hex: "14b8a6") // Teal
    static let meditation = Color(hex: "a855f7") // Purple
    static let mealPlan = Color(hex: "E8889B") // Warm Pink

    // MARK: - Status Colors
    static let statusScheduled = Color(hex: "3b82f6") // Blue
    static let statusInProgress = Color(hex: "f97316") // Orange
    static let statusCompleted = Color(hex: "22c55e") // Green
    static let statusSkipped = Color(hex: "6b7280") // Gray

    // MARK: - Semantic Colors
    static let error = Color(hex: "dc2626")
    static let success = Color(hex: "16a34a")
    static let warning = Color(hex: "ea580c")

    // MARK: - Overlay & Shadow
    static let overlayBackground = Color.black.opacity(0.85)
    static let shadowColor = Color.black.opacity(0.3)
    static let glassStroke = Color.white.opacity(0.2)
    static let glassStrokeSubtle = Color.white.opacity(0.15)

    // MARK: - Opacity
    struct Opacity {
        static let subtle: Double = 0.08
        static let light: Double = 0.1
        static let medium: Double = 0.2
        static let strong: Double = 0.5
        static let heavy: Double = 0.8
        static let overlay: Double = 0.85
    }

    // MARK: - Typography
    struct Typography {
        static let iconXS: CGFloat = 20
        static let iconSM: CGFloat = 32
        static let iconMD: CGFloat = 40
        static let iconLG: CGFloat = 48
        static let iconXL: CGFloat = 60
        static let iconXXL: CGFloat = 80
        static let timerSM: CGFloat = 48
        static let timerMD: CGFloat = 56
        static let timerLG: CGFloat = 64
    }

    // MARK: - Dimensions
    struct Dimensions {
        static let dotSM: CGFloat = 6
        static let dotMD: CGFloat = 8
        static let iconFrameSM: CGFloat = 20
        static let iconFrameMD: CGFloat = 24
        static let iconFrameLG: CGFloat = 36
        static let circleButtonSM: CGFloat = 56
        static let circleButtonMD: CGFloat = 80
        static let timerCircle: CGFloat = 220
        static let progressRing: CGFloat = 36
    }

    // MARK: - Spacing
    struct Spacing {
        static let xs: CGFloat = 4
        static let sm: CGFloat = 8
        static let md: CGFloat = 16
        static let lg: CGFloat = 24
        static let xl: CGFloat = 32
    }

    // MARK: - Corner Radius
    struct CornerRadius {
        static let sm: CGFloat = 4
        static let md: CGFloat = 8
        static let lg: CGFloat = 12
        static let xl: CGFloat = 16
    }
}

// MARK: - Color Extension for Hex Support
extension Color {
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

// MARK: - View Modifiers
struct CardStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(Theme.Spacing.md)
            .background(Theme.backgroundSecondary)
            .cornerRadius(Theme.CornerRadius.md)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.CornerRadius.md)
                    .stroke(Theme.border, lineWidth: 1)
            )
    }
}

struct PrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .padding(.horizontal, Theme.Spacing.md)
            .padding(.vertical, Theme.Spacing.sm)
            .background(configuration.isPressed ? Theme.accentLight : Theme.accent)
            .foregroundColor(.white)
            .cornerRadius(Theme.CornerRadius.md)
    }
}

struct SecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .padding(.horizontal, Theme.Spacing.md)
            .padding(.vertical, Theme.Spacing.sm)
            .background(configuration.isPressed ? Theme.backgroundHover : Theme.backgroundTertiary)
            .foregroundColor(Theme.textPrimary)
            .cornerRadius(Theme.CornerRadius.md)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.CornerRadius.md)
                    .stroke(Theme.border, lineWidth: 1)
            )
    }
}

/// Glass-style primary button with blur background
struct GlassPrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .padding(.horizontal, Theme.Spacing.md)
            .padding(.vertical, Theme.Spacing.sm)
            .foregroundColor(.white)
            .fontWeight(.semibold)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: Theme.CornerRadius.lg))
            .background(
                RoundedRectangle(cornerRadius: Theme.CornerRadius.lg)
                    .fill(configuration.isPressed ? Theme.accentLight.opacity(0.7) : Theme.accent.opacity(0.6))
            )
            .overlay(
                RoundedRectangle(cornerRadius: Theme.CornerRadius.lg)
                    .stroke(Theme.glassStroke, lineWidth: 1)
            )
            .scaleEffect(configuration.isPressed ? 0.98 : 1.0)
            .animation(.easeInOut(duration: 0.1), value: configuration.isPressed)
    }
}

/// Glass-style secondary button with blur background
struct GlassSecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .padding(.horizontal, Theme.Spacing.md)
            .padding(.vertical, Theme.Spacing.sm)
            .foregroundColor(Theme.textPrimary)
            .fontWeight(.medium)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: Theme.CornerRadius.lg))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.CornerRadius.lg)
                    .stroke(Theme.glassStrokeSubtle, lineWidth: 1)
            )
            .scaleEffect(configuration.isPressed ? 0.98 : 1.0)
            .opacity(configuration.isPressed ? 0.8 : 1.0)
            .animation(.easeInOut(duration: 0.1), value: configuration.isPressed)
    }
}

/// Glass-style circular button for secondary actions
struct GlassCircleButtonStyle: ButtonStyle {
    let size: CGFloat

    init(size: CGFloat = 56) {
        self.size = size
    }

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .frame(width: size, height: size)
            .background(.ultraThinMaterial, in: Circle())
            .overlay(
                Circle()
                    .stroke(Theme.glassStrokeSubtle, lineWidth: 1)
            )
            .scaleEffect(configuration.isPressed ? 0.95 : 1.0)
            .opacity(configuration.isPressed ? Theme.Opacity.heavy : 1.0)
            .animation(.easeInOut(duration: 0.1), value: configuration.isPressed)
    }
}

/// Glass-style circular button with color tint for primary actions
struct GlassPrimaryCircleButtonStyle: ButtonStyle {
    let size: CGFloat
    let color: Color

    init(size: CGFloat = 80, color: Color = Theme.accent) {
        self.size = size
        self.color = color
    }

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .frame(width: size, height: size)
            .background(.ultraThinMaterial, in: Circle())
            .background(
                Circle()
                    .fill(configuration.isPressed ? color.opacity(0.5) : color.opacity(0.6))
            )
            .overlay(
                Circle()
                    .stroke(Theme.glassStroke, lineWidth: 1)
            )
            .scaleEffect(configuration.isPressed ? 0.95 : 1.0)
            .animation(.easeInOut(duration: 0.1), value: configuration.isPressed)
    }
}

extension View {
    func cardStyle() -> some View {
        modifier(CardStyle())
    }
}
