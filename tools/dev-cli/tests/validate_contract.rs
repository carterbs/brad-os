use std::path::Path;
use std::process::Command;

fn brad_validate_binary() -> &'static str {
    env!("CARGO_BIN_EXE_brad-validate")
}

fn run_validate(args: &[&str]) -> (String, String, i32) {
    let output = Command::new(brad_validate_binary())
        .args(args)
        .output()
        .expect("failed to run brad-validate");

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let code = output.status.code().unwrap_or(1);
    (stdout, stderr, code)
}

#[test]
fn quick_mode_runs_only_typecheck_and_lint() {
    let (stdout, _, code) = run_validate(&["--quick"]);
    assert!(
        stdout.contains("typecheck"),
        "expected typecheck in output"
    );
    assert!(stdout.contains("lint"), "expected lint in output");
    assert!(
        !stdout.contains("test ") && !stdout.contains("architecture"),
        "quick mode should not run test or architecture"
    );
    // exit code depends on check results; just verify the mode is respected
    assert!(code == 0 || code == 1);
}

#[test]
fn full_mode_runs_all_checks() {
    let (stdout, _, code) = run_validate(&[]);
    assert!(
        stdout.contains("typecheck"),
        "expected typecheck in output"
    );
    assert!(stdout.contains("lint"), "expected lint in output");
    assert!(
        stdout.contains("test"),
        "full mode should include test check"
    );
    assert!(
        stdout.contains("architecture"),
        "full mode should include architecture check"
    );
    assert!(code == 0 || code == 1);
}

#[test]
fn creates_validate_log_directory() {
    let log_dir = Path::new(".validate");
    let _ = run_validate(&["--quick"]);
    assert!(log_dir.exists(), ".validate/ directory should exist");
    assert!(
        log_dir.join("typecheck.log").exists(),
        ".validate/typecheck.log should exist"
    );
    assert!(
        log_dir.join("lint.log").exists(),
        ".validate/lint.log should exist"
    );
}

#[test]
fn output_contains_pass_or_fail() {
    let (stdout, _, _) = run_validate(&["--quick"]);
    assert!(
        stdout.contains("PASS") || stdout.contains("FAIL"),
        "output should contain PASS or FAIL"
    );
}
