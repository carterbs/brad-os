use std::env;
use std::fs::{self, File};
use std::io::Write;
use std::net::TcpListener;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Mutex, MutexGuard, OnceLock};
use std::thread;
use std::time::Duration;
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
    test_descendant_pid_file: PathBuf,
    api_descendant_pid_file: PathBuf,
    firestore_listener: TcpListener,
}

fn create_fixtures() -> Fixture {
    let temp_dir = tempdir().expect("failed to create temp dir");
    let bin_dir = temp_dir.path().join("bin");
    fs::create_dir_all(&bin_dir).expect("failed to create bin dir");
    let state_file = temp_dir.path().join("state.txt");
    let health_file = temp_dir.path().join("health.txt");
    let test_descendant_pid_file = temp_dir.path().join("test-descendant.pid");
    let api_descendant_pid_file = temp_dir.path().join("api-descendant.pid");
    let firestore_listener =
        TcpListener::bind("127.0.0.1:0").expect("failed to bind Firestore readiness socket");

    let npm = r#"#!/bin/sh
echo "npm $@" >> "$BRAD_IT_STATE_FILE"
if [ "$1" = "run" ] && [ "$2" = "build" ]; then
  exit "${BRAD_IT_BUILD_EXIT:-0}"
fi
if [ "$1" = "run" ] && [ "$2" = "test:integration" ]; then
  echo "test api=$BRAD_IT_API_URL" >> "$BRAD_IT_STATE_FILE"
  if [ "${BRAD_IT_TEST_SLEEP:-0}" = "1" ]; then
    (
      trap 'exit 0' INT TERM HUP
      while true; do
        sleep 1
      done
    ) &
    descendant_pid=$!
    echo "$descendant_pid" > "$BRAD_IT_TEST_DESCENDANT_PID_FILE"
    wait "$descendant_pid"
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

    let api = r#"#!/bin/sh
echo "api $@ port=$PORT project=$GOOGLE_CLOUD_PROJECT firestore=$FIRESTORE_EMULATOR_HOST bypass=$APP_CHECK_BYPASS dev_only=$BRAD_LOCAL_DEV_ONLY openai=[$OPENAI_API_KEY]" >> "$BRAD_IT_STATE_FILE"
echo "api_env home=$HOME credentials=${GOOGLE_APPLICATION_CREDENTIALS-unset} task=${STRAVA_TASK_QUEUE-unset} tts=${GOOGLE_API_KEY-unset} metadata=${METADATA_SERVER_DETECTION-unset}" >> "$BRAD_IT_STATE_FILE"
if [ "${BRAD_IT_API_SPAWN_DESCENDANT:-0}" = "1" ]; then
  (
    trap '' INT TERM HUP
    while true; do
      sleep 1
    done
  ) &
  echo "$!" > "$BRAD_IT_API_DESCENDANT_PID_FILE"
fi
if [ "${BRAD_IT_API_IGNORE_TERM:-0}" = "1" ]; then
  trap '' INT TERM HUP
else
  trap 'echo "api stopped" >> "$BRAD_IT_STATE_FILE"; exit 0' INT TERM HUP
fi
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
    write_executable_script(&bin_dir.join("node"), api);
    write_executable_script(&bin_dir.join("curl"), &curl);
    write_executable_script(&bin_dir.join("setsid"), "#!/bin/sh\nexec \"$@\"\n");

    Fixture {
        dir: temp_dir,
        state_file,
        health_file,
        test_descendant_pid_file,
        api_descendant_pid_file,
        firestore_listener,
    }
}

fn configured_runner_command(fixture: &Fixture) -> Command {
    let original_path = env::var("PATH").expect("PATH required");
    let shims = fixture.dir.path().join("bin");
    let path = format!("{}:{}", shims.display(), original_path);

    let mut cmd = Command::new(brad_run_integration_tests_binary());
    cmd.env("PATH", path);
    cmd.env("HOME", "/sensitive/real-home");
    cmd.env(
        "GOOGLE_APPLICATION_CREDENTIALS",
        "/sensitive/real-service-account.json",
    );
    cmd.env("STRAVA_TASK_QUEUE", "production-queue");
    cmd.env("GOOGLE_API_KEY", "must-not-leak");
    cmd.env("METADATA_SERVER_DETECTION", "assume-present");
    cmd.env("BRAD_IT_WAIT_TIMEOUT_SECS", "2");
    cmd.env("BRAD_IT_WAIT_INTERVAL_SECS", "1");
    cmd.env("BRAD_IT_STOP_GRACE_MILLIS", "250");
    cmd.env("BRAD_IT_READY_AFTER", "1");
    cmd.env("OPENAI_API_KEY", "must-not-leak");
    cmd.env(
        "BRAD_IT_STATE_FILE",
        fixture.state_file.to_str().expect("state file path"),
    );
    cmd.env(
        "BRAD_IT_HEALTH_ATTEMPTS_FILE",
        fixture.health_file.to_str().expect("health file path"),
    );
    cmd.env(
        "BRAD_IT_TEST_DESCENDANT_PID_FILE",
        fixture
            .test_descendant_pid_file
            .to_str()
            .expect("test descendant pid file"),
    );
    cmd.env(
        "BRAD_IT_API_DESCENDANT_PID_FILE",
        fixture
            .api_descendant_pid_file
            .to_str()
            .expect("api descendant pid file"),
    );
    cmd.env("BRAD_IT_HEALTH_CHECK_COMMAND", "curl");
    cmd.env("BRAD_IT_API_URL", "http://127.0.0.1:5001/api/dev");
    cmd.env(
        "BRAD_IT_FIRESTORE_HOST",
        fixture
            .firestore_listener
            .local_addr()
            .expect("listener address")
            .to_string(),
    );
    cmd.env(
        "BRAD_IT_EMULATOR_COMMAND",
        shims.join("firebase").to_str().expect("path"),
    );
    cmd.env(
        "BRAD_IT_API_COMMAND",
        shims.join("node").to_str().expect("path"),
    );
    cmd.env(
        "BRAD_IT_BUILD_COMMAND",
        shims.join("npm").to_str().expect("path"),
    );
    cmd.env(
        "BRAD_IT_TEST_COMMAND",
        shims.join("npm").to_str().expect("path"),
    );
    cmd
}

fn run_integration_binary(
    fixture: &Fixture,
    additional_env: Vec<(&'static str, String)>,
) -> (String, String, i32) {
    let _guard = suite_lock();
    let mut cmd = configured_runner_command(fixture);

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
    let mut cmd = configured_runner_command(fixture);

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

fn read_pid(path: &Path) -> u32 {
    fs::read_to_string(path)
        .expect("pid file should exist")
        .trim()
        .parse()
        .expect("pid should parse")
}

fn process_is_running(pid: u32) -> bool {
    Command::new("kill")
        .args(["-0", &pid.to_string()])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .is_ok_and(|status| status.success())
}

fn wait_for_process_exit(pid: u32) {
    for _ in 0..40 {
        if !process_is_running(pid) {
            return;
        }
        thread::sleep(Duration::from_millis(50));
    }
    panic!("process {pid} remained alive");
}

#[test]
fn integration_runner_success_path_is_zero() {
    let fixture = create_fixtures();
    let (stdout, stderr, code) = run_integration_binary(&fixture, vec![]);
    let output = format!("{stdout}{stderr}");
    assert_eq!(code, 0);
    assert!(output.contains("✅ Integration tests passed."));
    let state = fs::read_to_string(&fixture.state_file).expect("failed to read state file");
    assert!(state.contains("firebase emulators:start --only firestore --project brad-os"));
    assert!(state.contains(&format!(
        "api packages/functions/lib/server.js port=5001 project=brad-os firestore={} bypass=true dev_only=true openai=[]",
        fixture
            .firestore_listener
            .local_addr()
            .expect("listener address")
    )));
    assert!(state.contains("test api=http://127.0.0.1:5001/api/dev"));
    assert!(state.contains("credentials=unset task=unset tts=unset metadata=none"));
    assert!(!state.contains("home=/sensitive/real-home"));
    assert!(state.contains("api stopped"));
    assert!(state.contains("emulator stopped"));
}

#[test]
fn integration_runner_uses_configured_api_url_for_server_health_and_tests() {
    let fixture = create_fixtures();
    let (stdout, stderr, code) = run_integration_binary(
        &fixture,
        vec![(
            "BRAD_IT_API_URL",
            "http://127.0.0.1:6123/api/dev/".to_string(),
        )],
    );
    assert_eq!(code, 0, "stdout={stdout}\nstderr={stderr}");

    let state = fs::read_to_string(&fixture.state_file).expect("failed to read state file");
    assert!(state.contains("api packages/functions/lib/server.js port=6123"));
    assert!(state.contains("curl -s -f http://127.0.0.1:6123/api/dev/health"));
    assert!(state.contains("test api=http://127.0.0.1:6123/api/dev"));
}

#[test]
fn integration_runner_preserves_build_failure() {
    let fixture = create_fixtures();
    let (stdout, stderr, code) =
        run_integration_binary(&fixture, vec![("BRAD_IT_BUILD_EXIT", "1".to_string())]);
    let output = format!("{stdout}{stderr}");
    assert_eq!(code, 1);
    assert!(output.contains("🔨 Building functions..."));
    assert!(!output.contains("🚀 Starting Firestore emulator"));
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
    assert!(output.contains("❌ Failed to start Firestore emulator"));
}

#[test]
fn integration_runner_waits_for_firestore_before_starting_api() {
    let fixture = create_fixtures();
    let unavailable_listener =
        TcpListener::bind("127.0.0.1:0").expect("failed to reserve unavailable port");
    let unavailable_address = unavailable_listener
        .local_addr()
        .expect("unavailable listener address");
    drop(unavailable_listener);

    let (stdout, stderr, code) = run_integration_binary(
        &fixture,
        vec![
            ("BRAD_IT_FIRESTORE_HOST", unavailable_address.to_string()),
            ("BRAD_IT_WAIT_TIMEOUT_SECS", "1".to_string()),
            ("BRAD_IT_WAIT_INTERVAL_SECS", "1".to_string()),
        ],
    );
    let output = format!("{stdout}{stderr}");
    assert_eq!(code, 1);
    assert!(output.contains("❌ Firestore emulator did not become ready in time."));

    let state = fs::read_to_string(&fixture.state_file).expect("failed to read state file");
    assert!(!state.contains("api packages/functions/lib/server.js"));
}

#[test]
fn integration_runner_reports_api_start_failure_and_stops_firestore() {
    let fixture = create_fixtures();
    let (stdout, stderr, code) = run_integration_binary(
        &fixture,
        vec![(
            "BRAD_IT_API_COMMAND",
            "/definitely-does-not-exist".to_string(),
        )],
    );
    let output = format!("{stdout}{stderr}");
    assert_eq!(code, 1);
    assert!(output.contains("❌ Failed to start standalone API"));
    assert!(output.contains("✅ Firestore emulator stopped."));
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
    assert!(output.contains("❌ Standalone API did not become ready in time."));
    let state = fs::read_to_string(&fixture.state_file).expect("failed to read state file");
    assert!(state.contains("api stopped"));
    assert!(state.contains("emulator stopped"));
}

#[test]
fn integration_runner_preserves_test_failure_code() {
    let fixture = create_fixtures();
    let (stdout, stderr, code) =
        run_integration_binary(&fixture, vec![("BRAD_IT_TEST_EXIT", "5".to_string())]);
    let output = format!("{stdout}{stderr}");
    assert_eq!(code, 5);
    assert!(output.contains("❌ Integration tests failed (exit code 5)."));
    let state = fs::read_to_string(&fixture.state_file).expect("failed to read state file");
    assert!(state.contains("api stopped"));
    assert!(state.contains("emulator stopped"));
}

fn assert_signal_cleans_up(signal: &str) {
    let fixture = create_fixtures();
    let (child, _guard) = run_integration_binary_async(
        &fixture,
        vec![
            ("BRAD_IT_TEST_SLEEP", "1".to_string()),
            ("BRAD_IT_TEST_EXIT", "0".to_string()),
        ],
    );

    for _ in 0..30 {
        if fixture.test_descendant_pid_file.exists() {
            break;
        }
        thread::sleep(Duration::from_millis(100));
    }
    let descendant_pid = read_pid(&fixture.test_descendant_pid_file);
    let pid = child.id();
    let _ = Command::new("kill")
        .arg(signal)
        .arg(pid.to_string())
        .output();
    let output = child
        .wait_with_output()
        .expect("failed to wait on interrupted child");
    assert_eq!(output.status.code().unwrap_or(-1), 130);

    let state = fs::read_to_string(&fixture.state_file).expect("failed to read state file");
    assert!(state.contains("api stopped"));
    assert!(state.contains("emulator stopped"));
    wait_for_process_exit(descendant_pid);
}

#[test]
fn integration_runner_cleans_up_process_groups_on_interrupt() {
    assert_signal_cleans_up("-INT");
}

#[test]
fn integration_runner_cleans_up_process_groups_on_sigterm() {
    assert_signal_cleans_up("-TERM");
}

#[test]
fn integration_runner_cleans_up_process_groups_on_sighup() {
    assert_signal_cleans_up("-HUP");
}

#[test]
fn integration_runner_force_kills_stubborn_service_descendants() {
    let fixture = create_fixtures();
    let (stdout, stderr, code) = run_integration_binary(
        &fixture,
        vec![
            ("BRAD_IT_API_IGNORE_TERM", "1".to_string()),
            ("BRAD_IT_API_SPAWN_DESCENDANT", "1".to_string()),
        ],
    );
    assert_eq!(code, 0, "stdout={stdout}\nstderr={stderr}");

    let descendant_pid = read_pid(&fixture.api_descendant_pid_file);
    wait_for_process_exit(descendant_pid);
}
