use crate::checks::CheckResult;
use crate::config::LinterConfig;
use std::fs;

const HIGH_RISK: &[&str] = &["today-coach", "openai", "ai", "coach"];

pub fn check(config: &LinterConfig) -> CheckResult {
    let name = "Untested high-risk files".to_string();
    let mut violations = Vec::new();

    let dirs_to_check = [
        (config.functions_src.join("handlers"), "handler"),
        (config.functions_src.join("services"), "service"),
    ];

    for (dir, file_type) in &dirs_to_check {
        if !dir.exists() {
            continue;
        }

        let entries = match fs::read_dir(dir) {
            Ok(e) => e,
            Err(_) => continue,
        };

        for entry in entries.flatten() {
            let path = entry.path();
            let file_name = match path.file_name().and_then(|n| n.to_str()) {
                Some(n) => n.to_string(),
                None => continue,
            };

            if !file_name.ends_with(".ts")
                || file_name.ends_with(".test.ts")
                || file_name.ends_with(".spec.ts")
                || file_name == "index.ts"
            {
                continue;
            }

            let stem = file_name.replace(".ts", "");
            let lower_name = stem.to_lowercase();

            // Only check files matching high-risk patterns
            let matching: Vec<&&str> = HIGH_RISK.iter().filter(|p| lower_name.contains(**p)).collect();
            if matching.is_empty() {
                continue;
            }

            // Check for co-located test
            let test_file = dir.join(format!("{}.test.ts", stem));
            // Check for integration test
            let integration_stem = stem.replace(".service", "");
            let integration_test = config
                .functions_src
                .join("__tests__/integration")
                .join(format!("{}.integration.test.ts", integration_stem));

            if !test_file.exists() && !integration_test.exists() {
                let rel_path = path.strip_prefix(&config.root_dir).unwrap_or(&path);
                let matching_str: Vec<&str> = matching.iter().map(|s| **s).collect();
                violations.push(format!(
                    "{} is a high-risk {} (matches: {}) with no test file.\n\
                     \x20   Rule: High-risk files (AI integrations, coach logic) MUST have tests.\n\
                     \x20   Fix: Create {} with at least basic smoke tests.\n\
                     \x20   See: docs/golden-principles.md",
                    rel_path.display(),
                    file_type,
                    matching_str.join(", "),
                    test_file
                        .strip_prefix(&config.root_dir)
                        .unwrap_or(&test_file)
                        .display(),
                ));
            }
        }
    }

    CheckResult {
        passed: violations.is_empty(),
        name,
        violations,
    }
}
