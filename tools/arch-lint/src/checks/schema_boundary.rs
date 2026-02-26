use crate::checks::CheckResult;
use crate::config::LinterConfig;
use regex::Regex;
use std::fs;
use std::sync::LazyLock;

static ROUTE_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"app\.(post|put|patch)\(\s*\n?\s*['"`]([^'"`]+)['"`]"#).unwrap()
});

static VALIDATE_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"validate\s*\(").unwrap()
});

static SAFE_PARSE_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\.safeParse\s*\(").unwrap()
});

static RESOURCE_ROUTER_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"createResourceRouter").unwrap()
});

const ACTION_SUFFIXES: &[&str] = &[
    "/start", "/complete", "/skip", "/cancel", "/unlog",
    "/remove", "/finalize", "/add", "/sync", "/generate",
    "/backfill-streams",
];

pub fn check(config: &LinterConfig) -> CheckResult {
    let name = "Schema-at-boundary".to_string();
    let handlers_dir = config.functions_src.join("handlers");

    if !handlers_dir.exists() {
        return CheckResult {
            name,
            passed: false,
            violations: vec![format!("Handlers directory not found: {}", handlers_dir.display())],
        };
    }

    let mut violations = Vec::new();

    let entries = match fs::read_dir(&handlers_dir) {
        Ok(e) => e,
        Err(_) => {
            return CheckResult {
                name,
                passed: false,
                violations: vec!["Failed to read handlers directory".to_string()],
            };
        }
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

        let content = match fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let rel_path = path.strip_prefix(&config.root_dir).unwrap_or(&path);

        // Collect all routes with their positions
        let routes: Vec<(String, String, usize)> = ROUTE_REGEX
            .captures_iter(&content)
            .filter_map(|caps| {
                let method = caps.get(1)?.as_str().to_uppercase();
                let route_path = caps.get(2)?.as_str().to_string();
                let index = caps.get(0)?.start();
                Some((method, route_path, index))
            })
            .collect();

        for (idx, (method, route_path, start)) in routes.iter().enumerate() {
            // Skip action routes
            if ACTION_SUFFIXES.iter().any(|s| route_path.ends_with(s)) {
                continue;
            }

            let end = if idx + 1 < routes.len() {
                routes[idx + 1].2
            } else {
                content.len()
            };

            let route_block = &content[*start..end];

            let has_validate = VALIDATE_REGEX.is_match(route_block);
            let has_safe_parse = SAFE_PARSE_REGEX.is_match(route_block);
            let has_resource_router = RESOURCE_ROUTER_REGEX.is_match(&content);

            if !has_validate && !has_safe_parse && !has_resource_router {
                let schema_dir = "packages/functions/src/schemas/";
                violations.push(format!(
                    "{} has a {} route at '{}' without Zod validation.\n\
                     \x20   Rule: Every POST/PUT/PATCH handler must validate its request body with a Zod schema at the boundary.\n\
                     \x20   Fix: 1. Create or find a Zod schema in {} (e.g. {}<resource>.schema.ts).\n\
                     \x20        2. Import {{ validate }} from '../middleware/validate.js' in the handler.\n\
                     \x20        3. Add validate(yourSchema) as middleware: app.{}('{}', validate(yourSchema), asyncHandler(...)).\n\
                     \x20   Example:\n\
                     \x20        // packages/functions/src/schemas/exercise.schema.ts\n\
                     \x20        export const createExerciseSchema = z.object({{\n\
                     \x20          name: z.string().min(1).max(100),\n\
                     \x20          weightIncrement: z.number().positive().default(5),\n\
                     \x20        }});\n\
                     \x20        // packages/functions/src/handlers/exercises.ts\n\
                     \x20        app.post('/exercises', validate(createExerciseSchema), asyncHandler(...));\n\
                     \x20   See: docs/conventions/api-patterns.md",
                    rel_path.display(),
                    method,
                    route_path,
                    schema_dir,
                    schema_dir,
                    method.to_lowercase(),
                    route_path,
                ));
            }
        }
    }

    CheckResult {
        passed: violations.is_empty(),
        name,
        violations,
    }
}
