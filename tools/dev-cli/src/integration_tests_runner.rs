use crate::runner::{command_exists, run_passthrough};
use ctrlc;
use std::env;
use std::io::{self, Write};
use std::process::{self, Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

const DEFAULT_BUILD_COMMAND: &str = "npm";
const DEFAULT_TEST_COMMAND: &str = "npm";
const DEFAULT_EMULATOR_COMMAND: &str = "firebase";
const DEFAULT_HEALTH_CHECK_COMMAND: &str = "curl";
const DEFAULT_HEALTH_URL: &str = "http://127.0.0.1:5001/brad-os/us-central1/devHealth";
const DEFAULT_PROJECT: &str = "brad-os";
const DEFAULT_TIMEOUT_SECONDS: u64 = 120;
const DEFAULT_INTERVAL_SECONDS: u64 = 2;

#[derive(Debug, Clone)]
pub struct IntegrationTestConfig {
    pub build_command: String,
    pub build_args: Vec<String>,
    pub emulator_command: String,
    pub emulator_args: Vec<String>,
    pub health_check_command: String,
    pub health_check_url: String,
    pub test_command: String,
    pub test_args: Vec<String>,
    pub wait_timeout_secs: u64,
    pub wait_interval_secs: u64,
    pub use_setsid: bool,
}

impl IntegrationTestConfig {
    pub fn from_env() -> Self {
        Self {
            build_command: env::var("BRAD_IT_BUILD_COMMAND").unwrap_or_else(|_| DEFAULT_BUILD_COMMAND.to_string()),
            build_args: vec!["run".to_string(), "build".to_string()],
            emulator_command: env::var("BRAD_IT_EMULATOR_COMMAND")
                .unwrap_or_else(|_| DEFAULT_EMULATOR_COMMAND.to_string()),
            emulator_args: vec!["emulators:start".to_string(), "--project".to_string(), env::var("BRAD_IT_EMULATOR_PROJECT").unwrap_or_else(|_| DEFAULT_PROJECT.to_string())],
            health_check_command: env::var("BRAD_IT_HEALTH_CHECK_COMMAND")
                .unwrap_or_else(|_| DEFAULT_HEALTH_CHECK_COMMAND.to_string()),
            health_check_url: env::var("BRAD_IT_HEALTH_URL").unwrap_or_else(|_| DEFAULT_HEALTH_URL.to_string()),
            test_command: env::var("BRAD_IT_TEST_COMMAND").unwrap_or_else(|_| DEFAULT_TEST_COMMAND.to_string()),
            test_args: vec!["run".to_string(), "test:integration".to_string()],
            wait_timeout_secs: parse_u64_env("BRAD_IT_WAIT_TIMEOUT_SECS", DEFAULT_TIMEOUT_SECONDS),
            wait_interval_secs: parse_u64_env("BRAD_IT_WAIT_INTERVAL_SECS", DEFAULT_INTERVAL_SECONDS),
            use_setsid: !parse_bool_env("BRAD_IT_DISABLE_SETSID", false) && command_exists("setsid"),
        }
    }
}

struct EmulatorState {
    handle: Option<EmulatorProcess>,
}

struct EmulatorProcess {
    process: Child,
}

impl EmulatorProcess {
    fn start(config: &IntegrationTestConfig) -> Result<Self, String> {
        let using_setsid = config.use_setsid && command_exists("setsid");
        let mut command = if using_setsid {
            Command::new("setsid")
        } else {
            Command::new(&config.emulator_command)
        };

        let args = if using_setsid {
            let mut args = vec![config.emulator_command.as_str()];
            args.extend(config.emulator_args.iter().map(|a| a.as_str()));
            command.args(&args)
        } else {
            command.args(&config.emulator_args.iter().map(|a| a.as_str()).collect::<Vec<_>>())
        };

        let mut child = args
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit())
            .spawn()
            .map_err(|err| format!("❌ Failed to start emulators: {err}"))?;

        if let Ok(Some(status)) = child.try_wait() {
            return Err(format!(
                "❌ Emulators failed to start (exit code {}).",
                status.code().unwrap_or(1)
            ));
        }

        Ok(Self { process: child })
    }

    fn pid(&self) -> u32 {
        self.process.id()
    }

    fn has_exited(&mut self) -> bool {
        self.process.try_wait().ok().and_then(|code| code).is_some()
    }

    fn stop(&mut self) {
        let pid = self.pid();
        let negative_pid = format!("-{pid}");
        let grace_period = Duration::from_secs(10);

        let killed_process_group = Command::new("kill")
            .args(["--", negative_pid.as_str()])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|status| status.success())
            .unwrap_or(false);

        if !killed_process_group {
            let _ = Command::new("kill")
                .arg(pid.to_string())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status();
        }

        let started_waiting = Instant::now();
        while self.process.try_wait().ok().and_then(|status| status).is_none() {
            if started_waiting.elapsed() >= grace_period {
                let _ = Command::new("kill")
                    .args(["-9", pid.to_string().as_str()])
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .status();
                break;
            }
            thread::sleep(Duration::from_millis(100));
        }

        let _ = self.process.try_wait();
    }
}

pub fn run_integration_tests() -> i32 {
    let config = IntegrationTestConfig::from_env();
    run_with_config(config)
}

pub(crate) fn run_with_config(config: IntegrationTestConfig) -> i32 {
    let state = Arc::new(Mutex::new(EmulatorState { handle: None }));

    let state_for_signal = Arc::clone(&state);
    let _ = ctrlc::set_handler(move || {
        cleanup_with_state(&state_for_signal);
        process::exit(130);
    });

    println!("🔨 Building functions...");
    let (build_status, _) = run_passthrough(
        config.build_command.as_str(),
        &str_args(&config.build_args),
    );
    if build_status != 0 {
        eprintln!("❌ Build failed. Aborting.");
        return 1;
    }

    println!("🚀 Starting emulators (fresh database)...");
    let emulator = match EmulatorProcess::start(&config) {
        Ok(emulator) => emulator,
        Err(msg) => {
            eprintln!("{msg}");
            return 1;
        }
    };
    println!("   Emulator PID: {}", emulator.pid());
    println!("");

    {
        let mut guard = state.lock().unwrap_or_else(|e| e.into_inner());
        guard.handle = Some(emulator);
    }

    println!(
        "⏳ Waiting for emulator at {}...",
        config.health_check_url
    );
    println!("   Timeout: {}s", config.wait_timeout_secs);

    let ready_after_seconds = wait_for_health(&state, &config);
    if let Some(ready_after_seconds) = ready_after_seconds {
        println!(
            "✅ Emulator is ready! (took {}s)",
            ready_after_seconds
        );
    } else {
        eprintln!("❌ Emulators did not become ready in time.");
        cleanup_with_state(&state);
        return 1;
    }

    println!("");
    println!("🧪 Running integration tests...");
    let (test_exit_code, _) = run_passthrough(config.test_command.as_str(), &str_args(&config.test_args));
    cleanup_with_state(&state);

    if test_exit_code == 0 {
        println!("✅ Integration tests passed.");
        return 0;
    }

    eprintln!("❌ Integration tests failed (exit code {test_exit_code}).");
    test_exit_code
}

fn wait_for_health(state: &Arc<Mutex<EmulatorState>>, config: &IntegrationTestConfig) -> Option<u64> {
    let start = Instant::now();
    loop {
        if !emulator_is_running(state) {
            return None;
        }
        if health_check(config) {
            return Some(start.elapsed().as_secs());
        }
        let elapsed = start.elapsed().as_secs();
        if elapsed >= config.wait_timeout_secs {
            return None;
        }
        println!("   Waiting... ({elapsed}s elapsed)");
        thread::sleep(Duration::from_secs(config.wait_interval_secs));
    }
}

fn emulator_is_running(state: &Arc<Mutex<EmulatorState>>) -> bool {
    let mut guard = state.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(emulator) = guard.handle.as_mut() {
        return !emulator.has_exited();
    }
    false
}

fn health_check(config: &IntegrationTestConfig) -> bool {
    let status = Command::new(config.health_check_command.as_str())
        .args(["-s", "-f", config.health_check_url.as_str()])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false);
    status
}

fn cleanup_with_state(state: &Arc<Mutex<EmulatorState>>) {
    let mut out = io::stdout().lock();
    let mut guard = state.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(mut emulator) = guard.handle.take() {
        writeln!(
            out,
            "\n🧹 Tearing down emulators (PID {})...",
            emulator.pid()
        )
        .ok();
        emulator.stop();
        writeln!(out, "✅ Emulators stopped.").ok();
        let _ = out.flush();
    }
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

fn parse_bool_env(name: &str, fallback: bool) -> bool {
    env::var(name)
        .ok()
        .map(|raw| raw == "1" || raw.eq_ignore_ascii_case("true"))
        .unwrap_or(fallback)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_uses_defaults() {
        let config = IntegrationTestConfig::from_env();
        assert_eq!(config.build_command, DEFAULT_BUILD_COMMAND);
        assert_eq!(config.test_command, DEFAULT_TEST_COMMAND);
        assert_eq!(config.emulator_command, DEFAULT_EMULATOR_COMMAND);
        assert_eq!(config.health_check_command, DEFAULT_HEALTH_CHECK_COMMAND);
        assert_eq!(config.health_check_url, DEFAULT_HEALTH_URL);
    }

    #[test]
    fn parse_u64_env_uses_default_on_bad_input() {
        env::set_var("BRAD_IT_WAIT_TIMEOUT_SECS", "not-a-number");
        assert_eq!(parse_u64_env("BRAD_IT_WAIT_TIMEOUT_SECS", 7), 7);
    }

    #[test]
    fn parse_bool_env_works_for_true_inputs() {
        env::set_var("BRAD_IT_DISABLE_SETSID", "true");
        assert!(parse_bool_env("BRAD_IT_DISABLE_SETSID", false));
        env::set_var("BRAD_IT_DISABLE_SETSID", "1");
        assert!(parse_bool_env("BRAD_IT_DISABLE_SETSID", false));
    }
}
