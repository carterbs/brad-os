use dev_cli::doctor::{self, RuntimeContext};
use std::io;
use std::process;
use std::env;

fn main() {
    let fast_mode = env::var("BRAD_DOCTOR_FAST").as_deref() == Ok("1");
    let context = RuntimeContext::current().unwrap_or_else(|error| {
        eprintln!("Failed to build doctor runtime context: {error}");
        process::exit(1);
    });

    let mut stdout = io::stdout();
    let code = doctor::run(&mut stdout, fast_mode, doctor::probe_tool, &context).unwrap_or_else(|error| {
        eprintln!("Doctor check failed: {error}");
        1
    });
    process::exit(code);
}
