use std::env;

use dev_cli::setup_ios_testing::{RealCommandRunner, execute_setup, parse_args};

fn main() {
    let args: Vec<String> = env::args().collect();
    let _ = env::var("BRAD_OS_REPO_ROOT");
    let config = parse_args(&args);
    let mut runner = RealCommandRunner::default();
    let mut stdout = std::io::stdout();

    match execute_setup(&mut runner, &config, &mut stdout) {
        Ok(()) => std::process::exit(0),
        Err(error) => {
            eprintln!("{error:?}");
            std::process::exit(1);
        }
    }
}
