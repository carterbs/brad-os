use crate::manifest::EndpointEntry;

#[derive(Debug, Clone, PartialEq)]
pub struct FirebaseRewrite {
    pub source: String,
    pub function: String,
}

pub fn to_pascal_case(s: &str) -> String {
    s.split('-')
        .filter(|seg| !seg.is_empty())
        .map(|seg| {
            let mut chars = seg.chars();
            match chars.next() {
                Some(c) => {
                    let upper: String = c.to_uppercase().collect();
                    format!("{}{}", upper, chars.as_str())
                }
                None => String::new(),
            }
        })
        .collect()
}

pub fn to_camel_case(s: &str) -> String {
    let segments: Vec<&str> = s.split('-').filter(|seg| !seg.is_empty()).collect();
    if segments.is_empty() {
        return String::new();
    }

    let first = segments[0];
    let rest: String = segments[1..]
        .iter()
        .map(|seg| {
            let mut chars = seg.chars();
            match chars.next() {
                Some(c) => {
                    let upper: String = c.to_uppercase().collect();
                    format!("{}{}", upper, chars.as_str())
                }
                None => String::new(),
            }
        })
        .collect();

    format!("{}{}", first, rest)
}

pub fn get_function_stem(entry: &EndpointEntry) -> String {
    entry
        .function_stem
        .clone()
        .unwrap_or_else(|| to_pascal_case(&entry.route_path))
}

pub fn get_app_export_name(entry: &EndpointEntry) -> String {
    format!("{}App", to_camel_case(&entry.handler_file))
}

pub fn get_dev_function_name(entry: &EndpointEntry) -> String {
    format!("dev{}", get_function_stem(entry))
}

pub fn get_prod_function_name(entry: &EndpointEntry) -> String {
    format!("prod{}", get_function_stem(entry))
}

pub fn generate_rewrites(manifest: &[EndpointEntry]) -> Vec<FirebaseRewrite> {
    let mut dev_rewrites = Vec::new();
    let mut prod_rewrites = Vec::new();

    for entry in manifest {
        let dev_function = get_dev_function_name(entry);
        let dev_source = entry
            .custom_source
            .clone()
            .unwrap_or_else(|| format!("/api/dev/{}", entry.route_path));
        dev_rewrites.push(FirebaseRewrite {
            source: dev_source.clone(),
            function: dev_function.clone(),
        });
        dev_rewrites.push(FirebaseRewrite {
            source: format!("{}/**", dev_source),
            function: dev_function,
        });

        if entry.dev_only == Some(true) {
            continue;
        }

        let prod_function = get_prod_function_name(entry);
        let prod_source = entry
            .custom_source
            .clone()
            .unwrap_or_else(|| format!("/api/prod/{}", entry.route_path));
        prod_rewrites.push(FirebaseRewrite {
            source: prod_source.clone(),
            function: prod_function.clone(),
        });
        prod_rewrites.push(FirebaseRewrite {
            source: format!("{}/**", prod_source),
            function: prod_function,
        });
    }

    let mut result = dev_rewrites;
    result.extend(prod_rewrites);
    result
}

pub fn compare_rewrites(expected: &[FirebaseRewrite], actual: &[FirebaseRewrite]) -> Vec<String> {
    let mut violations = Vec::new();

    let expected_keys: Vec<String> = expected
        .iter()
        .map(|r| format!("{}|{}", r.source, r.function))
        .collect();
    let actual_keys: Vec<String> = actual
        .iter()
        .map(|r| format!("{}|{}", r.source, r.function))
        .collect();

    let expected_set: std::collections::HashSet<&str> =
        expected_keys.iter().map(|s| s.as_str()).collect();
    let actual_set: std::collections::HashSet<&str> =
        actual_keys.iter().map(|s| s.as_str()).collect();

    for key in &expected_keys {
        if !actual_set.contains(key.as_str()) {
            violations.push(format!("Missing rewrite: {}", key));
        }
    }

    for key in &actual_keys {
        if !expected_set.contains(key.as_str()) {
            violations.push(format!("Extra rewrite: {}", key));
        }
    }

    let min_length = expected_keys.len().min(actual_keys.len());
    for i in 0..min_length {
        if expected_keys[i] != actual_keys[i] {
            violations.push(format!(
                "Rewrite order mismatch at index {}: expected '{}', found '{}'",
                i, expected_keys[i], actual_keys[i]
            ));
        }
    }

    violations
}
