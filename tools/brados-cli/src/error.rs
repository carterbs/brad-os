use std::fmt;

/// All error types produced by the brados CLI.
#[derive(Debug)]
pub enum CliError {
    /// A required environment variable is missing.
    MissingConfig(String),
    /// An HTTP or network error occurred.
    Http(String),
    /// The API returned an error response.
    Api { code: String, message: String },
    /// Failed to parse JSON.
    Deserialize(String),
}

impl fmt::Display for CliError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CliError::MissingConfig(var) => {
                write!(f, "missing required environment variable: {var}")
            }
            CliError::Http(msg) => write!(f, "HTTP error: {msg}"),
            CliError::Api { code, message } => write!(f, "API error ({code}): {message}"),
            CliError::Deserialize(msg) => write!(f, "deserialization error: {msg}"),
        }
    }
}

impl CliError {
    /// Return a JSON representation suitable for structured error output.
    pub fn to_json(&self) -> serde_json::Value {
        let (code, message) = match self {
            CliError::MissingConfig(var) => {
                ("MISSING_CONFIG".to_string(), format!("missing required environment variable: {var}"))
            }
            CliError::Http(msg) => ("HTTP_ERROR".to_string(), msg.clone()),
            CliError::Api { code, message } => (code.clone(), message.clone()),
            CliError::Deserialize(msg) => ("DESERIALIZE_ERROR".to_string(), msg.clone()),
        };
        serde_json::json!({
            "error": {
                "code": code,
                "message": message,
            }
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_config_produces_valid_json() {
        let err = CliError::MissingConfig("BRADOS_APPCHECK_TOKEN".to_string());
        let json = err.to_json();
        let error_obj = json.get("error").expect("should have error key");
        assert_eq!(error_obj["code"], "MISSING_CONFIG");
        assert!(error_obj["message"]
            .as_str()
            .unwrap()
            .contains("BRADOS_APPCHECK_TOKEN"));
    }

    #[test]
    fn http_error_produces_valid_json() {
        let err = CliError::Http("connection refused".to_string());
        let json = err.to_json();
        let error_obj = json.get("error").expect("should have error key");
        assert_eq!(error_obj["code"], "HTTP_ERROR");
        assert_eq!(error_obj["message"], "connection refused");
    }

    #[test]
    fn api_error_produces_valid_json() {
        let err = CliError::Api {
            code: "NOT_FOUND".to_string(),
            message: "session not found".to_string(),
        };
        let json = err.to_json();
        let error_obj = json.get("error").expect("should have error key");
        assert_eq!(error_obj["code"], "NOT_FOUND");
        assert_eq!(error_obj["message"], "session not found");
    }

    #[test]
    fn deserialize_error_produces_valid_json() {
        let err = CliError::Deserialize("unexpected token".to_string());
        let json = err.to_json();
        let error_obj = json.get("error").expect("should have error key");
        assert_eq!(error_obj["code"], "DESERIALIZE_ERROR");
        assert_eq!(error_obj["message"], "unexpected token");
    }

    #[test]
    fn missing_config_display_includes_var_name() {
        let err = CliError::MissingConfig("MY_VAR".to_string());
        let msg = format!("{err}");
        assert!(msg.contains("MY_VAR"));
    }

    #[test]
    fn all_variants_produce_parseable_json() {
        let errors: Vec<CliError> = vec![
            CliError::MissingConfig("X".to_string()),
            CliError::Http("fail".to_string()),
            CliError::Api {
                code: "C".to_string(),
                message: "M".to_string(),
            },
            CliError::Deserialize("bad".to_string()),
        ];
        for err in &errors {
            let json = err.to_json();
            // Should be valid JSON — re-serialize to string and parse back
            let s = serde_json::to_string(&json).unwrap();
            let _parsed: serde_json::Value = serde_json::from_str(&s).unwrap();
        }
    }
}
