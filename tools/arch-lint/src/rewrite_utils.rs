use crate::manifest::EndpointEntry;

#[derive(Debug, Clone, PartialEq)]
pub struct CloudRunTarget {
    pub service_id: String,
    pub region: String,
    pub pin_tag: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct FirebaseRewrite {
    pub source: String,
    pub function: Option<String>,
    pub run: Option<CloudRunTarget>,
}

pub const CLOUD_RUN_SERVICE_ID: &str = "brad-os-api";
pub const CLOUD_RUN_REGION: &str = "us-central1";
pub const CLOUD_RUN_API_SOURCE: &str = "/api/**";

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
    if !manifest
        .iter()
        .any(|entry| entry.dev_only != Some(true) && !entry.route_path.is_empty())
    {
        return Vec::new();
    }

    vec![FirebaseRewrite {
        source: CLOUD_RUN_API_SOURCE.to_string(),
        function: None,
        run: Some(CloudRunTarget {
            service_id: CLOUD_RUN_SERVICE_ID.to_string(),
            region: CLOUD_RUN_REGION.to_string(),
            pin_tag: true,
        }),
    }]
}

pub fn compare_rewrites(expected: &[FirebaseRewrite], actual: &[FirebaseRewrite]) -> Vec<String> {
    let mut violations = Vec::new();

    let expected_keys: Vec<String> = expected.iter().map(rewrite_key).collect();
    let actual_keys: Vec<String> = actual.iter().map(rewrite_key).collect();

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

fn rewrite_key(rewrite: &FirebaseRewrite) -> String {
    if let Some(function) = &rewrite.function {
        return format!("{}|function={function}", rewrite.source);
    }
    match &rewrite.run {
        Some(run) => format!(
            "{}|{}|{}|pinTag={}",
            rewrite.source, run.service_id, run.region, run.pin_tag
        ),
        None => format!("{}|invalid-target", rewrite.source),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn api_entry() -> EndpointEntry {
        EndpointEntry {
            route_path: "health".to_string(),
            handler_file: "health".to_string(),
            options: None,
            dev_only: None,
            function_stem: None,
            custom_source: None,
        }
    }

    #[test]
    fn generates_single_pinned_cloud_run_rewrite() {
        assert_eq!(
            generate_rewrites(&[api_entry()]),
            vec![FirebaseRewrite {
                source: "/api/**".to_string(),
                function: None,
                run: Some(CloudRunTarget {
                    service_id: "brad-os-api".to_string(),
                    region: "us-central1".to_string(),
                    pin_tag: true,
                }),
            }]
        );
    }

    #[test]
    fn does_not_publish_debug_only_manifest() {
        let mut entry = api_entry();
        entry.route_path = String::new();
        entry.dev_only = Some(true);
        assert!(generate_rewrites(&[entry]).is_empty());
    }

    #[test]
    fn compares_every_cloud_run_target_field() {
        let expected = generate_rewrites(&[api_entry()]);
        assert!(compare_rewrites(&expected, &expected).is_empty());

        let wrong = vec![FirebaseRewrite {
            source: "/api/**".to_string(),
            function: None,
            run: Some(CloudRunTarget {
                service_id: "wrong".to_string(),
                region: "us-central1".to_string(),
                pin_tag: true,
            }),
        }];
        let violations = compare_rewrites(&expected, &wrong);
        assert!(violations
            .iter()
            .any(|value| value.starts_with("Missing rewrite")));
        assert!(violations
            .iter()
            .any(|value| value.starts_with("Extra rewrite")));
        assert!(violations
            .iter()
            .any(|value| value.starts_with("Rewrite order mismatch")));
    }
}
