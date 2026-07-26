use crate::runner::{CommandCall, CommandRunner};
use serde_json::Value;
use std::env;
use std::io::Write;

pub const PROJECT: &str = "brad-os";
pub const REGION: &str = "us-central1";
pub const SERVICE: &str = "brad-os-api";
pub const ARTIFACT_REPOSITORY: &str = "brad-os-api";
pub const RUNTIME_SERVICE_ACCOUNT: &str = "brad-os-api@brad-os.iam.gserviceaccount.com";
pub const TASK_SERVICE_ACCOUNT: &str = "brad-os-strava-tasks@brad-os.iam.gserviceaccount.com";
pub const TASK_QUEUE: &str = "brad-os-strava";

const SERVICE_MAX_INSTANCES: &str = "1";
const REVISION_MAX_INSTANCES: &str = "1";
const STARTUP_PROBE_PATH: &str = "/healthz";
const STARTUP_PROBE_PORT: u64 = 8080;
const STARTUP_PROBE_INITIAL_DELAY_SECONDS: u64 = 0;
const STARTUP_PROBE_TIMEOUT_SECONDS: u64 = 1;
const STARTUP_PROBE_PERIOD_SECONDS: u64 = 1;
const STARTUP_PROBE_FAILURE_THRESHOLD: u64 = 60;

const OPENAI_VERSION_ENV: &str = "BRAD_OPENAI_SECRET_VERSION";
const STRAVA_CLIENT_ID_VERSION_ENV: &str = "BRAD_STRAVA_CLIENT_ID_SECRET_VERSION";
const STRAVA_CLIENT_SECRET_VERSION_ENV: &str = "BRAD_STRAVA_CLIENT_SECRET_VERSION";
const STRAVA_VERIFY_VERSION_ENV: &str = "BRAD_STRAVA_VERIFY_TOKEN_SECRET_VERSION";
const SERVICE_URL_ENV: &str = "BRAD_CLOUD_RUN_SERVICE_URL";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SecretVersions {
    pub openai: String,
    pub strava_client_id: String,
    pub strava_client_secret: String,
    pub strava_verify_token: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeploymentConfig {
    pub git_sha: String,
    pub secret_versions: SecretVersions,
    pub service_url: Option<String>,
    pub plan_only: bool,
}

impl DeploymentConfig {
    pub fn from_env(git_sha: String, plan_only: bool) -> Result<Self, String> {
        validate_git_sha(&git_sha)?;
        let service_url = env::var(SERVICE_URL_ENV)
            .ok()
            .filter(|value| !value.trim().is_empty());
        if let Some(url) = &service_url {
            validate_service_url(url)?;
        }

        Ok(Self {
            git_sha,
            secret_versions: SecretVersions {
                openai: required_secret_version(OPENAI_VERSION_ENV)?,
                strava_client_id: required_secret_version(STRAVA_CLIENT_ID_VERSION_ENV)?,
                strava_client_secret: required_secret_version(STRAVA_CLIENT_SECRET_VERSION_ENV)?,
                strava_verify_token: required_secret_version(STRAVA_VERIFY_VERSION_ENV)?,
            },
            service_url,
            plan_only,
        })
    }

    pub fn image_tag(&self) -> String {
        format!(
            "{REGION}-docker.pkg.dev/{PROJECT}/{ARTIFACT_REPOSITORY}/{SERVICE}:{}",
            self.git_sha
        )
    }

    pub fn candidate_tag(&self) -> String {
        format!("candidate-{}", &self.git_sha[..12])
    }

    fn bootstrap_tag(&self) -> String {
        format!("bootstrap-{}", &self.git_sha[..12])
    }
}

pub fn parse_plan_only(args: &[String]) -> Result<bool, String> {
    let mut plan_only = false;
    for arg in args {
        match arg.as_str() {
            "--plan" => plan_only = true,
            "--execute" => plan_only = false,
            value => {
                return Err(format!(
                    "Unknown argument '{value}'. Use --plan or --execute."
                ))
            }
        }
    }
    Ok(plan_only)
}

pub fn discover_git_sha<R: CommandRunner>(runner: &R) -> Result<String, String> {
    let status = runner.run(CommandCall {
        program: "git".to_string(),
        args: vec!["status".to_string(), "--porcelain".to_string()],
        current_dir: None,
    });
    if !status.success() {
        return Err("Unable to inspect the Git worktree.".to_string());
    }
    if !status.stdout.trim().is_empty() {
        return Err(
            "Cloud Run deploys require a clean, committed worktree. Commit the candidate first."
                .to_string(),
        );
    }

    let head = runner.run(CommandCall {
        program: "git".to_string(),
        args: vec!["rev-parse".to_string(), "HEAD".to_string()],
        current_dir: None,
    });
    if !head.success() {
        return Err("Unable to resolve the current Git commit.".to_string());
    }
    let sha = head.stdout.trim().to_string();
    validate_git_sha(&sha)?;
    Ok(sha)
}

pub fn render_plan<W: Write>(writer: &mut W, config: &DeploymentConfig) -> Result<(), String> {
    writeln!(writer, "Cloud Run candidate deployment plan").map_err(|error| error.to_string())?;
    writeln!(writer, "  project: {PROJECT}").map_err(|error| error.to_string())?;
    writeln!(writer, "  region: {REGION}").map_err(|error| error.to_string())?;
    writeln!(writer, "  service: {SERVICE}").map_err(|error| error.to_string())?;
    writeln!(writer, "  repository: {ARTIFACT_REPOSITORY}").map_err(|error| error.to_string())?;
    writeln!(writer, "  image: {}", config.image_tag()).map_err(|error| error.to_string())?;
    writeln!(
        writer,
        "  runtime: min=0 service-max=1 revision-max=1 concurrency=20 cpu=1 memory=512Mi timeout=180s"
    )
    .map_err(|error| error.to_string())?;
    writeln!(
        writer,
        "  startup probe: /healthz every 1s, 1s timeout, 60-failure budget"
    )
    .map_err(|error| error.to_string())?;
    writeln!(
        writer,
        "  traffic: none (candidate tag {})",
        config.candidate_tag()
    )
    .map_err(|error| error.to_string())?;
    if config.service_url.is_none() {
        writeln!(
            writer,
            "  bootstrap: create the service outside Hosting, read status.url, then create the no-traffic candidate"
        )
        .map_err(|error| error.to_string())?;
    }
    writeln!(
        writer,
        "  safety: does not modify Firebase Hosting or delete/update legacy Functions"
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}

pub fn execute<R: CommandRunner, W: Write>(
    runner: &R,
    writer: &mut W,
    config: &DeploymentConfig,
) -> Result<(), String> {
    if config.plan_only {
        return render_plan(writer, config);
    }

    writeln!(writer, "Building {}", config.image_tag()).map_err(|error| error.to_string())?;
    run_checked(
        runner,
        CommandCall {
            program: "gcloud".to_string(),
            args: vec![
                "builds".to_string(),
                "submit".to_string(),
                ".".to_string(),
                "--project".to_string(),
                PROJECT.to_string(),
                "--region".to_string(),
                REGION.to_string(),
                "--tag".to_string(),
                config.image_tag(),
                "--quiet".to_string(),
            ],
            current_dir: None,
        },
        "Cloud Build failed",
    )?;

    let digest_result = run_checked(
        runner,
        CommandCall {
            program: "gcloud".to_string(),
            args: vec![
                "artifacts".to_string(),
                "docker".to_string(),
                "images".to_string(),
                "describe".to_string(),
                config.image_tag(),
                "--project".to_string(),
                PROJECT.to_string(),
                "--format=value(image_summary.digest)".to_string(),
            ],
            current_dir: None,
        },
        "Unable to resolve the built image digest",
    )?;
    let digest = extract_digest(&digest_result.stdout)?;
    let image =
        format!("{REGION}-docker.pkg.dev/{PROJECT}/{ARTIFACT_REPOSITORY}/{SERVICE}@{digest}");

    let service_url = match &config.service_url {
        Some(url) => url.clone(),
        None => {
            run_deploy(runner, config, &image, &config.bootstrap_tag(), None, false)?;
            read_service_url(runner)?
        }
    };
    validate_service_url(&service_url)?;

    run_deploy(
        runner,
        config,
        &image,
        &config.candidate_tag(),
        Some(&service_url),
        true,
    )?;

    let description = run_checked(
        runner,
        describe_command(),
        "Unable to read back the deployed Cloud Run service",
    )?;
    validate_service_description(&description.stdout, config, &image, &service_url)?;
    let candidate_url =
        candidate_url_from_description(&description.stdout, &config.candidate_tag())?;

    for environment in ["dev", "prod"] {
        run_checked(
            runner,
            CommandCall {
                program: "curl".to_string(),
                args: vec![
                    "--fail".to_string(),
                    "--silent".to_string(),
                    "--show-error".to_string(),
                    "--retry".to_string(),
                    "12".to_string(),
                    "--retry-delay".to_string(),
                    "5".to_string(),
                    "--retry-all-errors".to_string(),
                    "--retry-max-time".to_string(),
                    "120".to_string(),
                    "--max-time".to_string(),
                    "30".to_string(),
                    format!("{candidate_url}/api/{environment}/health"),
                ],
                current_dir: None,
            },
            &format!("Candidate /api/{environment}/health smoke test failed"),
        )?;
    }

    writeln!(writer, "Candidate ready: {candidate_url}").map_err(|error| error.to_string())?;
    writeln!(writer, "Immutable image: {image}").map_err(|error| error.to_string())?;
    writeln!(
        writer,
        "Firebase Hosting and all legacy Functions were left unchanged."
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}

fn run_deploy<R: CommandRunner>(
    runner: &R,
    config: &DeploymentConfig,
    image: &str,
    tag: &str,
    service_url: Option<&str>,
    no_traffic: bool,
) -> Result<(), String> {
    let secrets = format!(
        "OPENAI_API_KEY=OPENAI_API_KEY:{},STRAVA_CLIENT_ID=STRAVA_CLIENT_ID:{},\
STRAVA_CLIENT_SECRET=STRAVA_CLIENT_SECRET:{},\
STRAVA_WEBHOOK_VERIFY_TOKEN=STRAVA_WEBHOOK_VERIFY_TOKEN:{}",
        config.secret_versions.openai,
        config.secret_versions.strava_client_id,
        config.secret_versions.strava_client_secret,
        config.secret_versions.strava_verify_token
    );
    let mut env_vars = vec![
        format!("GOOGLE_CLOUD_PROJECT={PROJECT}"),
        format!("STRAVA_TASK_QUEUE={TASK_QUEUE}"),
        format!("STRAVA_TASK_QUEUE_LOCATION={REGION}"),
        format!("STRAVA_TASK_OIDC_SERVICE_ACCOUNT={TASK_SERVICE_ACCOUNT}"),
    ];
    if let Some(url) = service_url {
        env_vars.push(format!("CLOUD_RUN_SERVICE_URL={url}"));
        env_vars.push(format!("STRAVA_TASK_OIDC_AUDIENCE={url}"));
    }

    let mut args = vec![
        "run".to_string(),
        "deploy".to_string(),
        SERVICE.to_string(),
        "--project".to_string(),
        PROJECT.to_string(),
        "--region".to_string(),
        REGION.to_string(),
        "--platform=managed".to_string(),
        format!("--image={image}"),
        format!("--service-account={RUNTIME_SERVICE_ACCOUNT}"),
        "--execution-environment=gen2".to_string(),
        "--cpu=1".to_string(),
        "--memory=512Mi".to_string(),
        "--concurrency=20".to_string(),
        "--timeout=180".to_string(),
        "--min=0".to_string(),
        format!("--max={SERVICE_MAX_INSTANCES}"),
        format!("--max-instances={REVISION_MAX_INSTANCES}"),
        "--cpu-boost".to_string(),
        "--cpu-throttling".to_string(),
        "--deploy-health-check".to_string(),
        "--ingress=all".to_string(),
        "--allow-unauthenticated".to_string(),
        format!("--tag={tag}"),
        format!(
            "--startup-probe=httpGet.path={STARTUP_PROBE_PATH},httpGet.port={STARTUP_PROBE_PORT},\
initialDelaySeconds={STARTUP_PROBE_INITIAL_DELAY_SECONDS},\
timeoutSeconds={STARTUP_PROBE_TIMEOUT_SECONDS},periodSeconds={STARTUP_PROBE_PERIOD_SECONDS},\
failureThreshold={STARTUP_PROBE_FAILURE_THRESHOLD}"
        ),
        format!("--set-secrets={secrets}"),
        format!("--set-env-vars={}", env_vars.join(",")),
        "--quiet".to_string(),
    ];
    if no_traffic {
        args.push("--no-traffic".to_string());
    }
    run_checked(
        runner,
        CommandCall {
            program: "gcloud".to_string(),
            args,
            current_dir: None,
        },
        "Cloud Run candidate deployment failed",
    )?;
    Ok(())
}

fn describe_command() -> CommandCall {
    CommandCall {
        program: "gcloud".to_string(),
        args: vec![
            "run".to_string(),
            "services".to_string(),
            "describe".to_string(),
            SERVICE.to_string(),
            "--project".to_string(),
            PROJECT.to_string(),
            "--region".to_string(),
            REGION.to_string(),
            "--platform=managed".to_string(),
            "--format=json".to_string(),
        ],
        current_dir: None,
    }
}

fn read_service_url<R: CommandRunner>(runner: &R) -> Result<String, String> {
    let result = run_checked(
        runner,
        describe_command(),
        "Unable to discover the new Cloud Run service URL",
    )?;
    let payload = parse_json_value(&result.stdout)?;
    json_string(&payload, "/status/url")
        .map(str::to_string)
        .ok_or_else(|| "Cloud Run service description has no status.url.".to_string())
}

pub fn validate_service_description(
    raw: &str,
    config: &DeploymentConfig,
    image: &str,
    service_url: &str,
) -> Result<(), String> {
    let payload = parse_json_value(raw)?;
    let mut violations = Vec::new();

    expect_json_string(&payload, "/metadata/name", SERVICE, &mut violations);
    expect_json_string(
        &payload,
        "/metadata/annotations/run.googleapis.com~1ingress",
        "all",
        &mut violations,
    );
    expect_json_string(
        &payload,
        "/spec/template/spec/serviceAccountName",
        RUNTIME_SERVICE_ACCOUNT,
        &mut violations,
    );
    expect_json_number(
        &payload,
        "/spec/template/spec/containerConcurrency",
        20,
        &mut violations,
    );
    expect_json_number(
        &payload,
        "/spec/template/spec/timeoutSeconds",
        180,
        &mut violations,
    );
    expect_json_string(
        &payload,
        "/metadata/annotations/run.googleapis.com~1maxScale",
        SERVICE_MAX_INSTANCES,
        &mut violations,
    );
    expect_json_string(
        &payload,
        "/spec/template/metadata/annotations/autoscaling.knative.dev~1maxScale",
        REVISION_MAX_INSTANCES,
        &mut violations,
    );
    if let Some(minimum) = json_string(
        &payload,
        "/metadata/annotations/run.googleapis.com~1minScale",
    ) {
        if minimum != "0" {
            violations.push(format!(
                "service minimum instances expected 0, found {minimum}"
            ));
        }
    }
    expect_json_string(
        &payload,
        "/spec/template/metadata/annotations/run.googleapis.com~1cpu-throttling",
        "true",
        &mut violations,
    );
    expect_json_string(
        &payload,
        "/spec/template/metadata/annotations/run.googleapis.com~1startup-cpu-boost",
        "true",
        &mut violations,
    );
    expect_json_string(
        &payload,
        "/spec/template/spec/containers/0/image",
        image,
        &mut violations,
    );
    expect_json_string(
        &payload,
        "/spec/template/spec/containers/0/resources/limits/cpu",
        "1",
        &mut violations,
    );
    expect_json_string(
        &payload,
        "/spec/template/spec/containers/0/resources/limits/memory",
        "512Mi",
        &mut violations,
    );
    expect_json_string(
        &payload,
        "/spec/template/spec/containers/0/startupProbe/httpGet/path",
        STARTUP_PROBE_PATH,
        &mut violations,
    );
    expect_json_number(
        &payload,
        "/spec/template/spec/containers/0/startupProbe/httpGet/port",
        STARTUP_PROBE_PORT,
        &mut violations,
    );
    expect_json_number_with_default(
        &payload,
        "/spec/template/spec/containers/0/startupProbe/initialDelaySeconds",
        STARTUP_PROBE_INITIAL_DELAY_SECONDS,
        0,
        &mut violations,
    );
    expect_json_number_with_default(
        &payload,
        "/spec/template/spec/containers/0/startupProbe/timeoutSeconds",
        STARTUP_PROBE_TIMEOUT_SECONDS,
        1,
        &mut violations,
    );
    expect_json_number(
        &payload,
        "/spec/template/spec/containers/0/startupProbe/periodSeconds",
        STARTUP_PROBE_PERIOD_SECONDS,
        &mut violations,
    );
    expect_json_number(
        &payload,
        "/spec/template/spec/containers/0/startupProbe/failureThreshold",
        STARTUP_PROBE_FAILURE_THRESHOLD,
        &mut violations,
    );
    expect_json_string(&payload, "/status/url", service_url, &mut violations);

    let env = payload
        .pointer("/spec/template/spec/containers/0/env")
        .and_then(Value::as_array);
    validate_environment(env, config, service_url, &mut violations);

    if violations.is_empty() {
        Ok(())
    } else {
        Err(format!(
            "Cloud Run configuration read-back failed:\n- {}",
            violations.join("\n- ")
        ))
    }
}

fn validate_environment(
    env: Option<&Vec<Value>>,
    config: &DeploymentConfig,
    service_url: &str,
    violations: &mut Vec<String>,
) {
    let Some(entries) = env else {
        violations.push("container environment is missing".to_string());
        return;
    };
    for (name, expected) in [
        ("GOOGLE_CLOUD_PROJECT", PROJECT),
        ("STRAVA_TASK_QUEUE", TASK_QUEUE),
        ("STRAVA_TASK_QUEUE_LOCATION", REGION),
        ("STRAVA_TASK_OIDC_SERVICE_ACCOUNT", TASK_SERVICE_ACCOUNT),
        ("CLOUD_RUN_SERVICE_URL", service_url),
        ("STRAVA_TASK_OIDC_AUDIENCE", service_url),
    ] {
        let actual = env_value(entries, name);
        if actual != Some(expected) {
            violations.push(format!(
                "environment {name} expected '{expected}', found {:?}",
                actual
            ));
        }
    }

    for name in ["APP_CHECK_BYPASS", "FUNCTIONS_EMULATOR"] {
        if env_value(entries, name) == Some("true") {
            violations.push(format!(
                "dangerous App Check bypass {name}=true must not be deployed"
            ));
        }
    }

    for (name, secret, version) in [
        (
            "OPENAI_API_KEY",
            "OPENAI_API_KEY",
            &config.secret_versions.openai,
        ),
        (
            "STRAVA_CLIENT_ID",
            "STRAVA_CLIENT_ID",
            &config.secret_versions.strava_client_id,
        ),
        (
            "STRAVA_CLIENT_SECRET",
            "STRAVA_CLIENT_SECRET",
            &config.secret_versions.strava_client_secret,
        ),
        (
            "STRAVA_WEBHOOK_VERIFY_TOKEN",
            "STRAVA_WEBHOOK_VERIFY_TOKEN",
            &config.secret_versions.strava_verify_token,
        ),
    ] {
        let actual = secret_ref(entries, name);
        let expected = Some((secret, version.as_str()));
        if actual != expected {
            violations.push(format!(
                "secret {name} expected {secret}:{version}, found {:?}",
                actual
            ));
        }
    }
}

fn env_value<'a>(entries: &'a [Value], name: &str) -> Option<&'a str> {
    entries.iter().find_map(|entry| {
        (entry.get("name")?.as_str()? == name)
            .then(|| entry.get("value")?.as_str())
            .flatten()
    })
}

fn secret_ref<'a>(entries: &'a [Value], name: &str) -> Option<(&'a str, &'a str)> {
    entries.iter().find_map(|entry| {
        if entry.get("name")?.as_str()? != name {
            return None;
        }
        let reference = entry.pointer("/valueFrom/secretKeyRef")?;
        Some((
            reference.get("name")?.as_str()?,
            reference.get("key")?.as_str()?,
        ))
    })
}

fn candidate_url_from_description(raw: &str, tag: &str) -> Result<String, String> {
    let payload = parse_json_value(raw)?;
    payload
        .pointer("/status/traffic")
        .and_then(Value::as_array)
        .and_then(|traffic| {
            traffic.iter().find_map(|entry| {
                (entry.get("tag")?.as_str()? == tag)
                    .then(|| entry.get("url")?.as_str())
                    .flatten()
            })
        })
        .map(str::to_string)
        .ok_or_else(|| format!("Cloud Run candidate tag '{tag}' has no URL."))
}

fn expect_json_string(
    payload: &Value,
    pointer: &str,
    expected: &str,
    violations: &mut Vec<String>,
) {
    let actual = json_string(payload, pointer);
    if actual != Some(expected) {
        violations.push(format!(
            "{pointer} expected '{expected}', found {:?}",
            actual
        ));
    }
}

fn expect_json_number(payload: &Value, pointer: &str, expected: u64, violations: &mut Vec<String>) {
    let actual = payload.pointer(pointer).and_then(Value::as_u64);
    if actual != Some(expected) {
        violations.push(format!("{pointer} expected {expected}, found {:?}", actual));
    }
}

fn expect_json_number_with_default(
    payload: &Value,
    pointer: &str,
    expected: u64,
    default: u64,
    violations: &mut Vec<String>,
) {
    let actual = match payload.pointer(pointer) {
        Some(value) => value.as_u64(),
        None => Some(default),
    };
    if actual != Some(expected) {
        violations.push(format!("{pointer} expected {expected}, found {:?}", actual));
    }
}

fn json_string<'a>(payload: &'a Value, pointer: &str) -> Option<&'a str> {
    payload.pointer(pointer).and_then(Value::as_str)
}

fn parse_json_value(raw: &str) -> Result<Value, String> {
    serde_json::Deserializer::from_str(raw)
        .into_iter::<Value>()
        .next()
        .ok_or_else(|| "Cloud Run service description was empty.".to_string())?
        .map_err(|error| format!("Invalid Cloud Run service description: {error}"))
}

fn extract_digest(raw: &str) -> Result<&str, String> {
    raw.lines()
        .map(str::trim)
        .find(|candidate| validate_digest(candidate).is_ok())
        .ok_or_else(|| format!("Artifact Registry returned no valid image digest: '{raw}'."))
}

fn run_checked<R: CommandRunner>(
    runner: &R,
    command: CommandCall,
    message: &str,
) -> Result<crate::runner::CommandResult, String> {
    let result = runner.run(command);
    if result.success() {
        Ok(result)
    } else {
        Err(format!("{message}: {}", result.stdout.trim()))
    }
}

fn required_secret_version(name: &str) -> Result<String, String> {
    let raw = env::var(name).map_err(|_| {
        format!("{name} is required and must be the positive numeric Secret Manager version.")
    })?;
    validate_secret_version(name, &raw)?;
    Ok(raw)
}

fn validate_secret_version(name: &str, value: &str) -> Result<(), String> {
    if value.is_empty()
        || !value.bytes().all(|byte| byte.is_ascii_digit())
        || value
            .parse::<u64>()
            .ok()
            .filter(|number| *number > 0)
            .is_none()
    {
        return Err(format!(
            "{name} must be a positive numeric Secret Manager version, not '{value}'."
        ));
    }
    Ok(())
}

fn validate_git_sha(value: &str) -> Result<(), String> {
    if value.len() != 40 || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("Git SHA must be the full 40-character commit hash.".to_string());
    }
    Ok(())
}

fn validate_digest(value: &str) -> Result<(), String> {
    let hex = value.strip_prefix("sha256:").unwrap_or("");
    if hex.len() != 64 || !hex.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(format!(
            "Artifact Registry returned an invalid image digest: '{value}'."
        ));
    }
    Ok(())
}

fn validate_service_url(value: &str) -> Result<(), String> {
    if !value.starts_with("https://") || value.ends_with('/') {
        return Err(format!(
            "Cloud Run service URL must be HTTPS without a trailing slash: '{value}'."
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_identifiers_and_versions() {
        assert!(validate_git_sha(&"a".repeat(40)).is_ok());
        assert!(validate_git_sha("short").is_err());
        assert!(validate_digest(&format!("sha256:{}", "f".repeat(64))).is_ok());
        assert!(validate_digest("latest").is_err());
        assert!(validate_secret_version("TEST", "4").is_ok());
        assert!(validate_secret_version("TEST", "latest").is_err());
        assert!(validate_secret_version("TEST", "0").is_err());
        assert!(validate_service_url("https://brad-os-api.example.run.app").is_ok());
        assert!(validate_service_url("http://insecure.example").is_err());
        assert!(validate_service_url("https://example/").is_err());
    }

    #[test]
    fn argument_parser_is_strict() {
        assert_eq!(parse_plan_only(&[]).unwrap(), false);
        assert_eq!(parse_plan_only(&["--plan".to_string()]).unwrap(), true);
        assert_eq!(
            parse_plan_only(&["--plan".to_string(), "--execute".to_string()]).unwrap(),
            false
        );
        assert!(parse_plan_only(&["--delete".to_string()]).is_err());
    }
}
