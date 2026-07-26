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
      }
    ]
  }
}"#,
    );
    write_file(
        &root.join("packages/functions/src/handlers/health.ts"),
        "export const healthApp = createBaseApp('health');",
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
fn rejects_function_backed_hosting_rewrite() {
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
        .any(|value| value.contains("Extra rewrite")));
}

#[test]
fn rejects_legacy_functions_and_non_firestore_emulator_configuration() {
    let (temp, config) = valid_fixture();
    write_file(
        &temp.path().join("firebase.json"),
        r#"{
          "functions": {"source": "packages/functions"},
          "emulators": {
            "functions": {"port": 5001},
            "firestore": {"port": 8080},
            "hosting": {"port": 5002}
          },
          "hosting": {
            "rewrites": [
              {
                "source": "/api/**",
                "run": {"serviceId": "brad-os-api", "region": "us-central1", "pinTag": true}
              }
            ]
          }
        }"#,
    );
    let result = firebase_routes::check_with_manifest(&config, Some(vec![endpoint()]));
    assert!(!result.passed);
    assert!(result
        .violations
        .iter()
        .any(|value| value.contains("top-level 'functions'")));
    assert!(result
        .violations
        .iter()
        .any(|value| value.contains("emulators.functions")));
    assert!(result
        .violations
        .iter()
        .any(|value| value.contains("emulators.hosting")));
}

#[test]
fn rejects_wrong_service_or_unpinned_revision() {
    let (temp, config) = valid_fixture();
    write_file(
        &temp.path().join("firebase.json"),
        r#"{"hosting":{"rewrites":[
          {"source":"/api/**","run":{"serviceId":"wrong","region":"us-central1","pinTag":false}}
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
