use dev_cli::cloud_run_deploy::{
    discover_git_sha, execute, validate_service_description, DeploymentConfig, SecretVersions,
};
use dev_cli::runner::{CommandCall, CommandResult, CommandRunner};
use serde_json::json;
use std::cell::RefCell;
use std::collections::VecDeque;

#[derive(Default)]
struct FakeRunner {
    results: RefCell<VecDeque<CommandResult>>,
    calls: RefCell<Vec<CommandCall>>,
}

impl FakeRunner {
    fn with_results(results: Vec<CommandResult>) -> Self {
        Self {
            results: RefCell::new(results.into()),
            calls: RefCell::new(Vec::new()),
        }
    }

    fn calls(&self) -> Vec<CommandCall> {
        self.calls.borrow().clone()
    }
}

impl CommandRunner for FakeRunner {
    fn run(&self, command: CommandCall) -> CommandResult {
        self.calls.borrow_mut().push(command);
        self.results
            .borrow_mut()
            .pop_front()
            .unwrap_or(CommandResult {
                status: 99,
                stdout: "unexpected command".to_string(),
            })
    }
}

fn ok(stdout: impl Into<String>) -> CommandResult {
    CommandResult {
        status: 0,
        stdout: stdout.into(),
    }
}

fn fail(stdout: impl Into<String>) -> CommandResult {
    CommandResult {
        status: 1,
        stdout: stdout.into(),
    }
}

fn config(service_url: Option<&str>, plan_only: bool) -> DeploymentConfig {
    DeploymentConfig {
        git_sha: "a".repeat(40),
        secret_versions: SecretVersions {
            openai: "1".to_string(),
            strava_client_id: "2".to_string(),
            strava_client_secret: "3".to_string(),
            strava_verify_token: "4".to_string(),
        },
        service_url: service_url.map(str::to_string),
        plan_only,
    }
}

fn service_description(service_url: &str) -> String {
    let digest_image = format!(
        "us-central1-docker.pkg.dev/brad-os/brad-os-api/brad-os-api@sha256:{}",
        "f".repeat(64)
    );
    let values = [
        ("GOOGLE_CLOUD_PROJECT", "brad-os"),
        ("STRAVA_TASK_QUEUE", "brad-os-strava"),
        ("STRAVA_TASK_QUEUE_LOCATION", "us-central1"),
        (
            "STRAVA_TASK_OIDC_SERVICE_ACCOUNT",
            "brad-os-strava-tasks@brad-os.iam.gserviceaccount.com",
        ),
        ("CLOUD_RUN_SERVICE_URL", service_url),
        ("STRAVA_TASK_OIDC_AUDIENCE", service_url),
    ]
    .into_iter()
    .map(|(name, value)| json!({"name": name, "value": value}))
    .collect::<Vec<_>>();
    let mut environment = values;
    for (name, secret, key) in [
        ("OPENAI_API_KEY", "OPENAI_API_KEY", "1"),
        ("STRAVA_CLIENT_ID", "STRAVA_CLIENT_ID", "2"),
        ("STRAVA_CLIENT_SECRET", "STRAVA_CLIENT_SECRET", "3"),
        (
            "STRAVA_WEBHOOK_VERIFY_TOKEN",
            "STRAVA_WEBHOOK_VERIFY_TOKEN",
            "4",
        ),
    ] {
        environment.push(json!({
            "name": name,
            "valueFrom": {"secretKeyRef": {"name": secret, "key": key}}
        }));
    }

    json!({
        "metadata": {
            "name": "brad-os-api",
            "annotations": {
                "run.googleapis.com/ingress": "all",
                "run.googleapis.com/maxScale": "1",
                "run.googleapis.com/minScale": "0"
            }
        },
        "spec": {
            "template": {
                "metadata": {
                    "annotations": {
                        "autoscaling.knative.dev/maxScale": "1",
                        "run.googleapis.com/cpu-throttling": "true",
                        "run.googleapis.com/startup-cpu-boost": "true"
                    }
                },
                "spec": {
                    "serviceAccountName": "brad-os-api@brad-os.iam.gserviceaccount.com",
                    "containerConcurrency": 20,
                    "timeoutSeconds": 180,
                    "containers": [{
                        "image": digest_image,
                        "resources": {"limits": {"cpu": "1", "memory": "512Mi"}},
                        "startupProbe": {
                            "failureThreshold": 60,
                            "httpGet": {"path": "/healthz", "port": 8080},
                            "initialDelaySeconds": 0,
                            "periodSeconds": 1,
                            "timeoutSeconds": 1
                        },
                        "env": environment
                    }]
                }
            }
        },
        "status": {
            "url": service_url,
            "traffic": [{
                "tag": "candidate-aaaaaaaaaaaa",
                "url": "https://candidate---brad-os-api.example.run.app"
            }]
        }
    })
    .to_string()
}

#[test]
fn explicit_service_url_deploys_one_no_traffic_candidate_and_smokes_it() {
    let service_url = "https://brad-os-api.example.run.app";
    let warning = "\npython: FutureWarning: support window changing\n";
    let runner = FakeRunner::with_results(vec![
        ok("build complete"),
        ok(format!("sha256:{}{warning}", "f".repeat(64))),
        ok("deployed"),
        ok(format!("{}{warning}", service_description(service_url))),
        ok("dev healthy"),
        ok("prod healthy"),
    ]);
    let mut output = Vec::new();

    execute(&runner, &mut output, &config(Some(service_url), false)).unwrap();

    let calls = runner.calls();
    assert_eq!(calls.len(), 6);
    assert_eq!(calls[0].args[0..2], ["builds", "submit"]);
    let deploy = &calls[2];
    assert_eq!(deploy.args[0..2], ["run", "deploy"]);
    assert!(deploy.args.contains(&"--no-traffic".to_string()));
    assert!(deploy.args.iter().any(|arg| arg == "--min=0"));
    assert!(deploy.args.iter().any(|arg| arg == "--max=1"));
    assert!(deploy.args.iter().any(|arg| arg == "--max-instances=1"));
    assert!(deploy.args.iter().any(|arg| {
        arg == "--startup-probe=httpGet.path=/healthz,httpGet.port=8080,\
initialDelaySeconds=0,timeoutSeconds=1,periodSeconds=1,failureThreshold=60"
    }));
    assert!(deploy.args.iter().any(|arg| {
        arg.contains("CLOUD_RUN_SERVICE_URL=https://brad-os-api.example.run.app")
            && arg.contains("STRAVA_TASK_OIDC_AUDIENCE=https://brad-os-api.example.run.app")
    }));
    for (call, environment) in calls[4..].iter().zip(["dev", "prod"]) {
        assert_eq!(call.program, "curl");
        assert!(call.args.contains(&format!(
            "https://candidate---brad-os-api.example.run.app/api/{environment}/health"
        )));
        assert!(call.args.contains(&"--retry-all-errors".to_string()));
        assert!(call.args.contains(&"--retry-max-time".to_string()));
    }
    let rendered = String::from_utf8(output).unwrap();
    assert!(rendered.contains("Candidate ready:"));
    assert!(rendered.contains("legacy Functions were left unchanged"));
}

#[test]
fn first_creation_bootstraps_then_reads_stable_url_and_redeploys() {
    let service_url = "https://brad-os-api.example.run.app";
    let runner = FakeRunner::with_results(vec![
        ok("build complete"),
        ok(format!("sha256:{}", "f".repeat(64))),
        ok("bootstrap deployed"),
        ok(json!({"status": {"url": service_url}}).to_string()),
        ok("candidate deployed"),
        ok(service_description(service_url)),
        ok("dev healthy"),
        ok("prod healthy"),
    ]);
    let mut output = Vec::new();

    execute(&runner, &mut output, &config(None, false)).unwrap();

    let deploys = runner
        .calls()
        .into_iter()
        .filter(|call| {
            call.args.get(0).map(String::as_str) == Some("run")
                && call.args.get(1).map(String::as_str) == Some("deploy")
        })
        .collect::<Vec<_>>();
    assert_eq!(deploys.len(), 2);
    assert!(!deploys[0].args.contains(&"--no-traffic".to_string()));
    assert!(deploys[1].args.contains(&"--no-traffic".to_string()));
    let bootstrap_env = deploys[0]
        .args
        .iter()
        .find(|arg| arg.starts_with("--set-env-vars="))
        .unwrap();
    assert!(!bootstrap_env.contains("CLOUD_RUN_SERVICE_URL"));
    let candidate_env = deploys[1]
        .args
        .iter()
        .find(|arg| arg.starts_with("--set-env-vars="))
        .unwrap();
    assert!(candidate_env.contains(service_url));
}

#[test]
fn plan_mode_is_read_only() {
    let runner = FakeRunner::default();
    let mut output = Vec::new();
    execute(&runner, &mut output, &config(None, true)).unwrap();
    assert!(runner.calls().is_empty());
    let rendered = String::from_utf8(output).unwrap();
    assert!(rendered.contains("min=0 service-max=1 revision-max=1"));
    assert!(rendered.contains("startup probe: /healthz every 1s"));
    assert!(rendered.contains("does not modify Firebase Hosting"));
}

#[test]
fn build_failure_stops_before_registry_or_deploy() {
    let runner = FakeRunner::with_results(vec![fail("build exploded")]);
    let error = execute(
        &runner,
        &mut Vec::new(),
        &config(Some("https://brad-os-api.example.run.app"), false),
    )
    .unwrap_err();
    assert!(error.contains("Cloud Build failed"));
    assert_eq!(runner.calls().len(), 1);
}

#[test]
fn invalid_digest_stops_before_deploy() {
    let runner = FakeRunner::with_results(vec![ok("build complete"), ok("sha256:not-a-digest")]);
    let error = execute(
        &runner,
        &mut Vec::new(),
        &config(Some("https://brad-os-api.example.run.app"), false),
    )
    .unwrap_err();
    assert!(error.contains("no valid image digest"));
    assert_eq!(runner.calls().len(), 2);
}

#[test]
fn readback_drift_blocks_success() {
    let service_url = "https://brad-os-api.example.run.app";
    let drifted = service_description(service_url).replace(
        "\"run.googleapis.com/maxScale\":\"1\"",
        "\"run.googleapis.com/maxScale\":\"5\"",
    );
    let runner = FakeRunner::with_results(vec![
        ok("build complete"),
        ok(format!("sha256:{}", "f".repeat(64))),
        ok("deployed"),
        ok(drifted),
    ]);
    let error = execute(&runner, &mut Vec::new(), &config(Some(service_url), false)).unwrap_err();
    assert!(error.contains("configuration read-back failed"));
    assert!(error.contains("maxScale"));
    assert_eq!(runner.calls().len(), 4);
}

#[test]
fn readback_rejects_revision_cap_and_every_startup_probe_drift() {
    let service_url = "https://brad-os-api.example.run.app";
    let image = format!(
        "us-central1-docker.pkg.dev/brad-os/brad-os-api/brad-os-api@sha256:{}",
        "f".repeat(64)
    );
    let cases = [
        (
            "/spec/template/metadata/annotations/autoscaling.knative.dev~1maxScale",
            json!("5"),
            "autoscaling.knative.dev",
        ),
        (
            "/spec/template/spec/containers/0/startupProbe/httpGet/path",
            json!("/slow-startup"),
            "httpGet/path",
        ),
        (
            "/spec/template/spec/containers/0/startupProbe/httpGet/port",
            json!(9090),
            "httpGet/port",
        ),
        (
            "/spec/template/spec/containers/0/startupProbe/initialDelaySeconds",
            json!(1),
            "initialDelaySeconds",
        ),
        (
            "/spec/template/spec/containers/0/startupProbe/timeoutSeconds",
            json!(2),
            "timeoutSeconds",
        ),
        (
            "/spec/template/spec/containers/0/startupProbe/periodSeconds",
            json!(2),
            "periodSeconds",
        ),
        (
            "/spec/template/spec/containers/0/startupProbe/failureThreshold",
            json!(59),
            "failureThreshold",
        ),
    ];

    for (pointer, drift, expected_error) in cases {
        let mut payload: serde_json::Value =
            serde_json::from_str(&service_description(service_url)).expect("service JSON");
        *payload
            .pointer_mut(pointer)
            .unwrap_or_else(|| panic!("fixture must contain {pointer}")) = drift;

        let error = validate_service_description(
            &payload.to_string(),
            &config(Some(service_url), false),
            &image,
            service_url,
        )
        .expect_err("read-back drift must fail");

        assert!(
            error.contains(expected_error),
            "expected '{expected_error}' in '{error}'"
        );
    }
}

#[test]
fn readback_accepts_cloud_run_omitting_default_probe_values() {
    let service_url = "https://brad-os-api.example.run.app";
    let image = format!(
        "us-central1-docker.pkg.dev/brad-os/brad-os-api/brad-os-api@sha256:{}",
        "f".repeat(64)
    );
    let mut payload: serde_json::Value =
        serde_json::from_str(&service_description(service_url)).expect("service JSON");
    let startup_probe = payload["spec"]["template"]["spec"]["containers"][0]["startupProbe"]
        .as_object_mut()
        .expect("startup probe object");
    startup_probe.remove("initialDelaySeconds");
    startup_probe.remove("timeoutSeconds");

    validate_service_description(
        &payload.to_string(),
        &config(Some(service_url), false),
        &image,
        service_url,
    )
    .expect("Cloud Run omits effective default values from read-back");
}

#[test]
fn readback_rejects_any_production_app_check_bypass() {
    let service_url = "https://brad-os-api.example.run.app";
    let image = format!(
        "us-central1-docker.pkg.dev/brad-os/brad-os-api/brad-os-api@sha256:{}",
        "f".repeat(64)
    );

    for bypass_name in ["APP_CHECK_BYPASS", "FUNCTIONS_EMULATOR"] {
        let mut payload: serde_json::Value =
            serde_json::from_str(&service_description(service_url)).expect("service JSON");
        payload["spec"]["template"]["spec"]["containers"][0]["env"]
            .as_array_mut()
            .expect("environment array")
            .push(serde_json::json!({
                "name": bypass_name,
                "value": "true"
            }));

        let error = validate_service_description(
            &payload.to_string(),
            &config(Some(service_url), false),
            &image,
            service_url,
        )
        .expect_err("production bypass must fail read-back");

        assert!(error.contains(bypass_name));
    }
}

#[test]
fn git_discovery_requires_clean_full_commit() {
    let clean = FakeRunner::with_results(vec![ok(""), ok("b".repeat(40))]);
    assert_eq!(discover_git_sha(&clean).unwrap(), "b".repeat(40));

    let dirty = FakeRunner::with_results(vec![ok(" M firebase.json\n")]);
    assert!(discover_git_sha(&dirty)
        .unwrap_err()
        .contains("clean, committed worktree"));

    let invalid = FakeRunner::with_results(vec![ok(""), ok("short")]);
    assert!(discover_git_sha(&invalid).is_err());
}
