use crate::checks::CheckResult;
use crate::config::LinterConfig;
use crate::manifest::{self, EndpointEntry};
use crate::rewrite_utils::{self, CloudRunTarget, FirebaseRewrite};
use regex::Regex;
use std::fs;
static IMPORT_PATTERN_TMPL: &str =
    r#"import\s+\{\s*EXPORT\s*\}\s+from\s+['"]\.\/handlers\/HANDLER\.js['"]"#;

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
    let api_router_ts = config.functions_src.join("api-router.ts");
    let cloud_run_app_ts = config.functions_src.join("cloud-run-app.ts");
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
            violations: vec![format!(
                "firebase.json not found at {}",
                firebase_json.display()
            )],
        };
    }
    if !index_ts.exists() {
        return CheckResult {
            name,
            passed: false,
            violations: vec![format!("index.ts not found at {}", index_ts.display())],
        };
    }
    if !api_router_ts.exists() {
        violations.push(format!(
            "api-router.ts not found at {}",
            api_router_ts.display()
        ));
    }
    if !cloud_run_app_ts.exists() {
        violations.push(format!(
            "cloud-run-app.ts not found at {}",
            cloud_run_app_ts.display()
        ));
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

    // Sub-check C: Firebase Hosting must have one pinned Cloud Run API rewrite.
    let expected_rewrites = rewrite_utils::generate_rewrites(&manifest_entries);
    let actual_rewrites = parse_firebase_rewrites(&firebase_json);
    let rewrite_violations = rewrite_utils::compare_rewrites(&expected_rewrites, &actual_rewrites);
    for v in rewrite_violations {
        violations.push(format!("firebase.json rewrite parity failed: {}", v));
    }

    // Sub-check D: retain index.ts coverage for local Functions emulator adapters.
    let index_content = match fs::read_to_string(&index_ts) {
        Ok(c) => c,
        Err(_) => String::new(),
    };

    for entry in &manifest_entries {
        let app_export = rewrite_utils::get_app_export_name(entry);
        if !has_handler_import(&index_content, &app_export, &entry.handler_file) {
            violations.push(format!(
                "Missing local emulator adapter import for {} from './handlers/{}.js' in index.ts.",
                app_export, entry.handler_file
            ));
        }

        let dev_fn = rewrite_utils::get_dev_function_name(entry);
        let prod_fn = rewrite_utils::get_prod_function_name(entry);

        if !has_handler_export(&index_content, &dev_fn) {
            violations.push(format!(
                "Missing local emulator adapter export '{}' in index.ts for route '{}'.",
                dev_fn, entry.route_path
            ));
        }
        if entry.dev_only != Some(true) && !has_handler_export(&index_content, &prod_fn) {
            violations.push(format!(
                "Missing local emulator adapter export '{}' in index.ts for route '{}'.",
                prod_fn, entry.route_path
            ));
        }
    }

    // Sub-check E: every public manifest app is represented in the unified router.
    let api_router_content = fs::read_to_string(&api_router_ts).unwrap_or_default();
    for entry in &manifest_entries {
        if entry.dev_only == Some(true) {
            if api_router_content.contains(&entry.handler_file) {
                violations.push(format!(
                    "Dev-only handler '{}' must not be mounted by api-router.ts.",
                    entry.handler_file
                ));
            }
            continue;
        }

        let app_export = rewrite_utils::get_app_export_name(entry);
        if !has_handler_import(&api_router_content, &app_export, &entry.handler_file) {
            violations.push(format!(
                "Missing unified-router import for {} from './handlers/{}.js'.",
                app_export, entry.handler_file
            ));
        }
        if !api_router_content.contains(&format!("routePath: '{}'", entry.route_path))
            || !api_router_content.contains(&format!("handlerFile: '{}'", entry.handler_file))
        {
            violations.push(format!(
                "api-router.ts is missing API_ROUTE_MOUNTS metadata for route '{}' and handler '{}'.",
                entry.route_path, entry.handler_file
            ));
        }
    }

    // Sub-check F: the Cloud Run app must mount explicit dev and prod prefixes.
    let cloud_run_app_content = fs::read_to_string(&cloud_run_app_ts).unwrap_or_default();
    for environment in ["dev", "prod"] {
        let prefix = format!("/api/{environment}");
        if !cloud_run_app_content.contains(&prefix) {
            violations.push(format!(
                "cloud-run-app.ts must mount the unified router at '{prefix}'."
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
            if let Some(function) = r.get("function").and_then(|value| value.as_str()) {
                return Some(FirebaseRewrite {
                    source,
                    function: Some(function.to_string()),
                    run: None,
                });
            }
            let run_value = r.get("run")?;
            let service_id = run_value.get("serviceId")?.as_str()?.to_string();
            let region = run_value.get("region")?.as_str()?.to_string();
            let pin_tag = run_value.get("pinTag")?.as_bool()?;
            Some(FirebaseRewrite {
                source,
                function: None,
                run: Some(CloudRunTarget {
                    service_id,
                    region,
                    pin_tag,
                }),
            })
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
