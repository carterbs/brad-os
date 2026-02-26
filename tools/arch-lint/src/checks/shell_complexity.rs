use crate::checks::CheckResult;
use crate::config::{self, LinterConfig};
use regex::Regex;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::LazyLock;

const DEFAULT_THRESHOLD: usize = 10;

const MIGRATION_ALLOWLIST: &[&str] = &[
    "scripts/qa-start.sh",
    "scripts/qa-stop.sh",
    "scripts/setup-ios-testing.sh",
];

const SHIM_ALLOWLIST: &[&str] = &[
    "hooks/pre-commit",
    "scripts/validate.sh",
    "scripts/doctor.sh",
    "scripts/run-integration-tests.sh",
];

static BRANCH_PATTERN: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\b(if|elif|case)\b").unwrap());
static LOOP_PATTERN: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\b(for|while|until|select)\b").unwrap());
static LOGICAL_PATTERN: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"&&|\|\|").unwrap());

pub fn check(config: &LinterConfig) -> CheckResult {
    let name = "Shell script complexity".to_string();
    let skip_dirs = config::skip_dirs(&["__tests__", "node_modules"]);
    let shell_files = collect_shell_files(&config.root_dir, &skip_dirs);
    let mut violations = Vec::new();

    for file in shell_files {
        let rel_file = file.strip_prefix(&config.root_dir).unwrap_or(&file);
        let rel = rel_file.to_string_lossy().to_string();

        if is_migration_allowlisted(&rel) || is_shim(&rel) {
            continue;
        }

        let content = match fs::read_to_string(&file) {
            Ok(value) => value,
            Err(_) => continue,
        };

        let metrics = complexity_metrics(&content);
        if metrics.total() > DEFAULT_THRESHOLD {
            violations.push(format!(
                "{} has shell complexity {score} (threshold {threshold}).\n\
                 \x20   Metrics: lines={lines}, branches={branches}, loops={loops}, logical_ops={logical_ops}\n\
                 \x20   Rule: Shell orchestration scripts should stay at CC_estimate <= {threshold} unless allowlisted for migration.\n\
                 \x20   Fix: Migrate to typed orchestration (Rust/TypeScript) or rework to a thin wrapper and move complexity out.\n\
                 \x20   See: thoughts/shared/plans/active/2026-02-26-shell-complexity-guardrail.md",
                rel,
                score = metrics.total(),
                threshold = DEFAULT_THRESHOLD,
                lines = metrics.lines,
                branches = metrics.branches,
                loops = metrics.loops,
                logical_ops = metrics.logical_ops,
            ));
        }
    }

    CheckResult {
        name,
        passed: violations.is_empty(),
        violations,
    }
}

#[derive(Debug, PartialEq, Eq)]
struct ComplexityMetrics {
    lines: usize,
    branches: usize,
    loops: usize,
    logical_ops: usize,
}

impl ComplexityMetrics {
    fn total(&self) -> usize {
        1 + self.branches + self.loops + self.logical_ops
    }
}

fn collect_shell_files(root_dir: &Path, skip_dirs: &HashSet<&str>) -> Vec<PathBuf> {
    let mut results = Vec::new();
    collect_shell_files_inner(root_dir, skip_dirs, &mut results);
    results.sort();
    results
}

fn collect_shell_files_inner(
    current: &Path,
    skip_dirs: &HashSet<&str>,
    results: &mut Vec<PathBuf>,
) {
    let entries = match fs::read_dir(current) {
        Ok(value) => value,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let name = match path.file_name().and_then(|value| value.to_str()) {
                Some(value) => value,
                None => continue,
            };
            if skip_dirs.contains(name) {
                continue;
            }
            collect_shell_files_inner(&path, skip_dirs, results);
            continue;
        }

        let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };

        if name.ends_with(".sh") || is_shell_hook(&path) {
            results.push(path);
        }
    }
}

fn is_shell_hook(path: &Path) -> bool {
    let parent = match path.parent().and_then(|value| value.file_name()) {
        Some(value) => value,
        None => return false,
    };
    if parent != "hooks" {
        return false;
    }

    let content = match fs::read_to_string(path) {
        Ok(value) => value,
        Err(_) => return false,
    };

    let first_line = content.lines().next().unwrap_or_default();
    first_line.starts_with("#!") && (first_line.contains("/sh") || first_line.contains("bash"))
}

fn is_migration_allowlisted(path: &str) -> bool {
    MIGRATION_ALLOWLIST.iter().any(|entry| path.ends_with(entry))
}

fn is_shim(path: &str) -> bool {
    SHIM_ALLOWLIST.iter().any(|entry| path.ends_with(entry))
}

fn complexity_metrics(content: &str) -> ComplexityMetrics {
    let mut branches = 0usize;
    let mut loops = 0usize;
    let mut logical_ops = 0usize;
    let mut lines = 0usize;

    for raw_line in content.lines() {
        let line = strip_comment(raw_line).trim();
        if line.is_empty() {
            continue;
        }
        lines += 1;

        branches += BRANCH_PATTERN.find_iter(line).count();
        loops += LOOP_PATTERN.find_iter(line).count();
        logical_ops += LOGICAL_PATTERN.find_iter(line).count();
    }

    ComplexityMetrics {
        lines,
        branches,
        loops,
        logical_ops,
    }
}

fn strip_comment(line: &str) -> &str {
    match line.find('#') {
        Some(index) => &line[..index],
        None => line,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn write_script(path: &Path, content: &str) {
        fs::write(path, content).unwrap();
    }

    #[test]
    fn complexity_metrics_counts_control_flow_and_logic() {
        let metrics = complexity_metrics(
            "\
            if true; then\n\
            for item in \"$@\"; do\n\
            while true; do\n\
            if false; then\n\
            command && command || command\n\
            fi\n\
            done\n\
            done\n\
            ",
        );

        assert_eq!(metrics.lines, 8);
        assert_eq!(metrics.branches, 2);
        assert_eq!(metrics.loops, 2);
        assert_eq!(metrics.logical_ops, 2);
        assert_eq!(metrics.total(), 7);
    }

    #[test]
    fn complex_shell_script_fails_the_check() {
        let root = TempDir::new().unwrap();
        fs::create_dir_all(root.path().join("scripts")).unwrap();
        write_script(
            &root.path().join("scripts/too-complex.sh"),
            "\
            if true; then\n\
            for i in 1 2 3; do\n\
            if true; then\n\
            command && command\n\
            fi\n\
            for j in 1 2 3; do\n\
            if true; then\n\
            command || command\n\
            fi\n\
            while true; do\n\
            case \"$i\" in\n\
            1)\n\
            if true; then\n\
            command || command\n\
            fi\n\
            ;;\n\
            esac\n\
            done\n\
            done\n\
            done\n\
            ",
        );

        let config = LinterConfig::from_root(root.path());
        let result = check(&config);

        assert!(!result.passed);
        assert!(result
            .violations
            .iter()
            .any(|item| item.contains("scripts/too-complex.sh")));
    }

    #[test]
    fn allowlisted_scripts_are_exempt_from_threshold() {
        let root = TempDir::new().unwrap();
        fs::create_dir_all(root.path().join("scripts")).unwrap();
        write_script(
            &root.path().join("scripts/qa-start.sh"),
            "if true; then\nfor i in 1 2 3; do\nif true; then\ncommand;\nfi\ndone\nfi\n",
        );
        write_script(
            &root.path().join("scripts/clean.sh"),
            "echo clean\n",
        );

        let config = LinterConfig::from_root(root.path());
        let result = check(&config);

        assert!(result.passed);
        assert!(!result.violations.iter().any(|item| item.contains("qa-start.sh")));
        assert!(!result.violations.iter().any(|item| item.contains("clean.sh")));
    }

    #[test]
    fn hook_with_shell_shebang_is_included() {
        let root = TempDir::new().unwrap();
        fs::create_dir_all(root.path().join("hooks")).unwrap();
        write_script(
            &root.path().join("hooks/complex-hook"),
            "#!/usr/bin/env bash\nif true; then\nfor i in 1 2 3; do\nif true; then\nfor n in 1 2 3; do\nif true; then\ncommand\nfi\ncommand && command\nfi\ndone\ndone\nfi\nif true; then\nwhile true; do\ncommand || command\ncommand\ncase \"$i\" in\n1)\ncommand\n;;\nesac\ndone\nfi\n",
        );
        write_script(
            &root.path().join("hooks/non-shell-hook"),
            "#!/usr/bin/env node\ngood=false\n",
        );

        let config = LinterConfig::from_root(root.path());
        let result = check(&config);

        assert!(result.violations.iter().any(|item| item.contains("hooks/complex-hook")));
    }
}
