use crate::error::CliError;
use crate::types::{ApiErrorResponse, ApiSuccess};

/// HTTP client for the BradOS API.
#[derive(Debug)]
pub struct ApiClient {
    base_url: String,
    appcheck_token: String,
}

impl ApiClient {
    /// Create a new client from environment variables.
    ///
    /// - `BRADOS_APPCHECK_TOKEN` (required) — Firebase App Check debug token
    /// - `BRADOS_API_URL` (optional) — overrides the base URL entirely
    /// - `dev` flag — when true and no `BRADOS_API_URL`, uses `/api/dev`
    pub fn from_env(dev: bool) -> Result<Self, CliError> {
        let appcheck_token = std::env::var("BRADOS_APPCHECK_TOKEN")
            .map_err(|_| CliError::MissingConfig("BRADOS_APPCHECK_TOKEN".to_string()))?;

        let base_url = match std::env::var("BRADOS_API_URL") {
            Ok(url) => url,
            Err(_) => {
                let env_path = if dev { "dev" } else { "prod" };
                format!("https://brad-os.web.app/api/{env_path}")
            }
        };

        Ok(Self {
            base_url,
            appcheck_token,
        })
    }

    /// Build the full URL for a given path.
    pub fn url_for(&self, path: &str) -> String {
        format!("{}{}", self.base_url, path)
    }

    #[cfg(test)]
    pub(crate) fn new_for_tests(base_url: &str, appcheck_token: &str) -> Self {
        Self {
            base_url: base_url.to_string(),
            appcheck_token: appcheck_token.to_string(),
        }
    }

    /// Perform a GET request.
    pub fn get(&self, path: &str) -> Result<serde_json::Value, CliError> {
        let url = self.url_for(path);
        let response = ureq::get(&url)
            .config()
            .http_status_as_error(false)
            .build()
            .header("x-firebase-appcheck", &self.appcheck_token)
            .call()
            .map_err(|e| CliError::Http(e.to_string()))?;

        decode_response(response)
    }

    /// Perform a POST request with no body.
    pub fn post_empty(&self, path: &str) -> Result<serde_json::Value, CliError> {
        let url = self.url_for(path);
        let response = ureq::post(&url)
            .config()
            .http_status_as_error(false)
            .build()
            .header("x-firebase-appcheck", &self.appcheck_token)
            .content_type("application/json")
            .send_empty()
            .map_err(|e| CliError::Http(e.to_string()))?;

        decode_response(response)
    }

    /// Perform a POST request with a JSON body.
    pub fn post_json(
        &self,
        path: &str,
        json_body: &serde_json::Value,
    ) -> Result<serde_json::Value, CliError> {
        let url = self.url_for(path);
        let response = ureq::post(&url)
            .config()
            .http_status_as_error(false)
            .build()
            .header("x-firebase-appcheck", &self.appcheck_token)
            .send_json(json_body)
            .map_err(|e| CliError::Http(e.to_string()))?;

        decode_response(response)
    }

    /// Perform a PUT request with a JSON body.
    pub fn put_json(
        &self,
        path: &str,
        json_body: &serde_json::Value,
    ) -> Result<serde_json::Value, CliError> {
        let url = self.url_for(path);
        let response = ureq::put(&url)
            .config()
            .http_status_as_error(false)
            .build()
            .header("x-firebase-appcheck", &self.appcheck_token)
            .send_json(json_body)
            .map_err(|e| CliError::Http(e.to_string()))?;

        decode_response(response)
    }

    /// Perform a DELETE request.
    pub fn delete(&self, path: &str) -> Result<serde_json::Value, CliError> {
        let url = self.url_for(path);
        let response = ureq::delete(&url)
            .config()
            .http_status_as_error(false)
            .build()
            .header("x-firebase-appcheck", &self.appcheck_token)
            .call()
            .map_err(|e| CliError::Http(e.to_string()))?;

        decode_response(response)
    }
}

/// Preserve the API's actionable error, including when HTTP status is non-success.
fn decode_response(
    response: ureq::http::Response<ureq::Body>,
) -> Result<serde_json::Value, CliError> {
    let status = response.status();
    let body = response
        .into_body()
        .read_json::<serde_json::Value>()
        .map_err(|error| {
            if status.is_success() {
                CliError::Deserialize(error.to_string())
            } else {
                CliError::Http(format!("http status: {status}"))
            }
        })?;
    check_api_error(&body)?;
    if !status.is_success() {
        return Err(CliError::Http(format!("http status: {status}")));
    }
    Ok(body)
}

/// Check if the API response indicates an error and return `CliError::Api` if so.
fn check_api_error(body: &serde_json::Value) -> Result<(), CliError> {
    if let Some(success) = body.get("success").and_then(|v| v.as_bool()) {
        if !success {
            if let Ok(err_resp) = serde_json::from_value::<ApiErrorResponse>(body.clone()) {
                return Err(CliError::Api {
                    code: err_resp.error.code,
                    message: err_resp.error.message,
                });
            }
        }
    }
    Ok(())
}

/// Helper to extract the `data` field from an `ApiSuccess` envelope.
pub fn extract_data<T: serde::de::DeserializeOwned>(
    body: serde_json::Value,
) -> Result<T, CliError> {
    let envelope: ApiSuccess<T> =
        serde_json::from_value(body).map_err(|e| CliError::Deserialize(e.to_string()))?;
    Ok(envelope.data)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_http_method_preserves_api_errors_on_non_success_status() {
        use std::io::{Read, Write};
        use std::net::TcpListener;
        for method in ["GET", "POST_EMPTY", "POST", "PUT", "DELETE"] {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            let client = make_client(&format!("http://{}", listener.local_addr().unwrap()));
            let handle = std::thread::spawn(move || {
                let (mut stream, _) = listener.accept().unwrap();
                let mut request = [0; 4096];
                stream.read(&mut request).unwrap();
                let body = r#"{"success":false,"error":{"code":"INVALID_REQUEST","message":"Unsupported context field"}}"#;
                write!(
                    stream,
                    "HTTP/1.1 400 Bad Request\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    body.len(),
                    body
                )
                .unwrap();
            });
            let error = match method {
                "GET" => client.get("/test"),
                "POST_EMPTY" => client.post_empty("/test"),
                "POST" => client.post_json("/test", &serde_json::json!({})),
                "PUT" => client.put_json("/test", &serde_json::json!({})),
                _ => client.delete("/test"),
            }
            .unwrap_err();
            handle.join().unwrap();
            assert!(
                matches!(error, CliError::Api { ref code, ref message }
                if code == "INVALID_REQUEST" && message == "Unsupported context field"),
                "{method}: {error}"
            );
        }
    }

    #[test]
    fn response_status_and_invalid_body_remain_errors() {
        use std::io::{Read, Write};
        use std::net::TcpListener;
        for (status, body, expected) in [
            (
                "409 Conflict",
                r#"{"success":false,"error":{"code":"CONFLICT","message":"Plan changed"}}"#,
                "API error",
            ),
            (
                "502 Bad Gateway",
                "<html>private upstream details</html>",
                "HTTP error: http status: 502",
            ),
            (
                "503 Unavailable",
                r#"{"message":"unavailable"}"#,
                "HTTP error: http status: 503",
            ),
            ("200 OK", "not json", "deserialization error"),
            (
                "200 OK",
                r#"{"success":true,"data":{"saved":true}}"#,
                "success",
            ),
        ] {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            let client = make_client(&format!("http://{}", listener.local_addr().unwrap()));
            let handle = std::thread::spawn(move || {
                let (mut stream, _) = listener.accept().unwrap();
                let mut request = [0; 4096];
                stream.read(&mut request).unwrap();
                write!(
                    stream,
                    "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                )
                .unwrap();
            });
            let result = client.get("/test");
            handle.join().unwrap();
            if expected == "success" {
                assert_eq!(result.unwrap()["data"]["saved"], true);
            } else {
                let error = result.unwrap_err().to_string();
                assert!(error.contains(expected), "{error}");
                assert!(!error.contains("private upstream"));
            }
        }
    }

    /// Helper: create client with known values for URL testing.
    fn make_client(base_url: &str) -> ApiClient {
        ApiClient {
            base_url: base_url.to_string(),
            appcheck_token: "test-token".to_string(),
        }
    }

    #[test]
    fn url_for_builds_correct_path() {
        let client = make_client("https://brad-os.web.app/api/prod");
        assert_eq!(
            client.url_for("/mealplans/generate"),
            "https://brad-os.web.app/api/prod/mealplans/generate"
        );
    }

    #[test]
    fn dev_flag_produces_dev_url() {
        // Temporarily set the env var for the token
        std::env::set_var("BRADOS_APPCHECK_TOKEN", "test");
        std::env::remove_var("BRADOS_API_URL");
        let client = ApiClient::from_env(true).unwrap();
        assert!(client.base_url.ends_with("/api/dev"));
        std::env::remove_var("BRADOS_APPCHECK_TOKEN");
    }

    #[test]
    fn default_produces_prod_url() {
        std::env::set_var("BRADOS_APPCHECK_TOKEN", "test");
        std::env::remove_var("BRADOS_API_URL");
        let client = ApiClient::from_env(false).unwrap();
        assert!(client.base_url.ends_with("/api/prod"));
        std::env::remove_var("BRADOS_APPCHECK_TOKEN");
    }

    #[test]
    fn env_var_overrides_url() {
        std::env::set_var("BRADOS_APPCHECK_TOKEN", "test");
        std::env::set_var("BRADOS_API_URL", "http://localhost:5001/api");
        let client = ApiClient::from_env(true).unwrap();
        assert_eq!(client.base_url, "http://localhost:5001/api");
        std::env::remove_var("BRADOS_API_URL");
        std::env::remove_var("BRADOS_APPCHECK_TOKEN");
    }

    #[test]
    fn missing_token_returns_error() {
        std::env::remove_var("BRADOS_APPCHECK_TOKEN");
        let result = ApiClient::from_env(false);
        assert!(result.is_err());
        match result.unwrap_err() {
            CliError::MissingConfig(var) => assert_eq!(var, "BRADOS_APPCHECK_TOKEN"),
            other => panic!("expected MissingConfig, got: {other}"),
        }
    }

    #[test]
    fn check_api_error_passes_success() {
        let body = serde_json::json!({"success": true, "data": {}});
        assert!(check_api_error(&body).is_ok());
    }

    #[test]
    fn check_api_error_catches_failure() {
        let body = serde_json::json!({
            "success": false,
            "error": {
                "code": "NOT_FOUND",
                "message": "not found"
            }
        });
        let err = check_api_error(&body).unwrap_err();
        match err {
            CliError::Api { code, message } => {
                assert_eq!(code, "NOT_FOUND");
                assert_eq!(message, "not found");
            }
            other => panic!("expected Api error, got: {other}"),
        }
    }

    #[test]
    fn extract_data_works() {
        let body = serde_json::json!({"success": true, "data": {"finalized": true}});
        let result: crate::types::FinalizeResult = extract_data(body).unwrap();
        assert!(result.finalized);
    }
}
