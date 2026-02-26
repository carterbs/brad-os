use std::env;
use std::path::Path;

use dev_cli::setup_ios_testing;

fn main() {
    let args: Vec<String> = env::args().skip(1).collect();
    let repo_root = env::var("BRAD_OS_REPO_ROOT").unwrap_or_else(|_| {
        env::current_dir()
            .map(|path| path.to_string_lossy().to_string())
            .unwrap_or_else(|_| ".".to_string())
    });

    let skip_build = match setup_ios_testing::parse_args(&args) {
        Ok(skip) => skip,
        Err(err) => {
            eprintln!("  ERROR: {err}");
            eprintln!("\nUsage:");
            eprintln!("  scripts/setup-ios-testing.sh [--skip-build]");
            std::process::exit(1);
        }
    };

    let runner = setup_ios_testing::SystemCommandRunner::default();

    let mut stdout = std::io::stdout();
    let config = setup_ios_testing::SetupConfig::new(Path::new(&repo_root), skip_build);
    if let Err(err) = setup_ios_testing::run_setup(&mut stdout, &runner, &config) {
        match err {
            setup_ios_testing::SetupError::CommandFailed { output, .. } => {
                eprintln!();
                eprintln!("{output}");
                std::process::exit(1);
            }
            setup_ios_testing::SetupError::MissingProjectFile => {
                eprintln!("  \u{2717} ios/BradOS/project.yml not found — are you in the repo root?");
                std::process::exit(1);
            }
            setup_ios_testing::SetupError::MissingCommand {
                command,
                install_hint,
            } => {
                eprintln!("  \u{2717} {command}");
                eprintln!("    Install: {install_hint}");
                std::process::exit(1);
            }
            _ => {
                eprintln!("  \u{2717} {err}");
                std::process::exit(1);
            }
        }
    }
}
