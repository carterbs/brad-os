---
date: 2026-02-24
researcher: codex
git_commit: 49d365d7ee64d2790e2759f4bc80f9c0f9b76b74
branch: harness-improvement-integration
topic: Why harness worktrees accumulated as completed-but-unmerged, and prevention changes
tags: [ralph, harness, merge-conflicts, backlog]
status: complete
---

# Research Question

Which `scripts/ralph/index.ts` behaviors allowed completed worktrees to pile up unmerged, and what change best reduces repeat incidents?

# Summary

The core issue was not just merge conflicts; it was retry behavior. When a worker finished implementation but its merge to `main` failed, the task remained in `scripts/ralph/backlog.md`, so the orchestrator could schedule the same task again and generate duplicate branches/worktrees.

The second amplifier was a volatile shared tracked file (`thoughts/shared/plans/active/ralph-improvement.md`) edited by many branches. This significantly increased conflict probability. Removing it from git tracking eliminates a dominant conflict source.

Implemented mitigation: on merge conflict, move the task out of the active backlog into `scripts/ralph/merge-conflicts.md` and preserve branch/worktree metadata for manual follow-up. This keeps progress moving without blind duplicate retries.

# Detailed Findings

## Shortcoming 1: Merge Conflict Kept Task in Active Backlog

In the main orchestration loop, failed merges only removed the task from `tasksInFlight`, not from `backlog.md`. This enabled repeated scheduling of completed-but-unmerged tasks.

## Shortcoming 2: Same Gap in Remaining-Workers Drain Path

The post-loop worker-drain merge path handled successful merges but did not have equivalent conflict-task parking behavior. Conflicted completed tasks could still linger in active backlog state.

## Shortcoming 3: High-Churn Shared Plan File Was Tracked

Branches repeatedly edited `thoughts/shared/plans/active/ralph-improvement.md`, creating recurring merge conflicts across otherwise compatible changes.

# Code References

| File | Lines | Description |
|------|-------|-------------|
| `scripts/ralph/index.ts` | 584-596 | New helper to park merge-conflicted tasks |
| `scripts/ralph/index.ts` | 712-718 | Main-loop merge-failure path now parks tasks and logs location |
| `scripts/ralph/index.ts` | 759-763 | Remaining-workers merge-failure path now parks tasks too |
| `scripts/ralph/backlog.ts` | 59-86 | New `moveTaskToMergeConflicts` function to remove from active backlog and append conflict entry |
| `.gitignore` | (appended) | Ignores `thoughts/shared/plans/active/ralph-improvement.md` |

# Architecture Insights

The orchestrator intentionally separates implementation from merge (`MergeQueue`), but backlog progression was gated only on successful merge. Without a “blocked task” lane, conflicts naturally caused rework loops. A conflict parking queue creates explicit triage state and prevents duplicate autonomous attempts.

# Historical Context

Observed harness branches (`019`, `020`, `022`, etc.) showed overlap and repeated intent with merge conflicts concentrated on the tracked active plan file. Integrating these branches confirmed the conflict pattern and guided this mitigation.

# Open Questions

- Should the orchestrator eventually support auto-rebase/auto-merge retries before parking tasks?
- Should `merge-conflicts.md` be integrated into reporting summaries and CLI output with explicit “human action required” counts?
