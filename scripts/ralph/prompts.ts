export function buildPlanPrompt(n: number, target: number): string {
  return `You are planning harness improvement #${n} of ${target} for the brad-os project.
Your job is ONLY to research and write a plan — do NOT implement anything. Do NOT create
or modify any source files. Your only output is thoughts/shared/plans/active/ralph-improvement.md.

Steps:
1. Read docs/references/codex-agent-team-article.md to understand the philosophy.
2. Read CLAUDE.md and docs/conventions/ to understand the project rules and structure.
3. Read docs/ for architecture context.
4. Scan the codebase thoroughly for gaps: what harness/tooling/infrastructure is missing?
   "Harness" means: test infrastructure, CI tooling, linters, architecture
   enforcement, dev-loop scaffolding, evaluation harnesses, or observability
   integrations that make the codebase more legible to agents.
5. Pick the single highest-leverage improvement not yet implemented.
6. Write a detailed implementation plan to thoughts/shared/plans/active/ralph-improvement.md in the current directory.

thoughts/shared/plans/active/ralph-improvement.md must contain:
- **Title**: One-line description of the improvement
- **Why**: Why this is the highest-leverage improvement right now
- **What**: Exactly what to build, with specifics (not vague hand-waving)
- **Files**: Every file to create or modify, with what goes in each
- **Tests**: What tests to write and what they verify
- **QA**: How to exercise the thing after building it (not just "run tests")
- **Conventions**: Any project conventions from CLAUDE.md/docs that apply

The plan should be detailed enough that a separate agent can implement it without
needing to re-research the codebase. Include file paths, function signatures,
and concrete examples where helpful.

After writing thoughts/shared/plans/active/ralph-improvement.md, output the title line as: PLAN: <title>`;
}

export function buildImplPrompt(): string {
  return `You are implementing a harness improvement for the brad-os project.

YOUR FIRST STEP: Read thoughts/shared/plans/active/ralph-improvement.md in the current directory. This contains a detailed
implementation plan written by a planning agent. Implement exactly what it describes.

Do NOT re-research or second-guess the plan. The planning agent already surveyed the
codebase and picked the highest-leverage improvement. Your job is to execute the plan
faithfully, with high quality.

Implementation:
- Read thoughts/shared/plans/active/ralph-improvement.md thoroughly before writing any code.
- Follow the file list, function signatures, and test plan in thoughts/shared/plans/active/ralph-improvement.md.
- Read CLAUDE.md and docs/conventions/ for project rules.
- Write tests as specified in the plan.
- Do NOT modify application product code unless thoughts/shared/plans/active/ralph-improvement.md says to.

Constraints:
- Follow all rules in CLAUDE.md exactly.
- 100% test coverage on new utilities.
- Keep changes focused on what thoughts/shared/plans/active/ralph-improvement.md describes.
- Run and pass: npm run typecheck && npm run lint && npm test
- Do NOT push to any remote. Do NOT run git push. Everything stays local.

QA (MANDATORY — do not skip this):
- After implementation, you MUST actually exercise what you built. Do not just
  run tests and declare victory.
- thoughts/shared/plans/active/ralph-improvement.md has a QA section — follow it.
- If you built a script: run it and verify it produces correct output.
- If you built a linter: run it against the codebase and show it catches violations.
- If you built a test utility: use it in a test and show it works end-to-end.
- If you built an exporter/integration: run it and verify it connects/outputs data.
- Whatever you built, RUN THE THING and verify it works in practice, not just in theory.

When done, output a one-line summary starting with "DONE:" describing the improvement.`;
}

export function buildReviewPrompt(): string {
  return `You are an independent reviewer. Review the changes in this worktree against main.

Context: Read docs/references/codex-agent-team-article.md to understand the philosophy.
This is the review step of the Ralph Wiggum Loop. Your job is to ensure the improvement
is high-leverage harness work that increases agent velocity — not product code changes
or low-value busywork.

IMPORTANT: Do NOT push to any remote. Do NOT run git push. Everything stays local.

Steps:
1. Run: git diff main --stat   (see scope of changes)
2. Run: git diff main           (read every changed line)
3. Read CLAUDE.md and docs/conventions/ for project rules.
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
     Run the script/linter/tool/integration yourself and verify real output.
6. If you find issues, fix them directly in the files and re-run validations.
7. When satisfied AND you've verified it works by running it, output exactly: REVIEW_PASSED
   If unfixable issues remain, output: REVIEW_FAILED followed by explanation.`;
}
