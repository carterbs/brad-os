# Aurora Glass Design System

A comprehensive design system for Brad OS. visionOS-inspired glassmorphism with soft aurora gradients on a deep dark base. Every screen, current and future, follows these rules.

This document is the single source of truth. When building any UI, reference this - not individual screen implementations.

---

## 0. Foundations

### Base Grid
- **Grid unit: 4pt.** All spacing, sizing, and radii are multiples of 4.
- Exception: hairline strokes at 1pt.

### Minimum Touch Target
- **44x44pt** on all tappable elements (Apple HIG). If the visual element is smaller, expand the hit area with `contentShape` or padding.

### Corner Smoothing
- Always use continuous corners: `RoundedRectangle(cornerRadius:, style: .continuous)`
- Never use the default (non-continuous) corner style.

### Color Scheme
- The app is **dark mode only**. Enforced at app level with `.preferredColorScheme(.dark)`.

---

## 1. Color System

### 1.1 Background

The app background is NOT a flat color. It's a subtle gradient that gives the aurora effect depth.

| Token | Value | Usage |
|-------|-------|-------|
| `bg.base` | `#111827` | Primary app background (gradient start) |
| `bg.deep` | `#0A0D14` | Deeper background (gradient end, top of screen) |
| `bg.surface` | `#0B1116` | Used in glass fills with opacity (not directly) |

Background implementation: a linear gradient from `bg.deep` (top) to `bg.base` (bottom), filling the full screen behind all content.

### 1.2 Text

Text colors are white at specific opacities. Use the token, not manual opacity.

| Token | Value | Contrast on glass | Usage |
|-------|-------|-------------------|-------|
| `text.primary` | `#FFFFFF` @ 92% | ~12:1 | Primary content, titles, values |
| `text.secondary` | `#FFFFFF` @ 72% | ~8.5:1 | Metadata, subtitles, descriptions |
| `text.tertiary` | `#FFFFFF` @ 56% | ~6:1 | Placeholders, hints, timestamps |
| `text.disabled` | `#FFFFFF` @ 38% | ~4:1 | Disabled labels, inactive content |
| `text.onAccent` | `#061018` @ 95% | - | Text on filled accent buttons |

### 1.3 Strokes & Dividers

| Token | Value | Usage |
|-------|-------|-------|
| `stroke.subtle` | `#FFFFFF` @ 10% | Default card/surface borders |
| `stroke.medium` | `#FFFFFF` @ 14% | Elevated surfaces, focused inputs |
| `stroke.strong` | `#FFFFFF` @ 18% | High-emphasis borders (rare) |
| `divider` | `#FFFFFF` @ 8% | List separators, section breaks |

### 1.4 Interactive Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `interactive.primary` | `#7C5CFF` | Primary actions, links, selected states |
| `interactive.secondary` | `#64D2FF` | Secondary interactive elements (rare) |
| `interactive.link` | `#7AA7FF` | Text links (high readability on dark) |
| `interactive.focusRing` | `#A48BFF` @ 75% | Focus indicator, 2pt outer ring |

### 1.5 Activity Colors

Each activity domain has a signature color. These are used for icons, aurora glows, and subtle accents - never as card backgrounds.

| Activity | Hex | Usage contexts |
|----------|-----|----------------|
| Lifting | `#6D6BFF` | Icon tint, glow, progress bar, calendar dot |
| Stretch | `#21D6C2` | Icon tint, glow, progress bar, calendar dot |
| Meditate | `#B26BFF` | Icon tint, glow, progress bar, calendar dot |
| Meal Plan | `#FF7AAE` | Icon tint, glow, progress bar, calendar dot |

Activity color opacity rules:
- Icon tint: **100%**
- Icon background fill: **activity color @ 12%**
- Aurora glow: **18%** (primary), **12%** (secondary)
- Progress bar fill: **100%** (thin 4pt bar)
- Card leading accent stripe: **do not use** (removed from old design)
- Badge dot: **100%** (6pt circle)

### 1.6 Status Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `status.success` | `#34D399` | Completed, enabled, positive |
| `status.warning` | `#FBBF24` | In progress, caution, pending action |
| `status.destructive` | `#FB7185` | Error, delete, destructive action |
| `status.info` | `#60A5FA` | Informational, scheduled, neutral-active |
| `status.neutral` | `#FFFFFF` @ 56% | Skipped, inactive |

### 1.7 Interaction States

For any interactive element with base color `C`:

| State | Transform |
|-------|-----------|
| Default | `C` at defined opacity |
| Pressed | Scale 0.98 + stroke opacity +0.04 + glow opacity -0.04 |
| Disabled | Use `text.disabled` for labels, `stroke.subtle` for borders |
| Focused (accessibility) | Add 2pt `interactive.focusRing` outside element |

### 1.8 Overlay / Scrim

| Token | Value | Usage |
|-------|-------|-------|
| `scrim.light` | `#000000` @ 20% | Subtle dimming behind sheets |
| `scrim.standard` | `#000000` @ 35% | Standard modal backdrop |
| `scrim.heavy` | `#000000` @ 50% | Alert dialogs (rare) |

---

## 2. Typography

### 2.1 System Font

Use SF Pro exclusively via SwiftUI's `.system()` font. SF Pro Text renders automatically at sizes <=19pt, SF Pro Display at >=20pt.

### 2.2 Type Scale

| Token | Size | Weight | Line Height | Tracking | SwiftUI |
|-------|------|--------|-------------|----------|---------|
| `display` | 34pt | .bold | 41pt | -0.4 | `.system(size: 34, weight: .bold)` |
| `title1` | 28pt | .bold | 34pt | -0.3 | `.system(size: 28, weight: .bold)` |
| `title2` | 22pt | .semibold | 28pt | -0.2 | `.system(size: 22, weight: .semibold)` |
| `title3` | 20pt | .semibold | 26pt | -0.1 | `.system(size: 20, weight: .semibold)` |
| `headline` | 17pt | .semibold | 22pt | 0 | `.headline` |
| `body` | 17pt | .regular | 24pt | 0 | `.body` |
| `callout` | 16pt | .regular | 22pt | 0 | `.callout` |
| `subhead` | 15pt | .regular | 20pt | 0 | `.subheadline` |
| `footnote` | 13pt | .regular | 18pt | 0 | `.footnote` |
| `caption` | 12pt | .medium | 16pt | +0.2 | `.caption` with `.fontWeight(.medium)` |

### 2.3 Usage Rules

| Context | Token | Color |
|---------|-------|-------|
| Screen title ("Today", "Activities") | `display` | `text.primary` |
| Section header ("Statistics", "Settings") | `title2` | `text.primary` |
| Card title ("Meal Plan", "Lifting") | `title3` | `text.primary` |
| Card subtitle / emphasis | `headline` | `text.primary` |
| Card metadata ("Week 2 - 6 exercises") | `subhead` | `text.secondary` |
| Body text, descriptions | `body` | `text.secondary` |
| Action link text ("View Plan", "See All") | `callout` + .semibold | `interactive.primary` |
| Badge text ("In Progress") | `caption` | Status color |
| Helper text, timestamps | `footnote` | `text.tertiary` |

### 2.4 Numeric Display Rules

- **All changing numbers** (reps, sets, weights, timers, progress) must use `.monospacedDigit()` to prevent layout shifts.
- **Stat values** (Profile screen, large numbers): use `display` token at `.bold`, with `.monospacedDigit()`.
- **Timer displays**: use `title1` or `display` with `.monospacedDigit()`.
- Units after numbers ("sets", "min", "lbs") use `text.secondary` at the same size or one step down.

---

## 3. Spacing

### 3.1 Scale

All spacing values are multiples of the 4pt grid unit.

| Token | Value | Common usage |
|-------|-------|-------------|
| `space.0` | 0pt | - |
| `space.1` | 4pt | Tight gaps (icon badge offset, dot spacing) |
| `space.2` | 8pt | Icon-to-text gaps, between meta lines, compact padding |
| `space.3` | 12pt | Card title-to-content gap, list row vertical padding |
| `space.4` | 16pt | Card internal padding, card stack gap, section divider |
| `space.5` | 20pt | Screen side margins (content inset) |
| `space.6` | 24pt | Screen title to first content, section spacing |
| `space.7` | 32pt | Large section gaps |
| `space.8` | 40pt | Major section breaks |
| `space.10` | 64pt | Rare, splash/empty state vertical padding |

### 3.2 Layout Rules

| Context | Value |
|---------|-------|
| Screen horizontal margins | `space.5` (20pt) |
| Screen title bottom margin | `space.6` (24pt) |
| Card-to-card vertical gap | `space.4` (16pt) |
| Card internal padding | `space.4` (16pt) |
| Card title row to content | `space.3` (12pt) |
| Between body/meta lines | `space.2` (8pt) |
| Content to bottom action | `space.3` (12pt) |
| Section header to content | `space.3` (12pt) |
| Icon to label gap | `space.2` (8pt) |
| Tab bar height | 88pt (includes safe area) |
| Tab bar content height | 64pt |

---

## 4. Corner Radius

### 4.1 Scale

| Token | Value | Usage |
|-------|-------|-------|
| `radius.sm` | 8pt | Chips, small badges, icon backgrounds |
| `radius.md` | 12pt | Buttons, input fields, nested panels |
| `radius.lg` | 16pt | Cards, primary panels |
| `radius.xl` | 20pt | Sheets, large containers |
| `radius.2xl` | 28pt | Tab bar container, floating dock |
| `radius.pill` | 999pt | Full pill shapes (filter chips if desired) |

### 4.2 Nested Radius Rule

When a surface is nested inside another surface with padding `p`, the child radius should be:

```
childRadius = max(parentRadius - padding, radius.sm)
```

Example: A card has `radius.lg` (16pt) with `space.4` (16pt) padding. Inner element: `max(16-16, 8) = 8pt`.

Never use the same radius for parent and child - it creates an awkward visual "double rounding" effect.

---

## 5. Glass Surfaces

The core of Aurora Glass. Five levels of glass, each with specific blur, fill, and stroke values.

### 5.1 Surface Levels

#### Level 0: App Background
- **Fill:** Gradient from `bg.deep` to `bg.base`
- **Blur:** None
- **Stroke:** None
- **Use for:** Screen background. Aurora ambient blobs live here.

#### Level 1: Cards & Primary Panels
- **Material:** `.ultraThinMaterial` (SwiftUI)
- **Fill overlay:** `bg.surface` @ 35%
- **Stroke:** `stroke.subtle` (white @ 10%), 1pt
- **Top highlight:** Optional - gradient from `white @ 6%` to `transparent`, 1pt, top edge only
- **Radius:** `radius.lg` (16pt)
- **Use for:** Content cards, activity tiles, calendar container, settings groups, stat cards.

#### Level 2: Elevated Interactive
- **Material:** `.thinMaterial`
- **Fill overlay:** `bg.surface` @ 42%
- **Stroke:** `stroke.medium` (white @ 14%), 1pt
- **Radius:** `radius.lg` (16pt) or `radius.xl` (20pt)
- **Use for:** Selected cards, modals, focused inputs, popovers.

#### Level 3: Chrome (Tab Bar, Toolbars)
- **Material:** `.regularMaterial`
- **Fill overlay:** `bg.surface` @ 55%
- **Stroke:** `stroke.medium` (white @ 14%), 1pt
- **Radius:** `radius.2xl` (28pt) for floating dock style
- **Use for:** Bottom tab bar, persistent toolbars, floating action containers.

#### Level 4: Overlays (Sheets, Dialogs)
- **Material:** `.thickMaterial`
- **Fill overlay:** `bg.surface` @ 65%
- **Stroke:** `stroke.medium` (white @ 14%), 1pt
- **Scrim behind:** `scrim.standard` (#000 @ 35%)
- **Radius:** `radius.xl` (20pt)
- **Use for:** Bottom sheets, alert dialogs, action menus.

### 5.2 SwiftUI Implementation Pattern

```swift
// Example: Glass Level 1 card
content
    .padding(Theme.space4)
    .background(.ultraThinMaterial)
    .background(Theme.bgSurface.opacity(0.35))
    .clipShape(RoundedRectangle(cornerRadius: Theme.radiusLg, style: .continuous))
    .overlay(
        RoundedRectangle(cornerRadius: Theme.radiusLg, style: .continuous)
            .stroke(Color.white.opacity(0.10), lineWidth: 1)
    )
```

### 5.3 Elevation Rules

- Do NOT use drop shadows for card elevation in normal lists.
- Elevation is communicated through: higher blur density + higher fill opacity + stronger stroke.
- Shadows are reserved for overlays that float above the glass stack (see Section 7).

---

## 6. Aurora Glow System

Aurora glows are soft, colored radial gradients that create depth and warmth behind glass surfaces. They are decorative lighting - not backgrounds.

### 6.1 Glow Anatomy

Each glow is a blurred circle/ellipse of an activity color (or brand accent) placed behind or within a glass surface.

| Property | Primary Glow | Secondary Glow |
|----------|-------------|----------------|
| Shape | Circle | Circle |
| Diameter | 1.4x element's shortest side | 0.9x element's shortest side |
| Blur radius | 48pt | 32pt |
| Opacity | 0.18 | 0.12 |
| Blend mode | `.plusLighter` (preferred) or normal | Normal |

### 6.2 Positioning

- **Cards:** Place primary glow offset **-20% to -35%** outside the card bounds (top-left or top-right, near the icon).
- **Secondary glow** (optional): Inside bounds near the opposite corner.
- **Never** center a glow directly behind text - it hurts legibility.
- Keep glows near **icons, corners, or decorative areas**.

### 6.3 When to Use

**Use aurora glow for:**
- The highest-priority card on screen (today's active workout, active session)
- Selected/active states
- Empty state illustrations
- Hero moments (completion screens, onboarding)

**Do NOT use aurora glow for:**
- Every card in a scrollable list (visual noise)
- Behind dense text or small type
- More than **2 glowed elements per viewport** at once

### 6.4 Ambient Background Auroras

The app background (Level 0) can have 1-2 very large, very subtle ambient aurora blobs:
- Diameter: 250-350pt
- Blur: 80-100pt
- Opacity: 0.06-0.08
- Position: Fixed (do NOT animate position on scroll - causes motion sickness)
- Color: Use `interactive.primary` or a muted brand color

These create atmosphere without competing with content.

### 6.5 SwiftUI Pattern

```swift
// Aurora glow behind an icon area
Circle()
    .fill(Theme.lifting)
    .frame(width: 100, height: 100)
    .blur(radius: 48)
    .opacity(0.18)
    .blendMode(.plusLighter)
    .offset(x: -20, y: -15)
```

---

## 7. Shadows

Shadows are rare in this system. Glass blur and stroke handle most elevation needs.

### 7.1 Shadow Tokens

| Token | Y offset | Blur | Spread | Color | Usage |
|-------|----------|------|--------|-------|-------|
| `shadow.sm` | 4pt | 12pt | 0 | `#000` @ 25% | Floating buttons |
| `shadow.md` | 8pt | 24pt | 0 | `#000` @ 28% | Sheets, popovers |
| `shadow.lg` | 16pt | 40pt | 0 | `#000` @ 32% | Alerts (rare) |

### 7.2 Rules
- Cards in normal scroll lists: **no shadow**.
- Modals/sheets/popovers: `shadow.md`.
- Never stack multiple shadow layers on one element.

---

## 8. Icons (SF Symbols)

### 8.1 Sizes

| Context | Size | Example |
|---------|------|---------|
| Tab bar | 22pt | house, square.grid.2x2 |
| Card header icon | 20pt | dumbbell, fork.knife |
| Activity grid (large) | 40pt | Activity selection cards |
| List row leading | 16pt | Settings rows |
| Inline / badge | 12pt | Status indicators |

### 8.2 Weights

| Context | Weight |
|---------|--------|
| Tab bar (active) | `.semibold` |
| Tab bar (inactive) | `.medium` |
| Card/list icons | `.medium` |
| Large decorative (40pt+) | `.regular` (avoids heaviness on glass) |
| Action button icons | `.semibold` |

### 8.3 Filled vs Outlined

| State | Style | Example |
|-------|-------|---------|
| Selected tab | Filled | `house.fill` |
| Unselected tab | Outlined | `house` |
| Active status | Filled | `checkmark.circle.fill` |
| Neutral / default | Outlined | `checkmark.circle` |

**Rule:** Within a single row or group, never mix filled and outlined for the same icon role.

### 8.4 Icon Backgrounds

When icons need a colored background (card headers, settings rows):
- Background: Activity color @ 12% opacity
- Shape: Rounded rectangle, `radius.sm` (8pt)
- Size: Icon size + 12pt (e.g., 20pt icon in 32pt container)
- Border: None (the fill is enough)

---

## 9. Motion & Animation

### 9.1 Duration Scale

| Token | Duration | Usage |
|-------|----------|-------|
| `duration.micro` | 0.12s | Press states, highlights |
| `duration.fast` | 0.22s | Standard transitions, tab switches |
| `duration.normal` | 0.30s | Sheet presentation, page transitions |

### 9.2 Curves

Use SwiftUI springs for natural feel on glass surfaces:

| Token | Response | Damping | Usage |
|-------|----------|---------|-------|
| `spring.standard` | 0.32 | 0.86 | Default for all transitions |
| `spring.bouncy` | 0.40 | 0.78 | Celebratory moments (completion, PR) |

```swift
.animation(.spring(response: 0.32, dampingFraction: 0.86), value: someState)
```

### 9.3 Press Feedback

All tappable glass elements:
- **Scale:** 0.98 on press
- **Stroke:** +0.04 opacity increase on press
- **Glow:** -0.04 opacity decrease on press (compresses light)
- **Duration:** `duration.micro` (0.12s)

### 9.4 What Should Animate

- Tab selection (icon fill transition + label color)
- Card press feedback (scale + stroke)
- Progress bar value changes
- Sheet/modal presentation
- Navigation transitions (push/pop)
- Number value changes (use `contentTransition(.numericText())`)

### 9.5 What Should NOT Animate

- Background aurora blob positions during scroll
- Typography size changes in-place (causes reflow jitter)
- Card reordering in lists (unless explicitly drag-to-reorder)

---

## 10. Components

### 10.1 Buttons

#### Primary Button (filled glass + accent)
- **Height:** 48pt
- **Padding:** H 16pt, V 12pt
- **Radius:** `radius.md` (12pt)
- **Background:** `.ultraThinMaterial` + `interactive.primary` @ 22% overlay
- **Stroke:** `interactive.primary` @ 45%, 1pt
- **Label:** `headline` weight, `text.primary`
- **Pressed:** Scale 0.98, stroke opacity +0.05

#### Secondary Button (glass outline)
- **Height:** 48pt
- **Padding:** H 16pt, V 12pt
- **Radius:** `radius.md` (12pt)
- **Background:** Glass Level 1
- **Stroke:** `stroke.medium` (white @ 14%)
- **Label:** `headline` weight, `text.primary`
- **Pressed:** Scale 0.98, opacity 0.8

#### Ghost Button (text only)
- **Min hit area:** 44pt
- **Background:** None (on press: `white @ 6%` pill behind text)
- **Label:** `callout` + .semibold, `interactive.primary`

#### Destructive Button
- **Height:** 48pt
- **Stroke:** `status.destructive` @ 55%
- **Fill overlay:** `status.destructive` @ 14%
- **Label:** White @ 92%

#### Circle Button (floating actions)
- **Size:** 56pt (secondary) or 80pt (primary)
- **Background:** `.ultraThinMaterial` (secondary) or material + accent @ 60% (primary)
- **Stroke:** White @ 15%
- **Pressed:** Scale 0.95

### 10.2 Cards

The primary content container.

- **Surface:** Glass Level 1
- **Radius:** `radius.lg` (16pt)
- **Padding:** `space.4` (16pt)
- **Stroke:** `stroke.subtle`
- **Structure:**
  1. Header row: icon (20pt in 32pt bg) + title (`title3`) + optional badge (right-aligned)
  2. Gap: `space.3` (12pt)
  3. Content: varies (meal rows, workout details, etc.)
  4. Gap: `space.3` (12pt)
  5. Footer: right-aligned action link (`callout` + semibold, `interactive.primary`)
- **The entire card is tappable.** The action link is visual only - the card handles the tap.

### 10.3 Activity Grid Cards

- **Surface:** Glass Level 1
- **Radius:** `radius.lg` (16pt)
- **Padding:** 24pt vertical, 16pt horizontal
- **Layout:** Centered vertically - icon (40pt) + gap (10pt) + label (`headline`) + sub (`footnote`, `text.secondary`)
- **Aurora:** Optional soft glow blob behind icon at 20% opacity
- **Grid:** 2 columns, 12pt gap

### 10.4 Badges

- **Height:** 24pt
- **Padding:** H 10pt, V 4pt
- **Radius:** `radius.sm` (8pt)
- **Background:** White @ 8%
- **Stroke:** White @ 10%, 1pt
- **Text:** `caption` (12pt, medium), colored by status
- **Optional:** 6pt status dot before text

### 10.5 Filter Chips

- **Height:** 32pt
- **Padding:** H 14pt
- **Radius:** 16pt (half height for pill)
- **Unselected:** Fill white @ 6%, stroke white @ 10%
- **Selected:** Fill `interactive.primary` @ 18%, stroke `interactive.primary` @ 50%, text `text.primary`
- **Text:** `footnote` (13pt), medium weight
- **Gap between chips:** `space.2` (8pt)

### 10.6 List Rows (Settings, etc.)

- **Min height:** 56pt
- **Padding:** H 16pt, V 12pt
- **Leading icon:** 16pt in 32pt rounded-rect background
- **Title:** `headline` (17pt semibold)
- **Subtitle:** `subhead` (15pt), `text.secondary`
- **Trailing:** Chevron at 14pt, `text.tertiary`
- **Divider:** 1pt `divider` color, inset to text leading edge (not full-bleed)
- **Grouped in:** Glass Level 1 container with `radius.lg`

### 10.7 Input Fields

- **Height:** 52pt
- **Radius:** `radius.md` (12pt)
- **Background:** Glass Level 1
- **Stroke default:** `stroke.subtle`
- **Stroke focused:** `interactive.focusRing` 2pt outer + inner stroke white @ 14%
- **Text:** `body` (17pt), `text.primary`
- **Placeholder:** `text.tertiary`
- **Error state:** Stroke `status.destructive` @ 60%, helper text in `footnote` below

### 10.8 Progress Bars

- **Height:** 4pt
- **Track:** White @ 6%, radius 2pt
- **Fill:** Activity color at 100%, radius 2pt
- **Gradient option:** For aurora feel, fill can gradient from activity color to `interactive.secondary`
- **Animate:** Value changes with `spring.standard`

### 10.9 Calendar Day Cells

- **Size:** Flexible within 7-column grid
- **Text:** `subhead` (15pt), `text.secondary`
- **Today:** `interactive.primary` fill, white text, `radius.md` (12pt), subtle glow shadow (`interactive.primary` @ 30%, blur 16pt)
- **Activity dots:** 5pt circles below date number, 3pt gap between dots
- **Dot colors:** Activity colors at 100%

### 10.10 Empty States

- **Icon:** SF Symbol at 48-64pt, `.regular` weight, `text.tertiary`
- **Optional aurora glow** behind icon (this is a good place for atmosphere)
- **Title:** `title3`, `text.primary`
- **Message:** `callout`, `text.secondary`, max 2 lines
- **CTA:** Primary button (48pt)
- **Spacing:** Center vertically in available space

### 10.11 Stat Cards (Profile)

- **Surface:** Glass Level 1
- **Radius:** `radius.lg` (16pt)
- **Padding:** `space.4` (16pt)
- **Layout:** Icon (18pt, activity color) top, then value (`display` token, bold, `text.primary`, `.monospacedDigit()`), then label (`footnote`, `text.tertiary`)
- **Grid:** 2 columns, 12pt gap

---

## 11. Navigation

### 11.1 Tab Bar

The tab bar is a **floating glass dock**, not a standard iOS tab bar.

- **Surface:** Glass Level 3
- **Position:** Floating, 16pt from bottom, 20pt from sides
- **Height:** 64pt
- **Radius:** `radius.2xl` (28pt)
- **Stroke:** White @ 12%
- **Items:** Evenly distributed
  - **Icon:** 22pt
  - **Label:** `caption` (12pt)
  - **Gap:** 3pt between icon and label
  - **Active:** `text.primary` + filled icon variant + subtle aurora highlight behind (activity color @ 20%, blur 8pt, as pseudo-element)
  - **Inactive:** `text.tertiary` + outlined icon variant

### 11.2 Screen Titles

- Use large title style: `display` token (34pt bold)
- Left-aligned with `space.5` (20pt) margin
- Do NOT use collapsing/inline titles - keep them large and bold for the "everything app" feel
- Title color: `text.primary`

### 11.3 Back Navigation

- Custom back button: SF Symbol `chevron.left` at 17pt, `interactive.primary` color
- Label: screen name in `callout` + semibold
- Minimum hit area: 44pt

### 11.4 Context Modals (Lifting, Stretch, Meditation)

These are full-screen modal contexts with their own internal navigation:
- Presented with `.fullScreenCover`
- Same glass background as main app
- Back/close button in top-left
- May have their own tab bar or toolbar at bottom

---

## 12. Do's and Don'ts

1. **DO** use the 5 glass surface levels consistently. **DON'T** invent one-off blur/opacity combinations per screen.

2. **DO** stick to the 4pt spacing grid. **DON'T** eyeball values like 10pt, 14pt, 18pt.

3. **DO** use the named text opacity tokens. **DON'T** manually set `.opacity(0.7)` on white text.

4. **DO** limit aurora glows to 1-2 prominent items per viewport. **DON'T** glow every card.

5. **DO** use `.monospacedDigit()` on all changing numbers. **DON'T** let numbers shift layout.

6. **DO** make all tappable elements 44x44pt minimum. **DON'T** rely on small text links as the only tap target.

7. **DO** use semantic color tokens (`interactive.primary`, `status.warning`). **DON'T** hardcode activity colors for buttons or generic actions.

8. **DO** follow the nested radius rule (`childRadius = parentRadius - padding`). **DON'T** use the same radius for parent and child.

9. **DO** communicate elevation with blur + fill opacity + stroke. **DON'T** add drop shadows to normal cards.

10. **DO** keep icon weights consistent within a context. **DON'T** mix .regular and .bold SF Symbols in the same row.

---

## 13. Quick Reference: Token Summary

```
COLORS
  bg.deep        #0A0D14
  bg.base        #111827
  bg.surface     #0B1116  (used with opacity in glass fills)

  text.primary   white@92%
  text.secondary white@72%
  text.tertiary  white@56%
  text.disabled  white@38%

  interactive.primary    #7C5CFF
  interactive.secondary  #64D2FF
  interactive.link       #7AA7FF

  lifting     #6D6BFF
  stretch     #21D6C2
  meditate    #B26BFF
  mealPlan    #FF7AAE

  success     #34D399
  warning     #FBBF24
  destructive #FB7185
  info        #60A5FA

SPACING (4pt grid)
  space.1=4  space.2=8  space.3=12  space.4=16
  space.5=20  space.6=24  space.7=32  space.8=40

RADIUS
  sm=8  md=12  lg=16  xl=20  2xl=28  pill=999

GLASS LEVELS (blur | fill opacity | stroke opacity)
  L0: none | gradient | none          (background)
  L1: ultraThin | 35% | 10%           (cards)
  L2: thin | 42% | 14%               (elevated)
  L3: regular | 55% | 14%            (chrome)
  L4: thick | 65% | 14%              (overlays)

TYPE (SF Pro)
  display: 34/bold  title1: 28/bold  title2: 22/semi
  title3: 20/semi  headline: 17/semi  body: 17/reg
  callout: 16/reg  subhead: 15/reg  footnote: 13/reg
  caption: 12/med

MOTION
  micro: 0.12s  fast: 0.22s  normal: 0.30s
  spring: response=0.32, damping=0.86
```
