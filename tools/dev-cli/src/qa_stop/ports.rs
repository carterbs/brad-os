use crate::qa_process::{
    listener_pids, terminate_owned_process, QaProcessIdentity, TerminationOutcome,
};
use crate::runner::CommandRunner;
use std::io;
use std::time::Duration;

pub fn cleanup_listener_port<R: CommandRunner>(
    runner: &R,
    port: &str,
    identity: &QaProcessIdentity,
    sleep: &dyn Fn(Duration),
) -> io::Result<Vec<String>> {
    let port_number = port.parse::<u16>().map_err(|_| {
        io::Error::new(
            io::ErrorKind::InvalidData,
            format!("Invalid QA listener port: {port}"),
        )
    })?;
    let mut messages = Vec::new();

    for pid in listener_pids(runner, port_number)? {
        match terminate_owned_process(runner, pid, identity, sleep) {
            TerminationOutcome::Stopped => {
                messages.push(format!("Stopped owned listener pid {pid} on port {port}"));
            }
            TerminationOutcome::AlreadyStopped => {}
            TerminationOutcome::RefusedUnowned => {
                messages.push(format!(
                    "Left unowned listener pid {pid} running on port {port}"
                ));
            }
        }
    }

    Ok(messages)
}
