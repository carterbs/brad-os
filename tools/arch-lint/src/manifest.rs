use crate::config::LinterConfig;
use std::fs;
use std::path::Path;

#[derive(Debug, Clone)]
pub struct EndpointEntry {
    pub route_path: String,
    pub handler_file: String,
    pub options: Option<String>,
    pub dev_only: Option<bool>,
    pub function_stem: Option<String>,
    pub custom_source: Option<String>,
}

pub struct ParsedManifestResult {
    pub manifest: Vec<EndpointEntry>,
    pub violations: Vec<String>,
}

fn parse_entry_string(field: &str, block: &str) -> Option<String> {
    let pattern = format!(r"{}\s*:\s*'([^']*)'", regex::escape(field));
    let re = regex::Regex::new(&pattern).ok()?;
    re.captures(block).and_then(|c| c.get(1).map(|m| m.as_str().to_string()))
}

fn parse_entry_boolean(field: &str, block: &str) -> Option<bool> {
    let pattern = format!(r"{}\s*:\s*(true|false)", regex::escape(field));
    let re = regex::Regex::new(&pattern).ok()?;
    re.captures(block).and_then(|c| {
        c.get(1).map(|m| m.as_str() == "true")
    })
}

pub fn extract_manifest_array_text(manifest_text: &str) -> String {
    let re = regex::Regex::new(r"export\s+const\s+ENDPOINT_MANIFEST\b").unwrap();
    let manifest_match = match re.find(manifest_text) {
        Some(m) => m,
        None => return String::new(),
    };

    let equals_index = match manifest_text[manifest_match.end()..].find('=') {
        Some(i) => manifest_match.end() + i,
        None => return String::new(),
    };

    let open_bracket = match manifest_text[equals_index..].find('[') {
        Some(i) => equals_index + i,
        None => return String::new(),
    };

    let bytes = manifest_text.as_bytes();
    let mut depth = 0i32;
    let mut in_single_quote = false;
    let mut in_double_quote = false;
    let mut in_template = false;
    let mut in_line_comment = false;
    let mut in_block_comment = false;
    let mut escaped = false;

    let mut i = open_bracket;
    while i < bytes.len() {
        let ch = bytes[i] as char;

        if escaped {
            escaped = false;
            i += 1;
            continue;
        }

        if ch == '\\' {
            escaped = true;
            i += 1;
            continue;
        }

        if in_line_comment && ch == '\n' {
            in_line_comment = false;
            i += 1;
            continue;
        }

        if in_line_comment || in_block_comment {
            if in_block_comment && ch == '*' && i + 1 < bytes.len() && bytes[i + 1] == b'/' {
                in_block_comment = false;
                i += 1; // skip the '/'
            }
            i += 1;
            continue;
        }

        if ch == '\'' && !in_double_quote && !in_template {
            in_single_quote = !in_single_quote;
            i += 1;
            continue;
        }
        if ch == '"' && !in_single_quote && !in_template {
            in_double_quote = !in_double_quote;
            i += 1;
            continue;
        }
        if ch == '`' && !in_single_quote && !in_double_quote {
            in_template = !in_template;
            i += 1;
            continue;
        }

        if ch == '/' && i + 1 < bytes.len() && bytes[i + 1] == b'/' && !in_single_quote && !in_double_quote && !in_template {
            in_line_comment = true;
            i += 1;
            continue;
        }
        if ch == '/' && i + 1 < bytes.len() && bytes[i + 1] == b'*' && !in_single_quote && !in_double_quote && !in_template {
            in_block_comment = true;
            i += 1;
            continue;
        }

        if ch == '[' {
            depth += 1;
            i += 1;
            continue;
        }
        if ch == ']' {
            depth -= 1;
            if depth == 0 {
                return manifest_text[open_bracket..=i].to_string();
            }
        }

        i += 1;
    }

    String::new()
}

pub fn parse_manifest_array(manifest_text: &str) -> ParsedManifestResult {
    let array_text = extract_manifest_array_text(manifest_text);
    if array_text.is_empty() {
        return ParsedManifestResult {
            manifest: vec![],
            violations: vec!["Unable to parse ENDPOINT_MANIFEST array from endpoint-manifest.ts".to_string()],
        };
    }

    let object_re = regex::Regex::new(r"\{[\s\S]*?\}").unwrap();
    let mut entries = Vec::new();

    for m in object_re.find_iter(&array_text) {
        let block = m.as_str();
        let route_path = match parse_entry_string("routePath", block) {
            Some(v) => v,
            None => {
                return ParsedManifestResult {
                    manifest: vec![],
                    violations: vec!["Malformed manifest entry: missing routePath or handlerFile".to_string()],
                };
            }
        };
        let handler_file = match parse_entry_string("handlerFile", block) {
            Some(v) => v,
            None => {
                return ParsedManifestResult {
                    manifest: vec![],
                    violations: vec!["Malformed manifest entry: missing routePath or handlerFile".to_string()],
                };
            }
        };

        let options = parse_entry_string("options", block);
        let function_stem = parse_entry_string("functionStem", block);
        let custom_source = parse_entry_string("customSource", block);
        let dev_only = parse_entry_boolean("devOnly", block);

        entries.push(EndpointEntry {
            route_path,
            handler_file,
            options,
            dev_only,
            function_stem,
            custom_source,
        });
    }

    if entries.is_empty() {
        return ParsedManifestResult {
            manifest: vec![],
            violations: vec!["ENDPOINT_MANIFEST is empty or malformed".to_string()],
        };
    }

    ParsedManifestResult {
        manifest: entries,
        violations: vec![],
    }
}

pub fn read_manifest_from_disk(config: &LinterConfig) -> ParsedManifestResult {
    let manifest_path = config.functions_src.join("endpoint-manifest.ts");
    if !manifest_path.exists() {
        return ParsedManifestResult {
            manifest: vec![],
            violations: vec![format!(
                "endpoint-manifest.ts not found at {}",
                manifest_path.display()
            )],
        };
    }

    let manifest_text = match fs::read_to_string(&manifest_path) {
        Ok(t) => t,
        Err(e) => {
            return ParsedManifestResult {
                manifest: vec![],
                violations: vec![format!("Failed to read endpoint-manifest.ts: {}", e)],
            };
        }
    };

    parse_manifest_array(&manifest_text)
}

pub fn get_handler_route_value(handler_path: &Path) -> Option<String> {
    let content = fs::read_to_string(handler_path).ok()?;

    let create_base_app_re = regex::Regex::new(r#"createBaseApp\(\s*['"]([^'"]+)['"]\s*\)"#).unwrap();
    if let Some(caps) = create_base_app_re.captures(&content) {
        if let Some(m) = caps.get(1) {
            return Some(m.as_str().to_string());
        }
    }

    let create_resource_router_re = regex::Regex::new(r#"createResourceRouter\(\s*\{[\s\S]*?resourceName:\s*['"]([^'"]+)['"]"#).unwrap();
    if let Some(caps) = create_resource_router_re.captures(&content) {
        if let Some(m) = caps.get(1) {
            return Some(m.as_str().to_string());
        }
    }

    let strip_re = regex::Regex::new(r#"stripPathPrefix\(\s*['"]([^'"]+)['"]\s*\)"#).unwrap();
    if let Some(caps) = strip_re.captures(&content) {
        if let Some(m) = caps.get(1) {
            return Some(m.as_str().to_string());
        }
    }

    None
}
