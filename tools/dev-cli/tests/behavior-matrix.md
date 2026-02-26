# Behavior Matrix — Rust Validate/Pre-commit Migration Contracts

## Contract IDs

### `validate-001` — Quick mode
- Scope: `tools/dev-cli/tests/validate_contract.rs`
- Assert: `--quick` runs only `typecheck` and `lint`, and skips `test` and `architecture`.

### `validate-002` — Full mode
- Scope: `tools/dev-cli/tests/validate_contract.rs`
- Assert: default invocation runs `typecheck`, `lint`, `test`, and `architecture`.

### `validate-003` — Log directory contract
- Scope: `tools/dev-cli/tests/validate_contract.rs`
- Assert: `.validate/` is created and per-check log files are emitted.

### `validate-004` — Parse newline input
- Scope: `tools/dev-cli/src/bin/validate.rs`
- Assert: newline-delimited `BRAD_VALIDATE_TEST_FILES`/`BRAD_VALIDATE_TEST_PROJECTS` values are parsed into command args.

### `precommit-001` — Main-branch direct commit block
- Scope: `tools/dev-cli/tests/precommit_contract.rs`
- Assert: direct commit on `main`/`master` is blocked and timing mode remains `full`.

### `precommit-002` — Missing gitleaks block
- Scope: `tools/dev-cli/tests/precommit_contract.rs`
- Assert: missing `gitleaks` exits non-zero, blocks validation, and keeps `validate_status: not_run`.

### `precommit-003` — No staged files
- Scope: `tools/dev-cli/tests/precommit_contract.rs`
- Assert: zero staged files routes to full validation via mode `full_no_staged`.

### `precommit-004` — Scoped validation routing
- Scope: `tools/dev-cli/tests/precommit_contract.rs`
- Assert: changed functions/scripts files generate targeted test file/project sets and mode `scoped`.

### `precommit-005` — Unknown scope fallback
- Scope: `tools/dev-cli/tests/precommit_contract.rs`
- Assert: unknown staged paths force full fallback mode `full_fallback`.

### `precommit-006` — Timing schema/order stability
- Scope: `tools/dev-cli/tests/precommit_contract.rs`
- Assert: timing JSONL record contains all fields in stable order.
