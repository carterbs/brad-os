use dev_cli::setup_ios_testing::{execute_setup, parse_args, RealCommandRunner};
use std::env;
use std::io::Write;
use std::io;
use std::process;

fn main() {
    let config = parse_args(&env::args().collect::<Vec<_>>());
    let mut runner = RealCommandRunner::default();
    let mut output = Vec::new();
    let exit_code = match execute_setup(&mut runner, &config, &mut output) {
        Ok(()) => 0,
        Err(_) => 1,
    };

    let _ = io::stdout().write_all(&output);
    process::exit(exit_code);
}
