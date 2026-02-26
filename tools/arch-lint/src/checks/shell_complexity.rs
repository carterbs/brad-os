use crate::checks::CheckResult;
use crate::config::{self, LinterConfig};
use crate::walker;
use regex::Regex;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

const DEFAULT_CC_THRESHOLD: usize = 10;
const TRANSITIONAL_CC_THRESHOLD: usize = 20;
const SHELL_INTERPRETERS: &[&str] = &["sh", "bash", "dash", "ksh", "zsh", "ash", "csh", "tcsh"];
const KNOWN_SHIM_SCRIPTS: &[&str] = &[
    "hooks/pre-commit",
    "scripts/validate.sh",
    "scripts/doctor.sh",
    "scripts/run-integration-tests.sh",
    "scripts/arch-lint",
    "scripts/brad-precommit",
    "scripts/brad-validate",
];

pub fn check(config: &LinterConfig) -> CheckResult {
    let name = "Shell script complexity guardrail".to_string();
    let files = collect_shell_scripts(&config.root_dir);
    let mut violations = Vec::new();

    for file in files {
        let content = match fs::read_to_string(&file) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let metrics = estimate_complexity(&content);
        let limit = cc_limit_for(&file, &content);
        if metrics.cc_estimate <= limit {
            continue;
        }

        let rel_path = file.strip_prefix(&config.root_dir).unwrap_or(&file);
        violations.push(format!(
            "{}: CC_estimate={}, lines={}, branches={}, loops={} ({} script limit {}).\n\
             \x20   Guidance: reduce orchestration complexity in this shell script or migrate to Rust\n\
             \x20   using the relevant plan (`tools/dev-cli` migration tracks).\n\
             \x20   See docs/conventions/workflow.md for guardrail policy and active migration notes.",
            rel_path.display(),
            metrics.cc_estimate,
            metrics.line_count,
            metrics.branch_points,
            metrics.loop_points,
            if is_transitional_legacy(&file) {
                "transitional legacy"
            } else {
                "default"
            },
            limit,
        ));
    }

    CheckResult {
        name,
        passed: violations.is_empty(),
        violations,
    }
}

struct ComplexityMetrics {
    line_count: usize,
    branch_points: usize,
    loop_points: usize,
    cc_estimate: usize,
}

fn collect_shell_scripts(root: &Path) -> Vec<PathBuf> {
    let skip_dirs = config::skip_dirs(&["ios", "public"]);
    let mut files = HashSet::<PathBuf>::new();

    for file in walker::collect_files(root, ".sh", &skip_dirs) {
        files.insert(file);
    }

    for dir in [root.join("hooks"), root.join("scripts")] {
        if dir.exists() {
            collect_shebang_scripts(&dir, &skip_dirs, &mut files);
        }
    }

    let mut sorted_files: Vec<PathBuf> = files.into_iter().collect();
    sorted_files.sort();
    sorted_files
}

fn collect_shebang_scripts(
    dir: &Path,
    skip_dirs: &HashSet<&str>,
    results: &mut HashSet<PathBuf>,
) {
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            if path.is_dir() {
                if !skip_dirs.contains(name) {
                    collect_shebang_scripts(&path, skip_dirs, results);
                }
                continue;
            }

            if path.is_file() && is_shell_shebang_script(&path) {
                results.insert(path);
            }
        }
    }
}

fn is_shell_shebang_script(path: &Path) -> bool {
    let content = match fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return false,
    };

    has_shell_shebang(content.as_bytes())
}

fn has_shell_shebang(raw: &[u8]) -> bool {
    let first_line = match std::str::from_utf8(raw) {
        Ok(c) => c.lines().next().unwrap_or(""),
        Err(_) => "",
    };

    if !first_line.starts_with("#!") {
        return false;
    }

    let shebang = first_line.trim_start_matches("#!").trim();
    let mut tokens = shebang.split_whitespace();
    let interpreter = match tokens.next() {
        Some(i) => i,
        None => return false,
    };

    if is_shell_interpreter(interpreter) {
        return true;
    }

    if interpreter.ends_with("/env") {
        return tokens.any(is_shell_interpreter);
    }

    false
}

fn cc_limit_for(path: &Path, content: &str) -> usize {
    if is_known_shim_path(path) || is_skimmed_shim(path, content) {
        return usize::MAX;
    }

    if is_transitional_legacy(path) {
        return TRANSITIONAL_CC_THRESHOLD;
    }

    DEFAULT_CC_THRESHOLD
}

fn is_transitional_legacy(path: &Path) -> bool {
    path.file_name()
        .and_then(|n| n.to_str())
        .is_some_and(|name| {
            matches!(name, "qa-start.sh" | "qa-stop.sh" | "setup-ios-testing.sh")
        })
}

fn is_known_shim_path(path: &Path) -> bool {
    let normalized = path.to_string_lossy().replace('\\', "/");
    KNOWN_SHIM_SCRIPTS.iter().any(|shim| normalized.ends_with(shim))
}

fn is_skimmed_shim(path: &Path, content: &str) -> bool {
    let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
    let is_known_wrapper = matches!(file_name, "arch-lint" | "brad-precommit" | "brad-validate");
    if !is_known_wrapper {
        return false;
    }

    let has_target_binary = content.contains("target/release/");
    let has_build = content.contains("cargo build");
    let has_exec = content
        .lines()
        .any(|line| line.trim_start().starts_with("exec "));
    has_target_binary && has_build && has_exec
}

fn estimate_complexity(contents: &str) -> ComplexityMetrics {
    let mut line_count = 0usize;
    let mut branch_points = 0usize;
    let mut loop_points = 0usize;

    let logical_re = Regex::new(r"&&|\|\|").expect("valid regex");

    for line in contents.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let code_line = strip_inline_comment(line);
        let normalized = code_line.trim();
        if normalized.is_empty() {
            continue;
        }

        line_count += 1;
        branch_points += count_control_tokens(normalized, &["if", "elif", "case"]);
        loop_points += count_control_tokens(normalized, &["for", "while", "until", "select"]);
        branch_points += logical_re.find_iter(normalized).count();
    }

    ComplexityMetrics {
        line_count,
        branch_points,
        loop_points,
        cc_estimate: 1 + branch_points + loop_points,
    }
}

fn count_control_tokens(line: &str, tokens: &[&str]) -> usize {
    line.split(|c: char| !(c.is_ascii_alphanumeric() || c == '_'))
        .filter(|token| tokens.contains(token))
        .count()
}

fn is_shell_interpreter(token: &str) -> bool {
    let binary = token.rsplit('/').next().unwrap_or(token);
    let binary = binary.to_ascii_lowercase();
    SHELL_INTERPRETERS.contains(&binary.as_str())
}

fn strip_inline_comment(line: &str) -> String {
    let mut result = String::new();
    let mut in_single_quote = false;
    let mut in_double_quote = false;
    let mut prev = '\0';

    for ch in line.chars() {
        if ch == '\'' && !in_double_quote && prev != '\\' {
            in_single_quote = !in_single_quote;
        }
        if ch == '"' && !in_single_quote && prev != '\\' {
            in_double_quote = !in_double_quote;
        }
        if ch == '#' && !in_single_quote && !in_double_quote {
            break;
        }
        result.push(ch);
        prev = ch;
    }

    result
}

#[cfg(test)]
mod tests {
    use super::{
        cc_limit_for, count_control_tokens, estimate_complexity, has_shell_shebang,
        DEFAULT_CC_THRESHOLD, TRANSITIONAL_CC_THRESHOLD,
        is_known_shim_path, is_shell_interpreter, is_transitional_legacy, is_skimmed_shim,
        strip_inline_comment,
    };

    #[test]
    fn strips_inline_comment_only_after_comment_operator() {
        assert_eq!(
            strip_inline_comment("echo \"a#b\" # comment"),
            "echo \"a#b\" "
        );
        assert_eq!(
            strip_inline_comment("echo 'a#b' # comment"),
            "echo 'a#b' "
        );
    }

    #[test]
    fn estimates_if_and_case_branching() {
        let metrics = estimate_complexity(
            r#"#!/usr/bin/env bash
if [[ "$1" == "" ]]; then
  echo one
elif [[ "$2" == "" ]]; then
  echo two
fi
case "$x" in
  a) echo a;;
esac
",
        );
        assert_eq!(metrics.cc_estimate, 1 + 3 + 1);
        assert_eq!(metrics.branch_points, 4);
        assert_eq!(metrics.loop_points, 0);
        assert_eq!(metrics.line_count, 8);
    }

    #[test]
    fn estimates_loops_and_logical_ops() {
        let metrics = estimate_complexity(
            r#"for i in 1 2 3; do
  if [[ "$i" == "1" ]] && [[ "$i" == "2" ]] || [[ "$i" == "3" ]]; then
    echo "x"
  fi
done
"#,
        );
        assert!(metrics.branch_points >= 3);
        assert!(metrics.cc_estimate >= 6);
    }

    #[test]
    fn transitional_legacy_files_match_expected_names() {
        assert!(is_transitional_legacy(std::path::Path::new("scripts/qa-start.sh")));
        assert!(is_transitional_legacy(std::path::Path::new("scripts/setup-ios-testing.sh")));
        assert!(!is_transitional_legacy(std::path::Path::new("scripts/other.sh")));
    }

    #[test]
    fn shim_scripts_are_exempted_by_name_and_pattern() {
        let shim = r#"#!/usr/bin/env bash
set -e
BINARY="/tmp/target/release/arch-lint"
if ! command -v cargo >/dev/null 2>&1; then
  exit 1
fi
cargo build -p arch-lint --release >/dev/null
exec "$BINARY" "$@"
"#;
        assert!(is_skimmed_shim(std::path::Path::new("scripts/arch-lint"), shim));
    }

    #[test]
    fn documented_shim_paths_are_exempt() {
        assert!(is_known_shim_path(std::path::Path::new("hooks/pre-commit")));
        assert!(is_known_shim_path(std::path::Path::new("scripts/validate.sh")));
        assert!(is_known_shim_path(std::path::Path::new("scripts/doctor.sh")));
        assert!(is_known_shim_path(std::path::Path::new("scripts/run-integration-tests.sh")));
    }

    #[test]
    fn detects_shell_shebang_variants_and_rejects_node() {
        let sh = "#!/usr/bin/env bash\n";
        let direct = "#!/bin/sh\n";
        let node = "#!/usr/bin/env node\n";

        assert!(has_shell_shebang(sh.as_bytes()));
        assert!(has_shell_shebang(direct.as_bytes()));
        assert!(!has_shell_shebang(node.as_bytes()));
    }

    #[test]
    fn recognizes_shell_interpreter_tokens() {
        assert!(is_shell_interpreter("bash"));
        assert!(is_shell_interpreter("/usr/bin/zsh"));
        assert!(!is_shell_interpreter("node"));
        assert!(!is_shell_interpreter("python"));
    }

    #[test]
    fn honors_cc_limits_for_shim_and_default_paths() {
        assert_eq!(
            cc_limit_for(std::path::Path::new("scripts/qa-start.sh"), ""),
            TRANSITIONAL_CC_THRESHOLD
        );
        assert_eq!(
            cc_limit_for(std::path::Path::new("scripts/validate.sh"), ""),
            usize::MAX
        );
        assert_eq!(cc_limit_for(std::path::Path::new("scripts/normal.sh"), ""), DEFAULT_CC_THRESHOLD);
    }

    #[test]
    fn count_control_tokens_is_word_boundary_safe() {
        assert_eq!(count_control_tokens("ifcase if else", &["if", "elif", "case"]), 1);
        assert_eq!(count_control_tokens("if_then_case", &["if", "case"]), 0);
    }
}
