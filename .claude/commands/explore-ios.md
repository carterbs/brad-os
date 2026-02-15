---
description: Run exploratory QA testing on the iOS app using iOS Simulator MCP
---

Run exploratory QA testing on the BradOS iOS app using the iOS Simulator MCP.

**When to use:** After implementing iOS features, before releases, or when asked to "test the iOS app"

## Prerequisites

Run the setup script if you haven't already:
```bash
./scripts/setup-ios-testing.sh
```

## App Details

- **Bundle ID:** `com.bradcarter.brad-os`
- **Workspace:** `ios/BradOS/BradOS.xcworkspace`
- **Scheme:** `BradOS`

## Process

### 1. Build and Install (if needed)

```bash
# Build for simulator
xcodebuild -workspace ios/BradOS/BradOS.xcworkspace \
  -scheme BradOS \
  -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 15 Pro' \
  -derivedDataPath ~/.cache/brad-os-derived-data \
  build

# Boot simulator (if not running)
xcrun simctl boot 'iPhone 15 Pro'

# Install app
xcrun simctl install booted ~/.cache/brad-os-derived-data/Build/Products/Debug-iphonesimulator/BradOS.app

# Launch app
xcrun simctl launch booted com.bradcarter.brad-os
```

### 2. Exploratory Testing

1. Use `mcp__ios-simulator__ui_describe_all` to get the accessibility tree (like browser_snapshot)
2. Interact using element refs:
   - `mcp__ios-simulator__ui_tap` - Tap at coordinates or element
   - `mcp__ios-simulator__ui_swipe` - Swipe gestures
   - `mcp__ios-simulator__ui_type` - Text input
3. Use `mcp__ios-simulator__screenshot` to capture visual state

### 3. Test Critical Flows

**Stretching Flow:**
- Start a stretch session
- Verify timer countdown
- Verify audio plays
- Verify stretch images display
- Complete/skip stretches
- Verify session completion

**Meditation Flow:**
- Start a meditation session
- Verify audio playback
- Verify timer/progress
- Complete session

**Navigation:**
- Tab switching (Activities, Lifting, Calendar, Profile)
- Back navigation
- Deep links (if applicable)

**Calendar:**
- View activity history
- Navigate between months
- Activity indicators

### 4. Document Bugs

Add bugs to `BUGS.md` using this format:

```markdown
### BUG #N: [Short title] (iOS)
**Status:** Open
**Platform:** iOS
**Steps to reproduce:**
1. Step 1
2. Step 2
**Expected behavior:** ...
**Actual behavior:** ...
**Screenshot:** [path if captured]
**Impact:** ...
```

## Notes

- **Prefer ui_describe_all over screenshots** - It's faster and provides element positions
- Screenshots are useful for visual verification after finding issues
- Test one flow completely before moving to the next
- Timebox to 10-15 minutes unless told otherwise
- Focus on parity with PWA behavior where applicable

## Quick Reference

| Action | Tool |
|--------|------|
| Get UI tree | `mcp__ios-simulator__ui_describe_all` |
| Tap | `mcp__ios-simulator__ui_tap` |
| Swipe | `mcp__ios-simulator__ui_swipe` |
| Type text | `mcp__ios-simulator__ui_type` |
| Screenshot | `mcp__ios-simulator__screenshot` |
| Install app | `mcp__ios-simulator__install_app` |
| Launch app | `mcp__ios-simulator__launch_app` |
