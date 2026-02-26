use crate::runner::{CommandCall, CommandRunner};

pub fn cleanup_listener_ports<R: CommandRunner>(runner: &R, port: &str) {
    let lsof_arg = format!("-tiTCP:{port}");
    let lsof_result = runner.run(CommandCall {
        program: "lsof".to_string(),
        args: vec![lsof_arg, "-sTCP:LISTEN".to_string()],
        current_dir: None,
    });

    for pid in lsof_result.stdout.split_whitespace() {
        let _ = runner.run(CommandCall {
            program: "kill".to_string(),
            args: vec![pid.to_string()],
            current_dir: None,
        });
    }
}
