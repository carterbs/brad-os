use crate::checks::CheckResult;
use crate::config::{self, LinterConfig};
use regex::Regex;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::LazyLock;

static IMPORT_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?:import|export)\s+.*?\s+from\s+['"]([^'"]+)['"]"#).unwrap()
});

static REQUIRE_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"require\s*\(\s*['"]([^'"]+)['"]\s*\)"#).unwrap()
});

pub fn check(config: &LinterConfig) -> CheckResult {
    let name = "Layer dependencies".to_string();
    let src_dir = &config.functions_src;

    if !src_dir.exists() {
        return CheckResult {
            name,
            passed: false,
            violations: vec![format!("Source directory not found: {}", src_dir.display())],
        };
    }

    let allowed_imports: HashMap<&str, HashSet<&str>> = HashMap::from([
        ("types", HashSet::new()),
        ("schemas", HashSet::from(["types"])),
        ("repositories", HashSet::from(["types", "schemas"])),
        ("services", HashSet::from(["types", "schemas", "repositories"])),
        ("handlers", HashSet::from(["types", "schemas", "repositories", "services", "middleware"])),
        ("middleware", HashSet::from(["types", "schemas"])),
    ]);

    let skip_dirs = config::skip_dirs(&["__tests__", "test-utils"]);
    let unchecked_layers: HashSet<&str> = ["routes", "scripts", "prompts"].iter().copied().collect();

    let files = collect_ts_source_files(src_dir, &skip_dirs);
    let mut violations = Vec::new();

    for file in &files {
        let layer = match get_layer(file, src_dir, &unchecked_layers, &skip_dirs, &allowed_imports) {
            Some(l) => l,
            None => continue,
        };

        let allowed = match allowed_imports.get(layer.as_str()) {
            Some(a) => a,
            None => continue,
        };

        let content = match fs::read_to_string(file) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let imports = parse_imports(&content);

        for spec in &imports {
            let imported_layer = match resolve_import_layer(spec, file, src_dir, &allowed_imports) {
                Some(l) => l,
                None => continue,
            };

            if imported_layer == layer {
                continue;
            }

            if !allowed.contains(imported_layer.as_str()) {
                let rel_file = file.strip_prefix(&config.root_dir).unwrap_or(file);
                let allowed_list = if allowed.is_empty() {
                    "(none)".to_string()
                } else {
                    let mut sorted: Vec<&&str> = allowed.iter().collect();
                    sorted.sort();
                    sorted.iter().map(|s| **s).collect::<Vec<_>>().join(", ")
                };

                violations.push(format!(
                    "{} (layer: {}) imports from {} (layer: {}). {} must not depend on {}.\n\
                     \x20   Rule: Dependencies flow types -> schemas -> repositories -> services -> handlers. A {} file may only import from: [{}].\n\
                     \x20   Fix: 1. Move the needed type/function to a layer that {} is allowed to import (e.g. packages/functions/src/types/).\n\
                     \x20        2. Update the import in {} to point to the new location.\n\
                     \x20        3. Delete the old definition if nothing else uses it.\n\
                     \x20   Example: packages/functions/src/services/workout.service.ts correctly imports from types/ and repositories/, never from handlers/.\n\
                     \x20   See: docs/conventions/typescript.md",
                    rel_file.display(),
                    layer,
                    spec,
                    imported_layer,
                    layer,
                    imported_layer,
                    layer,
                    allowed_list,
                    layer,
                    rel_file.display(),
                ));
            }
        }
    }

    CheckResult {
        passed: violations.is_empty(),
        name,
        violations,
    }
}

fn get_layer(
    file_path: &Path,
    src_dir: &Path,
    unchecked: &HashSet<&str>,
    skip: &HashSet<&str>,
    allowed: &HashMap<&str, HashSet<&str>>,
) -> Option<String> {
    let rel = file_path.strip_prefix(src_dir).ok()?;
    let parts: Vec<&str> = rel.to_str()?.split('/').collect();
    if parts.len() <= 1 {
        return None;
    }
    let dir = parts[0];
    if unchecked.contains(dir) || skip.contains(dir) {
        return None;
    }
    if allowed.contains_key(dir) {
        return Some(dir.to_string());
    }
    None
}

fn is_test_file(file_path: &Path) -> bool {
    if let Some(name) = file_path.file_name().and_then(|n| n.to_str()) {
        return name.ends_with(".test.ts") || name.ends_with(".spec.ts") || name.contains("__tests__");
    }
    false
}

fn collect_ts_source_files(dir: &Path, skip_dirs: &HashSet<&str>) -> Vec<PathBuf> {
    let mut results = Vec::new();
    collect_inner(dir, skip_dirs, &mut results);
    results
}

fn collect_inner(dir: &Path, skip_dirs: &HashSet<&str>, results: &mut Vec<PathBuf>) {
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            if path.is_dir() {
                if !skip_dirs.contains(name) {
                    collect_inner(&path, skip_dirs, results);
                }
            } else if path.is_file()
                && name.ends_with(".ts")
                && !is_test_file(&path)
            {
                results.push(path);
            }
        }
    }
}

fn parse_imports(content: &str) -> Vec<String> {
    let mut imports = Vec::new();

    for caps in IMPORT_REGEX.captures_iter(content) {
        if let Some(m) = caps.get(1) {
            imports.push(m.as_str().to_string());
        }
    }

    for caps in REQUIRE_REGEX.captures_iter(content) {
        if let Some(m) = caps.get(1) {
            imports.push(m.as_str().to_string());
        }
    }

    imports
}

fn resolve_import_layer(
    import_specifier: &str,
    source_file: &Path,
    src_dir: &Path,
    allowed: &HashMap<&str, HashSet<&str>>,
) -> Option<String> {
    if !import_specifier.starts_with('.') {
        return None;
    }

    let source_dir = source_file.parent()?;
    let mut resolved = source_dir.join(import_specifier);

    // Normalize the path
    resolved = normalize_path(&resolved);

    // Strip .js extension
    if let Some(s) = resolved.to_str() {
        if s.ends_with(".js") {
            resolved = PathBuf::from(&s[..s.len() - 3]);
        }
    }

    if !resolved.starts_with(src_dir) {
        return None;
    }

    let rel = resolved.strip_prefix(src_dir).ok()?;
    let parts: Vec<&str> = rel.to_str()?.split('/').collect();
    if parts.len() <= 1 {
        return None;
    }
    let dir = parts[0];
    if allowed.contains_key(dir) {
        return Some(dir.to_string());
    }
    None
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
