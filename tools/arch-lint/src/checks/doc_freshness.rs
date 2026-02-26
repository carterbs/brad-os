use crate::checks::{self, CheckResult};
use crate::config::LinterConfig;
use regex::Regex;
use std::fs;
use std::path::Path;
use std::sync::LazyLock;

const QUALITY_GRADES_PATH: &str = "docs/quality-grades.md";
const ACTIVE_TECH_DEBT_HEADER: &str = "## Active Tech Debt";
const AGENTS_PATH: &str = "AGENTS.md";
const CREATE_RESOURCE_ROUTER_TITLE: &str = "createResourceRouter factory";
const SHARED_TEST_UTILS_TITLE: &str = "Shared test utilities";
const ZOD_ONLY_TYPES_TITLE: &str = "Zod-only types";

struct DebtCompletionRule {
    label: &'static str,
    evidence: &'static [EvidenceFileRule],
}

struct EvidenceFileRule {
    path: &'static str,
    must_contain: &'static [&'static str],
}

static QUALITY_DEBT_RULES: &[DebtCompletionRule] = &[DebtCompletionRule {
    label: "Calendar missing cycling activities",
    evidence: &[
        EvidenceFileRule {
            path: "packages/functions/src/services/calendar.service.ts",
            must_contain: &[
                "import { getCyclingActivities } from './firestore-cycling.service.js';",
                "type: 'cycling'",
                "dayData.summary.hasCycling = true;",
            ],
        },
        EvidenceFileRule {
            path: "packages/functions/src/services/calendar.service.test.ts",
            must_contain: &[
                "should include cycling activities in days map",
                "should set hasCycling flag and increment totals when cycling exists",
            ],
        },
    ],
}];

static QUALITY_DEBT_PATTERN: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^\\s*-\\s*\\[ \\]\\s*\\*\\*([^*]+)\\*\\*").unwrap()
});

static CREATE_RESOURCE_ROUTER_EXPORT_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"export\\s+(?:async\\s+)?function\\s+createResourceRouter").unwrap()
});

static CREATE_BASE_APP_EXPORT_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"export\\s+(?:async\\s+)?function\\s+createBaseApp").unwrap()
});

static HANDLER_IMPORT_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"import\\s+.*createResourceRouter.*from\\s+[\"'].*create-resource-router(\\.js|\\.ts)?[\"']"#)
        .unwrap()
});

static AGENTS_LINK_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\\[[^\\]]+\\]\\(([^)]+)\\)").unwrap()
});

pub fn check(config: &LinterConfig) -> CheckResult {
    let name = "Documentation freshness".to_string();
    let mut violations = Vec::new();

    check_quality_grades_completion(config, &mut violations);
    check_agents_guides_links(config, &mut violations);

    let arch_map_check = checks::arch_map_refs::check(config);
    violations.extend(arch_map_check.violations);

    CheckResult {
        passed: violations.is_empty(),
        name,
        violations,
    }
}

fn check_quality_grades_completion(config: &LinterConfig, violations: &mut Vec<String>) {
    let quality_grades = config.root_dir.join(QUALITY_GRADES_PATH);
    if !quality_grades.exists() {
        violations.push(format!(
            "docs/quality-grades.md:1 is missing.\n\
             \x20   Rule: Quality-grade debt must be represented in docs/quality-grades.md.\n\
             \x20   Fix: Restore docs/quality-grades.md and keep tech debt status in sync with shipped code.\n\
             \x20   See: docs/golden-principles.md"
        ));
        return;
    }

    let content = match fs::read_to_string(&quality_grades) {
        Ok(c) => c,
        Err(_) => {
            violations.push(format!(
                "docs/quality-grades.md:1 could not be read.\n\
                 \x20   Rule: Quality-grade evidence checks require readable docs/quality-grades.md.\n\
                 \x20   Fix: Ensure the file is accessible and committed.\n\
                 \x20   See: docs/golden-principles.md"
            ));
            return;
        }
    };

    let root = config.root_dir.clone();
    let mut in_active_debt_section = false;
    for (idx, line) in content.lines().enumerate() {
        let line_no = idx + 1;
        let trimmed = line.trim();

        if trimmed == ACTIVE_TECH_DEBT_HEADER {
            in_active_debt_section = true;
            continue;
        }
        if in_active_debt_section && trimmed.starts_with("## ") {
            in_active_debt_section = false;
            continue;
        }

        let Some(caps) = QUALITY_DEBT_PATTERN.captures(line) else {
            continue;
        };
        let Some(title) = caps.get(1).map(|m| m.as_str()) else {
            continue;
        };
        let title = title.trim();

        if let Some(rule) = QUALITY_DEBT_RULES.iter().find(|r| r.label == title) {
            if rule_is_complete(config, rule) {
                violations.push(format!(
                    "{QUALITY_GRADES_PATH}:{line_no} keeps \"{title}\" unchecked, but source evidence shows completion.\n\
                     \x20   Rule: Unchecked technical debt must not remain once code evidence indicates completion.\n\
                     \x20   Fix: Set the item to [x] after shipping the underlying code path.\n\
                     \x20   Evidence checked:\n\
                     \x20     - {evidence_paths}\n\
                     \x20   See: docs/golden-principles.md",
                    evidence_paths = rule.evidence.iter().map(|e| e.path).collect::<Vec<_>>().join(", ")
                ));
            }
        }

        if !in_active_debt_section {
            continue;
        }

        let is_complete = match title {
            t if t.eq_ignore_ascii_case(CREATE_RESOURCE_ROUTER_TITLE) => {
                is_create_resource_router_complete(&root)
            }
            t if t.eq_ignore_ascii_case(SHARED_TEST_UTILS_TITLE) => is_shared_test_utils_complete(&root),
            t if t.eq_ignore_ascii_case(ZOD_ONLY_TYPES_TITLE) => is_zod_only_types_complete(&root),
            _ => false,
        };

        if is_complete {
            violations.push(format!(
                "{QUALITY_GRADES_PATH}:{line_no} unchecked debt item `{title}` is already complete in the codebase.\n\
                 \x20   Rule: Docs should mark debt items complete when implementation evidence exists.\n\
                 \x20   Fix: Change the entry to `- [x]` and, if needed, update wording.\n\
                 \x20   If this work is intentionally deferred, leave it checked and explain why.\n\
                 \x20   See: docs/golden-principles.md"
            ));
        }
    }
}

fn rule_is_complete(config: &LinterConfig, rule: &DebtCompletionRule) -> bool {
    rule.evidence
        .iter()
        .all(|rule| evidence_file_contains_markers(config, rule))
}

fn evidence_file_contains_markers(config: &LinterConfig, rule: &EvidenceFileRule) -> bool {
    let path = config.root_dir.join(rule.path);
    let contents = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return false,
    };

    rule.must_contain.iter().all(|needle| contents.contains(needle))
}

fn is_create_resource_router_complete(root: &Path) -> bool {
    let router_file = root.join("packages/functions/src/middleware/create-resource-router.ts");
    if !router_file.exists() {
        return false;
    }

    let router_content = match fs::read_to_string(&router_file) {
        Ok(c) => c,
        Err(_) => return false,
    };

    if !(CREATE_RESOURCE_ROUTER_EXPORT_RE.is_match(&router_content)
        && CREATE_BASE_APP_EXPORT_RE.is_match(&router_content))
    {
        return false;
    }

    let handlers_dir = root.join("packages/functions/src/handlers");
    if !handlers_dir.exists() {
        return false;
    }

    let mut stack = vec![handlers_dir];
    while let Some(dir) = stack.pop() {
        let entries = match fs::read_dir(&dir) {
            Ok(entries) => entries,
            Err(_) => continue,
        };

        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
                continue;
            }

            if path.extension().and_then(|ext| ext.to_str()) != Some("ts") {
                continue;
            }

            let file_name = match path.file_name().and_then(|name| name.to_str()) {
                Some(name) => name,
                None => continue,
            };
            if !file_name.ends_with(".ts") {
                continue;
            }

            let contents = match fs::read_to_string(&path) {
                Ok(c) => c,
                Err(_) => continue,
            };

            if HANDLER_IMPORT_RE.is_match(&contents) {
                return true;
            }
        }
    }

    false
}

fn is_shared_test_utils_complete(root: &Path) -> bool {
    let test_utils = root.join("packages/functions/src/test-utils/index.ts");
    let test_utils_index = root.join("packages/functions/src/__tests__/utils/index.ts");
    if !test_utils.exists() || !test_utils_index.exists() {
        return false;
    }

    let repo_tests_dir = root.join("packages/functions/src/repositories");
    if !repo_tests_dir.exists() {
        return false;
    }

    let entries = match fs::read_dir(&repo_tests_dir) {
        Ok(e) => e,
        Err(_) => return false,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        if !path.file_name().and_then(|n| n.to_str()).unwrap_or("").ends_with(".repository.test.ts") {
            continue;
        }

        let content = match fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => continue,
        };
        if content.contains("../test-utils/index.js") || content.contains("./test-utils/index.js") {
            return true;
        }
    }

    false
}

fn is_zod_only_types_complete(_root: &Path) -> bool {
    // Conservative by design: only flag when completion can be proven with strong signal.
    // No reliable deterministic signal exists today.
    false
}

fn check_agents_guides_links(config: &LinterConfig, violations: &mut Vec<String>) {
    let agents = config.root_dir.join(AGENTS_PATH);
    if !agents.exists() {
        violations.push(format!(
            "AGENTS.md:1 is missing.\n\
             \x20   Rule: AGENTS guide links must remain verifiable for onboarding flows.\n\
             \x20   Fix: Restore AGENTS.md and keep the file and its Guides table current.\n\
             \x20   See: docs/golden-principles.md"
        ));
        return;
    }

    let content = match fs::read_to_string(&agents) {
        Ok(c) => c,
        Err(_) => {
            violations.push(format!(
                "AGENTS.md:1 could not be read.\n\
                 \x20   Rule: AGENTS guide links must be verifiable.\n\
                 \x20   Fix: Ensure AGENTS.md is readable by architecture lint.\n\
                 \x20   See: docs/golden-principles.md"
            ));
            return;
        }
    };

    let mut in_guides_section = false;
    let mut in_code_fence = false;
    for (i, line) in content.lines().enumerate() {
        if line.starts_with("```") {
            in_code_fence = !in_code_fence;
            continue;
        }
        if in_code_fence {
            continue;
        }

        if line.trim() == "## Guides" {
            in_guides_section = true;
            continue;
        }
        if in_guides_section && line.starts_with("## ") {
            break;
        }

        if !in_guides_section {
            continue;
        }

        for caps in AGENTS_LINK_RE.captures_iter(line) {
            let Some(target) = caps.get(1).map(|m| m.as_str().trim()) else {
                continue;
            };

            if target.starts_with("http://") || target.starts_with("https://") || target.starts_with("mailto:") {
                continue;
            }

            let target = target.split('#').next().unwrap_or(target).trim();
            if target.is_empty() {
                continue;
            }

            if target.starts_with("docs/guides/") {
                let full_path = config.root_dir.join(target);
                if !full_path.exists() {
                    violations.push(format!(
                        "AGENTS.md:{} guide link target `{}` does not exist.\n\
                         \x20   Rule: All AGENTS.md guide references in the Guides section must resolve to real files under docs/guides/.\n\
                         \x20   Fix: 1. If the file was moved, update the target path.\n\
                         \x20        2. If the file was renamed, preserve the new path.\n\
                         \x20        3. If intentionally removed, remove or replace the row.\n\
                         \x20   See: docs/golden-principles.md",
                        i + 1,
                        target,
                    ));
                }
            } else {
                violations.push(format!(
                    "AGENTS.md:{} guide link target `{}` is not under docs/guides/.\n\
                     \x20   Rule: Guide links must remain in docs/guides to avoid stale/misplaced references.\n\
                     \x20   Fix: Move or update the guide so target is `docs/guides/<name>.md`.\n\
                     \x20   See: docs/golden-principles.md",
                    i + 1,
                    target,
                ));
            }
        }
    }
}
