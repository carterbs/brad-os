use std::fmt;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedArgs {
    pub session_id: Option<String>,
    pub project_id: Option<String>,
    pub device_request: Option<String>,
    pub timeout_seconds: u64,
    pub fresh: bool,
    pub start_firebase: bool,
    pub start_otel: bool,
    pub setup_simulator: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ParseError {
    MissingValue(String),
    TimeoutInvalid,
    UnknownArg(String),
}

impl fmt::Display for ParseError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ParseError::MissingValue(arg) => {
                write!(f, "Missing value for {arg}")
            }
            ParseError::TimeoutInvalid => {
                write!(f, "--timeout must be an integer number of seconds.")
            }
            ParseError::UnknownArg(arg) => {
                write!(f, "Unknown argument: {arg}")
            }
        }
    }
}

pub fn parse_args(args: &[String]) -> Result<(ParsedArgs, bool), ParseError> {
    let mut parsed = ParsedArgs {
        session_id: None,
        project_id: None,
        device_request: None,
        timeout_seconds: 120,
        fresh: false,
        start_firebase: true,
        start_otel: true,
        setup_simulator: true,
    };

    let mut i = 0;
    let mut show_help = false;

    while i < args.len() {
        match args[i].as_str() {
            "--id" | "--agent" => {
                let value = args
                    .get(i + 1)
                    .ok_or_else(|| ParseError::MissingValue(args[i].clone()))?;
                parsed.session_id = Some(value.clone());
                i += 2;
            }
            "--project-id" => {
                let value = args
                    .get(i + 1)
                    .ok_or_else(|| ParseError::MissingValue(args[i].clone()))?;
                parsed.project_id = Some(value.clone());
                i += 2;
            }
            "--device" => {
                let value = args
                    .get(i + 1)
                    .ok_or_else(|| ParseError::MissingValue(args[i].clone()))?;
                parsed.device_request = Some(value.clone());
                i += 2;
            }
            "--timeout" => {
                let raw = args
                    .get(i + 1)
                    .ok_or_else(|| ParseError::MissingValue(args[i].clone()))?;
                parsed.timeout_seconds = raw
                    .parse::<u64>()
                    .map_err(|_| ParseError::TimeoutInvalid)?;
                i += 2;
            }
            "--fresh" => {
                parsed.fresh = true;
                i += 1;
            }
            "--no-firebase" => {
                parsed.start_firebase = false;
                i += 1;
            }
            "--no-otel" => {
                parsed.start_otel = false;
                i += 1;
            }
            "--no-simulator" => {
                parsed.setup_simulator = false;
                i += 1;
            }
            "-h" | "--help" => {
                show_help = true;
                break;
            }
            unknown => return Err(ParseError::UnknownArg(unknown.to_string())),
        }
    }

    Ok((parsed, show_help))
}

pub const USAGE: &str = r"Usage:
  bash scripts/qa-start.sh [options]

Options:
  --id <id>            Optional QA session identifier.
  --agent <id>         Backward-compatible alias for --id.
  --project-id <id>    Optional Firebase project ID override.
  --device <name|udid> Optional simulator name fragment or exact UDID.
  --timeout <seconds>  Startup wait timeout (default: 120).
  --fresh              Clear this QA session's telemetry/data directories before start.
  --no-firebase        Skip Firebase emulator startup.
  --no-otel            Skip OTel collector startup.
  --no-simulator       Skip simulator leasing + env injection.
  -h, --help           Show this help.";

#[cfg(test)]
mod tests {
    use super::*;

    fn arg_list(args: &[&str]) -> Vec<String> {
        args.iter().map(ToString::to_string).collect()
    }

    #[test]
    fn parse_all_primary_flags() {
        let (parsed, show_help) = parse_args(&arg_list(&[
            "--id",
            "alice",
            "--project-id",
            "brad-os-test",
            "--device",
            "iPhone 15",
            "--timeout",
            "90",
            "--fresh",
            "--no-firebase",
            "--no-otel",
            "--no-simulator",
        ]))
        .expect("should parse");

        assert!(!show_help);
        assert_eq!(parsed.session_id.as_deref(), Some("alice"));
        assert_eq!(parsed.project_id.as_deref(), Some("brad-os-test"));
        assert_eq!(parsed.device_request.as_deref(), Some("iPhone 15"));
        assert_eq!(parsed.timeout_seconds, 90);
        assert!(parsed.fresh);
        assert!(!parsed.start_firebase);
        assert!(!parsed.start_otel);
        assert!(!parsed.setup_simulator);
    }

    #[test]
    fn parse_unknown_arg() {
        let error = parse_args(&arg_list(&["--bad"])).expect_err("unknown argument");
        assert_eq!(error, ParseError::UnknownArg("--bad".to_string()));
    }

    #[test]
    fn parse_missing_value() {
        let error = parse_args(&arg_list(&["--timeout"])).expect_err("missing timeout value");
        assert_eq!(error, ParseError::MissingValue("--timeout".to_string()));
    }

    #[test]
    fn parse_timeout_error() {
        let error = parse_args(&arg_list(&["--timeout", "abc"]))
            .expect_err("timeout must be integer");
        assert_eq!(error, ParseError::TimeoutInvalid);
    }
}
