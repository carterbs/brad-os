use crate::checks::{arch_map_refs, CheckResult};
use crate::config::LinterConfig;
use regex::Regex;
use std::fs;
use std::sync::LazyLock;

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
    Regex::new(r"^\s*-\s*\[ \]\s*\*\*(?P<label>[^*]+)\*\*").unwrap()
});

static GUIDE_LINK_PATTERN: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\[[^\]]+\]\(([^)]+)\)").unwrap()
});

pub fn check(config: &LinterConfig) -> CheckResult {
    let name = "Doc freshness".to_string();
    let mut violations = Vec::new();

    violations.extend(check_quality_grades_completion(config));
    violations.extend(check_architecture_map_refs(config));
    violations.extend(check_agents_guide_links(config));

    CheckResult {
        passed: violations.is_empty(),
        name,
        violations,
    }
}

fn check_quality_grades_completion(config: &LinterConfig) -> Vec<String> {
    let quality_grades = config.root_dir.join("docs/quality-grades.md");
    if !quality_grades.exists() {
        return vec![format!(
            "docs/quality-grades.md:1 is missing.\n\
             \x20   Rule: Quality-grade debt must be represented in docs/quality-grades.md.\n\
             \x20   Fix: Restore docs/quality-grades.md and keep tech debt status in sync with shipped code.\n\
             \x20   See: docs/golden-principles.md"
        )];
    }

    let content = match fs::read_to_string(&quality_grades) {
        Ok(c) => c,
        Err(_) => {
            return vec![format!(
                "docs/quality-grades.md:1 could not be read.\n\
                 \x20   Rule: Quality-grade evidence checks require readable docs/quality-grades.md.\n\
                 \x20   Fix: Ensure the file is accessible and committed.\n\
                 \x20   See: docs/golden-principles.md"
            )];
        }
    };

    let mut violations = Vec::new();
    for (i, line) in content.lines().enumerate() {
        let line_number = i + 1;
        let Some(caps) = QUALITY_DEBT_PATTERN.captures(line) else {
            continue;
        };

        let Some(label) = caps.name("label").map(|m| m.as_str()) else {
            continue;
        };

        if let Some(rule) = QUALITY_DEBT_RULES.iter().find(|r| r.label == label) {
            if rule_is_complete(config, rule) {
                violations.push(format!(
                    "docs/quality-grades.md:{line_number} keeps \"{label}\" unchecked, but source evidence shows completion.\n\
                     \x20   Rule: Unchecked technical debt must not remain once code evidence indicates completion.\n\
                     \x20   Fix: Set the item to [x] after shipping the underlying code path.\n\
                     \x20   Evidence checked:\n\
                     \x20     - {evidence_paths}\n\
                     \x20   See: docs/golden-principles.md",
                    evidence_paths = rule
                        .evidence
                        .iter()
                        .map(|e| e.path)
                        .collect::<Vec<_>>()
                        .join(", ")
                ));
            }
        }
    }

    violations
}

fn rule_is_complete(config: &LinterConfig, rule: &DebtCompletionRule) -> bool {
    rule.evidence.iter().all(|rule| evidence_file_contains_markers(config, rule))
}

fn evidence_file_contains_markers(config: &LinterConfig, rule: &EvidenceFileRule) -> bool {
    let path = config.root_dir.join(rule.path);
    let contents = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return false,
    };

    rule
        .must_contain
        .iter()
        .all(|needle| contents.contains(needle))
}

fn check_architecture_map_refs(config: &LinterConfig) -> Vec<String> {
    arch_map_refs::check(config).violations
}

fn check_agents_guide_links(config: &LinterConfig) -> Vec<String> {
    let agents = config.root_dir.join("AGENTS.md");
    if !agents.exists() {
        return vec![format!(
            "AGENTS.md:1 is missing.\n\
             \x20   Rule: AGENTS guide links must remain verifiable for onboarding flows.\n\
             \x20   Fix: Restore AGENTS.md and keep the file and its Guides table current.\n\
             \x20   See: docs/golden-principles.md"
        )];
    }

    let content = match fs::read_to_string(&agents) {
        Ok(c) => c,
        Err(_) => {
            return vec![format!(
                "AGENTS.md:1 could not be read.\n\
                 \x20   Rule: AGENTS guide links must be verifiable.\n\
                 \x20   Fix: Ensure AGENTS.md is readable by architecture lint.\n\
                 \x20   See: docs/golden-principles.md"
            )];
        }
    };

    let mut violations = Vec::new();
    let mut in_guides_section = false;

    for (i, line) in content.lines().enumerate() {
        let trimmed = line.trim();

        if trimmed.starts_with("## Guides") {
            in_guides_section = true;
            continue;
        }

        if in_guides_section {
            if trimmed.starts_with("## ") {
                break;
            }

            for caps in GUIDE_LINK_PATTERN.captures_iter(line) {
                let Some(target) = caps.get(1).map(|m| m.as_str()) else {
                    continue;
                };
                let target = target.split('#').next().unwrap_or(target).trim();
                if target.is_empty()
                    || target.starts_with("http://")
                    || target.starts_with("https://")
                    || target.starts_with("mailto:")
                {
                    continue;
                }

                let target = target.split_whitespace().next().unwrap_or(target).trim_matches(&['"', '\''][..]);
                if target.is_empty() {
                    continue;
                }

                let resolved = config.root_dir.join(target);
                if !resolved.exists() {
                    violations.push(format!(
                        "AGENTS.md:{} has a Guides table link target '{}' that does not exist.\n\
                         \x20   Rule: AGENTS guide links must resolve to existing files.\n\
                         \x20   Fix: Update the link target to an existing doc or add the referenced file.\n\
                         \x20   See: docs/golden-principles.md",
                        i + 1,
                        target
                    ));
                }
            }
        }
    }

    violations
}
