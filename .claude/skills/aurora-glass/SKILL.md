---
name: aurora-glass
description: >
  Aurora Glass design system for all Brad OS UI work. Use this skill whenever building, modifying, or reviewing
  SwiftUI views in the iOS app. Applies to: creating new screens, editing existing views, adding components,
  reviewing UI consistency, or any task that touches Theme.swift or visual elements. This is the single source
  of truth for colors, typography, spacing, glass surfaces, aurora glows, components, and interaction patterns.
allowed-tools: Read, Edit, Write, Glob, Grep
---

# Aurora Glass Design System

You are building UI for Brad OS, an iOS SwiftUI app. Every view MUST follow this design system. Do not deviate. Do not invent new tokens. If something isn't covered here, use the nearest existing token.

The visual language is visionOS-inspired glassmorphism: frosted glass panels over a deep dark gradient, with soft aurora color blobs for warmth and depth.

---

## Foundations

- **Grid unit: 4pt.** All spacing, sizing, radii = multiples of 4.
- **Touch targets: 44x44pt minimum** on all tappable elements.
- **Corners: Always continuous.** Use `RoundedRectangle(cornerRadius:, style: .continuous)`.
- **Dark mode only.** Enforced at app level.

---

## Colors

### Backgrounds
| Token | Hex | Usage |
|-------|-----|-------|
| `bg.deep` | `#0A0D14` | Gradient top (deepest) |
| `bg.base` | `#111827` | Gradient bottom (primary) |
| `bg.surface` | `#0B1116` | Glass fill tint (used with opacity, never solo) |

App background = linear gradient from `bg.deep` (top) to `bg.base` (bottom).

### Text (white at fixed opacities)
| Token | Value | Usage |
|-------|-------|-------|
| `text.primary` | `white @ 92%` | Titles, values, primary content |
| `text.secondary` | `white @ 72%` | Metadata, subtitles, descriptions |
| `text.tertiary` | `white @ 56%` | Placeholders, hints, timestamps |
| `text.disabled` | `white @ 38%` | Disabled labels |
| `text.onAccent` | `#061018 @ 95%` | Text on filled accent buttons |

### Strokes & Dividers
| Token | Value |
|-------|-------|
| `stroke.subtle` | `white @ 10%` — default card borders |
| `stroke.medium` | `white @ 14%` — elevated surfaces, focus |
| `stroke.strong` | `white @ 18%` — high-emphasis (rare) |
| `divider` | `white @ 8%` — list separators |

### Interactive
| Token | Hex | Usage |
|-------|-----|-------|
| `interactive.primary` | `#7C5CFF` | Primary actions, links, selected states |
| `interactive.secondary` | `#64D2FF` | Secondary interactive (rare) |
| `interactive.link` | `#7AA7FF` | Text links on dark |
| `interactive.focusRing` | `#A48BFF @ 75%` | Focus indicator, 2pt outer ring |

### Activity Colors (icons, glows, progress bars — NEVER card backgrounds)
| Activity | Hex |
|----------|-----|
| Lifting | `#6D6BFF` |
| Stretch | `#21D6C2` |
| Meditate | `#B26BFF` |
| Meal Plan | `#FF7AAE` |

Activity color opacity rules:
- Icon tint: **100%**
- Icon background fill: **color @ 12%**
- Aurora glow: **18%** primary, **12%** secondary
- Progress bar: **100%**
- Badge dot: **100%** (6pt)

### Status
| Token | Hex |
|-------|-----|
| `success` | `#34D399` |
| `warning` | `#FBBF24` |
| `destructive` | `#FB7185` |
| `info` | `#60A5FA` |
| `neutral` | `white @ 56%` |

### Interaction States (for any interactive element with base color `C`)
- **Default:** `C` at defined opacity
- **Pressed:** Scale 0.98 + stroke opacity +0.04 + glow opacity -0.04
- **Disabled:** `text.disabled` for labels, `stroke.subtle` for borders
- **Focused:** 2pt `interactive.focusRing` outer ring

### Scrims
- Light: `black @ 20%` — subtle dim behind sheets
- Standard: `black @ 35%` — modal backdrop
- Heavy: `black @ 50%` — alert dialogs (rare)

---

## Typography (SF Pro)

Use SwiftUI system fonts. SF Pro Text auto-renders at <=19pt, Display at >=20pt.

| Token | Size | Weight | SwiftUI |
|-------|------|--------|---------|
| `display` | 34 | .bold | `.system(size: 34, weight: .bold)` |
| `title1` | 28 | .bold | `.system(size: 28, weight: .bold)` |
| `title2` | 22 | .semibold | `.system(size: 22, weight: .semibold)` |
| `title3` | 20 | .semibold | `.system(size: 20, weight: .semibold)` |
| `headline` | 17 | .semibold | `.headline` |
| `body` | 17 | .regular | `.body` |
| `callout` | 16 | .regular | `.callout` |
| `subhead` | 15 | .regular | `.subheadline` |
| `footnote` | 13 | .regular | `.footnote` |
| `caption` | 12 | .medium | `.caption` + `.fontWeight(.medium)` |

### Usage
- Screen title: `display`, `text.primary`
- Section header: `title2`, `text.primary`
- Card title: `title3`, `text.primary`
- Card emphasis: `headline`, `text.primary`
- Card metadata: `subhead`, `text.secondary`
- Body text: `body`, `text.secondary`
- Action links: `callout` + `.semibold`, `interactive.primary`
- Badge text: `caption`, status color
- Helper/timestamps: `footnote`, `text.tertiary`

### Numbers
- **All changing numbers** (reps, sets, weights, timers) → `.monospacedDigit()`
- Large stat values → `display` + `.bold` + `.monospacedDigit()`
- Units after numbers → `text.secondary`, same size or one step down

---

## Spacing (4pt grid)

| Token | Value | Common usage |
|-------|-------|-------------|
| `space.1` | 4pt | Dot gaps, tight offsets |
| `space.2` | 8pt | Icon-to-text, between meta lines |
| `space.3` | 12pt | Title-to-content, list row padding |
| `space.4` | 16pt | Card padding, card stack gap |
| `space.5` | 20pt | Screen side margins |
| `space.6` | 24pt | Screen title to content, section gaps |
| `space.7` | 32pt | Large section gaps |
| `space.8` | 40pt | Major breaks |

### Key Layout Values
- Screen horizontal margins: **20pt** (`space.5`)
- Screen title bottom margin: **24pt** (`space.6`)
- Card-to-card gap: **16pt** (`space.4`)
- Card internal padding: **16pt** (`space.4`)
- Card header to content: **12pt** (`space.3`)
- Between meta lines: **8pt** (`space.2`)
- Icon to label: **8pt** (`space.2`)

---

## Corner Radius

| Token | Value | Usage |
|-------|-------|-------|
| `radius.sm` | 8pt | Chips, badges, icon backgrounds |
| `radius.md` | 12pt | Buttons, inputs, nested panels |
| `radius.lg` | 16pt | Cards, primary panels |
| `radius.xl` | 20pt | Sheets, large containers |
| `radius.2xl` | 28pt | Tab bar dock |
| `radius.pill` | 999pt | Full pill shapes |

### Nested Radius Rule
`childRadius = max(parentRadius - padding, radius.sm)`

Never use the same radius for parent and child.

---

## Glass Surfaces (5 levels)

### Level 0 — App Background
- Gradient `bg.deep` → `bg.base`. No blur. Aurora ambient blobs live here.

### Level 1 — Cards & Panels
- **Material:** `.ultraThinMaterial`
- **Fill:** `bg.surface @ 35%`
- **Stroke:** `stroke.subtle` (white @ 10%), 1pt
- **Radius:** `radius.lg` (16pt)
- **Top highlight (optional):** gradient `white @ 6%` → transparent, top edge, 1pt
- **Use for:** content cards, activity tiles, calendar, settings groups, stat cards

### Level 2 — Elevated / Active
- **Material:** `.thinMaterial`
- **Fill:** `bg.surface @ 42%`
- **Stroke:** `stroke.medium` (white @ 14%), 1pt
- **Radius:** `radius.lg` or `radius.xl`
- **Use for:** selected cards, modals, focused inputs, popovers

### Level 3 — Chrome (Tab Bar, Toolbars)
- **Material:** `.regularMaterial`
- **Fill:** `bg.surface @ 55%`
- **Stroke:** `stroke.medium` (white @ 14%), 1pt
- **Radius:** `radius.2xl` (28pt) for floating dock
- **Use for:** bottom tab bar, persistent toolbars

### Level 4 — Overlays (Sheets, Dialogs)
- **Material:** `.thickMaterial`
- **Fill:** `bg.surface @ 65%`
- **Stroke:** `stroke.medium` (white @ 14%), 1pt
- **Scrim:** `black @ 35%` behind
- **Radius:** `radius.xl` (20pt)
- **Use for:** bottom sheets, alerts, action menus

### SwiftUI Pattern
```swift
// Glass Level 1 card
content
    .padding(16)
    .background(.ultraThinMaterial)
    .background(Color(hex: "0B1116").opacity(0.35))
    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    .overlay(
        RoundedRectangle(cornerRadius: 16, style: .continuous)
            .stroke(Color.white.opacity(0.10), lineWidth: 1)
    )
```

### Elevation
Elevation = higher blur + higher fill opacity + stronger stroke. **No drop shadows on normal cards.** Shadows only on overlays.

---

## Aurora Glow System

Soft colored blurs behind glass surfaces. Decorative lighting, not backgrounds.

### Specs
| Property | Primary | Secondary |
|----------|---------|-----------|
| Diameter | 1.4x element shortest side | 0.9x element shortest side |
| Blur | 48pt | 32pt |
| Opacity | 0.18 | 0.12 |
| Blend | `.plusLighter` preferred | normal |

### Positioning
- Offset **-20% to -35%** outside card bounds (top-left or top-right, near icon)
- **Never** center behind text
- Keep near icons, corners, decorative areas

### Rules
- **Max 2 glowed elements per viewport**
- Use for: active/hero card, selected states, empty state illustrations, completion screens
- Do NOT use: on every card in a list, behind dense text, behind small type

### Ambient Background Auroras (Level 0)
- 1-2 large blobs: 250-350pt diameter, blur 80-100pt, opacity 0.06-0.08
- Fixed position — do NOT animate on scroll

### SwiftUI Pattern
```swift
Circle()
    .fill(Theme.lifting)
    .frame(width: 100, height: 100)
    .blur(radius: 48)
    .opacity(0.18)
    .blendMode(.plusLighter)
    .offset(x: -20, y: -15)
```

---

## Shadows (rare)

| Token | Y | Blur | Color |
|-------|---|------|-------|
| `shadow.sm` | 4 | 12 | `black @ 25%` |
| `shadow.md` | 8 | 24 | `black @ 28%` |
| `shadow.lg` | 16 | 40 | `black @ 32%` |

Only for modals/sheets/popovers. Never on normal cards. Never stack multiple shadows.

---

## Icons (SF Symbols)

### Sizes
- Tab bar: **22pt**
- Card header: **20pt**
- Activity grid (large): **40pt**
- List row: **16pt**
- Badge/inline: **12pt**

### Weights
- Tab active / action buttons: `.semibold`
- Tab inactive / card icons: `.medium`
- Large decorative (40pt+): `.regular`

### Filled vs Outlined
- Selected/active → **filled** (`house.fill`)
- Unselected/neutral → **outlined** (`house`)
- Never mix within the same icon role in a row

### Icon Backgrounds
- Fill: activity color @ 12%
- Shape: rounded rect, `radius.sm` (8pt)
- Size: icon + 12pt (20pt icon → 32pt container)

---

## Motion

### Durations
- Micro (press): **0.12s**
- Fast (transitions): **0.22s**
- Normal (sheets): **0.30s**

### Springs
- Standard: `response: 0.32, dampingFraction: 0.86`
- Bouncy (celebrations): `response: 0.40, dampingFraction: 0.78`

### Press Feedback (all tappable glass)
- Scale: **0.98**
- Stroke: **+0.04** opacity
- Glow: **-0.04** opacity
- Duration: 0.12s

### Animate: tab selection, press feedback, progress bars, sheets, number changes (`.contentTransition(.numericText())`)
### Don't animate: background aurora scroll position, in-place type size changes

---

## Components

### Buttons

**Primary** — H:48pt, R:`radius.md`, fill: `.ultraThinMaterial` + `interactive.primary @ 22%`, stroke: `interactive.primary @ 45%`, label: `headline`, `text.primary`

**Secondary** — H:48pt, R:`radius.md`, fill: Glass L1, stroke: `stroke.medium`, label: `headline`, `text.primary`

**Ghost** — min 44pt hit area, no bg, label: `callout` semibold, `interactive.primary`, press: subtle `white@6%` pill

**Destructive** — H:48pt, stroke: `destructive@55%`, fill: `destructive@14%`, label: `white@92%`

**Circle** — 56pt (secondary) or 80pt (primary), material bg, stroke `white@15%`, pressed: scale 0.95

### Cards
- Surface: Glass L1, R:`radius.lg`, padding: `space.4`
- Structure: header (icon 20pt in 32pt bg + `title3` + optional badge) → `space.3` → content → `space.3` → right-aligned action link
- Entire card is tappable

### Activity Grid Cards
- Glass L1, R:`radius.lg`, 24pt V / 16pt H padding
- Centered: icon 40pt → 10pt gap → `headline` label → `footnote` sub
- Optional aurora glow behind icon @ 20%
- 2-column grid, 12pt gap

### Badges
- H:24pt, padding H:10pt V:4pt, R:`radius.sm`
- Fill: `white@8%`, stroke: `white@10%`
- Text: `caption`, status color
- Optional: 6pt status dot before text

### Filter Chips
- H:32pt, padding H:14pt, R:16pt (pill)
- Unselected: fill `white@6%`, stroke `white@10%`
- Selected: fill `interactive.primary@18%`, stroke `interactive.primary@50%`
- Text: `footnote` medium

### List Rows
- Min H:56pt, padding H:16pt V:12pt
- Leading icon 16pt in 32pt bg
- Title: `headline`, subtitle: `subhead` `text.secondary`
- Trailing chevron: 14pt `text.tertiary`
- Divider: 1pt `divider`, inset to text edge
- Grouped in Glass L1 container

### Input Fields
- H:52pt, R:`radius.md`, Glass L1
- Default stroke: `stroke.subtle`, focused: `interactive.focusRing` 2pt
- Text: `body`, placeholder: `text.tertiary`
- Error: stroke `destructive@60%`, helper `footnote`

### Progress Bars
- H:4pt, track `white@6%` R:2pt, fill activity color 100% R:2pt
- Optional gradient: activity color → `interactive.secondary`

### Calendar Cells
- Text: `subhead`, `text.secondary`
- Today: `interactive.primary` fill, white text, R:`radius.md`, glow shadow
- Activity dots: 5pt, 3pt gap, 100% activity colors

### Empty States
- Icon 48-64pt `.regular` `text.tertiary`, optional aurora glow
- Title: `title3`, message: `callout` `text.secondary`
- CTA: primary button

### Stat Cards
- Glass L1, R:`radius.lg`, padding `space.4`
- Icon 18pt top → value `display` `.monospacedDigit()` → label `footnote` `text.tertiary`
- 2-column grid, 12pt gap

---

## Navigation

### Tab Bar (Floating Glass Dock)
- Glass L3, floating 16pt from bottom, 20pt from sides
- H:64pt, R:`radius.2xl` (28pt)
- Icon 22pt, label `caption`, gap 3pt
- Active: `text.primary` + filled icon + aurora highlight (accent@20%, blur 8pt)
- Inactive: `text.tertiary` + outlined icon

### Screen Titles
- `display` (34pt bold), left-aligned, `space.5` margin
- No collapsing titles — always large

### Back Navigation
- `chevron.left` 17pt, `interactive.primary`
- Label: `callout` semibold

---

## Do's and Don'ts

1. **DO** use the 5 glass levels. **DON'T** invent one-off blurs.
2. **DO** use 4pt grid spacing. **DON'T** eyeball 10/14/18pt.
3. **DO** use text opacity tokens. **DON'T** manually set `.opacity()` on white.
4. **DO** cap glows at 2 per viewport. **DON'T** glow every card.
5. **DO** use `.monospacedDigit()` on changing numbers. **DON'T** let numbers shift layout.
6. **DO** ensure 44x44pt tap targets. **DON'T** rely on tiny text links.
7. **DO** use semantic colors. **DON'T** hardcode activity colors for generic actions.
8. **DO** follow nested radius rule. **DON'T** double-round (same radius parent+child).
9. **DO** use blur/fill/stroke for elevation. **DON'T** shadow normal cards.
10. **DO** keep icon weights consistent per context. **DON'T** mix weights in a row.

---

## Reference: Full Design System Document

The complete design system with additional detail, rationale, and examples lives at:
`thoughts/shared/aurora-glass-design-system.md`

The HTML visual reference (color swatches, type scale, glass level comparisons, component gallery, assembled screen) can be regenerated from the scratchpad.

## Applying This System

When modifying or creating a view:

1. **Read the current Theme.swift** (`ios/BradOS/BradOS/Theme/Theme.swift`) to see which tokens are already implemented
2. **Use existing Theme tokens** where they exist, add new ones where needed
3. **Follow the component specs exactly** — don't approximate sizes/spacing
4. **Check glass surface level** — is this a card (L1), elevated (L2), chrome (L3), or overlay (L4)?
5. **Verify touch targets** — every tappable element must meet 44x44pt
6. **Test number alignment** — any dynamic number needs `.monospacedDigit()`
