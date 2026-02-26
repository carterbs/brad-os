use crate::checks::CheckResult;
use crate::config::LinterConfig;
use regex::Regex;
use std::fs;
use std::sync::LazyLock;

static PATH_PATTERN: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"`((?:packages|ios|scripts|docs|thoughts)/[^`\s]+\.\w+)`").unwrap()
});

pub fn check(config: &LinterConfig) -> CheckResult {
    let name = "Architecture map file references".to_string();
    let arch_dir = config.root_dir.join("docs/architecture");

    if !arch_dir.exists() {
        return CheckResult { name, passed: true, violations: vec![] };
    }

    let mut violations = Vec::new();

    let entries = match fs::read_dir(&arch_dir) {
        Ok(e) => e,
        Err(_) => return CheckResult { name, passed: true, violations: vec![] },
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let file_name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) if n.ends_with(".md") => n.to_string(),
            _ => continue,
        };

        let content = match fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        for (i, line) in content.lines().enumerate() {
            for caps in PATH_PATTERN.captures_iter(line) {
                if let Some(ref_path) = caps.get(1) {
                    let ref_path_str = ref_path.as_str();
                    let full_path = config.root_dir.join(ref_path_str);

                    if !full_path.exists() {
                        violations.push(format!(
                            "docs/architecture/{}:{} references `{}` but file does not exist.\n\
                             \x20   Rule: All backtick-quoted file paths in architecture docs must resolve to real files on disk.\n\
                             \x20   Fix: 1. If the file was renamed or moved, update the path in docs/architecture/{}.\n\
                             \x20        2. If the file was deleted, remove the reference from the doc.\n\
                             \x20        3. Run `git log --diff-filter=R -- '{}'` to find renames.\n\
                             \x20   See: docs/golden-principles.md",
                            file_name,
                            i + 1,
                            ref_path_str,
                            file_name,
                            ref_path_str,
                        ));
                    }
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
