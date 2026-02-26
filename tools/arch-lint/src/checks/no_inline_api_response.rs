use crate::checks::CheckResult;
use crate::config::LinterConfig;
use regex::Regex;
use std::fs;
use std::sync::LazyLock;

static INLINE_PATTERN: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?m)^interface ApiResponse").unwrap()
});

pub fn check(config: &LinterConfig) -> CheckResult {
    let name = "No inline ApiResponse in tests".to_string();
    let mut violations = Vec::new();

    let test_dirs = [
        config.functions_src.join("handlers"),
        config.functions_src.join("services"),
        config.functions_src.join("repositories"),
        config.functions_src.join("__tests__/integration"),
    ];

    for dir in &test_dirs {
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

            if !file_name.ends_with(".test.ts") && !file_name.ends_with(".spec.ts") {
                continue;
            }

            let content = match fs::read_to_string(&path) {
                Ok(c) => c,
                Err(_) => continue,
            };

            if INLINE_PATTERN.is_match(&content) {
                let rel_path = path.strip_prefix(&config.root_dir).unwrap_or(&path);
                violations.push(format!(
                    "{} defines inline ApiResponse interface.\n\
                     \x20   Import from __tests__/utils/api-types.ts instead.",
                    rel_path.display(),
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
