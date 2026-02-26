use crate::checks::FreshnessResult;
use crate::config::LinterConfig;
use regex::Regex;
use std::fs;
use std::sync::LazyLock;

static DATE_PATTERN: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"Last updated:\s*(\d{4}-\d{2}-\d{2})").unwrap()
});

pub fn check(config: &LinterConfig) -> FreshnessResult {
    let quality_grades = config.root_dir.join("docs/quality-grades.md");

    if !quality_grades.exists() {
        return FreshnessResult {
            stale: true,
            message: "docs/quality-grades.md does not exist. Run `npm run update:quality-grades` to generate it.".to_string(),
        };
    }

    let content = match fs::read_to_string(&quality_grades) {
        Ok(c) => c,
        Err(_) => {
            return FreshnessResult {
                stale: true,
                message: "Failed to read docs/quality-grades.md.".to_string(),
            };
        }
    };

    let date_str = match DATE_PATTERN.captures(&content).and_then(|c| c.get(1)) {
        Some(m) => m.as_str().to_string(),
        None => {
            return FreshnessResult {
                stale: true,
                message: "docs/quality-grades.md has no \"Last updated\" date. Run `npm run update:quality-grades` to refresh.".to_string(),
            };
        }
    };

    // Parse date: YYYY-MM-DD
    let parts: Vec<&str> = date_str.split('-').collect();
    if parts.len() != 3 {
        return FreshnessResult {
            stale: true,
            message: format!("Invalid date format in docs/quality-grades.md: {}", date_str),
        };
    }

    let year: i64 = parts[0].parse().unwrap_or(0);
    let month: i64 = parts[1].parse().unwrap_or(0);
    let day: i64 = parts[2].parse().unwrap_or(0);

    // Simple days-since calculation using Unix-like day counting
    let last_updated_days = year * 365 + month * 30 + day;

    // Get current date
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let now_secs = now.as_secs() as i64;
    let now_days = now_secs / 86400;

    // Convert now to approximate Y/M/D for comparison
    // Since 1970-01-01 epoch
    let now_year = 1970 + now_days / 365;
    let remaining = now_days % 365;
    let now_month = remaining / 30 + 1;
    let now_day = remaining % 30 + 1;
    let now_approx_days = now_year * 365 + now_month * 30 + now_day;

    let diff_days = now_approx_days - last_updated_days;

    if diff_days > 7 {
        return FreshnessResult {
            stale: true,
            message: format!(
                "docs/quality-grades.md was last updated {} days ago ({}). Run `npm run update:quality-grades` to refresh.",
                diff_days, date_str
            ),
        };
    }

    FreshnessResult {
        stale: false,
        message: String::new(),
    }
}
