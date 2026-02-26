use std::fs;
use std::path::Path;
use std::time::Duration;

use crate::qa_stop::runner::{CommandCall, CommandRunner};

pub fn stop_pid_file<R: CommandRunner>(
    pid_file: &Path,
    name: &str,
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

    if !runner
        .run(CommandCall {
            program: "kill".to_string(),
            args: vec!["-0".to_string(), pid.clone()],
            current_dir: None,
        })
        .success()
    {
        let _ = fs::remove_file(pid_file);
        return Ok(format!("{name}: process {pid} was already stopped"));
    }

    let _ = runner.run(CommandCall {
        program: "kill".to_string(),
        args: vec!["--".to_string(), format!("-{pid}")],
        current_dir: None,
    });
    let _ = runner.run(CommandCall {
        program: "kill".to_string(),
        args: vec![pid.clone()],
        current_dir: None,
    });

    sleep(Duration::from_secs(1));

    if runner
        .run(CommandCall {
            program: "kill".to_string(),
            args: vec!["-0".to_string(), pid.clone()],
            current_dir: None,
        })
        .success()
    {
        let _ = runner.run(CommandCall {
            program: "kill".to_string(),
            args: vec!["-9".to_string(), pid.clone()],
            current_dir: None,
        });
    }

    let _ = fs::remove_file(pid_file);
    Ok(format!("{name}: stopped pid {pid}"))
}
