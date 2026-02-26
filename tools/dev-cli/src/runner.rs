use std::collections::HashMap;
use std::fs::{self, OpenOptions};
use std::io;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};
use std::thread;
use std::time::{Duration, Instant};

#[derive(Debug, Clone)]
pub struct CommandCall {
    pub program: String,
    pub args: Vec<String>,
    pub current_dir: Option<PathBuf>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommandResult {
    pub status: i32,
    pub stdout: String,
}

impl CommandResult {
    pub fn success(&self) -> bool {
        self.status == 0
    }
}

pub trait CommandRunner {
    fn run(&self, command: CommandCall) -> CommandResult;
}

#[derive(Default)]
pub struct RealCommandRunner;

impl CommandRunner for RealCommandRunner {
    fn run(&self, command: CommandCall) -> CommandResult {
        let mut process = Command::new(&command.program);
        process.args(&command.args);
        if let Some(current_dir) = command.current_dir.as_deref() {
            process.current_dir(current_dir);
        }

        match process.output() {
            Ok(output) => CommandResult {
                status: output.status.code().unwrap_or(1),
                stdout: merged_output(&output.stdout, &output.stderr),
            },
            Err(_) => CommandResult {
                status: 1,
                stdout: String::new(),
            },
        }
    }
}

impl CommandCall {
    pub fn new(program: impl Into<String>, args: Vec<String>) -> Self {
        Self {
            program: program.into(),
            args,
            current_dir: None,
        }
    }

    pub fn to_vec(self) -> Vec<String> {
        let mut parts = Vec::with_capacity(1 + self.args.len());
        parts.push(self.program);
        parts.extend(self.args);
        parts
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CheckResult {
    pub name: String,
    pub exit_code: i32,
    pub elapsed_secs: u64,
}

pub struct RunOpts<'a> {
    pub name: &'a str,
    pub program: &'a str,
    pub args: &'a [&'a str],
    pub log_dir: &'a Path,
    pub env: Option<&'a [(&'a str, &'a str)]>,
}

pub struct LiveRunOpts<'a> {
    pub name: &'a str,
    pub program: &'a str,
    pub args: &'a [&'a str],
    pub env: Option<&'a [(&'a str, &'a str)]>,
}

pub fn run_check(opts: &RunOpts<'_>) -> CheckResult {
    let start = Instant::now();
    let _ = fs::create_dir_all(opts.log_dir);
    let log_path = opts.log_dir.join(format!("{}.log", opts.name));

    let mut command = Command::new(opts.program);
    command.args(opts.args);
    apply_env(&mut command, opts.env);

    let exit_code = match open_log_pair(&log_path) {
        Ok((stdout_file, stderr_file)) => {
            let status = command
                .stdout(Stdio::from(stdout_file))
                .stderr(Stdio::from(stderr_file))
                .status();
            status.ok().and_then(|s| s.code()).unwrap_or(1)
        }
        Err(error) => {
            eprintln!("failed to open {}: {error}", log_path.to_string_lossy());
            1
        }
    };

    CheckResult {
        name: opts.name.to_string(),
        exit_code,
        elapsed_secs: start.elapsed().as_secs(),
    }
}

pub fn run_status(
    program: &str,
    args: &[&str],
    cwd: Option<&Path>,
    env: &[(&str, &str)],
) -> io::Result<i32> {
    let mut command = Command::new(program);
    command.args(args);
    if let Some(cwd) = cwd {
        command.current_dir(cwd);
    }
    for (key, value) in env {
        command.env(key, value);
    }
    Ok(command.status()?.code().unwrap_or(1))
}

pub fn run_output(
    program: &str,
    args: &[&str],
    cwd: Option<&Path>,
    env: &[(&str, &str)],
) -> io::Result<CommandResult> {
    let mut command = Command::new(program);
    command.args(args);
    if let Some(cwd) = cwd {
        command.current_dir(cwd);
    }
    for (key, value) in env {
        command.env(key, value);
    }

    let output = command.output()?;
    Ok(CommandResult {
        status: output.status.code().unwrap_or(1),
        stdout: merged_output(&output.stdout, &output.stderr),
    })
}

pub fn run_to_file_detach(
    program: &str,
    args: &[&str],
    cwd: Option<&Path>,
    env: &[(&str, &str)],
    log_file: &Path,
) -> io::Result<u32> {
    if let Some(parent) = log_file.parent() {
        fs::create_dir_all(parent)?;
    }

    let (stdout_file, stderr_file) = open_log_pair(log_file)?;

    let mut command = Command::new(program);
    command
        .args(args)
        .stdout(Stdio::from(stdout_file))
        .stderr(Stdio::from(stderr_file))
        .stdin(Stdio::null());
    if let Some(cwd) = cwd {
        command.current_dir(cwd);
    }
    for (key, value) in env {
        command.env(key, value);
    }

    let child = command.spawn()?;
    Ok(child.id())
}

pub fn run_passthrough(program: &str, args: &[&str]) -> (i32, u64) {
    run_passthrough_internal(program, args, None)
}

pub fn run_passthrough_with_env(
    program: &str,
    args: &[&str],
    env: &HashMap<String, String>,
) -> (i32, u64) {
    run_passthrough_internal(program, args, Some(env))
}

pub fn run_live_interrupted(opts: &LiveRunOpts<'_>, interrupt: &Arc<AtomicBool>) -> i32 {
    let mut command = Command::new(opts.program);
    command
        .args(opts.args)
        .stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());
    apply_env(&mut command, opts.env);

    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(error) => {
            eprintln!(
                "failed to launch {} ({}): {error}",
                opts.name, opts.program
            );
            return 1;
        }
    };

    loop {
        if interrupt.load(Ordering::SeqCst) {
            let _ = child.kill();
            let _ = child.wait();
            return 130;
        }

        match child.try_wait() {
            Ok(Some(status)) => return status.code().unwrap_or(1),
            Ok(None) => thread::sleep(Duration::from_millis(100)),
            Err(error) => {
                eprintln!(
                    "error while waiting for {} ({}): {error}",
                    opts.name, opts.program
                );
                return 1;
            }
        }
    }
}

pub fn read_lines_tail(path: &Path, max_lines: usize) -> io::Result<Vec<String>> {
    if max_lines == 0 {
        return Ok(Vec::new());
    }
    if !path.exists() {
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(path)?;
    let lines: Vec<String> = content.lines().map(str::to_string).collect();
    let start = lines.len().saturating_sub(max_lines);
    Ok(lines[start..].to_vec())
}

pub fn kill_listener_pids(port: u16) -> io::Result<()> {
    let output = Command::new("lsof")
        .args(["-tiTCP", &port.to_string(), "-sTCP:LISTEN"])
        .output()?;

    for pid in String::from_utf8_lossy(&output.stdout).lines() {
        let trimmed = pid.trim();
        if trimmed.is_empty() {
            continue;
        }
        let _ = Command::new("kill").arg(trimmed).status();
    }
    Ok(())
}

pub fn is_process_running(pid: u32) -> bool {
    Command::new("kill")
        .args(["-0", &pid.to_string()])
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

pub fn command_exists(name: &str) -> bool {
    Command::new("sh")
        .arg("-c")
        .arg(format!("command -v {name} >/dev/null 2>&1"))
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn run_passthrough_internal(
    program: &str,
    args: &[&str],
    env: Option<&HashMap<String, String>>,
) -> (i32, u64) {
    let start = Instant::now();
    let mut command = Command::new(program);
    command
        .args(args)
        .stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());

    if let Some(env) = env {
        for (key, value) in env {
            command.env(key, value);
        }
    }

    let code = command
        .status()
        .ok()
        .and_then(|status| status.code())
        .unwrap_or(1);
    let elapsed_ms = start.elapsed().as_millis() as u64;
    (code, elapsed_ms)
}

fn apply_env(command: &mut Command, env: Option<&[(&str, &str)]>) {
    if let Some(env) = env {
        for (key, value) in env {
            command.env(key, value);
        }
    }
}

fn open_log_pair(path: &Path) -> io::Result<(std::fs::File, std::fs::File)> {
    let stdout_file = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(path)?;
    let stderr_file = OpenOptions::new().create(true).append(true).open(path)?;
    Ok((stdout_file, stderr_file))
}

fn merged_output(stdout: &[u8], stderr: &[u8]) -> String {
    let mut merged = String::new();
    merged.push_str(&String::from_utf8_lossy(stdout));
    merged.push_str(&String::from_utf8_lossy(stderr));
    merged
}
