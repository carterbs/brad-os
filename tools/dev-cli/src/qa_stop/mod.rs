use std::path::Path;
use std::time::Duration;

mod cli;
mod locks;
mod ports;
mod process_kill;
mod runner;
mod simulator;
mod state;

use locks::{release_matching_locks, release_lock_dir};
use ports::cleanup_listener_ports;

pub use cli::CliUsage;
pub use cli::{ParsedArgs, ParsedArgsError, parse_args};
pub use locks::is_owner_of_lock;
pub use process_kill::stop_pid_file;
pub use runner::{CommandCall, CommandResult, CommandRunner, RealCommandRunner};
pub use simulator::cleanup_simulator;
pub use state::{create_env_file, default_session_id, sanitize_id, StopContext};

#[derive(Debug)]
pub struct QaStopReport {
    pub session_id: String,
    pub messages: Vec<String>,
}

fn run_internal<R: CommandRunner>(
    args: &[String],
    repo_root: &Path,
    qa_state_root: &str,
    command_runner: &R,
    sleep: &dyn Fn(Duration),
) -> Result<QaStopReport, String> {
    let parsed = parse_args(args).map_err(|err| err.to_string())?;

    let mut messages = Vec::new();
    match parsed {
        ParsedArgs::ShowHelp => {
            messages.push(CliUsage::text().to_string());
            return Ok(QaStopReport {
                session_id: String::new(),
                messages,
            });
        }
        ParsedArgs::Run {
            session_id,
            shutdown_simulator,
        } => {
            let session_id = match session_id.filter(|value| !value.is_empty()) {
                Some(raw_id) => sanitize_id(&raw_id),
                None => {
                    let generated = default_session_id(repo_root)
                        .map_err(|error| error.to_string())?;
                    messages.push(format!(
                        "No --id provided. Using worktree session id: {generated}"
                    ));
                    generated
                }
            };

            let context = StopContext::load(&session_id, qa_state_root).map_err(|error| error.to_string())?;

            let otel_pid_file = stop_pid_file(
                &context.otel_pid_file,
                "OTel collector",
                command_runner,
                sleep,
            )
            .map_err(|error| error.to_string())?;
            messages.push(otel_pid_file);

            let firebase_pid_file = stop_pid_file(
                &context.firebase_pid_file,
                "Firebase emulator",
                command_runner,
                sleep,
            )
            .map_err(|error| error.to_string())?;
            messages.push(firebase_pid_file);

            for port in context.ports.iter().filter_map(|value| value.as_deref()) {
                cleanup_listener_ports(command_runner, port);
            }

            if let Some(simulator_udid) = context.simulator_udid.as_deref() {
                cleanup_simulator(command_runner, simulator_udid, shutdown_simulator, &mut messages);
            }

            if let Some(lock_dir) = context.simulator_lock_dir.as_deref() {
                if release_lock_dir(lock_dir, &session_id) {
                    messages.push(format!("Simulator lease released: {lock_dir}"));
                }
            }

            if let Some(device_locks_dir) = context.device_locks_dir.as_deref() {
                messages.extend(
                    release_matching_locks(device_locks_dir, &session_id)
                        .map_err(|error| error.to_string())?,
                );
            }

            messages.push(format!("QA session stopped: {session_id}"));
            Ok(QaStopReport {
                session_id,
                messages,
            })
        }
    }
}

pub fn run_with_runner<R: CommandRunner>(
    args: &[String],
    repo_root: &Path,
    qa_state_root: &str,
    command_runner: &R,
) -> Result<QaStopReport, String> {
    run_internal(
        args,
        repo_root,
        qa_state_root,
        command_runner,
        &|_| std::thread::sleep(Duration::from_secs(1)),
    )
}

pub fn run_with_runner_and_sleep<R: CommandRunner>(
    args: &[String],
    repo_root: &Path,
    qa_state_root: &str,
    command_runner: &R,
    sleep: &dyn Fn(Duration),
) -> Result<QaStopReport, String> {
    run_internal(args, repo_root, qa_state_root, command_runner, sleep)
}
