use crate::runner::{CommandCall, CommandRunner};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::time::Duration;

pub const API_COMMAND_MARKER: &str = "packages/functions/lib/server.js";
pub const OTEL_COMMAND_MARKER: &str = "scripts/otel-collector/index.ts";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct QaProcessIdentity {
    pub worktree_root: PathBuf,
    pub command_marker: String,
}

impl QaProcessIdentity {
    pub fn new(worktree_root: &Path, command_marker: &str) -> Self {
        Self {
            worktree_root: worktree_root.to_path_buf(),
            command_marker: command_marker.to_string(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TerminationOutcome {
    AlreadyStopped,
    RefusedUnowned,
    Stopped,
}

pub fn read_pid_file(path: &Path) -> Option<u32> {
    fs::read_to_string(path).ok()?.trim().parse::<u32>().ok()
}

pub fn is_process_running<R: CommandRunner>(runner: &R, pid: u32) -> bool {
    runner
        .run(CommandCall::new(
            "kill",
            vec!["-0".to_string(), pid.to_string()],
        ))
        .success()
}

pub fn is_owned_process<R: CommandRunner>(
    runner: &R,
    pid: u32,
    identity: &QaProcessIdentity,
) -> bool {
    let command = runner.run(CommandCall::new(
        "ps",
        vec![
            "-p".to_string(),
            pid.to_string(),
            "-o".to_string(),
            "command=".to_string(),
        ],
    ));
    if !command.success() || !command.stdout.contains(&identity.command_marker) {
        return false;
    }

    let cwd = runner.run(CommandCall::new(
        "lsof",
        vec![
            "-a".to_string(),
            "-p".to_string(),
            pid.to_string(),
            "-d".to_string(),
            "cwd".to_string(),
            "-Fn".to_string(),
        ],
    ));
    if !cwd.success() {
        return false;
    }

    process_cwd(&cwd.stdout)
        .is_some_and(|process_root| paths_match(&process_root, &identity.worktree_root))
}

pub fn listener_pids<R: CommandRunner>(runner: &R, port: u16) -> io::Result<Vec<u32>> {
    let result = runner.run(CommandCall::new(
        "lsof",
        vec![
            "-nP".to_string(),
            format!("-tiTCP:{port}"),
            "-sTCP:LISTEN".to_string(),
        ],
    ));

    let mut pids = result
        .stdout
        .split_whitespace()
        .filter_map(|value| value.parse::<u32>().ok())
        .collect::<Vec<_>>();
    pids.sort_unstable();
    pids.dedup();

    if result.success() || (!result.success() && pids.is_empty() && result.stdout.trim().is_empty())
    {
        return Ok(pids);
    }

    Err(io::Error::other(format!(
        "Unable to inspect listeners on port {port}: {}",
        result.stdout.trim()
    )))
}

pub fn terminate_owned_process<R: CommandRunner>(
    runner: &R,
    pid: u32,
    identity: &QaProcessIdentity,
    sleep: &dyn Fn(Duration),
) -> TerminationOutcome {
    if !is_process_running(runner, pid) {
        return TerminationOutcome::AlreadyStopped;
    }
    if !is_owned_process(runner, pid, identity) {
        return TerminationOutcome::RefusedUnowned;
    }

    let _ = runner.run(CommandCall::new("kill", vec![pid.to_string()]));
    sleep(Duration::from_secs(1));

    if is_process_running(runner, pid) {
        if !is_owned_process(runner, pid, identity) {
            return TerminationOutcome::RefusedUnowned;
        }
        let _ = runner.run(CommandCall::new(
            "kill",
            vec!["-9".to_string(), pid.to_string()],
        ));
    }

    TerminationOutcome::Stopped
}

fn process_cwd(output: &str) -> Option<PathBuf> {
    output
        .lines()
        .find_map(|line| line.strip_prefix('n'))
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
}

fn paths_match(left: &Path, right: &Path) -> bool {
    let normalized_left = left.canonicalize().unwrap_or_else(|_| left.to_path_buf());
    let normalized_right = right.canonicalize().unwrap_or_else(|_| right.to_path_buf());
    normalized_left == normalized_right
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runner::CommandResult;
    use std::cell::RefCell;
    use std::collections::VecDeque;

    struct FakeRunner {
        responses: RefCell<VecDeque<CommandResult>>,
    }

    impl FakeRunner {
        fn new(responses: Vec<CommandResult>) -> Self {
            Self {
                responses: RefCell::new(VecDeque::from(responses)),
            }
        }
    }

    impl CommandRunner for FakeRunner {
        fn run(&self, _command: CommandCall) -> CommandResult {
            self.responses
                .borrow_mut()
                .pop_front()
                .expect("unexpected command")
        }
    }

    fn response(status: i32, stdout: &str) -> CommandResult {
        CommandResult {
            status,
            stdout: stdout.to_string(),
        }
    }

    #[test]
    fn listener_pid_parser_sorts_and_deduplicates() {
        let runner = FakeRunner::new(vec![response(0, "42\n7\n42\n")]);
        assert_eq!(listener_pids(&runner, 15_000).expect("listeners"), [7, 42]);
    }

    #[test]
    fn ownership_requires_both_command_and_worktree() {
        let root = tempfile::tempdir().expect("root");
        let identity = QaProcessIdentity::new(root.path(), API_COMMAND_MARKER);
        let runner = FakeRunner::new(vec![
            response(0, "node packages/functions/lib/server.js"),
            response(0, &format!("p42\nfcwd\nn{}\n", root.path().display())),
        ]);

        assert!(is_owned_process(&runner, 42, &identity));
    }

    #[test]
    fn ownership_rejects_wrong_worktree() {
        let root = tempfile::tempdir().expect("root");
        let other = tempfile::tempdir().expect("other");
        let identity = QaProcessIdentity::new(root.path(), API_COMMAND_MARKER);
        let runner = FakeRunner::new(vec![
            response(0, "node packages/functions/lib/server.js"),
            response(0, &format!("p42\nfcwd\nn{}\n", other.path().display())),
        ]);

        assert!(!is_owned_process(&runner, 42, &identity));
    }

    #[test]
    fn refuses_to_terminate_unowned_live_pid() {
        let root = tempfile::tempdir().expect("root");
        let identity = QaProcessIdentity::new(root.path(), API_COMMAND_MARKER);
        let runner = FakeRunner::new(vec![response(0, ""), response(0, "python unrelated.py")]);

        assert_eq!(
            terminate_owned_process(&runner, 42, &identity, &|_| {}),
            TerminationOutcome::RefusedUnowned
        );
    }
}
