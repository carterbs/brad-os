use std::cell::RefCell;
use std::collections::VecDeque;
use std::fs;
use std::path::Path;
use std::path::PathBuf;

use dev_cli::qa_stop::{
    parse_args, ParsedArgs, run_with_runner_and_sleep, CliUsage, CommandCall, CommandResult, CommandRunner,
    StopContext, is_owner_of_lock, stop_pid_file,
};
use tempfile::tempdir;

struct FakeRunner {
    calls: RefCell<Vec<CommandCall>>,
    responses: RefCell<VecDeque<CommandResult>>,
}

impl FakeRunner {
    fn new(responses: Vec<CommandResult>) -> Self {
        Self {
            calls: RefCell::new(Vec::new()),
            responses: RefCell::new(VecDeque::from(responses)),
        }
    }

    fn response(status: i32, stdout: &str) -> CommandResult {
        CommandResult {
            status,
            stdout: stdout.to_string(),
        }
    }
}

impl CommandRunner for FakeRunner {
    fn run(&self, command: CommandCall) -> CommandResult {
        self.calls.borrow_mut().push(command);
        self.responses
            .borrow_mut()
            .pop_front()
            .unwrap_or_else(|| CommandResult {
                status: 0,
                stdout: String::new(),
            })
    }
}

#[test]
fn parse_args_covers_all_flags() {
    let args = vec![
        "--agent".to_string(),
        "Worktree".to_string(),
        "--shutdown-simulator".to_string(),
    ];
    let parsed = parse_args(&args).expect("parse args");
    match parsed {
        ParsedArgs::Run {
            session_id,
            shutdown_simulator,
        } => {
            assert_eq!(session_id.as_deref(), Some("Worktree"));
            assert!(shutdown_simulator);
        }
        _ => panic!("Expected run args"),
    }
}

#[test]
fn parse_args_unknown_arg_is_error() {
    let args = vec!["--does-not-exist".to_string()];
    assert!(parse_args(&args).is_err());
}

#[test]
fn usage_includes_all_flags() {
    let usage = CliUsage::text();
    assert!(usage.contains("--id <id>"));
    assert!(usage.contains("--agent <id>"));
    assert!(usage.contains("--shutdown-simulator"));
    assert!(usage.contains("-h, --help"));
}

#[test]
fn sanitize_id_matches_script_semantics() {
    assert_eq!(dev_cli::qa_stop::sanitize_id("Alpha Worktree"), "alpha-worktree");
    assert_eq!(dev_cli::qa_stop::sanitize_id("Worktree_123"), "worktree-123");
    assert_eq!(dev_cli::qa_stop::sanitize_id("UPPER"), "upper");
}

#[test]
fn pid_file_running_state_follows_fallback_chain() {
    let workspace = tempdir().expect("temp");
    let pid_file = workspace.path().join("running.pid");
    fs::write(&pid_file, "321\n").expect("write");

    let runner = FakeRunner::new(vec![
        FakeRunner::response(0, ""),
        FakeRunner::response(0, ""),
        FakeRunner::response(0, ""),
        FakeRunner::response(1, ""),
    ]);

    let report = stop_pid_file(&pid_file, "Firebase", &runner, &|_| {})
        .expect("stopped");
    assert_eq!(report, "Firebase: stopped pid 321");
    assert!(!pid_file.exists());
}

#[test]
fn pid_file_stale_state_removes_file_without_kill() {
    let workspace = tempdir().expect("temp");
    let pid_file = workspace.path().join("stale.pid");
    fs::write(&pid_file, "321\n").expect("write");

    let runner = FakeRunner::new(vec![FakeRunner::response(1, "")]);

    let report = stop_pid_file(&pid_file, "OTel collector", &runner, &|_| {})
        .expect("stopped");
    assert_eq!(report, "OTel collector: process 321 was already stopped");
    assert!(!pid_file.exists());
}

#[test]
fn pid_file_empty_state_removes_file() {
    let workspace = tempdir().expect("temp");
    let pid_file = workspace.path().join("empty.pid");
    fs::write(&pid_file, "\n").expect("write");

    let runner = FakeRunner::new(vec![]);
    let report = stop_pid_file(&pid_file, "OTel collector", &runner, &|_| {})
        .expect("stopped");
    assert_eq!(report, "OTel collector: pid file was empty, removed.");
    assert!(!pid_file.exists());
}

#[test]
fn pid_file_missing_state_reports_no_pid_file() {
    let workspace = tempdir().expect("temp");
    let pid_file = workspace.path().join("missing.pid");
    let runner = FakeRunner::new(vec![]);
    let report = stop_pid_file(&pid_file, "OTel collector", &runner, &|_| {})
        .expect("stopped");
    assert_eq!(report, format!("OTel collector: no pid file at {}", pid_file.display()));
}

#[test]
fn lock_matching_owner_uses_session_file() {
    let workspace = tempdir().expect("temp");
    let lock_dir = workspace.path().join("device.lock");
    fs::create_dir_all(&lock_dir).expect("dir");
    let session_file = lock_dir.join("session");
    fs::write(&session_file, "session-123").expect("write");

    assert!(is_owner_of_lock(&session_file, "session-123").expect("read"));
    assert!(!is_owner_of_lock(&session_file, "session-999").expect("read"));
}

#[test]
fn state_matrix_present_and_missing_path() {
    let qa_state_root = tempdir().expect("temp");
    let context = StopContext::load("missing", qa_state_root.path().to_str().expect("str")).expect("context");
    assert_eq!(
        context.otel_pid_file,
        qa_state_root
            .path()
            .join("sessions")
            .join("missing")
            .join("pids")
            .join("otel.pid")
    );

    let session_dir = qa_state_root.path().join("sessions").join("present");
    let state_file = session_dir.join("state.env");
    fs::create_dir_all(&session_dir).expect("session dir");
    fs::write(
        &state_file,
        "OTEL_PID_FILE=\"/tmp/otel.pid\"\nFIREBASE_PID_FILE=\"/tmp/firebase.pid\"\nFUNCTIONS_PORT=\"1234\"\nHOSTING_PORT=\"5678\"\nSIMULATOR_UDID=\"SIM-1\"\nSIMULATOR_LOCK_DIR=\"/tmp/lock\"\n",
    )
    .expect("state file");

    let context = StopContext::load("present", qa_state_root.path().to_str().expect("str")).expect("context");
    assert_eq!(context.otel_pid_file, PathBuf::from("/tmp/otel.pid"));
    assert_eq!(context.firebase_pid_file, PathBuf::from("/tmp/firebase.pid"));
    assert_eq!(context.ports[0].as_deref(), Some("1234"));
    assert_eq!(context.ports[2].as_deref(), Some("5678"));
    assert_eq!(context.simulator_udid, Some("SIM-1".to_string()));
    assert_eq!(context.simulator_lock_dir, Some("/tmp/lock".to_string()));
}

#[test]
fn run_with_shutdown_flag_and_matching_simulator_lock() {
    let root = tempdir().expect("temp");
    let qa_state_root = root.path().join("qa-state");
    let session_dir = qa_state_root.join("sessions").join("demo");
    let state_file = session_dir.join("state.env");
    fs::create_dir_all(&session_dir).expect("session dir");
    fs::create_dir_all(&session_dir.join("pids")).expect("pid dir");
    fs::create_dir_all(&qa_state_root.join("device-locks")).expect("locks");
    fs::create_dir_all(&qa_state_root.join("device-locks").join("owned.lock")).expect("owned");
    fs::write(
        qa_state_root.join("device-locks").join("owned.lock").join("session"),
        "demo",
    )
    .expect("session owner");
    fs::create_dir_all(&qa_state_root.join("device-locks").join("other.lock")).expect("other");
    fs::write(
        qa_state_root.join("device-locks").join("other.lock").join("session"),
        "other",
    )
    .expect("other owner");

    let lock_dir = session_dir.join("lock");
    fs::create_dir_all(&lock_dir).expect("lock dir");
    let mut contents = String::new();
    contents.push_str("SIMULATOR_UDID=\"SIM-1\"\n");
    contents.push_str("SIMULATOR_LOCK_DIR=\"");
    contents.push_str(lock_dir.to_str().expect("lock dir"));
    contents.push_str("\"\n");
    fs::write(&state_file, contents).expect("state file");
    let mut responses = Vec::new();
    for _ in 0..5 {
        responses.push(FakeRunner::response(0, ""));
    }
    let runner = FakeRunner::new(responses);

    let report = run_with_runner_and_sleep(
        &[
            "--id".to_string(),
            "demo".to_string(),
            "--shutdown-simulator".to_string(),
        ],
        root.path(),
        qa_state_root.to_str().expect("qa root"),
        &runner,
        &|_| {},
    )
    .expect("run");

    assert!(report.messages.iter().any(|message| message.starts_with("Simulator: shut down SIM-1")));
    assert!(report
        .messages
        .iter()
        .any(|message| message == &format!("Simulator lease released: {}", lock_dir.display())));
    assert!(report
        .messages
        .iter()
        .any(|message| message == "QA session stopped: demo"));
    assert!(!lock_dir.exists());
}

#[test]
fn run_with_no_simulator_shutdown_flag() {
    let root = tempdir().expect("temp");
    let qa_state_root = root.path().join("qa-state");
    let session_dir = qa_state_root.join("sessions").join("demo");
    fs::create_dir_all(&session_dir.join("pids")).expect("pid dir");
    fs::write(session_dir.join("state.env"), "SIMULATOR_UDID=\"SIM-2\"\n").expect("state file");

    let mut responses = Vec::new();
    for _ in 0..4 {
        responses.push(FakeRunner::response(0, ""));
    }
    let runner = FakeRunner::new(responses);

    let report = run_with_runner_and_sleep(
        &["--id".to_string(), "demo".to_string()],
        root.path(),
        qa_state_root.to_str().expect("qa root"),
        &runner,
        &|_| {},
    )
    .expect("run");

    assert!(!report.messages.iter().any(|message| message.starts_with("Simulator: shut down")));
    assert!(report
        .messages
        .iter()
        .any(|message| message == "QA session stopped: demo"));
}

#[test]
fn run_help_prints_usage_message() {
    let runner = FakeRunner::new(vec![]);
    let report = run_with_runner_and_sleep(
        &["--help".to_string()],
        Path::new("/tmp"),
        "/tmp/qa-state",
        &runner,
        &|_| {},
    )
    .expect("run");
    assert_eq!(report.messages[0], CliUsage::text());
    assert!(report.session_id.is_empty());
}
