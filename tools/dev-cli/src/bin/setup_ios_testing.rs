use dev_cli::setup_ios_testing::{self, SetupConfig};
use std::env;
use std::process;

fn main() {
    let args: Vec<String> = env::args().skip(1).collect();
    let skip_build = match setup_ios_testing::parse_args(&args) {
        Ok(skip) => skip,
        Err(err) => {
            eprintln!("  ERROR: {err}");
            eprintln!("\nUsage:");
            eprintln!("  scripts/setup-ios-testing.sh [--skip-build]");
            process::exit(1);
        }
    };

    let repo_root = match env::current_dir() {
        Ok(dir) => dir,
        Err(err) => {
            eprintln!("  ERROR: unable to read current directory: {err}");
            process::exit(1);
        }
    };

    let mut stdout = std::io::stdout();
    let config = SetupConfig::new(&repo_root, skip_build);
    let runner = setup_ios_testing::SystemCommandRunner::default();

    if let Err(err) = setup_ios_testing::run_setup(&mut stdout, &runner, &config) {
        match err {
            setup_ios_testing::SetupError::CommandFailed { output, .. } => {
                eprintln!();
                eprintln!("{output}");
                process::exit(1);
            }
            setup_ios_testing::SetupError::MissingProjectFile => {
                eprintln!("  \u{2717} ios/BradOS/project.yml not found — are you in the repo root?");
                process::exit(1);
            }
            setup_ios_testing::SetupError::MissingCommand {
                command,
                install_hint,
            } => {
                eprintln!("  \u{2717} {command}");
                eprintln!("    Install: {install_hint}");
                process::exit(1);
            }
            _ => {
                eprintln!("  \u{2717} {err}");
                process::exit(1);
            }
        }
    }
}
