import SwiftUI

// MARK: - Aurora Glass Design System
// visionOS-inspired glassmorphism: frosted glass panels over deep dark gradients,
// soft aurora color blobs for warmth and depth.

struct Theme {
    // MARK: - Background Colors
    struct BG {
        static let deep = Color(hex: "0A0D14")
        static let base = Color(hex: "111827")
        static let surface = Color(hex: "0B1116")
    }

    // MARK: - Text Colors (white at fixed opacities)
    static let textPrimary = Color.white.opacity(0.92)
    static let textSecondary = Color.white.opacity(0.72)
    static let textTertiary = Color.white.opacity(0.56)
    static let textDisabled = Color.white.opacity(0.38)
    static let textOnAccent = Color(hex: "061018").opacity(0.95)

    // MARK: - Strokes & Dividers
    static let strokeSubtle = Color.white.opacity(0.10)
    static let strokeMedium = Color.white.opacity(0.14)
    static let strokeStrong = Color.white.opacity(0.18)
    static let divider = Color.white.opacity(0.08)

    // MARK: - Interactive Colors
    static let interactivePrimary = Color(hex: "7C5CFF")
    static let interactiveSecondary = Color(hex: "64D2FF")
    static let interactiveLink = Color(hex: "7AA7FF")
    static let interactiveFocusRing = Color(hex: "A48BFF").opacity(0.75)

    // MARK: - Activity Colors
    static let lifting = Color(hex: "6D6BFF")
    static let stretch = Color(hex: "21D6C2")
    static let meditation = Color(hex: "B26BFF")
    static let mealPlan = Color(hex: "FF7AAE")

    // MARK: - Status Colors
    static let success = Color(hex: "34D399")
    static let warning = Color(hex: "FBBF24")
    static let destructive = Color(hex: "FB7185")
    static let info = Color(hex: "60A5FA")
    static let neutral = Color.white.opacity(0.56)

    // MARK: - Scrims
    static let scrimLight = Color.black.opacity(0.20)
    static let scrimStandard = Color.black.opacity(0.35)
    static let scrimHeavy = Color.black.opacity(0.50)

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
        static let badgeIcon: CGFloat = 12

        // Timer sizes
        static let timerSM: CGFloat = 48
        static let timerMD: CGFloat = 56
        static let timerLG: CGFloat = 64
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
        static let pill: CGFloat = 999
    }

    // MARK: - Shadows (rare — only for overlays)
    struct Shadow {
        static let smY: CGFloat = 4
        static let smBlur: CGFloat = 12
        static let smColor = Color.black.opacity(0.25)

        static let mdY: CGFloat = 8
        static let mdBlur: CGFloat = 24
        static let mdColor = Color.black.opacity(0.28)

        static let lgY: CGFloat = 16
        static let lgBlur: CGFloat = 40
        static let lgColor = Color.black.opacity(0.32)
    }

    // MARK: - Motion
    struct Motion {
        static let micro: Double = 0.12
        static let fast: Double = 0.22
        static let normal: Double = 0.30
        static let standardSpring = Animation.spring(response: 0.32, dampingFraction: 0.86)
        static let bouncySpring = Animation.spring(response: 0.40, dampingFraction: 0.78)
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
        case .card: return .ultraThinMaterial
        case .elevated: return .thinMaterial
        case .chrome: return .regularMaterial
        case .overlay: return .thickMaterial
        }
    }

    var fillOpacity: Double {
        switch self {
        case .card: return 0.35
        case .elevated: return 0.42
        case .chrome: return 0.55
        case .overlay: return 0.65
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

// MARK: - Glass Card View Modifier
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
            .background(level.material)
            .background(Theme.BG.surface.opacity(level.fillOpacity))
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .stroke(level.strokeColor, lineWidth: 1)
            )
    }
}

// MARK: - Aurora Glow Modifier
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

    func body(content: Content) -> some View {
        content.background(
            Circle()
                .fill(color)
                .frame(width: intensity.diameter, height: intensity.diameter)
                .blur(radius: intensity.blurRadius)
                .opacity(intensity.opacity)
                .blendMode(.plusLighter)
                .offset(x: offset.x, y: offset.y)
        )
    }
}

// MARK: - Aurora Background View
struct AuroraBackground: View {
    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Theme.BG.deep, Theme.BG.base],
                startPoint: .top,
                endPoint: .bottom
            )

            // Ambient aurora blob 1 — top-left, accent
            Circle()
                .fill(Theme.interactivePrimary)
                .frame(width: 300, height: 300)
                .blur(radius: 90)
                .opacity(0.07)
                .blendMode(.plusLighter)
                .offset(x: -80, y: -120)

            // Ambient aurora blob 2 — bottom-right, secondary
            Circle()
                .fill(Theme.interactiveSecondary)
                .frame(width: 280, height: 280)
                .blur(radius: 85)
                .opacity(0.06)
                .blendMode(.plusLighter)
                .offset(x: 100, y: 200)
        }
        .ignoresSafeArea()
    }
}

// MARK: - Press Feedback Modifier
struct PressFeedbackModifier: ViewModifier {
    let isPressed: Bool

    func body(content: Content) -> some View {
        content
            .scaleEffect(isPressed ? 0.98 : 1.0)
            .animation(.easeInOut(duration: Theme.Motion.micro), value: isPressed)
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

// Legacy CardStyle — now Glass L1
struct CardStyle: ViewModifier {
    func body(content: Content) -> some View {
        content.modifier(GlassCardModifier(level: .card))
    }
}

// MARK: - Button Styles

/// Glass-style primary button: H:48pt, R:12pt, ultraThinMaterial + accent @22%, accent stroke @45%
struct GlassPrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundColor(Theme.textPrimary)
            .frame(height: Theme.Dimensions.buttonHeight)
            .padding(.horizontal, Theme.Spacing.space4)
            .background(.ultraThinMaterial)
            .background(Theme.interactivePrimary.opacity(0.22))
            .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.md, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.CornerRadius.md, style: .continuous)
                    .stroke(Theme.interactivePrimary.opacity(configuration.isPressed ? 0.49 : 0.45), lineWidth: 1)
            )
            .scaleEffect(configuration.isPressed ? 0.98 : 1.0)
            .animation(.easeInOut(duration: Theme.Motion.micro), value: configuration.isPressed)
    }
}

/// Glass-style secondary button: H:48pt, R:12pt, Glass L1, strokeMedium
struct GlassSecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundColor(Theme.textPrimary)
            .frame(height: Theme.Dimensions.buttonHeight)
            .padding(.horizontal, Theme.Spacing.space4)
            .background(.ultraThinMaterial)
            .background(Theme.BG.surface.opacity(0.35))
            .clipShape(RoundedRectangle(cornerRadius: Theme.CornerRadius.md, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.CornerRadius.md, style: .continuous)
                    .stroke(Theme.strokeMedium, lineWidth: 1)
            )
            .scaleEffect(configuration.isPressed ? 0.98 : 1.0)
            .animation(.easeInOut(duration: Theme.Motion.micro), value: configuration.isPressed)
    }
}

/// Ghost button: no bg, callout semibold, interactive.primary, press: white@6% pill
struct GhostButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.callout.weight(.semibold))
            .foregroundColor(Theme.interactivePrimary)
            .frame(minHeight: 44)
            .padding(.horizontal, Theme.Spacing.space3)
            .background(
                Capsule(style: .continuous)
                    .fill(Color.white.opacity(configuration.isPressed ? 0.06 : 0))
            )
            .animation(.easeInOut(duration: Theme.Motion.micro), value: configuration.isPressed)
    }
}

/// Destructive button: H:48pt, stroke destructive@55%, fill destructive@14%
struct DestructiveButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundColor(Color.white.opacity(0.92))
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

/// Glass circle button for secondary actions (56pt)
struct GlassCircleButtonStyle: ButtonStyle {
    let size: CGFloat

    init(size: CGFloat = Theme.Dimensions.circleButtonSM) {
        self.size = size
    }

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .frame(width: size, height: size)
            .background(.ultraThinMaterial, in: Circle())
            .background(Theme.BG.surface.opacity(0.35), in: Circle())
            .overlay(
                Circle()
                    .stroke(Color.white.opacity(configuration.isPressed ? 0.19 : 0.15), lineWidth: 1)
            )
            .scaleEffect(configuration.isPressed ? 0.95 : 1.0)
            .animation(.easeInOut(duration: Theme.Motion.micro), value: configuration.isPressed)
    }
}

/// Glass circle button with color tint for primary actions (80pt)
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
            .background(.ultraThinMaterial, in: Circle())
            .background(
                Circle()
                    .fill(configuration.isPressed ? color.opacity(0.5) : color.opacity(0.6))
            )
            .overlay(
                Circle()
                    .stroke(Color.white.opacity(configuration.isPressed ? 0.24 : 0.20), lineWidth: 1)
            )
            .scaleEffect(configuration.isPressed ? 0.95 : 1.0)
            .animation(.easeInOut(duration: Theme.Motion.micro), value: configuration.isPressed)
    }
}

// MARK: - View Extensions
extension View {
    /// Apply legacy card style (now Glass L1)
    func cardStyle() -> some View {
        modifier(CardStyle())
    }

    /// Apply glass card at a specific level
    func glassCard(_ level: GlassLevel = .card, radius: CGFloat? = nil, padding: CGFloat? = nil) -> some View {
        modifier(GlassCardModifier(level: level, radius: radius, padding: padding))
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
