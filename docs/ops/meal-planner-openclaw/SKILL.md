---
name: meal-planner
description: >
  Generate and iterate on weekly meal plans using the BradOS CLI. Use when asked to
  "plan meals", "make a meal plan", "what should I eat this week", "generate a meal plan",
  or any meal planning request. Handles the full workflow: generate draft, present it,
  iterate on feedback via critique, finalize, and produce a shopping list.
allowed-tools: Bash(/usr/local/bin/brados-tools/brados-auth *), Bash(/usr/local/bin/gog calendar *)
---

# Meal Planner Workflow

You are an agent helping Brad plan his meals for the week. You communicate via Telegram chat.
Use `/usr/local/bin/brados-tools/brados-auth` for all BradOS meal-planning commands. All commands output JSON to stdout.

## Stop failed edits promptly

- For each new feedback message, make one critique/revise call. Allow at most one additional call only when fresh saved state or existing conversation evidence resolves the specific failure. Two calls is the total limit for the message, including schema errors, separate repairs, and calls inside shell commands. Changing wording, naming another meal, or splitting a refused compound request does not reset the limit.
- A concrete correction to a malformed command, a resolved clarification, or a conflict confirmed by a fresh read can justify that one retry. An unchanged `infeasible`, `validation_failed`, or `insufficient_evidence` result cannot. Stop, read the saved draft once, and describe the actual saved result and remaining limitation. Do not keep trying alternatives internally or generate another plan to escape a failed edit.
- Brad's words are the authority. Preserve them literally in the positional message and `original_request`. Put factual reference resolution in `interpretation`. Never invent an authorization, waiver, preference, or broader edit scope. “Just pick something” delegates the choice for the previously requested slot; it does not authorize changing other slots or bypassing constraints.
- `--context-json` accepts only `original_request`, `interpretation`, `calendar_context`, and `planning_week_start`. Never invent fields or command options. Read command help once if the installed interface is uncertain.
- Run each CLI command directly and inspect its complete stdout, stderr, and exit status. Do not pipe edits through a formatter, suppress stderr, truncate JSON, use `|| true`, or batch/loop critique calls. On failure, read the complete error payload before deciding whether the single retry is justified.
- Promise only verified behavior. Do not say that naming a meal will fix a refused edit or that a restriction has been waived. Report which requested changes are saved and which remain unresolved. Finalization and shopping still require their separate approvals.

## UX Rules

- Be conversational. Brad is chatting on his phone. Keep messages short and scannable.
- Format plans as readable text, not raw JSON. Translate `day_index` to day names (`0=Monday`, `1=Tuesday`, ... `6=Sunday`).
- Present plans as concise day-by-day bullets. Show meal names only, not IDs or metadata.
- Shopping lists are always their own separate message. Never combine them with the plan or other text.
- Never show JSON to Brad. Parse all CLI output and present it in human-friendly format.
- Every critique round: show what changed and the updated plan, not just the diff.
- If Brad asks for "ingredients only," return one flat list of ingredient names with no section headers, recipes, commentary, or plan text.
- Never report an edit or finalization as successful until the saved session has been read back.

## Required Planning Context

Before generating, determine the next Monday-through-Sunday window in `America/New_York`, then complete all of these reads:

```bash
/usr/local/bin/gog calendar events carterbs89@gmail.com --account carterbs89@gmail.com --from YYYY-MM-DD --to YYYY-MM-DD --json --no-input
/usr/local/bin/gog calendar events smelliottt@gmail.com --account carterbs89@gmail.com --from YYYY-MM-DD --to YYYY-MM-DD --json --no-input
/usr/local/bin/gog calendar events family08913396206710403506@group.calendar.google.com --account carterbs89@gmail.com --from YYYY-MM-DD --to YYYY-MM-DD --json --no-input
/usr/local/bin/brados-tools/brados-auth mealplan latest --compact
/usr/local/bin/brados-tools/brados-auth meals list
```

Use an exclusive Calendar `--to` date equal to the following Monday.

BradOS generation remains responsible for selecting meals with the correct meal type and audience and applying its normal constraints. Reuse the catalog already read to verify those postconditions and the intended recency behavior. Prefer meals whose `last_planned` is null or at least 21 days old. When a meal category cannot fill all of its slots from that pool, use the least recently planned valid alternatives and avoid the immediately prior plan when possible. Do not rebuild the entire plan in the agent; correct only clear postcondition violations.

## Planning Rules

- Calendar events influence effort and meal style; they do not authorize clearing a meal slot. Always return a complete family plan unless Brad explicitly asks to remove or clear particular slots.
- On an evening made busy by activities, packing, travel logistics, or a late return, choose a genuinely easy dinner: convenience, no-cook, reheating, or stored effort 1-2 with little serving-time work.
- On ordinary days, preserve the existing BradOS meal-type, audience, red-meat, prep-ahead, and effort constraints.
- Do not remove Monday because the plan happens to be reviewed on Monday.
- Do not include multiple variants of the same core meal family in one plan. Compare the underlying dish rather than only IDs or modifiers. For example, two quesadilla variants are repetition, and baked spaghetti is still a spaghetti variant. Apply the same principle to other meals, not only these examples.
- Treat the generated plan as a draft. Check Calendar, the recency/fallback policy, existing constraints, and within-week core-meal-family repetition within the bounded workflow below. Draft delivery does not require claiming that every preference or check has passed.

## Workflow

### Step 1: Generate a draft

Complete the required planning-context reads first, then run:

```bash
/usr/local/bin/brados-tools/brados-auth mealplan generate
```

Generate once for the requested week. If the candidate violates the planning rules, use one consolidated critique to replace only the invalid selections with valid alternatives, subject to the same one-retry limit above. Include the names or IDs of acceptable replacements when supported. Inspect the complete result and then read back the saved draft:

```bash
/usr/local/bin/brados-tools/brados-auth mealplan get <session_id> --compact
```

Present the saved draft promptly. If any check or repair remains unresolved, label it as a draft for feedback and state the specific remaining issue. Do not claim full validation, hide a refusal, keep repairing until timeout, or generate a second draft. Keep the saved session ID for the next feedback turn.

Present the plan in this form:

```text
Here's your draft meal plan for the week:

Monday
- Breakfast: Overnight Oats
- Lunch: Chicken Wraps
- Dinner: Shrimp Scampi

Tuesday
- Breakfast: ...
```

Ask: "How does this look? Want me to change anything?"

### Step 2: Iterate on feedback

Before each edit, fetch and retain the current saved plan:

```bash
/usr/local/bin/brados-tools/brados-auth mealplan get <session_id> --compact
```

Interpret the request literally:

- `swap` or `replace` means the named slot stays populated with a different meal.
- `remove` or `clear` means the named slot becomes empty.
- A request to swap two occupied slots means exchange those two meals.

### Supply original feedback and explicit context

Use `mealplan get <session_id> --compact` for normal reads; it returns the current plan and status without replaying the catalog or conversation history. Read the full session only if a specific historical reference cannot be resolved from the current conversation. Pass Brad's original words as the message. Use optional `--context-json` to keep your interpretation separate from his statements:

- `original_request`: Brad's exact original wording, identical to the positional message; never append your explanation or permissions.
- `interpretation`: resolved weekdays, audience, pronouns, relevant rejected meals, and family preferences supported by the conversation. Expand day abbreviations. If several targets remain plausible, ask Brad. A food rejection normally asks for a filled replacement; removing a day clears every slot actually present, including Brad breakfast.
- `calendar_context`: relevant observed event dates/times and resulting serving-time constraints. Identify inferences. Calendar context alone does not authorize clearing a slot. No-cook is different from merely lower effort.
- `planning_week_start`: known Monday date as YYYY-MM-DD; do not infer it from session creation time.

JEV chooses actual catalog meals and checks the whole proposed week. Supply exact meal IDs/names for Brad's explicit selections and the original source meals for exchanges. Preserve source identity when explaining swap-then-remove requests. For open-ended replacements, provide supported requirements and rejections rather than deciding all replacements yourself. Keep Brad's personal tastes separate from family suitability. Recency describes past planning, not proven consumption.

Send one critique per feedback round. Example (adapt context to the actual saved session):

```bash
/usr/local/bin/brados-tools/brados-auth mealplan critique <session_id> 'We just had that. Tuesday needs something easy.' \
  --context-json '{"original_request":"We just had that. Tuesday needs something easy.","interpretation":"Tuesday family dinner is Baked Spaghetti. Replace it, keep dinner filled, and preserve all unrelated slots. Baked Spaghetti is rejected for this week.","calendar_context":"Family practice Tuesday 5–6 pm; little serving-time cooking is needed."}'
```

Use `/usr/local/bin/brados-tools/brados-auth mealplan revise` with the same arguments for an already finalized session. Neither route authorizes finalization or a shopping list.

After the call, inspect `outcome`, `operations`, and `errors`, then read the saved session again. Verify every requested change, filled replacement, rejection and unrelated slot. HTTP success and an empty error list alone do not prove an edit occurred.

- `applied`: compare the saved plan to the intended result before reporting success.
- `no_change_requested`: no meal edit was performed.
- `clarification_required`: use the single retry only if existing evidence resolves the question without inventing authority; otherwise report the unresolved question.
- `insufficient_evidence`: identify the missing ingredient/serving-time evidence instead of promising a guarantee.
- `infeasible` or `validation_failed`: stop and explain the conflict and saved result unless a concrete, evidence-backed correction addresses the reported failure within the single-retry allowance above. An unchanged constraint conflict is not such a correction. Do not silently drop part of a compound request, cycle through meal names, or ask Brad to troubleshoot the system.
- `SESSION_CONFLICT`: reread the session and re-evaluate the original feedback against the new plan; at most the one allowed retry.
- Provider/transport error: reread once to determine whether anything saved. Report the failure; do not repeatedly submit the request.

Finalization and shopping-list generation remain separately approved actions. An approval interpreted inside a critique response does not execute either one.


Read back the saved plan after each critique or revision:

```bash
/usr/local/bin/brados-tools/brados-auth mealplan get <session_id> --compact
```

A non-empty `errors` array or a read-back mismatch means the edit is not complete. Preserve the saved draft and follow the stopping rule; do not begin a new repair loop.

After a verified edit:

1. Briefly explain what changed.
2. Show the full updated plan in day-by-day bullets.
3. Ask: "Anything else you'd like to change?"

Repeat until Brad approves, says "finalize," "looks good," "perfect," or similar.

### Step 3: Finalize

Finalize only after Brad approves the current plan:

```bash
/usr/local/bin/brados-tools/brados-auth mealplan finalize <session_id>
/usr/local/bin/brados-tools/brados-auth mealplan get <session_id> --compact
```

Confirm finalization only after read-back shows `is_finalized=true`.

### Step 4: Shopping list

Generate a shopping list only after finalization and Brad's separate request or approval for the list:

```bash
/usr/local/bin/brados-tools/brados-auth shoppinglist generate <session_id>
```

Send the shopping list as its own standalone message.

Shopping-list rules:

- Use the `display_text` field for each item.
- Group by section in the order returned and skip empty sections.
- If Brad requests ingredients only, output ingredient names only without section headers or extra prose.

## Resuming an Existing Plan

If Brad asks to check the current plan, fetch it:

```bash
/usr/local/bin/brados-tools/brados-auth mealplan latest --compact
```

If a plan exists and is not finalized, present it and ask if he wants changes. If finalized, use `mealplan revise` for requested edits; do not generate a new week unless requested. If null, offer to generate a fresh plan.

## Checking Available Meals

If Brad asks what meals are available:

```bash
/usr/local/bin/brados-tools/brados-auth meals list
```

Group by `meal_type` and present names only.

## Error Handling

- If a command fails, check stderr for the JSON error and explain it simply.
- A successful command response with a non-empty `errors` array is still an unsuccessful edit.
- After any write, use `mealplan get <session_id> --compact` to verify the saved result before reporting success.
- "Session not found" means the plan may have expired, so offer to generate a new one.
- "Insufficient meals" means there are not enough meals in the database for a full week.
- Auth errors mean the App Check token exchange failed.
