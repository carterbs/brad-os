use crate::runner;
use std::env;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;

const SIMULATOR_NAME: &str = "iPhone 17 Pro";

#[derive(Debug, Clone)]
pub struct SetupConfig {
    pub skip_build: bool,
    pub ios_dir: PathBuf,
    pub derived_data: PathBuf,
    pub simulator_name: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SetupError {
    CommandUnavailable {
        command: &'static str,
        suggestion: &'static str,
    },
    CommandExecutionFailed {
        command: String,
        detail: String,
        exit_code: i32,
        suggestion: &'static str,
    },
    BuildFailed,
    MissingProjectFile,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommandCall {
    pub program: String,
    pub args: Vec<String>,
    pub cwd: Option<PathBuf>,
}

#[derive(Debug, Clone)]
pub struct CommandOutput {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
}

pub trait CommandRunner {
    fn command_exists(&self, name: &str) -> bool;
    fn run(&mut self, program: &str, args: &[&str], cwd: Option<&Path>) -> CommandOutput;
}

#[derive(Default)]
pub struct RealCommandRunner {
}

impl CommandRunner for RealCommandRunner {
    fn command_exists(&self, name: &str) -> bool {
        runner::command_exists(name)
    }

    fn run(&mut self, program: &str, args: &[&str], cwd: Option<&Path>) -> CommandOutput {
        let mut command = Command::new(program);
        command.args(args);
        if let Some(path) = cwd {
            command.current_dir(path);
        }

        match command.output() {
            Ok(output) => CommandOutput {
                stdout: String::from_utf8_lossy(&output.stdout).to_string(),
                stderr: String::from_utf8_lossy(&output.stderr).to_string(),
                exit_code: output.status.code().unwrap_or(1),
            },
            Err(error) => CommandOutput {
                stdout: String::new(),
                stderr: format!("Failed to execute command: {error}"),
                exit_code: 1,
            },
        }
    }
}

pub fn parse_args(args: &[String]) -> SetupConfig {
    let skip_build = args.get(1).is_some_and(|arg| arg == "--skip-build");
    let exe_path = env::current_exe().unwrap_or_else(|_| PathBuf::from("."));
    let project_dir = exe_path
        .parent()
        .and_then(|path| locate_repo_root(path))
        .unwrap_or_else(|| env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));
    let ios_dir = project_dir.join("ios/BradOS");
    let derived_data = env::var("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("/tmp"))
        .join(".cache/brad-os-derived-data");

    SetupConfig {
        skip_build,
        ios_dir,
        derived_data,
        simulator_name: SIMULATOR_NAME.to_string(),
    }
}

fn locate_repo_root(start: &Path) -> Option<PathBuf> {
    let mut current = start;

    loop {
        let candidate = current.join("ios/BradOS/project.yml");
        if candidate.exists() {
            return Some(current.to_path_buf());
        }

        match current.parent() {
            Some(parent) => current = parent,
            None => return None,
        }
    }
}

fn first_non_empty_line(value: &str) -> String {
    value
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .unwrap_or_default()
        .to_string()
}

fn print_step<W: Write>(out: &mut W, emoji: &str, title: &str) {
    let _ = writeln!(out, "{emoji} {title}");
}

fn print_success<W: Write>(out: &mut W, message: &str) {
    let _ = writeln!(out, "  \u{001b}[32m\u{2713} {message}\u{001b}[0m");
}

fn print_fail<W: Write>(out: &mut W, message: &str, hint: &str) {
    let _ = writeln!(out, "  \u{001b}[31m\u{2717} {message}\u{001b}[0m");
    let _ = writeln!(out, "    \u{001b}[2mInstall: {hint}\u{001b}[0m");
}

fn print_tail_lines<W: Write>(output: &CommandOutput, out: &mut W) {
    let combined = format!("{}{}", output.stdout, output.stderr);
    let lines: Vec<&str> = combined.lines().collect();
    let start = lines.len().saturating_sub(5);
    for line in &lines[start..] {
        let _ = writeln!(out, "{line}");
    }
}

fn print_summary<W: Write>(out: &mut W) {
    writeln!(out).ok();
    let _ = writeln!(
        out,
        "  \u{001b}[32m\u{001b}[1m{}\u{001b}[0m",
        "iOS testing environment ready!"
    );
    writeln!(out).ok();
    writeln!(out, "  Next steps:").ok();
    writeln!(out, "    # Install and launch the app:").ok();
    writeln!(
        out,
        "    xcrun simctl install booted ~/.cache/brad-os-derived-data/Build/Products/Debug-iphonesimulator/BradOS.app"
    )
    .ok();
    writeln!(out, "    xcrun simctl launch booted com.bradcarter.brad-os").ok();
}

fn assert_command_exists<R: CommandRunner, W: Write>(
    runner: &R,
    command: &'static str,
    suggestion: &'static str,
    out: &mut W,
) -> Result<(), SetupError> {
    if !runner.command_exists(command) {
        print_fail(out, &format!("{command} not found"), suggestion);
        return Err(SetupError::CommandUnavailable {
            command,
            suggestion,
        });
    }
    Ok(())
}

pub fn execute_setup<W: Write>(
    runner: &mut impl CommandRunner,
    config: &SetupConfig,
    out: &mut W,
) -> Result<(), SetupError> {
    writeln!(out).ok();
    print_step(out, "🔍", "Checking prerequisites...");

    assert_command_exists(
        runner,
        "xcodegen",
        "brew install xcodegen",
        out,
    )?;
    let xcodegen_version = first_non_empty_line(&runner.run("xcodegen", &["--version"], None).stdout);
    print_success(
        out,
        &format!(
            "xcodegen {}",
            if xcodegen_version.is_empty() {
                "installed".to_string()
            } else {
                xcodegen_version
            }
        ),
    );

    assert_command_exists(
        runner,
        "xcodebuild",
        "Install Xcode from the Mac App Store",
        out,
    )?;
    let xcodebuild_version =
        first_non_empty_line(&runner.run("xcodebuild", &["-version"], None).stdout);
    print_success(
        out,
        &format!(
            "xcodebuild {}",
            if xcodebuild_version.is_empty() {
                "installed".to_string()
            } else {
                xcodebuild_version
            }
        ),
    );

    assert_command_exists(
        runner,
        "xcrun",
        "Install Xcode Command Line Tools: xcode-select --install",
        out,
    )?;
    print_success(out, "xcrun available");

    let project_yaml = config.ios_dir.join("project.yml");
    if !project_yaml.exists() {
        print_fail(
            out,
            "ios/BradOS/project.yml not found — are you in the repo root?",
            "Check path exists",
        );
        return Err(SetupError::MissingProjectFile);
    }
    print_success(out, "project.yml found");

    writeln!(out).ok();
    print_step(out, "🔨", "Generating Xcode project...");
    let generation = runner.run("xcodegen", &["generate"], Some(&config.ios_dir));
    if generation.exit_code != 0 {
        print_fail(
            out,
            "Failed to generate Xcode project",
            "Check xcodegen setup",
        );
        return Err(SetupError::CommandExecutionFailed {
            command: "xcodegen generate".to_string(),
            detail: generation.stderr,
            exit_code: generation.exit_code,
            suggestion: "Check xcodegen output",
        });
    }
    print_success(out, "Xcode project generated");

    writeln!(out).ok();
    print_step(out, "📱", "Checking simulator...");
    let booted = runner.run(
        "xcrun",
        &["simctl", "list", "devices", "booted"],
        None,
    );
    if booted.exit_code != 0 {
        print_fail(out, "Failed to list booted simulators", "Check xcrun simctl access");
        return Err(SetupError::CommandExecutionFailed {
            command: "xcrun simctl list devices booted".to_string(),
            detail: booted.stderr,
            exit_code: booted.exit_code,
            suggestion: "Check xcrun simctl access",
        });
    }

    let already_booted = booted.stdout.lines().any(|line| line.contains("Booted"));
    if already_booted {
        print_success(out, "Simulator already booted");
    } else {
        let _ = writeln!(out, "  Booting {}...", config.simulator_name);
        let boot = runner.run(
            "xcrun",
            &["simctl", "boot", config.simulator_name.as_str()],
            None,
        );
        if boot.exit_code != 0 {
            print_fail(
                out,
                &format!("Could not boot '{}'.", config.simulator_name),
                "List available: xcrun simctl list devices available",
            );
            return Err(SetupError::CommandExecutionFailed {
                command: "xcrun simctl boot".to_string(),
                detail: boot.stderr,
                exit_code: boot.exit_code,
                suggestion: "List available: xcrun simctl list devices available",
            });
        }
        print_success(out, &format!("{} booted", config.simulator_name));
    }

    if config.skip_build {
        writeln!(out).ok();
        writeln!(out, "⏭️  Skipping build sanity check (--skip-build)").ok();
    } else {
        writeln!(out).ok();
        writeln!(
            out,
            "🏗️  Running build sanity check (this may take a few minutes on first run)..."
        )
        .ok();
        let build = runner.run(
            "xcodebuild",
            &[
                "-project",
                &config
                    .ios_dir
                    .join("BradOS.xcodeproj")
                    .to_string_lossy()
                    .to_string(),
                "-scheme",
                "BradOS",
                "-destination",
                &format!("platform=iOS Simulator,name={}", config.simulator_name),
                "-derivedDataPath",
                &config.derived_data.to_string_lossy().to_string(),
                "-skipPackagePluginValidation",
                "build",
            ],
            None,
        );
        print_tail_lines(&build, out);
        if build.exit_code != 0 {
            print_fail(out, "iOS build failed", "Review xcodebuild output");
            return Err(SetupError::BuildFailed);
        }
        print_success(out, "Build succeeded (SwiftLint passed)");
    }

    print_summary(out);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::{HashSet, VecDeque};

    #[derive(Default)]
    struct FakeCommandRunner {
        existing: HashSet<String>,
        responses: VecDeque<CommandOutput>,
        pub calls: Vec<CommandCall>,
    }

    impl FakeCommandRunner {
        fn with_existing(mut self, command: &str) -> Self {
            self.existing.insert(command.to_string());
            self
        }

        fn with_existing_all(mut self, commands: &[&str]) -> Self {
            for command in commands {
                self.existing.insert((*command).to_string());
            }
            self
        }

        fn queue_response(&mut self, response: CommandOutput) {
            self.responses.push_back(response);
        }
    }

    impl CommandRunner for FakeCommandRunner {
        fn command_exists(&self, name: &str) -> bool {
            self.existing.contains(name)
        }

        fn run(&mut self, program: &str, args: &[&str], cwd: Option<&Path>) -> CommandOutput {
            self.calls.push(CommandCall {
                program: program.to_string(),
                args: args.iter().map(ToString::to_string).collect(),
                cwd: cwd.map(Path::to_path_buf),
            });
            self.responses.pop_front().unwrap_or(CommandOutput {
                stdout: String::new(),
                stderr: String::new(),
                exit_code: 0,
            })
        }
    }

    fn write_to_string(bytes: &[u8]) -> String {
        String::from_utf8_lossy(bytes).to_string()
    }

    fn shared_config(temp: &std::path::Path) -> (SetupConfig, PathBuf) {
        let ios_dir = temp.join("ios/BradOS");
        std::fs::create_dir_all(&ios_dir).unwrap();
        (SetupConfig {
            skip_build: false,
            ios_dir: ios_dir.clone(),
            derived_data: temp.join(".cache/brad-os-derived-data"),
            simulator_name: SIMULATOR_NAME.to_string(),
        }, ios_dir)
    }

    fn execute_with_output(config: &SetupConfig, runner: &mut FakeCommandRunner) -> (String, Result<(), SetupError>) {
        let mut output = Vec::new();
        let result = execute_setup(runner, config, &mut output);
        (write_to_string(&output), result)
    }

    #[test]
    fn parse_args_parses_skip_build_only() {
        let args = vec![
            "brad-setup-ios-testing".to_string(),
            "--skip-build".to_string(),
        ];
        let config = parse_args(&args);
        assert!(config.skip_build);
    }

    #[test]
    fn parse_args_defaults_to_no_skip_without_flag() {
        let args = vec!["brad-setup-ios-testing".to_string()];
        let config = parse_args(&args);
        assert!(!config.skip_build);
        assert_eq!(config.simulator_name, SIMULATOR_NAME);
    }

    #[test]
    fn setup_requires_xcodegen() {
        let temp = tempfile::tempdir().unwrap();
        let (config, _) = shared_config(temp.path());
        let mut runner = FakeCommandRunner::default()
            .with_existing("xcodebuild")
            .with_existing("xcrun");

        let (output, result) = execute_with_output(&config, &mut runner);
        assert!(matches!(
            result,
            Err(SetupError::CommandUnavailable {
                command: "xcodegen",
                ..
            })
        ));
        assert!(output.contains("xcodegen not found"));
    }

    #[test]
    fn skip_build_skips_build_invocation() {
        let temp = tempfile::tempdir().unwrap();
        let ios = temp.path().join("ios/BradOS");
        std::fs::create_dir_all(&ios).unwrap();
        std::fs::write(ios.join("project.yml"), "project").unwrap();
        let config = SetupConfig {
            skip_build: true,
            ios_dir: ios,
            derived_data: temp.path().join(".cache/brad-os-derived-data"),
            simulator_name: SIMULATOR_NAME.to_string(),
        };

        let mut runner = FakeCommandRunner::default()
            .with_existing_all(&["xcodegen", "xcodebuild", "xcrun"]);
        runner.queue_response(CommandOutput {
            stdout: "xcodegen 1.0.0\n".to_string(),
            stderr: String::new(),
            exit_code: 0,
        });
        runner.queue_response(CommandOutput {
            stdout: "Xcode 16.0.0\n".to_string(),
            stderr: String::new(),
            exit_code: 0,
        });
        runner.queue_response(CommandOutput {
            stdout: String::new(),
            stderr: String::new(),
            exit_code: 0,
        });
        runner.queue_response(CommandOutput {
            stdout: "=== Booted\n".to_string(),
            stderr: String::new(),
            exit_code: 0,
        });

        let (output, result) = execute_with_output(&config, &mut runner);
        assert!(result.is_ok());
        assert!(output.contains("Skipping build sanity check (--skip-build)"));
        assert!(!runner.calls.iter().any(|call| {
            call.program == "xcodebuild" && call.args.iter().any(|arg| arg == "build")
        }));
    }

    #[test]
    fn already_booted_simulator_skips_boot() {
        let temp = tempfile::tempdir().unwrap();
        let ios = temp.path().join("ios/BradOS");
        std::fs::create_dir_all(&ios).unwrap();
        std::fs::write(ios.join("project.yml"), "project").unwrap();
        let config = SetupConfig {
            skip_build: false,
            ios_dir: ios,
            derived_data: temp.path().join(".cache/brad-os-derived-data"),
            simulator_name: SIMULATOR_NAME.to_string(),
        };

        let mut runner = FakeCommandRunner::default()
            .with_existing_all(&["xcodegen", "xcodebuild", "xcrun"]);
        runner.queue_response(CommandOutput {
            stdout: "xcodegen 1.0.0\n".to_string(),
            stderr: String::new(),
            exit_code: 0,
        });
        runner.queue_response(CommandOutput {
            stdout: "Xcode 16.0.0\n".to_string(),
            stderr: String::new(),
            exit_code: 0,
        });
        runner.queue_response(CommandOutput {
            stdout: String::new(),
            stderr: String::new(),
            exit_code: 0,
        });
        runner.queue_response(CommandOutput {
            stdout: "== Booted\n".to_string(),
            stderr: String::new(),
            exit_code: 0,
        });
        runner.queue_response(CommandOutput {
            stdout: "Build line 1\nBuild line 2\nBuild line 3\nBuild line 4\nBuild line 5\nBuild line 6\n"
                .to_string(),
            stderr: String::new(),
            exit_code: 0,
        });

        let (output, result) = execute_with_output(&config, &mut runner);
        assert!(result.is_ok());
        assert!(output.contains("Simulator already booted"));
        assert!(!runner.calls.iter().any(|call| {
            call.program == "xcrun" && call.args == ["simctl", "boot", SIMULATOR_NAME]
        }));
        assert!(output.contains("Build succeeded"));
    }

    #[test]
    fn simulator_boot_failure_is_reported_and_aborts() {
        let temp = tempfile::tempdir().unwrap();
        let ios = temp.path().join("ios/BradOS");
        std::fs::create_dir_all(&ios).unwrap();
        std::fs::write(ios.join("project.yml"), "project").unwrap();
        let config = SetupConfig {
            skip_build: false,
            ios_dir: ios,
            derived_data: temp.path().join(".cache/brad-os-derived-data"),
            simulator_name: SIMULATOR_NAME.to_string(),
        };

        let mut runner = FakeCommandRunner::default()
            .with_existing_all(&["xcodegen", "xcodebuild", "xcrun"]);
        runner.queue_response(CommandOutput {
            stdout: "xcodegen 1.0.0\n".to_string(),
            stderr: String::new(),
            exit_code: 0,
        });
        runner.queue_response(CommandOutput {
            stdout: "Xcode 16.0.0\n".to_string(),
            stderr: String::new(),
            exit_code: 0,
        });
        runner.queue_response(CommandOutput {
            stdout: String::new(),
            stderr: String::new(),
            exit_code: 0,
        });
        runner.queue_response(CommandOutput {
            stdout: "=== Devices ===\n".to_string(),
            stderr: String::new(),
            exit_code: 0,
        });
        runner.queue_response(CommandOutput {
            stdout: String::new(),
            stderr: "boot failed\n".to_string(),
            exit_code: 1,
        });

        let (output, result) = execute_with_output(&config, &mut runner);
        assert!(matches!(result, Err(SetupError::CommandExecutionFailed { .. })));
        assert!(output.contains("Could not boot 'iPhone 17 Pro'."));
        assert!(!runner.calls.iter().any(|call| {
            call.program == "xcodebuild" && call.args.iter().any(|arg| arg == "build")
        }));
    }

    #[test]
    fn invocation_order_matches_expected_sequence() {
        let temp = tempfile::tempdir().unwrap();
        let ios = temp.path().join("ios/BradOS");
        std::fs::create_dir_all(&ios).unwrap();
        std::fs::write(ios.join("project.yml"), "project").unwrap();
        let config = SetupConfig {
            skip_build: false,
            ios_dir: ios.clone(),
            derived_data: temp.path().join(".cache/brad-os-derived-data"),
            simulator_name: SIMULATOR_NAME.to_string(),
        };

        let mut runner = FakeCommandRunner::default()
            .with_existing_all(&["xcodegen", "xcodebuild", "xcrun"]);
        runner.queue_response(CommandOutput {
            stdout: "xcodegen 1.0.0\n".to_string(),
            stderr: String::new(),
            exit_code: 0,
        });
        runner.queue_response(CommandOutput {
            stdout: "Xcode 16.0.0\n".to_string(),
            stderr: String::new(),
            exit_code: 0,
        });
        runner.queue_response(CommandOutput {
            stdout: String::new(),
            stderr: String::new(),
            exit_code: 0,
        });
        runner.queue_response(CommandOutput {
            stdout: "== Booted\n".to_string(),
            stderr: String::new(),
            exit_code: 0,
        });
        runner.queue_response(CommandOutput {
            stdout: "Build log\n".to_string(),
            stderr: String::new(),
            exit_code: 0,
        });

        let (_, result) = execute_with_output(&config, &mut runner);
        assert!(result.is_ok());

        let expected = vec![
            CommandCall {
                program: "xcodegen".to_string(),
                args: vec!["--version".to_string()],
                cwd: None,
            },
            CommandCall {
                program: "xcodebuild".to_string(),
                args: vec!["-version".to_string()],
                cwd: None,
            },
            CommandCall {
                program: "xcodegen".to_string(),
                args: vec!["generate".to_string()],
                cwd: Some(ios.clone()),
            },
            CommandCall {
                program: "xcrun".to_string(),
                args: vec![
                    "simctl".to_string(),
                    "list".to_string(),
                    "devices".to_string(),
                    "booted".to_string(),
                ],
                cwd: None,
            },
            CommandCall {
                program: "xcodebuild".to_string(),
                args: vec![
                    "-project".to_string(),
                    ios.join("BradOS.xcodeproj").to_string_lossy().to_string(),
                    "-scheme".to_string(),
                    "BradOS".to_string(),
                    "-destination".to_string(),
                    format!("platform=iOS Simulator,name={}", SIMULATOR_NAME),
                    "-derivedDataPath".to_string(),
                    temp.path()
                        .join(".cache/brad-os-derived-data")
                        .to_string_lossy()
                        .to_string(),
                    "-skipPackagePluginValidation".to_string(),
                    "build".to_string(),
                ],
                cwd: None,
            },
        ];
        assert_eq!(runner.calls, expected);
    }
}
