use crate::checks::CheckResult;
use crate::config::LinterConfig;
use regex::Regex;
use std::fs;
use std::sync::LazyLock;

static SCHEMA_PATTERN: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\bz\.(object|string|number|boolean|array|enum|union|intersection|literal|tuple|record|nativeEnum|discriminatedUnion)\s*\(").unwrap()
});

static COMMENT_LINE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^\s*//").unwrap()
});

static Z_INFER: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"z\.infer").unwrap()
});

pub fn check(config: &LinterConfig) -> CheckResult {
    let name = "Zod schemas only in schemas/".to_string();
    let src_dir = &config.functions_src;

    if !src_dir.exists() {
        return CheckResult { name, passed: true, violations: vec![] };
    }

    let dirs_to_scan = ["services", "handlers", "repositories"];
    let mut violations = Vec::new();

    for dir_name in &dirs_to_scan {
        let dir = src_dir.join(dir_name);
        if !dir.exists() {
            continue;
        }

        let files = match fs::read_dir(&dir) {
            Ok(e) => e,
            Err(_) => continue,
        };

        for entry in files.flatten() {
            let path = entry.path();
            let file_name = match path.file_name().and_then(|n| n.to_str()) {
                Some(n) => n.to_string(),
                None => continue,
            };

            if !file_name.ends_with(".ts")
                || file_name.ends_with(".test.ts")
                || file_name.ends_with(".spec.ts")
            {
                continue;
            }

            let content = match fs::read_to_string(&path) {
                Ok(c) => c,
                Err(_) => continue,
            };

            let rel_path = path.strip_prefix(&config.root_dir).unwrap_or(&path);

            for (i, line) in content.lines().enumerate() {
                if COMMENT_LINE.is_match(line) {
                    continue;
                }
                if Z_INFER.is_match(line) {
                    continue;
                }
                if SCHEMA_PATTERN.is_match(line) {
                    violations.push(format!(
                        "{}:{} constructs a Zod schema outside of schemas/ directory.\n\
                         \x20   Rule: Zod schemas must live in packages/functions/src/schemas/, one file per resource.\n\
                         \x20   Fix: Move the schema definition to packages/functions/src/schemas/<resource>.schema.ts.\n\
                         \x20        Then import it: import {{ mySchema }} from '../schemas/<resource>.schema.js'\n\
                         \x20   See: docs/golden-principles.md",
                        rel_path.display(),
                        i + 1,
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
