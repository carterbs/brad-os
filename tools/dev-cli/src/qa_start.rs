pub mod args;
pub mod firebase;
pub mod otel;
pub mod ports;
pub mod simulator;
pub mod state;

use crate::qa_start::{
    args::{parse_args, ParsedArgs, USAGE},
    state::QaState,
};
use crate::qa_start::otel as otel_mod;
use crate::runner::{read_lines_tail, run_output, run_status, run_to_file_detach};
use std::env;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::thread::sleep;
use std::time::{Duration, Instant};

pub fn run(raw_args: &[String], root_dir: &Path, qa_state_root: &Path) -> io::Result<()> {
    let (args, show_help) = match parse_args(raw_args) {
        Ok((args, show_help)) => (args, show_help),
        Err(error) => {
            return Err(io::Error::new(io::ErrorKind::InvalidInput, error.to_string()));
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
            let generated = ports::default_session_id(root_dir).unwrap_or_else(|_| {
                "worktree-0000".to_string()
            });
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
        .unwrap_or_else(|| format!("brad-os-{sanitized_session}"));

    let session_dir = qa_state_root.join("sessions").join(&sanitized_session);
    let device_locks_dir = qa_state_root.join("device-locks");
    let log_dir = session_dir.join("logs");
    let pid_dir = session_dir.join("pids");
    let data_dir = session_dir.join("data");
    let otel_dir = session_dir.join("otel");
    let state_file = session_dir.join("state.env");
    let worktree_link = session_dir.join("worktree-root");
    let firebase_log = log_dir.join("firebase.log");
    let otel_log = log_dir.join("otel.log");
    let firebase_pid_file = pid_dir.join("firebase.pid");
    let otel_pid_file = pid_dir.join("otel.pid");
    let firebase_config = session_dir.join("firebase.json");

    fs::create_dir_all(&log_dir)?;
    fs::create_dir_all(&pid_dir)?;
    fs::create_dir_all(&data_dir)?;
    fs::create_dir_all(&otel_dir)?;
    fs::create_dir_all(&device_locks_dir)?;

    if args.fresh {
        clear_dir_contents(&data_dir)?;
        clear_dir_contents(&otel_dir)?;
        clear_dir_contents(&log_dir)?;
    }

    create_worktree_link(root_dir, &worktree_link)?;

    let existing_state = QaState::from_file(&state_file).unwrap_or_default();
    let ports = existing_state.functions_port.map_or_else(
        || ports::Ports::derive(&sanitized_session),
        |functions| {
            Ok(ports::Ports {
                functions,
                hosting: existing_state.hosting_port.unwrap_or(functions + 1),
                firestore: existing_state.firestore_port.unwrap_or(functions + 2),
                ui: existing_state.ui_port.unwrap_or(functions + 3),
                otel: existing_state.otel_port.unwrap_or(functions + 4),
                hub: existing_state.hub_port.unwrap_or(functions + 5),
                logging: existing_state.logging_port.unwrap_or(functions + 6),
            })
        },
    )?;

    let mut lock_guard = SimLockGuard::new(None, false);

    if args.start_firebase {
        start_firebase(
            &sanitized_session,
            &project_id,
            &ports,
            root_dir,
            &firebase_config,
            &data_dir,
            &firebase_log,
            &firebase_pid_file,
            args.timeout_seconds,
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
            ports.hosting,
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
        functions_port: Some(ports.functions),
        hosting_port: Some(ports.hosting),
        firestore_port: Some(ports.firestore),
        ui_port: Some(ports.ui),
        otel_port: Some(ports.otel),
        hub_port: Some(ports.hub),
        logging_port: Some(ports.logging),
        simulator_udid,
        simulator_name,
        simulator_lock_dir: simulator_lock_dir.map(|path: PathBuf| path.to_string_lossy().to_string()),
        firebase_config: Some(firebase_config.to_string_lossy().to_string()),
        firebase_log: Some(firebase_log.to_string_lossy().to_string()),
        otel_log: Some(otel_log.to_string_lossy().to_string()),
        firebase_pid_file: Some(firebase_pid_file.to_string_lossy().to_string()),
        otel_pid_file: Some(otel_pid_file.to_string_lossy().to_string()),
    };
    final_state.write_to_file(&state_file)?;

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

fn start_firebase(
    sanitized_session: &str,
    project_id: &str,
    ports: &ports::Ports,
    root_dir: &Path,
    firebase_config: &Path,
    data_dir: &Path,
    firebase_log: &Path,
    firebase_pid_file: &Path,
    timeout_seconds: u64,
) -> io::Result<()> {
    let health_url = format!(
        "http://127.0.0.1:{}/{}/us-central1/devHealth",
        ports.functions, project_id
    );

    if is_pid_running(firebase_pid_file) {
        let pid = fs::read_to_string(firebase_pid_file).unwrap_or_default();
        println!(
            "Firebase emulator already running for {sanitized_session} (pid {}).",
            pid.trim()
        );
        return Ok(());
    }

    if !is_http_ok(&health_url) {
        for port in [
            ports.functions,
            ports.firestore,
            ports.hosting,
            ports.ui,
            ports.hub,
            ports.logging,
        ] {
            let _ = crate::runner::kill_listener_pids(port);
        }
    }

    firebase::write_firebase_config(&firebase::FirebaseConfig {
        template_path: root_dir.join("firebase.json"),
        output_path: firebase_config.to_path_buf(),
        data_dir: data_dir.to_path_buf(),
        functions_port: ports.functions,
        hosting_port: ports.hosting,
        firestore_port: ports.firestore,
        ui_port: ports.ui,
        hub_port: ports.hub,
        logging_port: ports.logging,
    })?;

    println!("Building functions...");
    let _ = run_status("npm", &["run", "build", "-w", "@brad-os/functions"], Some(root_dir), &[])?;

    println!("Starting Firebase emulators for {sanitized_session}...");
    let pid = run_to_file_detach(
        "nohup",
        &[
            "firebase",
            "emulators:start",
            "--only",
            "functions,firestore,hosting",
            "--config",
            &firebase_config.to_string_lossy(),
            "--project",
            project_id,
        ],
        Some(root_dir),
        &[],
        firebase_log,
    )?;
    fs::write(firebase_pid_file, format!("{pid}\n"))?;

    if let Err(error) = wait_for_http_ok("Firebase functions", &health_url, timeout_seconds) {
        let _ = write_log_tail(firebase_log, 40);
        return Err(error);
    }

    Ok(())
}

fn start_otel(
    sanitized_session: &str,
    port: u16,
    otel_dir: &Path,
    otel_log: &Path,
    otel_pid_file: &Path,
    timeout_seconds: u64,
    root_dir: &Path,
) -> io::Result<()> {
    if is_pid_running(otel_pid_file) {
        let pid = fs::read_to_string(otel_pid_file).unwrap_or_default();
        println!(
            "OTel collector already running for {sanitized_session} (pid {}).",
            pid.trim()
        );
        return Ok(());
    }

    println!("Starting OTel collector for {sanitized_session}...");
    let config = otel_mod::OTelConfig {
        collector_port: port,
        output_dir: otel_dir.to_path_buf(),
    };
    let collector_port = config.collector_port.to_string();
    let output_dir = config.output_dir.to_string_lossy().into_owned();
    let pid = run_to_file_detach(
        "nohup",
        &["npx", "tsx", "scripts/otel-collector/index.ts"],
        Some(root_dir),
        &[
            ("OTEL_COLLECTOR_PORT", collector_port.as_str()),
            ("OTEL_OUTPUT_DIR", output_dir.as_str()),
        ],
        otel_log,
    )?;
    fs::write(otel_pid_file, format!("{pid}\n"))?;

    if let Err(error) = wait_for_port_listener("OTel collector", port, timeout_seconds) {
        let _ = write_log_tail(otel_log, 40);
        return Err(error);
    }

    Ok(())
}

fn is_pid_running(pid_file: &Path) -> bool {
    let raw = fs::read_to_string(pid_file).unwrap_or_default();
    raw.trim()
        .parse::<u32>()
        .is_ok_and(|pid| crate::runner::is_process_running(pid))
}

fn write_log_tail(path: &Path, max_lines: usize) -> io::Result<()> {
    let lines = read_lines_tail(path, max_lines)?;
    for line in lines {
        println!("  {line}");
    }
    Ok(())
}

fn wait_for_http_ok(label: &str, url: &str, timeout_seconds: u64) -> io::Result<()> {
    let start = Instant::now();

    loop {
        if is_http_ok(url) {
            println!("  [ok] {label} is ready: {url}");
            return Ok(());
        }

        let elapsed = start.elapsed().as_secs();
        if elapsed >= timeout_seconds {
            return Err(io::Error::new(
                io::ErrorKind::TimedOut,
                format!("Timeout waiting for {label} at {url}"),
            ));
        }

        if elapsed % 10 == 0 {
            println!("  [wait] {label} not ready yet ({elapsed}s elapsed)");
        }
        sleep(Duration::from_secs(1));
    }
}

fn wait_for_port_listener(label: &str, port: u16, timeout_seconds: u64) -> io::Result<()> {
    let start = Instant::now();

    loop {
        if is_port_listening(port) {
            println!("  [ok] {label} is listening on port {port}");
            return Ok(());
        }

        let elapsed = start.elapsed().as_secs();
        if elapsed >= timeout_seconds {
            return Err(io::Error::new(
                io::ErrorKind::TimedOut,
                format!("Timeout waiting for {label} on port {port}"),
            ));
        }

        if elapsed % 10 == 0 {
            println!("  [wait] {label} not listening yet ({elapsed}s elapsed)");
        }
        sleep(Duration::from_secs(1));
    }
}

fn is_http_ok(url: &str) -> bool {
    run_status("curl", &["-s", "-f", url], None, &[])
        .is_ok_and(|code| code == 0)
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
    hosting_port: u16,
    otel_port: u16,
) -> io::Result<(Option<String>, Option<String>, Option<PathBuf>, bool)> {
    let available = run_output(
        "xcrun",
        &["simctl", "list", "devices", "available"],
        Some(root_dir),
        &[],
    )?;
    let available_output = available.stdout;

    if let (Some(existing_udid), Some(existing_lock)) =
        (existing_state.simulator_udid.as_ref(), existing_state.simulator_lock_dir.as_ref())
    {
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

    let _ = run_status(
        "xcrun",
        &["simctl", "boot", &udid],
        Some(root_dir),
        &[],
    );
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
            &format!("http://127.0.0.1:{hosting_port}/api/dev"),
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
    let _ = run_status(
        "xcrun",
        &["simctl", "spawn", &udid, "launchctl", "unsetenv", "USE_EMULATOR"],
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
    println!(
        "  Functions URL: http://127.0.0.1:{}/{}/us-central1/devHealth",
        ports.functions, project_id
    );
    println!("  API Base URL:  http://127.0.0.1:{}/api/dev", ports.hosting);
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
        fs::write(
            root.path().join("firebase.json"),
            r#"{"functions":{},"emulators":{},"hosting":{}}"#,
        )?;
        run(
            &args_of(&[
                "--id",
                "demo-session",
                "--no-firebase",
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
        assert_eq!(state.project_id, Some("brad-os-demo-session".to_string()));
        assert_eq!(state.simulator_udid, None);
        assert!(state.functions_port.is_some());
        Ok(())
    }
}
