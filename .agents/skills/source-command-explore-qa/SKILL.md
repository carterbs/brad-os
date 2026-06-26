---
name: "source-command-explore-qa"
description: "Run exploratory QA testing on the app using Playwright MCP"
---

# source-command-explore-qa

Use this skill when the user asks to run the migrated source command `explore-qa`.

## Command Template

Run exploratory QA testing on the app using Playwright MCP.

**When to use:** After implementing features, before deployment, or when asked to "test the app"

## Process

1. Ensure dev server is running (`npm run dev`)
2. Use `mcp__playwright__browser_navigate` to navigate to `http://localhost:3000`
3. Use `mcp__playwright__browser_snapshot` (NOT screenshots) to understand the UI
4. Click elements using their `ref` from snapshots
5. Test critical user flows:
   - Create/edit exercises
   - Create workout plans
   - Start and track workouts
   - Log/skip sets
   - Complete workouts
6. Document bugs found in `BUGS.md` using the standard format
7. Timebox to 10 minutes unless told otherwise

## Bug format for BUGS.md

```markdown
### BUG #N: [Short title]
**Status:** Open
**Steps to reproduce:**
1. Step 1
2. Step 2
**Expected behavior:** ...
**Actual behavior:** ...
**Impact:** ...
```

## Notes

- Use `browser_snapshot` over screenshots - it's faster and provides element refs
- Be systematic: test one flow completely before moving to the next
- If you find a bug, document it immediately before continuing
- Focus on user-facing functionality, not edge cases
