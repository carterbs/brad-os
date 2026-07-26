use std::fs;
use std::path::Path;

use arch_lint::checks::firebase_routes;
use arch_lint::config::LinterConfig;
use arch_lint::manifest::EndpointEntry;

fn write_file(path: &Path, body: &str) {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).unwrap();
    }
    fs::write(path, body).unwrap();
}

fn endpoint() -> EndpointEntry {
    EndpointEntry {
        route_path: "health".to_string(),
        handler_file: "health".to_string(),
        options: None,
        dev_only: None,
        function_stem: None,
        custom_source: None,
    }
}

fn valid_fixture() -> (tempfile::TempDir, LinterConfig) {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    write_file(
        &root.join("firebase.json"),
        r#"{
  "hosting": {
    "rewrites": [
      {
        "source": "/api/**",
        "run": {"serviceId": "brad-os-api", "region": "us-central1", "pinTag": true}
      },
      {"source": "/debug", "function": "devMealplanDebug"},
      {"source": "/debug/**", "function": "devMealplanDebug"}
    ]
  }
}"#,
    );
    write_file(
        &root.join("packages/functions/src/handlers/health.ts"),
        "export const healthApp = createBaseApp('health');",
    );
    write_file(
        &root.join("packages/functions/src/index.ts"),
        "import { healthApp } from './handlers/health.js';\n\
         export const devHealth = healthApp;\n\
         export const prodHealth = healthApp;\n",
    );
    write_file(
        &root.join("packages/functions/src/api-router.ts"),
        "import { healthApp } from './handlers/health.js';\n\
         export const API_ROUTE_MOUNTS = [\n\
           { routePath: 'health', handlerFile: 'health', app: healthApp },\n\
         ];\n",
    );
    write_file(
        &root.join("packages/functions/src/cloud-run-app.ts"),
        "app.use('/api/dev', devContext, apiRouter);\n\
         app.use('/api/prod', prodContext, apiRouter);\n",
    );
    let config = LinterConfig::from_root(root);
    (temp, config)
}

#[test]
fn accepts_single_cloud_run_rewrite_and_dual_mounts() {
    let (_temp, config) = valid_fixture();
    let result = firebase_routes::check_with_manifest(&config, Some(vec![endpoint()]));
    assert!(result.passed, "{:?}", result.violations);
}

#[test]
fn rejects_legacy_function_rewrite() {
    let (temp, config) = valid_fixture();
    write_file(
        &temp.path().join("firebase.json"),
        r#"{"hosting":{"rewrites":[{"source":"/api/dev/health","function":"devHealth"}]}}"#,
    );
    let result = firebase_routes::check_with_manifest(&config, Some(vec![endpoint()]));
    assert!(!result.passed);
    assert!(result
        .violations
        .iter()
        .any(|value| value.contains("Missing rewrite")));
}

#[test]
fn rejects_wrong_service_or_unpinned_revision() {
    let (temp, config) = valid_fixture();
    write_file(
        &temp.path().join("firebase.json"),
        r#"{"hosting":{"rewrites":[
          {"source":"/api/**","run":{"serviceId":"wrong","region":"us-central1","pinTag":false}},
          {"source":"/debug","function":"devMealplanDebug"},
          {"source":"/debug/**","function":"devMealplanDebug"}
        ]}}"#,
    );
    let result = firebase_routes::check_with_manifest(&config, Some(vec![endpoint()]));
    assert!(!result.passed);
    assert!(result
        .violations
        .iter()
        .any(|value| value.contains("firebase.json rewrite parity failed")));
}

#[test]
fn rejects_missing_unified_router_metadata_or_environment_mount() {
    let (temp, config) = valid_fixture();
    write_file(
        &temp.path().join("packages/functions/src/api-router.ts"),
        "import { healthApp } from './handlers/health.js';\n",
    );
    write_file(
        &temp.path().join("packages/functions/src/cloud-run-app.ts"),
        "app.use('/api/dev', devContext, apiRouter);\n",
    );
    let result = firebase_routes::check_with_manifest(&config, Some(vec![endpoint()]));
    assert!(!result.passed);
    assert!(result
        .violations
        .iter()
        .any(|value| value.contains("API_ROUTE_MOUNTS metadata")));
    assert!(result
        .violations
        .iter()
        .any(|value| value.contains("/api/prod")));
}

#[test]
fn rejects_dev_only_handler_in_unified_router() {
    let (temp, config) = valid_fixture();
    write_file(
        &temp.path().join("packages/functions/src/api-router.ts"),
        "import { healthApp } from './handlers/health.js';\n\
         const handlerFile = 'mealplan-debug';\n\
         export const API_ROUTE_MOUNTS = [\n\
           { routePath: 'health', handlerFile: 'health', app: healthApp },\n\
         ];\n",
    );
    let debug = EndpointEntry {
        route_path: String::new(),
        handler_file: "mealplan-debug".to_string(),
        options: None,
        dev_only: Some(true),
        function_stem: Some("MealplanDebug".to_string()),
        custom_source: Some("/debug".to_string()),
    };
    write_file(
        &temp
            .path()
            .join("packages/functions/src/handlers/mealplan-debug.ts"),
        "export const mealplanDebugApp = {};",
    );
    write_file(
        &temp.path().join("packages/functions/src/index.ts"),
        "import { healthApp } from './handlers/health.js';\n\
         import { mealplanDebugApp } from './handlers/mealplan-debug.js';\n\
         export const devHealth = healthApp;\n\
         export const prodHealth = healthApp;\n\
         export const devMealplanDebug = mealplanDebugApp;\n",
    );
    let result = firebase_routes::check_with_manifest(&config, Some(vec![endpoint(), debug]));
    assert!(!result.passed);
    assert!(result
        .violations
        .iter()
        .any(|value| value.contains("must not be mounted")));
}
