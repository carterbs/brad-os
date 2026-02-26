use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::Instant;

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
    pub env: Option<&'a HashMap<String, String>>,
}

/// Run a subprocess, capture stdout+stderr to a log file, return result.
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
            if let Ok(mut file) = fs::File::create(&log_path) {
                file.write_all(&output.stdout).ok();
                file.write_all(&output.stderr).ok();
            }
            output.status.code().unwrap_or(1)
        }
        Err(e) => {
            if let Ok(mut file) = fs::File::create(&log_path) {
                writeln!(file, "Failed to execute command: {e}").ok();
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

/// Run a command and return (exit_code, elapsed_ms). Does not capture to log.
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

/// Run a command with env vars, inheriting stdio. Returns (exit_code, elapsed_ms).
pub fn run_passthrough_with_env(
    program: &str,
    args: &[&str],
    env: &HashMap<String, String>,
) -> (i32, u64) {
    let start = Instant::now();
    let mut cmd = Command::new(program);
    cmd.args(args);
    for (k, v) in env {
        cmd.env(k, v);
    }
    let status = cmd
        .status()
        .map(|s| s.code().unwrap_or(1))
        .unwrap_or(1);
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

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
    fn run_check_failure() {
        let dir = tempfile::tempdir().unwrap();
        let result = run_check(&RunOpts {
            name: "false-test",
            program: "false",
            args: &[],
            log_dir: dir.path(),
            env: None,
        });
        assert_ne!(result.exit_code, 0);
    }

    #[test]
    fn run_check_missing_command() {
        let dir = tempfile::tempdir().unwrap();
        let result = run_check(&RunOpts {
            name: "missing",
            program: "this-command-does-not-exist-xyz",
            args: &[],
            log_dir: dir.path(),
            env: None,
        });
        assert_eq!(result.exit_code, 1);
        let log = std::fs::read_to_string(dir.path().join("missing.log")).unwrap();
        assert!(log.contains("Failed to execute"));
    }

    #[test]
    fn run_check_with_env() {
        let dir = tempfile::tempdir().unwrap();
        let mut env = HashMap::new();
        env.insert("MY_TEST_VAR".to_string(), "42".to_string());
        let result = run_check(&RunOpts {
            name: "env-test",
            program: "sh",
            args: &["-c", "echo $MY_TEST_VAR"],
            log_dir: dir.path(),
            env: Some(&env),
        });
        assert_eq!(result.exit_code, 0);
        let log = std::fs::read_to_string(dir.path().join("env-test.log")).unwrap();
        assert!(log.contains("42"));
    }

    #[test]
    fn run_passthrough_returns_exit_code() {
        let (code, _ms) = run_passthrough("true", &[]);
        assert_eq!(code, 0);
        let (code, _ms) = run_passthrough("false", &[]);
        assert_ne!(code, 0);
    }

    #[test]
    fn run_passthrough_with_env_passes_vars() {
        let mut env = HashMap::new();
        env.insert("MY_VAR".to_string(), "ok".to_string());
        let (code, _ms) =
            run_passthrough_with_env("sh", &["-c", "test \"$MY_VAR\" = ok"], &env);
        assert_eq!(code, 0);
    }

    #[test]
    fn command_exists_finds_sh() {
        assert!(command_exists("sh"));
    }

    #[test]
    fn command_exists_rejects_missing() {
        assert!(!command_exists("this-command-does-not-exist-xyz"));
    }
}
