use crate::checks::CheckResult;
use crate::config::LinterConfig;
use regex::Regex;
use std::fs;
use std::sync::LazyLock;

static EXPORT_INTERFACE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^export\s+interface\s+(\w+)").unwrap()
});

static EXPORT_TYPE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^export\s+type\s+(\w+)\s*=").unwrap()
});

static RE_EXPORT: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^export\s+(?:type\s+)?\{[^}]*\}\s+from\s+").unwrap()
});

pub fn check(config: &LinterConfig) -> CheckResult {
    let name = "Domain types only in types/".to_string();
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
                if RE_EXPORT.is_match(line) {
                    continue;
                }

                let type_name = EXPORT_INTERFACE
                    .captures(line)
                    .or_else(|| EXPORT_TYPE.captures(line))
                    .and_then(|c| c.get(1))
                    .map(|m| m.as_str().to_string());

                if let Some(type_name) = type_name {
                    violations.push(format!(
                        "{}:{} exports type '{}' outside of types/ directory.\n\
                         \x20   Rule: Domain types must live in packages/functions/src/types/ and be imported via shared.ts.\n\
                         \x20   Fix: Move 'export interface {}' (or 'export type {}') to packages/functions/src/types/<resource>.ts.\n\
                         \x20        Then import it where needed: import {{ {} }} from '../shared.js'\n\
                         \x20   See: docs/conventions/typescript.md",
                        rel_path.display(),
                        i + 1,
                        type_name,
                        type_name,
                        type_name,
                        type_name,
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
