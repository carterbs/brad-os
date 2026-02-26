use std::collections::HashMap;
use std::fs::File;
use std::io::{self, BufRead, BufReader, Write};
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::{atomic::AtomicBool, Arc};
use std::thread;
use std::time::{Duration, Instant};

#[derive(Debug, Clone)]
pub struct CheckResult {
    pub name: String,
    pub exit_code: i32,
    pub elapsed_secs: u64,
}

#[derive(Debug)]
pub struct RunOpts<'a> {
    pub name: &'a str,
    pub program: &'a str,
    pub args: &'a [&'a str],
    pub log_dir: &'a Path,
    pub env: Option<&'a HashMap<String, String>>,
}

#[derive(Debug)]
pub struct LiveRunOpts<'a> {
    pub name: &'a str,
    pub program: &'a str,
    pub args: &'a [&'a str],
    pub env: Option<&'a HashMap<String, String>>,
}

#[derive(Debug, Clone)]
pub struct CommandCall {
    pub program: String,
    pub args: Vec<String>,
    pub current_dir: Option<std::path::PathBuf>,
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

/// Run a subprocess, capture stdout+stderr to a log file, and return a structured result.
pub fn run_check(opts: &RunOpts) -> CheckResult {
    let start = Instant::now();
    let log_path = opts.log_dir.join(format!("{}.log", opts.name));

    let mut cmd = Command::new(opts.program);
    cmd.args(opts.args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    if let Some(env) = opts.env {
        for (k, v) in env {
            cmd.env(k, v);
        }
    }

    let exit_code = match cmd.output() {
        Ok(output) => {
            if let Ok(mut file) = File::create(&log_path) {
                file.write_all(&output.stdout).ok();
                file.write_all(&output.stderr).ok();
            }
            output.status.code().unwrap_or(1)
        }
        Err(error) => {
            if let Ok(mut file) = File::create(&log_path) {
                writeln!(file, "Failed to execute command: {error}").ok();
            }
            1
        }
    };

    let elapsed = start.elapsed().as_secs();
    CheckResult {
        name: opts.name.to_string(),
        exit_code,
        elapsed_secs: elapsed,
    }
}

/// Run a command and return `(exit_code, elapsed_ms)` with inherited stdio.
pub fn run_passthrough(program: &str, args: &[&str]) -> (i32, u64) {
    let start = Instant::now();
    let status = Command::new(program)
        .args(args)
        .status()
        .map(|s| s.code().unwrap_or(1))
        .unwrap_or(1);
    let ms = start.elapsed().as_millis() as u64;
    (status, ms)
}

/// Run a command with environment variables and inherited stdio.
pub fn run_passthrough_with_env(program: &str, args: &[&str], env: &HashMap<String, String>) -> (i32, u64) {
    let start = Instant::now();
    let mut cmd = Command::new(program);
    cmd.args(args);
    for (k, v) in env {
        cmd.env(k, v);
    }
    let status = cmd.status().map(|s| s.code().unwrap_or(1)).unwrap_or(1);
    let ms = start.elapsed().as_millis() as u64;
    (status, ms)
}

/// Check if a command is available on PATH.
pub fn command_exists(name: &str) -> bool {
    Command::new("which")
        .arg(name)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

pub fn run_status(
    program: &str,
    args: &[&str],
    current_dir: Option<&Path>,
    env: &[(&str, &str)],
) -> io::Result<i32> {
    run_output(program, args, current_dir, env).map(|result| result.status)
}

pub fn run_output(
    program: &str,
    args: &[&str],
    current_dir: Option<&Path>,
    env: &[(&str, &str)],
) -> io::Result<CommandResult> {
    let mut cmd = Command::new(program);
    cmd.args(args);
    if let Some(path) = current_dir {
        cmd.current_dir(path);
    }
    for (key, value) in env {
        cmd.env(key, value);
    }

    let output = cmd.output().map_err(|error| io::Error::new(io::ErrorKind::Other, error.to_string()))?;
    Ok(CommandResult {
        status: output.status.code().unwrap_or(1),
        stdout: String::from_utf8_lossy(&output.stdout).to_string()
            + &String::from_utf8_lossy(&output.stderr).to_string(),
    })
}

pub fn run_to_file_detach(
    program: &str,
    args: &[&str],
    current_dir: Option<&Path>,
    env: &[(&str, &str)],
    log_file: &Path,
) -> io::Result<u32> {
    let mut cmd = Command::new(program);
    cmd.args(args);
    if let Some(path) = current_dir {
        cmd.current_dir(path);
    }
    for (key, value) in env {
        cmd.env(key, value);
    }

    let log = File::create(log_file)?;
    let child = cmd
        .stdin(Stdio::null())
        .stdout(Stdio::from(log.try_clone()?))
        .stderr(Stdio::from(log))
        .spawn()?;

    Ok(child.id())
}

pub fn read_lines_tail(path: &Path, max_lines: usize) -> io::Result<Vec<String>> {
    let file = File::open(path)?;
    let reader = BufReader::new(file);
    let mut lines: Vec<String> = reader.lines().collect::<Result<_, _>>()?;

    if lines.len() > max_lines {
        let start = lines.len().saturating_sub(max_lines);
        lines = lines.split_off(start);
    }

    Ok(lines)
}

pub fn run_live_interrupted(opts: &LiveRunOpts, interrupt: &Arc<AtomicBool>) -> i32 {
    let mut command = Command::new(opts.program);
    command.args(opts.args);
    for (k, v) in opts.env.unwrap_or(&HashMap::new()) {
        command.env(k, v);
    }

    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(_) => return 1,
    };

    loop {
        if interrupt.load(std::sync::atomic::Ordering::SeqCst) {
            let _ = child.kill();
            let _ = child.wait();
            return 130;
        }

        match child.try_wait() {
            Ok(Some(status)) => return status.code().unwrap_or(1),
            Ok(None) => {
                thread::sleep(Duration::from_millis(100));
                if opts.name.is_empty() {
                    // no-op branch keeps `name` intentionally referenced
                }
            }
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                return 1;
            }
        }
    }
}

pub fn kill_listener_pids(port: u16) -> usize {
    let stdout = match run_output("lsof", &[&format!("-tiTCP:{port}")], None, &[]) {
        Ok(output) => output.stdout,
        Err(_) => return 0,
    };
    let mut killed = 0usize;
    for pid in stdout.split_whitespace() {
        let _ = run_status("kill", &[pid], None, &[]);
        killed += 1;
    }
    killed
}

pub fn is_process_running(pid: u32) -> bool {
    run_status("kill", &["-0", &pid.to_string()], None, &[])
        .is_ok_and(|code| code == 0)
}

impl CommandRunner for RealCommandRunner {
    fn run(&self, command: CommandCall) -> CommandResult {
        let mut process = Command::new(&command.program);
        process.args(&command.args);
        if let Some(current_dir) = command.current_dir.as_deref() {
            process.current_dir(current_dir);
        }

        let result = match process.output() {
            Ok(output) => CommandResult {
                status: output.status.code().unwrap_or(1),
                stdout: {
                    let mut merged = String::new();
                    merged.push_str(&String::from_utf8_lossy(&output.stdout));
                    merged.push_str(&String::from_utf8_lossy(&output.stderr));
                    merged
                },
            },
            Err(_) => CommandResult {
                status: 1,
                stdout: String::new(),
            },
        };

        result
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn run_check_success() {
        let dir = tempfile::tempdir().unwrap();
        let result = run_check(&RunOpts {
            name: "echo-test",
            program: "echo",
            args: &["hello"],
            log_dir: dir.path(),
            env: None,
        });
        assert_eq!(result.exit_code, 0);
        assert_eq!(result.name, "echo-test");
        let log = std::fs::read_to_string(dir.path().join("echo-test.log")).unwrap();
        assert!(log.contains("hello"));
    }

    #[test]
    fn run_status_reports_failure_for_missing_program() {
        let status = run_status("this-command-does-not-exist-xyz", &[], None, &[]);
        assert!(status.is_err());
    }

    #[test]
    fn run_output_captures_stdout() {
        let output = run_output("printf", &["hello"], None, &[]).expect("output");
        assert_eq!(output.status, 0);
        assert!(output.stdout.contains("hello"));
    }

    #[test]
    fn command_call_stores_invocation() {
        let call = CommandCall::new("echo", vec!["hello".to_string()]);
        assert_eq!(call.program, "echo");
        assert_eq!(call.args, vec!["hello"]);
        assert!(call.current_dir.is_none());
        assert_eq!(call.to_vec(), vec!["echo", "hello"]);
    }

    #[test]
    fn is_process_running_for_missing_pid_is_false() {
        assert!(!is_process_running(999_999_999));
    }
}
