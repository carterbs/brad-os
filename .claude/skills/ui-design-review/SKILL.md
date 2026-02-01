---
name: ui-design-review
description: Get UI/UX design feedback from OpenAI by sending app screenshots. Use when asked to "review the UI", "improve the design", "make it look better", "get design feedback", or when evaluating visual quality of app screens.
allowed-tools: Bash(node *), mcp__ios-simulator__screenshot, mcp__ios-simulator__ui_view, mcp__playwright__browser_take_screenshot
---

# UI Design Review

Hand off UI design review to OpenAI's vision model by capturing screenshots and sending them for expert analysis.

## Prerequisites

The `OPENAI_API_KEY` environment variable must be set. If it's not set, tell the user:

```
Set your OpenAI API key:
  export OPENAI_API_KEY=sk-...
```

## Workflow

### 1. Capture Screenshots

Determine the platform and capture relevant screens:

**For iOS app:**
```bash
# Take a screenshot of the current simulator view
mcp__ios-simulator__screenshot --output_path /tmp/ui-review-{screen-name}.png
```

Capture multiple screens if reviewing a flow (e.g., list view + detail view + empty state).

### 2. Run the Review Script

**ALWAYS use `--output` to persist the review to a markdown file.** This ensures the feedback survives if the session is interrupted.

```bash
node .claude/skills/ui-design-review/scripts/review-ui.mjs \
  /tmp/ui-review-*.png \
  --prompt "context about what the screen shows or specific concerns" \
  --output /tmp/ui-review-YYYY-MM-DD-screen-name.md
```

Use a descriptive filename with the date and screen name, e.g. `/tmp/ui-review-2025-06-15-meal-plan.md`.

**Options:**
- `--prompt "text"` — Add context like "This is the meal plan screen, focus on readability"
- `--model gpt-5.2` — Change the model (default: `gpt-5.2`, options: `gpt-4o`, `gpt-5`, `gpt-5.2`)
- `--output path.md` — **Always use this.** Save the full review (prompt, model, feedback) to a markdown file

### 3. Present Feedback

After receiving the design feedback:

1. **Summarize the key findings** — List the top 3-5 most impactful changes
2. **Ask the user which changes to implement** — Don't auto-implement everything
3. **If the user approves changes**, implement them following normal code change workflow (worktree, tests, etc.)

## Example Invocations

**Review current iOS screen:**
```
User: "How does this screen look? Can you get design feedback?"
→ Take screenshot → Run review script → Present findings
```

**Review specific flow:**
```
User: "Review the meal planning UI"
→ Navigate to meal plan screens → Capture 2-3 key screens → Run review → Present findings
```

**Focused review:**
```
User: "The colors feel off on this page"
→ Take screenshot → Run review with --prompt "Focus on color palette and contrast" → Present findings
```

## Tips

- Capture screens at their natural state (with real or realistic data, not empty states unless reviewing empty states)
- Include both light and dark mode if the app supports it
- For flows, capture the most important 2-4 screens to keep API costs reasonable
- The script sends images at high detail for accurate analysis
