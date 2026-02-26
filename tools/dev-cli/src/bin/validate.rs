use dev_cli::reporter;
use dev_cli::runner::{CheckResult, RunOpts};
use std::path::Path;
use std::time::Instant;
use std::{env, fs, process, thread};

fn main() {
    let args: Vec<String> = env::args().collect();
    let quick = args.iter().any(|a| a == "--quick");

    // Parse targeted test env vars (newline-delimited).
    let test_files = parse_newline_env("BRAD_VALIDATE_TEST_FILES");
    let test_projects = parse_newline_env("BRAD_VALIDATE_TEST_PROJECTS");

    // Clean and recreate log directory.
    let log_dir = Path::new(".validate");
    if log_dir.exists() {
        fs::remove_dir_all(log_dir).expect("failed to remove .validate/");
    }
    fs::create_dir_all(log_dir).expect("failed to create .validate/");

    // Determine which checks to run.
    let mut checks: Vec<&str> = vec!["typecheck", "lint"];
    if !quick {
        checks.push("test");
        checks.push("architecture");
    }

    let total_start = Instant::now();

    // Run checks in parallel.
    let test_files_clone = test_files.clone();
    let test_projects_clone = test_projects.clone();

    let handles: Vec<_> = checks
        .iter()
        .map(|&check| {
            let check = check.to_string();
            let test_files = test_files_clone.clone();
            let test_projects = test_projects_clone.clone();

            thread::spawn(move || {
                let log_dir = Path::new(".validate");
                run_single_check(&check, &log_dir, &test_files, &test_projects)
            })
        })
        .collect();

    let results: Vec<CheckResult> = handles
        .into_iter()
        .map(|h| h.join().expect("check thread panicked"))
        .collect();

    let total_elapsed = total_start.elapsed().as_secs();
    let all_passed = reporter::print_summary(&results, total_elapsed);

    process::exit(if all_passed { 0 } else { 1 });
}

fn run_single_check(
    name: &str,
    log_dir: &Path,
    test_files: &[String],
    test_projects: &[String],
) -> CheckResult {
    match name {
        "typecheck" => dev_cli::runner::run_check(&RunOpts {
            name: "typecheck",
            program: "npx",
            args: &["tsc", "-b"],
            log_dir,
            env: None,
        }),
        "lint" => dev_cli::runner::run_check(&RunOpts {
            name: "lint",
            program: "npx",
            args: &[
                "oxlint",
                "packages/functions/src",
                "--config",
                ".oxlintrc.json",
            ],
            log_dir,
            env: None,
        }),
        "test" => {
            let mut args: Vec<&str> = vec!["vitest", "run"];

            // Build owned strings for project args.
            let project_args: Vec<String> = test_projects
                .iter()
                .flat_map(|p| vec!["--project".to_string(), p.clone()])
                .collect();
            let project_refs: Vec<&str> = project_args.iter().map(|s| s.as_str()).collect();
            args.extend_from_slice(&project_refs);

            let file_refs: Vec<&str> = test_files.iter().map(|s| s.as_str()).collect();
            args.extend_from_slice(&file_refs);

            dev_cli::runner::run_check(&RunOpts {
                name: "test",
                program: "npx",
                args: &args,
                log_dir,
                env: None,
            })
        }
        "architecture" => dev_cli::runner::run_check(&RunOpts {
            name: "architecture",
            program: "bash",
            args: &["scripts/arch-lint"],
            log_dir,
            env: None,
        }),
        _ => CheckResult {
            name: name.to_string(),
            exit_code: 1,
            elapsed_secs: 0,
        },
    }
}

fn parse_newline_env(key: &str) -> Vec<String> {
    env::var(key)
        .unwrap_or_default()
        .lines()
        .filter(|l| !l.is_empty())
        .map(|l| l.to_string())
        .collect()
}
