import SwiftUI
import BradOSCore

// MARK: - Daymark Design System
// A light, structured system with solid surfaces and semantic color accents.

struct Theme {
    // MARK: - Background Colors (from shared ThemeColors)
    struct Background {
        static let deep = ThemeColors.bgDeep
        static let base = ThemeColors.bgBase
        static let surface = ThemeColors.bgSurface
        static let highlight = ThemeColors.highlight
    }

    // MARK: - Text Colors (white at fixed opacities)
    static let textPrimary = ThemeColors.textPrimary
    static let textSecondary = ThemeColors.textSecondary
    static let textTertiary = ThemeColors.textTertiary
    static let textDisabled = Color(hex: "AAA69F")
    static let textOnAccent = Color.white

    // MARK: - Strokes & Dividers
    static let strokeSubtle = ThemeColors.divider
    static let strokeMedium = Color(hex: "CBC1B4")
    static let divider = ThemeColors.divider

    // MARK: - Interactive Colors
    static let interactivePrimary = ThemeColors.highlight
    static let interactiveSecondary = Color(hex: "E7D5A3")

    // MARK: - Activity Colors (from shared ThemeColors)
    static let lifting = ThemeColors.lifting
    static let stretch = ThemeColors.stretch
    static let meditation = ThemeColors.meditation
    static let mealPlan = ThemeColors.mealPlan
    static let cycling = ThemeColors.cycling

    // MARK: - Status Colors
    static let success = Color(hex: "34D399")
    static let warning = Color(hex: "FBBF24")
    static let destructive = Color(hex: "FB7185")
    static let info = Color(hex: "60A5FA")
    static let neutral = ThemeColors.textTertiary

    // MARK: - Scrims
    static let scrimStandard = Color.black.opacity(0.18)

    // MARK: - Typography
    struct Typography {
        // Icon sizes
        static let iconXS: CGFloat = 12
        static let iconSM: CGFloat = 16
        static let iconMD: CGFloat = 20
        static let iconLG: CGFloat = 22
        static let iconXL: CGFloat = 40
        static let iconXXL: CGFloat = 48

        // Named sizes for clarity
        static let tabBarIcon: CGFloat = 22
        static let cardHeaderIcon: CGFloat = 20
        static let activityGridIcon: CGFloat = 40
        static let listRowIcon: CGFloat = 16
    }

    // MARK: - Dimensions
    struct Dimensions {
        static let dotSM: CGFloat = 5
        static let dotMD: CGFloat = 6
        static let iconFrameSM: CGFloat = 20
        static let iconFrameMD: CGFloat = 32
        static let iconFrameLG: CGFloat = 52
        static let circleButtonSM: CGFloat = 56
        static let circleButtonMD: CGFloat = 80
        static let timerCircle: CGFloat = 220
        static let progressRing: CGFloat = 36
        static let buttonHeight: CGFloat = 48
        static let inputHeight: CGFloat = 52
        static let listRowMinHeight: CGFloat = 56
        static let tabBarHeight: CGFloat = 64
        static let progressBarHeight: CGFloat = 4
    }

    // MARK: - Spacing (4pt grid)
    struct Spacing {
        static let space1: CGFloat = 4
        static let space2: CGFloat = 8
        static let space3: CGFloat = 12
        static let space4: CGFloat = 16
        static let space5: CGFloat = 20
        static let space6: CGFloat = 24
        static let space7: CGFloat = 32
        static let space8: CGFloat = 40
    }

    // MARK: - Corner Radius
    struct CornerRadius {
        static let sm: CGFloat = 8
        static let md: CGFloat = 12
        static let lg: CGFloat = 16
        static let xl: CGFloat = 20
        static let xxl: CGFloat = 28
    }

    // MARK: - Shadows (rare — only for overlays)
    struct Shadow {
        static let smY: CGFloat = 4
        static let smBlur: CGFloat = 12
        static let smColor = Color.black.opacity(0.25)
    }

    // MARK: - Motion
    struct Motion {
        static let micro: Double = 0.12
        static let standardSpring = Animation.spring(response: 0.32, dampingFraction: 0.86)
    }
}

// MARK: - Glass Level
enum GlassLevel {
    case card       // L1
    case elevated   // L2
    case chrome     // L3
    case overlay    // L4

    var material: Material {
        switch self {
        case .card, .elevated, .chrome, .overlay: return .regularMaterial
        }
    }

    /// White tint opacity applied on top of material blur
    var fillOpacity: Double {
        switch self {
        case .card, .elevated, .overlay: return 1
        case .chrome: return 0.98
        }
    }

    var strokeColor: Color {
        switch self {
        case .card: return Theme.strokeSubtle
        case .elevated, .chrome, .overlay: return Theme.strokeMedium
        }
    }

    var defaultRadius: CGFloat {
        switch self {
        case .card: return Theme.CornerRadius.lg
        case .elevated: return Theme.CornerRadius.lg
        case .chrome: return Theme.CornerRadius.xxl
        case .overlay: return Theme.CornerRadius.xl
        }
    }
}

// MARK: - Daymark surface modifier
struct GlassCardModifier: ViewModifier {
    let level: GlassLevel
    let radius: CGFloat?
    let padding: CGFloat?

    init(level: GlassLevel = .card, radius: CGFloat? = nil, padding: CGFloat? = nil) {
        self.level = level
        self.radius = radius
        self.padding = padding
    }

    private var cornerRadius: CGFloat { radius ?? level.defaultRadius }
    private var cardPadding: CGFloat { padding ?? Theme.Spacing.space4 }

    func body(content: Content) -> some View {
        content
            .padding(cardPadding)
            .background(Theme.Background.surface.opacity(level.fillOpacity))
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .stroke(level.strokeColor, lineWidth: 1)
            )
    }
}

/// Daymark's dashboard layout is composed of editorial sections instead of floating cards.
struct DaymarkSectionModifier: ViewModifier {
    let padding: CGFloat

    func body(content: Content) -> some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .overlay(alignment: .top) {
                Rectangle()
                    .fill(Theme.divider)
                    .frame(height: 1)
            }
    }
}

/// A compact editorial list bounded by hairlines instead of a raised container.
struct DaymarkListGroupModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .frame(maxWidth: .infinity, alignment: .leading)
            .overlay(alignment: .top) {
                Rectangle()
                    .fill(Theme.divider)
                    .frame(height: 1)
            }
            .overlay(alignment: .bottom) {
                Rectangle()
                    .fill(Theme.divider)
                    .frame(height: 1)
            }
    }
}

// MARK: - Compatibility modifier
struct AuroraGlowModifier: ViewModifier {
    let color: Color
    let intensity: AuroraIntensity
    let offset: CGPoint

    enum AuroraIntensity {
        case primary   // 0.18 opacity, 48pt blur
        case secondary // 0.12 opacity, 32pt blur
        case ambient   // 0.07 opacity, 90pt blur (background blobs)

        var opacity: Double {
            switch self {
            case .primary: return 0.18
            case .secondary: return 0.12
            case .ambient: return 0.07
            }
        }

        var blurRadius: CGFloat {
            switch self {
            case .primary: return 48
            case .secondary: return 32
            case .ambient: return 90
            }
        }

        var diameter: CGFloat {
            switch self {
            case .primary: return 100
            case .secondary: return 70
            case .ambient: return 300
            }
        }
    }

    func body(content: Content) -> some View { content }
}

// MARK: - Daymark background view
struct AuroraBackground: View {
    var body: some View {
        Theme.Background.base.ignoresSafeArea()
    }
}

// MARK: - View Modifiers

// MARK: - Button Styles

/// Daymark primary button with a softened highlight fill.
struct GlassPrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        let shape = RoundedRectangle(cornerRadius: Theme.CornerRadius.md, style: .continuous)
        configuration.label
            .font(.headline)
            .foregroundColor(Theme.textOnAccent)
            .frame(height: Theme.Dimensions.buttonHeight)
            .padding(.horizontal, Theme.Spacing.space4)
            .background(Theme.interactivePrimary)
            .clipShape(shape)
            .scaleEffect(configuration.isPressed ? 0.98 : 1.0)
            .animation(.easeInOut(duration: Theme.Motion.micro), value: configuration.isPressed)
    }
}

/// Daymark secondary button with a quiet rule.
struct GlassSecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundColor(Theme.textPrimary)
            .frame(height: Theme.Dimensions.buttonHeight)
            .padding(.horizontal, Theme.Spacing.space4)
            .background(Theme.Background.surface)
            .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.md, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.CornerRadius.md, style: .continuous)
                    .stroke(Theme.strokeMedium, lineWidth: 1)
            )
            .scaleEffect(configuration.isPressed ? 0.98 : 1.0)
            .animation(.easeInOut(duration: Theme.Motion.micro), value: configuration.isPressed)
    }
}

/// Destructive button: H:48pt, stroke destructive@55%, fill destructive@14%
struct DestructiveButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundColor(Theme.destructive)
            .frame(height: Theme.Dimensions.buttonHeight)
            .padding(.horizontal, Theme.Spacing.space4)
            .background(Theme.destructive.opacity(0.14))
            .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.md, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.CornerRadius.md, style: .continuous)
                    .stroke(Theme.destructive.opacity(configuration.isPressed ? 0.59 : 0.55), lineWidth: 1)
            )
            .scaleEffect(configuration.isPressed ? 0.98 : 1.0)
            .animation(.easeInOut(duration: Theme.Motion.micro), value: configuration.isPressed)
    }
}

/// Primary button (legacy name, now wraps Glass Primary)
struct PrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        GlassPrimaryButtonStyle().makeBody(configuration: configuration)
    }
}

/// Secondary button (legacy name, now wraps Glass Secondary)
struct SecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        GlassSecondaryButtonStyle().makeBody(configuration: configuration)
    }
}

/// Daymark circle button for secondary actions (56pt)
struct GlassCircleButtonStyle: ButtonStyle {
    let size: CGFloat

    init(size: CGFloat = Theme.Dimensions.circleButtonSM) {
        self.size = size
    }

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .frame(width: size, height: size)
            .background(Theme.Background.surface, in: Circle())
            .overlay(
                Circle()
                    .stroke(Theme.strokeMedium, lineWidth: 1)
            )
            .scaleEffect(configuration.isPressed ? 0.95 : 1.0)
            .animation(.easeInOut(duration: Theme.Motion.micro), value: configuration.isPressed)
    }
}

/// Daymark circle button with semantic color tint for primary actions (80pt)
struct GlassPrimaryCircleButtonStyle: ButtonStyle {
    let size: CGFloat
    let color: Color

    init(size: CGFloat = Theme.Dimensions.circleButtonMD, color: Color = Theme.interactivePrimary) {
        self.size = size
        self.color = color
    }

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .frame(width: size, height: size)
            .background(
                Circle()
                    .fill(configuration.isPressed ? color.opacity(0.20) : color.opacity(0.14))
            )
            .overlay(
                Circle()
                    .stroke(color.opacity(configuration.isPressed ? 0.45 : 0.35), lineWidth: 1)
            )
            .scaleEffect(configuration.isPressed ? 0.95 : 1.0)
            .animation(.easeInOut(duration: Theme.Motion.micro), value: configuration.isPressed)
    }
}

// MARK: - View Extensions
extension View {
    /// Apply glass card at a specific level
    func glassCard(_ level: GlassLevel = .card, radius: CGFloat? = nil, padding: CGFloat? = nil) -> some View {
        modifier(GlassCardModifier(level: level, radius: radius, padding: padding))
    }

    /// Apply the flat, rule-separated Daymark treatment used on dashboard surfaces.
    func daymarkSection(padding: CGFloat = Theme.Spacing.space5) -> some View {
        modifier(DaymarkSectionModifier(padding: padding))
    }

    func daymarkListGroup() -> some View {
        modifier(DaymarkListGroupModifier())
    }

    /// Add aurora glow behind the view
    func auroraGlow(
        _ color: Color,
        intensity: AuroraGlowModifier.AuroraIntensity = .primary,
        offset: CGPoint = CGPoint(x: -20, y: -15)
    ) -> some View {
        modifier(AuroraGlowModifier(color: color, intensity: intensity, offset: offset))
    }
}
