use crate::checks::CheckResult;
use crate::config::LinterConfig;
use std::fs;

pub fn check(config: &LinterConfig) -> CheckResult {
    let name = "Plan lifecycle".to_string();
    let plans_dir = config.root_dir.join("thoughts/shared/plans");

    if !plans_dir.exists() {
        return CheckResult { name, passed: true, violations: vec![] };
    }

    let mut violations = Vec::new();
    let allowed_root_files = ["index.md"];

    let entries = match fs::read_dir(&plans_dir) {
        Ok(e) => e,
        Err(_) => return CheckResult { name, passed: true, violations: vec![] },
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() {
            if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
                if file_name.ends_with(".md") && !allowed_root_files.contains(&file_name) {
                    violations.push(format!(
                        "thoughts/shared/plans/{} is a plan file in the root directory.\n\
                         \x20   Rule: Plans must live in thoughts/shared/plans/active/ or thoughts/shared/plans/completed/, not the root.\n\
                         \x20   Fix: Move the file to the appropriate subdirectory:\n\
                         \x20        git mv thoughts/shared/plans/{0} thoughts/shared/plans/active/{0}   # if in progress\n\
                         \x20        git mv thoughts/shared/plans/{0} thoughts/shared/plans/completed/{0} # if shipped\n\
                         \x20   Then update thoughts/shared/plans/index.md with a summary row.",
                        file_name
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
