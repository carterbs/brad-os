# iOS Build and Run Guide

## Default Workflow (Humans + Agents)

Use one command:

```bash
npm run qa:start
```

This is the default local iOS path. It handles simulator + Firebase + OTel + build + launch in one flow.

Optional stable session ID:

```bash
npm run qa:start -- --id alice
```

Stop when done:

```bash
npm run qa:stop
```

## Advanced Session Controls

Use these only when you need finer control than `qa:start`:

```bash
# Start env only (no build/launch)
npm run advanced:qa:env:start -- --id alice

# Build and launch separately
npm run qa:build -- --id alice
npm run qa:launch -- --id alice

# Stop a specific session
npm run qa:stop -- --id alice
```

## Advanced: Manual Build and Run (Troubleshooting Only)

Only use this when debugging the QA harness itself.

```bash
cd ios/BradOS && xcodegen generate && cd ../..
xcodebuild -project ios/BradOS/BradOS.xcodeproj \
  -scheme BradOS \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -derivedDataPath ~/.cache/brad-os-derived-data \
  -skipPackagePluginValidation \
  build

xcrun simctl install booted ~/.cache/brad-os-derived-data/Build/Products/Debug-iphonesimulator/BradOS.app
xcrun simctl launch booted com.bradcarter.brad-os
```

## iOS Linting (SwiftLint)

SwiftLint runs as an SPM build tool plugin — it executes automatically during `xcodebuild build`. There is no separate lint command; a successful build means zero SwiftLint errors.

`npm run qa:start` already performs this build step.

For an explicit build-only check against an existing QA session:

```bash
npm run qa:build -- --id alice
```

## Exploratory Testing

Start with `npm run qa:start`, then use `/explore-ios` to run exploratory QA testing on the iOS app. This uses:

| Tool | Purpose |
|------|---------|
| `ui_describe_all` | Get accessibility tree |
| `ui_tap` | Tap at coordinates |
| `ui_swipe` | Swipe gestures |
| `ui_type` | Text input |
| `screenshot` | Capture visual state |
