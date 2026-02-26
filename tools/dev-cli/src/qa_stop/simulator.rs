use crate::qa_stop::runner::{CommandCall, CommandRunner};

pub fn cleanup_simulator<R: CommandRunner>(
    runner: &R,
    simulator_udid: &str,
    shutdown_simulator: bool,
    messages: &mut Vec<String>,
) {
    for variable in [
        "BRAD_OS_API_URL",
        "BRAD_OS_OTEL_BASE_URL",
        "BRAD_OS_QA_ID",
        "USE_EMULATOR",
    ] {
        let _ = runner.run(CommandCall {
            program: "xcrun".to_string(),
            args: vec![
                "simctl".to_string(),
                "spawn".to_string(),
                simulator_udid.to_string(),
                "launchctl".to_string(),
                "unsetenv".to_string(),
                variable.to_string(),
            ],
        });
    }

    if shutdown_simulator {
        let _ = runner.run(CommandCall {
            program: "xcrun".to_string(),
            args: vec![
                "simctl".to_string(),
                "shutdown".to_string(),
                simulator_udid.to_string(),
            ],
        });
        messages.push(format!("Simulator: shut down {simulator_udid}"));
    }
}
