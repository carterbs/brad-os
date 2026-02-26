use std::time::{Duration, Instant};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::Path,
    time::SystemTime,
};

#[derive(Clone)]
pub struct Stopwatch {
    started_at: Instant,
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

#[derive(Debug, Clone)]
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
    let now = SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    format!(
        "1970-01-01T00:00:00Z+{}.{:09}s",
        now.as_secs(),
        now.subsec_nanos()
    )
}

pub fn append_timing(path: &Path, timing: &PrecommitTiming) {
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    let line = format!(
        r#"{{"timestamp":"{}","branch":"{}","mode":"{}","staged_files":{},"exit_code":{},"hook_ms":{},"gitleaks_ms":{},"validate_ms":{},"validate_status":"{}","targeted_test_file_count":{},"targeted_test_project_count":{}}}"#,
        timing.timestamp,
        timing.branch,
        timing.mode,
        timing.staged_files,
        timing.exit_code,
        timing.hook_ms,
        timing.gitleaks_ms,
        timing.validate_ms,
        timing.validate_status,
        timing.targeted_test_file_count,
        timing.targeted_test_project_count,
    );

    let Ok(mut file) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
    else {
        return;
    };

    let _ = writeln!(file, "{}", line);
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn builds_utc_timestamp_like_string() {
        let timestamp = utc_now_iso8601();
        assert!(timestamp.contains('Z'));
        assert!(timestamp.contains('.'));
    }

    #[test]
    fn append_timing_file_is_append_only_with_stable_schema_order() {
        let dir = tempdir().expect("create tempdir");
        let path = dir.path().join("brad-precommit-timing.jsonl");

        let timing = PrecommitTiming {
            timestamp: "1970-01-01T00:00:00Z+0.000000000s".to_string(),
            branch: "feature/test".to_string(),
            mode: "scoped".to_string(),
            staged_files: 2,
            exit_code: 0,
            hook_ms: 10,
            gitleaks_ms: 2,
            validate_ms: 3,
            validate_status: "success".to_string(),
            targeted_test_file_count: 1,
            targeted_test_project_count: 1,
        };

        append_timing(&path, &timing);
        append_timing(&path, &timing);

        let raw = std::fs::read_to_string(&path).expect("timing log");
        let lines: Vec<&str> = raw.lines().collect();
        assert_eq!(lines.len(), 2);
        assert!(lines[0].starts_with("{\"timestamp\":\"1970"));
        assert!(lines[0].contains("\"branch\":\"feature/test\""));
        assert!(lines[0].contains("\"mode\":\"scoped\""));
        assert!(raw.contains("\"targeted_test_file_count\":1"));
        assert!(raw.contains("\"targeted_test_project_count\":1"));
    }
}
