use dev_cli::cloud_run_deploy::{discover_git_sha, execute, parse_plan_only, DeploymentConfig};
use dev_cli::runner::RealCommandRunner;
use std::env;
use std::io;
use std::process;

fn main() {
    let args: Vec<String> = env::args().skip(1).collect();
    let plan_only = match parse_plan_only(&args) {
        Ok(value) => value,
        Err(error) => {
            eprintln!("{error}");
            process::exit(2);
        }
    };
    let runner = RealCommandRunner;
    let git_sha = match env::var("BRAD_CLOUD_RUN_GIT_SHA") {
        Ok(value) => value,
        Err(_) => match discover_git_sha(&runner) {
            Ok(value) => value,
            Err(error) => {
                eprintln!("{error}");
                process::exit(1);
            }
        },
    };
    let config = match DeploymentConfig::from_env(git_sha, plan_only) {
        Ok(value) => value,
        Err(error) => {
            eprintln!("{error}");
            process::exit(2);
        }
    };

    let mut stdout = io::stdout().lock();
    if let Err(error) = execute(&runner, &mut stdout, &config) {
        eprintln!("{error}");
        process::exit(1);
    }
}
