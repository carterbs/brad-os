use std::fs;
use std::path::Path;

use arch_lint::checks::shell_complexity;
use arch_lint::config::LinterConfig;

#[test]
fn shell_complexity_check_fails_for_complex_default_script() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();

    write_script(
        &root.join("scripts/default-complex.sh"),
        &default_complexity_script(11),
    );

    let config = LinterConfig::from_root(root);
    let result = shell_complexity::check(&config);

    assert!(!result.passed);
    assert_eq!(result.violations.len(), 1);
    let violation = &result.violations[0];
    assert!(violation.contains("scripts/default-complex.sh"));
    assert!(violation.contains("CC_estimate"));
}

#[test]
fn shell_complexity_check_allows_transitional_legacy_scripts() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();

    write_script(&root.join("scripts/qa-start.sh"), &default_complexity_script(18));
    write_script(
        &root.join("scripts/setup-ios-testing.sh"),
        "#!/usr/bin/env bash\necho \"noop\"\n",
    );

    let config = LinterConfig::from_root(root);
    let result = shell_complexity::check(&config);

    assert!(result.passed);
    assert!(result.violations.is_empty());
}

#[test]
fn shell_complexity_check_exempts_known_shim_script() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();

    write_script(
        &root.join("scripts/arch-lint"),
        r#"#!/usr/bin/env bash
set -e
BINARY="$REPO_ROOT/target/release/arch-lint"
if [[ "$1" == "--help" ]]; then
  echo "help"
fi
if [[ "$2" == "--version" ]]; then
  echo "version"
fi
if [[ "$3" == "--rebuild" ]]; then
  cargo build -p arch-lint --release --manifest-path "$REPO_ROOT/Cargo.toml" -q >/dev/null
fi
if command -v cargo >/dev/null 2>&1; then
  :
fi
exec "$BINARY" "$@"
"#,
    );

    let config = LinterConfig::from_root(root);
    let result = shell_complexity::check(&config);

    assert!(result.passed);
    assert!(result.violations.is_empty());
}

#[test]
fn shell_complexity_check_exempts_documented_pre_commit_shim() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();

    write_script(
        &root.join("hooks/pre-commit"),
        &build_hook_complexity_script(),
    );

    let config = LinterConfig::from_root(root);
    let result = shell_complexity::check(&config);

    assert!(result.passed);
    assert!(result.violations.is_empty());
}

fn default_complexity_script(branches: usize) -> String {
    let mut script = String::from("#!/usr/bin/env bash\n");
    for i in 0..branches {
        script.push_str(&format!(
            "if [[ \"$1\" == \"{idx}\" ]]; then\n  echo \"step-{idx}\"\nfi\n",
            idx = i
        ));
    }
    script
}

fn write_script(path: &Path, contents: &str) {
    fs::create_dir_all(path.parent().expect("parent exists")).unwrap();
    fs::write(path, contents).unwrap();
}

fn build_hook_complexity_script() -> String {
    let mut script = String::from("#!/usr/bin/env bash\n");
    for i in 0..11 {
        script.push_str(&format!(
            "if [[ \"$HOOK_{}\" == \"{}\" ]]; then\n  echo \"step {}\"\nfi\n",
            i,
            i,
            i
        ));
    }
    script
}
