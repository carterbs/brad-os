use crate::checks::CheckResult;
use crate::config::LinterConfig;
use crate::manifest::{self, EndpointEntry};
use crate::rewrite_utils::{self, FirebaseRewrite};
use regex::Regex;
use std::fs;
static IMPORT_PATTERN_TMPL: &str = r#"import\s+\{\s*EXPORT\s*\}\s+from\s+['"]\.\/handlers\/HANDLER\.js['"]"#;

static DIRECT_EXPORT: &str = r#"export\s+(?:const|let|function)\s+NAME\b"#;

static GROUPED_EXPORT: &str = r#"export\s*\{[^}]*\bNAME\b[^}]*\}"#;

pub fn check(config: &LinterConfig) -> CheckResult {
    check_with_manifest(config, None)
}

pub fn check_with_manifest(
    config: &LinterConfig,
    manifest_override: Option<Vec<EndpointEntry>>,
) -> CheckResult {
    let name = "Firebase route consistency".to_string();
    let firebase_json = config.root_dir.join("firebase.json");
    let index_ts = config.functions_src.join("index.ts");
    let handlers_dir = config.functions_src.join("handlers");

    let manifest_source = match manifest_override {
        Some(entries) => manifest::ParsedManifestResult {
            manifest: entries,
            violations: vec![],
        },
        None => manifest::read_manifest_from_disk(config),
    };

    let manifest_entries = manifest_source.manifest;
    let manifest_violations = manifest_source.violations;

    if manifest_entries.is_empty() || !manifest_violations.is_empty() {
        let mut violations = manifest_violations;
        if manifest_entries.is_empty() {
            violations.push("No manifest entries found in ENDPOINT_MANIFEST.".to_string());
        }
        return CheckResult {
            name,
            passed: false,
            violations,
        };
    }

    let mut violations = Vec::new();

    if !firebase_json.exists() {
        return CheckResult {
            name,
            passed: false,
            violations: vec![format!("firebase.json not found at {}", firebase_json.display())],
        };
    }
    if !index_ts.exists() {
        return CheckResult {
            name,
            passed: false,
            violations: vec![format!("index.ts not found at {}", index_ts.display())],
        };
    }

    // Sub-check A: handler files exist
    for entry in &manifest_entries {
        let handler_file = handlers_dir.join(format!("{}.ts", entry.handler_file));
        if !handler_file.exists() {
            violations.push(format!(
                "Missing handler file: packages/functions/src/handlers/{}.ts (routePath: '{}').",
                entry.handler_file, entry.route_path
            ));
        }
    }

    // Sub-check B: createBaseApp / stripPathPrefix parity
    for entry in &manifest_entries {
        if entry.route_path.is_empty() {
            continue;
        }

        let handler_file = handlers_dir.join(format!("{}.ts", entry.handler_file));
        if !handler_file.exists() {
            continue;
        }

        let handler_route = manifest::get_handler_route_value(&handler_file);

        match handler_route {
            None => {
                violations.push(format!(
                    "Handler '{}.ts' is missing createBaseApp/stripPathPrefix/createResourceRouter usage.",
                    entry.handler_file
                ));
            }
            Some(route) if route != entry.route_path => {
                violations.push(format!(
                    "Handler '{}.ts' uses route '{}' but manifest expects '{}'.",
                    entry.handler_file, route, entry.route_path
                ));
            }
            _ => {}
        }
    }

    // Sub-check C: firebase.json rewrite parity
    let expected_rewrites = rewrite_utils::generate_rewrites(&manifest_entries);
    let actual_rewrites = parse_firebase_rewrites(&firebase_json);
    let rewrite_violations = rewrite_utils::compare_rewrites(&expected_rewrites, &actual_rewrites);
    for v in rewrite_violations {
        violations.push(format!("firebase.json rewrite parity failed: {}", v));
    }

    // Sub-check D: index.ts coverage
    let index_content = match fs::read_to_string(&index_ts) {
        Ok(c) => c,
        Err(_) => String::new(),
    };

    for entry in &manifest_entries {
        let app_export = rewrite_utils::get_app_export_name(entry);
        if !has_handler_import(&index_content, &app_export, &entry.handler_file) {
            violations.push(format!(
                "Missing import for {} from './handlers/{}.js' in index.ts.",
                app_export, entry.handler_file
            ));
        }

        let dev_fn = rewrite_utils::get_dev_function_name(entry);
        let prod_fn = rewrite_utils::get_prod_function_name(entry);

        if !has_handler_export(&index_content, &dev_fn) {
            violations.push(format!(
                "Missing export '{}' in index.ts for route '{}'.",
                dev_fn, entry.route_path
            ));
        }
        if entry.dev_only != Some(true) && !has_handler_export(&index_content, &prod_fn) {
            violations.push(format!(
                "Missing export '{}' in index.ts for route '{}'.",
                prod_fn, entry.route_path
            ));
        }
    }

    CheckResult {
        passed: violations.is_empty(),
        name,
        violations,
    }
}

fn parse_firebase_rewrites(firebase_path: &std::path::Path) -> Vec<FirebaseRewrite> {
    let content = match fs::read_to_string(firebase_path) {
        Ok(c) => c,
        Err(_) => return vec![],
    };

    let config: serde_json::Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(_) => return vec![],
    };

    let rewrites = match config
        .get("hosting")
        .and_then(|h| h.get("rewrites"))
        .and_then(|r| r.as_array())
    {
        Some(arr) => arr,
        None => return vec![],
    };

    rewrites
        .iter()
        .filter_map(|r| {
            let source = r.get("source")?.as_str()?.to_string();
            let function = r.get("function")?.as_str()?.to_string();
            Some(FirebaseRewrite { source, function })
        })
        .collect()
}

fn has_handler_import(index_content: &str, app_export: &str, handler_file: &str) -> bool {
    let pattern = IMPORT_PATTERN_TMPL
        .replace("EXPORT", &regex::escape(app_export))
        .replace("HANDLER", &regex::escape(handler_file));
    let re = match Regex::new(&pattern) {
        Ok(r) => r,
        Err(_) => return false,
    };
    re.is_match(index_content)
}

fn has_handler_export(index_content: &str, function_name: &str) -> bool {
    let direct_pattern = DIRECT_EXPORT.replace("NAME", &regex::escape(function_name));
    let grouped_pattern = GROUPED_EXPORT.replace("NAME", &regex::escape(function_name));

    let direct_re = Regex::new(&direct_pattern).unwrap_or_else(|_| Regex::new("$^").unwrap());
    let grouped_re = Regex::new(&grouped_pattern).unwrap_or_else(|_| Regex::new("$^").unwrap());

    direct_re.is_match(index_content) || grouped_re.is_match(index_content)
}
