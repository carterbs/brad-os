use crate::runner::{
    run_live_interrupted, spawn_in_process_group, terminate_process_group, LiveRunOpts,
    ProcessGroup,
};
use std::collections::HashMap;
use std::env;
use std::io::{self, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::thread;
use std::time::{Duration, Instant};

const DEFAULT_BUILD_COMMAND: &str = "npm";
const DEFAULT_TEST_COMMAND: &str = "npm";
const DEFAULT_EMULATOR_COMMAND: &str = "firebase";
const DEFAULT_API_COMMAND: &str = "node";
const DEFAULT_HEALTH_CHECK_COMMAND: &str = "curl";
const DEFAULT_API_URL: &str = "http://127.0.0.1:5001/api/dev";
const DEFAULT_FIRESTORE_HOST: &str = "127.0.0.1:8080";
const DEFAULT_PROJECT: &str = "brad-os";
const DEFAULT_TIMEOUT_SECONDS: u64 = 120;
const DEFAULT_INTERVAL_SECONDS: u64 = 2;
const DEFAULT_STOP_GRACE_MILLIS: u64 = 10_000;
const SAFE_TEST_ENV_PASSTHROUGH: [&str; 10] = [
    "BRAD_IT_STATE_FILE",
    "BRAD_IT_HEALTH_ATTEMPTS_FILE",
    "BRAD_IT_READY_AFTER",
    "BRAD_IT_EMULATOR_EXIT",
    "BRAD_IT_TEST_SLEEP",
    "BRAD_IT_TEST_EXIT",
    "BRAD_IT_TEST_DESCENDANT_PID_FILE",
    "BRAD_IT_API_DESCENDANT_PID_FILE",
    "BRAD_IT_API_IGNORE_TERM",
    "BRAD_IT_API_SPAWN_DESCENDANT",
];

#[derive(Debug, Clone)]
pub struct IntegrationTestConfig {
    pub build_command: String,
    pub build_args: Vec<String>,
    pub emulator_command: String,
    pub emulator_args: Vec<String>,
    pub api_command: String,
    pub api_args: Vec<String>,
    pub api_url: String,
    pub api_port: u16,
    pub firestore_host: String,
    pub project: String,
    pub health_check_command: String,
    pub health_check_url: String,
    pub test_command: String,
    pub test_args: Vec<String>,
    pub wait_timeout_secs: u64,
    pub wait_interval_secs: u64,
    pub stop_grace_millis: u64,
}

impl IntegrationTestConfig {
    pub fn from_env() -> Self {
        let api_url = normalize_api_url(
            env::var("BRAD_IT_API_URL").unwrap_or_else(|_| DEFAULT_API_URL.to_string()),
        );
        let api_port = env::var("BRAD_IT_API_PORT")
            .ok()
            .and_then(|raw| raw.parse::<u16>().ok())
            .or_else(|| http_port(&api_url))
            .unwrap_or(5001);
        let project =
            env::var("BRAD_IT_EMULATOR_PROJECT").unwrap_or_else(|_| DEFAULT_PROJECT.to_string());
        let firestore_host = env::var("BRAD_IT_FIRESTORE_HOST")
            .unwrap_or_else(|_| DEFAULT_FIRESTORE_HOST.to_string());

        Self {
            build_command: env::var("BRAD_IT_BUILD_COMMAND")
                .unwrap_or_else(|_| DEFAULT_BUILD_COMMAND.to_string()),
            build_args: vec!["run".to_string(), "build".to_string()],
            emulator_command: env::var("BRAD_IT_EMULATOR_COMMAND")
                .unwrap_or_else(|_| DEFAULT_EMULATOR_COMMAND.to_string()),
            emulator_args: vec![
                "emulators:start".to_string(),
                "--only".to_string(),
                "firestore".to_string(),
                "--project".to_string(),
                project.clone(),
            ],
            api_command: env::var("BRAD_IT_API_COMMAND")
                .unwrap_or_else(|_| DEFAULT_API_COMMAND.to_string()),
            api_args: vec!["packages/functions/lib/server.js".to_string()],
            health_check_command: env::var("BRAD_IT_HEALTH_CHECK_COMMAND")
                .unwrap_or_else(|_| DEFAULT_HEALTH_CHECK_COMMAND.to_string()),
            health_check_url: env::var("BRAD_IT_HEALTH_URL")
                .unwrap_or_else(|_| format!("{api_url}/health")),
            test_command: env::var("BRAD_IT_TEST_COMMAND")
                .unwrap_or_else(|_| DEFAULT_TEST_COMMAND.to_string()),
            test_args: vec!["run".to_string(), "test:integration".to_string()],
            wait_timeout_secs: parse_u64_env("BRAD_IT_WAIT_TIMEOUT_SECS", DEFAULT_TIMEOUT_SECONDS),
            wait_interval_secs: parse_u64_env(
                "BRAD_IT_WAIT_INTERVAL_SECS",
                DEFAULT_INTERVAL_SECONDS,
            ),
            stop_grace_millis: parse_u64_env(
                "BRAD_IT_STOP_GRACE_MILLIS",
                DEFAULT_STOP_GRACE_MILLIS,
            ),
            api_url,
            api_port,
            firestore_host,
            project,
        }
    }

    fn api_environment(&self, isolated_home: &Path) -> HashMap<String, String> {
        let mut environment = isolated_child_environment(isolated_home);
        environment.extend([
            ("PORT".to_string(), self.api_port.to_string()),
            ("GOOGLE_CLOUD_PROJECT".to_string(), self.project.clone()),
            ("GCLOUD_PROJECT".to_string(), self.project.clone()),
            (
                "FIRESTORE_EMULATOR_HOST".to_string(),
                self.firestore_host.clone(),
            ),
            ("APP_CHECK_BYPASS".to_string(), "true".to_string()),
            ("BRAD_LOCAL_DEV_ONLY".to_string(), "true".to_string()),
            ("NODE_ENV".to_string(), "test".to_string()),
            ("OPENAI_API_KEY".to_string(), String::new()),
            ("TYPESAFE_API_KEY".to_string(), String::new()),
            ("JEV_MODEL".to_string(), "jev-1.13.0".to_string()),
            ("STRAVA_CLIENT_ID".to_string(), String::new()),
            ("STRAVA_CLIENT_SECRET".to_string(), String::new()),
            ("STRAVA_WEBHOOK_VERIFY_TOKEN".to_string(), String::new()),
            ("METADATA_SERVER_DETECTION".to_string(), "none".to_string()),
        ]);
        environment
    }

    fn test_environment(&self, isolated_home: &Path) -> HashMap<String, String> {
        let mut environment = isolated_child_environment(isolated_home);
        environment.insert("BRAD_IT_API_URL".to_string(), self.api_url.clone());
        environment.insert("NODE_ENV".to_string(), "test".to_string());
        environment
    }

    fn stop_grace(&self) -> Duration {
        Duration::from_millis(self.stop_grace_millis)
    }
}

#[derive(Default)]
struct ProcessState {
    api: Option<ManagedProcess>,
    firestore: Option<ManagedProcess>,
}

struct ManagedProcess {
    label: &'static str,
    process: Child,
    process_group: ProcessGroup,
    stop_grace: Duration,
    stopped: bool,
}

impl ManagedProcess {
    fn start(
        label: &'static str,
        program: &str,
        args: &[String],
        environment: &HashMap<String, String>,
        clear_environment: bool,
        stop_grace: Duration,
    ) -> Result<Self, String> {
        let mut command = Command::new(program);
        command.args(args);
        if clear_environment {
            command.env_clear();
        }
        command
            .envs(environment)
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit());

        let (child, process_group) = spawn_in_process_group(&mut command)
            .map_err(|error| format!("❌ Failed to start {label}: {error}"))?;

        let mut managed = Self {
            label,
            process: child,
            process_group,
            stop_grace,
            stopped: false,
        };
        if let Ok(Some(status)) = managed.process.try_wait() {
            let exit_code = status.code().unwrap_or(1);
            managed.stop();
            return Err(format!(
                "❌ {label} failed to start (exit code {}).",
                exit_code
            ));
        }

        Ok(managed)
    }

    fn pid(&self) -> u32 {
        self.process.id()
    }

    fn has_exited(&mut self) -> bool {
        self.process
            .try_wait()
            .ok()
            .and_then(|status| status)
            .is_some()
    }

    fn stop(&mut self) {
        if self.stopped {
            return;
        }
        terminate_process_group(&mut self.process, self.process_group, self.stop_grace);
        self.stopped = true;
    }
}

impl Drop for ManagedProcess {
    fn drop(&mut self) {
        self.stop();
    }
}

#[derive(Default)]
struct ProcessSession {
    state: ProcessState,
}

impl ProcessSession {
    fn cleanup(&mut self) {
        let mut out = io::stdout().lock();
        if let Some(mut api) = self.state.api.take() {
            writeln!(out, "\n🧹 Stopping {} (PID {})...", api.label, api.pid()).ok();
            api.stop();
            writeln!(out, "✅ Standalone API stopped.").ok();
        }
        if let Some(mut firestore) = self.state.firestore.take() {
            writeln!(
                out,
                "🧹 Stopping {} (PID {})...",
                firestore.label,
                firestore.pid()
            )
            .ok();
            firestore.stop();
            writeln!(out, "✅ Firestore emulator stopped.").ok();
        }
        let _ = out.flush();
    }
}

impl Drop for ProcessSession {
    fn drop(&mut self) {
        self.cleanup();
    }
}

pub fn run_integration_tests() -> i32 {
    run_with_config(IntegrationTestConfig::from_env())
}

pub(crate) fn run_with_config(config: IntegrationTestConfig) -> i32 {
    let mut session = ProcessSession::default();
    let interrupted = Arc::new(AtomicBool::new(false));
    let interrupted_for_signal = Arc::clone(&interrupted);
    if let Err(error) = ctrlc::set_handler(move || {
        interrupted_for_signal.store(true, Ordering::SeqCst);
    }) {
        eprintln!("⚠️  Unable to register signal handler: {error}");
    }

    println!("🔨 Building functions...");
    let build_status = run_live(
        "integration-build",
        &config.build_command,
        &config.build_args,
        None,
        false,
        config.stop_grace(),
        &interrupted,
    );
    if build_status != 0 {
        if build_status != 130 {
            eprintln!("❌ Build failed. Aborting.");
        }
        return build_status;
    }

    let isolated_home = match tempfile::tempdir() {
        Ok(directory) => directory,
        Err(error) => {
            eprintln!("❌ Unable to create isolated integration environment: {error}");
            return 1;
        }
    };

    println!("🚀 Starting Firestore emulator (fresh database)...");
    let firestore = match ManagedProcess::start(
        "Firestore emulator",
        &config.emulator_command,
        &config.emulator_args,
        &HashMap::new(),
        false,
        config.stop_grace(),
    ) {
        Ok(process) => process,
        Err(message) => {
            eprintln!("{message}");
            return 1;
        }
    };
    println!("   Firestore PID: {}", firestore.pid());
    session.state.firestore = Some(firestore);

    println!(
        "⏳ Waiting for Firestore emulator at {}...",
        config.firestore_host
    );
    match wait_for_firestore(&mut session.state, &config, &interrupted) {
        Readiness::Ready(ready_after_seconds) => {
            println!("✅ Firestore emulator is ready! (took {ready_after_seconds}s)");
        }
        Readiness::Interrupted => {
            return 130;
        }
        Readiness::ProcessExited => {
            eprintln!("❌ Firestore emulator exited before readiness.");
            return 1;
        }
        Readiness::TimedOut => {
            eprintln!("❌ Firestore emulator did not become ready in time.");
            return 1;
        }
    }

    println!("🚀 Starting standalone API in dev-only mode...");
    let api_environment = config.api_environment(isolated_home.path());
    let api = match ManagedProcess::start(
        "standalone API",
        &config.api_command,
        &config.api_args,
        &api_environment,
        true,
        config.stop_grace(),
    ) {
        Ok(process) => process,
        Err(message) => {
            eprintln!("{message}");
            return 1;
        }
    };
    println!("   API PID: {}", api.pid());
    session.state.api = Some(api);

    println!(
        "⏳ Waiting for standalone API at {}...",
        config.health_check_url
    );
    println!("   Timeout: {}s", config.wait_timeout_secs);

    match wait_for_health(&mut session.state, &config, &interrupted) {
        Readiness::Ready(ready_after_seconds) => {
            println!("✅ Standalone API is ready! (took {ready_after_seconds}s)");
        }
        Readiness::Interrupted => {
            return 130;
        }
        Readiness::ProcessExited => {
            eprintln!("❌ Firestore emulator or standalone API exited before readiness.");
            return 1;
        }
        Readiness::TimedOut => {
            eprintln!("❌ Standalone API did not become ready in time.");
            return 1;
        }
    }

    println!();
    println!("🧪 Running integration tests...");
    let test_environment = config.test_environment(isolated_home.path());
    let test_exit_code = run_live(
        "integration-tests",
        &config.test_command,
        &config.test_args,
        Some(&test_environment),
        true,
        config.stop_grace(),
        &interrupted,
    );
    session.cleanup();

    if test_exit_code == 0 {
        println!("✅ Integration tests passed.");
        return 0;
    }

    if test_exit_code == 130 {
        eprintln!("⚠️  Interrupted. Services stopped.");
    } else {
        eprintln!("❌ Integration tests failed (exit code {test_exit_code}).");
    }
    test_exit_code
}

fn run_live(
    name: &str,
    program: &str,
    args: &[String],
    environment: Option<&HashMap<String, String>>,
    clear_environment: bool,
    termination_grace: Duration,
    interrupted: &Arc<AtomicBool>,
) -> i32 {
    let string_args = str_args(args);
    run_live_interrupted(
        &LiveRunOpts {
            name,
            program,
            args: &string_args,
            env: environment,
            clear_env: clear_environment,
            termination_grace,
        },
        interrupted,
    )
}

enum Readiness {
    Ready(u64),
    Interrupted,
    ProcessExited,
    TimedOut,
}

fn wait_for_firestore(
    state: &mut ProcessState,
    config: &IntegrationTestConfig,
    interrupted: &Arc<AtomicBool>,
) -> Readiness {
    let address = match config.firestore_host.parse::<SocketAddr>() {
        Ok(address) => address,
        Err(_) => return Readiness::TimedOut,
    };
    let start = Instant::now();

    loop {
        if interrupted.load(Ordering::SeqCst) {
            return Readiness::Interrupted;
        }
        if !firestore_is_running(state) {
            return Readiness::ProcessExited;
        }
        if TcpStream::connect_timeout(&address, Duration::from_millis(250)).is_ok() {
            return Readiness::Ready(start.elapsed().as_secs());
        }
        let elapsed = start.elapsed().as_secs();
        if elapsed >= config.wait_timeout_secs {
            return Readiness::TimedOut;
        }
        println!("   Waiting... ({elapsed}s elapsed)");
        thread::sleep(Duration::from_secs(config.wait_interval_secs));
    }
}

fn wait_for_health(
    state: &mut ProcessState,
    config: &IntegrationTestConfig,
    interrupted: &Arc<AtomicBool>,
) -> Readiness {
    let start = Instant::now();
    loop {
        if interrupted.load(Ordering::SeqCst) {
            return Readiness::Interrupted;
        }
        if !services_are_running(state) {
            return Readiness::ProcessExited;
        }
        if health_check(config) {
            return Readiness::Ready(start.elapsed().as_secs());
        }
        let elapsed = start.elapsed().as_secs();
        if elapsed >= config.wait_timeout_secs {
            return Readiness::TimedOut;
        }
        println!("   Waiting... ({elapsed}s elapsed)");
        thread::sleep(Duration::from_secs(config.wait_interval_secs));
    }
}

fn firestore_is_running(state: &mut ProcessState) -> bool {
    state
        .firestore
        .as_mut()
        .is_some_and(|process| !process.has_exited())
}

fn services_are_running(state: &mut ProcessState) -> bool {
    let firestore_running = state
        .firestore
        .as_mut()
        .is_some_and(|process| !process.has_exited());
    let api_running = state
        .api
        .as_mut()
        .is_some_and(|process| !process.has_exited());
    firestore_running && api_running
}

fn health_check(config: &IntegrationTestConfig) -> bool {
    Command::new(&config.health_check_command)
        .args(["-s", "-f", &config.health_check_url])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn isolated_child_environment(isolated_home: &Path) -> HashMap<String, String> {
    let mut environment = HashMap::new();
    for key in ["PATH", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL", "TZ"] {
        if let Ok(value) = env::var(key) {
            environment.insert(key.to_string(), value);
        }
    }

    let home = isolated_home.to_string_lossy().into_owned();
    environment.insert("HOME".to_string(), home.clone());
    environment.insert("XDG_CONFIG_HOME".to_string(), format!("{home}/.config"));
    environment.insert("XDG_CACHE_HOME".to_string(), format!("{home}/.cache"));
    environment.insert("XDG_DATA_HOME".to_string(), format!("{home}/.local/share"));
    environment.insert(
        "NO_PROXY".to_string(),
        "127.0.0.1,localhost,::1".to_string(),
    );

    for key in SAFE_TEST_ENV_PASSTHROUGH {
        if let Ok(value) = env::var(key) {
            environment.insert(key.to_string(), value);
        }
    }

    environment
}

fn normalize_api_url(url: String) -> String {
    url.trim_end_matches('/').to_string()
}

fn http_port(url: &str) -> Option<u16> {
    let authority = url.strip_prefix("http://")?.split('/').next()?;
    authority.rsplit_once(':')?.1.parse::<u16>().ok()
}

fn str_args(args: &[String]) -> Vec<&str> {
    args.iter().map(String::as_str).collect()
}

fn parse_u64_env(name: &str, fallback: u64) -> u64 {
    env::var(name)
        .ok()
        .and_then(|raw| raw.parse::<u64>().ok())
        .unwrap_or(fallback)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(unix)]
    use std::fs;
    #[cfg(unix)]
    use std::os::unix::fs::PermissionsExt;
    #[cfg(unix)]
    use std::panic::{catch_unwind, AssertUnwindSafe};

    #[test]
    fn default_configuration_targets_standalone_dev_api_and_firestore_only() {
        let config = IntegrationTestConfig {
            build_command: DEFAULT_BUILD_COMMAND.to_string(),
            build_args: vec!["run".to_string(), "build".to_string()],
            emulator_command: DEFAULT_EMULATOR_COMMAND.to_string(),
            emulator_args: vec![
                "emulators:start".to_string(),
                "--only".to_string(),
                "firestore".to_string(),
                "--project".to_string(),
                DEFAULT_PROJECT.to_string(),
            ],
            api_command: DEFAULT_API_COMMAND.to_string(),
            api_args: vec!["packages/functions/lib/server.js".to_string()],
            api_url: DEFAULT_API_URL.to_string(),
            api_port: 5001,
            firestore_host: DEFAULT_FIRESTORE_HOST.to_string(),
            project: DEFAULT_PROJECT.to_string(),
            health_check_command: DEFAULT_HEALTH_CHECK_COMMAND.to_string(),
            health_check_url: format!("{DEFAULT_API_URL}/health"),
            test_command: DEFAULT_TEST_COMMAND.to_string(),
            test_args: vec!["run".to_string(), "test:integration".to_string()],
            wait_timeout_secs: DEFAULT_TIMEOUT_SECONDS,
            wait_interval_secs: DEFAULT_INTERVAL_SECONDS,
            stop_grace_millis: DEFAULT_STOP_GRACE_MILLIS,
        };
        let isolated_home = tempfile::tempdir().expect("isolated home");
        let api_environment = config.api_environment(isolated_home.path());
        let test_environment = config.test_environment(isolated_home.path());

        assert_eq!(
            config.emulator_args,
            [
                "emulators:start",
                "--only",
                "firestore",
                "--project",
                "brad-os"
            ]
        );
        assert_eq!(
            config.health_check_url,
            "http://127.0.0.1:5001/api/dev/health"
        );
        assert_eq!(
            api_environment.get("FIRESTORE_EMULATOR_HOST"),
            Some(&"127.0.0.1:8080".to_string())
        );
        assert_eq!(
            test_environment.get("BRAD_IT_API_URL"),
            Some(&"http://127.0.0.1:5001/api/dev".to_string())
        );
        assert_eq!(api_environment.get("OPENAI_API_KEY"), Some(&String::new()));
        assert_eq!(
            api_environment.get("TYPESAFE_API_KEY"),
            Some(&String::new())
        );
        assert_eq!(
            api_environment.get("JEV_MODEL").map(String::as_str),
            Some("jev-1.13.0")
        );
        assert!(!test_environment.contains_key("TYPESAFE_API_KEY"));
        assert_eq!(
            api_environment.get("METADATA_SERVER_DETECTION"),
            Some(&"none".to_string())
        );
        assert!(!api_environment.contains_key("GOOGLE_APPLICATION_CREDENTIALS"));
        assert!(!api_environment.contains_key("STRAVA_TASK_QUEUE"));
    }

    #[test]
    fn normalize_api_url_removes_trailing_slashes() {
        assert_eq!(
            normalize_api_url("http://127.0.0.1:6123/api/dev///".to_string()),
            "http://127.0.0.1:6123/api/dev"
        );
    }

    #[test]
    fn http_port_extracts_explicit_http_port() {
        assert_eq!(http_port("http://127.0.0.1:6123/api/dev"), Some(6123));
        assert_eq!(http_port("https://example.com/api/dev"), None);
        assert_eq!(http_port("not-a-url"), None);
    }

    #[test]
    fn parse_u64_env_uses_default_on_bad_input() {
        env::set_var("BRAD_IT_WAIT_TIMEOUT_SECS", "not-a-number");
        assert_eq!(parse_u64_env("BRAD_IT_WAIT_TIMEOUT_SECS", 7), 7);
        env::remove_var("BRAD_IT_WAIT_TIMEOUT_SECS");
    }

    #[test]
    fn isolated_environment_preserves_only_safe_test_controls() {
        let isolated_home = tempfile::tempdir().expect("isolated home");
        env::set_var("BRAD_IT_STATE_FILE", "/tmp/state");
        env::set_var("GOOGLE_APPLICATION_CREDENTIALS", "/real/credentials.json");

        let environment = isolated_child_environment(isolated_home.path());

        assert_eq!(
            environment.get("BRAD_IT_STATE_FILE").map(String::as_str),
            Some("/tmp/state")
        );
        assert_eq!(
            environment.get("HOME").map(String::as_str),
            isolated_home.path().to_str()
        );
        assert!(!environment.contains_key("GOOGLE_APPLICATION_CREDENTIALS"));

        env::remove_var("BRAD_IT_STATE_FILE");
        env::remove_var("GOOGLE_APPLICATION_CREDENTIALS");
    }

    #[cfg(unix)]
    #[test]
    fn process_session_drop_cleans_up_during_unwind() {
        let directory = tempfile::tempdir().expect("tempdir");
        let ready_file = directory.path().join("ready");
        let child_script = directory.path().join("child.sh");
        fs::write(
            &child_script,
            format!(
                "#!/bin/sh\ntrap 'exit 0' INT TERM HUP\ntouch '{}'\nwhile true; do sleep 1; done\n",
                ready_file.display()
            ),
        )
        .expect("write child");
        let mut permissions = fs::metadata(&child_script)
            .expect("child metadata")
            .permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(&child_script, permissions).expect("make child executable");

        let process = ManagedProcess::start(
            "panic cleanup child",
            child_script.to_str().expect("child path"),
            &[],
            &HashMap::new(),
            false,
            Duration::from_millis(250),
        )
        .expect("start child");
        for _ in 0..40 {
            if ready_file.exists() {
                break;
            }
            thread::sleep(Duration::from_millis(25));
        }
        assert!(ready_file.exists(), "child never became ready");
        let pid = process.pid();

        let unwind = catch_unwind(AssertUnwindSafe(|| {
            let mut session = ProcessSession::default();
            session.state.api = Some(process);
            panic!("exercise ProcessSession::drop");
        }));

        assert!(unwind.is_err());
        assert!(
            !Command::new("kill")
                .args(["-0", &pid.to_string()])
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status()
                .is_ok_and(|status| status.success()),
            "child survived unwind cleanup"
        );
    }
}
