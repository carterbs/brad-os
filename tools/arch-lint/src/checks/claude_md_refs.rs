use crate::checks::CheckResult;
use crate::config::LinterConfig;
use regex::Regex;
use std::fs;
use std::sync::LazyLock;

static PATH_PATTERN: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"`((?:packages|ios|scripts|docs|thoughts|hooks)/[^`\s]+)`").unwrap()
});

static TEMPLATE_VAR: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"<\w+>").unwrap()
});

pub fn check(config: &LinterConfig) -> CheckResult {
    let name = "AGENTS.md file path references".to_string();
    let claude_md = config.root_dir.join("AGENTS.md");

    if !claude_md.exists() {
        return CheckResult { name, passed: true, violations: vec![] };
    }

    let content = match fs::read_to_string(&claude_md) {
        Ok(c) => c,
        Err(_) => return CheckResult { name, passed: true, violations: vec![] },
    };

    let mut violations = Vec::new();
    let mut in_code_fence = false;

    for (i, line) in content.lines().enumerate() {
        if line.starts_with("```") {
            in_code_fence = !in_code_fence;
            continue;
        }

        if in_code_fence {
            continue;
        }

        for caps in PATH_PATTERN.captures_iter(line) {
            if let Some(ref_path) = caps.get(1) {
                let ref_path_str = ref_path.as_str();

                // Skip paths with template variables like <feature>
                if TEMPLATE_VAR.is_match(ref_path_str) {
                    continue;
                }

                // Skip wildcard patterns
                if ref_path_str.contains('*') {
                    continue;
                }

                let full_path = config.root_dir.join(ref_path_str);

                if !full_path.exists() {
                    violations.push(format!(
                        "AGENTS.md:{} references `{}` but the path does not exist.\n\
                         \x20   Rule: All backtick-quoted file paths in AGENTS.md must resolve to real files or directories on disk.\n\
                         \x20   Fix: 1. If the file was renamed or moved, update the path in AGENTS.md.\n\
                         \x20        2. If the file was deleted intentionally, remove the reference.\n\
                         \x20        3. Run `git log --diff-filter=R -- '{}'` to find renames.\n\
                         \x20   See: docs/golden-principles.md",
                        i + 1,
                        ref_path_str,
                        ref_path_str,
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
