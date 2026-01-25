# Bug: Calendar Component Light Background in Dark Theme

## Problem

The react-calendar component displays with a light/white background instead of matching the app's dark theme. While the activity items (workout dots, stretch items in the dialog) are styled correctly with transparent backgrounds, the calendar grid itself has a stark white background that doesn't match the rest of the app.

## Screenshots

See `.playwright-mcp/calendar-dark-theme.png` - the calendar has a light gray/white background while the rest of the app has a dark slate background.

## Expected Behavior

The calendar should have a dark background matching the app's Radix UI dark theme (slate grays like `var(--gray-2)` for background, `var(--gray-3)` for navigation/headers).

## Current Implementation

PR #6 added CSS overrides in `packages/client/src/global.css`:

```css
/* Dark theme overrides for react-calendar */
.react-calendar {
  background-color: var(--gray-2);
  border: 1px solid var(--gray-5);
  border-radius: 8px;
  /* ... more styles ... */
}
```

## Root Cause Analysis

The CSS is present but not taking effect. Possible causes:

1. **CSS specificity issue**: react-calendar may use more specific selectors that override our styles
2. **Class name mismatch**: The library may use different class names than `.react-calendar`
3. **CSS load order**: The library's CSS may load after our overrides
4. **Missing import**: global.css styles may not be reaching the calendar component

## Files to Investigate

- `packages/client/src/global.css` - Contains the dark theme overrides
- `packages/client/src/components/Calendar/MonthCalendar.tsx` - The component using react-calendar
- `packages/client/src/index.tsx` or `main.tsx` - Check CSS import order
- `node_modules/react-calendar/dist/Calendar.css` - Library's default styles

## Suggested Fix Approaches

1. **Increase CSS specificity**: Use more specific selectors like `.calendar-container .react-calendar`
2. **Use !important**: As a last resort for stubborn library styles
3. **Inline styles**: Apply styles directly to the Calendar component via className or style prop
4. **CSS Modules**: Scope the overrides to avoid conflicts
5. **Check if Calendar component accepts a className prop** and ensure our container has the right class

## Acceptance Criteria

- Calendar background should be dark (matching `var(--gray-2)`)
- Navigation header should be slightly lighter dark (`var(--gray-3)`)
- Day numbers should be light colored for readability
- Selected day should use the accent color (indigo)
- Today's date should be visually distinct
- Weekend days should not have different coloring that clashes with dark theme
