use dev_cli::precommit::{check_branch_gate, determine_mode, route_staged_files};
use dev_cli::runner;
use dev_cli::timing::{self, PrecommitTiming};
use std::collections::HashMap;
use std::path::Path;
use std::process::{self, Command, Stdio};
use std::time::Instant;
use std::env;

fn main() {
    let hook_start = Instant::now();
    let timing_file = env::var("PRE_COMMIT_TIMING_FILE")
        .unwrap_or_else(|_| ".cache/pre-commit-timings.jsonl".to_string());

    let mut state = HookState {
        gitleaks_ms: 0,
        validate_ms: 0,
        validate_status: "not_run".to_string(),
        validate_mode: "full".to_string(),
        scoped_test_files: Vec::new(),
        scoped_test_projects: Vec::new(),
    };

    let staged_files = get_staged_files();
    let branch = get_branch();

    let exit_code = run_hook(&mut state, &staged_files, &branch);

    // Always log timing, even on failure (mirrors trap EXIT behavior).
    let hook_ms = hook_start.elapsed().as_millis() as u64;
    timing::append_timing(
        Path::new(&timing_file),
        &PrecommitTiming {
            timestamp: timing::utc_now_iso8601(),
            branch: branch.clone(),
            mode: state.validate_mode.clone(),
            staged_files: staged_files.len(),
            exit_code,
            hook_ms,
            gitleaks_ms: state.gitleaks_ms,
            validate_ms: state.validate_ms,
            validate_status: state.validate_status.clone(),
            targeted_test_file_count: state.scoped_test_files.len(),
            targeted_test_project_count: state.scoped_test_projects.len(),
        },
    );

    process::exit(exit_code);
}

struct HookState {
    gitleaks_ms: u64,
    validate_ms: u64,
    validate_status: String,
    validate_mode: String,
    scoped_test_files: Vec<String>,
    scoped_test_projects: Vec<String>,
}

fn run_hook(state: &mut HookState, staged_files: &[String], branch: &str) -> i32 {
    // --- Branch gate ---
    if let Some(msg) = check_branch_gate(branch, has_merge_head(), allow_main_commit()) {
        eprint!("{msg}");
        return 1;
    }

    // --- Gitleaks: scan for secrets ---
    if !runner::command_exists("gitleaks") {
        eprintln!("gitleaks not installed. Install with: brew install gitleaks");
        return 1;
    }

    let (gitleaks_exit, gitleaks_ms) =
        runner::run_passthrough("gitleaks", &["protect", "--staged", "--verbose"]);
    state.gitleaks_ms = gitleaks_ms;

    if gitleaks_exit != 0 {
        eprintln!();
        eprintln!("ERROR: gitleaks failed. Install with: brew install gitleaks");
        return 1;
    }

    // --- No staged files: full validation ---
    if staged_files.is_empty() {
        eprintln!("No staged files found; running full validation.");
        state.validate_mode = "full_no_staged".to_string();
        return run_validate_and_record(state, &HashMap::new());
    }

    // --- Scoped validation routing ---
    let unknown_scope = route_staged_files(
        staged_files,
        &mut state.scoped_test_files,
        &mut state.scoped_test_projects,
        |path| std::path::PathBuf::from(path).exists(),
    );

    let mode = determine_mode(
        unknown_scope,
        state.scoped_test_files.is_empty(),
        state.scoped_test_projects.is_empty(),
    );
    state.validate_mode = mode.to_string();

    if mode == "full_fallback" {
        eprintln!("Running full validation (no safe scoped path found).");
        return run_validate_and_record(state, &HashMap::new());
    }

    // Scoped mode
    let test_file_list = state.scoped_test_files.join("\n");
    let test_project_list = state.scoped_test_projects.join("\n");

    eprintln!();
    eprintln!("Running targeted quality checks...");
    if !state.scoped_test_files.is_empty() {
        eprintln!("  Tests: {}", state.scoped_test_files.join(" "));
    }
    if !state.scoped_test_projects.is_empty() {
        eprintln!("  Test projects: {}", state.scoped_test_projects.join(" "));
    }

    let mut env = HashMap::new();
    env.insert("BRAD_VALIDATE_TEST_FILES".to_string(), test_file_list);
    env.insert(
        "BRAD_VALIDATE_TEST_PROJECTS".to_string(),
        test_project_list,
    );

    run_validate_and_record(state, &env)
}

fn run_validate_and_record(state: &mut HookState, env: &HashMap<String, String>) -> i32 {
    let (exit, ms) = run_validate(env);
    state.validate_ms = ms;
    state.validate_status = if exit == 0 {
        "success".to_string()
    } else {
        "fail".to_string()
    };

    if exit != 0 {
        eprintln!();
        eprintln!("ERROR: Validation failed. Fix failures before committing.");
        eprintln!("  Run 'npm run validate' to reproduce.");
        return 1;
    }

    eprintln!();
    eprintln!("All pre-commit checks passed.");
    0
}

fn allow_main_commit() -> bool {
    env::var("ALLOW_MAIN_COMMIT").as_deref() == Ok("1")
}

fn get_staged_files() -> Vec<String> {
    let output = Command::new("git")
        .args(["diff", "--cached", "--name-only", "--diff-filter=ACMRTD"])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .expect("failed to run git diff");

    String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter(|l| !l.is_empty())
        .map(|l| l.to_string())
        .collect()
}

fn get_branch() -> String {
    let output = Command::new("git")
        .args(["symbolic-ref", "--short", "HEAD"])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output();

    match output {
        Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout).trim().to_string(),
        _ => "unknown".to_string(),
    }
}

fn has_merge_head() -> bool {
    Command::new("git")
        .args(["rev-parse", "MERGE_HEAD"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

fn run_validate(env: &HashMap<String, String>) -> (i32, u64) {
    if env.is_empty() {
        runner::run_passthrough("npm", &["run", "validate"])
    } else {
        runner::run_passthrough_with_env("npm", &["run", "validate"], env)
    }
}
