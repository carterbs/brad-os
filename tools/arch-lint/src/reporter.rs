use owo_colors::OwoColorize;
use owo_colors::Stream::Stdout;

use crate::checks::{CheckResult, FreshnessResult};

pub fn print_header() {
    println!(
        "{}",
        "\n=== Architecture Enforcement ===\n".if_supports_color(Stdout, |s| s.bold())
    );
}

pub fn print_result(result: &CheckResult) {
    if result.passed {
        print!(
            "{} {}: {}",
            "\u{2713}".if_supports_color(Stdout, |s| s.green()),
            result.name,
            "clean".if_supports_color(Stdout, |s| s.green()),
        );
        println!();
    } else {
        print!(
            "{} {}: {}",
            "\u{2717}".if_supports_color(Stdout, |s| s.red()),
            result.name,
            format!("{} violation(s)", result.violations.len())
                .if_supports_color(Stdout, |s| s.red()),
        );
        println!();
        println!();
        for v in &result.violations {
            println!(
                "  {}",
                v.if_supports_color(Stdout, |s| s.dimmed())
            );
        }
        println!();
    }
}

pub fn print_freshness_warning(freshness: &FreshnessResult) {
    if freshness.stale {
        println!(
            "\n{} Quality grades freshness: {}",
            "\u{26a0}".if_supports_color(Stdout, |s| s.yellow()),
            freshness.message.if_supports_color(Stdout, |s| s.yellow()),
        );
    }
}

pub fn print_summary(results: &[CheckResult]) -> bool {
    let failed: Vec<&CheckResult> = results.iter().filter(|r| !r.passed).collect();
    let total_violations: usize = results.iter().map(|r| r.violations.len()).sum();

    println!(
        "{}",
        "\n--- Summary ---".if_supports_color(Stdout, |s| s.bold())
    );

    if failed.is_empty() {
        println!(
            "{}",
            format!("\nAll {}/{} checks passed.\n", results.len(), results.len())
                .if_supports_color(Stdout, |s| s.green()),
        );
        true
    } else {
        println!(
            "{}",
            format!(
                "\n{}/{} check(s) failed with {} total violation(s).\n",
                failed.len(),
                results.len(),
                total_violations,
            )
            .if_supports_color(Stdout, |s| s.red()),
        );
        false
    }
}
