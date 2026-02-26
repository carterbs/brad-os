use crate::checks::CheckResult;
use crate::config::LinterConfig;
use crate::walker;
use regex::Regex;
use std::fs;
use std::sync::LazyLock;

static SKIP_PATTERN: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\b(it\.skip|describe\.skip|test\.skip|xit|xdescribe|xtest)\s*\(").unwrap()
});

static COMMENT_LINE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^\s*//").unwrap()
});

pub fn check(config: &LinterConfig) -> CheckResult {
    let name = "No skipped tests".to_string();
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

            if let Some(caps) = SKIP_PATTERN.captures(line) {
                if let Some(m) = caps.get(1) {
                    violations.push(format!(
                        "{}:{} has a skipped test ({}).\n\
                         \x20   Rule: Never skip or disable tests to fix a build. Fix the test or remove it.\n\
                         \x20   Fix: Either fix the failing test so it passes, or delete it if no longer relevant.\n\
                         \x20        Do not use .skip, xit, or xdescribe as a workaround.\n\
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
