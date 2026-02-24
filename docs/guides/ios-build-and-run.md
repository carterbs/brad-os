# iOS Build and Run Guide

## Setup

Run the setup script to verify iOS toolchain prerequisites and run a sanity build:

```bash
./scripts/setup-ios-testing.sh              # Full setup + sanity build
./scripts/setup-ios-testing.sh --skip-build  # Check tools only, skip build
```

The script checks for `xcodebuild`, `xcodegen`, and `xcrun simctl`, generates the Xcode project from `project.yml`, boots an iPhone 17 Pro simulator, and runs a fast build to verify everything works.

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
