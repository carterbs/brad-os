use std::env;
use std::path::Path;

use dev_cli::qa_stop::{run_with_runner, CliUsage};

fn main() {
    let args: Vec<String> = env::args().skip(1).collect();
    let repo_root = env::var("BRAD_OS_REPO_ROOT")
        .or_else(|_| env::current_dir().map(|path| path.to_string_lossy().to_string()))
        .unwrap_or_else(|_| ".".to_string());
    let qa_state_root =
        env::var("QA_STATE_ROOT").unwrap_or_else(|_| "/tmp/brad-os-qa".to_string());

    let runner = dev_cli::qa_stop::RealCommandRunner;

    match run_with_runner(
        &args,
        Path::new(&repo_root),
        &qa_state_root,
        &runner,
    ) {
        Ok(report) => {
            if !report.messages.is_empty() {
                report.messages.into_iter().for_each(|message| println!("{message}"));
            }
            std::process::exit(0);
        }
        Err(error) => {
            eprintln!("{error}");
            eprintln!("{}", CliUsage::text());
            std::process::exit(1);
        }
    }
}
