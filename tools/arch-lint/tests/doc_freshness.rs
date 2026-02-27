use std::fs;
use std::path::Path;

use arch_lint::checks::doc_freshness;
use arch_lint::config::LinterConfig;

#[test]
fn passes_when_docs_are_fresh() {
    let root = tempfile::tempdir().unwrap();

    write_file(
        &root.path().join("docs/quality-grades.md"),
        "\
# Domain Quality Grades

- [x] **Calendar missing cycling activities** - Cycling activity aggregation is now verified and covered.\
",
    );
    write_file(
        &root.path().join("docs/architecture/calendar.md"),
        "\
# Calendar\n\n- **Service**: `packages/functions/src/services/calendar.service.ts`\n",
    );
    write_file(
        &root.path().join("packages/functions/src/services/calendar.service.ts"),
        "export const ok = true;\n",
    );
    write_file(
        &root.path().join("AGENTS.md"),
        "\
# AGENTS\n\n## Guides\n| Guide | File |\n|-------|------|\n| Local Dev Quickstart | [docs/guides/local-dev-quickstart.md](docs/guides/local-dev-quickstart.md) |\n",
    );
    write_file(
        &root.path().join("docs/guides/local-dev-quickstart.md"),
        "# Local Dev Quickstart\n",
    );

    let config = LinterConfig::from_root(root.path());
    let result = doc_freshness::check(&config);

    assert!(result.passed);
    assert!(result.violations.is_empty());
}

#[test]
fn fails_when_completed_debt_remains_unchecked() {
    let root = tempfile::tempdir().unwrap();

    let quality_grades_path = root.path().join("docs/quality-grades.md");
    write_file(
        &quality_grades_path,
        "\
- [ ] **Calendar missing cycling activities** - Cycling activities were added to calendar aggregation.\n",
    );
    write_file(
        &root.path().join("packages/functions/src/services/calendar.service.ts"),
        "import { getCyclingActivities } from './firestore-cycling.service.js';\ntype: 'cycling'\nif (activity.type === 'cycling') {\n  dayData.summary.hasCycling = true;\n}\n",
    );
    write_file(
        &root.path().join("packages/functions/src/services/calendar.service.test.ts"),
        "\
it('should include cycling activities in days map', () => {\n  // ...\n});\nit('should set hasCycling flag and increment totals when cycling exists', () => {\n  // ...\n});\n",
    );
    write_file(&root.path().join("AGENTS.md"), "# AGENTS\n");

    let config = LinterConfig::from_root(root.path());
    let result = doc_freshness::check(&config);

    assert!(!result.passed);
    assert_eq!(result.violations.len(), 1);
    assert!(result.violations[0].contains("docs/quality-grades.md:1"));
}

#[test]
fn does_not_fail_when_unchecked_item_lacks_completion_evidence() {
    let root = tempfile::tempdir().unwrap();

    write_file(
        &root.path().join("docs/quality-grades.md"),
        "\
- [ ] **Calendar missing cycling activities** - Cycling activities are still pending.\n",
    );
    write_file(
        &root.path().join("packages/functions/src/services/calendar.service.ts"),
        "import { getCyclingActivities } from './firestore-cycling.service.js';\n",
    );
    write_file(
        &root.path().join("packages/functions/src/services/calendar.service.test.ts"),
        "\
it('should include cycling activities in days map', () => {\n  // ...\n});\n",
    );
    write_file(&root.path().join("AGENTS.md"), "# AGENTS\n");

    let config = LinterConfig::from_root(root.path());
    let result = doc_freshness::check(&config);

    assert!(result.passed);
    assert!(result.violations.is_empty());
}

#[test]
fn fails_when_architecture_map_references_missing_file() {
    let root = tempfile::tempdir().unwrap();

    write_file(
        &root.path().join("docs/quality-grades.md"),
        "\
- [x] **Calendar missing cycling activities** - Calendar now includes cycling activity counts.\n",
    );
    write_file(
        &root.path().join("docs/architecture/calendar.md"),
        "\
# Calendar\n\n- **Service**: `packages/functions/src/services/missing-calendar.service.ts`\n",
    );
    write_file(&root.path().join("AGENTS.md"), "# AGENTS\n");

    let config = LinterConfig::from_root(root.path());
    let result = doc_freshness::check(&config);

    assert!(!result.passed);
    assert!(result
        .violations
        .iter()
        .any(|violation| violation.contains("docs/architecture/calendar.md:3 references `packages/functions/src/services/missing-calendar.service.ts")));
    assert_eq!(result.violations.len(), 1);
}

#[test]
fn fails_when_agents_guides_link_target_missing() {
    let root = tempfile::tempdir().unwrap();

    write_file(
        &root.path().join("docs/quality-grades.md"),
        "\
- [x] **Calendar missing cycling activities** - Calendar now includes cycling activity counts.\n",
    );
    write_file(
        &root.path().join("AGENTS.md"),
        "\
# AGENTS\n\n## Guides\n| Guide | File |\n|-------|------|\n| Local Dev Quickstart | [docs/guides/local-dev-quickstart.md](docs/guides/local-dev-quickstart.md) |\n| Missing Guide | [docs/guides/missing-guide.md](docs/guides/missing-guide.md) |\n",
    );

    let config = LinterConfig::from_root(root.path());
    let result = doc_freshness::check(&config);

    assert!(!result.passed);
    let line_number = 7;
    assert!(result
        .violations
        .iter()
        .any(|v| v.contains(&format!(
            "AGENTS.md:{line_number} has a Guides table link target 'docs/guides/missing-guide.md'"
        )));
}

#[test]
fn ignores_non_guide_sections_in_agents() {
    let root = tempfile::tempdir().unwrap();

    write_file(
        &root.path().join("docs/quality-grades.md"),
        "\
- [x] **Calendar missing cycling activities** - Calendar now includes cycling activity counts.\n",
    );
    write_file(
        &root.path().join("AGENTS.md"),
        "\
# AGENTS\n\n## Operations\n| Topic | File |\n|-------|------|\n| Missing file in non-guide | [docs/guides/missing-guide.md](docs/guides/missing-guide.md) |\n\n## Guides\n| Guide | File |\n|-------|------|\n| Local Dev Quickstart | [docs/guides/local-dev-quickstart.md](docs/guides/local-dev-quickstart.md) |\n",
    );
    write_file(
        &root.path().join("docs/guides/local-dev-quickstart.md"),
        "# Local Dev Quickstart\n",
    );

    let config = LinterConfig::from_root(root.path());
    let result = doc_freshness::check(&config);

    assert!(result.passed);
    assert!(result.violations.is_empty());
}

#[test]
fn passes_when_quality_grades_unchecked_items_are_not_proven_complete() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    let config = LinterConfig::from_root(root);

    write_quality_grades(
        root,
        "- [ ] **Zod-only types**\n- [ ] **createResourceRouter factory**\n- [ ] **Shared test utilities**\n",
    );
    write_healthy_architecture_docs(root);
    write_valid_agents_guide_table(root);

    let result = doc_freshness::check(&config);
    assert!(result.passed);
    assert!(result.violations.is_empty());
}

#[test]
fn flags_unchecked_create_resource_router_factory_when_code_is_complete() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    let config = LinterConfig::from_root(root);

    write_quality_grades(root, "- [ ] **createResourceRouter factory**\n");
    write_healthy_architecture_docs(root);
    write_valid_agents_guide_table(root);
    write_router_file(root);
    write_handler_importing_router(root);

    let result = doc_freshness::check(&config);
    assert!(!result.passed);
    assert_eq!(result.violations.len(), 1);
    assert!(result.violations[0].contains("docs/quality-grades.md:"));
    assert!(result.violations[0].contains("createResourceRouter factory"));
}

#[test]
fn flags_unchecked_shared_test_utilities_when_utils_are_present_and_used() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    let config = LinterConfig::from_root(root);

    write_quality_grades(root, "- [ ] **Shared test utilities**\n");
    write_healthy_architecture_docs(root);
    write_valid_agents_guide_table(root);
    write_shared_test_utilities(root);
    write_repo_test_importing_utils(root);

    let result = doc_freshness::check(&config);
    assert!(!result.passed);
    assert_eq!(result.violations.len(), 1);
    assert!(result.violations[0].contains("docs/quality-grades.md:"));
    assert!(result.violations[0].contains("Shared test utilities"));
}

#[test]
fn flags_missing_architecture_doc_backtick_reference() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    let config = LinterConfig::from_root(root);

    write_quality_grades(root, "- [x] **Shared test utilities**\n");
    write_valid_agents_guide_table(root);
    write_invalid_architecture_doc(root);

    let result = doc_freshness::check(&config);
    assert!(!result.passed);
    assert_eq!(result.violations.len(), 1);
    assert!(result.violations[0].contains("does not exist"));
    assert!(result.violations[0].contains("`docs/architecture/missing-route.md`"));
}

#[test]
fn flags_missing_agents_guide_link_target() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    let config = LinterConfig::from_root(root);

    write_quality_grades(root, "- [x] **Shared test utilities**\n");
    write_healthy_architecture_docs(root);
    write_missing_agents_guide(root);

    let result = doc_freshness::check(&config);
    assert!(!result.passed);
    assert!(!result.violations.is_empty());
    assert!(result
        .violations
        .iter()
        .any(|v| v.contains("AGENTS.md") && v.contains("docs/guides/missing-guide.md")));
}

#[test]
fn passes_for_valid_agents_guide_links() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    let config = LinterConfig::from_root(root);

    write_quality_grades(root, "- [x] **Shared test utilities**\n");
    write_healthy_architecture_docs(root);
    write_valid_agents_guide_table(root);

    let result = doc_freshness::check(&config);
    assert!(result.passed);
    assert!(result.violations.is_empty());
}

fn write_quality_grades(root: &Path, debt_entries: &str) {
    write_file(
        &root.join("docs/quality-grades.md"),
        format!("# Quality Grades\n\n## Active Tech Debt\n\n{debt_entries}\n"),
    );
}

fn write_healthy_architecture_docs(root: &Path) {
    let existing_file = root.join("docs/architecture/index.md");
    let referenced = "docs/golden-principles.md";
    write_file(&existing_file, format!("This map references `{}`.\n", referenced));
    write_file(
        &root.join(referenced),
        "# Golden Principles\n\nNo-op\n",
    );
}

fn write_invalid_architecture_doc(root: &Path) {
    let arch_file = root.join("docs/architecture/broken.md");
    write_file(
        &arch_file,
        "This map references `docs/architecture/missing-route.md`.\n",
    );
}

fn write_valid_agents_guide_table(root: &Path) {
    let guide = root.join("docs/guides/local-dev-quickstart.md");
    write_file(&guide, "# Local dev quickstart\n");

    write_file(
        &root.join("AGENTS.md"),
        "# AGENTS\n\n## Guides\n| Guide | File |\n|-------|------|\n| Local Dev Quickstart | [docs/guides/local-dev-quickstart.md](docs/guides/local-dev-quickstart.md) |\n\n## Other\nNo issues.\n",
    );
}

fn write_missing_agents_guide(root: &Path) {
    write_file(
        &root.join("AGENTS.md"),
        "# AGENTS\n\n## Guides\n| Guide | File |\n|-------|------|\n| Missing Guide | [docs/guides/missing-guide.md](docs/guides/missing-guide.md) |\n",
    );
}

fn write_router_file(root: &Path) {
    write_file(
        &root.join("packages/functions/src/middleware/create-resource-router.ts"),
        "export function createBaseApp() {}\nexport function createResourceRouter() {}\n",
    );
}

fn write_handler_importing_router(root: &Path) {
    write_file(
        &root.join("packages/functions/src/handlers/meals.ts"),
        "import { createResourceRouter } from '../middleware/create-resource-router.js';\nexport const mealsApp = createResourceRouter({});\n",
    );
}

fn write_shared_test_utilities(root: &Path) {
    write_file(
        &root.join("packages/functions/src/test-utils/index.ts"),
        "export const helper = () => {};\n",
    );
    write_file(
        &root.join("packages/functions/src/__tests__/utils/index.ts"),
        "export const testHelper = () => {};\n",
    );
}

fn write_repo_test_importing_utils(root: &Path) {
    write_file(
        &root.join("packages/functions/src/repositories/workout.repository.test.ts"),
        "import { buildMockRepo } from '../test-utils/index.js';\nexport const t = buildMockRepo;\n",
    );
}

fn write_file(path: &Path, contents: impl AsRef<str>) {
    let path = path.to_path_buf();
    fs::create_dir_all(
        path.parent()
            .expect("all test fixture files should have a parent directory"),
    )
    .unwrap();
    fs::write(path, contents.as_ref()).unwrap();
}
