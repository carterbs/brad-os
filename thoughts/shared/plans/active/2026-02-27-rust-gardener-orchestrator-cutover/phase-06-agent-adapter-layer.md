## Phase 6: Agent Adapter Layer (Claude/Codex, Pluggable)
Context: [Vision](./00-gardener-vision.md) | [Shared Foundation](./01-shared-foundation.md)
### Changes Required
- Add adapter trait:
  - `tools/gardener/src/agent/mod.rs`
  - `tools/gardener/src/agent/claude.rs`
  - `tools/gardener/src/agent/codex.rs`
  - `tools/gardener/src/agent/factory.rs`
  - `tools/gardener/src/protocol.rs`.
- Shared interface for non-interactive command launch, execution-profile config, streamed tool events, and step result normalization.
- Claude adapter contract:
  - spawn Claude Code binary (`claude`) from Rust (no SDK runtime dependency)
  - support non-interactive prompt execution and stream parsing.
  - required V1 invocation: `claude -p --model <model>` with prompt via stdin.
  - optional flags (`--max-turns`, permission flags) only enabled when startup capability probe confirms support.
- Codex adapter contract:
  - required V1 invocation: `codex exec --json --dangerously-bypass-approvals-and-sandbox --model <model> -C <cwd> -o <output_file> -`.
  - parse stdout JSONL events and output-file final text fallback.
- Add adapter capability probe module used by both adapters:
  - run `<bin> --help` and optional `--version`
  - persist accepted templates and supported flags to `.cache/gardener/adapter-capabilities.json`
  - fail fast when configured backend cannot satisfy required V1 template.
  - include stdin prompt compatibility probe and record output-mode expectations.
- V1 execution policy:
  - run both adapters in permissive mode to avoid permission/sandbox debugging during cutover.
  - defer sandbox hardening to post-cutover phase.
- Standardize prompt input/output schema contract per worker state.
- Implement cancellation contract: worker cancel signal must terminate child process within bounded timeout.
- Include `worker_id`/`session_id`/`sandbox_id` in adapter runtime context.
- Include prompt metadata in adapter runtime context:
  - `prompt_version`
  - `context_manifest_hash`
  - `knowledge_refs`.
- Translate adapter stream output into typed internal protocol events before orchestrator dispatch.
- Add plugin registration map so adding a third binary is a small incremental change.
- Replace Phase 3 legacy seed runner:
  - migrate `legacy_seed_runner_v1` to use shared adapter trait/factory,
  - delete direct CLI-only path after migration,
  - re-run Phase 3 gate coverage assertions post-refactor.

### Success Criteria
- Both backends pass identical contract tests for success/failure/timeout/hang.
- Capability probe is test-covered for supported/unsupported flag matrices.
- Claude adapter behavior is contract-tested for plain-text output + JSON-envelope extraction (no required `--output-format` dependency).
- Placeholder/invalid model values are rejected at startup with actionable error before worker launch.
- Tool-call events normalize into common event schema.
- Cancellation behavior is deterministic and test-covered.
- Adapter output parsing rejects malformed payloads with typed errors.
- Internal protocol translation is versioned and test-covered for both adapters.
- Prompt metadata is propagated end-to-end and visible in event logs for audit/replay.
- Claude adapter executes via Claude Code binary (no SDK dependency).
- V1 permissive execution mode is configurable and active for both adapters.

### Phase Validation Gate (Mandatory)
- Run: `cargo test -p gardener --all-targets`
- Run: `cargo llvm-cov -p gardener --all-targets --summary-only` (must report 100.00% lines for current `tools/gardener/src/**` code at this phase).
- Run E2E binary smoke:
  - `scripts/brad-gardener --target 1 --config tools/gardener/tests/fixtures/configs/phase06-codex.toml`
  - `scripts/brad-gardener --target 1 --config tools/gardener/tests/fixtures/configs/phase06-claude.toml`.

### Autonomous Completion Rule
- Continue directly to the next phase only after all success criteria and this phase validation gate pass.
- Do not wait for manual approval checkpoints.
