use std::fmt;
use std::path::{Path, PathBuf};

use crate::runner::{CommandCall, CommandResult, CommandRunner};

const BOLD: &str = "\x1b[1m";
const GREEN: &str = "\x1b[32m";
const RED: &str = "\x1b[31m";
const DIM: &str = "\x1b[2m";
const RESET: &str = "\x1b[0m";
const SIMULATOR_NAME: &str = "iPhone 17 Pro";

#[derive(Debug, Clone)]
pub struct SetupIosTestingReport {
    pub messages: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ParsedArgs {
    ShowHelp,
    Run { skip_build: bool },
}

#[derive(Debug)]
pub enum ParsedArgsError {
    UnknownArgument(String),
}

#[derive(Debug)]
pub struct CliUsage;

impl fmt::Display for ParsedArgsError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ParsedArgsError::UnknownArgument(arg) => {
                write!(f, "Unknown argument: {arg}")
            }
        }
    }
}

impl fmt::Display for CliUsage {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", CliUsage::text())
    }
}

impl CliUsage {
    pub fn text() -> &'static str {
        "Usage:
  brad-setup-ios-testing [options]

Options:
  --skip-build         Skip the build sanity check.
  -h, --help           Show this help."
    }
}

pub fn parse_args(args: &[String]) -> Result<ParsedArgs, ParsedArgsError> {
    let mut skip_build = false;
    let mut index = 0;
    while index < args.len() {
        match args[index].as_str() {
            "--skip-build" => {
                skip_build = true;
                index += 1;
            }
            "-h" | "--help" => return Ok(ParsedArgs::ShowHelp),
            unknown => {
                return Err(ParsedArgsError::UnknownArgument(unknown.to_string()));
            }
        }
    }
    Ok(ParsedArgs::Run { skip_build })
}

fn ok(messages: &mut Vec<String>, text: &str) {
    messages.push(format!("  {GREEN}✓ {text}{RESET}"));
}

fn fail(messages: &mut Vec<String>, text: &str, install: Option<&str>) -> String {
    messages.push(format!("  {RED}✗ {text}{RESET}"));
    if let Some(install) = install {
        messages.push(format!("    {DIM}Install: {install}{RESET}"));
    }
    text.to_string()
}

fn run_command(program: &str, args: &[&str], current_dir: Option<PathBuf>, runner: &impl CommandRunner) -> CommandResult {
    runner.run(CommandCall {
        program: program.to_string(),
        args: args.iter().map(ToString::to_string).collect(),
        current_dir,
    })
}

fn first_stdout_line(output: &str) -> &str {
    output.lines().next().unwrap_or("unknown")
}

fn tail_lines(output: &str, count: usize) -> Vec<&str> {
    let mut lines: Vec<&str> = output.lines().filter(|value| !value.is_empty()).collect();
    if lines.len() > count {
        lines = lines.split_off(lines.len() - count);
    }
    lines
}

fn run_with_writer<R: CommandRunner>(
    args: &[String],
    repo_root: &Path,
    command_runner: &R,
) -> Result<SetupIosTestingReport, String> {
    let mut messages = Vec::new();
    let parsed = parse_args(args).map_err(|error| error.to_string())?;
    match parsed {
        ParsedArgs::ShowHelp => {
            messages.push(CliUsage::text().to_string());
            return Ok(SetupIosTestingReport { messages });
        }
        ParsedArgs::Run { skip_build } => {
            let ios_dir = repo_root.join("ios").join("BradOS");
            let derived_data = PathBuf::from(std::env::var("HOME").unwrap_or_else(|_| String::new())).join(
                ".cache/brad-os-derived-data",
            );

            messages.push(String::new());
            messages.push("🔍 Checking prerequisites...".to_string());
            let xcodegen_version = run_command("xcodegen", &["--version"], None, command_runner);
            if !xcodegen_version.success() {
                return Err(fail(
                    &mut messages,
                    "xcodegen not found",
                    Some("brew install xcodegen"),
                ));
            }
            ok(
                &mut messages,
                &format!("xcodegen {}", first_stdout_line(&xcodegen_version.stdout)),
            );

            let xcodebuild_version = run_command("xcodebuild", &["-version"], None, command_runner);
            if !xcodebuild_version.success() {
                return Err(fail(
                    &mut messages,
                    "xcodebuild not found",
                    Some("Install Xcode from the Mac App Store"),
                ));
            }
            ok(
                &mut messages,
                &format!("xcodebuild {}", first_stdout_line(&xcodebuild_version.stdout)),
            );

            let xcrun_version = run_command("xcrun", &["--version"], None, command_runner);
            if !xcrun_version.success() {
                return Err(fail(
                    &mut messages,
                    "xcrun not found",
                    Some("Install Xcode Command Line Tools: xcode-select --install"),
                ));
            }
            ok(&mut messages, "xcrun available");

            let project_file = ios_dir.join("project.yml");
            if !project_file.is_file() {
                return Err(fail(
                    &mut messages,
                    "ios/BradOS/project.yml not found — are you in the repo root?",
                    None,
                ));
            }
            ok(&mut messages, "project.yml found");

            messages.push(String::new());
            messages.push("🔨 Generating Xcode project...".to_string());
            if !run_command(
                "xcodegen",
                &["generate"],
                Some(ios_dir.clone()),
                command_runner,
            )
            .success()
            {
                return Err(fail(&mut messages, "xcodegen generate failed", None));
            }
            ok(&mut messages, "Xcode project generated");

            messages.push(String::new());
            messages.push("📱 Checking simulator...".to_string());
            let booted = run_command(
                "xcrun",
                &["simctl", "list", "devices", "booted"],
                None,
                command_runner,
            );
            let has_booted_simulator = booted
                .stdout
                .lines()
                .any(|line| line.contains("Booted"));

            if has_booted_simulator {
                ok(&mut messages, "Simulator already booted");
            } else {
                messages.push(format!("  Booting {SIMULATOR_NAME}..."));
                if !run_command(
                    "xcrun",
                    &["simctl", "boot", SIMULATOR_NAME],
                    None,
                    command_runner,
                )
                .success()
                {
                    return Err(fail(
                        &mut messages,
                        &format!(
                            "Could not boot '{SIMULATOR_NAME}'. List available: xcrun simctl list devices available"
                        ),
                        None,
                    ));
                }
                ok(&mut messages, &format!("{SIMULATOR_NAME} booted"));
            }

            if skip_build {
                messages.push(String::new());
                messages.push("⏭️  Skipping build sanity check (--skip-build)".to_string());
            } else {
                messages.push(String::new());
                messages.push("🏗️  Running build sanity check (this may take a few minutes on first run)...".to_string());
                let build_result = run_command(
                    "xcodebuild",
                    &[
                        "-project",
                        ios_dir.join("BradOS.xcodeproj").to_string_lossy().as_ref(),
                        "-scheme",
                        "BradOS",
                        "-destination",
                        "platform=iOS Simulator,name=iPhone 17 Pro",
                        "-derivedDataPath",
                        derived_data.to_string_lossy().as_ref(),
                        "-skipPackagePluginValidation",
                        "build",
                    ],
                    None,
                    command_runner,
                );
                if !build_result.success() {
                    return Err(fail(
                        &mut messages,
                        "xcodebuild build failed (full log is hidden by design)",
                        None,
                    ));
                }
                tail_lines(&build_result.stdout, 5).into_iter().for_each(|line| {
                    messages.push(line.to_string());
                });
                ok(&mut messages, "Build succeeded (SwiftLint passed)");
            }

            messages.push(String::new());
            messages.push(format!("  {GREEN}{BOLD}iOS testing environment ready!{RESET}"));
            messages.push(String::new());
            messages.push("  Next steps:".to_string());
            messages.push("    # Install and launch the app:".to_string());
            messages.push(format!(
                "    xcrun simctl install booted {}/Build/Products/Debug-iphonesimulator/BradOS.app",
                derived_data.to_string_lossy()
            ));
            messages.push("    xcrun simctl launch booted com.bradcarter.brad-os".to_string());

            Ok(SetupIosTestingReport { messages })
        }
    }
}

pub fn run_with_runner<R: CommandRunner>(
    args: &[String],
    repo_root: &Path,
    command_runner: &R,
) -> Result<SetupIosTestingReport, String> {
    run_with_writer(args, repo_root, command_runner)
}
