use dev_cli::container_tests::{execute, parse_args};
use dev_cli::runner::RealCommandRunner;
use std::env;
use std::io;
use std::process;

fn main() {
    let args: Vec<String> = env::args().skip(1).collect();
    let config = match parse_args(&args) {
        Ok(value) => value,
        Err(error) => {
            eprintln!("{error}");
            process::exit(2);
        }
    };
    let runner = RealCommandRunner;
    let mut stdout = io::stdout().lock();
    if let Err(error) = execute(&runner, &mut stdout, &config) {
        eprintln!("{error}");
        process::exit(1);
    }
}
