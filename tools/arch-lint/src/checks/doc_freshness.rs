use crate::checks::CheckResult;
use crate::config::LinterConfig;
use regex::Regex;
use std::fs;
use std::path::Path;
use std::sync::LazyLock;

static UNCHECKED_DEBT_PATTERN: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^\s*- \[ \]\s*\*\*(?P<label>[^*]+)\*\*")
        .unwrap()
});

static CREATE_RESOURCE_ROUTER_EXPORT_PATTERN: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"export\s+function\s+createResourceRouter\b")
        .unwrap()
});

static CREATE_BASE_APP_EXPORT_PATTERN: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"export\s+function\s+createBaseApp\b")
        .unwrap()
});

static HANDLER_ROUTER_USAGE_PATTERN: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\b(?:createResourceRouter|createBaseApp)\s*\(")
        .unwrap()
});

static TEST_UTILS_IMPORT_PATTERN: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"['\"]\.\./test-utils/index\.js['\"]"#).unwrap()
});

static MARKDOWN_LINK_PATTERN: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\[[^\]]+\]\(([^)]+)\)").unwrap());

pub struct TechDebtItem {
    pub label: String,
    pub line: usize,
}

pub fn check(config: &LinterConfig) -> CheckResult {
    let name = "Doc freshness".to_string();
    let mut violations = Vec::new();

    violations.extend(collect_quality_grades_stale_debt(config));
    violations.extend(collect_architecture_map_staleness(config));
    violations.extend(collect_agents_guide_link_violations(config));

    CheckResult {
        passed: violations.is_empty(),
        name,
        violations,
    }
}

pub fn collect_quality_grades_stale_debt(config: &LinterConfig) -> Vec<String> {
    let quality_grades = config.root_dir.join("docs/quality-grades.md");

    if !quality_grades.exists() {
        return vec![];
    }

    let content = match fs::read_to_string(&quality_grades) {
        Ok(c) => c,
        Err(_) => return vec![],
    };

    let mut violations = Vec::new();
    for item in parse_unchecked_tech_debt_items(&content) {
        match item.label.as_str() {
            "createResourceRouter factory" => {
                if let Some(evidence) = has_create_resource_router_evidence(config) {
                    violations.push(format!(
                        "docs/quality-grades.md:{} marks '**{}**' as unchecked, but completion evidence exists: {}.\n\
   Rule: Tech debt checklists should match the real implementation state.\n\
   Fix: Mark this item as completed (`[x]`) or move it to `## Recently Completed` with evidence details.",
                        item.line,
                        item.label,
                        evidence.join(", "),
                    ));
                }
            }
            "Shared test utilities" => {
                if let Some(evidence) = has_shared_test_utils_evidence(config) {
                    violations.push(format!(
                        "docs/quality-grades.md:{} marks '**{}**' as unchecked, but completion evidence exists: {}.\n\
   Rule: Tech debt checklists should match the real implementation state.\n\
   Fix: Mark this item as completed (`[x]`) or move it to `## Recently Completed` with evidence details.",
                        item.line,
                        item.label,
                        evidence.join(", "),
                    ));
                }
            }
            _ => {}
        }
    }

    violations
}

pub fn collect_architecture_map_staleness(config: &LinterConfig) -> Vec<String> {
    crate::checks::arch_map_refs::check(config).violations
}

pub fn collect_agents_guide_link_violations(config: &LinterConfig) -> Vec<String> {
    let agents_md = config.root_dir.join("AGENTS.md");
    if !agents_md.exists() {
        return vec![];
    }

    let content = match fs::read_to_string(&agents_md) {
        Ok(c) => c,
        Err(_) => return vec![],
    };

    let mut violations = Vec::new();
    let mut in_guides_section = false;
    for (i, line) in content.lines().enumerate() {
        if line.trim_start().starts_with("## Guides") {
            in_guides_section = true;
            continue;
        }

        if in_guides_section && line.trim_start().starts_with("## ") {
            break;
        }

        if !in_guides_section {
            continue;
        }

        if !line.trim_start().starts_with('|') {
            continue;
        }

        for caps in MARKDOWN_LINK_PATTERN.captures_iter(line) {
            if let Some(raw_target) = caps.get(1) {
                let target = raw_target.as_str().trim();
                if target.is_empty() {
                    continue;
                }

                if target.starts_with("http://")
                    || target.starts_with("https://")
                    || target.starts_with("mailto:")
                    || target.contains('#')
                {
                    continue;
                }

                if !target.starts_with("docs/guides/") {
                    violations.push(format!(
                        "AGENTS.md:{} has a guides table link target '{}' but guide links must be under docs/guides/.\n\
   Rule: The guides table should only link to guide files in docs/guides/.\n\
   Fix: Update the link target to a valid path under docs/guides/ and ensure the file exists.",
                        i + 1,
                        target,
                    ));
                    continue;
                }

                let resolved = config.root_dir.join(target);
                if !resolved.exists() {
                    violations.push(format!(
                        "AGENTS.md:{} links to '{}' but target file does not exist.\n\
   Rule: Guide links must point to existing local files.\n\
   Fix: Create the guide at {} or update the table to point to an existing docs/guides file.",
                        i + 1,
                        target,
                        target,
                    ));
                }
            }
        }
    }

    violations
}

pub fn parse_unchecked_tech_debt_items(markdown: &str) -> Vec<TechDebtItem> {
    let mut in_active_tech_debt = false;
    let mut items = Vec::new();

    for (i, line) in markdown.lines().enumerate() {
        if line.trim_start().starts_with("## Active Tech Debt") {
            in_active_tech_debt = true;
            continue;
        }

        if in_active_tech_debt && line.trim_start().starts_with("## ") {
            break;
        }

        if !in_active_tech_debt {
            continue;
        }

        if let Some(caps) = UNCHECKED_DEBT_PATTERN.captures(line) {
            if let Some(label) = caps.name("label") {
                items.push(TechDebtItem {
                    label: label.as_str().trim().to_string(),
                    line: i + 1,
                });
            }
        }
    }

    items
}

pub fn has_create_resource_router_evidence(config: &LinterConfig) -> Option<Vec<String>> {
    let mut evidence = Vec::new();

    let router_file = config
        .root_dir
        .join("packages/functions/src/middleware/create-resource-router.ts");
    if !router_file.exists() {
        return None;
    }

    let router_content = match fs::read_to_string(&router_file) {
        Ok(c) => c,
        Err(_) => return None,
    };

    if !CREATE_RESOURCE_ROUTER_EXPORT_PATTERN.is_match(&router_content)
        || !CREATE_BASE_APP_EXPORT_PATTERN.is_match(&router_content)
    {
        return None;
    }

    evidence.push("packages/functions/src/middleware/create-resource-router.ts exports createResourceRouter and createBaseApp".to_string());

    let test_file = config
        .root_dir
        .join("packages/functions/src/middleware/create-resource-router.test.ts");
    if !test_file.exists() {
        return None;
    }
    evidence.push("packages/functions/src/middleware/create-resource-router.test.ts exists".to_string());

    if !has_create_resource_router_handler_usage(config) {
        return None;
    }
    evidence.push("handlers import/use createResourceRouter or createBaseApp".to_string());

    Some(evidence)
}

fn has_create_resource_router_handler_usage(config: &LinterConfig) -> bool {
    let handlers_dir = config.root_dir.join("packages/functions/src/handlers");
    if !handlers_dir.exists() {
        return false;
    }

    let mut files = Vec::new();
    collect_files_with_suffix(&handlers_dir, "ts", &mut files);

    for file in files {
        let content = match fs::read_to_string(&file) {
            Ok(c) => c,
            Err(_) => continue,
        };

        if HANDLER_ROUTER_USAGE_PATTERN.is_match(&content) {
            return true;
        }
    }

    false
}

pub fn has_shared_test_utils_evidence(config: &LinterConfig) -> Option<Vec<String>> {
    let mut evidence = Vec::new();

    let index_file = config
        .root_dir
        .join("packages/functions/src/test-utils/index.ts");
    if !index_file.exists() {
        return None;
    }
    evidence.push("packages/functions/src/test-utils/index.ts exists".to_string());

    let mock_file = config
        .root_dir
        .join("packages/functions/src/test-utils/firestore-mock.ts");
    if !mock_file.exists() {
        return None;
    }
    evidence.push("packages/functions/src/test-utils/firestore-mock.ts exists".to_string());

    let functions_src = config.root_dir.join("packages/functions/src");
    if !functions_src.exists() {
        return None;
    }

    let mut test_files = Vec::new();
    collect_files_with_suffix(&functions_src, "test.ts", &mut test_files);
    collect_files_with_suffix(&functions_src, "test.js", &mut test_files);

    let mut matching_imports = 0;
    for file in test_files {
        let content = match fs::read_to_string(&file) {
            Ok(c) => c,
            Err(_) => continue,
        };

        if TEST_UTILS_IMPORT_PATTERN.is_match(&content) {
            matching_imports += 1;
        }
    }

    if matching_imports < 3 {
        return None;
    }

    evidence.push(format!(
        "{} backend test files import ../test-utils/index.js",
        matching_imports
    ));

    Some(evidence)
}

fn collect_files_with_suffix(dir: &Path, suffix: &str, files: &mut Vec<std::path::PathBuf>) {
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_files_with_suffix(&path, suffix, files);
            continue;
        }

        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            if name.ends_with(&format!(".{suffix}")) {
                files.push(path);
            }
        }
    }
}
