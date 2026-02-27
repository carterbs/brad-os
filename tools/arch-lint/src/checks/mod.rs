pub mod doc_freshness;
pub mod arch_map_refs;
pub mod claude_md_refs;
pub mod firebase_routes;
pub mod ios_layers;
pub mod layer_deps;
pub mod markdown_links;
pub mod no_archive_dirs;
pub mod shell_complexity;
pub mod no_console_log;
pub mod no_focused_tests;
pub mod no_inline_api_response;
pub mod no_raw_urlsession;
pub mod no_skipped_tests;
pub mod orphan_features;
pub mod plan_lifecycle;
pub mod quality_grades_freshness;
pub mod repository_test_coverage;
pub mod schema_boundary;
pub mod schemas_in_schemas_dir;
pub mod test_factory_usage;
pub mod test_quality;
pub mod type_dedup;
pub mod types_in_types_dir;
pub mod untested_high_risk;

use crate::config::LinterConfig;

pub struct CheckResult {
    pub name: String,
    pub passed: bool,
    pub violations: Vec<String>,
}

pub struct FreshnessResult {
    pub stale: bool,
    pub message: String,
}

/// Trait for all architecture checks
pub trait Check {
    fn run(&self, config: &LinterConfig) -> CheckResult;
}
