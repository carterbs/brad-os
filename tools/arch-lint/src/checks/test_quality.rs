use crate::checks::CheckResult;
use crate::config::LinterConfig;
use crate::walker;
use regex::Regex;
use std::fs;
use std::sync::LazyLock;

static TEST_CASE_PATTERN: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\b(it|test)\s*\(").unwrap()
});

static COMMENT_LINE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^\s*//").unwrap()
});

static EMPTY_SINGLE_LINE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\b(it|test)\s*\([^)]*,\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{\s*\}\s*\)").unwrap()
});

static ARROW_OPEN: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"=>\s*\{\s*$").unwrap()
});

static CLOSING_BRACE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^\s*\}\s*\)\s*;?\s*$").unwrap()
});

static EXPECT_PATTERN: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\bexpect\s*\(").unwrap()
});

pub fn check(config: &LinterConfig) -> CheckResult {
    let name = "Test quality (no empty/assertion-free tests)".to_string();
    let files = walker::collect_test_files(&config.root_dir);
    let mut violations = Vec::new();

    for file in &files {
        let content = match fs::read_to_string(file) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let rel_path = file.strip_prefix(&config.root_dir).unwrap_or(file);
        let lines: Vec<&str> = content.lines().collect();

        // --- Category A: Empty test bodies ---
        for (i, line) in lines.iter().enumerate() {
            if COMMENT_LINE.is_match(line) {
                continue;
            }
            if !TEST_CASE_PATTERN.is_match(line) {
                continue;
            }

            // Single-line empty body
            if EMPTY_SINGLE_LINE.is_match(line) {
                violations.push(format!(
                    "{}:{} has an empty test body.\n\
                     \x20   Rule: Every test case must contain at least one expect() assertion.\n\
                     \x20   Fix: Add assertions that verify the behavior under test, e.g.:\n\
                     \x20        expect(result).toBe(expectedValue);\n\
                     \x20   See: docs/conventions/testing.md",
                    rel_path.display(),
                    i + 1,
                ));
                continue;
            }

            // Multi-line empty body
            if TEST_CASE_PATTERN.is_match(line) && ARROW_OPEN.is_match(line) {
                // Find next non-empty line
                let rest = &lines[i + 1..];
                let next_non_empty = rest.iter().position(|l| !l.trim().is_empty());

                if let Some(offset) = next_non_empty {
                    let next_line = rest[offset];
                    if CLOSING_BRACE.is_match(next_line) {
                        // Check all lines between opening { and closing } are whitespace
                        let body_lines = &rest[..offset];
                        let all_empty = body_lines.iter().all(|l| l.trim().is_empty());
                        if all_empty {
                            violations.push(format!(
                                "{}:{} has an empty test body (multi-line).\n\
                                 \x20   Rule: Every test case must contain at least one expect() assertion.\n\
                                 \x20   Fix: Add assertions that verify the behavior under test.\n\
                                 \x20   See: docs/conventions/testing.md",
                                rel_path.display(),
                                i + 1,
                            ));
                        }
                    }
                }
            }
        }

        // --- Category B: Assertion-free test file ---
        let test_case_count = TEST_CASE_PATTERN.find_iter(&content).count();
        let expect_count = EXPECT_PATTERN.find_iter(&content).count();

        if test_case_count > 0 && expect_count == 0 {
            violations.push(format!(
                "{} has {} test case(s) but zero expect() assertions.\n\
                 \x20   Rule: Test files must contain at least one expect() call to verify behavior.\n\
                 \x20   Fix: Add expect() assertions to each test case. Example:\n\
                 \x20        expect(result.success).toBe(true);\n\
                 \x20        expect(body.data).toHaveLength(2);\n\
                 \x20   See: docs/conventions/testing.md",
                rel_path.display(),
                test_case_count,
            ));
        }
    }

    CheckResult {
        passed: violations.is_empty(),
        name,
        violations,
    }
}
