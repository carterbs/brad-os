use owo_colors::OwoColorize;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;

pub const DEFAULT_SIMULATOR_NAME: &str = "iPhone 17 Pro";

#[derive(Debug, Clone, PartialEq)]
pub struct SetupConfig {
    pub skip_build: bool,
    pub ios_dir: PathBuf,
    pub derived_data: PathBuf,
    pub simulator_name: String,
}

impl SetupConfig {
    pub fn new(repo_root: &Path, skip_build: bool) -> Self {
        let ios_dir = repo_root.join("ios").join("BradOS");
        let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
        let derived_data = PathBuf::from(home).join(".cache").join("brad-os-derived-data");

        Self {
            skip_build,
            ios_dir,
            derived_data,
            simulator_name: DEFAULT_SIMULATOR_NAME.to_string(),
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct CommandInvocation {
    pub program: String,
    pub args: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct CommandOutput {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
}

impl CommandOutput {
    pub fn combined_output(&self) -> String {
        let mut buffer = String::new();
        buffer.push_str(&self.stdout);
        buffer.push_str(&self.stderr);
        buffer
    }
}

pub trait CommandRunner {
    fn exists(&self, command: &str) -> bool;
    fn run(
        &self,
        command: &str,
        args: &[&str],
        cwd: Option<&Path>,
    ) -> Result<CommandOutput, SetupError>;
}

#[derive(Debug, Clone)]
pub struct SystemCommandRunner {
    pub invocations: std::sync::Arc<std::sync::Mutex<Vec<CommandInvocation>>>,
}

impl Default for SystemCommandRunner {
    fn default() -> Self {
        Self {
            invocations: std::sync::Arc::new(std::sync::Mutex::new(Vec::new())),
        }
    }
}

impl SystemCommandRunner {
    pub fn commands(&self) -> Vec<CommandInvocation> {
        self.invocations
            .lock()
            .map_or_else(|_| Vec::new(), |commands| commands.clone())
    }
}

impl CommandRunner for SystemCommandRunner {
    fn exists(&self, command: &str) -> bool {
        Command::new("which")
            .arg(command)
            .output()
            .map(|status| status.status.success())
            .unwrap_or(false)
    }

    fn run(
        &self,
        command: &str,
        args: &[&str],
        cwd: Option<&Path>,
    ) -> Result<CommandOutput, SetupError> {
        if let Ok(mut commands) = self.invocations.lock() {
            commands.push(CommandInvocation {
                program: command.to_string(),
                args: args.iter().map(|arg| arg.to_string()).collect(),
            });
        }

        let mut cmd = Command::new(command);
        cmd.args(args);
        if let Some(path) = cwd {
            cmd.current_dir(path);
        }

        let output = cmd
            .output()
            .map_err(|err| SetupError::CommandExecutionFailed {
                command: command.to_string(),
                exit_code: 1,
                output: err.to_string(),
            })?;

        Ok(CommandOutput {
            exit_code: output.status.code().unwrap_or(1),
            stdout: String::from_utf8_lossy(&output.stdout).to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        })
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum SetupError {
    MissingArgument(String),
    MissingCommand {
        command: String,
        install_hint: String,
    },
    MissingProjectFile,
    CommandFailed {
        command: String,
        exit_code: i32,
        output: String,
    },
    CommandExecutionFailed {
        command: String,
        exit_code: i32,
        output: String,
    },
}

impl std::fmt::Display for SetupError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SetupError::MissingArgument(arg) => write!(f, "unknown argument: {arg}"),
            SetupError::MissingCommand {
                command,
                install_hint,
            } => write!(f, "{command} not found. {install_hint}"),
            SetupError::MissingProjectFile => {
                write!(f, "ios/BradOS/project.yml not found — are you in the repo root?")
            }
            SetupError::CommandFailed {
                command,
                exit_code,
                output,
            } => write!(f, "{command} failed (exit {exit_code}): {output}"),
            SetupError::CommandExecutionFailed {
                command,
                exit_code,
                output,
            } => write!(f, "{command} failed to execute (exit {exit_code}): {output}"),
        }
    }
}

fn print_success(message: &str) {
    println!("  {} {}", "✓".green(), message);
}

fn print_failure(message: &str, install: Option<&str>) {
    eprintln!("  {} {}", "✗".red(), message);
    if let Some(install_hint) = install {
        eprintln!("    {}", install_hint.dimmed());
    }
}

fn print_tail_lines(output: &str) {
    let lines: Vec<&str> = output.lines().collect();
    for line in lines.iter().rev().take(5).rev() {
        println!("{line}");
    }
}

fn first_non_empty_line(stdout: &str, stderr: &str) -> String {
    stdout
        .lines()
        .chain(stderr.lines())
        .find(|line| !line.trim().is_empty())
        .unwrap_or("unknown")
        .to_string()
}

fn booted_from_output(output: &str) -> bool {
    output.lines().any(|line| line.contains("Booted"))
}

pub fn parse_args(args: &[String]) -> Result<bool, SetupError> {
    let unknown: Vec<&String> = args
        .iter()
        .filter(|arg| arg.as_str() != "--skip-build")
        .collect();

    if unknown.is_empty() {
        Ok(args.iter().any(|arg| arg.as_str() == "--skip-build"))
    } else {
        Err(SetupError::MissingArgument(unknown[0].to_string()))
    }
}

pub fn command_invocations_from_queuing_runner(runner: &SystemCommandRunner) -> Vec<CommandInvocation> {
    runner.commands()
}

pub fn run_setup<W: Write>(writer: &mut W, runner: &dyn CommandRunner, config: &SetupConfig) -> Result<(), SetupError> {
    writeln!(writer).ok();
    writeln!(writer, "🔍 Checking prerequisites...").ok();

    if !runner.exists("xcodegen") {
        print_failure("xcodegen not found", Some("brew install xcodegen"));
        return Err(SetupError::MissingCommand {
            command: "xcodegen not found".to_string(),
            install_hint: "brew install xcodegen".to_string(),
        });
    }

    let xcodegen_version = runner
        .run("xcodegen", &["--version"], None)?
        .stdout
        .lines()
        .next()
        .unwrap_or("unknown")
        .trim()
        .to_string();
    print_success(&format!("xcodegen {xcodegen_version}"));

    if !runner.exists("xcodebuild") {
        print_failure(
            "xcodebuild not found",
            Some("Install Xcode from the Mac App Store"),
        );
        return Err(SetupError::MissingCommand {
            command: "xcodebuild not found".to_string(),
            install_hint: "Install Xcode from the Mac App Store".to_string(),
        });
    }

    let xcodebuild_version_output = runner.run("xcodebuild", &["-version"], None)?;
    if xcodebuild_version_output.exit_code != 0 {
        return Err(SetupError::CommandFailed {
            command: "xcodebuild -version".to_string(),
            exit_code: xcodebuild_version_output.exit_code,
            output: xcodebuild_version_output.combined_output(),
        });
    }
    let xcodebuild_version = first_non_empty_line(
        &xcodebuild_version_output.stdout,
        &xcodebuild_version_output.stderr,
    );
    print_success(&format!("xcodebuild {xcodebuild_version}"));

    if !runner.exists("xcrun") {
        print_failure(
            "xcrun not found",
            Some("Install Xcode Command Line Tools: xcode-select --install"),
        );
        return Err(SetupError::MissingCommand {
            command: "xcrun not found".to_string(),
            install_hint: "Install Xcode Command Line Tools: xcode-select --install".to_string(),
        });
    }
    print_success("xcrun available");

    if !config.ios_dir.join("project.yml").exists() {
        return Err(SetupError::MissingProjectFile);
    }
    print_success("project.yml found");

    writeln!(writer).ok();
    writeln!(writer, "🔨 Generating Xcode project...").ok();
    let project_dir = &config.ios_dir;
    let generate = runner.run("xcodegen", &["generate"], Some(project_dir))?;
    if generate.exit_code != 0 {
        return Err(SetupError::CommandFailed {
            command: "xcodegen generate".to_string(),
            exit_code: generate.exit_code,
            output: generate.combined_output(),
        });
    }
    print_success("Xcode project generated");

    writeln!(writer).ok();
    writeln!(writer, "📱 Checking simulator...").ok();
    let booted_devices = runner.run(
        "xcrun",
        &["simctl", "list", "devices", "booted"],
        Some(project_dir),
    )?;
    if booted_devices.exit_code == 0 && booted_from_output(&booted_devices.combined_output()) {
        print_success("Simulator already booted");
    } else {
        writeln!(writer, "  Booting {}...", config.simulator_name).ok();
        let boot = runner.run(
            "xcrun",
            &["simctl", "boot", &config.simulator_name],
            Some(project_dir),
        )?;
        if boot.exit_code != 0 {
            return Err(SetupError::CommandFailed {
                command: format!("xcrun simctl boot {}", config.simulator_name),
                exit_code: boot.exit_code,
                output: boot.combined_output(),
            });
        }
        print_success(&format!("{} booted", config.simulator_name));
    }

    if config.skip_build {
        writeln!(writer).ok();
        writeln!(writer, "⏭️  Skipping build sanity check (--skip-build)").ok();
    } else {
        let project_path = config.ios_dir.join("BradOS.xcodeproj");
        let destination = format!("platform=iOS Simulator,name={}", config.simulator_name);
        let derived_data = config.derived_data.clone();
        let build_args = vec![
            "-project",
            project_path.to_str().unwrap_or_default(),
            "-scheme",
            "BradOS",
            "-destination",
            &destination,
            "-derivedDataPath",
            derived_data.to_str().unwrap_or_default(),
            "-skipPackagePluginValidation",
            "build",
        ];
        writeln!(writer).ok();
        writeln!(
            writer,
            "🏗️  Running build sanity check (this may take a few minutes on first run)..."
        )
        .ok();

        let build = runner.run("xcodebuild", &build_args, Some(project_dir))?;
        print_tail_lines(&build.combined_output());
        if build.exit_code != 0 {
            return Err(SetupError::CommandFailed {
                command: "xcodebuild build".to_string(),
                exit_code: build.exit_code,
                output: build.combined_output(),
            });
        }
        print_success("Build succeeded (SwiftLint passed)");
    }

    writeln!(writer).ok();
    println!(
        "  {}{}iOS testing environment ready!{}",
        " ".dimmed(),
        "iOS testing environment ready!".bold(),
        "".dimmed()
    );
    println!("{}", "");
    println!("  Next steps:");
    println!(
        "    # Install and launch the app:\nxcrun simctl install booted {}/Build/Products/Debug-iphonesimulator/BradOS.app",
        config.derived_data.display()
    );
    println!("    xcrun simctl launch booted com.bradcarter.brad-os");
    Ok(())
}

pub fn build_ordered_simulator_steps(config: &SetupConfig) -> Vec<String> {
    vec![
        "xcodegen --version".to_string(),
        "xcodebuild -version".to_string(),
        "xcrun".to_string(),
        "xcodegen generate".to_string(),
        format!("xcrun simctl list devices booted for {}", config.simulator_name),
    ]
}

pub fn tail_text(text: &str, count: usize) -> String {
    let mut lines: Vec<&str> = text.lines().collect();
    if lines.len() > count {
        lines = lines.split_off(lines.len() - count);
    }
    lines.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;
use std::cell::RefCell;
    use std::collections::{HashMap, VecDeque};

    fn fake_invocation(program: &str, args: &[&str]) -> CommandInvocation {
        CommandInvocation {
            program: program.to_string(),
            args: args.iter().map(|arg| arg.to_string()).collect(),
        }
    }

    #[derive(Default)]
    struct FakeRunner {
        exists: HashMap<String, bool>,
        invocations: RefCell<Vec<CommandInvocation>>,
        outputs: RefCell<VecDeque<CommandOutput>>,
    }

    impl FakeRunner {
        fn allow(&mut self, command: &str) {
            self.exists.insert(command.to_string(), true);
        }

        fn queue(&mut self, exit_code: i32, stdout: &str, stderr: &str) {
            self.outputs.borrow_mut().push_back(CommandOutput {
                exit_code,
                stdout: stdout.to_string(),
                stderr: stderr.to_string(),
            });
        }

        fn calls(&self) -> Vec<CommandInvocation> {
            self.invocations.borrow().clone()
        }
    }

    impl CommandRunner for FakeRunner {
        fn exists(&self, command: &str) -> bool {
            self.exists.get(command).copied().unwrap_or(false)
        }

        fn run(
            &self,
            command: &str,
            args: &[&str],
            _cwd: Option<&Path>,
        ) -> Result<CommandOutput, SetupError> {
            self.invocations
                .borrow_mut()
                .push(CommandInvocation {
                    program: command.to_string(),
                    args: args.iter().map(|arg| arg.to_string()).collect(),
                });

            self.outputs
                .borrow_mut()
                .pop_front()
                .ok_or_else(|| SetupError::CommandExecutionFailed {
                    command: format!("{command} {}", args.join(" ")),
                    exit_code: 1,
                    output: "missing stub output".to_string(),
                })
        }
    }

    #[test]
    fn parses_skip_build_arg() {
        let args = vec!["--skip-build".to_string()];
        assert!(parse_args(&args).expect("parse skip flag"), "skip flag should parse");
    }

    #[test]
    fn rejects_unknown_arg() {
        let args = vec!["--nope".to_string()];
        assert!(matches!(parse_args(&args), Err(SetupError::MissingArgument(_))));
    }

    #[test]
    fn detects_booted_simulators() {
        let output = "== Devices ==\n    iPhone 17 Pro (Booted)\n";
        assert!(booted_from_output(output));
        assert!(!booted_from_output("== Devices ==\n"));
    }

    #[test]
    fn command_failures_are_descriptive() {
        let config = SetupConfig::new(Path::new("/tmp"), true);
        let mut runner = FakeRunner::default();
        runner.allow("xcodegen");
        runner.allow("xcodebuild");
        runner.allow("xcrun");
        runner.queue(0, "", "");
        runner.queue(0, "2.7.0\n", "");
        runner.queue(0, "", "");
        runner.queue(0, "", "");
        let mut output = Vec::new();

        let result = run_setup(&mut output, &runner, &config);
        assert!(result.is_err());

        assert_eq!(
            format!("{}", result.expect_err("expected failure")),
            "ios/BradOS/project.yml not found — are you in the repo root?"
        );
    }

    #[test]
    fn includes_expected_step_order() {
        let temp_dir = tempfile::tempdir().unwrap();
        let ios_dir = temp_dir.path().join("ios").join("BradOS");
        std::fs::create_dir_all(&ios_dir).unwrap();
        std::fs::write(ios_dir.join("project.yml"), b"project: BradOS").unwrap();

        let derived_data = temp_dir.path().join(".cache");
        let config = SetupConfig {
            skip_build: false,
            ios_dir: ios_dir.clone(),
            derived_data,
            simulator_name: "iPhone 17 Pro".to_string(),
        };

        let mut runner = FakeRunner::default();
        runner.allow("xcodegen");
        runner.allow("xcodebuild");
        runner.allow("xcrun");
        runner.queue(0, "xcodegen 2.0.0\n", "");
        runner.queue(0, "Xcode 16.1\n", "");
        runner.queue(0, "", "");
        runner.queue(0, "generated\n", "");
        runner.queue(0, "", "");
        runner.queue(0, "", "");

        let mut sink = Vec::new();
        let result = run_setup(&mut sink, &runner, &config);
        assert!(result.is_ok());

        let calls = runner.calls();
        assert_eq!(calls.len(), 6);
        assert_eq!(calls[0], fake_invocation("xcodegen", &["--version"]));
        assert_eq!(calls[1], fake_invocation("xcodebuild", &["-version"]));
        assert_eq!(calls[2], fake_invocation("xcodegen", &["generate"]));
        assert_eq!(calls[3], fake_invocation("xcrun", &["simctl", "list", "devices", "booted"]));
        assert_eq!(calls[4], fake_invocation("xcrun", &["simctl", "boot", "iPhone 17 Pro"]));
        assert_eq!(calls[5].program, "xcodebuild");
        assert_eq!(calls[5].args.last().expect("last arg is build"), "build");
    }

    #[test]
    fn tail_text_takes_last_lines() {
        let output = "a\nb\nc\nd\ne\nf";
        assert_eq!(tail_text(output, 3), "d\ne\nf".to_string());
        assert_eq!(tail_text("a\nb", 3), "a\nb".to_string());
    }
}
