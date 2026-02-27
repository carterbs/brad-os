use std::path::PathBuf;
use std::process;

fn main() {
    // Parse --root-dir argument if provided, otherwise discover
    let args: Vec<String> = std::env::args().collect();
    let mut root_dir: Option<PathBuf> = None;

    let mut i = 1;
    while i < args.len() {
        if args[i] == "--root-dir" {
            if i + 1 < args.len() {
                root_dir = Some(PathBuf::from(&args[i + 1]));
                i += 2;
                continue;
            }
        }
        i += 1;
    }

    let config = match root_dir {
        Some(dir) => arch_lint::config::LinterConfig::from_root(&dir),
        None => match arch_lint::config::LinterConfig::discover() {
            Some(c) => c,
            None => {
                eprintln!("Error: Could not find repository root. Run from within a git repository or use --root-dir.");
                process::exit(1);
            }
        },
    };

    arch_lint::reporter::print_header();

    // Run checks and print results as they complete (streaming)
    type CheckFn = fn(&arch_lint::config::LinterConfig) -> arch_lint::checks::CheckResult;
    let check_fns: Vec<CheckFn> = vec![
        arch_lint::checks::layer_deps::check,
        arch_lint::checks::schema_boundary::check,
        arch_lint::checks::type_dedup::check,
        arch_lint::checks::firebase_routes::check,
        arch_lint::checks::ios_layers::check,
        arch_lint::checks::doc_freshness::check,
        arch_lint::checks::claude_md_refs::check,
        arch_lint::checks::orphan_features::check,
        arch_lint::checks::plan_lifecycle::check,
        arch_lint::checks::no_console_log::check,
        arch_lint::checks::no_raw_urlsession::check,
        arch_lint::checks::types_in_types_dir::check,
        arch_lint::checks::schemas_in_schemas_dir::check,
        arch_lint::checks::no_skipped_tests::check,
        arch_lint::checks::untested_high_risk::check,
        arch_lint::checks::test_factory_usage::check,
        arch_lint::checks::no_inline_api_response::check,
        arch_lint::checks::no_focused_tests::check,
        arch_lint::checks::test_quality::check,
        arch_lint::checks::repository_test_coverage::check,
        arch_lint::checks::markdown_links::check,
        arch_lint::checks::no_archive_dirs::check,
        arch_lint::checks::shell_complexity::check,
    ];

    let debug_timing = std::env::var("ARCH_LINT_TIMING").is_ok();
    let mut results = Vec::new();
    for check_fn in &check_fns {
        let start = std::time::Instant::now();
        let result = check_fn(&config);
        if debug_timing {
            eprintln!("  [{:>6.0?}] {}", start.elapsed(), result.name);
        }
        arch_lint::reporter::print_result(&result);
        results.push(result);
    }

    let freshness = arch_lint::checks::quality_grades_freshness::check(&config);
    arch_lint::reporter::print_freshness_warning(&freshness);

    let all_passed = arch_lint::reporter::print_summary(&results);

    process::exit(if all_passed { 0 } else { 1 });
}
