use serde::Serialize;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

#[derive(Clone)]
pub struct Stopwatch {
    started_at: Instant,
}

#[derive(Debug, Clone, Serialize)]
pub struct PrecommitTiming {
    pub timestamp: String,
    pub branch: String,
    pub mode: String,
    pub staged_files: usize,
    pub exit_code: i32,
    pub hook_ms: u64,
    pub gitleaks_ms: u64,
    pub validate_ms: u64,
    pub validate_status: String,
    pub targeted_test_file_count: usize,
    pub targeted_test_project_count: usize,
}

pub fn utc_now_iso8601() -> String {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0);
    format!("{seconds}Z")
}

pub fn append_timing(path: &Path, timing: &PrecommitTiming) {
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    let line = match serde_json::to_string(timing) {
        Ok(serialized) => serialized,
        Err(_) => return,
    };

    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "{line}");
    }
}

impl Stopwatch {
    pub fn start() -> Self {
        Self {
            started_at: Instant::now(),
        }
    }

    pub fn elapsed_seconds(&self) -> u64 {
        self.started_at.elapsed().as_secs()
    }

    pub fn elapsed(&self) -> Duration {
        self.started_at.elapsed()
    }
}
