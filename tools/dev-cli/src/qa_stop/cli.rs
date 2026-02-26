#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ParsedArgs {
    ShowHelp,
    Run {
        session_id: Option<String>,
        shutdown_simulator: bool,
    },
}

#[derive(Debug)]
pub enum ParsedArgsError {
    UnknownArgument(String),
    MissingValue(String),
}

#[derive(Debug)]
pub struct CliUsage;

impl std::fmt::Display for ParsedArgsError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ParsedArgsError::UnknownArgument(arg) => {
                write!(f, "Unknown argument: {arg}")
            }
            ParsedArgsError::MissingValue(flag) => {
                write!(f, "Missing value for {flag}")
            }
        }
    }
}

impl std::fmt::Display for CliUsage {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", CliUsage::text())
    }
}

impl CliUsage {
    pub fn text() -> &'static str {
        "Usage:
  brad-qa-stop [options]

Options:
  --id <id>            Optional QA session identifier.
  --agent <id>         Backward-compatible alias for --id.
  --shutdown-simulator Shut down this session's simulator after cleanup.
  -h, --help           Show this help."
    }
}

pub fn parse_args(args: &[String]) -> Result<ParsedArgs, ParsedArgsError> {
    let mut session_id = None;
    let mut shutdown_simulator = false;

    let mut index = 0;
    while index < args.len() {
        match args[index].as_str() {
            "--id" | "--agent" => {
                let value = args
                    .get(index + 1)
                    .ok_or_else(|| ParsedArgsError::MissingValue(args[index].clone()))?;
                session_id = Some(value.clone());
                index += 2;
            }
            "--shutdown-simulator" => {
                shutdown_simulator = true;
                index += 1;
            }
            "-h" | "--help" => {
                return Ok(ParsedArgs::ShowHelp);
            }
            unknown => {
                return Err(ParsedArgsError::UnknownArgument(unknown.to_string()));
            }
        }
    }

    Ok(ParsedArgs::Run {
        session_id,
        shutdown_simulator,
    })
}
