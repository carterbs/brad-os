use crate::client::{extract_data, ApiClient};
use crate::error::CliError;
use crate::output::print_success;

fn with_query(path: &str, params: &[(&str, Option<String>)]) -> String {
    let query: Vec<String> = params
        .iter()
        .filter_map(|(key, value)| value.as_ref().map(|value| format!("{key}={value}")))
        .collect();

    if query.is_empty() {
        path.to_string()
    } else {
        format!("{path}?{}", query.join("&"))
    }
}

fn get_json_data(client: &ApiClient, path: &str) -> Result<(), CliError> {
    let body = client.get(path)?;
    let data: serde_json::Value = extract_data(body)?;
    print_success(&data);
    Ok(())
}

/// GET /health-sync/recovery
pub fn recovery(client: &ApiClient, date: Option<&str>) -> Result<(), CliError> {
    let path = with_query(
        "/health-sync/recovery",
        &[("date", date.map(ToString::to_string))],
    );
    get_json_data(client, &path)
}

/// GET /health-sync/recovery/history
pub fn recovery_history(client: &ApiClient, days: Option<u16>) -> Result<(), CliError> {
    let path = with_query(
        "/health-sync/recovery/history",
        &[("days", days.map(|days| days.to_string()))],
    );
    get_json_data(client, &path)
}

/// GET /health-sync/baseline
pub fn baseline(client: &ApiClient) -> Result<(), CliError> {
    get_json_data(client, "/health-sync/baseline")
}

/// GET /health-sync/weight
pub fn weight(client: &ApiClient, days: Option<u16>) -> Result<(), CliError> {
    let path = with_query(
        "/health-sync/weight",
        &[("days", days.map(|days| days.to_string()))],
    );
    get_json_data(client, &path)
}

/// GET /health-sync/hrv
pub fn hrv(client: &ApiClient, days: Option<u16>) -> Result<(), CliError> {
    let path = with_query(
        "/health-sync/hrv",
        &[("days", days.map(|days| days.to_string()))],
    );
    get_json_data(client, &path)
}

/// GET /health-sync/rhr
pub fn rhr(client: &ApiClient, days: Option<u16>) -> Result<(), CliError> {
    let path = with_query(
        "/health-sync/rhr",
        &[("days", days.map(|days| days.to_string()))],
    );
    get_json_data(client, &path)
}

/// GET /health-sync/sleep
pub fn sleep(client: &ApiClient, days: Option<u16>) -> Result<(), CliError> {
    let path = with_query(
        "/health-sync/sleep",
        &[("days", days.map(|days| days.to_string()))],
    );
    get_json_data(client, &path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn with_query_omits_empty_parameters() {
        assert_eq!(
            with_query("/health-sync/baseline", &[]),
            "/health-sync/baseline"
        );
        assert_eq!(
            with_query("/health-sync/recovery", &[("date", None)]),
            "/health-sync/recovery"
        );
    }

    #[test]
    fn with_query_appends_single_parameter() {
        assert_eq!(
            with_query(
                "/health-sync/recovery",
                &[("date", Some("2026-03-22".to_string()))]
            ),
            "/health-sync/recovery?date=2026-03-22"
        );
    }

    #[test]
    fn with_query_appends_multiple_parameters() {
        assert_eq!(
            with_query(
                "/example",
                &[
                    ("days", Some("7".to_string())),
                    ("date", Some("2026-03-22".to_string())),
                ]
            ),
            "/example?days=7&date=2026-03-22"
        );
    }
}
