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

/// Run a subprocess, capture stdout+stderr to a log file, and return the result.
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn run_check_writes_stdout_to_log() {
        let dir = tempfile::tempdir().unwrap();
        let result = run_check(&RunOpts {
            name: "echo-test",
            program: "echo",
            args: &["hello"],
            log_dir: dir.path(),
            env: None,
        });
        assert_eq!(result.name, "echo-test");
        assert_eq!(result.exit_code, 0);
        let log = std::fs::read_to_string(dir.path().join("echo-test.log")).unwrap();
        assert!(log.contains("hello"));
    }

    #[test]
    fn run_check_preserves_failure_status() {
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
    fn run_check_records_env_value() {
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
    fn run_check_reports_command_error() {
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
        assert!(log.contains("Failed to execute command"));
    }
}
