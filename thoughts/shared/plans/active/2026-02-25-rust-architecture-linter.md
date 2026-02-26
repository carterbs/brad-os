# Rust Architecture Linter

## Overview

Port the architecture linter from TypeScript (`scripts/lint-checks.ts` + `scripts/lint-architecture.ts` + `scripts/rewrite-utils.ts`, ~3,600 LOC) to a Rust CLI binary at `tools/arch-lint/`. Drop-in replacement: same checks, same output format, same exit codes. Target: <1s execution (currently 9s).

## Current State

**Source files:**
- `scripts/lint-checks.ts` (2,042 lines) — 22 check functions + helpers
- `scripts/lint-architecture.ts` (143 lines) — CLI runner
- `scripts/rewrite-utils.ts` (95 lines) — Firebase rewrite derivation
- `scripts/lint-architecture.test.ts` (1,340 lines) — 22 describe blocks, temp-dir fixtures

**Integration points:**
- `scripts/validate.sh:34` — `npx tsx scripts/lint-architecture.ts > .validate/architecture.log 2>&1`
- `package.json:39` — `"lint:architecture": "tsx scripts/lint-architecture.ts"`
- `hooks/pre-commit:47` — runs `npm run validate` which includes architecture
- `.github/workflows/ci.yml:32` — `npm run validate`
- `scripts/generate-firebase-rewrites.ts` — imports from `rewrite-utils.ts` independently (not part of linter)

**Contract:**
- Input: `LinterConfig { rootDir: string, functionsSrc: string }` — both derived from binary location
- Output: colored terminal output with `✓`/`✗` per check, violations indented, summary line
- Exit code: 0 = all pass, 1 = any fail
- Warnings (quality grades freshness) are non-blocking

**Why the current version is slow (~9s):**
- `npx tsx` startup: 2-4s (npx resolution + esbuild TS transpilation)
- Synchronous `fs.readFileSync` + `fs.readdirSync`: 2-3s (no parallelism, hundreds of files)
- Per-iteration `new RegExp(...)` compilation: 1-2s
- Actual logic: <0.5s

## Desired End State

- `tools/arch-lint/` — Rust binary, Cargo workspace member
- `validate.sh:34` calls `./tools/arch-lint/target/release/arch-lint` (or a wrapper script)
- All 22 checks produce identical pass/fail results as the TypeScript version
- Execution: <200ms (50-100x speedup)
- `scripts/lint-checks.ts`, `scripts/lint-architecture.ts`, `scripts/lint-architecture.test.ts` deleted
- `scripts/rewrite-utils.ts` kept (used by `generate-firebase-rewrites.ts` independently)
- Rust integration tests with temp-dir fixtures covering all 22 checks

## What We're NOT Doing

- Not adding new checks — 1:1 port of existing 22 checks
- Not changing violation message text — output must be identical for downstream log parsing
- Not touching `generate-firebase-rewrites.ts` or its `rewrite-utils.ts` dependency
- Not adding a config file (TOML/JSON) — config is derived from binary location, same as today
- Not adding `--watch` mode or incremental checking (future enhancement)

## Key Discoveries

- `checkFirebaseRoutes` accepts an optional `manifestOverride` parameter for testing (`lint-checks.ts:602`). The Rust version needs the same injection seam.
- The manifest parser (`lint-checks.ts:90-221`) is a hand-rolled character-by-character TS parser handling quotes, escapes, comments, and bracket depth. In Rust, same approach with `regex` for field extraction.
- `checkQualityGradesFreshness` returns `{ stale: bool, message: String }` not `CheckResult` — it's a warning-only check called separately (`lint-architecture.ts:114`).
- `checkOrphanFeatures` has a hardcoded `handlerToFeature` map (`lint-checks.ts:1019-1043`). This must be ported verbatim.
- Test file uses string concatenation to avoid self-detection (e.g., `"it" + ".skip(...)"`) — Rust tests won't have this problem since the linter scans `.ts` files, not `.rs` files.
- `generate-firebase-rewrites.ts` imports from `rewrite-utils.ts` — that file must be kept even after deleting the TS linter files. The Rust binary re-implements the rewrite logic internally.

## Dependencies

```toml
[dependencies]
clap = { version = "4", features = ["derive"] }
owo-colors = { version = "4", features = ["supports-colors"] }
ignore = "0.4"
regex = "1"
serde = { version = "1", features = ["derive"] }
serde_json = "1"

[dev-dependencies]
tempfile = "3"
```

## Implementation Approach

The binary is structured as:
```
tools/arch-lint/
├── Cargo.toml
├── src/
│   ├── main.rs           # clap parse → run checks → print → exit code
│   ├── lib.rs             # pub fn run_all_checks(config) -> Vec<CheckResult>
│   ├── config.rs          # LinterConfig, derived from cwd or --root-dir arg
│   ├── checks/
│   │   ├── mod.rs         # Check trait + CheckResult struct
│   │   ├── layer_deps.rs
│   │   ├── schema_boundary.rs
│   │   ├── type_dedup.rs
│   │   ├── firebase_routes.rs
│   │   ├── ios_layers.rs
│   │   ├── arch_map_refs.rs
│   │   ├── claude_md_refs.rs
│   │   ├── orphan_features.rs
│   │   ├── plan_lifecycle.rs
│   │   ├── no_console_log.rs
│   │   ├── no_raw_urlsession.rs
│   │   ├── types_in_types_dir.rs
│   │   ├── schemas_in_schemas_dir.rs
│   │   ├── no_skipped_tests.rs
│   │   ├── untested_high_risk.rs
│   │   ├── test_factory_usage.rs
│   │   ├── no_inline_api_response.rs
│   │   ├── no_focused_tests.rs
│   │   ├── test_quality.rs
│   │   ├── quality_grades_freshness.rs
│   │   ├── repository_test_coverage.rs
│   │   ├── markdown_links.rs
│   │   └── no_archive_dirs.rs
│   ├── manifest.rs        # EndpointEntry type + manifest parser
│   ├── rewrite_utils.rs   # to_pascal_case, generate_rewrites, compare_rewrites
│   ├── walker.rs          # Shared file collection utilities
│   └── reporter.rs        # Colored output matching current format exactly
└── tests/
    └── integration/
        ├── helpers.rs
        ├── layer_deps.rs
        ├── schema_boundary.rs
        ├── ...             # One test file per check
        └── firebase_routes.rs
```

---

## Phase 1: Scaffold and Infrastructure

### Overview
Set up the Rust project, core types, CLI parsing, reporter, and file walker utilities. End with a binary that compiles and runs zero checks but produces the correct output frame.

### Changes

**Create `Cargo.toml` at repo root:**
```toml
[workspace]
members = ["tools/arch-lint"]
```

**Create `tools/arch-lint/Cargo.toml`** with dependencies listed above.

**Create `tools/arch-lint/src/main.rs`:**
- Parse CLI args with clap: `--root-dir` (optional, defaults to discovering repo root)
- Call `lib::run_all_checks(config)`
- Print results via `reporter::print_results()`
- Exit 0 or 1

**Create `tools/arch-lint/src/config.rs`:**
- `LinterConfig { root_dir: PathBuf, functions_src: PathBuf }`
- `LinterConfig::from_root(root: &Path)` — sets `functions_src` to `root/packages/functions/src`
- Default: walk up from cwd to find `.git` directory (repo root detection)

**Create `tools/arch-lint/src/checks/mod.rs`:**
```rust
pub struct CheckResult {
    pub name: String,
    pub passed: bool,
    pub violations: Vec<String>,
}

// Quality grades freshness has different return type
pub struct FreshnessResult {
    pub stale: bool,
    pub message: String,
}
```

**Create `tools/arch-lint/src/reporter.rs`:**
- `print_results()` — iterate results, print `✓ name: clean` or `✗ name: N violation(s)` with indented violations
- `print_freshness_warning()` — yellow warning for stale quality grades
- `print_summary()` — `All N/N checks passed.` or `M/N check(s) failed with V total violation(s).`
- Use `owo-colors` with `supports-colors` for TTY detection
- Output must be character-identical to the TypeScript version (same symbols, same spacing)

**Create `tools/arch-lint/src/walker.rs`:**
- `collect_files(dir, extension, skip_dirs) -> Vec<PathBuf>` — recursive file collector
- `collect_ts_files(dir) -> Vec<PathBuf>` — TS files excluding tests
- `collect_test_files(dir) -> Vec<PathBuf>` — `.test.ts` and `.spec.ts` files
- `collect_swift_files(dir) -> Vec<PathBuf>` — Swift files
- `collect_markdown_files(dir) -> Vec<PathBuf>` — Markdown files
- Uses `ignore` crate for gitignore-aware walking where appropriate

**Create `tools/arch-lint/src/lib.rs`:**
- `pub fn run_all_checks(config: &LinterConfig) -> (Vec<CheckResult>, FreshnessResult)`
- Calls all 22 checks in order, collects results
- Returns results + freshness for reporter

### Success Criteria
- `cargo build -p arch-lint` compiles with no warnings
- `cargo run -p arch-lint` prints the output frame with 0 checks and exits 0
- Reporter output format matches TypeScript version character-for-character (test with a hardcoded dummy result)

### Confirmation Gate
Build, run, visually confirm output format matches.

---

## Phase 2: Port Simple File/Pattern Checks (12 checks)

### Overview
Port the checks that are simple filesystem operations — stat files, grep for patterns, validate paths. These share common patterns: walk a directory, read each file, match a regex per line, emit violations.

### Checks in this phase

| # | Check | Core operation | Source ref |
|---|-------|---------------|-----------|
| 9 | Plan lifecycle | `readdir` plans root, reject `.md` not in allowlist | `lint-checks.ts:1105-1131` |
| 22 | No archive dirs | Recursive walk, match dir names `archive`/`archives` | `lint-checks.ts:2008-2041` |
| 6 | Arch map refs | Parse backtick paths in `docs/architecture/*.md`, `fs.existsSync` | `lint-checks.ts:875-920` |
| 7 | AGENTS.md refs | Parse backtick paths in `AGENTS.md`, skip code fences/templates/wildcards | `lint-checks.ts:929-989` |
| 21 | Markdown links | Parse `[text](target)` in docs + root `.md` files, verify targets | `lint-checks.ts:1851-1999` |
| 10 | No console.log | Walk `functionsSrc`, regex `console.(log|warn|error|info)` | `lint-checks.ts:1139-1193` |
| 11 | No raw URLSession | Walk iOS app dir, regex `\bURLSession\b`, allowlist | `lint-checks.ts:1236-1297` |
| 12 | Types in types/ | Scan `services/`, `handlers/`, `repositories/` for `export interface/type` | `lint-checks.ts:1306-1359` |
| 13 | Schemas in schemas/ | Scan same dirs for `z.object(`, `z.string(`, etc. | `lint-checks.ts:1368-1417` |
| 14 | No skipped tests | Walk all test files, regex `it.skip|describe.skip|...` | `lint-checks.ts:1425-1474` |
| 18 | No focused tests | Walk all test files, regex `it.only|describe.only|...` | `lint-checks.ts:1632-1681` |
| W | Quality grades freshness | Read `docs/quality-grades.md`, parse date, check <7 days | `lint-checks.ts:1202-1228` |

### Changes

Create one `.rs` file per check in `tools/arch-lint/src/checks/`. Each file exports a single `pub fn check(config: &LinterConfig) -> CheckResult`.

Key implementation notes:
- **Regex patterns** compiled as `static LazyLock<Regex>` — never inside loops
- **Markdown link parser** (`markdown_links.rs`): must handle code fences, inline code, fragments, optional titles — port the exact logic from `lint-checks.ts:1912-1977`
- **AGENTS.md refs** (`claude_md_refs.rs`): must skip code fences, template vars `<word>`, wildcards `*`
- **Violation messages**: copy-paste the exact multi-line violation strings from TS. The `\n    ` indentation, the `Rule:`, `Fix:`, `Example:`, `See:` structure — all must be identical.

### Success Criteria
- All 12 checks produce identical results when run against the real repo
- `cargo test` passes for all 12 checks with temp-dir fixtures
- Spot-check 3 violation messages against TypeScript output for character-identical match

### Confirmation Gate
Run Rust binary on the real repo, diff output against `npx tsx scripts/lint-architecture.ts` for these 12 checks.

---

## Phase 3: Port Import/Code Analysis Checks (5 checks)

### Overview
Port checks that analyze code structure — parsing imports, discovering types, scanning for code patterns across multiple files.

### Checks in this phase

| # | Check | Core operation | Source ref |
|---|-------|---------------|-----------|
| 1 | Layer deps | Parse TS imports, resolve to layers, check against allowed map | `lint-checks.ts:304-418` |
| 2 | Schema boundary | Parse `app.post/put/patch()` routes, check for `validate(` or `.safeParse(` | `lint-checks.ts:424-501` |
| 3 | Type dedup | Find `export interface/type` across all TS files, flag duplicates | `lint-checks.ts:508-594` |
| 5 | iOS layers | Discover `class`/`actor` names in Services/ViewModels, check Views/Components for references | `lint-checks.ts:704-867` |
| 19 | Test quality | Detect empty test bodies (single+multi-line) and assertion-free test files | `lint-checks.ts:1690-1790` |

### Changes

**`checks/layer_deps.rs`:**
- Port `ALLOWED_IMPORTS` map: `types → ∅, schemas → {types}, repos → {types,schemas}, ...`
- `parse_imports(content)` — regex for `import ... from '...'` and `require('...')`
- `resolve_import_layer(specifier, source_file, src_dir)` — resolve relative path, extract top-level dir
- Walk `functionsSrc`, check each non-test `.ts` file

**`checks/schema_boundary.rs`:**
- Port `ACTION_SUFFIXES` list
- Regex for `app.(post|put|patch)('route'` — extract method + route + block boundaries
- Check for `validate(`, `.safeParse(`, `createResourceRouter` in route block

**`checks/type_dedup.rs`:**
- Walk all `.ts` files, collect `export interface Foo` / `export type Foo =` locations
- Filter out re-exports (`export { ... } from`)
- Flag types defined in >1 unique file

**`checks/ios_layers.rs`:**
- `discover_class_types(dir, include_actors)` — scan top-level `.swift` files for `class`/`actor` declarations
- `first_preview_line(content)` — find `#Preview` or `_Previews:` boundary
- Rule 1: Views must not reference Service class/actor names (skip preview section, comments, Mock prefixes)
- Rule 2: Components must not reference ViewModel class names

**`checks/test_quality.rs`:**
- Category A: empty test bodies — single-line `it('...', () => {})` and multi-line `it('...', () => {\n});`
- Category B: assertion-free files — count `it(`/`test(` vs `expect(` occurrences

### Success Criteria
- All 5 checks produce identical results on the real repo
- Layer deps correctly resolves relative imports with `.js` extensions
- iOS layers correctly skips preview sections and Mock-prefixed types
- `cargo test` with temp-dir fixtures passes

### Confirmation Gate
Run full Rust binary on real repo. All 17 checks (12 from Phase 2 + 5 from Phase 3) produce identical output to TypeScript.

---

## Phase 4: Port Firebase Integration Checks (3 checks)

### Overview
Port the most complex check (`checkFirebaseRoutes`) and its dependencies: the endpoint manifest parser, rewrite derivation logic, and the orphan features check.

### Checks in this phase

| # | Check | Core operation | Source ref |
|---|-------|---------------|-----------|
| 4 | Firebase routes | Parse manifest, derive function names/rewrites, verify firebase.json + index.ts | `lint-checks.ts:600-693` |
| 8 | Orphan features | Hardcoded handler→feature map, verify architecture docs exist | `lint-checks.ts:998-1096` |

### Changes

**`manifest.rs`:**
- Port `EndpointEntry` struct: `route_path, handler_file, options, dev_only, function_stem, custom_source`
- Port `extract_manifest_array_text(text)` — character-by-character bracket/quote/comment tracker (`lint-checks.ts:90-171`)
- Port `parse_manifest_array(text)` — regex extraction of fields from `{...}` blocks
- `read_manifest_from_disk(config)` — read `endpoint-manifest.ts`, return entries + violations

**`rewrite_utils.rs`:**
- `to_pascal_case(s)`, `to_camel_case(s)`, `get_function_stem(entry)`, `get_app_export_name(entry)`
- `get_dev_function_name(entry)`, `get_prod_function_name(entry)`
- `generate_rewrites(manifest) -> Vec<FirebaseRewrite>`
- `compare_rewrites(expected, actual) -> Vec<String>`

**`checks/firebase_routes.rs`:**
- Sub-check A: handler files exist
- Sub-check B: `get_handler_route_value(path)` — regex for `createBaseApp('...')`, `createResourceRouter({resourceName: '...'})`, `stripPathPrefix('...')`
- Sub-check C: generate expected rewrites, compare with `firebase.json` actual rewrites
- Sub-check D: verify index.ts has correct imports and exports for each manifest entry
- Accept optional manifest override for testing (same injection seam as TS version)

**`checks/orphan_features.rs`:**
- Port `HANDLER_TO_FEATURE` map verbatim from `lint-checks.ts:1019-1043`
- Walk handlers, check for Express route definitions, verify feature mapping + architecture doc existence

### Success Criteria
- Firebase routes check produces identical results on real repo
- Manifest parser correctly handles the `mealplan-debug` special case (empty routePath, customSource, devOnly, functionStem)
- Rewrite comparison catches missing, extra, and misordered rewrites
- Orphan features flags unmapped handlers

### Confirmation Gate
Run full binary — all 19 checks match TypeScript output.

---

## Phase 5: Port Remaining Test Coverage Checks (3 checks)

### Overview
Port the final 3 test-related checks.

### Checks in this phase

| # | Check | Core operation | Source ref |
|---|-------|---------------|-----------|
| 15 | Untested high-risk | Check handlers/services matching AI/coach patterns have test files | `lint-checks.ts:1483-1529` |
| 16 | Test factory usage | Detect inline `createMock*/createTest*` in test files without `__tests__/utils` import | `lint-checks.ts:1538-1577` |
| 17 | No inline ApiResponse | Detect `interface ApiResponse` in test files | `lint-checks.ts:1586-1621` |
| 20 | Repository test coverage | Every `*.repository.ts` (except allowlist) has `*.repository.test.ts` | `lint-checks.ts:1799-1842` |

### Changes

Create `checks/untested_high_risk.rs`, `checks/test_factory_usage.rs`, `checks/no_inline_api_response.rs`, `checks/repository_test_coverage.rs`.

All are straightforward: walk directory, check file existence or match regex pattern.

### Success Criteria
- All 22 checks produce identical results on real repo
- Full `cargo test` passes

### Confirmation Gate
Run final full comparison: `cargo run -p arch-lint 2>&1` vs `npx tsx scripts/lint-architecture.ts 2>&1`. Diff should be empty.

---

## Phase 6: Integration, Cutover, and Cleanup

### Overview
Wire the Rust binary into the build system, write the build wrapper, add CI caching, delete the TypeScript linter files.

### Changes

**Create `scripts/arch-lint` wrapper script:**
```bash
#!/usr/bin/env bash
set -e
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BINARY="$REPO_ROOT/tools/arch-lint/target/release/arch-lint"
if [ ! -f "$BINARY" ] || [ "$REPO_ROOT/tools/arch-lint/src" -nt "$BINARY" ]; then
  cargo build -p arch-lint --release --manifest-path "$REPO_ROOT/Cargo.toml" -q
fi
exec "$BINARY" "$@"
```

**Update `scripts/validate.sh:34`:**
```bash
architecture) bash scripts/arch-lint > "$LOG_DIR/architecture.log" 2>&1 || rc=$? ;;
```

**Update `package.json:39`:**
```json
"lint:architecture": "bash scripts/arch-lint"
```

**Update `.github/workflows/ci.yml`:**
- Add Rust toolchain setup step (uses `dtolnay/rust-toolchain@stable`)
- Add cargo build cache step (uses `Swatinem/rust-cache@v2` with `workspaces: tools/arch-lint`)
- The `npm run validate` command continues to work unchanged

**Add to `.gitignore`:**
```
tools/arch-lint/target/
```

**Delete TypeScript linter files:**
- `scripts/lint-checks.ts`
- `scripts/lint-architecture.ts`
- `scripts/lint-architecture.test.ts`
- `.arch-lint-tmp/` (compiled TS artifacts)
- `tmp-lint/` (compiled TS artifacts)

**Keep:**
- `scripts/rewrite-utils.ts` — still used by `scripts/generate-firebase-rewrites.ts`

**Update `AGENTS.md`:**
- Change architecture linter references from `scripts/lint-architecture.ts` to `tools/arch-lint/`
- Add `tools/arch-lint/` to Key Directories table

### Success Criteria
- `npm run validate` passes end-to-end (all 4 checks including Rust architecture linter)
- `npm run lint:architecture` runs the Rust binary and produces correct output
- Pre-commit hook passes
- CI workflow passes (Rust toolchain installed, binary cached, validate succeeds)
- Architecture linter completes in <1s (measure with `time`)
- No TypeScript linter artifacts remain (except `rewrite-utils.ts`)

### Confirmation Gate
Full `npm run validate` pass. `time npm run lint:architecture` shows <1s. CI green.

---

## Testing Strategy

**Unit tests (Rust):**
- Each check module has `#[cfg(test)] mod tests` with temp-dir fixtures using the `tempfile` crate
- Port all 22 describe blocks from `scripts/lint-architecture.test.ts` — same fixture structures, same assertions
- Rewrite utils: unit tests for `to_pascal_case`, `to_camel_case`, `generate_rewrites`, `compare_rewrites`
- Manifest parser: test against the actual `endpoint-manifest.ts` content

**Integration test:**
- Golden output test: run binary on the real repo, snapshot the output, compare on subsequent runs
- Exit code test: create a temp repo with a known violation, assert exit code 1

**Manual verification:**
- Side-by-side comparison: run both TS and Rust versions on the real repo, diff output
- Performance: `time` both versions, confirm >10x speedup

## References

- Current TypeScript linter: `scripts/lint-checks.ts`, `scripts/lint-architecture.ts`, `scripts/rewrite-utils.ts`
- Test suite: `scripts/lint-architecture.test.ts` (1,340 lines, 22 describe blocks)
- Integration: `scripts/validate.sh:34`, `package.json:39`, `hooks/pre-commit:47`, `.github/workflows/ci.yml:32`
- Rust crate choices: clap 4 (CLI), owo-colors 4 (color), ignore 0.4 (walking), regex 1 (patterns), serde_json 1 (firebase.json)
- Architecture reference: `cargo-deny` for rule-pipeline structure
