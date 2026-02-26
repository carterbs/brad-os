use crate::checks::CheckResult;
use crate::config::{self, LinterConfig};
use regex::Regex;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::LazyLock;

static INTERFACE_PATTERN: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^export\s+interface\s+(\w+)").unwrap()
});

static TYPE_ALIAS_PATTERN: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^export\s+type\s+(\w+)\s*=").unwrap()
});

static RE_EXPORT_PATTERN: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"export\s+\{[^}]*\}\s+from\s+|export\s+\*\s+from\s+").unwrap()
});

struct TypeLocation {
    file: String,
    line: usize,
}

pub fn check(config: &LinterConfig) -> CheckResult {
    let name = "Type deduplication".to_string();
    let src_dir = &config.functions_src;

    if !src_dir.exists() {
        return CheckResult {
            name,
            passed: false,
            violations: vec![format!("Source directory not found: {}", src_dir.display())],
        };
    }

    let skip = config::skip_dirs(&["__tests__"]);
    let files = collect_ts_files(src_dir, &skip);

    let mut type_map: BTreeMap<String, Vec<TypeLocation>> = BTreeMap::new();

    for file_path in &files {
        let rel_path = file_path
            .strip_prefix(&config.root_dir)
            .unwrap_or(file_path)
            .to_string_lossy()
            .to_string();

        let content = match fs::read_to_string(file_path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        for (i, line) in content.lines().enumerate() {
            if RE_EXPORT_PATTERN.is_match(line) {
                continue;
            }

            let type_name = INTERFACE_PATTERN
                .captures(line)
                .or_else(|| TYPE_ALIAS_PATTERN.captures(line))
                .and_then(|c| c.get(1))
                .map(|m| m.as_str().to_string());

            if let Some(type_name) = type_name {
                type_map
                    .entry(type_name)
                    .or_default()
                    .push(TypeLocation {
                        file: rel_path.clone(),
                        line: i + 1,
                    });
            }
        }
    }

    let mut violations = Vec::new();

    for (type_name, locations) in &type_map {
        // Deduplicate by file
        let mut unique_files: HashMap<String, usize> = HashMap::new();
        for loc in locations {
            unique_files.entry(loc.file.clone()).or_insert(loc.line);
        }

        if unique_files.len() > 1 {
            let types_file = unique_files
                .keys()
                .find(|f| f.contains("packages/functions/src/types/"));
            let canonical_file = types_file
                .cloned()
                .unwrap_or_else(|| "packages/functions/src/types/<resource>.ts".to_string());

            let mut msg = format!("Type '{}' defined in multiple files:", type_name);
            // Sort for deterministic output
            let mut sorted_files: Vec<(&String, &usize)> = unique_files.iter().collect();
            sorted_files.sort_by(|(a, _), (b, _)| a.cmp(b));
            for (file, line) in &sorted_files {
                msg.push_str(&format!("\n    {}:{}", file, line));
            }
            msg.push_str("\n    Rule: Each type/interface must be defined exactly once, in packages/functions/src/types/.");
            msg.push_str(&format!(
                "\n    Fix: 1. Keep the definition in {} (the canonical location).",
                canonical_file
            ));
            msg.push_str("\n         2. Delete the duplicate definition(s) from the other file(s).");
            msg.push_str(&format!(
                "\n         3. Update imports in consuming files to use: import {{ {} }} from '../shared.js'",
                type_name
            ));
            msg.push_str(&format!(
                "\n    Example: packages/functions/src/types/meditation.ts is the single source of truth for MeditationSessionRecord."
            ));
            msg.push_str("\n    See: docs/conventions/typescript.md#type-deduplication");
            violations.push(msg);
        }
    }

    CheckResult {
        passed: violations.is_empty(),
        name,
        violations,
    }
}

fn collect_ts_files(dir: &Path, skip: &HashSet<&str>) -> Vec<PathBuf> {
    let mut results = Vec::new();
    collect_inner(dir, skip, &mut results);
    results
}

fn collect_inner(dir: &Path, skip: &HashSet<&str>, results: &mut Vec<PathBuf>) {
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            if path.is_dir() {
                if !skip.contains(name) {
                    collect_inner(&path, skip, results);
                }
            } else if path.is_file() && name.ends_with(".ts") && !name.ends_with(".test.ts") {
                results.push(path);
            }
        }
    }
}
