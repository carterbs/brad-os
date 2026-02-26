use crate::checks::CheckResult;
use crate::config::LinterConfig;
use std::fs;

const ALLOWLIST: &[&str] = &["base.repository.ts"];

pub fn check(config: &LinterConfig) -> CheckResult {
    let name = "Repository test coverage".to_string();
    let repo_dir = config.functions_src.join("repositories");

    if !repo_dir.exists() {
        return CheckResult { name, passed: true, violations: vec![] };
    }

    let mut violations = Vec::new();

    let entries = match fs::read_dir(&repo_dir) {
        Ok(e) => e,
        Err(_) => return CheckResult { name, passed: true, violations: vec![] },
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let file_name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };

        if !file_name.ends_with(".repository.ts")
            || file_name.ends_with(".test.ts")
            || file_name.ends_with(".spec.ts")
            || ALLOWLIST.contains(&file_name.as_str())
        {
            continue;
        }

        let base_name = file_name.replace(".ts", "");
        let test_file = format!("{}.test.ts", base_name);
        let test_path = repo_dir.join(&test_file);

        if !test_path.exists() {
            let rel_path = path.strip_prefix(&config.root_dir).unwrap_or(&path);
            let rel_test_path = test_path.strip_prefix(&config.root_dir).unwrap_or(&test_path);
            violations.push(format!(
                "{} has no colocated test file.\n\
                 \x20   Rule: Every non-abstract repository must have a colocated .test.ts file.\n\
                 \x20   Fix: Create {} with tests for all public methods.\n\
                 \x20   If this file is intentionally untested (e.g., abstract base class),\n\
                 \x20   add it to the ALLOWLIST in checkRepositoryTestCoverage().",
                rel_path.display(),
                rel_test_path.display(),
            ));
        }
    }

    CheckResult {
        passed: violations.is_empty(),
        name,
        violations,
    }
}
