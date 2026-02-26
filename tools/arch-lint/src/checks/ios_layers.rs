use crate::checks::CheckResult;
use crate::config::LinterConfig;
use crate::walker;
use regex::Regex;
use std::collections::HashSet;
use std::fs;
use std::path::Path;
use std::sync::LazyLock;

static COMMENT_LINE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^\s*//").unwrap()
});

static PREVIEW_LINE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^#Preview|_Previews:").unwrap()
});

static TRAILING_COMMENT: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\s//.*$").unwrap()
});

static MOCK_PREFIX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"Mock\w+").unwrap()
});

struct CompiledType {
    name: String,
    word_regex: Regex,
    mock_regex: Regex,
}

fn compile_types(names: &[String]) -> Vec<CompiledType> {
    names
        .iter()
        .map(|name| CompiledType {
            name: name.clone(),
            word_regex: Regex::new(&format!(r"\b{}\b", regex::escape(name))).unwrap(),
            mock_regex: Regex::new(&format!(r"Mock{}", regex::escape(name))).unwrap(),
        })
        .collect()
}

pub fn check(config: &LinterConfig) -> CheckResult {
    let name = "iOS architecture layers".to_string();
    let ios_app = config.root_dir.join("ios/BradOS/BradOS");
    let services_dir = ios_app.join("Services");
    let viewmodels_dir = ios_app.join("ViewModels");
    let views_dir = ios_app.join("Views");
    let components_dir = ios_app.join("Components");

    let mut violations = Vec::new();

    // Discover and pre-compile regexes
    let service_types = discover_class_types(&services_dir, true);
    let vm_types = discover_class_types(&viewmodels_dir, false);
    let compiled_services = compile_types(&service_types);
    let compiled_vms = compile_types(&vm_types);

    // Rule 1: Views/ must not directly reference Service types
    if views_dir.exists() && !compiled_services.is_empty() {
        let view_files = walker::collect_swift_files(&views_dir);

        for view_file in &view_files {
            let content = match fs::read_to_string(view_file) {
                Ok(c) => c,
                Err(_) => continue,
            };

            let lines: Vec<&str> = content.lines().collect();
            let preview_start = first_preview_line(&content);

            for (i, line) in lines.iter().enumerate() {
                let line_num = i + 1;

                if preview_start > 0 && line_num >= preview_start {
                    continue;
                }

                if COMMENT_LINE.is_match(line) {
                    continue;
                }

                let code_part = TRAILING_COMMENT.replace(line, "");

                for ct in &compiled_services {
                    if !ct.word_regex.is_match(&code_part) {
                        continue;
                    }

                    // Skip if part of a Mock type name
                    if ct.mock_regex.is_match(&code_part) {
                        let cleaned = MOCK_PREFIX.replace_all(&code_part, "");
                        if !ct.word_regex.is_match(&cleaned) {
                            continue;
                        }
                    }

                    let rel_path = view_file.strip_prefix(&config.root_dir).unwrap_or(view_file);
                    violations.push(format!(
                        "{}:{} references {} (a Service type). Views must not depend on Services directly.\n\
                         \x20   Rule: Views/ -> ViewModels/ -> Services/. Views access data through ViewModels, never by importing Service types.\n\
                         \x20   Fix: 1. Create or find a ViewModel in ios/BradOS/BradOS/ViewModels/ that wraps {}.\n\
                         \x20        2. Move the {} usage from the View into that ViewModel.\n\
                         \x20        3. Have the View observe the ViewModel via @StateObject or @ObservedObject instead.\n\
                         \x20   Example: ios/BradOS/BradOS/ViewModels/CyclingViewModel.swift wraps CyclingCoachClient so Views never reference it.\n\
                         \x20   See: docs/conventions/ios-swift.md",
                        rel_path.display(),
                        line_num,
                        ct.name,
                        ct.name,
                        ct.name,
                    ));
                }
            }
        }
    }

    // Rule 2: Components/ must not reference ViewModel types
    if components_dir.exists() && !compiled_vms.is_empty() {
        let comp_files = walker::collect_swift_files(&components_dir);

        for comp_file in &comp_files {
            let content = match fs::read_to_string(comp_file) {
                Ok(c) => c,
                Err(_) => continue,
            };

            let lines: Vec<&str> = content.lines().collect();
            let preview_start = first_preview_line(&content);

            for (i, line) in lines.iter().enumerate() {
                let line_num = i + 1;

                if preview_start > 0 && line_num >= preview_start {
                    continue;
                }

                if COMMENT_LINE.is_match(line) {
                    continue;
                }

                let code_part = TRAILING_COMMENT.replace(line, "");

                for ct in &compiled_vms {
                    if !ct.word_regex.is_match(&code_part) {
                        continue;
                    }

                    let rel_path = comp_file.strip_prefix(&config.root_dir).unwrap_or(comp_file);
                    violations.push(format!(
                        "{}:{} references {} (a ViewModel type). Components must not depend on ViewModels.\n\
                         \x20   Rule: Components/ are reusable UI pieces that receive data via parameters (plain types, closures). They never import or reference ViewModel classes.\n\
                         \x20   Fix: 1. Replace the {} reference with a plain parameter (e.g. a struct, array, or closure).\n\
                         \x20        2. Have the parent View that owns {} extract the needed data and pass it as a parameter.\n\
                         \x20        3. If the Component needs to trigger actions, pass a closure parameter instead of the whole ViewModel.\n\
                         \x20   Example: Components/LoadStateView.swift accepts generic content closures instead of referencing any ViewModel directly.\n\
                         \x20   See: docs/conventions/ios-swift.md",
                        rel_path.display(),
                        line_num,
                        ct.name,
                        ct.name,
                        ct.name,
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

fn discover_class_types(dir: &Path, include_actors: bool) -> Vec<String> {
    if !dir.exists() {
        return vec![];
    }

    let pattern = if include_actors {
        Regex::new(r"^\s*(?:final\s+)?(?:class|actor)\s+(\w+)").unwrap()
    } else {
        Regex::new(r"^\s*(?:final\s+)?class\s+(\w+)").unwrap()
    };

    let mut types = HashSet::new();

    // Only check top-level Swift files (not recursive)
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return vec![],
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if let Some(fname) = path.file_name().and_then(|n| n.to_str()) {
            if !fname.ends_with(".swift") || !path.is_file() {
                continue;
            }
        }

        let content = match fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        for line in content.lines() {
            if let Some(caps) = pattern.captures(line) {
                if let Some(m) = caps.get(1) {
                    types.insert(m.as_str().to_string());
                }
            }
        }
    }

    let mut sorted: Vec<String> = types.into_iter().collect();
    sorted.sort();
    sorted
}

fn first_preview_line(content: &str) -> usize {
    for (i, line) in content.lines().enumerate() {
        if PREVIEW_LINE.is_match(line) {
            return i + 1;
        }
    }
    0
}
