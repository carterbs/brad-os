use crate::checks::CheckResult;
use crate::config::LinterConfig;
use regex::Regex;
use std::fs;
use std::sync::LazyLock;

static FACTORY_PATTERN: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?m)^(?:export\s+)?(?:function|const)\s+(createMock\w+|createTest\w+|mock\w+Factory)").unwrap()
});

static UTIL_IMPORT_PATTERN: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"from\s+['"].*__tests__/utils"#).unwrap()
});

pub fn check(config: &LinterConfig) -> CheckResult {
    let name = "Shared test factory usage".to_string();
    let mut violations = Vec::new();

    let test_dirs = [
        config.functions_src.join("handlers"),
        config.functions_src.join("services"),
        config.functions_src.join("repositories"),
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

            let has_inline_factory = FACTORY_PATTERN.is_match(&content);
            let imports_from_utils = UTIL_IMPORT_PATTERN.is_match(&content);

            if has_inline_factory && !imports_from_utils {
                let rel_path = path.strip_prefix(&config.root_dir).unwrap_or(&path);
                violations.push(format!(
                    "{} defines inline test factories but doesn't import from __tests__/utils/.\n\
                     \x20   Suggestion: Move reusable factories to packages/functions/src/__tests__/utils/ and import them.\n\
                     \x20   See: docs/conventions/testing.md",
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
