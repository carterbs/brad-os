use std::io::{self, Write};
use std::path::Path;
use std::process::Command;

use regex::Regex;

const BOLD: &str = "\x1b[1m";
const GREEN: &str = "\x1b[32m";
const RED: &str = "\x1b[31m";
const DIM: &str = "\x1b[2m";
const RESET: &str = "\x1b[0m";
const LABEL_WIDTH: usize = 18;

const INSTALL_CMDS: [&str; 9] = [
    "brew install node@22  # or: nvm install 22",
    "# npm comes with Node — reinstall Node to update npm",
    "npm install -g firebase-tools",
    "Install Rust: https://rustup.rs/",
    "brew install gitleaks",
    "brew install xcodegen",
    "Install Rust: https://rustup.rs/",
    "cargo install cargo-llvm-cov",
    "rustup component add llvm-tools-preview",
];

#[derive(Debug, PartialEq)]
pub enum ProbeResult {
    Missing,
    Installed,
    Version(String),
}

pub struct RuntimeContext {
    pub git_hooks_path: String,
    pub has_node_modules: bool,
}

impl RuntimeContext {
    pub fn current() -> Self {
        Self {
            git_hooks_path: git_hooks_path(),
            has_node_modules: Path::new("node_modules").is_dir(),
        }
    }
}

pub fn run<W, P>(
    writer: &mut W,
    fast_mode: bool,
    probe_tool: P,
    context: &RuntimeContext,
) -> io::Result<i32>
where
    W: Write,
    P: Fn(&str) -> ProbeResult,
{
    let mut issues = 0usize;
    let mut install_cmds = Vec::new();

    writeln!(writer)?;

    check_tool(
        writer,
        "node",
        INSTALL_CMDS[0],
        Some(22),
        fast_mode,
        &probe_tool,
        &mut issues,
        &mut install_cmds,
    )?;
    check_tool(
        writer,
        "npm",
        INSTALL_CMDS[1],
        Some(10),
        fast_mode,
        &probe_tool,
        &mut issues,
        &mut install_cmds,
    )?;
    check_tool(
        writer,
        "firebase",
        INSTALL_CMDS[2],
        None,
        fast_mode,
        &probe_tool,
        &mut issues,
        &mut install_cmds,
    )?;
    check_tool(
        writer,
        "cargo",
        INSTALL_CMDS[3],
        None,
        fast_mode,
        &probe_tool,
        &mut issues,
        &mut install_cmds,
    )?;
    check_tool(
        writer,
        "rustup",
        INSTALL_CMDS[6],
        None,
        fast_mode,
        &probe_tool,
        &mut issues,
        &mut install_cmds,
    )?;
    check_tool(
        writer,
        "cargo-llvm-cov",
        INSTALL_CMDS[7],
        None,
        fast_mode,
        &probe_tool,
        &mut issues,
        &mut install_cmds,
    )?;
    check_tool(
        writer,
        "llvm-tools-preview",
        INSTALL_CMDS[8],
        None,
        fast_mode,
        &probe_tool,
        &mut issues,
        &mut install_cmds,
    )?;
    check_tool(
        writer,
        "gitleaks",
        INSTALL_CMDS[4],
        None,
        fast_mode,
        &probe_tool,
        &mut issues,
        &mut install_cmds,
    )?;
    check_tool(
        writer,
        "xcodegen",
        INSTALL_CMDS[5],
        None,
        fast_mode,
        &probe_tool,
        &mut issues,
        &mut install_cmds,
    )?;

    writeln!(writer)?;

    check_setup(
        writer,
        "git hooks",
        context.git_hooks_path == "hooks",
        if context.git_hooks_path == "hooks" {
            "hooks/".to_string()
        } else {
            format!(
                "not configured (got: '{}')",
                if context.git_hooks_path.is_empty() {
                    "<unset>".to_string()
                } else {
                    context.git_hooks_path.clone()
                }
            )
        },
        "npm install  # sets core.hooksPath via postinstall",
        &mut issues,
        &mut install_cmds,
    )?;

    check_setup(
        writer,
        "node_modules",
        context.has_node_modules,
        if context.has_node_modules {
            "present".to_string()
        } else {
            "missing".to_string()
        },
        "npm install",
        &mut issues,
        &mut install_cmds,
    )?;

    if issues == 0 {
        writeln!(
            writer,
            "  {GREEN}{BOLD}PASS{RESET}  {DIM}All dependencies satisfied.{RESET}\n"
        )?;
        Ok(0)
    } else {
        writeln!(
            writer,
            "  {RED}{BOLD}FAIL{RESET}  {DIM}{issues} issue(s) found. Install missing dependencies:{RESET}\n"
        )?;
        for cmd in install_cmds {
            writeln!(writer, "    {cmd}")?;
        }
        writeln!(writer)?;
        Ok(1)
    }
}

pub fn parse_version(output: &str) -> Option<String> {
    let regex = Regex::new(r"[0-9]+\.[0-9]+\.[0-9]+").expect("valid regex");
    regex
        .find(output)
        .map(|match_result: regex::Match<'_>| match_result.as_str().to_string())
}

pub fn major_from_version(version: &str) -> Option<u32> {
    version.split('.').next()?.parse().ok()
}

pub fn probe_tool(command: &str) -> ProbeResult {
    if let Some(version) = probe_version_output(command, "--version") {
        return ProbeResult::Version(version);
    }

    if let Some(version) = probe_version_output(command, "-v") {
        return ProbeResult::Version(version);
    }

    match command_exists(command) {
        true => ProbeResult::Installed,
        false => ProbeResult::Missing,
    }
}

fn check_tool<W, P>(
    writer: &mut W,
    name: &str,
    install_cmd: &str,
    min_major: Option<u32>,
    fast_mode: bool,
    probe: &P,
    issues: &mut usize,
    install_cmds: &mut Vec<String>,
) -> io::Result<()>
where
    W: Write,
    P: Fn(&str) -> ProbeResult,
{
    match probe(name) {
        ProbeResult::Missing => {
            report_item(writer, false, name, "not found")?;
            install_cmds.push(install_cmd.to_string());
            *issues += 1;
        }
        ProbeResult::Installed | ProbeResult::Version(_) if fast_mode => {
            report_item(writer, true, name, "installed (fast)")?;
        }
        ProbeResult::Installed => {
            report_item(writer, true, name, "installed")?;
        }
        ProbeResult::Version(version) => {
            let (is_ok, detail) = match min_major {
                Some(min) => major_from_version(&version)
                    .map_or((true, format!("v{version}")), |major| {
                        if major < min {
                            (false, format!("v{version} (need ≥ {min})"))
                        } else {
                            (true, format!("v{version} (≥ {min})"))
                        }
                    }),
                None => (true, format!("v{version}")),
            };

            if is_ok {
                report_item(writer, true, name, &detail)?;
            } else {
                report_item(writer, false, name, &detail)?;
                install_cmds.push(install_cmd.to_string());
                *issues += 1;
            }
        }
    }

    Ok(())
}

fn check_setup<W>(
    writer: &mut W,
    label: &str,
    is_ok: bool,
    detail: String,
    fix_cmd: &str,
    issues: &mut usize,
    install_cmds: &mut Vec<String>,
) -> io::Result<()>
where
    W: Write,
{
    if is_ok {
        report_item(writer, true, label, &detail)?;
    } else {
        report_item(writer, false, label, &detail)?;
        install_cmds.push(fix_cmd.to_string());
        *issues += 1;
    }
    Ok(())
}

fn report_item<W: Write>(writer: &mut W, is_ok: bool, label: &str, detail: &str) -> io::Result<()> {
    let icon = if is_ok { "✓" } else { "✗" };
    let color = if is_ok { GREEN } else { RED };
    let padded = format!("{label: <width$}", width = LABEL_WIDTH);
    writeln!(writer, "  {color}{icon} {padded}{RESET} {DIM}{detail}{RESET}")
}

fn command_exists(command: &str) -> bool {
    Command::new(command).arg("--version").output().is_ok()
}

fn probe_version_output(command: &str, arg: &str) -> Option<String> {
    let output = Command::new(command).arg(arg).output().ok()?;
    let raw = String::from_utf8_lossy(&output.stdout).to_string();
    parse_version(&raw)
}

fn git_hooks_path() -> String {
    Command::new("git")
        .args(["config", "core.hooksPath"])
        .output()
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run_with_output(
        fast_mode: bool,
        probe: impl Fn(&str) -> ProbeResult,
        context: RuntimeContext,
    ) -> String {
        let mut output = Vec::new();
        run(
            &mut output,
            fast_mode,
            probe,
            &context,
        )
        .expect("doctor run should succeed");
        String::from_utf8(output).expect("utf8 output")
    }

    #[test]
    fn parses_semver_versions() {
        assert_eq!(parse_version("v22.12.0"), Some("22.12.0".to_string()));
        assert_eq!(
            parse_version("node v22.13.1 (Some text)"),
            Some("22.13.1".to_string())
        );
        assert_eq!(parse_version("no version"), None);
    }

    #[test]
    fn extracts_major_from_version() {
        assert_eq!(major_from_version("22.13.1"), Some(22));
        assert_eq!(major_from_version("bad"), None);
        assert_eq!(major_from_version(""), None);
    }

    #[test]
    fn checks_tools_in_fast_mode() {
        let output = run_with_output(
            true,
            |_command| ProbeResult::Version("13.29.1".to_string()),
            RuntimeContext {
                git_hooks_path: "hooks".to_string(),
                has_node_modules: true,
            },
        );
        assert!(output.contains("✓ node"));
        assert!(output.contains("installed (fast)"));
        assert!(output.contains("PASS"));
    }

    #[test]
    fn checks_tools_with_outdated_major_version() {
        let output = run_with_output(
            false,
            |command| match command {
                "node" => ProbeResult::Version("21.0.0".to_string()),
                _ => ProbeResult::Version("13.29.1".to_string()),
            },
            RuntimeContext {
                git_hooks_path: "hooks".to_string(),
                has_node_modules: true,
            },
        );
        assert!(output.contains("✗ node"));
        assert!(output.contains("need ≥ 22"));
        assert!(output.contains("FAIL"));
    }

    #[test]
    fn checks_tools_missing_installation() {
        let output = run_with_output(
            true,
            |command| {
                if command == "firebase" {
                    ProbeResult::Missing
                } else {
                    ProbeResult::Installed
                }
            },
            RuntimeContext {
                git_hooks_path: "hooks".to_string(),
                has_node_modules: true,
            },
        );
        assert!(output.contains("✗ firebase"));
        assert!(output.contains("npm install -g firebase-tools"));
        assert!(output.contains("FAIL"));
    }

    #[test]
    fn checks_cargo_installation_hint() {
        let output = run_with_output(
            true,
            |command| {
                if command == "cargo" {
                    ProbeResult::Missing
                } else {
                    ProbeResult::Installed
                }
            },
            RuntimeContext {
                git_hooks_path: "hooks".to_string(),
                has_node_modules: true,
            },
        );
        assert!(output.contains("✗ cargo"));
        assert!(output.contains("Install Rust: https://rustup.rs/"));
        assert!(output.contains("FAIL"));
    }

    #[test]
    fn checks_setup_state() {
        let output = run_with_output(
            true,
            |_command| ProbeResult::Installed,
            RuntimeContext {
                git_hooks_path: String::new(),
                has_node_modules: false,
            },
        );
        assert!(output.contains("✗ git hooks"));
        assert!(output.contains("not configured (got: '<unset>')"));
        assert!(output.contains("✗ node_modules"));
        assert!(output.contains("missing"));
        assert!(output.contains("npm install"));
    }
}
