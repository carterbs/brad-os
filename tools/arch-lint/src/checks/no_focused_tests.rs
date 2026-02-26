use crate::checks::CheckResult;
use crate::config::LinterConfig;
use crate::walker;
use regex::Regex;
use std::fs;
use std::sync::LazyLock;

static ONLY_PATTERN: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\b(it\.only|describe\.only|test\.only|fit|fdescribe)\s*\(").unwrap()
});

static COMMENT_LINE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^\s*//").unwrap()
});

pub fn check(config: &LinterConfig) -> CheckResult {
    let name = "No focused tests (.only)".to_string();
    let files = walker::collect_test_files(&config.root_dir);
    let mut violations = Vec::new();

    for file in &files {
        let content = match fs::read_to_string(file) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let rel_path = file.strip_prefix(&config.root_dir).unwrap_or(file);

        for (i, line) in content.lines().enumerate() {
            if COMMENT_LINE.is_match(line) {
                continue;
            }

            if let Some(caps) = ONLY_PATTERN.captures(line) {
                if let Some(m) = caps.get(1) {
                    violations.push(format!(
                        "{}:{} has a focused test ({}).\n\
                         \x20   Rule: Never commit focused tests — .only silently skips all other tests in the suite.\n\
                         \x20   Fix: Remove the .only modifier. If debugging, use vitest's --grep flag instead:\n\
                         \x20        npx vitest run --grep \"test name pattern\"\n\
                         \x20   See: docs/conventions/testing.md",
                        rel_path.display(),
                        i + 1,
                        m.as_str(),
                    ));
                }
            }
        }
    }

    CheckResult {
        passed: violations.is_empty(),
        name,
        violations,
    }
}
