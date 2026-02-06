import SwiftUI
import BradOSCore

// MARK: - Aurora Glass Design System
// visionOS-inspired glassmorphism: frosted glass panels over deep dark gradients,
// soft aurora color blobs for warmth and depth.

struct Theme {
    // MARK: - Background Colors (from shared ThemeColors)
    struct BG {
        static let deep = ThemeColors.bgDeep
        static let base = ThemeColors.bgBase
        static let surface = ThemeColors.bgSurface
    }

    // MARK: - Text Colors (white at fixed opacities)
    static let textPrimary = ThemeColors.textPrimary
    static let textSecondary = ThemeColors.textSecondary
    static let textTertiary = ThemeColors.textTertiary
    static let textDisabled = Color.white.opacity(0.38)
    static let textOnAccent = Color(hex: "061018").opacity(0.95)

    // MARK: - Strokes & Dividers
    static let strokeSubtle = Color.white.opacity(0.08)
    static let strokeMedium = Color.white.opacity(0.11)
    static let strokeStrong = Color.white.opacity(0.18)
    static let divider = Color.white.opacity(0.08)

    // MARK: - Interactive Colors
    static let interactivePrimary = Color(hex: "7C5CFF")
    static let interactiveSecondary = Color(hex: "64D2FF")
    static let interactiveLink = Color(hex: "7AA7FF")
    static let interactiveFocusRing = Color(hex: "A48BFF").opacity(0.75)

    // MARK: - Activity Colors (from shared ThemeColors)
    static let lifting = ThemeColors.lifting
    static let stretch = ThemeColors.stretch
    static let meditation = ThemeColors.meditation
    static let mealPlan = ThemeColors.mealPlan

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
        case .elevated: return .ultraThinMaterial
        case .chrome: return .ultraThinMaterial
        case .overlay: return .thinMaterial
        }
    }

    /// White tint opacity applied on top of material blur
    var fillOpacity: Double {
        switch self {
        case .card: return 0.02
        case .elevated: return 0.03
        case .chrome: return 0.02
        case .overlay: return 0.05
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
            .background(Color.white.opacity(level.fillOpacity))
            .background(level.material)
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

            // Ambient aurora blob 1 — top-left, cyan
            Circle()
                .fill(Theme.interactiveSecondary)
                .frame(width: 300, height: 300)
                .blur(radius: 140)
                .opacity(0.50)
                .blendMode(.plusLighter)
                .offset(x: -100, y: -160)

            // Ambient aurora blob 2 — bottom-right, purple
            Circle()
                .fill(Theme.interactivePrimary)
                .frame(width: 280, height: 280)
                .blur(radius: 130)
                .opacity(0.40)
                .blendMode(.plusLighter)
                .offset(x: 120, y: 240)

            // Ambient aurora blob 3 — center-left, green
            Circle()
                .fill(Color(hex: "34D399"))
                .frame(width: 260, height: 260)
                .blur(radius: 130)
                .opacity(0.38)
                .blendMode(.plusLighter)
                .offset(x: -60, y: 80)
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

// MARK: - View Modifiers

// Legacy CardStyle — now Glass L1
struct CardStyle: ViewModifier {
    func body(content: Content) -> some View {
        content.modifier(GlassCardModifier(level: .card))
    }
}

// MARK: - Button Styles

/// Glass-style primary button: gradient stroke + glow over glass
struct GlassPrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        let shape = RoundedRectangle(cornerRadius: Theme.CornerRadius.md, style: .continuous)
        configuration.label
            .font(.headline)
            .foregroundColor(Theme.textPrimary)
            .frame(height: Theme.Dimensions.buttonHeight)
            .padding(.horizontal, Theme.Spacing.space4)
            .background(Color.white.opacity(0.06))
            .background(.ultraThinMaterial)
            .clipShape(shape)
            .overlay(
                shape.stroke(
                    LinearGradient(
                        colors: [
                            Theme.interactivePrimary.opacity(configuration.isPressed ? 0.65 : 0.55),
                            Theme.interactiveSecondary.opacity(configuration.isPressed ? 0.50 : 0.40)
                        ],
                        startPoint: .leading,
                        endPoint: .trailing
                    ),
                    lineWidth: 1.5
                )
            )
            .shadow(color: Theme.interactivePrimary.opacity(0.25), radius: 12, y: 2)
            .scaleEffect(configuration.isPressed ? 0.98 : 1.0)
            .animation(.easeInOut(duration: Theme.Motion.micro), value: configuration.isPressed)
    }
}

/// Glass-style secondary button: H:48pt, R:12pt, subtle white tint over material blur
struct GlassSecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundColor(Theme.textPrimary)
            .frame(height: Theme.Dimensions.buttonHeight)
            .padding(.horizontal, Theme.Spacing.space4)
            .background(Color.white.opacity(0.06))
            .background(.ultraThinMaterial)
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
            .background(Color.white.opacity(0.06), in: Circle())
            .background(.ultraThinMaterial, in: Circle())
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
            .background(
                Circle()
                    .fill(configuration.isPressed ? color.opacity(0.30) : color.opacity(0.35))
            )
            .background(.ultraThinMaterial, in: Circle())
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
