use std::fs;
use std::path::Path;
use std::process::Command;
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;
use std::env;
use tempfile::tempdir;

fn brad_precommit_binary() -> &'static str {
    env!("CARGO_BIN_EXE_brad-precommit")
}

fn write_fake_script(dir: &Path, name: &str, contents: &str) -> std::io::Result<()> {
    let path = dir.join(name);
    fs::write(&path, contents)?;
    let mut perms = fs::metadata(&path)?.permissions();

    #[cfg(unix)]
    {
        perms.set_mode(0o755);
        fs::set_permissions(&path, perms)?;
    }

    Ok(())
}

fn bootstrap_fake_bin(bin_dir: &Path) -> std::io::Result<()> {
    write_fake_script(
        bin_dir,
        "git",
        r#"#!/usr/bin/env sh
set -eu

if [ "$1" = "symbolic-ref" ]; then
  echo "${BRAD_FAKE_BRANCH:-unknown}"
  exit 0
fi

if [ "$1" = "rev-parse" ] && [ "$2" = "MERGE_HEAD" ]; then
  if [ "${BRAD_FAKE_MERGE_HEAD:-0}" = "1" ]; then
    exit 0
  fi
  exit 1
fi

if [ "$1" = "diff" ] && [ "$2" = "--cached" ]; then
  if [ -n "${BRAD_FAKE_STAGED_FILES-}" ]; then
    printf "%s\n" "${BRAD_FAKE_STAGED_FILES}"
  fi
  exit 0
fi

exit 1
"#,
    )?;

    write_fake_script(
        bin_dir,
        "which",
        r#"#!/usr/bin/env sh
if [ "$1" = "gitleaks" ]; then
  if [ "${BRAD_FAKE_HAS_GITLEAKS:-0}" = "1" ]; then
    exit 0
  fi
  exit 1
fi

command -v "$1" >/dev/null 2>&1
"#,
    )?;

    write_fake_script(
        bin_dir,
        "gitleaks",
        r#"#!/usr/bin/env sh
exit "${BRAD_FAKE_GITLEAKS_EXIT:-0}"
"#,
    )?;

    write_fake_script(
        bin_dir,
        "npm",
        r#"#!/usr/bin/env sh
if [ "$1" = "run" ] && [ "$2" = "validate" ]; then
  capture_file="${BRAD_FAKE_NPM_INVOCATION_FILE}"
  {
    echo "invoked=1"
    [ -n "${BRAD_VALIDATE_TEST_FILES+x}" ] && echo "files_set=true" || echo "files_set=false"
    [ -n "${BRAD_VALIDATE_TEST_PROJECTS+x}" ] && echo "projects_set=true" || echo "projects_set=false"
    echo "files=${BRAD_VALIDATE_TEST_FILES-}"
    echo "projects=${BRAD_VALIDATE_TEST_PROJECTS-}"
  } > "$capture_file"
  exit "${BRAD_FAKE_NPM_VALIDATE_EXIT:-0}"
fi

exit 1
"#,
    )?;

    Ok(())
}

fn run_precommit(
    fake_bin: &Path,
    env_overrides: &[(&str, &str)],
    working_dir: &Path,
    timing_file: &Path,
    npm_capture_file: &Path,
) -> (String, String, i32) {
    let mut cmd = Command::new(brad_precommit_binary());

    let original_path = env::var("PATH").unwrap_or_default();
    let fake_path = format!("{}:{}", fake_bin.display(), original_path);
    cmd.current_dir(working_dir);
    cmd.env("PATH", fake_path);
    cmd.env("PRE_COMMIT_TIMING_FILE", timing_file);
    cmd.env("BRAD_FAKE_NPM_INVOCATION_FILE", npm_capture_file);

    for (k, v) in env_overrides {
        cmd.env(k, v);
    }
    let output = cmd.output().expect("failed to run brad-precommit");

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let code = output.status.code().unwrap_or(1);
    (stdout, stderr, code)
}

fn timing_record(path: &Path) -> String {
    fs::read_to_string(path)
        .expect("should read timing file")
        .lines()
        .next()
        .unwrap_or("")
        .to_string()
}

fn assert_timing_mode(record: &str, expected: &str) {
    assert!(
        record.contains(&format!("\"mode\":\"{}\"", expected)),
        "timing mode should be {expected}"
    );
}

fn assert_timing_exit_code(record: &str, expected: i32) {
    assert!(
        record.contains(&format!("\"exit_code\":{}", expected)),
        "timing should contain expected exit_code={expected}"
    );
}

#[test]
fn contract_precommit_blocks_direct_main_commits() {
    let dir = tempdir().expect("failed to create fixture dir");
    let fake_bin = dir.path().join("fake-bin");
    fs::create_dir(&fake_bin).expect("failed to create fake bin dir");
    bootstrap_fake_bin(&fake_bin).expect("failed to create fake binaries");

    let timing_file = dir.path().join("timing.jsonl");
    let invocation = dir.path().join("npm-invocation.log");
    let (_stdout, stderr, code) = run_precommit(
        &fake_bin,
        &[
            ("BRAD_FAKE_BRANCH", "main"),
            ("BRAD_FAKE_MERGE_HEAD", "0"),
            ("BRAD_FAKE_STAGED_FILES", "packages/functions/src/services/foo.ts"),
            ("BRAD_FAKE_HAS_GITLEAKS", "1"),
            ("BRAD_FAKE_GITLEAKS_EXIT", "0"),
        ],
        dir.path(),
        &timing_file,
        &invocation,
    );

    assert_eq!(code, 1);
    assert!(
        stderr.contains("ERROR: Direct commits to main are not allowed."),
        "should show main branch block message"
    );
    assert!(!invocation.exists(), "validate should not run for branch gate failures");
    let record = timing_record(&timing_file);
    assert_timing_mode(&record, "full");
    assert_timing_exit_code(&record, 1);
    assert!(
        !stderr.contains("All pre-commit checks passed."),
        "main-branch gate should fail before success summary"
    );
}

#[test]
fn contract_precommit_reports_missing_gitleaks() {
    let dir = tempdir().expect("failed to create fixture dir");
    let fake_bin = dir.path().join("fake-bin");
    fs::create_dir(&fake_bin).expect("failed to create fake bin dir");
    bootstrap_fake_bin(&fake_bin).expect("failed to create fake binaries");

    let timing_file = dir.path().join("timing.jsonl");
    let invocation = dir.path().join("npm-invocation.log");
    let (_stdout, stderr, code) = run_precommit(
        &fake_bin,
        &[
            ("BRAD_FAKE_BRANCH", "feature/alpha"),
            ("BRAD_FAKE_STAGED_FILES", "packages/functions/src/services/foo.ts"),
            ("BRAD_FAKE_HAS_GITLEAKS", "0"),
            ("BRAD_FAKE_GITLEAKS_EXIT", "0"),
        ],
        dir.path(),
        &timing_file,
        &invocation,
    );

    assert_eq!(code, 1);
    assert!(
        stderr.contains("gitleaks not installed. Install with: brew install gitleaks"),
        "should surface missing gitleaks error"
    );
    assert!(!invocation.exists(), "validation should not run when gitleaks missing");
    let record = timing_record(&timing_file);
    assert_timing_mode(&record, "full");
    assert_timing_exit_code(&record, 1);
    assert!(
        record.contains("\"validate_status\":\"not_run\""),
        "validation should be marked not_run when gitleaks missing"
    );
}

#[test]
fn contract_precommit_runs_full_validation_when_no_staged_files() {
    let dir = tempdir().expect("failed to create fixture dir");
    let fake_bin = dir.path().join("fake-bin");
    fs::create_dir(&fake_bin).expect("failed to create fake bin dir");
    bootstrap_fake_bin(&fake_bin).expect("failed to create fake binaries");

    let timing_file = dir.path().join("timing.jsonl");
    let invocation = dir.path().join("npm-invocation.log");
    let (_stdout, stderr, code) = run_precommit(
        &fake_bin,
        &[
            ("BRAD_FAKE_BRANCH", "feature/alpha"),
            ("BRAD_FAKE_STAGED_FILES", ""),
            ("BRAD_FAKE_HAS_GITLEAKS", "1"),
            ("BRAD_FAKE_GITLEAKS_EXIT", "0"),
            ("BRAD_FAKE_NPM_VALIDATE_EXIT", "0"),
        ],
        dir.path(),
        &timing_file,
        &invocation,
    );

    assert_eq!(code, 0);
    assert!(
        stderr.contains("No staged files found; running full validation."),
        "should use full_no_staged mode"
    );
    assert!(
        stderr.contains("All pre-commit checks passed."),
        "successful full validation should report pass"
    );
    assert!(
        stderr.contains("All pre-commit checks passed."),
        "successful full validation should report pass"
    );
    let invocation_output = fs::read_to_string(&invocation).expect("npm invocation should be captured");
    assert!(invocation_output.contains("invoked=1"));
    assert!(invocation_output.contains("files_set=false"));
    assert!(invocation_output.contains("projects_set=false"));
    let record = timing_record(&timing_file);
    assert_timing_mode(&record, "full_no_staged");
    assert_timing_exit_code(&record, 0);
    assert!(
        record.contains("\"validate_status\":\"success\""),
        "validation should succeed in full_no_staged mode"
    );
}

#[test]
fn contract_precommit_routes_scoped_files_to_targeted_validation() {
    let dir = tempdir().expect("failed to create fixture dir");
    let fake_bin = dir.path().join("fake-bin");
    fs::create_dir(&fake_bin).expect("failed to create fake bin dir");
    bootstrap_fake_bin(&fake_bin).expect("failed to create fake binaries");

    let timing_file = dir.path().join("timing.jsonl");
    let invocation = dir.path().join("npm-invocation.log");
    let (_stdout, stderr, code) = run_precommit(
        &fake_bin,
        &[
            ("BRAD_FAKE_BRANCH", "feature/alpha"),
            ("BRAD_FAKE_STAGED_FILES", "packages/functions/src/services/foo.test.ts"),
            ("BRAD_FAKE_HAS_GITLEAKS", "1"),
            ("BRAD_FAKE_GITLEAKS_EXIT", "0"),
            ("BRAD_FAKE_NPM_VALIDATE_EXIT", "0"),
        ],
        dir.path(),
        &timing_file,
        &invocation,
    );

    assert_eq!(code, 0);
    assert!(
        stderr.contains("Running targeted quality checks..."),
        "should enter scoped validation mode"
    );
    assert!(
        stderr.contains("Tests: packages/functions/src/services/foo.test.ts"),
        "scoped test file should be passed through"
    );
    assert!(
        stderr.contains("All pre-commit checks passed."),
        "successful scoped validation should report pass"
    );
    let invocation_output = fs::read_to_string(&invocation).expect("npm invocation should be captured");
    assert!(invocation_output.contains("invoked=1"));
    assert!(invocation_output.contains("files_set=true"));
    assert!(invocation_output.contains("files=packages/functions/src/services/foo.test.ts"));
    let record = timing_record(&timing_file);
    assert_timing_mode(&record, "scoped");
    assert_timing_exit_code(&record, 0);
    assert!(
        record.contains("\"targeted_test_file_count\":1"),
        "scoped mode should report one targeted test file"
    );
}

#[test]
fn contract_precommit_falls_back_to_full_validation_for_unknown_scopes() {
    let dir = tempdir().expect("failed to create fixture dir");
    let fake_bin = dir.path().join("fake-bin");
    fs::create_dir(&fake_bin).expect("failed to create fake bin dir");
    bootstrap_fake_bin(&fake_bin).expect("failed to create fake binaries");

    let timing_file = dir.path().join("timing.jsonl");
    let invocation = dir.path().join("npm-invocation.log");
    let (_stdout, stderr, code) = run_precommit(
        &fake_bin,
        &[
            ("BRAD_FAKE_BRANCH", "feature/alpha"),
            ("BRAD_FAKE_STAGED_FILES", "README.md"),
            ("BRAD_FAKE_HAS_GITLEAKS", "1"),
            ("BRAD_FAKE_GITLEAKS_EXIT", "0"),
            ("BRAD_FAKE_NPM_VALIDATE_EXIT", "0"),
        ],
        dir.path(),
        &timing_file,
        &invocation,
    );

    assert_eq!(code, 0);
    assert!(
        stderr.contains("Running full validation (no safe scoped path found)."),
        "unknown file scope should trigger fallback"
    );
    assert!(
        stderr.contains("All pre-commit checks passed."),
        "successful fallback validation should report pass"
    );
    let invocation_output = fs::read_to_string(&invocation).expect("npm invocation should be captured");
    assert!(invocation_output.contains("invoked=1"));
    assert!(invocation_output.contains("files_set=false"));
    assert!(invocation_output.contains("projects_set=false"));
    let record = timing_record(&timing_file);
    assert_timing_mode(&record, "full_fallback");
    assert_timing_exit_code(&record, 0);
}

#[test]
fn timing_jsonl_schema_is_stable() {
    let dir = tempdir().expect("failed to create fixture dir");
    let fake_bin = dir.path().join("fake-bin");
    fs::create_dir(&fake_bin).expect("failed to create fake bin dir");
    bootstrap_fake_bin(&fake_bin).expect("failed to create fake binaries");

    let timing_file = dir.path().join("timing.jsonl");
    let invocation = dir.path().join("npm-invocation.log");
    let _ = run_precommit(
        &fake_bin,
        &[
            ("BRAD_FAKE_BRANCH", "feature/alpha"),
            ("BRAD_FAKE_STAGED_FILES", ""),
            ("BRAD_FAKE_HAS_GITLEAKS", "1"),
            ("BRAD_FAKE_GITLEAKS_EXIT", "0"),
            ("BRAD_FAKE_NPM_VALIDATE_EXIT", "0"),
        ],
        dir.path(),
        &timing_file,
        &invocation,
    );

    let record = timing_record(&timing_file);
    let expected_order = [
        "\"timestamp\"",
        "\"branch\"",
        "\"mode\"",
        "\"staged_files\"",
        "\"exit_code\"",
        "\"hook_ms\"",
        "\"gitleaks_ms\"",
        "\"validate_ms\"",
        "\"validate_status\"",
        "\"targeted_test_file_count\"",
        "\"targeted_test_project_count\"",
    ];

    let mut previous = 0usize;
    for field in &expected_order {
        let index = record
            .find(field)
            .unwrap_or_else(|| panic!("timing schema missing field {field}"));
        assert!(
            index >= previous,
            "timing fields should preserve stable order; {field} should appear after prior fields"
        );
        previous = index;
    }
}
