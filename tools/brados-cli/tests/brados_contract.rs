use std::process::Command;

fn brados_bin() -> Command {
    Command::new(env!("CARGO_BIN_EXE_brados"))
}

#[test]
fn help_exits_zero() {
    let output = brados_bin().arg("--help").output().unwrap();
    assert!(
        output.status.success(),
        "expected exit 0 for --help, got {:?}",
        output.status
    );
}

#[test]
fn missing_appcheck_token_exits_one_with_json_error() {
    let output = brados_bin()
        .args(["meals", "list"])
        .env_remove("BRADOS_APPCHECK_TOKEN")
        .output()
        .unwrap();

    assert_eq!(
        output.status.code(),
        Some(1),
        "expected exit 1, got {:?}",
        output.status
    );

    let stderr = String::from_utf8_lossy(&output.stderr);
    let parsed: serde_json::Value = serde_json::from_str(stderr.trim())
        .unwrap_or_else(|e| panic!("stderr is not valid JSON: {e}\nstderr was: {stderr}"));

    assert_eq!(parsed["error"]["code"], "MISSING_CONFIG");
}

#[test]
fn recipes_help_exits_zero() {
    let output = brados_bin().args(["recipes", "--help"]).output().unwrap();
    assert!(
        output.status.success(),
        "expected exit 0 for recipes --help, got {:?}",
        output.status
    );
}

#[test]
fn ingredients_help_exits_zero() {
    let output = brados_bin()
        .args(["ingredients", "--help"])
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "expected exit 0 for ingredients --help, got {:?}",
        output.status
    );
}

#[test]
fn unknown_subcommand_exits_two() {
    let output = brados_bin().arg("nonexistent").output().unwrap();
    // clap exits with code 2 for usage errors
    assert_eq!(
        output.status.code(),
        Some(2),
        "expected exit 2 for unknown subcommand, got {:?}",
        output.status
    );
}
