use crate::checks::CheckResult;
use crate::config::LinterConfig;
use regex::Regex;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::sync::LazyLock;

static ROUTE_PATTERN: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"app\.(get|post|put|patch|delete)\s*\(").unwrap()
});

pub fn check(config: &LinterConfig) -> CheckResult {
    let name = "Orphan features".to_string();
    let handlers_dir = config.functions_src.join("handlers");
    let arch_dir = config.root_dir.join("docs/architecture");

    if !handlers_dir.exists() {
        return CheckResult { name, passed: true, violations: vec![] };
    }

    // Collect existing architecture doc names (without .md)
    let mut arch_docs = HashSet::new();
    if arch_dir.exists() {
        if let Ok(entries) = fs::read_dir(&arch_dir) {
            for entry in entries.flatten() {
                if let Some(fname) = entry.path().file_name().and_then(|n| n.to_str()) {
                    if fname.ends_with(".md") {
                        arch_docs.insert(fname.replace(".md", ""));
                    }
                }
            }
        }
    }

    // Handler-to-feature map (verbatim from TS)
    let handler_to_feature: HashMap<&str, &str> = HashMap::from([
        ("exercises", "lifting"),
        ("plans", "lifting"),
        ("mesocycles", "lifting"),
        ("workouts", "lifting"),
        ("workoutSets", "lifting"),
        ("stretches", "stretching"),
        ("stretchSessions", "stretching"),
        ("meditationSessions", "meditation"),
        ("guidedMeditations", "meditation"),
        ("tts", "meditation"),
        ("health-sync", "health"),
        ("health", "health"),
        ("calendar", "calendar"),
        ("today-coach", "today"),
        ("cycling", "cycling"),
        ("cycling-coach", "cycling"),
        ("strava-webhook", "cycling"),
        ("mealplans", "meal-planning"),
        ("meals", "meal-planning"),
        ("recipes", "meal-planning"),
        ("ingredients", "meal-planning"),
        ("barcodes", "meal-planning"),
        ("mealplan-debug", "meal-planning"),
    ]);

    let mut violations = Vec::new();

    let entries = match fs::read_dir(&handlers_dir) {
        Ok(e) => e,
        Err(_) => return CheckResult { name, passed: true, violations: vec![] },
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let file_name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };

        if !file_name.ends_with(".ts")
            || file_name.ends_with(".test.ts")
            || file_name.ends_with(".spec.ts")
        {
            continue;
        }

        let handler_name = file_name.replace(".ts", "");

        let content = match fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        // Only check handlers that define Express routes
        if !ROUTE_PATTERN.is_match(&content) {
            continue;
        }

        match handler_to_feature.get(handler_name.as_str()) {
            None => {
                violations.push(format!(
                    "packages/functions/src/handlers/{} defines routes but has no entry in the handler-to-feature map.\n\
                     \x20   Rule: Every handler with Express routes must map to a feature and have an architecture doc.\n\
                     \x20   Fix: 1. Add '{}': '<feature>' to handlerToFeature in scripts/lint-checks.ts (checkOrphanFeatures).\n\
                     \x20        2. Create docs/architecture/<feature>.md using the template below.\n\
                     \x20   Example template for docs/architecture/<feature>.md:\n\
                     \x20        # <Feature> Architecture\n\
                     \x20        ## Data Flow\n\
                     \x20        handler -> service -> repository -> Firestore\n\
                     \x20        ## Key Files\n\
                     \x20        - `packages/functions/src/handlers/{}`\n\
                     \x20        - `packages/functions/src/services/<feature>.service.ts`\n\
                     \x20        - `packages/functions/src/types/<feature>.ts`\n\
                     \x20   See: docs/golden-principles.md",
                    file_name,
                    handler_name,
                    file_name,
                ));
            }
            Some(feature_name) => {
                if !arch_docs.contains(*feature_name) {
                    let cap_feature = {
                        let mut chars = feature_name.chars();
                        match chars.next() {
                            Some(c) => format!("{}{}", c.to_uppercase().collect::<String>(), chars.as_str()),
                            None => feature_name.to_string(),
                        }
                    };
                    violations.push(format!(
                        "packages/functions/src/handlers/{} maps to feature '{}' but docs/architecture/{}.md does not exist.\n\
                         \x20   Rule: Every feature with handlers must have an architecture doc in docs/architecture/.\n\
                         \x20   Fix: 1. Create docs/architecture/{}.md.\n\
                         \x20        2. Use docs/architecture/lifting.md as a template for structure.\n\
                         \x20   Example template for docs/architecture/{}.md:\n\
                         \x20        # {} Architecture\n\
                         \x20        ## Data Flow\n\
                         \x20        handler -> service -> repository -> Firestore\n\
                         \x20        ## Key Files\n\
                         \x20        - `packages/functions/src/handlers/{}`\n\
                         \x20        - `packages/functions/src/services/{}.service.ts`\n\
                         \x20        - `packages/functions/src/types/{}.ts`\n\
                         \x20   See: docs/golden-principles.md",
                        file_name,
                        feature_name,
                        feature_name,
                        feature_name,
                        feature_name,
                        cap_feature,
                        file_name,
                        feature_name,
                        feature_name,
                    ));
                }
            }
        }
    }

    CheckResult {
        passed: violations.is_empty(),
        name,
        violations,
    }
}
