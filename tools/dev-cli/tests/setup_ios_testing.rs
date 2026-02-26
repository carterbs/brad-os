use std::cell::RefCell;
use std::collections::VecDeque;
use std::fs;

use dev_cli::setup_ios_testing::{
    parse_args, ParsedArgs, run_with_runner, CliUsage,
};
use dev_cli::{CommandCall, CommandResult, CommandRunner};
use tempfile::tempdir;

#[derive(Debug, Clone)]
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
fn parse_args_defaults_to_run() {
    let parsed = parse_args(&[]).expect("parse default");
    match parsed {
        ParsedArgs::Run { skip_build } => assert!(!skip_build),
        _ => panic!("Expected run args"),
    }
}

#[test]
fn parse_args_supports_skip_build() {
    let parsed = parse_args(&["--skip-build".to_string()]).expect("parse skip");
    match parsed {
        ParsedArgs::Run { skip_build } => assert!(skip_build),
        _ => panic!("Expected run args"),
    }
}

#[test]
fn parse_args_unknown_arg_is_error() {
    let parsed = parse_args(&["--does-not-exist".to_string()]);
    assert!(parsed.is_err());
}

#[test]
fn usage_mentions_skip_build_and_help() {
    let usage = CliUsage::text();
    assert!(usage.contains("--skip-build"));
    assert!(usage.contains("-h, --help"));
}

#[test]
fn help_mode_prints_usage_only() {
    let workspace = tempdir().expect("temp");
    let runner = FakeRunner::new(vec![]);
    let report = run_with_runner(
        &["--help".to_string()],
        workspace.path(),
        &runner,
    )
    .expect("run");
    assert_eq!(report.messages, vec![CliUsage::text().to_string()]);
}

#[test]
fn missing_xcodegen_fails_fast() {
    let workspace = tempdir().expect("temp");
    fs::create_dir_all(workspace.path().join("ios/BradOS")).expect("prepare dirs");
    let runner = FakeRunner::new(vec![FakeRunner::response(1, "")]);
    let result = run_with_runner(&[], workspace.path(), &runner);
    assert_eq!(result.expect_err("failed"), "xcodegen not found");
    assert_eq!(runner.calls.borrow().len(), 1);
}

#[test]
fn missing_project_file_fails_before_generation() {
    let workspace = tempdir().expect("temp");
    fs::create_dir_all(workspace.path().join("ios/BradOS")).expect("prepare dirs");
    let runner = FakeRunner::new(vec![
        FakeRunner::response(0, "xcodegen 0.1.0\n"),
        FakeRunner::response(0, "Xcode 15.0\n"),
        FakeRunner::response(0, "xcrun 1.0\n"),
    ]);
    let result = run_with_runner(&[], workspace.path(), &runner);
    assert_eq!(
        result.expect_err("failed"),
        "ios/BradOS/project.yml not found — are you in the repo root?"
    );
    assert_eq!(runner.calls.borrow().len(), 3);
}

#[test]
fn missing_xcodebuild_fails_fast() {
    let workspace = tempdir().expect("temp");
    fs::create_dir_all(workspace.path().join("ios/BradOS")).expect("prepare dirs");
    let runner = FakeRunner::new(vec![
        FakeRunner::response(0, "xcodegen 0.0.1\n"),
        FakeRunner::response(1, ""),
    ]);
    let result = run_with_runner(&[], workspace.path(), &runner);
    assert_eq!(result.expect_err("failed"), "xcodebuild not found");
    assert_eq!(runner.calls.borrow().len(), 2);
}

#[test]
fn missing_xcrun_fails_fast() {
    let workspace = tempdir().expect("temp");
    fs::create_dir_all(workspace.path().join("ios/BradOS")).expect("prepare dirs");
    let runner = FakeRunner::new(vec![
        FakeRunner::response(0, "xcodegen 0.1.0\n"),
        FakeRunner::response(0, "Xcode 15.0\n"),
        FakeRunner::response(1, ""),
    ]);
    let result = run_with_runner(&[], workspace.path(), &runner);
    assert_eq!(result.expect_err("failed"), "xcrun not found");
    assert_eq!(runner.calls.borrow().len(), 3);
}

#[test]
fn run_boots_simulator_when_none_are_booted() {
    let workspace = tempdir().expect("temp");
    let ios_dir = workspace.path().join("ios/BradOS");
    fs::create_dir_all(&ios_dir).expect("prepare dirs");
    fs::write(ios_dir.join("project.yml"), "xcodegen: {}").expect("write project.yml");

    let responses = vec![
        FakeRunner::response(0, "xcodegen 0.1.0\n"),
        FakeRunner::response(0, "Xcode 15.0\n"),
        FakeRunner::response(0, "xcrun 1.0\n"),
        FakeRunner::response(0, ""),
        FakeRunner::response(0, "iPhone 14 Pro (unavailable)\n"),
        FakeRunner::response(0, "line1\nline2\nline3\nline4\nline5\nline6\nline7\n"),
        FakeRunner::response(0, ""),
    ];
    let runner = FakeRunner::new(responses);
    let report = run_with_runner(&[], workspace.path(), &runner).expect("run");

    assert!(!report
        .messages
        .iter()
        .any(|message| message.contains("Simulator already booted")));
    assert!(
        report
            .messages
            .iter()
            .any(|message| message.contains("Booting iPhone 17 Pro..."))
    );
    assert!(
        report
            .messages
            .iter()
            .any(|message| message.contains("Build succeeded"))
    );

    let calls = runner.calls.borrow();
    let command_args: Vec<Vec<String>> = calls.iter().map(|call| call.args.clone()).collect();
    assert_eq!(calls[3].program, "xcodegen");
    assert!(call_list_contains(&calls, "xcodegen", &["generate"]));
    assert!(call_list_contains(&calls, "xcrun", &["simctl", "boot", "iPhone 17 Pro"]));
    let expected_ios_dir = ios_dir.to_path_buf();
    let generate_call = calls
        .iter()
        .find(|call| call.program == "xcodegen" && call.args == vec!["generate".to_string()])
        .expect("found xcodegen generate");
    assert_eq!(generate_call.current_dir.as_ref(), Some(&expected_ios_dir));
    assert_eq!(command_args[0], vec!["--version"]);
    assert!(
        command_args
            .iter()
            .any(|args| args.first() == Some(&"-project".to_string()))
    );
}

#[test]
fn run_skips_boot_when_simulator_is_booted() {
    let workspace = tempdir().expect("temp");
    let ios_dir = workspace.path().join("ios/BradOS");
    fs::create_dir_all(&ios_dir).expect("prepare dirs");
    fs::write(ios_dir.join("project.yml"), "xcodegen: {}").expect("write project.yml");
    let project = ios_dir.join("BradOS.xcodeproj");
    fs::create_dir_all(&project).expect("prepare xcodeproj");

    let responses = vec![
        FakeRunner::response(0, "xcodegen 0.1.0\n"),
        FakeRunner::response(0, "Xcode 15.0\n"),
        FakeRunner::response(0, "xcrun 1.0\n"),
        FakeRunner::response(0, ""),
        FakeRunner::response(0, "iPhone 17 Pro ... Booted"),
        FakeRunner::response(0, ""),
        FakeRunner::response(0, ""),
        FakeRunner::response(0, ""),
        FakeRunner::response(0, ""),
    ];
    let runner = FakeRunner::new(responses);
    let report = run_with_runner(&["--skip-build".to_string()], workspace.path(), &runner).expect("run");

    assert!(report
        .messages
        .iter()
        .any(|message| message.contains("Simulator already booted")));
    assert!(
        !runner
            .calls
            .borrow()
            .iter()
            .any(|call| call.args == vec!["simctl".to_string(), "boot".to_string(), "iPhone 17 Pro".to_string()])
    );
    assert!(
        !runner
            .calls
            .borrow()
            .iter()
            .any(|call| call.args.first().is_some_and(|value| value == "build"))
    );
    assert!(
        report
            .messages
            .iter()
            .any(|message| message.contains("Skipping build sanity check (--skip-build)"))
    );
}

#[test]
fn run_bails_out_when_simulator_boot_fails() {
    let workspace = tempdir().expect("temp");
    let ios_dir = workspace.path().join("ios/BradOS");
    fs::create_dir_all(&ios_dir).expect("prepare dirs");
    fs::write(ios_dir.join("project.yml"), "xcodegen: {}").expect("write project.yml");

    let runner = FakeRunner::new(vec![
        FakeRunner::response(0, "xcodegen 0.1.0\n"),
        FakeRunner::response(0, "Xcode 15.0\n"),
        FakeRunner::response(0, "xcrun 1.0\n"),
        FakeRunner::response(0, ""),
        FakeRunner::response(0, "iPhone 14 Pro (shutdown)\n"),
        FakeRunner::response(1, "boot failed"),
    ]);
    let result = run_with_runner(&[], workspace.path(), &runner);
    assert_eq!(
        result.expect_err("failed"),
        "Could not boot 'iPhone 17 Pro'. List available: xcrun simctl list devices available"
    );
}

#[test]
fn run_fails_when_xcodebuild_build_fails() {
    let workspace = tempdir().expect("temp");
    let ios_dir = workspace.path().join("ios/BradOS");
    fs::create_dir_all(&ios_dir).expect("prepare dirs");
    fs::write(ios_dir.join("project.yml"), "xcodegen: {}").expect("write project.yml");

    let runner = FakeRunner::new(vec![
        FakeRunner::response(0, "xcodegen 0.1.0\n"),
        FakeRunner::response(0, "Xcode 15.0\n"),
        FakeRunner::response(0, "xcrun 1.0\n"),
        FakeRunner::response(0, ""),
        FakeRunner::response(0, "iPhone 17 Pro ... Booted"),
        FakeRunner::response(1, ""),
    ]);
    let result = run_with_runner(&[], workspace.path(), &runner);
    assert_eq!(
        result.expect_err("failed"),
        "xcodebuild build failed (full log is hidden by design)"
    );

    let calls = runner.calls.borrow();
    assert_eq!(calls[5].program, "xcodebuild");
}

fn call_list_contains(calls: &[CommandCall], program: &str, expected_args: &[&str]) -> bool {
    calls
        .iter()
        .any(|call| call.program == program && call.args.as_slice() == expected_args)
}
