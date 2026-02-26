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

- [x] **Calendar missing cycling activities** - Cycling activity aggregation is now verified and covered.
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
    write_file(
        &root.path().join("AGENTS.md"),
        "# AGENTS\n",
    );

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
    write_file(
        &root.path().join("AGENTS.md"),
        "# AGENTS\n",
    );

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
    write_file(
        &root.path().join("AGENTS.md"),
        "# AGENTS\n",
    );

    let config = LinterConfig::from_root(root.path());
    let result = doc_freshness::check(&config);

    assert!(!result.passed);
    assert!(result.violations.iter().any(|violation| violation.contains(
        "docs/architecture/calendar.md:3 references `packages/functions/src/services/missing-calendar.service.ts` but file does not exist."
    )));
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
    assert!(result.violations.iter().any(|v| v.contains(&format!(
        "AGENTS.md:{line_number} has a Guides table link target 'docs/guides/missing-guide.md'"
    ))));
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

fn write_file(path: &Path, content: &str) {
    fs::create_dir_all(path.parent().expect("parent exists")).unwrap();
    fs::write(path, content).unwrap();
}
