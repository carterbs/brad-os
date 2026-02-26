use crate::checks::CheckResult;
use crate::config::{self, LinterConfig};
use regex::Regex;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::LazyLock;

static LINK_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"!?\[(?:[^\]]*)\]\(([^)]+)\)").unwrap()
});

static CODE_FENCE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^\s*```").unwrap()
});

pub fn check(config: &LinterConfig) -> CheckResult {
    let name = "Markdown link targets".to_string();

    let skip_dirs = config::skip_dirs(&[]);

    let scan_roots: Vec<PathBuf> = vec![
        config.root_dir.join("docs"),
        config.root_dir.join("thoughts/shared/plans/active"),
        config.root_dir.join("thoughts/shared/handoffs"),
    ];

    let root_markdown_files: Vec<PathBuf> = vec![
        config.root_dir.join("CLAUDE.md"),
        config.root_dir.join("AGENTS.md"),
        config.root_dir.join("README.md"),
        config.root_dir.join("BUGS.md"),
        config.root_dir.join("requirements.md"),
        config.root_dir.join("thoughts/shared/plans/index.md"),
    ];

    let skip_path_prefixes: Vec<PathBuf> = vec![
        config.root_dir.join("thoughts/shared/plans/completed"),
        config.root_dir.join("thoughts/shared/research"),
        config.root_dir.join("thoughts/shared/plans/stretching"),
        config.root_dir.join("thoughts/shared/plans/meditation"),
    ];

    let mut files: Vec<PathBuf> = Vec::new();

    // Collect root markdown files
    for root_file in &root_markdown_files {
        if root_file.exists() && root_file.is_file() {
            if let Some(name) = root_file.file_name().and_then(|n| n.to_str()) {
                if name.ends_with(".md") && name != "meditations.md" {
                    files.push(root_file.clone());
                }
            }
        }
    }

    // Collect from scan roots
    for scan_root in &scan_roots {
        if scan_root.exists() {
            collect_md_files(scan_root, &skip_dirs, &skip_path_prefixes, &config.root_dir, &mut files);
        }
    }

    let mut violations = Vec::new();
    for file in &files {
        check_file(file, &config.root_dir, &mut violations);
    }

    CheckResult {
        passed: violations.is_empty(),
        name,
        violations,
    }
}

fn collect_md_files(
    dir: &Path,
    skip_dirs: &HashSet<&str>,
    skip_prefixes: &[PathBuf],
    _root_dir: &Path,
    results: &mut Vec<PathBuf>,
) {
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            if path.is_dir() {
                if skip_dirs.contains(name) {
                    continue;
                }
                if skip_prefixes.iter().any(|p| path.starts_with(p)) {
                    continue;
                }
                collect_md_files(&path, skip_dirs, skip_prefixes, _root_dir, results);
            } else if path.is_file() && name.ends_with(".md") && name != "meditations.md" {
                results.push(path);
            }
        }
    }
}

fn is_link_skipped(target: &str) -> bool {
    if target.starts_with("http://") || target.starts_with("https://") || target.starts_with("mailto:") {
        return true;
    }
    if target.starts_with('#') {
        return true;
    }
    if target.contains('<') {
        return true;
    }
    if target.contains('*') {
        return true;
    }
    false
}

fn strip_optional_title(raw_target: &str) -> &str {
    if let Some(idx) = raw_target.find(" \"") {
        return &raw_target[..idx];
    }
    if let Some(idx) = raw_target.find(" '") {
        return &raw_target[..idx];
    }
    raw_target
}

fn check_file(file_path: &Path, root_dir: &Path, violations: &mut Vec<String>) {
    let rel_path = file_path.strip_prefix(root_dir).unwrap_or(file_path);
    let content = match fs::read_to_string(file_path) {
        Ok(c) => c,
        Err(_) => return,
    };

    let mut in_code_fence = false;

    for (i, line) in content.lines().enumerate() {
        if CODE_FENCE.is_match(line) {
            in_code_fence = !in_code_fence;
            continue;
        }
        if in_code_fence {
            continue;
        }

        // Strip inline code
        let content_line = strip_inline_code(line);

        for caps in LINK_REGEX.captures_iter(&content_line) {
            if let Some(raw_target) = caps.get(1) {
                let target = raw_target.as_str().trim();
                if is_link_skipped(target) {
                    continue;
                }

                let no_fragment = target.split('#').next().unwrap_or(target);
                let no_title = strip_optional_title(no_fragment).trim();
                if no_title.is_empty() {
                    continue;
                }

                let source_dir = file_path.parent().unwrap_or(Path::new("."));
                let resolved = source_dir.join(no_title);
                // Canonicalize by cleaning up the path
                let resolved = normalize_path(&resolved);

                if !resolved.exists() {
                    violations.push(format!(
                        "{}:{} links to '{}' but file does not exist.\n\
                         \x20   Rule: All markdown links must resolve to real files on disk.\n\
                         \x20   Fix: 1. If the file was renamed or moved, update the link.\n\
                         \x20        2. If the file was deleted, remove the link.\n\
                         \x20        3. Run `git log --diff-filter=R -- '{}'` to find renames.\n\
                         \x20   See: docs/golden-principles.md",
                        rel_path.display(),
                        i + 1,
                        no_title,
                        no_title,
                    ));
                }
            }
        }
    }
}

fn strip_inline_code(line: &str) -> String {
    // Replace `...` sequences with empty strings
    let re = Regex::new(r"`[^`]*`").unwrap();
    re.replace_all(line, "").to_string()
}

fn normalize_path(path: &Path) -> PathBuf {
    let mut components = Vec::new();
    for component in path.components() {
        match component {
            std::path::Component::ParentDir => {
                components.pop();
            }
            std::path::Component::CurDir => {}
            _ => {
                components.push(component);
            }
        }
    }
    components.iter().collect()
}
