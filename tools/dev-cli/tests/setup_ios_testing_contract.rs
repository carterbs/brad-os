use std::fs;
use std::path::Path;
use std::process::Command;

fn brad_setup_ios_testing_binary() -> &'static str {
    env!("CARGO_BIN_EXE_brad-setup-ios-testing")
}

fn write_stub(path: &Path, body: &str) {
    fs::write(path, format!("#!/usr/bin/env bash\n{body}")).expect("failed to write stub");
    let _ = Command::new("chmod")
        .arg("+x")
        .arg(path)
        .status()
        .expect("failed to chmod stub");
}

fn run_setup(env_dir: &Path, args: &[&str], extra_env: &[(&str, &str)]) -> (String, String, i32) {
    let mut cmd = Command::new(brad_setup_ios_testing_binary());
    cmd.args(args);
    cmd.current_dir(env_dir);
    for (key, value) in extra_env {
        cmd.env(key, value);
    }

    let output = cmd.output().expect("failed to run brad-setup-ios-testing");
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let code = output.status.code().unwrap_or(1);
    (stdout, stderr, code)
}

fn write_stub_set(stub_dir: &Path, log_path: &str) -> (String, String, String) {
    let xcodegen_stub = format!(
        "echo \"xcodegen 1.0.0\"\necho \"stub xcodegen --version\" >> \"{log_path}\"\necho \"xcodegen generate\" >> \"{log_path}\"\n"
    );
    let xcodebuild_stub = format!(
        "if [[ \"$1\" == \"-version\" ]]; then\n  echo \"Xcode 16.0\";\n  echo \"stub xcodebuild -version\" >> \"{log_path}\"\n  exit 0\nfi\necho \"stub xcodebuild $@\" >> \"{log_path}\"\necho \"build line 1\"\necho \"build line 2\"\necho \"build line 3\"\necho \"build line 4\"\necho \"build line 5\"\n"
    );
    let xcrun_stub = format!(
        "if [[ \"$1\" == \"simctl\" && \"$2\" == \"list\" ]]; then\n  echo \"== Devices ==\"\n  echo \"Booted\"\n  echo \"stub xcrun simctl list devices booted\" >> \"{log_path}\"\n  exit 0\nfi\nif [[ \"$1\" == \"simctl\" && \"$2\" == \"boot\" ]]; then\n  echo \"stub xcrun simctl boot\" >> \"{log_path}\"\n  exit 0\nfi\necho \"stub xcrun $@\" >> \"{log_path}\"\n"
    );
    let list = (xcodegen_stub.clone(), xcodebuild_stub.clone(), xcrun_stub.clone());

    write_stub(&stub_dir.join("xcodegen"), &xcodegen_stub);
    write_stub(&stub_dir.join("xcodebuild"), &xcodebuild_stub);
    write_stub(&stub_dir.join("xcrun"), &xcrun_stub);
    list
}

#[test]
fn runs_full_setup_when_tools_exist() {
    let workdir = tempfile::tempdir().unwrap();
    let ios_dir = workdir.path().join("ios").join("BradOS");
    fs::create_dir_all(&ios_dir).unwrap();
    fs::write(ios_dir.join("project.yml"), b"project: BradOS").unwrap();

    let stub_dir = workdir.path().join("stubs");
    fs::create_dir_all(&stub_dir).unwrap();
    let stub_log = workdir.path().join("commands.log");

    let log_path = stub_log.to_string_lossy().to_string();
    let _ = write_stub_set(&stub_dir, &log_path);

    let (stdout, stderr, code) = run_setup(
        workdir.path(),
        &[],
        &[("PATH", &format!("{}:{}", stub_dir.to_string_lossy(), std::env::var("PATH").unwrap()))],
    );

    assert_eq!(code, 0, "stdout={stdout}\nstderr={stderr}");
    let log = fs::read_to_string(&stub_log).expect("read command log");
    assert!(log.contains("xcodegen --version"));
    assert!(log.contains("xcodebuild -version"));
    assert!(log.contains("xcodegen generate"));
    assert!(log.contains("xcrun simctl list devices booted"));
    assert!(log.contains("xcodebuild -project"));
    assert!(stdout.contains("iOS testing environment ready!"));
}

#[test]
fn skips_build_when_requested() {
    let workdir = tempfile::tempdir().unwrap();
    let ios_dir = workdir.path().join("ios").join("BradOS");
    fs::create_dir_all(&ios_dir).unwrap();
    fs::write(ios_dir.join("project.yml"), b"project: BradOS").unwrap();

    let stub_dir = workdir.path().join("stubs");
    fs::create_dir_all(&stub_dir).unwrap();
    let stub_log = workdir.path().join("commands.log");
    let log_path = stub_log.to_string_lossy().to_string();
    let _ = write_stub_set(&stub_dir, &log_path);

    let (stdout, stderr, code) = run_setup(
        workdir.path(),
        &["--skip-build"],
        &[("PATH", &format!("{}:{}", stub_dir.to_string_lossy(), std::env::var("PATH").unwrap()))],
    );

    assert_eq!(code, 0, "stdout={stdout}\nstderr={stderr}");
    assert!(stdout.contains("⏭️  Skipping build sanity check (--skip-build)"));
    let log = fs::read_to_string(&stub_log).unwrap();
    assert!(!log.contains("xcodebuild build"));
}

#[test]
fn fails_fast_when_tool_missing() {
    let workdir = tempfile::tempdir().unwrap();
    let ios_dir = workdir.path().join("ios").join("BradOS");
    fs::create_dir_all(&ios_dir).unwrap();
    fs::write(ios_dir.join("project.yml"), b"project: BradOS").unwrap();

    let (stdout, stderr, code) = run_setup(workdir.path(), &[], &[("PATH", "/usr/bin")]);
    assert_ne!(code, 0);
    assert!(
        stderr.contains("xcodegen not found") || stdout.contains("xcodegen not found"),
        "stderr={stderr}\nstdout={stdout}"
    );
}
