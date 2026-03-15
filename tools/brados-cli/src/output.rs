use serde::Serialize;

use crate::error::CliError;

/// Print a success value as JSON to stdout.
pub fn print_success<T: Serialize>(data: &T) {
    let json = serde_json::to_string(data).expect("failed to serialize success output");
    println!("{json}");
}

/// Print an error as JSON to stderr.
pub fn print_error(err: &CliError) {
    let json = serde_json::to_string(&err.to_json()).expect("failed to serialize error output");
    eprintln!("{json}");
}
