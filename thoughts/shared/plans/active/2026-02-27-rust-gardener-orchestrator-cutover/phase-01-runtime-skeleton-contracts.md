## Phase 1: Runtime Skeleton + Contracts
Context: [Vision](./00-gardener-vision.md) | [Shared Foundation](./01-shared-foundation.md)
### Changes Required
- Add a dedicated crate:
  - `tools/gardener/Cargo.toml`
  - `tools/gardener/src/main.rs`
  - `tools/gardener/src/lib.rs`
  - `tools/gardener/src/config.rs`
  - `tools/gardener/src/types.rs`
  - `tools/gardener/src/errors.rs`
- Add workspace wiring:
  - root `Cargo.toml` adds `tools/gardener` member.
- Add compatibility wrapper script:
  - `scripts/brad-gardener` (thin delegate only).
- Wire package script:
  - `package.json` (`gardener:run` -> wrapper/binary).
- Define CLI contract for:
  - `--config <path>`
  - `--working-dir <path>` (scope Gardener to repo root or subdirectory)
  - `--parallelism <n>`
  - `--task <text>`
  - `--target <n>`
  - `--prune-only`
  - `--backlog-only`
  - `--quality-grades-only`
  - `--validation-command <cmd>` (override repo/profile default).
- Implement config precedence contract:
  - defaults -> config file -> CLI flags.
- Implement working-directory resolution contract:
  - CLI `--working-dir` overrides config `scope.working_dir`.
  - if neither is set and cwd is inside a git repo, default to repo root.
  - otherwise default to process cwd.
- Establish DI seams in Phase 1 (not deferred):
  - `Clock` trait (`now()`, `sleep_until()`).
  - `ProcessRunner` trait (spawn/wait/kill, stdout/stderr capture).
  - `FileSystem` trait (read/write/mkdir/remove/exists).
  - `Terminal` trait (TTY detection + draw/write).
  - production implementations in `src/runtime/*`, deterministic fakes in tests.
- Establish test/mocking strategy in Phase 1:
  - `FakeClock`, `FakeFileSystem`, `FakeProcessRunner`, `FakeTerminal` shipped with the crate test support.
  - error-path testing uses injected fakes (not OS fault injection) for deterministic branch coverage.
  - coverage tool for this plan is `cargo llvm-cov` (single source of truth).
- Add explicit config fields for scheduler/prompt/learning defaults required by later phases.
- Add shared parsing primitive used by multiple phases:
  - `tools/gardener/src/output_envelope.rs` (JSON envelope marker extraction + schema validation).
- Add fixture bootstrap for validation gates:
  - create `tools/gardener/tests/fixtures/configs/phase01-minimal.toml`
  - create `tools/gardener/tests/fixtures/repos/scoped-app/` fixture repo subtree.
  - create all phase config fixture files listed in `99-testing-rollout-references.md` (may start as minimal valid stubs, expanded by each phase).

### Success Criteria
- `brad-gardener --help` exposes required CLI options.
- Config parsing supports per-state agent+model mapping and merge settings.
- Config precedence is test-covered and deterministic.
- Working-directory precedence and fallback resolution are test-covered and deterministic.
- CLI exposes quality-grade refresh mode for deterministic one-shot generation.
- Validation command resolution is explicit and portable (`validation.command` + CLI override + optional auto-discovery).
- Startup validation gate is configurable (`startup.validate_on_boot` + `startup.validation_command`).
- No orchestration logic exists in shell.
- DI traits are present and used by startup/scheduler entry points.
- Shared output-envelope parser is implemented and reused by startup seeding + FSM paths.
- Config parser covers operational defaults (lease/heartbeat/starvation/token budgets/decay/seeding backend).
- Scoped mode is supported (`--working-dir` subdirectory) without breaking repo-level git/gh behavior.
- Test support fakes exist and are used in first module tests.

### Phase Validation Gate (Mandatory)
- Run: `cargo test -p gardener --all-targets`
- Run: `cargo llvm-cov -p gardener --all-targets --summary-only` (must report 100.00% lines for current `tools/gardener/src/**` code at this phase).
- Run E2E binary smoke: `scripts/brad-gardener --help` and `scripts/brad-gardener --prune-only --config tools/gardener/tests/fixtures/configs/phase01-minimal.toml`.
- Run E2E binary smoke: `scripts/brad-gardener --working-dir tools/gardener/tests/fixtures/repos/scoped-app/packages/functions/src --prune-only --config tools/gardener/tests/fixtures/configs/phase01-minimal.toml`.

### Autonomous Completion Rule
- Continue directly to the next phase only after all success criteria and this phase validation gate pass.
- Do not wait for manual approval checkpoints.
