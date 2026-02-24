# iOS Build and Run Guide

## Setup

Run the setup script to install dependencies for iOS Simulator testing:

```bash
./scripts/setup-ios-testing.sh
```

## Building and Running

```bash
# Build for simulator (no workspace - use xcodeproj directly)
# NOTE: Do NOT pass -sdk flag — it breaks the watchOS companion build.
# NOTE: -skipPackagePluginValidation is required for SwiftLint SPM build plugin in CLI builds.
xcodebuild -project ios/BradOS/BradOS.xcodeproj \
  -scheme BradOS \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -derivedDataPath ~/.cache/brad-os-derived-data \
  -skipPackagePluginValidation \
  build

# Install and launch
xcrun simctl install booted ~/.cache/brad-os-derived-data/Build/Products/Debug-iphonesimulator/BradOS.app
xcrun simctl launch booted com.bradcarter.brad-os
```

## iOS Linting (SwiftLint)

SwiftLint runs as an SPM build tool plugin — it executes automatically during `xcodebuild build`. There is no separate lint command; a successful build means zero SwiftLint errors.

**Before merging any branch that touches iOS files**, verify the build passes:

```bash
cd ios/BradOS && xcodegen generate && cd ../..
xcodebuild -project ios/BradOS/BradOS.xcodeproj \
  -scheme BradOS \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -derivedDataPath ~/.cache/brad-os-derived-data \
  -skipPackagePluginValidation \
  build
```

## Exploratory Testing

Use `/explore-ios` to run exploratory QA testing on the iOS app. This uses:

| Tool | Purpose |
|------|---------|
| `ui_describe_all` | Get accessibility tree |
| `ui_tap` | Tap at coordinates |
| `ui_swipe` | Swipe gestures |
| `ui_type` | Text input |
| `screenshot` | Capture visual state |
