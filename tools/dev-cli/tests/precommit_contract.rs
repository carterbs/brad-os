use std::fs;
use std::path::Path;
use std::process::Command;

fn brad_precommit_binary() -> &'static str {
    env!("CARGO_BIN_EXE_brad-precommit")
}

fn run_precommit(env: &[(&str, &str)]) -> (String, String, i32) {
    let mut cmd = Command::new(brad_precommit_binary());
    for (k, v) in env {
        cmd.env(k, v);
    }
    let output = cmd.output().expect("failed to run brad-precommit");

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let code = output.status.code().unwrap_or(1);
    (stdout, stderr, code)
}

#[test]
fn writes_timing_jsonl() {
    let timing_file = ".cache/pre-commit-timings-test.jsonl";
    let _ = fs::remove_file(timing_file);

    let _ = run_precommit(&[("PRE_COMMIT_TIMING_FILE", timing_file)]);

    let path = Path::new(timing_file);
    assert!(path.exists(), "timing file should be created");

    let content = fs::read_to_string(path).expect("should read timing file");
    assert!(
        content.contains("\"timestamp\""),
        "timing should contain timestamp"
    );
    assert!(
        content.contains("\"branch\""),
        "timing should contain branch"
    );
    assert!(
        content.contains("\"mode\""),
        "timing should contain mode"
    );
    assert!(
        content.contains("\"staged_files\""),
        "timing should contain staged_files"
    );
    assert!(
        content.contains("\"exit_code\""),
        "timing should contain exit_code"
    );
    assert!(
        content.contains("\"hook_ms\""),
        "timing should contain hook_ms"
    );
    assert!(
        content.contains("\"gitleaks_ms\""),
        "timing should contain gitleaks_ms"
    );
    assert!(
        content.contains("\"validate_ms\""),
        "timing should contain validate_ms"
    );
    assert!(
        content.contains("\"validate_status\""),
        "timing should contain validate_status"
    );
    assert!(
        content.contains("\"targeted_test_file_count\""),
        "timing should contain targeted_test_file_count"
    );
    assert!(
        content.contains("\"targeted_test_project_count\""),
        "timing should contain targeted_test_project_count"
    );

    // Clean up
    let _ = fs::remove_file(timing_file);
}

#[test]
fn timing_jsonl_has_valid_mode_values() {
    let timing_file = ".cache/pre-commit-timings-mode-test.jsonl";
    let _ = fs::remove_file(timing_file);

    let _ = run_precommit(&[("PRE_COMMIT_TIMING_FILE", timing_file)]);

    let content = fs::read_to_string(timing_file).unwrap_or_default();
    let valid_modes = ["full", "full_no_staged", "full_fallback", "scoped"];
    let has_valid_mode = valid_modes
        .iter()
        .any(|m| content.contains(&format!("\"mode\":\"{}\"", m)));
    assert!(has_valid_mode, "timing mode should be one of: {:?}", valid_modes);

    let _ = fs::remove_file(timing_file);
}
