use std::cell::RefCell;
use std::collections::{HashSet, VecDeque};
use std::fs;
use std::path::{Path, PathBuf};

use dev_cli::setup_ios_testing::{
    parse_args, run_setup, CommandOutput, CommandRunner, SetupConfig, SetupError,
};
use tempfile::tempdir;

#[derive(Debug, Clone)]
struct CommandCall {
    program: String,
    args: Vec<String>,
    cwd: Option<PathBuf>,
}

#[derive(Debug, Clone)]
struct RunReport {
    messages: Vec<String>,
}

#[derive(Debug, Clone)]
struct FakeRunner {
    calls: RefCell<Vec<CommandCall>>,
    responses: RefCell<VecDeque<CommandOutput>>,
    available: RefCell<HashSet<String>>,
}

impl FakeRunner {
    fn new(responses: Vec<CommandOutput>) -> Self {
        Self {
            calls: RefCell::new(Vec::new()),
            responses: RefCell::new(VecDeque::from(responses)),
            available: RefCell::new(HashSet::new()),
        }
    }

    fn with_available(self, commands: &[&str]) -> Self {
        let mut avail = self.available.borrow_mut();
        for command in commands {
            avail.insert((*command).to_string());
        }
        drop(avail);
        self
    }

    fn response(status: i32, stdout: &str) -> CommandOutput {
        CommandOutput {
            stdout: stdout.to_string(),
            stderr: String::new(),
            exit_code: status,
        }
    }
}

impl CommandRunner for FakeRunner {
    fn exists(&self, name: &str) -> bool {
        self.available.borrow().contains(name)
    }

    fn run(
        &self,
        program: &str,
        args: &[&str],
        cwd: Option<&Path>,
    ) -> Result<CommandOutput, SetupError> {
        self.calls.borrow_mut().push(CommandCall {
            program: program.to_string(),
            args: args.iter().map(ToString::to_string).collect(),
            cwd: cwd.map(Path::to_path_buf),
        });
        Ok(self
            .responses
            .borrow_mut()
            .pop_front()
            .unwrap_or_else(|| CommandOutput {
                stdout: String::new(),
                stderr: String::new(),
                exit_code: 0,
            }))
    }
}

fn parse_test_setup_args(workspace: &Path, args: &[String]) -> SetupConfig {
    let skip_build = parse_args(args).expect("parsed test args");
    let mut config = SetupConfig::new(workspace, skip_build);
    config.ios_dir = workspace.join("ios/BradOS");
    config.derived_data = workspace.join(".cache/brad-os-derived-data");
    config
}

fn usage_text() -> &'static str {
    "Usage: brad-setup-ios-testing [--skip-build]\n  --help\n  --skip-build\n"
}

fn run_with_runner(
    args: &[String],
    workspace: &Path,
    runner: &mut FakeRunner,
) -> Result<RunReport, String> {
    if args.iter().any(|arg| arg == "--help" || arg == "-h") {
        return Ok(RunReport {
            messages: vec![usage_text().to_string()],
        });
    }

    let config = parse_test_setup_args(workspace, args);
    let mut output = Vec::new();

    match run_setup(&mut output, runner, &config) {
        Ok(()) => Ok(RunReport {
            messages: String::from_utf8_lossy(&output)
                .lines()
                .filter(|line| !line.trim().is_empty())
                .map(ToString::to_string)
                .collect(),
        }),
        Err(error) => Err(match error {
            SetupError::MissingCommand { command, .. } => command,
            SetupError::CommandExecutionFailed {
                command,
                output,
                ..
            } => {
                format!("{command} failed: {output}")
            }
            SetupError::CommandFailed { command, .. } => {
                if command == "xcodebuild build" {
                    "xcodebuild build failed (full log is hidden by design)".to_string()
                } else if command.starts_with("xcrun simctl boot ") {
                    "Could not boot 'iPhone 17 Pro'. List available: xcrun simctl list devices available"
                        .to_string()
                } else {
                    format!("{command} failed")
                }
            }
            SetupError::MissingProjectFile => {
                "ios/BradOS/project.yml not found — are you in the repo root?".to_string()
            }
            SetupError::MissingArgument(arg) => format!("unknown argument: {arg}"),
        }),
    }
}

#[test]
fn parse_args_defaults_to_run() {
    let parsed = parse_args(&[]).expect("default args should parse");
    assert!(!parsed);
}

#[test]
fn parse_args_supports_skip_build() {
    let parsed = parse_args(&["--skip-build".to_string()]).expect("skip-build should parse");
    assert!(parsed);
}

#[test]
fn parse_args_unknown_arg_is_error() {
    assert!(parse_args(&["--does-not-exist".to_string()]).is_err());
}

#[test]
fn usage_mentions_skip_build_and_help() {
    let usage = usage_text();
    assert!(usage.contains("--skip-build"));
    assert!(usage.contains("-h, --help") || usage.contains("--help"));
}

#[test]
fn help_mode_prints_usage_only() {
    let workspace = tempdir().expect("temp");
    let mut runner = FakeRunner::new(vec![]);
    let report = run_with_runner(&["--help".to_string()], workspace.path(), &mut runner)
        .expect("run");
    assert_eq!(report.messages, vec![usage_text().to_string()]);
}

#[test]
fn missing_xcodegen_fails_fast() {
    let workspace = tempdir().expect("temp");
    fs::create_dir_all(workspace.path().join("ios/BradOS")).expect("prepare dirs");
    let mut runner = FakeRunner::new(vec![FakeRunner::response(0, "")]).with_available(&[
        "xcodebuild",
        "xcrun",
    ]);
    let result = run_with_runner(&[], workspace.path(), &mut runner);
    assert_eq!(result.expect_err("failed"), "xcodegen not found");
    assert_eq!(runner.calls.borrow().len(), 0);
}

#[test]
fn missing_project_file_fails_before_generation() {
    let workspace = tempdir().expect("temp");
    fs::create_dir_all(workspace.path().join("ios/BradOS")).expect("prepare dirs");
    let mut runner = FakeRunner::new(vec![
        FakeRunner::response(0, "xcodegen 0.1.0\n"),
        FakeRunner::response(0, "Xcode 15.0\n"),
    ])
    .with_available(&["xcodegen", "xcodebuild", "xcrun"]);
    let result = run_with_runner(&[], workspace.path(), &mut runner);
    assert_eq!(
        result.expect_err("failed"),
        "ios/BradOS/project.yml not found — are you in the repo root?"
    );
    assert_eq!(runner.calls.borrow().len(), 2);
}

#[test]
fn missing_xcodebuild_fails_fast() {
    let workspace = tempdir().expect("temp");
    fs::create_dir_all(workspace.path().join("ios/BradOS")).expect("prepare dirs");
    let mut runner = FakeRunner::new(vec![
        FakeRunner::response(0, "xcodegen 0.0.1\n"),
    ])
    .with_available(&["xcodegen", "xcrun"]);
    let result = run_with_runner(&[], workspace.path(), &mut runner);
    assert_eq!(result.expect_err("failed"), "xcodebuild not found");
    assert_eq!(runner.calls.borrow().len(), 1);
}

#[test]
fn missing_xcrun_fails_fast() {
    let workspace = tempdir().expect("temp");
    fs::create_dir_all(workspace.path().join("ios/BradOS")).expect("prepare dirs");
    let mut runner = FakeRunner::new(vec![
        FakeRunner::response(0, "xcodegen 0.1.0\n"),
        FakeRunner::response(0, "Xcode 15.0\n"),
    ])
    .with_available(&["xcodegen", "xcodebuild"]);
    let result = run_with_runner(&[], workspace.path(), &mut runner);
    assert_eq!(result.expect_err("failed"), "xcrun not found");
    assert_eq!(runner.calls.borrow().len(), 2);
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
        FakeRunner::response(0, ""),
        FakeRunner::response(0, "iPhone 14 Pro (unavailable)\n"),
        FakeRunner::response(0, "line1\nline2\nline3\nline4\nline5\nline6\nline7\n"),
    ];
    let mut runner = FakeRunner::new(responses).with_available(&["xcodegen", "xcodebuild", "xcrun"]);
    let report = run_with_runner(&[], workspace.path(), &mut runner).expect("run");

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
    assert_eq!(calls[2].program, "xcodegen");
    assert!(call_list_contains(&calls, "xcodegen", &["generate"]));
    assert!(call_list_contains(&calls, "xcrun", &["simctl", "boot", "iPhone 17 Pro"]));
    let expected_ios_dir = ios_dir.to_path_buf();
    let generate_call = calls
        .iter()
        .find(|call| call.program == "xcodegen" && call.args == vec!["generate".to_string()])
        .expect("found xcodegen generate");
    assert_eq!(generate_call.cwd.as_ref(), Some(&expected_ios_dir));
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
        FakeRunner::response(0, ""),
        FakeRunner::response(0, "iPhone 17 Pro ... Booted"),
    ];
    let mut runner = FakeRunner::new(responses).with_available(&["xcodegen", "xcodebuild", "xcrun"]);
    let report = run_with_runner(&["--skip-build".to_string()], workspace.path(), &mut runner)
        .expect("run");

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

    let mut runner = FakeRunner::new(vec![
        FakeRunner::response(0, "xcodegen 0.1.0\n"),
        FakeRunner::response(0, "Xcode 15.0\n"),
        FakeRunner::response(0, ""),
        FakeRunner::response(0, "iPhone 14 Pro (shutdown)\n"),
        FakeRunner::response(1, "boot failed"),
    ])
    .with_available(&["xcodegen", "xcodebuild", "xcrun"]);
    let result = run_with_runner(&[], workspace.path(), &mut runner);
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

    let mut runner = FakeRunner::new(vec![
        FakeRunner::response(0, "xcodegen 0.1.0\n"),
        FakeRunner::response(0, "Xcode 15.0\n"),
        FakeRunner::response(0, ""),
        FakeRunner::response(0, "iPhone 17 Pro ... Booted"),
        FakeRunner::response(1, ""),
    ])
    .with_available(&["xcodegen", "xcodebuild", "xcrun"]);
    let result = run_with_runner(&[], workspace.path(), &mut runner);
    assert_eq!(
        result.expect_err("failed"),
        "xcodebuild build failed (full log is hidden by design)"
    );

    let calls = runner.calls.borrow();
    assert_eq!(calls[4].program, "xcodebuild");
}

fn call_list_contains(calls: &[CommandCall], program: &str, expected_args: &[&str]) -> bool {
    calls
        .iter()
        .any(|call| call.program == program && call.args.as_slice() == expected_args)
}
