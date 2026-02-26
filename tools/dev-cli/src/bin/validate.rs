use dev_cli::reporter;
use dev_cli::runner::{self, CheckResult, RunOpts};
use std::{env, fs, process, thread, time::Instant};
use std::path::Path;

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.iter().any(|arg| arg == "--version" || arg == "-V") {
        println!("brad-validate {}", env!("CARGO_PKG_VERSION"));
        process::exit(0);
    }

    let quick = args.iter().any(|arg| arg == "--quick");
    println!("Using Rust validation engine (brad-validate)");

    let test_files = parse_newline_env("BRAD_VALIDATE_TEST_FILES");
    let test_projects = parse_newline_env("BRAD_VALIDATE_TEST_PROJECTS");

    let log_dir = Path::new(".validate");
    if log_dir.exists() {
        fs::remove_dir_all(log_dir).expect("failed to remove .validate/");
    }
    fs::create_dir_all(log_dir).expect("failed to create .validate/");

    let checks = determine_checks(quick);
    let total_start = Instant::now();

    let handles: Vec<_> = checks
        .iter()
        .map(|&name| {
            let name = name.to_string();
            let test_files = test_files.clone();
            let test_projects = test_projects.clone();
            thread::spawn(move || run_single_check(&name, &test_files, &test_projects))
        })
        .collect();

    let results: Vec<CheckResult> = handles
        .into_iter()
        .map(|handle| handle.join().expect("check thread panicked"))
        .collect();

    let total_elapsed = total_start.elapsed().as_secs();
    let all_passed = reporter::print_summary(&results, total_elapsed);
    process::exit(if all_passed { 0 } else { 1 });
}

fn determine_checks(quick: bool) -> Vec<&'static str> {
    let mut checks: Vec<&'static str> = vec!["typecheck", "lint"];
    if !quick {
        checks.push("test");
        checks.push("architecture");
    }
    checks
}

fn run_single_check(name: &str, test_files: &[String], test_projects: &[String]) -> CheckResult {
    match name {
        "typecheck" => runner::run_check(&RunOpts {
            name: "typecheck",
            program: "npx",
            args: &["tsc", "-b"],
            log_dir: Path::new(".validate"),
            env: None,
        }),
        "lint" => runner::run_check(&RunOpts {
            name: "lint",
            program: "npx",
            args: &[
                "oxlint",
                "packages/functions/src",
                "--config",
                ".oxlintrc.json",
            ],
            log_dir: Path::new(".validate"),
            env: None,
        }),
        "test" => {
            let mut args: Vec<&str> = vec!["vitest", "run"];

            let mut project_args: Vec<String> = Vec::new();
            for project in test_projects {
                project_args.push("--project".to_string());
                project_args.push(project.clone());
            }

            let project_refs: Vec<&str> = project_args.iter().map(String::as_str).collect();
            args.extend_from_slice(&project_refs);
            let file_refs: Vec<&str> = test_files.iter().map(String::as_str).collect();
            args.extend_from_slice(&file_refs);

            runner::run_check(&RunOpts {
                name: "test",
                program: "npx",
                args: &args,
                log_dir: Path::new(".validate"),
                env: None,
            })
        }
        "architecture" => runner::run_check(&RunOpts {
            name: "architecture",
            program: "bash",
            args: &["scripts/arch-lint"],
            log_dir: Path::new(".validate"),
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
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_string)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quick_mode_skips_test_and_architecture() {
        assert_eq!(determine_checks(true), vec!["typecheck", "lint"]);
    }

    #[test]
    fn full_mode_runs_all_checks() {
        assert_eq!(
            determine_checks(false),
            vec!["typecheck", "lint", "test", "architecture"]
        );
    }

    #[test]
    fn parse_newline_env_ignores_empty_lines() {
        env::set_var("BRAD_VALIDATE_TEST_FILES", "a\n\nb\n");
        assert_eq!(parse_newline_env("BRAD_VALIDATE_TEST_FILES"), vec!["a".to_string(), "b".to_string()]);
        env::remove_var("BRAD_VALIDATE_TEST_FILES");
    }

    #[test]
    fn parse_newline_env_trims_whitespace() {
        env::set_var("BRAD_VALIDATE_TEST_PROJECTS", " functions \n\tweb \n");
        assert_eq!(
            parse_newline_env("BRAD_VALIDATE_TEST_PROJECTS"),
            vec!["functions".to_string(), "web".to_string()]
        );
        env::remove_var("BRAD_VALIDATE_TEST_PROJECTS");
    }

    #[test]
    fn unknown_check_fails_fast_with_default_result() {
        let result = run_single_check("unexpected", &[], &[]);
        assert_eq!(result.name, "unexpected");
        assert_eq!(result.exit_code, 1);
    }
}
