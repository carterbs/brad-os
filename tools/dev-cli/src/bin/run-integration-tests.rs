use dev_cli::runner::{self, LiveRunOpts};
use std::{
    io::{Read, Write},
    net::TcpStream,
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread,
    time::{Duration, Instant},
};

const EMULATOR_PROJECT: &str = "brad-os";
const DEFAULT_HEALTH_URL: &str = "http://127.0.0.1:5001/brad-os/us-central1/devHealth";
const HEALTH_CHECK_INTERVAL_SECS: u64 = 2;
const WAIT_TIMEOUT_SECS: u64 = 120;

struct EmulationSession {
    child: Child,
    stopped: bool,
}

impl EmulationSession {
    fn new() -> Result<Self, i32> {
        let mut cmd = if command_exists("setsid") {
            let mut command = Command::new("setsid");
            command.arg("firebase");
            command.arg("emulators:start");
            command.arg("--project");
            command.arg(EMULATOR_PROJECT);
            command
        } else {
            let mut command = Command::new("firebase");
            command.arg("emulators:start");
            command.arg("--project");
            command.arg(EMULATOR_PROJECT);
            command
        };

        cmd.stdin(Stdio::inherit())
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit());

        cmd.spawn().map(|child| Self {
            child,
            stopped: false,
        }).map_err(|_| 1)
    }

    fn pid(&self) -> u32 {
        self.child.id()
    }

    fn stop(&mut self) {
        if self.stopped {
            return;
        }
        self.stopped = true;

        if self.child.try_wait().ok().flatten().is_some() {
            println!("✅ Emulators stopped.");
            return;
        }

        let pid = self.child.id();
        println!();
        println!("🧹 Tearing down emulators (PID {pid})...");
        if kill_process_group(pid).is_err() {
            let _ = self.child.kill();
        }
        let _ = self.child.wait();
        println!("✅ Emulators stopped.");
    }
}

impl Drop for EmulationSession {
    fn drop(&mut self) {
        self.stop();
    }
}

fn main() {
    let interrupt = Arc::new(AtomicBool::new(false));
    let interrupt_for_signal = interrupt.clone();

    if let Err(error) = ctrlc::set_handler(move || {
        interrupt_for_signal.store(true, Ordering::SeqCst);
    }) {
        eprintln!("⚠️  Unable to register signal handler: {error}");
    }

    let code = run_tests(interrupt);
    std::process::exit(code);
}

fn run_tests(interrupt: Arc<AtomicBool>) -> i32 {
    println!("🔨 Building functions...");
    let build_status = run_live_with_interrupt("npm", &["run", "build"], &interrupt);
    if build_status != 0 {
        return build_status;
    }
    println!();

    println!("🚀 Starting emulators (fresh database)...");
    let mut emulation = match EmulationSession::new() {
        Ok(session) => session,
        Err(code) => return code,
    };
    println!("   Emulator PID: {}", emulation.pid());
    println!();

    if let Err(_) = wait_for_emulator_ready(
        std::env::var("HEALTH_URL").unwrap_or_else(|_| DEFAULT_HEALTH_URL.to_string()),
        Duration::from_secs(WAIT_TIMEOUT_SECS),
        Duration::from_secs(HEALTH_CHECK_INTERVAL_SECS),
    ) {
        println!("❌ Emulators failed to start. Aborting.");
        emulation.stop();
        return 1;
    }

    println!();
    println!("🧪 Running integration tests...");
    let test_exit_code = if interrupt.load(Ordering::SeqCst) {
        130
    } else {
        run_live_with_interrupt("npm", &["run", "test:integration"], &interrupt)
    };

    if test_exit_code == 0 {
        println!("✅ Integration tests passed.");
    } else {
        println!("❌ Integration tests failed (exit code {test_exit_code}).");
    }

    if interrupt.load(Ordering::SeqCst) {
        println!("⚠️  Interrupted. Cleaning up and exiting.");
    }

    emulation.stop();
    test_exit_code
}

fn run_live_with_interrupt(program: &str, args: &[&str], interrupt: &Arc<AtomicBool>) -> i32 {
    let opts = LiveRunOpts {
        name: "integration-runner",
        program,
        args,
        env: None,
    };
    runner::run_live_interrupted(&opts, interrupt)
}

fn command_exists(name: &str) -> bool {
    Command::new("sh")
        .arg("-c")
        .arg(format!("command -v {name} >/dev/null 2>&1"))
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn kill_process_group(pid: u32) -> std::io::Result<()> {
    let negative_pid = format!("-{pid}");
    let status = Command::new("kill").arg(&negative_pid).status()?;
    if status.success() {
        return Ok(());
    }
    Command::new("kill").arg(format!("{pid}")).status()?;
    Ok(())
}

fn parse_url_health_endpoint(url: &str) -> Option<(String, u16, String)> {
    let without_scheme = url.strip_prefix("http://")?;
    let (host_and_port, path_and_remainder) = without_scheme.split_once('/')?;
    let mut host = host_and_port;
    let mut port = 80u16;

    if let Some((host_name, port_text)) = host_and_port.split_once(':') {
        host = host_name;
        port = port_text.parse().ok()?;
    }

    let path = format!("/{path_and_remainder}");
    Some((host.to_string(), port, path))
}

fn check_emulator_ready(url: &str) -> bool {
    let (host, port, path) = match parse_url_health_endpoint(url) {
        Some(parts) => parts,
        None => return false,
    };

    let addr = format!("{host}:{port}").parse().ok();
    let mut stream = match addr.and_then(|addr| TcpStream::connect_timeout(&addr, Duration::from_millis(500)).ok()) {
        Some(stream) => stream,
        None => return false,
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(500)));

    let request = format!(
        "GET {path} HTTP/1.1\r\nHost: {host}:{port}\r\nConnection: close\r\n\r\n"
    );

    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }

    let mut response = Vec::new();
    if stream.read_to_end(&mut response).map(|bytes| bytes > 0).unwrap_or(false) {
        let response_text = String::from_utf8_lossy(&response);
        if let Some(status_line) = response_text.lines().next() {
            if let Some(status) = status_line
                .split_whitespace()
                .nth(1)
                .and_then(|raw| raw.parse::<u16>().ok())
            {
                return (200..300).contains(&status);
            }
        }
    }

    false
}

fn wait_for_emulator_ready(health_url: String, timeout: Duration, interval: Duration) -> Result<(), ()> {
    let started = Instant::now();
    loop {
        if check_emulator_ready(&health_url) {
            return Ok(());
        }
        if started.elapsed() >= timeout {
            return Err(());
        }
        let elapsed = started.elapsed().as_secs();
        println!("   Waiting... ({elapsed}s elapsed)");
        thread::sleep(interval);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;

    #[test]
    fn parse_url_health_endpoint_extracts_parts() {
        let parsed = parse_url_health_endpoint("http://127.0.0.1:5001/brad-os/us-central1/devHealth")
            .unwrap();
        assert_eq!(parsed.0, "127.0.0.1");
        assert_eq!(parsed.1, 5001);
        assert_eq!(parsed.2, "/brad-os/us-central1/devHealth");
    }

    #[test]
    fn parse_url_health_endpoint_fails_for_invalid_url() {
        assert!(parse_url_health_endpoint("not-a-url").is_none());
    }

    #[test]
    fn wait_for_emulator_ready_returns_error_on_timeout() {
        let port = 59999;
        let err = wait_for_emulator_ready(
            format!("http://127.0.0.1:{port}/brad-os/us-central1/devHealth"),
            Duration::from_millis(120),
            Duration::from_millis(20),
        );
        assert!(err.is_err());
    }

    #[test]
    fn check_emulator_ready_reports_when_server_returns_success() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let port = addr.port();

        let handle = thread::spawn(move || {
            let mut received = 0usize;
            while received < 2 {
                if let Ok((mut stream, _)) = listener.accept() {
                    let mut buffer = [0u8; 1024];
                    let _ = stream.read(&mut buffer);
                    let status = if received > 0 { "200" } else { "500" };
                    received += 1;

                    let body = if status == "200" { "ok" } else { "not ready" };
                    let response = format!(
                        "HTTP/1.1 {status} {}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                        if status == "200" { "OK" } else { "NOT_READY" },
                        body.len(),
                        body
                    );
                    let _ = stream.write_all(response.as_bytes());
                }
            }
        });

        let result = wait_for_emulator_ready(
            format!("http://127.0.0.1:{port}/brad-os/us-central1/devHealth"),
            Duration::from_millis(500),
            Duration::from_millis(20),
        );
        handle.join().unwrap();
        assert!(result.is_ok());
    }
}
