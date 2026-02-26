use crate::runner::CheckResult;
use owo_colors::OwoColorize;
use std::io::{self, Write};

/// Print the pass/fail summary for all check results. Returns true if all passed.
/// Output format matches `scripts/validate.sh` summary exactly.
pub fn print_summary(results: &[CheckResult], total_elapsed_secs: u64) -> bool {
    let stdout = io::stdout();
    let mut out = stdout.lock();

    let mut all_passed = true;

    writeln!(out).ok();
    for result in results {
        if result.exit_code == 0 {
            writeln!(
                out,
                "  {} {:<15} {}",
                "\u{2713}".green(),
                result.name,
                format!("{}s", result.elapsed_secs).dimmed(),
            )
            .ok();
        } else {
            writeln!(
                out,
                "  {} {:<15} {}",
                "\u{2717}".red(),
                result.name,
                format!(
                    "{}s  \u{2192} .validate/{}.log",
                    result.elapsed_secs, result.name
                )
                .dimmed(),
            )
            .ok();
            all_passed = false;
        }
    }

    writeln!(out).ok();
    if all_passed {
        writeln!(
            out,
            "  {} {}",
            "PASS".green().bold(),
            format!("({}s)", total_elapsed_secs).dimmed(),
        )
        .ok();
    } else {
        writeln!(
            out,
            "  {} {}",
            "FAIL".red().bold(),
            format!("({}s)  Logs: .validate/*.log", total_elapsed_secs).dimmed(),
        )
        .ok();
    }
    writeln!(out).ok();

    all_passed
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn all_passing_returns_true() {
        let results = vec![
            CheckResult { name: "typecheck".to_string(), exit_code: 0, elapsed_secs: 1 },
            CheckResult { name: "lint".to_string(), exit_code: 0, elapsed_secs: 2 },
        ];
        assert!(print_summary(&results, 2));
    }

    #[test]
    fn any_failure_returns_false() {
        let results = vec![
            CheckResult { name: "typecheck".to_string(), exit_code: 0, elapsed_secs: 1 },
            CheckResult { name: "lint".to_string(), exit_code: 1, elapsed_secs: 2 },
        ];
        assert!(!print_summary(&results, 2));
    }

    #[test]
    fn empty_results_returns_true() {
        assert!(print_summary(&[], 0));
    }

    #[test]
    fn all_failing_returns_false() {
        let results = vec![
            CheckResult { name: "test".to_string(), exit_code: 1, elapsed_secs: 5 },
            CheckResult { name: "architecture".to_string(), exit_code: 1, elapsed_secs: 3 },
        ];
        assert!(!print_summary(&results, 5));
    }
}
