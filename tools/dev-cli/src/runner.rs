use std::fs::OpenOptions;
use std::io;
use std::path::Path;
use std::process::{Command, Output, Stdio};

pub struct CommandResult {
    pub status: i32,
    pub stdout: String,
    pub stderr: String,
}

pub fn run_status(
    program: &str,
    args: &[&str],
    current_dir: Option<&Path>,
    env_pairs: &[(&str, &str)],
) -> io::Result<i32> {
    run_output(program, args, current_dir, env_pairs).map(|result| result.status)
}

pub fn run_output(
    program: &str,
    args: &[&str],
    current_dir: Option<&Path>,
    env_pairs: &[(&str, &str)],
) -> io::Result<CommandResult> {
    let mut command = build_command(program, args, current_dir, env_pairs)?;
    let output = command.output()?;

    Ok(CommandResult {
        status: output.status.code().unwrap_or(-1),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
    })
}

pub fn run_to_file_detach(
    program: &str,
    args: &[&str],
    current_dir: Option<&Path>,
    env_pairs: &[(&str, &str)],
    stdout_file: &Path,
) -> io::Result<u32> {
    let mut command = build_command(program, args, current_dir, env_pairs)?;
    let file = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(stdout_file)?;
    let file_for_stderr = file.try_clone()?;
    command.stdout(Stdio::from(file));
    command.stderr(Stdio::from(file_for_stderr));
    let child = command.spawn()?;
    Ok(child.id())
}

fn build_command(
    program: &str,
    args: &[&str],
    current_dir: Option<&Path>,
    env_pairs: &[(&str, &str)],
) -> io::Result<Command> {
    let mut cmd = Command::new(program);
    cmd.args(args);
    if let Some(dir) = current_dir {
        cmd.current_dir(dir);
    }
    for (key, value) in env_pairs {
        cmd.env(key, value);
    }
    Ok(cmd)
}

pub fn read_lines_tail(path: &Path, max_lines: usize) -> io::Result<Vec<String>> {
    if max_lines == 0 {
        return Ok(Vec::new());
    }
    let content = std::fs::read_to_string(path)?;
    let lines: Vec<String> = content
        .lines()
        .map(str::to_string)
        .rev()
        .take(max_lines)
        .collect();
    Ok(lines.into_iter().rev().collect())
}

pub fn is_process_running(pid: u32) -> bool {
    Command::new("kill")
        .arg("-0")
        .arg(pid.to_string())
        .status()
        .is_ok_and(|status| status.success())
}

pub fn run_kill(pid: u32) -> io::Result<Output> {
    Command::new("kill").arg(pid.to_string()).output()
}

pub fn run_kill_force(pid: u32) -> io::Result<Output> {
    Command::new("kill").arg("-9").arg(pid.to_string()).output()
}

pub fn kill_listener_pids(port: u16) -> io::Result<()> {
    let output = Command::new("lsof")
        .arg(format!("-tiTCP:{}", port))
        .arg("-sTCP:LISTEN")
        .output()?;

    if !output.status.success() {
        return Ok(());
    }

    let pids = String::from_utf8_lossy(&output.stdout)
        .split_whitespace()
        .filter_map(|token| token.parse::<u32>().ok())
        .collect::<Vec<u32>>();

    for pid in pids {
        let _ = run_kill(pid);
    }

    Ok(())
}
