# iOS / Swift Conventions

## App Details

- **Bundle ID:** `com.bradcarter.brad-os`
- **Project:** `ios/BradOS/BradOS.xcodeproj` (use `-project`, NOT `-workspace`)
- **Scheme:** `BradOS`
- **Features:** Workouts, Stretching, Meditation, Calendar, Profile, Cycling, Meal Planning

## Shared APIClient

This project uses a shared APIClient with App Check for all HTTP requests. Never create separate HTTP layers or bypass the shared APIClient. When wiring new features, always use the existing APIClient pattern.

## UI / SwiftUI Conventions

Always use the app's shared Theme/color system for UI components. Never hardcode colors. Check for existing design tokens before creating new ones. Dark mode is the default theme.

## SwiftLint Rules

SwiftLint is configured in `ios/BradOS/.swiftlint.yml`. All rules are errors — there are no warnings. Key rules enforced:

- `file_length` (max 600 lines) — split large files using Swift extensions
- `type_body_length` (max 500 lines) — move methods to `+Extension.swift` files
- `function_body_length` (max 60 lines) — extract helper methods
- `force_unwrapping` — use `guard let` or `?? default` instead of `!`
- `identifier_name` — no `SCREAMING_CASE`; use `camelCase` for constants
- `discouraged_optional_boolean` — use explicit `Bool` (not `Bool?`); for Codable structs, use `decodeIfPresent ?? false`

**NEVER write `swiftlint:disable` comments.** Fix the underlying code instead. If a rule fires, either the code needs to change or the rule should be turned off globally in `.swiftlint.yml` — never silenced inline.

When splitting files, remember to remove `private` from properties/methods that need cross-file access within the same module.

## XcodeGen

Project is generated from `ios/BradOS/project.yml`:

```bash
cd ios/BradOS && xcodegen generate
```
