use std::collections::HashMap;
use std::io;
use std::path::PathBuf;
use std::process::Command;

#[derive(Debug, Clone)]
pub struct StopContext {
    pub otel_pid_file: PathBuf,
    pub firebase_pid_file: PathBuf,
    pub ports: [Option<String>; 7],
    pub simulator_udid: Option<String>,
    pub simulator_lock_dir: Option<String>,
    pub device_locks_dir: Option<String>,
}

impl StopContext {
    pub fn load(session_id: &str, qa_state_root: &str) -> io::Result<StopContext> {
        let session_dir = PathBuf::from(qa_state_root)
            .join("sessions")
            .join(session_id);
        let state_file = session_dir.join("state.env");

        let state = match std::fs::read_to_string(&state_file) {
            Ok(contents) => parse_state_file(&contents),
            Err(_) => HashMap::new(),
        };

        let default_otel_pid = session_dir.join("pids").join("otel.pid");
        let default_firebase_pid = session_dir.join("pids").join("firebase.pid");

        let otel_pid_file = coalesce_path(
            state.get("OTEL_PID_FILE").map(String::as_str),
            default_otel_pid.to_string_lossy().as_ref(),
        );

        let firebase_pid_file = coalesce_path(
            state.get("FIREBASE_PID_FILE").map(String::as_str),
            default_firebase_pid.to_string_lossy().as_ref(),
        );

        let ports = [
            state.get("FUNCTIONS_PORT").cloned(),
            state.get("FIRESTORE_PORT").cloned(),
            state.get("HOSTING_PORT").cloned(),
            state.get("UI_PORT").cloned(),
            state.get("HUB_PORT").cloned(),
            state.get("LOGGING_PORT").cloned(),
            state.get("OTEL_PORT").cloned(),
        ]
        .map(|value| value.filter(|text| !text.is_empty()));

        let simulator_udid = state.get("SIMULATOR_UDID").and_then(|value| {
            if value.is_empty() {
                None
            } else {
                Some(value.clone())
            }
        });

        let simulator_lock_dir = state
            .get("SIMULATOR_LOCK_DIR")
            .and_then(|value| if value.is_empty() { None } else { Some(value.clone()) });

        let device_locks_dir = Some(PathBuf::from(qa_state_root).join("device-locks").to_string_lossy().into_owned());

        Ok(StopContext {
            otel_pid_file: PathBuf::from(otel_pid_file),
            firebase_pid_file: PathBuf::from(firebase_pid_file),
            ports,
            simulator_udid,
            simulator_lock_dir,
            device_locks_dir,
        })
    }
}

fn coalesce_path<'a>(value: Option<&'a str>, fallback: &'a str) -> String {
    match value {
        Some(value) if !value.is_empty() => value.to_string(),
        _ => fallback.to_string(),
    }
}

pub fn sanitize_id(raw: &str) -> String {
    let lower = raw.to_ascii_lowercase();
    lower
        .chars()
        .map(|ch| {
            if ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '-' {
                ch
            } else {
                '-'
            }
        })
        .collect()
}

pub fn default_session_id(worktree_root: &std::path::Path) -> io::Result<String> {
    let worktree = worktree_root
        .file_name()
        .and_then(|part| part.to_str())
        .unwrap_or_default();
    let sanitized = sanitize_id(worktree);
    let checksum = checksum_of_path(worktree_root)?;
    Ok(format!("{sanitized}-{}", checksum % 10_000))
}

fn checksum_of_path(path: &std::path::Path) -> io::Result<u64> {
    let output = Command::new("cksum").arg(path).output()?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let token = stdout
        .split_whitespace()
        .next()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "cksum produced no output"))?;
    token
        .parse::<u64>()
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "cksum output not parseable"))
}

fn parse_state_file(raw: &str) -> HashMap<String, String> {
    raw.lines()
        .filter_map(|line| {
            let value = line.trim();
            if value.is_empty() || value.starts_with('#') {
                return None;
            }
            let (key, value) = value.split_once('=')?;
            let key = key.trim().to_string();
            let mut value = value.trim().to_string();
            if value.len() >= 2 && value.starts_with('"') && value.ends_with('"') {
                value = value[1..value.len() - 1].to_string();
            }
            Some((key, value))
        })
        .collect()
}

pub fn create_env_file(path: &PathBuf, entries: &[(&str, &str)]) {
    let mut output = String::new();
    for (key, value) in entries.iter() {
        output.push_str(key);
        output.push('=');
        output.push('\"');
        output.push_str(value);
        output.push('\"');
        output.push('\n');
    }
    std::fs::write(path, output).expect("failed to write env state file");
}
