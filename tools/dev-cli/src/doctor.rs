use crate::runner;
use owo_colors::OwoColorize;
use regex::Regex;
use std::io::{self, Write};
use std::path::PathBuf;
use std::process::{Command, Stdio};

const LABEL_WIDTH: usize = 18;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProbeResult {
    pub installed: bool,
    pub version: Option<String>,
}

#[derive(Debug, Clone)]
pub struct RuntimeContext {
    pub repo_root: PathBuf,
    pub hooks_path: String,
    pub has_node_modules: bool,
}

#[derive(Debug)]
struct ToolSpec {
    name: &'static str,
    install_command: &'static str,
    min_major: Option<u32>,
}

static TOOL_SPECS: &[ToolSpec] = &[
    ToolSpec {
        name: "node",
        install_command: "brew install node@22  # or: nvm install 22",
        min_major: Some(22),
    },
    ToolSpec {
        name: "npm",
        install_command: "# npm comes with Node — reinstall Node to update npm",
        min_major: Some(10),
    },
    ToolSpec {
        name: "firebase",
        install_command: "npm install -g firebase-tools",
        min_major: None,
    },
    ToolSpec {
        name: "cargo",
        install_command: "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh",
        min_major: None,
    },
    ToolSpec {
        name: "gitleaks",
        install_command: "brew install gitleaks",
        min_major: None,
    },
    ToolSpec {
        name: "xcodegen",
        install_command: "brew install xcodegen",
        min_major: None,
    },
];

impl RuntimeContext {
    pub fn current() -> io::Result<Self> {
        let repo_root = std::env::current_dir()?;
        let hooks_path = Command::new("git")
            .args(["config", "core.hooksPath"])
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .output()
            .ok()
            .filter(|o| o.status.success())
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .unwrap_or_default();

        let has_node_modules = repo_root.join("node_modules").is_dir();

        Ok(Self {
            repo_root,
            hooks_path,
            has_node_modules,
        })
    }
}

pub fn run<W, P>(writer: &mut W, fast_mode: bool, probe_tool: P, context: &RuntimeContext) -> io::Result<i32>
where
    W: Write,
    P: Fn(&str) -> ProbeResult,
{
    let mut issues = 0u32;
    let mut install_commands: Vec<&'static str> = Vec::new();

    writeln!(writer)?;

    for spec in TOOL_SPECS {
        let probe = probe_tool(spec.name);
        if !probe.installed {
            issues += 1;
            install_commands.push(spec.install_command);
            print_line(writer, false, spec.name, "not found")?;
            continue;
        }

        let detail = if fast_mode {
            "installed (fast)".to_string()
        } else if let Some(min_major) = spec.min_major {
            if let Some(version) = probe.version {
                if let Some(major) = major_from_version(&version) {
                    if major < min_major {
                        issues += 1;
                        install_commands.push(spec.install_command);
                        format!("v{version} (need ≥ {min_major})")
                    } else {
                        format!("v{version} (≥ {min_major})")
                    }
                } else {
                    "installed".to_string()
                }
            } else {
                "installed".to_string()
            }
        } else {
            "installed".to_string()
        };

        if detail.contains("need ≥") {
            print_line(writer, false, spec.name, &detail)?;
        } else {
            print_line(writer, true, spec.name, &detail)?;
        }
    }

    writeln!(writer)?;

    if context.hooks_path == "hooks" {
        print_line(writer, true, "git hooks", "hooks/")?;
    } else {
        issues += 1;
        install_commands.push("npm install  # sets core.hooksPath via postinstall");
        let detail = if context.hooks_path.is_empty() {
            "not configured (got: '<unset>')".to_string()
        } else {
            format!("not configured (got: '{}')", context.hooks_path)
        };
        print_line(writer, false, "git hooks", &detail)?;
    }

    if context.has_node_modules {
        print_line(writer, true, "node_modules", "present")?;
    } else {
        issues += 1;
        install_commands.push("npm install");
        print_line(writer, false, "node_modules", "missing")?;
    }

    writeln!(writer)?;
    if issues == 0 {
        writeln!(
            writer,
            "  {}  {}",
            "PASS".green().bold(),
            "All dependencies satisfied.".dimmed()
        )?;
        writeln!(writer)?;
        return Ok(0);
    }

    writeln!(
        writer,
        "  {}  {}",
        "FAIL".red().bold(),
        format!("{issues} issue(s) found. Install missing dependencies:").dimmed()
    )?;

    for command in install_commands {
        writeln!(writer, "    {command}")?;
    }
    writeln!(writer)?;

    Ok(1)
}

pub fn probe_tool(command: &str) -> ProbeResult {
    if !runner::command_exists(command) {
        return ProbeResult {
            installed: false,
            version: None,
        };
    }

    let output = probe_version_output(command, "--version").or_else(|| probe_version_output(command, "-v"));
    let version = output.and_then(|text| parse_version(&text));

    ProbeResult {
        installed: true,
        version,
    }
}

fn probe_version_output(command: &str, arg: &str) -> Option<String> {
    let output = Command::new(command)
        .arg(arg)
        .output()
        .ok()?;
    if output.status.success() || !output.stdout.is_empty() || !output.stderr.is_empty() {
        let text = String::from_utf8_lossy(&output.stdout).to_string()
            + &String::from_utf8_lossy(&output.stderr);
        if text.trim().is_empty() {
            None
        } else {
            Some(text)
        }
    } else {
        None
    }
}

pub fn parse_version(output: &str) -> Option<String> {
    let re = Regex::new(r"\d+\.\d+\.\d+").ok()?;
    re.find(output).map(|m| m.as_str().to_string())
}

pub fn major_from_version(version: &str) -> Option<u32> {
    version.split('.').next()?.parse::<u32>().ok()
}

fn print_line(writer: &mut dyn Write, ok: bool, name: &str, detail: &str) -> io::Result<()> {
    if ok {
        writeln!(
            writer,
            "  {} {:<width$} {}",
            "✓".green(),
            name,
            detail.dimmed(),
            width = LABEL_WIDTH
        )
    } else {
        writeln!(
            writer,
            "  {} {:<width$} {}",
            "✗".red(),
            name,
            detail.dimmed(),
            width = LABEL_WIDTH
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    fn passing_context() -> RuntimeContext {
        RuntimeContext {
            repo_root: std::env::current_dir().unwrap_or_else(|_| Path::new(".").to_path_buf()),
            hooks_path: "hooks".to_string(),
            has_node_modules: true,
        }
    }

    #[test]
    fn parse_version_reads_first_semver_token() {
        let output = "v22.12.0 node";
        assert_eq!(parse_version(output), Some("22.12.0".to_string()));
    }

    #[test]
    fn parse_version_reads_token_from_text_with_prefix() {
        let output = "npm 10.9.1";
        assert_eq!(parse_version(output), Some("10.9.1".to_string()));
    }

    #[test]
    fn parse_version_returns_none_when_missing() {
        assert_eq!(parse_version("no-version-here"), None);
    }

    #[test]
    fn major_from_version_parses_major() {
        assert_eq!(major_from_version("22.12.0"), Some(22));
    }

    #[test]
    fn major_from_version_returns_none_for_non_numeric() {
        assert_eq!(major_from_version("v22"), None);
    }

    #[test]
    fn run_fast_mode_reports_installed_fast_and_succeeds() {
        let context = passing_context();
        let mut output = Vec::new();
        let exit_code = run(
            &mut output,
            true,
            |_| ProbeResult {
                installed: true,
                version: Some("22.12.0".to_string()),
            },
            &context,
        )
        .unwrap();

        let text = String::from_utf8(output).unwrap();
        assert_eq!(exit_code, 0);
        assert!(text.contains("installed (fast)"));
        assert!(text.contains("PASS"));
    }

    #[test]
    fn run_enforces_version_floors_when_not_fast() {
        let context = passing_context();
        let mut output = Vec::new();
        let exit_code = run(
            &mut output,
            false,
            |tool| match tool {
                "node" => ProbeResult {
                    installed: true,
                    version: Some("21.0.0".to_string()),
                },
                _ => ProbeResult {
                    installed: true,
                    version: Some("99.0.0".to_string()),
                },
            },
            &context,
        )
        .unwrap();

        let text = String::from_utf8(output).unwrap();
        assert_eq!(exit_code, 1);
        assert!(text.contains("v21.0.0 (need ≥ 22)"));
    }

    #[test]
    fn run_appends_install_commands_for_missing_items() {
        let context = RuntimeContext {
            repo_root: std::env::current_dir().unwrap(),
            hooks_path: String::new(),
            has_node_modules: false,
        };
        let mut output = Vec::new();
        let exit_code = run(
            &mut output,
            false,
            |tool| match tool {
                "node" => ProbeResult {
                    installed: true,
                    version: Some("22.0.0".to_string()),
                },
                "npm" => ProbeResult {
                    installed: true,
                    version: Some("10.0.0".to_string()),
                },
                "firebase" => ProbeResult {
                    installed: true,
                    version: Some("13.0.0".to_string()),
                },
                "cargo" => ProbeResult {
                    installed: false,
                    version: None,
                },
                _ => ProbeResult {
                    installed: true,
                    version: Some("99.0.0".to_string()),
                },
            },
            &context,
        )
        .unwrap();

        let text = String::from_utf8(output).unwrap();
        let remediation = text
            .split("Install missing dependencies:")
            .nth(1)
            .unwrap_or_default();
        assert_eq!(exit_code, 1);
        let lines: Vec<&str> = remediation.lines().collect();
        let idx_cargo = lines.iter().position(|line| {
            line.contains("curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh")
        });
        let idx_hooks = lines.iter().position(|line| {
            line.contains("npm install  # sets core.hooksPath via postinstall")
        });
        let idx_modules = lines.iter().position(|line| line.trim() == "npm install");
        assert!(idx_cargo.is_some());
        assert!(idx_hooks.is_some());
        assert!(idx_modules.is_some());
        assert!(idx_cargo.unwrap() < idx_hooks.unwrap());
        assert!(idx_hooks.unwrap() < idx_modules.unwrap());
    }
}
