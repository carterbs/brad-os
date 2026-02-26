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
    let since_epoch = match SystemTime::now().duration_since(UNIX_EPOCH) {
        Ok(duration) => duration.as_secs(),
        Err(_) => 0,
    };

    let day = 86_400;
    let mut remaining_days = since_epoch / day;
    let secs_of_day = since_epoch % day;

    let mut year = 1970;
    loop {
        let days_in_year = if is_leap_year(year) { 366 } else { 365 };
        if remaining_days < days_in_year {
            break;
        }

        remaining_days -= days_in_year;
        year += 1;
    }

    let mut month = 1;
    let mut days_in_month = days_before_month(month, is_leap_year(year));
    while remaining_days >= days_in_month {
        remaining_days -= days_in_month;
        month += 1;
        days_in_month = days_before_month(month, is_leap_year(year));
    }

    let day_of_month = remaining_days + 1;

    let hour = secs_of_day / 3600;
    let minute = (secs_of_day % 3600) / 60;
    let second = secs_of_day % 60;

    format!(
        "{year:04}-{month:02}-{day_of_month:02}T{hour:02}:{minute:02}:{second:02}Z"
    )
}

fn is_leap_year(year: i32) -> bool {
    year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)
}

fn days_before_month(month: i32, leap: bool) -> u64 {
    match month {
        1 => 31,
        2 => if leap { 29 } else { 28 },
        3 => 31,
        4 => 30,
        5 => 31,
        6 => 30,
        7 => 31,
        8 => 31,
        9 => 30,
        10 => 31,
        11 => 30,
        12 => 31,
        _ => 31,
    }
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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn utc_timestamp_is_iso8601_utc_like() {
        let timestamp = utc_now_iso8601();
        assert!(
            timestamp.ends_with('Z'),
            "timestamp should be in UTC format ending with Z"
        );
        assert!(
            timestamp.contains('T'),
            "timestamp should include date/time separator T"
        );
    }

    #[test]
    fn append_timing_writes_jsonl_record() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("timing").join("pre-commit-timings.jsonl");

        append_timing(
            &path,
            &PrecommitTiming {
                timestamp: utc_now_iso8601(),
                branch: "feature/main".to_string(),
                mode: "scoped".to_string(),
                staged_files: 2,
                exit_code: 0,
                hook_ms: 50,
                gitleaks_ms: 10,
                validate_ms: 20,
                validate_status: "success".to_string(),
                targeted_test_file_count: 1,
                targeted_test_project_count: 0,
            },
        );

        let content = fs::read_to_string(&path).expect("timing file should be readable");
        let line = content.lines().last().unwrap_or("");
        assert!(!line.is_empty(), "timing file should include one record");

        let value: Value = serde_json::from_str(line).expect("timing line should be valid JSON");
        assert_eq!(value.get("mode").and_then(Value::as_str), Some("scoped"));
        assert_eq!(
            value.get("validate_status").and_then(Value::as_str),
            Some("success")
        );
        assert_eq!(
            value.get("targeted_test_file_count")
                .and_then(Value::as_u64),
            Some(1)
        );
        assert_eq!(
            value
                .get("targeted_test_project_count")
                .and_then(Value::as_u64),
            Some(0)
        );
    }
}
