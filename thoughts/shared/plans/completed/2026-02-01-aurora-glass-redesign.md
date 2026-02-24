# Aurora Glass Full App Redesign

## Overview

Rewrite the entire Brad OS iOS app UI from its current flat dark blue-gray theme to the Aurora Glass design system: visionOS-inspired glassmorphism with frosted glass panels, aurora glow blobs, deep dark gradients, and precise 4pt-grid spacing. Designed for maximum parallelization — after the foundation phase, all 42 view files can be modified simultaneously.

## Current State

- **Theme.swift** (`ios/BradOS/BradOS/Theme/Theme.swift`): Flat color tokens (`#2c363d` backgrounds), basic spacing (4/8/16/24/32), small corner radii (4/8/12/16), solid `CardStyle` with `backgroundSecondary` fill + `border` stroke, no glass materials, no aurora glows, no gradient backgrounds.
- **Views**: 42 SwiftUI files across 10 directories. All use `Theme.background` (solid), `Theme.backgroundSecondary` (solid), `Theme.border` (solid stroke), `.cornerRadius()` (not continuous). No `.material` usage except in glass button styles.
- **Components**: 7 shared components (`ActivityCard`, `StatusBadge`, `SectionHeader`, `EmptyStateView`, `ErrorStateView`, `LoadingView`, `NotificationSettingsView`) — all use flat styling.
- **Tab bar**: Standard SwiftUI `TabView` with `.tint()` — needs to become floating glass dock.
- **Navigation**: `ContentView` uses `ZStack` context switching. `TodayDashboardView` uses `NavigationStack` with `.navigationTitle`.

## Desired End State

Every screen matches the Aurora Glass spec:
- App background: linear gradient `#0A0D14` → `#111827` with 1-2 ambient aurora blobs
- All cards: Glass Level 1 (`.ultraThinMaterial` + `bg.surface @ 35%` + `white @ 10%` stroke + 16pt continuous corners)
- Tab bar: Floating glass dock (Glass L3, 28pt radius, 16pt from bottom)
- Typography: SF Pro at exact spec sizes with proper opacity tokens
- Spacing: Strict 4pt grid (4/8/12/16/20/24/32/40)
- Aurora glows on hero/active elements (max 2 per viewport)
- Press feedback: scale 0.98 + stroke +0.04 + glow -0.04 on all tappable glass
- All numbers use `.monospacedDigit()`

## What We're NOT Doing

- No changes to ViewModels, models, services, or API layer
- No changes to navigation structure or app architecture
- No changes to BradOSCore package
- No new features — pure visual redesign
- No SwiftUI previews overhaul (just ensure they still compile)

## Key Compatibility Note

All views reference `Theme.*` tokens. By keeping the same property names where possible and adding new ones, we minimize the blast radius. The glass view modifiers (`.glassCard()`, `.auroraGlow()`) are additive — they replace the existing `.cardStyle()`.

---

## Implementation Approach

### Dependency Graph

```
Phase 0: Theme.swift rewrite (SERIAL - everything depends on this)
    │
    ├── Phase 1A: Glass view modifiers & shared components (PARALLEL batch)
    │       ├── GlassCard modifier (L1-L4)
    │       ├── AuroraGlow modifier
    │       ├── AuroraBackground (Level 0)
    │       ├── EmptyStateView
    │       ├── StatusBadge / GenericBadge
    │       ├── SectionHeader
    │       ├── ActivityCard / ActivityQuickCard
    │       ├── LoadingView
    │       └── ErrorStateView
    │
    └── Phase 1B: Navigation chrome (PARALLEL with 1A)
            ├── ContentView (aurora gradient background)
            ├── MainTabView → floating glass dock
            └── BradOSApp.swift (dark mode enforcement)
    │
    Phase 2: ALL screens in parallel (10 parallel work streams)
        ├── Stream A: Today dashboard (5 files)
        ├── Stream B: Lifting views (5 files)
        ├── Stream C: Meal Plan views (10 files)
        ├── Stream D: Meditation (1 file)
        ├── Stream E: Stretching (2 files)
        ├── Stream F: Calendar/History (2 files)
        ├── Stream G: Activities (1 file)
        ├── Stream H: Profile (1 file)
        ├── Stream I: Barcode/Wallet (4 files)
        └── Stream J: RestTimerOverlay (1 file)
    │
    Phase 3: Build verification & visual QA (SERIAL)
```

---

## Phase 0: Theme.swift Rewrite

**Goal:** Replace all design tokens with Aurora Glass values. Add glass surface helpers and aurora glow utilities.

**File:** `ios/BradOS/BradOS/Theme/Theme.swift`

**Changes:**

### Colors (replace existing)
```
background      → bg.deep    #0A0D14  (was #2c363d)
backgroundSecondary → bg.base    #111827  (was #333d44)
backgroundTertiary  → bg.surface #0B1116  (was #3a454c)
backgroundHover     → REMOVE (interaction states use scale/opacity now)

textPrimary  → white @ 92%  (was #c5d0d8)
textSecondary → white @ 72%  (was #9ca3af)
textOnDark   → RENAME to textOnAccent: #061018 @ 95%

border   → REMOVE (replaced by stroke tokens)
disabled → REMOVE (replaced by text.disabled)

accent      → interactive.primary #7C5CFF  (was #6366f1)
accentLight → interactive.focusRing #A48BFF @ 75%  (was #818cf8)
```

### New tokens to ADD
```
// Text
textTertiary    = white @ 56%
textDisabled    = white @ 38%
textOnAccent    = Color(hex: "061018").opacity(0.95)

// Strokes
strokeSubtle  = white @ 10%
strokeMedium  = white @ 14%
strokeStrong  = white @ 18%
divider       = white @ 8%

// Interactive
interactivePrimary   = #7C5CFF
interactiveSecondary = #64D2FF
interactiveLink      = #7AA7FF
interactiveFocusRing = Color(hex: "A48BFF").opacity(0.75)

// Activity colors (UPDATE values)
lifting    = #6D6BFF  (was #6366f1)
stretch    = #21D6C2  (was #14b8a6)
meditation = #B26BFF  (was #a855f7)
mealPlan   = #FF7AAE  (was #E8889B)

// Status
success     = #34D399  (was #16a34a)
warning     = #FBBF24  (was #ea580c)
destructive = #FB7185  (was #dc2626)
info        = #60A5FA
neutral     = white @ 56%

// Scrims
scrimLight    = black @ 20%
scrimStandard = black @ 35%
scrimHeavy    = black @ 50%
```

### Spacing (UPDATE to 4pt grid with 8 levels)
```
space1 = 4    (was xs)
space2 = 8    (was sm)
space3 = 12   (NEW)
space4 = 16   (was md)
space5 = 20   (NEW — screen margins)
space6 = 24   (was lg)
space7 = 32   (was xl)
space8 = 40   (NEW)
```

### Corner Radius (UPDATE)
```
sm  = 8    (was 4)
md  = 12   (was 8)
lg  = 16   (was 12)
xl  = 20   (was 16)
xxl = 28   (NEW — tab bar dock)
pill = 999  (NEW)
```

### Glass Surface Modifiers (NEW)

Add `GlassLevel` enum and corresponding `ViewModifier`s:

```swift
enum GlassLevel { case card, elevated, chrome, overlay }
```

Each level applies: material + bg.surface fill at level-specific opacity + stroke + continuous corner radius.

### CardStyle (REPLACE)
The existing `CardStyle` ViewModifier becomes Glass L1:
- `.ultraThinMaterial` + `bg.surface @ 35%` + `strokeSubtle` 1pt + 16pt continuous corners

### Button Styles (UPDATE)
- `GlassPrimaryButtonStyle`: H:48pt, R:12pt, `.ultraThinMaterial` + `interactive.primary @ 22%`, stroke: `interactive.primary @ 45%`
- `GlassSecondaryButtonStyle`: H:48pt, R:12pt, Glass L1, stroke: `strokeMedium`
- `GhostButtonStyle` (NEW): No bg, `callout` semibold, `interactive.primary`, press: `white@6%` pill
- `DestructiveButtonStyle` (NEW): H:48pt, stroke: `destructive@55%`, fill: `destructive@14%`
- Circle button styles: Update to spec sizes and strokes

### Aurora Glow Modifier (NEW)
```swift
.auroraGlow(color:, intensity:) // Adds positioned blur circle
```

### Aurora Background View (NEW)
Reusable background with gradient + ambient blobs for Level 0.

### Backwards Compatibility
Keep old property names as computed properties pointing to new values so views compile during migration:
```swift
static var background: Color { bg.deep }
static var backgroundSecondary: Color { bg.base }
// etc
```
Remove these aliases after Phase 2 is complete.

**Success Criteria:**
- [ ] All new tokens match SKILL.md spec exactly
- [ ] `GlassCard` modifier produces correct material + fill + stroke + radius per level
- [ ] Old property names still resolve (backwards compat aliases)
- [ ] `npm run typecheck` equivalent: Xcode build succeeds with no errors

---

## Phase 1A: Shared Components (PARALLEL — 7 files)

**Depends on:** Phase 0

All 7 component files can be updated simultaneously. Each is independent.

### 1. `Components/ActivityCard.swift`
- `ActivityCard`: Glass L1 card, 40pt icon in icon bg (activity color @ 12%, 8pt radius, 52pt container), `headline` label, aurora glow on icon, press scale 0.98
- `ActivityQuickCard`: Glass L1, 20pt icon in 32pt bg, `headline` title, `subhead` subtitle @ `textSecondary`, trailing chevron 14pt @ `textTertiary`

### 2. `Components/StatusBadge.swift`
- `StatusBadge`: H:24pt, padding H:10pt V:4pt, R:8pt, fill `white@8%`, stroke `white@10%`, `caption` + `.fontWeight(.medium)`, status color text
- `GenericBadge`: Same spec, takes color param

### 3. `Components/SectionHeader.swift`
- Title: `title2` (22pt semibold), `textPrimary`
- Action: `callout` + `.semibold`, `interactivePrimary`

### 4. `Components/EmptyStateView.swift`
- Icon: 48-64pt `.regular` weight, `textTertiary`, optional aurora glow
- Title: `title3`, `textPrimary`
- Message: `callout`, `textSecondary`
- CTA: Primary button style

### 5. `Components/LoadingView.swift`
- ProgressView tinted `interactivePrimary`
- Message: `callout`, `textSecondary`

### 6. `Components/ErrorStateView.swift`
- Icon: `exclamationmark.triangle` 48pt, `destructive`
- Title: `title3`, `textPrimary`
- Message: `callout`, `textSecondary`
- Retry: Primary button

### 7. `Components/NotificationSettingsView.swift`
- Apply Glass L1 grouping, Aurora text tokens

**Success Criteria:**
- [ ] Each component matches its spec in SKILL.md § Components
- [ ] All use new Theme tokens (no hardcoded colors/sizes)
- [ ] All tappable elements meet 44x44pt minimum

---

## Phase 1B: Navigation Chrome (PARALLEL with 1A — 3 files)

### 1. `Views/ContentView.swift`
- Replace `Theme.background` solid fill with Aurora Level 0 gradient background
- Add 1-2 ambient aurora blobs (250-350pt diameter, blur 80-100pt, opacity 0.06-0.08)
- Fixed position — do not scroll with content

### 2. `Views/MainTabView.swift`
- Replace standard `TabView` with custom floating glass dock
- Glass L3: `.regularMaterial` + `bg.surface @ 55%` + `strokeMedium` 1pt
- R: 28pt (`radius.xxl`), floating 16pt from bottom, 20pt from sides
- Icon 22pt, label `caption`, gap 3pt
- Active: `textPrimary` + filled icon + accent@20% aurora highlight (blur 8pt)
- Inactive: `textTertiary` + outlined icon
- H: 64pt

### 3. `App/BradOSApp.swift`
- Confirm `.preferredColorScheme(.dark)` is set (already is — no change needed)

**Success Criteria:**
- [ ] Background shows deep gradient with subtle aurora blobs
- [ ] Tab bar floats above content with glass material
- [ ] Active tab has filled icon + aurora highlight
- [ ] Inactive tabs use outlined icons at tertiary opacity

---

## Phase 2: All Screens (10 PARALLEL STREAMS)

**Depends on:** Phase 0 + Phase 1A + Phase 1B

Every screen gets the same treatment. The pattern for each view:
1. Replace `.background(Theme.background)` → remove (inherited from ContentView)
2. Replace `.cardStyle()` / manual card bg → `.glassCard()` (Glass L1)
3. Replace `.navigationTitle` → custom `display` (34pt bold) title, left-aligned, `space5` margin
4. Update all text colors to opacity-based tokens
5. Update all spacing to 4pt grid tokens
6. Add `.monospacedDigit()` to all changing numbers
7. Update icon sizes/weights per spec
8. Add press feedback to tappable elements

### Stream A: Today Dashboard (5 files)
```
Views/Today/TodayDashboardView.swift
Views/Today/WorkoutDashboardCard.swift
Views/Today/StretchDashboardCard.swift
Views/Today/MeditationDashboardCard.swift
Views/Today/MealPlanDashboardCard.swift
```
- Dashboard: Custom large title "Today" (display, 34pt), vertical card stack with `space4` gaps, `space5` horizontal margins
- Each dashboard card: Glass L1, card header pattern (20pt icon in 32pt colored bg + `title3` + optional badge), `space3` header-to-content gap, right-aligned action link
- Workout card: lifting color glow (hero card — gets aurora glow)
- All status indicators use new status colors

### Stream B: Lifting Views (5 files)
```
Views/Lifting/LiftingTabView.swift
Views/Lifting/MesoView.swift
Views/Lifting/PlansView.swift
Views/Lifting/WorkoutView.swift
Views/Lifting/ExercisesView.swift
```
- LiftingTabView: Nested tabs get pill-style filter chips or segmented control, back button uses `chevron.left` 17pt + `interactivePrimary`
- MesoView: Week cards as Glass L1, progress bars (H:4pt, track white@6%, fill lifting color 100%), `.monospacedDigit()` on all set/rep/weight numbers
- WorkoutView: Active workout gets Glass L2 (elevated), set logging inputs as Glass L1 inputs (H:52pt, R:12pt)
- ExercisesView: List rows in Glass L1 container (min H:56pt, leading 16pt icon in 32pt bg, `headline` title, trailing chevron)

### Stream C: Meal Plan Views (10 files)
```
Views/MealPlan/MealPlanView.swift
Views/MealPlan/MealPlanGridView.swift
Views/MealPlan/MealPlanEditingView.swift
Views/MealPlan/TodayFocusView.swift
Views/MealPlan/MealTypeCardsView.swift
Views/MealPlan/MealDayCard.swift
Views/MealPlan/ShoppingListView.swift
Views/MealPlan/QueuedActionsButton.swift
Views/MealPlan/CollapsibleCritiqueView.swift
Views/MealPlan/CritiqueInputView.swift
```
- MealPlanView: Custom title, back button, mealPlan activity color
- Grid/day cards: Glass L1, `space4` padding, `space4` gaps
- TodayFocusView: Hero card with aurora glow (mealPlan color)
- ShoppingListView: List rows in Glass L1 container with checkmarks
- CritiqueInputView: Input fields H:52pt, R:12pt, Glass L1, focus ring
- QueuedActionsButton: Badge dot (6pt, 100% color)

### Stream D: Meditation (1 file)
```
Views/Meditation/MeditationView.swift
```
- Setup state: Glass L1 duration selection cards, meditation color accents
- Active state: Breathing circle with aurora glow (meditation color), timer numbers in `display` + `.monospacedDigit()`
- Complete state: Celebration with bouncy spring animation
- Circle buttons: 80pt primary, 56pt secondary

### Stream E: Stretching (2 files)
```
Views/Stretch/StretchView.swift
Views/Stretch/StretchSessionDetailView.swift
```
- Setup: Glass L1 config cards, stretch color accents, region selection chips (filter chip style)
- Active: Timer in `display` + `.monospacedDigit()`, progress bar (H:4pt, stretch color), aurora glow on timer
- Detail: Stat cards (Glass L1, icon 18pt → `display` value → `footnote` label), 2-column grid

### Stream F: Calendar/History (2 files)
```
Views/Calendar/CalendarView.swift
Views/History/HistoryView.swift
```
- Calendar grid: Day cells with `subhead` text, today = `interactivePrimary` fill + white text + R:12pt + glow shadow, activity dots (5pt, 3pt gap, 100% activity colors)
- Filter chips: H:32pt, R:pill, unselected `white@6%` + `white@10%`, selected `interactivePrimary@18%` + `interactivePrimary@50%`
- Month nav: Glass L1 container
- Day detail sheet: Glass L4 overlay

### Stream G: Activities (1 file)
```
Views/Activities/ActivitiesView.swift
```
- Activity grid: 2-column `LazyVGrid`, 12pt gap
- Activity grid cards: Glass L1, 24pt V / 16pt H padding, centered icon 40pt → `headline` label → `footnote` sub
- Optional aurora glow behind lifting icon (hero card)
- Recent activity section: List rows in Glass L1 container

### Stream H: Profile (1 file)
```
Views/Profile/ProfileView.swift
```
- Settings groups: Glass L1 containers
- List rows: Min H:56pt, `headline` title, `subhead` subtitle, trailing chevron
- Dividers: 1pt `divider` (white@8%), inset to text edge

### Stream I: Barcode/Wallet (4 files)
```
Views/Barcode/BarcodeWalletView.swift
Views/Barcode/BarcodeFormView.swift
Views/Barcode/BarcodeDisplaySheet.swift
Views/Barcode/BarcodeImageView.swift
```
- Wallet list: Glass L1 cards
- Form: Input fields per spec (H:52pt, R:12pt, Glass L1, focus ring)
- Display sheet: Glass L4 overlay, full brightness for barcode scanning
- Image view: No glass treatment (needs high contrast for scanning)

### Stream J: RestTimerOverlay (1 file)
```
Views/Components/RestTimerOverlay.swift
```
- Glass L4 overlay (`.thickMaterial` + `bg.surface@65%` + `strokeMedium`)
- Timer: `display` + `.monospacedDigit()`
- Dismiss/skip buttons: Glass button styles
- Scrim: `black @ 35%`

**Success Criteria (all streams):**
- [ ] No hardcoded colors remaining (all via `Theme.*`)
- [ ] No hardcoded spacing outside 4pt grid
- [ ] All corners use `.continuous` style
- [ ] All cards use `GlassCard` modifier at correct level
- [ ] All changing numbers use `.monospacedDigit()`
- [ ] All tappable elements have press feedback (scale 0.98)
- [ ] Max 2 aurora glows per viewport

---

## Phase 3: Build Verification & Cleanup

**SERIAL — must wait for all Phase 2 streams**

### 3A: Build & Fix
1. Build the project: `xcodebuild -project ios/BradOS/BradOS.xcodeproj -scheme BradOS -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17 Pro' build`
2. Fix any compilation errors
3. Remove backwards-compatibility aliases from Theme.swift (added in Phase 0)

### 3B: Visual QA
1. Install on simulator
2. Walk through every screen
3. Check: glass materials rendering, aurora glows positioned correctly, text legibility, touch targets, number alignment
4. Fix any visual issues

### 3C: Commit
1. Single commit: "Redesign entire app with Aurora Glass design system"

**Success Criteria:**
- [ ] Clean Xcode build (zero errors, zero warnings)
- [ ] All screens visually match Aurora Glass spec
- [ ] No backwards-compat aliases remaining in Theme.swift
- [ ] No references to old removed tokens

---

## Execution Strategy for Maximum Speed

The plan is designed so that after Phase 0 (~1 foundation file), we can run **up to 12 parallel work streams** (7 components + 3 nav chrome + implicit readiness for Phase 2).

Phase 2 then opens **10 parallel streams** covering all 32 remaining view files.

**Total serial bottleneck:** Phase 0 (1 file) → Phase 3 (build/fix)
**Total parallel work:** Phase 1 (10 files) + Phase 2 (32 files) = 42 files, all parallelizable

### Parallel Execution Map
```
Time →
─────────────────────────────────────────────────────────
Phase 0: [████ Theme.swift ████]
                                 │
Phase 1A: [██ ActivityCard ██]   │  ← 7 parallel
          [██ StatusBadge  ██]   │
          [██ SectionHeader██]   │
          [██ EmptyState   ██]   │
          [██ LoadingView  ██]   │
          [██ ErrorState   ██]   │
          [██ NotifSettings██]   │
                                 │
Phase 1B: [██ ContentView  ██]   │  ← 3 parallel (with 1A)
          [██ MainTabView  ██]   │
          [██ BradOSApp    ██]   │
                                 │
Phase 2:  [████ Stream A: Today (5)     ████]  ← 10 parallel
          [████ Stream B: Lifting (5)   ████]
          [████ Stream C: MealPlan (10) ████]
          [████ Stream D: Meditation    ████]
          [████ Stream E: Stretching (2)████]
          [████ Stream F: Calendar (2)  ████]
          [████ Stream G: Activities    ████]
          [████ Stream H: Profile       ████]
          [████ Stream I: Barcode (4)   ████]
          [████ Stream J: RestTimer     ████]
                                              │
Phase 3:  [████ Build + QA + Commit ████████]
```

## References

- Aurora Glass Design System: `.claude/skills/aurora-glass/SKILL.md`
- Full design system doc: `thoughts/shared/aurora-glass-design-system.md`
- Current Theme: `ios/BradOS/BradOS/Theme/Theme.swift`
