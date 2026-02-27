use std::fs;
use std::path::Path;
use std::process::Command;
use tempfile::tempdir;

fn brad_doctor_binary() -> &'static str {
    env!("CARGO_BIN_EXE_brad-doctor")
}

fn fake_command(path: &Path, name: &str, version: &str) {
    let binary = path.join(name);
    let content = format!(
        "#!/usr/bin/env sh\nif [ \"$1\" = \"--version\" ] || [ \"$1\" = \"-v\" ]; then\n  echo \"{version}\"\nfi\n"
    );
    fs::write(&binary, content).unwrap();
    let mut perms = fs::metadata(&binary).unwrap().permissions();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        perms.set_mode(0o755);
    }
    fs::set_permissions(&binary, perms).unwrap();
}

fn make_repo() -> tempfile::TempDir {
    let dir = tempdir().unwrap();
    let root = dir.path();
    fs::create_dir_all(root.join("node_modules")).unwrap();
    fs::create_dir_all(root.join("hooks")).unwrap();
    Command::new("git")
        .args(["init", "-q"])
        .current_dir(root)
        .status()
        .expect("failed to run git init");
    Command::new("git")
        .args(["config", "core.hooksPath", "hooks"])
        .current_dir(root)
        .status()
        .expect("failed to set hooks path");
    dir
}

fn run_doctor(binary_path: &Path, cwd: &Path, path: &Path, fast_mode: bool) -> (String, String, i32) {
    let output = Command::new(binary_path)
        .current_dir(cwd)
        .env("BRAD_DOCTOR_FAST", if fast_mode { "1" } else { "0" })
        .env("PATH", format!("{}:{}", path.display(), std::env::var("PATH").unwrap_or_default()))
        .output()
        .expect("failed to run brad-doctor");

    (
        String::from_utf8_lossy(&output.stdout).to_string(),
        String::from_utf8_lossy(&output.stderr).to_string(),
        output.status.code().unwrap_or(1),
    )
}

#[test]
fn doctor_binary_runs_and_prints_pass_in_healthy_context() {
    let repo = make_repo();
    let bin_dir = tempdir().unwrap();
    fake_command(bin_dir.path(), "node", "v22.12.0");
    fake_command(bin_dir.path(), "npm", "10.0.0");
    fake_command(bin_dir.path(), "firebase", "13.0.0");
    fake_command(bin_dir.path(), "cargo", "1.75.0");
    fake_command(bin_dir.path(), "rustup", "1.25.0");
    fake_command(bin_dir.path(), "cargo-llvm-cov", "0.5.17");
    fake_command(bin_dir.path(), "llvm-tools-preview", "18.1.0");
    fake_command(bin_dir.path(), "gitleaks", "8.18.0");
    fake_command(bin_dir.path(), "xcodegen", "2.40.0");

    let (stdout, _stderr, code) =
        run_doctor(Path::new(brad_doctor_binary()), repo.path(), bin_dir.path(), false);

    assert_eq!(code, 0);
    assert!(stdout.contains("PASS"));
    assert!(stdout.contains("All dependencies satisfied."));
}

#[test]
fn doctor_binary_fails_fast_and_prints_missing_remediation() {
    let repo = make_repo();
    let bin_dir = tempdir().unwrap();
    fake_command(bin_dir.path(), "node", "21.12.0");
    fake_command(bin_dir.path(), "npm", "10.0.0");
    fake_command(bin_dir.path(), "firebase", "13.0.0");
    fake_command(bin_dir.path(), "cargo", "1.75.0");
    fake_command(bin_dir.path(), "rustup", "1.25.0");
    fake_command(bin_dir.path(), "cargo-llvm-cov", "0.5.17");
    fake_command(bin_dir.path(), "llvm-tools-preview", "18.1.0");
    fake_command(bin_dir.path(), "gitleaks", "8.18.0");
    fake_command(bin_dir.path(), "xcodegen", "2.40.0");

    let (stdout, _stderr, code) =
        run_doctor(Path::new(brad_doctor_binary()), repo.path(), bin_dir.path(), false);

    assert_ne!(code, 0);
    assert!(stdout.contains("FAIL"));
    assert!(stdout.contains("Install missing dependencies:"));
    assert!(stdout.contains("v21.12.0 (need ≥ 22)"));
}

#[test]
fn doctor_binary_checks_rust_toolchain_components() {
    let repo = make_repo();
    let bin_dir = tempdir().unwrap();
    fake_command(bin_dir.path(), "node", "v22.12.0");
    fake_command(bin_dir.path(), "npm", "10.0.0");
    fake_command(bin_dir.path(), "firebase", "13.0.0");
    fake_command(bin_dir.path(), "cargo", "1.75.0");
    fake_command(bin_dir.path(), "rustup", "1.25.0");
    fake_command(bin_dir.path(), "cargo-llvm-cov", "0.5.17");
    fake_command(bin_dir.path(), "llvm-tools-preview", "18.1.0");
    fake_command(bin_dir.path(), "gitleaks", "8.18.0");
    fake_command(bin_dir.path(), "xcodegen", "2.40.0");

    let (stdout, _stderr, code) =
        run_doctor(Path::new(brad_doctor_binary()), repo.path(), bin_dir.path(), true);

    assert_eq!(code, 0);
    assert!(stdout.contains("✓ rustup"));
    assert!(stdout.contains("✓ cargo-llvm-cov"));
    assert!(stdout.contains("✓ llvm-tools-preview"));
}
