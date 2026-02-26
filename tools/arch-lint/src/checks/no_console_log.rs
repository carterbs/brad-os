use crate::checks::CheckResult;
use crate::config::{self, LinterConfig};
use regex::Regex;
use std::collections::HashSet;
use std::fs;
use std::path::Path;
use std::sync::LazyLock;

static CONSOLE_PATTERN: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\bconsole\.(log|warn|error|info)\s*\(").unwrap()
});

static COMMENT_LINE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^\s*//").unwrap()
});

pub fn check(config: &LinterConfig) -> CheckResult {
    let name = "No console.log in Cloud Functions".to_string();
    let src_dir = &config.functions_src;

    if !src_dir.exists() {
        return CheckResult { name, passed: true, violations: vec![] };
    }

    let skip_dirs = config::skip_dirs(&["__tests__", "test-utils", "scripts"]);
    let files = collect_ts_source_files(src_dir, &skip_dirs);
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
            if CONSOLE_PATTERN.is_match(line) {
                violations.push(format!(
                    "{}:{} uses console.* instead of Firebase logger.\n\
                     \x20   Rule: Cloud Functions must use the structured Firebase logger, not console.*.\n\
                     \x20   Fix: import {{ logger }} from 'firebase-functions/logger';\n\
                     \x20        Replace console.log(...) with logger.info(...), console.warn(...) with logger.warn(...), etc.\n\
                     \x20   See: docs/golden-principles.md",
                    rel_path.display(),
                    i + 1,
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

fn collect_ts_source_files(dir: &Path, skip_dirs: &HashSet<&str>) -> Vec<std::path::PathBuf> {
    let mut results = Vec::new();
    collect_inner(dir, skip_dirs, &mut results);
    results
}

fn collect_inner(dir: &Path, skip_dirs: &HashSet<&str>, results: &mut Vec<std::path::PathBuf>) {
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            if path.is_dir() {
                if !skip_dirs.contains(name) {
                    collect_inner(&path, skip_dirs, results);
                }
            } else if path.is_file()
                && name.ends_with(".ts")
                && !name.ends_with(".test.ts")
                && !name.ends_with(".spec.ts")
            {
                results.push(path);
            }
        }
    }
}
