use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

/// All fields from the pre-commit timing JSONL record.
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

impl PrecommitTiming {
    /// Serialize to JSON with exact field order matching the Bash implementation.
    pub fn to_json(&self) -> String {
        format!(
            concat!(
                r#"{{"timestamp":"{}","branch":"{}","mode":"{}","staged_files":{},"#,
                r#""exit_code":{},"hook_ms":{},"gitleaks_ms":{},"validate_ms":{},"#,
                r#""validate_status":"{}","targeted_test_file_count":{},"#,
                r#""targeted_test_project_count":{}}}"#,
            ),
            self.timestamp,
            self.branch.replace('"', "\\\""),
            self.mode,
            self.staged_files,
            self.exit_code,
            self.hook_ms,
            self.gitleaks_ms,
            self.validate_ms,
            self.validate_status,
            self.targeted_test_file_count,
            self.targeted_test_project_count,
        )
    }
}

/// Current UTC time as ISO 8601 string: `2024-01-15T14:30:00Z`.
pub fn utc_now_iso8601() -> String {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system time before UNIX epoch");
    let total_secs = duration.as_secs();

    let time_of_day = total_secs % 86400;
    let hours = time_of_day / 3600;
    let minutes = (time_of_day % 3600) / 60;
    let seconds = time_of_day % 60;

    let (year, month, day) = days_to_ymd(total_secs / 86400);

    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        year, month, day, hours, minutes, seconds
    )
}

/// Convert days since 1970-01-01 to (year, month, day).
/// Uses the civil_from_days algorithm by Howard Hinnant.
fn days_to_ymd(days: u64) -> (i64, u64, u64) {
    let z = days as i64 + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d)
}

/// Append a timing record to the JSONL file, creating parent dirs if needed.
pub fn append_timing(path: &Path, timing: &PrecommitTiming) {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).ok();
    }
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        writeln!(file, "{}", timing.to_json()).ok();
    } else {
        eprintln!("warning: could not write timing to {}", path.display());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_utc_timestamp_format() {
        let ts = utc_now_iso8601();
        assert!(ts.ends_with('Z'));
        assert_eq!(ts.len(), 20); // "2024-01-15T14:30:00Z"
        assert_eq!(&ts[4..5], "-");
        assert_eq!(&ts[7..8], "-");
        assert_eq!(&ts[10..11], "T");
        assert_eq!(&ts[13..14], ":");
        assert_eq!(&ts[16..17], ":");
    }

    #[test]
    fn test_timing_json_format() {
        let timing = PrecommitTiming {
            timestamp: "2024-01-15T14:30:00Z".to_string(),
            branch: "feature/test".to_string(),
            mode: "scoped".to_string(),
            staged_files: 3,
            exit_code: 0,
            hook_ms: 1500,
            gitleaks_ms: 200,
            validate_ms: 1200,
            validate_status: "success".to_string(),
            targeted_test_file_count: 2,
            targeted_test_project_count: 1,
        };
        let json = timing.to_json();
        assert!(json.starts_with('{'));
        assert!(json.ends_with('}'));
        assert!(json.contains(r#""mode":"scoped""#));
        assert!(json.contains(r#""staged_files":3"#));
        assert!(json.contains(r#""targeted_test_file_count":2"#));
    }

    #[test]
    fn test_timing_json_escapes_branch() {
        let timing = PrecommitTiming {
            timestamp: "2024-01-15T14:30:00Z".to_string(),
            branch: r#"feat/"quotes""#.to_string(),
            mode: "full".to_string(),
            staged_files: 0,
            exit_code: 0,
            hook_ms: 0,
            gitleaks_ms: 0,
            validate_ms: 0,
            validate_status: "not_run".to_string(),
            targeted_test_file_count: 0,
            targeted_test_project_count: 0,
        };
        let json = timing.to_json();
        assert!(json.contains(r#""branch":"feat/\"quotes\"""#));
    }

    #[test]
    fn test_days_to_ymd_epoch() {
        let (y, m, d) = days_to_ymd(0);
        assert_eq!((y, m, d), (1970, 1, 1));
    }

    #[test]
    fn test_days_to_ymd_known_date() {
        // 2024-01-15 is day 19737 since epoch
        let (y, m, d) = days_to_ymd(19737);
        assert_eq!((y, m, d), (2024, 1, 15));
    }

    #[test]
    fn append_timing_handles_invalid_path() {
        // Writing to a path inside a non-existent root that can't be created
        // should not panic — just print a warning.
        let timing = PrecommitTiming {
            timestamp: "2024-01-15T14:30:00Z".to_string(),
            branch: "main".to_string(),
            mode: "full".to_string(),
            staged_files: 0,
            exit_code: 0,
            hook_ms: 0,
            gitleaks_ms: 0,
            validate_ms: 0,
            validate_status: "not_run".to_string(),
            targeted_test_file_count: 0,
            targeted_test_project_count: 0,
        };
        // /dev/null/impossible is not a writable path
        append_timing(std::path::Path::new("/dev/null/impossible/timing.jsonl"), &timing);
        // Should not panic — the function silently warns on stderr.
    }
}
