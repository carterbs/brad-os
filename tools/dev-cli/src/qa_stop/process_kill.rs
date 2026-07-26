use std::fs;
use std::path::Path;
use std::time::Duration;

use crate::qa_process::{terminate_owned_process, QaProcessIdentity, TerminationOutcome};
use crate::runner::CommandRunner;

pub fn stop_pid_file<R: CommandRunner>(
    pid_file: &Path,
    name: &str,
    identity: &QaProcessIdentity,
    runner: &R,
    sleep: &dyn Fn(Duration),
) -> std::io::Result<String> {
    if !pid_file.exists() {
        return Ok(format!("{name}: no pid file at {}", pid_file.display()));
    }

    let mut pid = fs::read_to_string(pid_file)?;
    pid = pid.trim().to_string();

    if pid.is_empty() {
        let _ = fs::remove_file(pid_file);
        return Ok(format!("{name}: pid file was empty, removed."));
    }

    let parsed_pid = match pid.parse::<u32>() {
        Ok(parsed_pid) => parsed_pid,
        Err(_) => {
            let _ = fs::remove_file(pid_file);
            return Ok(format!("{name}: invalid pid file removed."));
        }
    };

    match terminate_owned_process(runner, parsed_pid, identity, sleep) {
        TerminationOutcome::AlreadyStopped => {
            let _ = fs::remove_file(pid_file);
            Ok(format!("{name}: process {pid} was already stopped"))
        }
        TerminationOutcome::RefusedUnowned => {
            let _ = fs::remove_file(pid_file);
            Ok(format!(
                "{name}: refused to stop unowned pid {pid}; stale pid file removed"
            ))
        }
        TerminationOutcome::Stopped => {
            let _ = fs::remove_file(pid_file);
            Ok(format!("{name}: stopped pid {pid}"))
        }
    }
}
