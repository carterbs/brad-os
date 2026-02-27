## Phase 3: Startup Audits (Quality Grades, Worktrees, PRs, Backlog Seeding)
Context: [Vision](./00-gardener-vision.md) | [Shared Foundation](./01-shared-foundation.md)
### Changes Required
- Add startup audit module:
  - `tools/gardener/src/startup.rs`
  - `tools/gardener/src/quality_grades.rs`
  - `tools/gardener/src/quality_domain_catalog.rs`
  - `tools/gardener/src/quality_evidence.rs`
  - `tools/gardener/src/quality_scoring.rs`
  - `tools/gardener/src/worktree_audit.rs`
  - `tools/gardener/src/pr_audit.rs`
  - `tools/gardener/src/seeding.rs`
  - `tools/gardener/src/seed_runner.rs` (temporary direct CLI runner adapter used only until Phase 6).
- Startup sequence:
  1. Verify configured quality-grade output document path (`quality_report.path`).
  2. If missing or stale, run Gardener-integrated quality-grade generation:
     - discover repository domains via deterministic detector order and domain definition contract from shared foundation
     - map code/test/docs artifacts into discovered domains within the effective working directory scope
     - compute per-domain grade + evidence sections using the numeric scoring rubric from shared foundation
     - write configured quality-grade document deterministically.
     - apply staleness policy from config (`quality_report.stale_after_days`, `quality_report.stale_if_head_commit_differs`).
  3. During cutover only, fallback to legacy repo-defined refresh command if integrated generator is unavailable; emit `P0` migration task.
  4. If quality-grade generation still fails, enqueue/execute `P0` infra task with diagnostics.
  5. Reconcile hanging worktrees (stale leases, missing paths, merged branches, detached leftovers).
  6. Ingest open/unmerged PR signals (`gh pr list`/`gh pr view`).
  7. If `startup.validate_on_boot=true`, run configured startup validation command (`startup.validation_command`) and enqueue `P0` recovery task when red.
  8. Seed backlog via dedicated seeding runner:
     - invoke direct `codex exec` startup path (Phase 3-owned) using `seeding.backend`/`seeding.model`
     - provide quality-grade evidence, conventions, architecture summaries, and codex-agent principles
     - require high-level, right-sized tasks with rationale and expected validation signal
     - persist input context + output tasks for audit and reproducibility analysis.
     - parse output via shared `output_envelope` parser introduced in Phase 1.
     - enforce strict seeding response schema (`tasks[]`) and min/max task count contract.
     - mark this path as `legacy_seed_runner_v1`; Phase 6 must replace it with shared adapter trait and remove legacy path.
- Implement event-driven startup dispatch gate with precedence:
  - resumable assigned tasks
  - ready backlog tasks
  - pending external signals (PR/update deltas)
  - idle watch loop with escalation threshold.
- Add startup reconciliation observer that can close/recover stranded task state independently of worker runtime.
- Implement startup reconciliation and PR-upsert exactly per shared-foundation normative rules (worktree/task mismatch handling, PR keyed upsert, self-heal vs halt conditions).
- Produce startup health summary event:
  - quality-grades status
  - stale worktrees found/fixed
  - PR collisions found/fixed
  - backlog counts by priority.

### Success Criteria
- Startup can recover from stale/hanging worktrees without deadlock.
- Missing quality grades path is handled deterministically.
- Stale-threshold detection is deterministic and config-driven (age + head-sha policy).
- Quality-grade generation covers all discovered domains with deterministic grading output.
- Domain discovery and artifact mapping are explicit, drift-detected, and repository-agnostic.
- Scoped working-directory mode limits discovery/scoring/seeding to the configured subtree.
- Quality score mapping from evidence to grade is deterministic and reproducible across runs.
- Empty backlog seeding is agent-driven, auditable, and produces right-sized high-level tasks.
- Phase 3 seeding works before Phase 6 by using the direct startup runner path.
- Startup validation gate (when enabled) uses configured command resolution, not a hardcoded repo script.
- Startup health summary is emitted and persisted to JSONL.
- Startup dispatch precedence is deterministic and test-proven.
- Startup reconciliation can repair stranded task state before worker launch.

### Phase Validation Gate (Mandatory)
- Run: `cargo test -p gardener --all-targets`
- Run: `cargo llvm-cov -p gardener --all-targets --summary-only` (must report 100.00% lines for current `tools/gardener/src/**` code at this phase).
- Run E2E binary smoke: `scripts/brad-gardener --quality-grades-only --config tools/gardener/tests/fixtures/configs/phase03-startup-seeding.toml` and `scripts/brad-gardener --backlog-only --config tools/gardener/tests/fixtures/configs/phase03-startup-seeding.toml`.
- Run E2E binary smoke: `scripts/brad-gardener --working-dir tools/gardener/tests/fixtures/repos/scoped-app/packages/functions/src --quality-grades-only --config tools/gardener/tests/fixtures/configs/phase03-startup-seeding.toml` and `scripts/brad-gardener --working-dir tools/gardener/tests/fixtures/repos/scoped-app/packages/functions/src --backlog-only --config tools/gardener/tests/fixtures/configs/phase03-startup-seeding.toml`.

### Autonomous Completion Rule
- Continue directly to the next phase only after all success criteria and this phase validation gate pass.
- Do not wait for manual approval checkpoints.
