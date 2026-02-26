pub mod checks;
pub mod config;
pub mod manifest;
pub mod reporter;
pub mod rewrite_utils;
pub mod walker;

use checks::{CheckResult, FreshnessResult};
use config::LinterConfig;

pub fn run_all_checks(config: &LinterConfig) -> (Vec<CheckResult>, FreshnessResult) {
    type CheckFn = fn(&LinterConfig) -> CheckResult;
    let check_fns: Vec<CheckFn> = vec![
        checks::layer_deps::check,
        checks::schema_boundary::check,
        checks::type_dedup::check,
        checks::firebase_routes::check,
        checks::ios_layers::check,
        checks::arch_map_refs::check,
        checks::claude_md_refs::check,
        checks::orphan_features::check,
        checks::plan_lifecycle::check,
        checks::no_console_log::check,
        checks::no_raw_urlsession::check,
        checks::types_in_types_dir::check,
        checks::schemas_in_schemas_dir::check,
        checks::no_skipped_tests::check,
        checks::untested_high_risk::check,
        checks::test_factory_usage::check,
        checks::no_inline_api_response::check,
        checks::no_focused_tests::check,
        checks::test_quality::check,
        checks::repository_test_coverage::check,
        checks::markdown_links::check,
        checks::no_archive_dirs::check,
        checks::shell_complexity::check,
    ];

    let mut results = Vec::new();
    for check_fn in &check_fns {
        let result = check_fn(config);
        results.push(result);
    }

    let freshness = checks::quality_grades_freshness::check(config);

    (results, freshness)
}
