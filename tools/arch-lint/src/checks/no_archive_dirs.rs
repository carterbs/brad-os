use crate::checks::CheckResult;
use crate::config::{self, LinterConfig};
use std::collections::HashSet;
use std::fs;
use std::path::Path;

pub fn check(config: &LinterConfig) -> CheckResult {
    let name = "No archive directories".to_string();
    let skip_dirs = config::skip_dirs(&[]);
    let target_names: HashSet<&str> = ["archive", "archives"].iter().copied().collect();
    let mut violations = Vec::new();

    walk(&config.root_dir, &skip_dirs, &target_names, &config.root_dir, &mut violations);

    CheckResult {
        passed: violations.is_empty(),
        name,
        violations,
    }
}

fn walk(
    dir_path: &Path,
    skip_dirs: &HashSet<&str>,
    target_names: &HashSet<&str>,
    root_dir: &Path,
    violations: &mut Vec<String>,
) {
    let entries = match fs::read_dir(dir_path) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        if let Some(dir_name) = path.file_name().and_then(|n| n.to_str()) {
            if skip_dirs.contains(dir_name) || dir_name.starts_with('.') {
                continue;
            }

            let rel_path = path.strip_prefix(root_dir).unwrap_or(&path);
            if target_names.contains(dir_name.to_lowercase().as_str()) {
                violations.push(format!(
                    "{} exists.\n\
                     \x20   Rule: Archive directories are not allowed.\n\
                     \x20   Fix: Move any still-relevant content into active docs/plans, then delete {}/.\n\
                     \x20   See: docs/golden-principles.md",
                    rel_path.display(),
                    rel_path.display(),
                ));
            }

            walk(&path, skip_dirs, target_names, root_dir, violations);
        }
    }
}
