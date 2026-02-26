use crate::checks::CheckResult;
use crate::config::LinterConfig;
use crate::walker;
use regex::Regex;
use std::collections::HashSet;
use std::fs;
use std::sync::LazyLock;

static URLSESSION_PATTERN: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\bURLSession\b").unwrap()
});

static COMMENT_LINE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^\s*//").unwrap()
});

pub fn check(config: &LinterConfig) -> CheckResult {
    let name = "No raw URLSession in iOS".to_string();
    let ios_app = config.root_dir.join("ios/BradOS/BradOS");

    if !ios_app.exists() {
        return CheckResult { name, passed: true, violations: vec![] };
    }

    let allowlist: HashSet<&str> = [
        "APIClient.swift",
        "StravaAuthManager.swift",
        "DebugLogExporter.swift",
        "DebugSpanExporter.swift",
    ]
    .iter()
    .copied()
    .collect();

    let files = walker::collect_swift_files(&ios_app);
    let mut violations = Vec::new();

    for file in &files {
        let basename = match file.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };

        if allowlist.contains(basename.as_str()) {
            continue;
        }
        if basename.ends_with("Tests.swift") || basename.ends_with("Test.swift") {
            continue;
        }

        let content = match fs::read_to_string(file) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let rel_path = file.strip_prefix(&config.root_dir).unwrap_or(file);

        for (i, line) in content.lines().enumerate() {
            if COMMENT_LINE.is_match(line) {
                continue;
            }
            if URLSESSION_PATTERN.is_match(line) {
                violations.push(format!(
                    "{}:{} uses URLSession directly instead of the shared APIClient.\n\
                     \x20   Rule: All iOS HTTP requests must go through the shared APIClient with App Check.\n\
                     \x20   Fix: Use APIClient.shared for HTTP requests instead of URLSession directly.\n\
                     \x20        See ios/BradOS/BradOS/Services/APIClient.swift for the shared client.\n\
                     \x20   See: docs/conventions/ios-swift.md",
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
