use std::fs;
use std::path::Path;

use arch_lint::checks::doc_freshness;
use arch_lint::config::LinterConfig;

#[test]
fn fails_when_create_resource_router_is_unchecked_but_evidence_exists() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();

    write_quality_grades(
        &root,
        r#"- [ ] **createResourceRouter factory** - Shared CRUD factory exists in middleware."#,
    );

    write_file(
        &root.join("packages/functions/src/middleware/create-resource-router.ts"),
        r#"export function createBaseApp(resourceName: string) { return {}; }
export function createResourceRouter() { return {}; }
"#,
    );

    write_file(
        &root.join("packages/functions/src/middleware/create-resource-router.test.ts"),
        "import { createResourceRouter } from './create-resource-router.js';",
    );

    write_file(
        &root.join("packages/functions/src/handlers/stretches.ts"),
        "import { createBaseApp } from '../middleware/create-resource-router.js';\ncreateBaseApp('stretches');",
    );

    write_architecture_doc(&root, "");
    write_valid_guides(&root);

    let config = LinterConfig::from_root(root);
    let result = doc_freshness::check(&config);

    assert!(!result.passed);
    assert_eq!(result.violations.len(), 1);
    let violation = &result.violations[0];
    assert!(violation.contains("docs/quality-grades.md:4 marks '**createResourceRouter factory**' as unchecked"));
    assert!(violation.contains("create-resource-router.ts"));
    assert!(violation.contains("Fix:"));
}

#[test]
fn fails_when_shared_test_utils_is_unchecked_but_evidence_exists() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();

    write_quality_grades(
        &root,
        r#"- [ ] **Shared test utilities** - Firestore mock and shared index utilities are in use."#,
    );

    write_file(
        &root.join("packages/functions/src/test-utils/index.ts"),
        "export const util = true;",
    );
    write_file(
        &root.join("packages/functions/src/test-utils/firestore-mock.ts"),
        "export const mock = true;",
    );

    let test_dir = root.join("packages/functions/src/handlers");
    write_file(
        &test_dir.join("stretches.test.ts"),
        "import { util } from '../test-utils/index.js';\n\nexport const ok = util;",
    );
    write_file(
        &test_dir.join("workouts.test.ts"),
        "import { util } from '../test-utils/index.js';\n\nexport const ok = util;",
    );
    write_file(
        &test_dir.join("exercises.test.ts"),
        "import { util } from '../test-utils/index.js';\n\nexport const ok = util;",
    );

    write_architecture_doc(&root, "");
    write_valid_guides(&root);

    let config = LinterConfig::from_root(root);
    let result = doc_freshness::check(&config);

    assert!(!result.passed);
    assert_eq!(result.violations.len(), 1);
    let violation = &result.violations[0];
    assert!(violation.contains("docs/quality-grades.md:4 marks '**Shared test utilities**' as unchecked"));
    assert!(violation.contains("test-utils/index.ts"));
    assert!(violation.contains("Fix:"));
}

#[test]
fn does_not_flag_unmapped_or_incomplete_unchecked_items() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();

    write_quality_grades(
        &root,
        "- [ ] **Zod-only types** - Deferred until Zod migration lands.\n- [ ] **createResourceRouter factory** - Partial cleanup pending.",
    );

    write_architecture_doc(&root, "");
    write_valid_guides(&root);

    let config = LinterConfig::from_root(root);
    let result = doc_freshness::check(&config);

    assert!(result.passed);
    assert!(result.violations.is_empty());
}

#[test]
fn fails_when_architecture_map_references_missing_file() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();

    write_quality_grades(&root, "- [x] **createResourceRouter factory** - completed");

    write_file(
        &root.join("docs/architecture/health.md"),
        "See `packages/functions/src/handlers/missing-handler.ts` for details.\n",
    );
    write_valid_guides(&root);

    let config = LinterConfig::from_root(root);
    let result = doc_freshness::check(&config);

    assert!(!result.passed);
    assert!(
        result
            .violations
            .iter()
            .any(|v| v.contains("docs/architecture/health.md") && v.contains("missing-handler"))
    );
}

#[test]
fn fails_when_agents_guide_link_target_missing() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();

    write_quality_grades(&root, "- [x] **createResourceRouter factory** - completed");
    write_architecture_doc(&root, "");

    write_file(
        &root.join("AGENTS.md"),
        r#"# AGENTS.md — Brad OS

## Guides
| Guide | File |
|------|------|
| Missing Guide | [Missing Guide](docs/guides/missing.md) |
"#,
    );

    let config = LinterConfig::from_root(root);
    let result = doc_freshness::check(&config);

    assert!(!result.passed);
    let violation = result
        .violations
        .into_iter()
        .find(|v| v.contains("AGENTS.md"))
        .unwrap();
    assert!(violation.contains("AGENTS.md:6 links to 'docs/guides/missing.md'"));
    assert!(violation.contains("Fix:"));
}

#[test]
fn passes_when_all_doc_freshness_signals_are_clean() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();

    write_quality_grades(
        &root,
        "- [x] **createResourceRouter factory** - completed\n- [x] **Shared test utilities** - completed",
    );

    write_file(
        &root.join("docs/architecture/health.md"),
        "See the architecture notes without backtick references.\n",
    );

    write_valid_guides(&root);

    let config = LinterConfig::from_root(root);
    let result = doc_freshness::check(&config);

    assert!(result.passed);
    assert!(result.violations.is_empty());
}

fn write_quality_grades(root: &Path, active_section_body: &str) {
    let content = format!(
        "# Domain Quality Grades\n\n## Active Tech Debt\n{}\n## Recently Completed\n",
        active_section_body
    );
    write_file(&root.join("docs/quality-grades.md"), &content);
}

fn write_architecture_doc(root: &Path, body: &str) {
    write_file(
        &root.join("docs/architecture/health.md"),
        &format!("# Health Architecture\n{}\n", body),
    );
}

fn write_valid_guides(root: &Path) {
    write_file(
        &root.join("docs/guides/local-dev-quickstart.md"),
        "# Local Dev Quickstart\n",
    );

    write_file(
        &root.join("AGENTS.md"),
        r#"# AGENTS.md — Brad OS

## Guides
| Guide | File |
|------|------|
| Local Dev Quickstart | [Local Dev Quickstart](docs/guides/local-dev-quickstart.md) |
"#,
    );
}

fn write_file(path: &Path, content: &str) {
    fs::create_dir_all(path.parent().expect("parent exists")).unwrap();
    fs::write(path, content).unwrap();
}
