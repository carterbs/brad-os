export function buildBacklogRefillPrompt(): string {
  return `You are generating a prioritized backlog of 10 improvement tasks for the brad-os project.
Your job is ONLY to research the codebase and produce a list of tasks — do NOT implement anything.

## Two categories of work

1. **Quality grade improvements** — work that directly raises domain grades in docs/quality-grades.md.
   This includes: adding missing tests for untested handlers/services, improving test coverage
   for low-coverage domains, adding iOS unit tests where there are none, and closing tracked
   tech debt items listed in the quality grades doc.

2. **Harness/tooling improvements** — test infrastructure, CI tooling, linters, architecture
   enforcement, dev-loop scaffolding, evaluation harnesses, or observability integrations
   that make the codebase more legible to agents.

## Prioritization

Order tasks by **effort vs. impact**. Low-hanging fruit comes first:
- A quick test file that bumps a domain from B to B+ beats a complex new linter.
- Missing tests for existing handlers are usually easy wins with high grade impact.
- Quality grade improvements should come AHEAD of harness improvements when the effort is similar.

## Steps
1. Read docs/quality-grades.md to understand current grades, gaps, and tech debt.
2. Read AGENTS.md and docs/conventions/ to understand the project rules and structure.
3. Read docs/references/codex-agent-team-article.md to understand the harness philosophy.
4. Read docs/ for architecture context.
5. Scan the codebase for untested files, low-coverage domains, and harness gaps.
6. Produce 10 tasks ordered by effort/impact ratio (easiest high-impact tasks first).
7. For temporary \`typescript-eslint\` suppression cleanup, emit one task per currently suppressed rule.
   Do not emit generic duplicate suppression-cleanup tasks (for example, avoid umbrella
   "re-enable temporary \`typescript-eslint\` suppressions" tasks).

## Output format

Write the result to scripts/ralph/backlog.md in the current directory. The format is one task
per line, each prefixed with "- ". Each task should be a concise but specific description
(1-2 sentences) — enough for a planning agent to understand what to build without re-scanning
the entire codebase.

Example format:
- Add unit tests for the todayCoach handler and todayCoachService (Today domain, currently B — untested high-risk handler)
- Add iOS unit tests for CyclingViewModel and CyclingService (Cycling domain, currently B- — zero iOS tests)
- Create an architecture lint rule that enforces iOS ViewModels never import SwiftUI directly

Do NOT include tasks that duplicate existing work. Check what already exists before proposing.

After writing scripts/ralph/backlog.md, output: BACKLOG: 10 tasks written`;
}

export function buildTaskPlanPrompt(task: string): string {
  return `You are planning an implementation for the brad-os project.
Your job is ONLY to write a plan — do NOT implement anything. Do NOT create
or modify any source files except thoughts/shared/plans/active/ralph-improvement.md.

The task has already been chosen for you. Do NOT re-evaluate whether this is the right
task or look for alternatives. Just plan HOW to implement it.

## Task
${task}

## Steps
1. Read AGENTS.md and docs/conventions/ to understand the project rules and structure.
2. Read relevant docs/ and source files to understand the area this task touches.
3. Write a detailed implementation plan to thoughts/shared/plans/active/ralph-improvement.md.

thoughts/shared/plans/active/ralph-improvement.md must contain:
- **Title**: One-line PR-ready title using conventional commits format (e.g. "test: add schema validation for cycling domain", "refactor: extract shared Firestore mock utilities"). Use one of: feat, fix, chore, refactor, test, docs, ci, perf. No placeholders like "X", "update", or "something"
- **Why**: Why this improvement matters (brief — the task is already decided)
- **What**: Exactly what to build, with specifics (not vague hand-waving)
- **Files**: Every file to create or modify, with what goes in each
- **Tests**: What tests to write and what they verify
- **QA**: How to exercise the thing after building it (not just "run tests")
- **Conventions**: Any project conventions from AGENTS.md/docs that apply

The plan should be detailed enough that a separate agent can implement it without
needing to re-research the codebase. Include file paths, function signatures,
and concrete examples where helpful.

After writing thoughts/shared/plans/active/ralph-improvement.md, output the title line as: PLAN: <title>`;
}

export function buildPlanPrompt(n: number, target: number): string {
  return `You are planning harness improvement #${n} of ${target} for the brad-os project.
Your job is ONLY to research and write a plan — do NOT implement anything. Do NOT create
or modify any source files. Your only output is thoughts/shared/plans/active/ralph-improvement.md.

Steps:
1. Read docs/references/codex-agent-team-article.md to understand the philosophy.
2. Read AGENTS.md and docs/conventions/ to understand the project rules and structure.
3. Read docs/ for architecture context.
4. Scan the codebase thoroughly for gaps: what harness/tooling/infrastructure is missing?
   "Harness" means: test infrastructure, CI tooling, linters, architecture
   enforcement, dev-loop scaffolding, evaluation harnesses, or observability
   integrations that make the codebase more legible to agents.
5. Pick the single highest-leverage improvement not yet implemented.
6. Write a detailed implementation plan to thoughts/shared/plans/active/ralph-improvement.md in the current directory.

thoughts/shared/plans/active/ralph-improvement.md must contain:
- **Title**: One-line PR-ready title using conventional commits format (e.g. "test: add schema validation for cycling domain", "refactor: extract shared Firestore mock utilities"). Use one of: feat, fix, chore, refactor, test, docs, ci, perf. No placeholders like "X", "update", or "something"
- **Why**: Why this is the highest-leverage improvement right now
- **What**: Exactly what to build, with specifics (not vague hand-waving)
- **Files**: Every file to create or modify, with what goes in each
- **Tests**: What tests to write and what they verify
- **QA**: How to exercise the thing after building it (not just "run tests")
- **Conventions**: Any project conventions from AGENTS.md/docs that apply

The plan should be detailed enough that a separate agent can implement it without
needing to re-research the codebase. Include file paths, function signatures,
and concrete examples where helpful.

After writing thoughts/shared/plans/active/ralph-improvement.md, output the title line as: PLAN: <title>`;
}

const DEFAULT_PLAN_DOC_PATH = "thoughts/shared/plans/active/ralph-improvement.md";

export function buildImplPrompt(planDocPath = DEFAULT_PLAN_DOC_PATH): string {
  return `You are implementing a harness improvement for the brad-os project.

YOUR FIRST STEP: Read ${planDocPath} in the current directory. This contains a detailed
implementation plan written by a planning agent. Implement exactly what it describes.

Do NOT re-research or second-guess the plan. The planning agent already surveyed the
codebase and picked the highest-leverage improvement. Your job is to execute the plan
faithfully, with high quality.

Implementation:
- Read ${planDocPath} thoroughly before writing any code.
- Follow the file list, function signatures, and test plan in ${planDocPath}.
- Read AGENTS.md and docs/conventions/ for project rules.
- Write tests as specified in the plan.
- Do NOT modify application product code unless ${planDocPath} says to.

Constraints:
- Follow all rules in AGENTS.md exactly.
- 100% test coverage on new utilities.
- Keep changes focused on what ${planDocPath} describes.
- Never modify scripts/ralph/backlog.md (main-managed; only updated after merge on main).
- Run and pass: npm run typecheck && npm run lint && npm test
- Do NOT push to any remote. Push is handled by the orchestrator.

QA (MANDATORY — do not skip this):
- After implementation, you MUST actually exercise what you built. Do not just
  run tests and declare victory.
- ${planDocPath} has a QA section — follow it.
- If you built a script: run it and verify it produces correct output.
- If you built a linter: run it against the codebase and show it catches violations.
- If you built a test utility: use it in a test and show it works end-to-end.
- If you built an exporter/integration: run it and verify it connects/outputs data.
- Whatever you built, RUN THE THING and verify it works in practice, not just in theory.

When done, output a one-line summary starting with "DONE:" describing the improvement.`;
}

export function buildMergeConflictResolvePrompt(task: string): string {
  return `You are resolving a merge-conflict triage task for the brad-os project.

## Task
${task}

This is NOT a normal feature implementation. Do not create a new plan.
Focus only on making the existing branch merge cleanly to main.

Workflow:
1. Confirm current branch/worktree state with git status.
2. Merge latest main into the current branch.
3. If conflicts appear, resolve them carefully in conflicted files only.
4. Keep behavior from both sides where appropriate; avoid unrelated refactors.
5. Ensure no conflict markers remain.
6. Run validation in this worktree: npm run typecheck && npm run lint && npm test

Constraints:
- Do NOT modify scripts/ralph/backlog.md.
- Do NOT push to remote.
- Keep changes minimal and conflict-focused.

When done, output a one-line summary starting with "DONE:" describing what you resolved.`;
}

export function buildOutstandingPrMergePrompt(
  task: string,
  prNumber: number,
  branchName: string,
): string {
  return `You are handling an outstanding Ralph PR triage task for the brad-os project.

## Task
${task}

## Objective
Take existing PR #${prNumber} on branch ${branchName} and make it mergeable with main.
This is NOT feature work. Do not create a plan and do not run the review loop.

Workflow:
1. Confirm branch state with: git status && git branch --show-current
2. Fetch latest main: git fetch origin main
3. Rebase current branch onto origin/main.
4. If conflicts appear, resolve them carefully in conflicted files only.
5. Keep both sides' behavior where appropriate; avoid unrelated refactors.
6. Ensure no conflict markers remain.
7. Run validation in this worktree: npm run typecheck && npm run lint && npm test

Constraints:
- Do NOT modify scripts/ralph/backlog.md.
- Keep changes minimal and mergeability-focused.

When done, output a one-line summary starting with "DONE:" describing what was done to make PR #${prNumber} mergeable.`;
}

export function buildAgentMergePrompt(
  prNumber: number,
  branchName: string,
): string {
  return `You are handling the final merge step for Ralph.

Branch: ${branchName}
PR: #${prNumber}

Goal: merge this PR safely and verify it is actually merged.

Workflow:
1. Confirm branch + working tree state.
2. Ensure latest main is integrated (rebase or merge from origin/main if needed).
3. Push branch to origin.
   - Decide the safest push strategy based on branch state.
   - If non-fast-forward is expected due to rebase, use --force-with-lease.
4. Merge PR #${prNumber} with gh CLI.
5. Verify merge with:
   gh pr view ${prNumber} --json state,mergedAt,mergeable,mergeStateStatus
6. If merge state is not MERGED with mergedAt set, explain why and stop.

Constraints:
- Keep changes strictly merge-related.
- Do NOT modify scripts/ralph/backlog.md.

When complete, output one line starting with "MERGED:" and include the final PR state summary.`;
}

export function buildFixPrompt(
  reviewOutput: string,
  planDocPath = DEFAULT_PLAN_DOC_PATH,
): string {
  // Truncate review output to avoid blowing up the prompt
  const maxLen = 4000;
  const truncated =
    reviewOutput.length > maxLen
      ? reviewOutput.slice(0, maxLen) + "\n... (truncated)"
      : reviewOutput;

  return `You are fixing issues found by a reviewer in the brad-os project.

YOUR FIRST STEP: Read ${planDocPath} in the current directory for the original plan.

A reviewer found the following issues with the implementation. Fix them.

## Review findings
${truncated}

## Instructions
- Read AGENTS.md and docs/conventions/ for project rules.
- Fix ONLY the issues described above. Do not refactor or add unrelated changes.
- Never modify scripts/ralph/backlog.md (main-managed; only updated after merge on main).
- Run and pass: npm run typecheck && npm run lint && npm test
- Do NOT push to any remote. Push is handled by the orchestrator.

When done, output a one-line summary starting with "FIXED:" describing what you changed.`;
}

export function buildReviewPrompt(
  prNumber: number,
  prUrl: string,
  cycle: number,
  maxCycles: number,
): string {
  return `You are an independent reviewer. Review GitHub PR #${prNumber}.

Context: Read docs/references/codex-agent-team-article.md to understand the philosophy.
This is the review step of the Ralph Wiggum Loop. Your job is to ensure the improvement
is high-leverage harness work that increases agent velocity — not product code changes
or low-value busywork.

PR URL: ${prUrl}
Review cycle: ${cycle}/${maxCycles}

IMPORTANT: Do NOT modify any files in this review step.
IMPORTANT: Do NOT push to any remote.
IMPORTANT: Do NOT modify scripts/ralph/backlog.md (main-managed; only updated after merge on main).
IMPORTANT: Do NOT use Playwright MCP to review the PR.

Steps:
1. Run: gh pr view ${prNumber} --comments
2. Run: gh pr diff ${prNumber}
3. Read AGENTS.md and docs/conventions/ for project rules.
4. Run: npm run typecheck && npm run lint && npm test
5. Evaluate:
   - Correctness: Does the code do what it claims?
   - Tests: Are new utilities fully tested? Are tests meaningful?
   - Conventions: Naming, file structure, no \`any\`, explicit return types?
   - Architecture: Layer dependencies respected? No product code modified unnecessarily?
   - Leverage: Does this improvement actually increase agent velocity? Is it the kind
     of harness/tooling work that compounds — linters, test infrastructure, architecture
     enforcement, observability, dev-loop scaffolding?
   - QA: Was the thing actually run? Don't trust that tests alone prove it works.
6. If issues exist, output exactly:
   REVIEW_FAILED
   <concise actionable findings>
7. If no issues exist, output exactly:
   REVIEW_PASSED`;
}
