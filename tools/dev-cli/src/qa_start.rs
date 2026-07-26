pub mod args;
pub mod otel;
pub mod ports;
pub mod simulator;
pub mod state;

use crate::qa_process::{
    is_owned_process, is_process_running, listener_pids, read_pid_file, terminate_owned_process,
    QaProcessIdentity, TerminationOutcome, API_COMMAND_MARKER, OTEL_COMMAND_MARKER,
};
use crate::qa_start::otel as otel_mod;
use crate::qa_start::{
    args::{parse_args, ParsedArgs, USAGE},
    state::QaState,
};
use crate::runner::{
    read_lines_tail, run_output, run_status, run_to_file_detach, CommandResult, RealCommandRunner,
};
use std::env;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::thread::sleep;
use std::time::{Duration, Instant};

pub fn run(raw_args: &[String], root_dir: &Path, qa_state_root: &Path) -> io::Result<()> {
    let (args, show_help) = match parse_args(raw_args) {
        Ok((args, show_help)) => (args, show_help),
        Err(error) => {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                error.to_string(),
            ));
        }
    };
    if show_help {
        print_usage();
        return Ok(());
    }

    let session_id = args
        .session_id
        .clone()
        .or_else(|| env::var("SESSION_ID").ok())
        .unwrap_or_else(|| {
            let generated =
                ports::default_session_id(root_dir).unwrap_or_else(|_| "worktree-0000".to_string());
            println!("No --id provided. Using worktree session id: {generated}");
            generated
        });

    let sanitized_session = ports::sanitize_id(&session_id);
    if sanitized_session.is_empty() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Session ID resolved to empty value after sanitization.",
        ));
    }

    let project_id = args
        .project_id
        .clone()
        .unwrap_or_else(|| "brad-os".to_string());

    let session_dir = qa_state_root.join("sessions").join(&sanitized_session);
    let device_locks_dir = qa_state_root.join("device-locks");
    let log_dir = session_dir.join("logs");
    let pid_dir = session_dir.join("pids");
    let otel_dir = session_dir.join("otel");
    let state_file = session_dir.join("state.env");
    let worktree_link = session_dir.join("worktree-root");
    let api_log = log_dir.join("api.log");
    let otel_log = log_dir.join("otel.log");
    let api_pid_file = pid_dir.join("api.pid");
    let otel_pid_file = pid_dir.join("otel.pid");

    fs::create_dir_all(&log_dir)?;
    fs::create_dir_all(&pid_dir)?;
    fs::create_dir_all(&otel_dir)?;
    fs::create_dir_all(&device_locks_dir)?;

    if args.fresh {
        clear_dir_contents(&otel_dir)?;
        clear_dir_contents(&log_dir)?;
    }

    create_worktree_link(root_dir, &worktree_link)?;

    let existing_state = QaState::from_file(&state_file).unwrap_or_default();
    let ports = existing_state.api_port.map_or_else(
        || ports::Ports::derive(&sanitized_session),
        |api| {
            Ok(ports::Ports {
                api,
                otel: existing_state.otel_port.unwrap_or(api + 1),
            })
        },
    )?;

    let mut lock_guard = SimLockGuard::new(None, false);
    let mut process_guard = StartupProcessGuard::new();

    if args.start_api {
        start_api(
            &sanitized_session,
            &project_id,
            ports.api,
            root_dir,
            &api_log,
            &api_pid_file,
            args.timeout_seconds,
            &mut process_guard,
        )?;
    }

    if args.start_otel {
        start_otel(
            &sanitized_session,
            ports.otel,
            &otel_dir,
            &otel_log,
            &otel_pid_file,
            args.timeout_seconds,
            root_dir,
            &mut process_guard,
        )?;
    }

    let (simulator_udid, simulator_name, simulator_lock_dir, acquired_lock): (
        Option<String>,
        Option<String>,
        Option<PathBuf>,
        bool,
    ) = if args.setup_simulator {
        lease_and_boot(
            &args,
            &sanitized_session,
            &existing_state,
            &device_locks_dir,
            root_dir,
            ports.api,
            ports.otel,
        )?
    } else {
        (
            existing_state.simulator_udid,
            existing_state.simulator_name,
            existing_state.simulator_lock_dir.map(PathBuf::from),
            false,
        )
    };

    lock_guard.release = acquired_lock;
    lock_guard.path = simulator_lock_dir.clone();

    let final_state = QaState {
        qa_state_root: Some(qa_state_root.to_string_lossy().to_string()),
        worktree_root: Some(root_dir.to_string_lossy().to_string()),
        session_id: Some(sanitized_session.clone()),
        project_id: Some(project_id),
        api_port: Some(ports.api),
        otel_port: Some(ports.otel),
        simulator_udid,
        simulator_name,
        simulator_lock_dir: simulator_lock_dir
            .map(|path: PathBuf| path.to_string_lossy().to_string()),
        api_log: Some(api_log.to_string_lossy().to_string()),
        otel_log: Some(otel_log.to_string_lossy().to_string()),
        api_pid_file: Some(api_pid_file.to_string_lossy().to_string()),
        otel_pid_file: Some(otel_pid_file.to_string_lossy().to_string()),
    };
    persist_state_and_retain_lease(&final_state, &state_file, &mut lock_guard)?;
    process_guard.disarm();

    print_summary(
        &sanitized_session,
        &final_state.project_id.clone().unwrap_or_default(),
        final_state.simulator_name.as_deref(),
        final_state.simulator_udid.as_deref(),
        &ports,
        qa_state_root,
        &state_file,
    );

    Ok(())
}

pub fn print_usage() {
    println!("{USAGE}");
}

fn clear_dir_contents(path: &Path) -> io::Result<()> {
    if !path.exists() {
        return Ok(());
    }

    for entry in fs::read_dir(path)? {
        let entry = entry?;
        if entry.path().is_dir() {
            fs::remove_dir_all(entry.path())?;
        } else {
            fs::remove_file(entry.path())?;
        }
    }
    Ok(())
}

fn create_worktree_link(root_dir: &Path, link_path: &Path) -> io::Result<()> {
    if link_path.exists() {
        let _ = fs::remove_file(link_path);
        let _ = fs::remove_dir_all(link_path);
    }

    #[cfg(unix)]
    {
        return std::os::unix::fs::symlink(root_dir, link_path);
    }

    #[cfg(not(unix))]
    {
        Err(io::Error::new(
            io::ErrorKind::Unsupported,
            "symlink unsupported on this platform",
        ))
    }
}

const OPTIONAL_FEATURE_SECRETS: [&str; 4] = [
    "OPENAI_API_KEY",
    "STRAVA_CLIENT_ID",
    "STRAVA_CLIENT_SECRET",
    "STRAVA_WEBHOOK_VERIFY_TOKEN",
];

fn start_api(
    sanitized_session: &str,
    project_id: &str,
    port: u16,
    root_dir: &Path,
    api_log: &Path,
    api_pid_file: &Path,
    timeout_seconds: u64,
    process_guard: &mut StartupProcessGuard,
) -> io::Result<()> {
    let health_url = api_health_url(port);
    let runner = RealCommandRunner;
    let identity = QaProcessIdentity::new(root_dir, API_COMMAND_MARKER);
    let stored_pid = read_pid_file(api_pid_file);
    let listeners = listener_pids(&runner, port)?;
    let stored_pid_running = stored_pid.is_some_and(|pid| is_process_running(&runner, pid));
    let stored_pid_owned = stored_pid.is_some_and(|pid| is_owned_process(&runner, pid, &identity));
    let action = plan_api_startup(
        stored_pid,
        &listeners,
        stored_pid_running,
        stored_pid_owned,
        is_http_ok(&health_url),
    );

    match &action {
        ApiStartupAction::RefuseOccupied(occupied_pids) => {
            return Err(io::Error::new(
                io::ErrorKind::AddrInUse,
                format!(
                    "API port {port} is occupied by unowned process(es): {}. \
                     Stop them explicitly or choose a different QA session.",
                    format_pids(occupied_pids)
                ),
            ));
        }
        ApiStartupAction::StopOwned(pid) => {
            let outcome =
                terminate_owned_process(&runner, *pid, &identity, &|duration| sleep(duration));
            if outcome == TerminationOutcome::RefusedUnowned {
                return Err(io::Error::new(
                    io::ErrorKind::PermissionDenied,
                    format!(
                        "Refused to stop pid {pid}: it no longer matches this QA session's API."
                    ),
                ));
            }
            remove_pid_file_if_matches(api_pid_file, *pid);
            let remaining = listener_pids(&runner, port)?;
            if !remaining.is_empty() {
                return Err(io::Error::new(
                    io::ErrorKind::AddrInUse,
                    format!(
                        "API port {port} remained occupied after stopping the owned process: {}.",
                        format_pids(&remaining)
                    ),
                ));
            }
        }
        ApiStartupAction::StartFresh => {
            let _ = fs::remove_file(api_pid_file);
        }
        ApiStartupAction::Reuse(_) => {}
    }

    println!("Building standalone API...");
    let build_status = run_status(
        "npm",
        &["run", "build", "-w", "@brad-os/functions"],
        Some(root_dir),
        &[],
    )?;
    if build_status != 0 {
        return Err(io::Error::other(format!(
            "Standalone API build failed with exit code {build_status}"
        )));
    }
    run_dev_firestore_preflight(project_id, root_dir)?;

    if let ApiStartupAction::Reuse(pid) = action {
        println!("Standalone API already running for {sanitized_session} (pid {pid}).");
        return Ok(());
    }

    let api_environment = build_api_environment(
        project_id,
        port,
        resolve_optional_feature_secrets(project_id),
    );
    let environment_refs = api_environment
        .iter()
        .map(|(key, value)| (key.as_str(), value.as_str()))
        .collect::<Vec<_>>();

    println!("Starting standalone API for {sanitized_session}...");
    let pid = run_to_file_detach(
        "nohup",
        &["node", "packages/functions/lib/server.js"],
        Some(root_dir),
        &environment_refs,
        &[
            "FIREBASE_CONFIG",
            "FIRESTORE_EMULATOR_HOST",
            "FUNCTIONS_EMULATOR",
        ],
        api_log,
    )?;
    process_guard.track(SpawnedProcess {
        pid,
        pid_file: api_pid_file.to_path_buf(),
        identity,
    });
    fs::write(api_pid_file, format!("{pid}\n"))?;

    if let Err(error) = wait_for_http_ok("Standalone API", &health_url, pid, timeout_seconds) {
        let _ = write_log_tail(api_log, 40);
        return Err(error);
    }

    let ready_listeners = listener_pids(&runner, port)?;
    if ready_listeners != [pid] {
        return Err(io::Error::other(format!(
            "Standalone API pid {pid} did not exclusively own port {port}; listeners: {}.",
            format_pids(&ready_listeners)
        )));
    }

    Ok(())
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum ApiStartupAction {
    Reuse(u32),
    StopOwned(u32),
    StartFresh,
    RefuseOccupied(Vec<u32>),
}

fn plan_api_startup(
    stored_pid: Option<u32>,
    listener_pids: &[u32],
    stored_pid_running: bool,
    stored_pid_owned: bool,
    health_ok: bool,
) -> ApiStartupAction {
    if !listener_pids.is_empty() {
        if let Some(pid) = stored_pid {
            if listener_is_exclusively_owned(
                Some(pid),
                listener_pids,
                stored_pid_running,
                stored_pid_owned,
            ) {
                return if health_ok {
                    ApiStartupAction::Reuse(pid)
                } else {
                    ApiStartupAction::StopOwned(pid)
                };
            }
        }
        return ApiStartupAction::RefuseOccupied(listener_pids.to_vec());
    }

    match stored_pid {
        Some(pid) if stored_pid_running && stored_pid_owned => ApiStartupAction::StopOwned(pid),
        _ => ApiStartupAction::StartFresh,
    }
}

fn listener_is_exclusively_owned(
    stored_pid: Option<u32>,
    listener_pids: &[u32],
    stored_pid_running: bool,
    stored_pid_owned: bool,
) -> bool {
    stored_pid.is_some_and(|pid| listener_pids == [pid] && stored_pid_running && stored_pid_owned)
}

fn format_pids(pids: &[u32]) -> String {
    if pids.is_empty() {
        return "none".to_string();
    }
    pids.iter()
        .map(u32::to_string)
        .collect::<Vec<_>>()
        .join(", ")
}

fn remove_pid_file_if_matches(pid_file: &Path, expected_pid: u32) {
    if read_pid_file(pid_file) == Some(expected_pid) {
        let _ = fs::remove_file(pid_file);
    }
}

fn run_dev_firestore_preflight(project_id: &str, root_dir: &Path) -> io::Result<()> {
    let output = Command::new("node")
        .arg("packages/functions/lib/runtime/dev-firestore-preflight.js")
        .current_dir(root_dir)
        .env("GOOGLE_CLOUD_PROJECT", project_id)
        .env("GCLOUD_PROJECT", project_id)
        .env_remove("FIREBASE_CONFIG")
        .env_remove("FIRESTORE_EMULATOR_HOST")
        .env_remove("FUNCTIONS_EMULATOR")
        .output()?;
    let combined = String::from_utf8_lossy(&output.stdout).to_string()
        + &String::from_utf8_lossy(&output.stderr);
    evaluate_dev_firestore_preflight(CommandResult {
        status: output.status.code().unwrap_or(1),
        stdout: combined,
    })?;
    println!("  [ok] Real development Firestore access verified.");
    Ok(())
}

fn evaluate_dev_firestore_preflight(result: CommandResult) -> io::Result<()> {
    if result.success() {
        return Ok(());
    }

    let detail = result.stdout.trim();
    Err(io::Error::new(
        io::ErrorKind::PermissionDenied,
        if detail.is_empty() {
            "Real development Firestore preflight failed. Run `gcloud auth application-default login`, then retry QA startup.".to_string()
        } else {
            detail.to_string()
        },
    ))
}

fn build_api_environment(
    project_id: &str,
    port: u16,
    optional_secrets: Vec<(String, String)>,
) -> Vec<(String, String)> {
    let mut environment = vec![
        ("PORT".to_string(), port.to_string()),
        ("GOOGLE_CLOUD_PROJECT".to_string(), project_id.to_string()),
        ("GCLOUD_PROJECT".to_string(), project_id.to_string()),
        ("BRAD_LOCAL_DEV_ONLY".to_string(), "true".to_string()),
        ("NODE_ENV".to_string(), "development".to_string()),
        ("APP_CHECK_BYPASS".to_string(), "false".to_string()),
    ];
    environment.extend(optional_secrets);
    environment
}

fn api_health_url(port: u16) -> String {
    format!("http://127.0.0.1:{port}/api/dev/health")
}

fn resolve_optional_feature_secrets(project_id: &str) -> Vec<(String, String)> {
    OPTIONAL_FEATURE_SECRETS
        .iter()
        .filter_map(|name| {
            if let Ok(value) = env::var(name) {
                if !value.is_empty() {
                    return Some(((*name).to_string(), value));
                }
            }

            let output = Command::new("gcloud")
                .args([
                    "secrets",
                    "versions",
                    "access",
                    "latest",
                    "--secret",
                    name,
                    "--project",
                    project_id,
                    "--quiet",
                ])
                .output();
            match output {
                Ok(result) if result.status.success() && !result.stdout.is_empty() => {
                    let value = String::from_utf8_lossy(&result.stdout).trim().to_string();
                    (!value.is_empty()).then(|| ((*name).to_string(), value))
                }
                _ => {
                    println!(
                        "  [warn] Optional secret {name} is unavailable; its dependent local routes may fail."
                    );
                    None
                }
            }
        })
        .collect()
}

fn start_otel(
    sanitized_session: &str,
    port: u16,
    otel_dir: &Path,
    otel_log: &Path,
    otel_pid_file: &Path,
    timeout_seconds: u64,
    root_dir: &Path,
    process_guard: &mut StartupProcessGuard,
) -> io::Result<()> {
    let runner = RealCommandRunner;
    let identity = QaProcessIdentity::new(root_dir, OTEL_COMMAND_MARKER);
    let stored_pid = read_pid_file(otel_pid_file);
    let listeners = listener_pids(&runner, port)?;

    if !listeners.is_empty() {
        if let Some(pid) = stored_pid {
            if listener_is_exclusively_owned(
                Some(pid),
                &listeners,
                is_process_running(&runner, pid),
                is_owned_process(&runner, pid, &identity),
            ) {
                println!("OTel collector already running for {sanitized_session} (pid {pid}).");
                return Ok(());
            }
        }

        return Err(io::Error::new(
            io::ErrorKind::AddrInUse,
            format!(
                "OTel port {port} is occupied by unowned process(es): {}. \
                 Stop them explicitly or choose a different QA session.",
                format_pids(&listeners)
            ),
        ));
    }

    if let Some(pid) = stored_pid {
        if is_process_running(&runner, pid) && is_owned_process(&runner, pid, &identity) {
            let outcome =
                terminate_owned_process(&runner, pid, &identity, &|duration| sleep(duration));
            if outcome == TerminationOutcome::RefusedUnowned {
                return Err(io::Error::new(
                    io::ErrorKind::PermissionDenied,
                    format!(
                        "Refused to stop pid {pid}: it no longer matches this QA session's OTel collector."
                    ),
                ));
            }
        }
        remove_pid_file_if_matches(otel_pid_file, pid);
    } else {
        let _ = fs::remove_file(otel_pid_file);
    }

    println!("Starting OTel collector for {sanitized_session}...");
    let config = otel_mod::OTelConfig {
        collector_port: port,
        output_dir: otel_dir.to_path_buf(),
    };
    let collector_port = config.collector_port.to_string();
    let output_dir = config.output_dir.to_string_lossy().to_string();
    let tsx_program = root_dir
        .join("node_modules")
        .join(".bin")
        .join("tsx")
        .to_string_lossy()
        .into_owned();
    let pid = run_to_file_detach(
        &tsx_program,
        &["scripts/otel-collector/index.ts"],
        Some(root_dir),
        &[
            ("OTEL_COLLECTOR_PORT", collector_port.as_str()),
            ("OTEL_OUTPUT_DIR", output_dir.as_str()),
        ],
        &[],
        otel_log,
    )?;
    process_guard.track(SpawnedProcess {
        pid,
        pid_file: otel_pid_file.to_path_buf(),
        identity,
    });
    fs::write(otel_pid_file, format!("{pid}\n"))?;

    if let Err(error) = wait_for_port_listener("OTel collector", port, pid, timeout_seconds) {
        let _ = write_log_tail(otel_log, 40);
        return Err(error);
    }

    let ready_listeners = listener_pids(&runner, port)?;
    if ready_listeners != [pid] {
        return Err(io::Error::other(format!(
            "OTel collector pid {pid} did not exclusively own port {port}; listeners: {}.",
            format_pids(&ready_listeners)
        )));
    }

    Ok(())
}

fn write_log_tail(path: &Path, max_lines: usize) -> io::Result<()> {
    let lines = read_lines_tail(path, max_lines)?;
    for line in lines {
        println!("  {line}");
    }
    Ok(())
}

fn wait_for_http_ok(label: &str, url: &str, pid: u32, timeout_seconds: u64) -> io::Result<()> {
    wait_for_readiness(
        label,
        &format!("{label} at {url}"),
        pid,
        timeout_seconds,
        || is_http_ok(url),
    )
}

fn wait_for_port_listener(
    label: &str,
    port: u16,
    pid: u32,
    timeout_seconds: u64,
) -> io::Result<()> {
    wait_for_readiness(
        label,
        &format!("{label} on port {port}"),
        pid,
        timeout_seconds,
        || is_port_listening(port),
    )
}

fn wait_for_readiness<F>(
    label: &str,
    target: &str,
    pid: u32,
    timeout_seconds: u64,
    mut ready: F,
) -> io::Result<()>
where
    F: FnMut() -> bool,
{
    wait_for_readiness_with_process(
        label,
        target,
        timeout_seconds,
        &mut ready,
        &mut || crate::runner::is_process_running(pid),
        &mut |duration| sleep(duration),
    )
}

fn wait_for_readiness_with_process<F, P, S>(
    label: &str,
    target: &str,
    timeout_seconds: u64,
    ready: &mut F,
    process_running: &mut P,
    sleep_for: &mut S,
) -> io::Result<()>
where
    F: FnMut() -> bool,
    P: FnMut() -> bool,
    S: FnMut(Duration),
{
    let start = Instant::now();

    loop {
        if !process_running() {
            return Err(io::Error::new(
                io::ErrorKind::BrokenPipe,
                format!("{label} process exited before readiness at {target}"),
            ));
        }

        if ready() {
            if !process_running() {
                return Err(io::Error::new(
                    io::ErrorKind::BrokenPipe,
                    format!("{label} process exited while becoming ready at {target}"),
                ));
            }
            println!("  [ok] {target} is ready");
            return Ok(());
        }

        let elapsed = start.elapsed().as_secs();
        if elapsed >= timeout_seconds {
            return Err(io::Error::new(
                io::ErrorKind::TimedOut,
                format!("Timeout waiting for {target}"),
            ));
        }

        if elapsed % 10 == 0 {
            println!("  [wait] {label} not ready yet ({elapsed}s elapsed)");
        }
        sleep_for(Duration::from_secs(1));
    }
}

fn is_http_ok(url: &str) -> bool {
    run_status("curl", &["-s", "-f", url], None, &[]).is_ok_and(|code| code == 0)
}

fn is_port_listening(port: u16) -> bool {
    run_status(
        "lsof",
        &["-nP", &format!("-iTCP:{port}"), "-sTCP:LISTEN"],
        None,
        &[],
    )
    .is_ok_and(|code| code == 0)
}

fn lease_and_boot(
    args: &ParsedArgs,
    sanitized_session: &str,
    existing_state: &QaState,
    device_locks_dir: &Path,
    root_dir: &Path,
    api_port: u16,
    otel_port: u16,
) -> io::Result<(Option<String>, Option<String>, Option<PathBuf>, bool)> {
    let available = run_output(
        "xcrun",
        &["simctl", "list", "devices", "available"],
        Some(root_dir),
        &[],
    )?;
    let available_output = available.stdout;

    if let (Some(existing_udid), Some(existing_lock)) = (
        existing_state.simulator_udid.as_ref(),
        existing_state.simulator_lock_dir.as_ref(),
    ) {
        let lock_owner = fs::read_to_string(Path::new(existing_lock).join("session"))
            .unwrap_or_default()
            .trim()
            .to_string();

        if lock_owner == sanitized_session
            && Path::new(existing_lock).exists()
            && simulator::name_for_udid(&available_output, existing_udid).is_some()
        {
            return Ok((
                Some(existing_udid.clone()),
                simulator::name_for_udid(&available_output, existing_udid),
                Some(PathBuf::from(existing_lock)),
                false,
            ));
        }
    }

    let (name, udid, lock): (String, String, String) = simulator::choose_simulator(
        args.device_request.as_deref(),
        &available_output,
        device_locks_dir,
        sanitized_session,
    )?;

    let _ = run_status("xcrun", &["simctl", "boot", &udid], Some(root_dir), &[]);
    let _ = run_status(
        "xcrun",
        &["simctl", "bootstatus", &udid, "-b"],
        Some(root_dir),
        &[],
    );
    let _ = run_status(
        "xcrun",
        &[
            "simctl",
            "spawn",
            &udid,
            "launchctl",
            "setenv",
            "BRAD_OS_API_URL",
            &format!("http://127.0.0.1:{api_port}/api/dev"),
        ],
        Some(root_dir),
        &[],
    )?;
    let _ = run_status(
        "xcrun",
        &[
            "simctl",
            "spawn",
            &udid,
            "launchctl",
            "setenv",
            "BRAD_OS_OTEL_BASE_URL",
            &format!("http://127.0.0.1:{otel_port}"),
        ],
        Some(root_dir),
        &[],
    )?;
    let _ = run_status(
        "xcrun",
        &[
            "simctl",
            "spawn",
            &udid,
            "launchctl",
            "setenv",
            "BRAD_OS_QA_ID",
            sanitized_session,
        ],
        Some(root_dir),
        &[],
    )?;
    Ok((Some(udid), Some(name), Some(PathBuf::from(lock)), true))
}

fn print_summary(
    sanitized_session: &str,
    project_id: &str,
    simulator_name: Option<&str>,
    simulator_udid: Option<&str>,
    ports: &ports::Ports,
    qa_state_root: &Path,
    state_file: &Path,
) {
    println!();
    println!("QA environment ready:");
    println!("  Session ID:    {sanitized_session}");
    println!("  Project ID:    {project_id}");
    println!("  API Base URL:  http://127.0.0.1:{}/api/dev", ports.api);
    println!("  OTel Base URL: http://127.0.0.1:{}", ports.otel);
    println!(
        "  Simulator:     {} ({})",
        simulator_name.unwrap_or("n/a"),
        simulator_udid.unwrap_or("not configured")
    );
    println!("  Shared state:  {}", qa_state_root.to_string_lossy());
    println!("  State file:    {}", state_file.to_string_lossy());
    println!();
    println!("Next commands:");
    println!("  npm run qa:build -- --id {sanitized_session}");
    println!("  npm run qa:launch -- --id {sanitized_session}");
    println!("  npm run qa:start -- --id {sanitized_session}");
}

struct SimLockGuard {
    path: Option<PathBuf>,
    release: bool,
}

impl SimLockGuard {
    fn new(path: Option<PathBuf>, release: bool) -> Self {
        Self { path, release }
    }

    fn disarm(&mut self) {
        self.release = false;
    }
}

impl Drop for SimLockGuard {
    fn drop(&mut self) {
        if !self.release {
            return;
        }

        if let Some(path) = self.path.as_ref() {
            let _ = fs::remove_file(path.join("session"));
            let _ = fs::remove_dir(path);
        }
    }
}

#[derive(Debug)]
struct SpawnedProcess {
    pid: u32,
    pid_file: PathBuf,
    identity: QaProcessIdentity,
}

struct StartupProcessGuard {
    processes: Vec<SpawnedProcess>,
    rollback: bool,
}

impl StartupProcessGuard {
    fn new() -> Self {
        Self {
            processes: Vec::new(),
            rollback: true,
        }
    }

    fn track(&mut self, process: SpawnedProcess) {
        self.processes.push(process);
    }

    fn disarm(&mut self) {
        self.rollback = false;
    }
}

impl Drop for StartupProcessGuard {
    fn drop(&mut self) {
        if !self.rollback {
            return;
        }

        let runner = RealCommandRunner;
        for process in self.processes.iter().rev() {
            let _ = terminate_owned_process(&runner, process.pid, &process.identity, &|duration| {
                sleep(duration)
            });
            remove_pid_file_if_matches(&process.pid_file, process.pid);
        }
    }
}

fn persist_state_and_retain_lease(
    state: &QaState,
    state_file: &Path,
    lock_guard: &mut SimLockGuard,
) -> io::Result<()> {
    state.write_to_file(state_file)?;
    lock_guard.disarm();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn args_of(parts: &[&str]) -> Vec<String> {
        parts.iter().map(|value| value.to_string()).collect()
    }

    #[test]
    fn prints_usage() {
        assert!(USAGE.contains("--help"));
        assert!(USAGE.contains("--no-api"));
        assert!(!USAGE.contains("Firebase emulator"));
    }

    #[test]
    fn api_health_uses_the_development_router() {
        assert_eq!(
            api_health_url(15_123),
            "http://127.0.0.1:15123/api/dev/health"
        );
    }

    #[test]
    fn local_api_environment_is_real_dev_and_app_check_safe() {
        let environment = build_api_environment(
            "brad-os",
            15_123,
            vec![("OPENAI_API_KEY".to_string(), "redacted".to_string())],
        )
        .into_iter()
        .collect::<std::collections::HashMap<_, _>>();

        assert_eq!(environment.get("PORT").map(String::as_str), Some("15123"));
        assert_eq!(
            environment.get("GOOGLE_CLOUD_PROJECT").map(String::as_str),
            Some("brad-os")
        );
        assert_eq!(
            environment.get("BRAD_LOCAL_DEV_ONLY").map(String::as_str),
            Some("true")
        );
        assert_eq!(
            environment.get("APP_CHECK_BYPASS").map(String::as_str),
            Some("false")
        );
        assert!(!environment.contains_key("FIRESTORE_EMULATOR_HOST"));
        assert_eq!(
            environment.get("OPENAI_API_KEY").map(String::as_str),
            Some("redacted")
        );
    }

    #[test]
    fn occupied_api_port_without_owned_pid_is_refused() {
        assert_eq!(
            plan_api_startup(None, &[456], false, false, true),
            ApiStartupAction::RefuseOccupied(vec![456])
        );
        assert_eq!(
            plan_api_startup(Some(123), &[456], true, true, true),
            ApiStartupAction::RefuseOccupied(vec![456])
        );
    }

    #[test]
    fn stale_unowned_pid_on_free_port_is_ignored_without_kill() {
        assert_eq!(
            plan_api_startup(Some(123), &[], true, false, false),
            ApiStartupAction::StartFresh
        );
    }

    #[test]
    fn owned_api_pid_is_reused_only_when_healthy_and_listening() {
        assert_eq!(
            plan_api_startup(Some(123), &[123], true, true, true),
            ApiStartupAction::Reuse(123)
        );
        assert_eq!(
            plan_api_startup(Some(123), &[123], true, true, false),
            ApiStartupAction::StopOwned(123)
        );
    }

    #[test]
    fn listener_reuse_requires_the_stored_pid_to_own_the_port_exclusively() {
        assert!(listener_is_exclusively_owned(Some(123), &[123], true, true));
        assert!(!listener_is_exclusively_owned(
            Some(123),
            &[456],
            true,
            true
        ));
        assert!(!listener_is_exclusively_owned(
            Some(123),
            &[123, 456],
            true,
            true
        ));
    }

    #[test]
    fn readiness_fails_if_spawned_process_exits_at_ready_boundary() {
        let mut process_states = vec![false, true].into_iter();
        let error = wait_for_readiness_with_process(
            "Standalone API",
            "Standalone API at http://127.0.0.1:15000/api/dev/health",
            1,
            &mut || true,
            &mut || process_states.next_back().unwrap_or(false),
            &mut |_| {},
        )
        .expect_err("process exited");

        assert_eq!(error.kind(), io::ErrorKind::BrokenPipe);
        assert!(error.to_string().contains("while becoming ready"));
    }

    #[test]
    fn failed_preflight_surfaces_adc_remediation() {
        let error = evaluate_dev_firestore_preflight(CommandResult {
            status: 1,
            stdout: "Real development Firestore preflight failed.\nRun `gcloud auth application-default login`, then retry QA startup.\n".to_string(),
        })
        .expect_err("preflight");

        assert_eq!(error.kind(), io::ErrorKind::PermissionDenied);
        assert!(error
            .to_string()
            .contains("gcloud auth application-default login"));
    }

    #[test]
    fn error_parse_path() {
        assert!(parse_args(&args_of(&["--timeout", "not-a-number"]))
            .expect_err("invalid timeout")
            .to_string()
            .starts_with("--timeout"));
    }

    #[test]
    fn default_state_writes_without_services() -> io::Result<()> {
        let root = tempdir()?;
        let qa_root = tempdir()?;
        fs::create_dir_all(root.path())?;
        run(
            &args_of(&[
                "--id",
                "demo-session",
                "--no-api",
                "--no-otel",
                "--no-simulator",
            ]),
            root.path(),
            qa_root.path(),
        )?;

        let state_file = qa_root
            .path()
            .join("sessions")
            .join("demo-session")
            .join("state.env");
        let state = QaState::from_file(&state_file)?;
        assert_eq!(state.project_id, Some("brad-os".to_string()));
        assert_eq!(state.simulator_udid, None);
        assert!(state.api_port.is_some());
        Ok(())
    }

    #[test]
    fn successful_state_write_retains_simulator_lease() -> io::Result<()> {
        let root = tempdir()?;
        let lock_dir = root.path().join("device.lock");
        fs::create_dir_all(&lock_dir)?;
        fs::write(lock_dir.join("session"), "demo\n")?;
        let state_file = root.path().join("state.env");
        let state = QaState {
            session_id: Some("demo".to_string()),
            ..QaState::default()
        };

        {
            let mut guard = SimLockGuard::new(Some(lock_dir.clone()), true);
            persist_state_and_retain_lease(&state, &state_file, &mut guard)?;
        }

        assert!(lock_dir.join("session").is_file());
        assert_eq!(
            QaState::from_file(&state_file)?.session_id.as_deref(),
            Some("demo")
        );
        Ok(())
    }

    #[test]
    fn failed_state_write_releases_new_simulator_lease() -> io::Result<()> {
        let root = tempdir()?;
        let lock_dir = root.path().join("device.lock");
        fs::create_dir_all(&lock_dir)?;
        fs::write(lock_dir.join("session"), "demo\n")?;
        let invalid_state_file = root.path().join("state-directory");
        fs::create_dir_all(&invalid_state_file)?;

        {
            let mut guard = SimLockGuard::new(Some(lock_dir.clone()), true);
            assert!(persist_state_and_retain_lease(
                &QaState::default(),
                &invalid_state_file,
                &mut guard
            )
            .is_err());
        }

        assert!(!lock_dir.exists());
        Ok(())
    }

    #[test]
    fn startup_rollback_removes_tracked_stale_pid_file() -> io::Result<()> {
        let root = tempdir()?;
        let pid_file = root.path().join("api.pid");
        fs::write(&pid_file, "999999999\n")?;

        {
            let mut guard = StartupProcessGuard::new();
            guard.track(SpawnedProcess {
                pid: 999_999_999,
                pid_file: pid_file.clone(),
                identity: QaProcessIdentity::new(root.path(), API_COMMAND_MARKER),
            });
        }

        assert!(!pid_file.exists());
        Ok(())
    }
}
