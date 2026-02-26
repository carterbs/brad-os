use std::env;
use std::fs::{self, File};
use std::io::Write;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use std::time::Duration;
use std::sync::{Mutex, MutexGuard, OnceLock};
use tempfile::tempdir;

fn brad_run_integration_tests_binary() -> &'static str {
    env!("CARGO_BIN_EXE_brad-run-integration-tests")
}

fn write_executable_script(path: &Path, content: &str) {
    let mut file = File::create(path).expect("failed to create script");
    file.write_all(content.as_bytes())
        .expect("failed to write script");
    let mut perms = file
        .metadata()
        .expect("failed to stat script")
        .permissions();
    perms.set_mode(0o755);
    fs::set_permissions(path, perms).expect("failed to make script executable");
}

struct Fixture {
    dir: tempfile::TempDir,
    state_file: PathBuf,
    health_file: PathBuf,
}

fn create_fixtures() -> Fixture {
    let temp_dir = tempdir().expect("failed to create temp dir");
    let bin_dir = temp_dir.path().join("bin");
    fs::create_dir_all(&bin_dir).expect("failed to create bin dir");
    let state_file = temp_dir.path().join("state.txt");
    let health_file = temp_dir.path().join("health.txt");

    let npm = r#"#!/bin/sh
echo "npm $@" >> "$BRAD_IT_STATE_FILE"
if [ "$1" = "run" ] && [ "$2" = "build" ]; then
  exit "${BRAD_IT_BUILD_EXIT:-0}"
fi
if [ "$1" = "run" ] && [ "$2" = "test:integration" ]; then
  if [ "${BRAD_IT_TEST_SLEEP:-0}" = "1" ]; then
    while true; do
      sleep 1
    done
  fi
  exit "${BRAD_IT_TEST_EXIT:-0}"
fi
exit 0
"#;

    let firebase = r#"#!/bin/sh
echo "firebase $@" >> "$BRAD_IT_STATE_FILE"
if [ "${BRAD_IT_EMULATOR_EXIT:-0}" != "0" ]; then
  exit "${BRAD_IT_EMULATOR_EXIT}"
fi
trap 'echo "emulator stopped" >> "$BRAD_IT_STATE_FILE"; exit 0' INT TERM
while true; do
  sleep 1
done
"#;

    let curl = format!(
        "#!/bin/sh\n\
echo \"curl $@\" >> \"$BRAD_IT_STATE_FILE\"\n\
attempt_file=\"{}\"\n\
attempt=\"$(cat \"$attempt_file\" 2>/dev/null || echo 0)\"\n\
attempt=$((attempt + 1))\n\
echo \"$attempt\" > \"$attempt_file\"\n\
\n\
ready_after=\"${{BRAD_IT_READY_AFTER:-1}}\"\n\
if [ \"$attempt\" -ge \"$ready_after\" ]; then\n\
  exit 0\n\
fi\n\
exit 1\n",
        health_file.display()
    );

    write_executable_script(&bin_dir.join("npm"), npm);
    write_executable_script(&bin_dir.join("firebase"), firebase);
    write_executable_script(&bin_dir.join("curl"), &curl);
    write_executable_script(&bin_dir.join("setsid"), "#!/bin/sh\nexec \"$@\"\n");

    Fixture {
        dir: temp_dir,
        state_file,
        health_file,
    }
}

fn state_contains(dir: &Fixture, needle: &str) -> bool {
    if !dir.state_file.exists() {
        return false;
    }
    fs::read_to_string(&dir.state_file)
        .unwrap_or_default()
        .contains(needle)
}

fn run_integration_binary(
    fixture: &Fixture,
    additional_env: Vec<(&'static str, String)>,
) -> (String, String, i32) {
    let _guard = suite_lock();

    let original_path = env::var("PATH").expect("PATH required");
    let shims = fixture.dir.path().join("bin");
    let path = format!("{}:{}", shims.display(), original_path);

    let mut cmd = Command::new(brad_run_integration_tests_binary());
    cmd.env("PATH", path);
    cmd.env("BRAD_IT_WAIT_TIMEOUT_SECS", "2");
    cmd.env("BRAD_IT_WAIT_INTERVAL_SECS", "1");
    cmd.env("BRAD_IT_READY_AFTER", "1");
    cmd.env("BRAD_IT_DISABLE_SETSID", "1");
    cmd.env(
        "BRAD_IT_STATE_FILE",
        fixture.state_file.to_str().expect("state file path"),
    );
    cmd.env(
        "BRAD_IT_HEALTH_ATTEMPTS_FILE",
        fixture.health_file.to_str().expect("health file path"),
    );
    cmd.env("BRAD_IT_HEALTH_CHECK_COMMAND", "curl");
    cmd.env("BRAD_IT_HEALTH_URL", "http://127.0.0.1:5001/brad-os/us-central1/devHealth");
    cmd.env(
        "BRAD_IT_EMULATOR_COMMAND",
        shims.join("firebase").to_str().expect("path"),
    );
    cmd.env("BRAD_IT_BUILD_COMMAND", shims.join("npm").to_str().expect("path"));
    cmd.env("BRAD_IT_TEST_COMMAND", shims.join("npm").to_str().expect("path"));

    for (k, v) in additional_env {
        cmd.env(k, v);
    }

    let output = cmd.output().expect("failed to run integration binary");
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let code = output.status.code().unwrap_or(1);
    (stdout, stderr, code)
}

fn run_integration_binary_async(
    fixture: &Fixture,
    additional_env: Vec<(&'static str, String)>,
) -> (std::process::Child, MutexGuard<'static, ()>) {
    let guard = suite_lock();

    let original_path = env::var("PATH").expect("PATH required");
    let shims = fixture.dir.path().join("bin");
    let path = format!("{}:{}", shims.display(), original_path);

    let mut cmd = Command::new(brad_run_integration_tests_binary());
    cmd.env("PATH", path);
    cmd.env("BRAD_IT_WAIT_TIMEOUT_SECS", "2");
    cmd.env("BRAD_IT_WAIT_INTERVAL_SECS", "1");
    cmd.env("BRAD_IT_READY_AFTER", "1");
    cmd.env("BRAD_IT_DISABLE_SETSID", "1");
    cmd.env(
        "BRAD_IT_STATE_FILE",
        fixture.state_file.to_str().expect("state file path"),
    );
    cmd.env(
        "BRAD_IT_HEALTH_ATTEMPTS_FILE",
        fixture.health_file.to_str().expect("health file path"),
    );
    cmd.env("BRAD_IT_HEALTH_CHECK_COMMAND", "curl");
    cmd.env("BRAD_IT_HEALTH_URL", "http://127.0.0.1:5001/brad-os/us-central1/devHealth");
    cmd.env(
        "BRAD_IT_EMULATOR_COMMAND",
        shims.join("firebase").to_str().expect("path"),
    );
    cmd.env("BRAD_IT_BUILD_COMMAND", shims.join("npm").to_str().expect("path"));
    cmd.env("BRAD_IT_TEST_COMMAND", shims.join("npm").to_str().expect("path"));

    for (k, v) in additional_env {
        cmd.env(k, v);
    }

    let child = cmd
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("failed to spawn integration binary");

    (child, guard)
}

fn suite_lock() -> MutexGuard<'static, ()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(())).lock().unwrap()
}

#[test]
fn integration_runner_success_path_is_zero() {
    let fixture = create_fixtures();
    let (stdout, stderr, code) = run_integration_binary(&fixture, vec![]);
    let output = format!("{stdout}{stderr}");
    assert_eq!(code, 0);
    assert!(output.contains("✅ Integration tests passed."));
}

#[test]
fn integration_runner_preserves_build_failure() {
    let fixture = create_fixtures();
    let (stdout, stderr, code) = run_integration_binary(
        &fixture,
        vec![("BRAD_IT_BUILD_EXIT", "1".to_string())],
    );
    let output = format!("{stdout}{stderr}");
    assert_eq!(code, 1);
    assert!(output.contains("🔨 Building functions..."));
    assert!(!output.contains("🚀 Starting emulators"));
}

#[test]
fn integration_runner_reports_emulator_start_failure() {
    let fixture = create_fixtures();
    let (stdout, stderr, code) = run_integration_binary(
        &fixture,
        vec![(
            "BRAD_IT_EMULATOR_COMMAND",
            "/definitely-does-not-exist".to_string(),
        )],
    );
    let output = format!("{stdout}{stderr}");
    assert_eq!(code, 1);
    assert!(output.contains("❌ Failed to start emulators"));
}

#[test]
fn integration_runner_reports_readiness_timeout() {
    let fixture = create_fixtures();
    let (stdout, stderr, code) = run_integration_binary(
        &fixture,
        vec![
            ("BRAD_IT_READY_AFTER", "99".to_string()),
            ("BRAD_IT_WAIT_TIMEOUT_SECS", "1".to_string()),
            ("BRAD_IT_WAIT_INTERVAL_SECS", "1".to_string()),
        ],
    );
    let output = format!("{stdout}{stderr}");
    assert_eq!(code, 1);
    assert!(output.contains("❌ Emulators did not become ready in time."));
}

#[test]
fn integration_runner_preserves_test_failure_code() {
    let fixture = create_fixtures();
    let (stdout, stderr, code) = run_integration_binary(
        &fixture,
        vec![("BRAD_IT_TEST_EXIT", "5".to_string())],
    );
    let output = format!("{stdout}{stderr}");
    assert_eq!(code, 5);
    assert!(output.contains("❌ Integration tests failed (exit code 5)."));
}

#[test]
fn integration_runner_cleans_up_on_interrupt() {
    let fixture = create_fixtures();
    let (child, _guard) = run_integration_binary_async(
        &fixture,
        vec![
            ("BRAD_IT_TEST_SLEEP", "1".to_string()),
            ("BRAD_IT_TEST_EXIT", "0".to_string()),
        ],
    );

    for _ in 0..30 {
        if state_contains(&fixture, "firebase emulators:start") {
            break;
        }
        thread::sleep(Duration::from_millis(100));
    }
    let pid = child.id();
    let _ = Command::new("kill")
        .arg("-INT")
        .arg(pid.to_string())
        .output();
    let output = child
        .wait_with_output()
        .expect("failed to wait on interrupted child");
    assert_eq!(output.status.code().unwrap_or(-1), 130);

    let state = fs::read_to_string(&fixture.state_file).expect("failed to read state file");
    assert!(state.contains("emulator stopped"));
}
