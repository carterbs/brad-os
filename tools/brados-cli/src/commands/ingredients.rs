use crate::client::{extract_data, ApiClient};
use crate::error::CliError;
use crate::output::print_success;
use crate::types::{Ingredient, VALID_STORE_SECTIONS};

/// List all ingredients.
pub fn list(client: &ApiClient) -> Result<(), CliError> {
    let body = client.get("/ingredients")?;
    let data: Vec<Ingredient> = extract_data(body)?;
    print_success(&data);
    Ok(())
}

/// Get a single ingredient by ID.
pub fn get(client: &ApiClient, id: &str) -> Result<(), CliError> {
    let body = client.get(&format!("/ingredients/{id}"))?;
    let data: Ingredient = extract_data(body)?;
    print_success(&data);
    Ok(())
}

/// Validate that a store section is one of the allowed values.
fn validate_store_section(section: &str) -> Result<(), CliError> {
    if !VALID_STORE_SECTIONS.contains(&section) {
        return Err(CliError::Deserialize(format!(
            "invalid store_section '{}'. Valid values: {}",
            section,
            VALID_STORE_SECTIONS.join(", ")
        )));
    }
    Ok(())
}

/// Create a new ingredient.
pub fn create(client: &ApiClient, name: &str, store_section: &str) -> Result<(), CliError> {
    validate_store_section(store_section)?;

    let payload = serde_json::json!({
        "name": name,
        "store_section": store_section,
    });

    let body = client.post_json("/ingredients", &payload)?;
    let data: Ingredient = extract_data(body)?;
    print_success(&data);
    Ok(())
}

/// Update an existing ingredient.
pub fn update(
    client: &ApiClient,
    id: &str,
    name: Option<&str>,
    store_section: Option<&str>,
) -> Result<(), CliError> {
    if let Some(section) = store_section {
        validate_store_section(section)?;
    }

    let mut obj = serde_json::Map::new();
    if let Some(v) = name {
        obj.insert("name".to_string(), serde_json::Value::String(v.to_string()));
    }
    if let Some(v) = store_section {
        obj.insert(
            "store_section".to_string(),
            serde_json::Value::String(v.to_string()),
        );
    }

    let payload = serde_json::Value::Object(obj);
    let body = client.put_json(&format!("/ingredients/{id}"), &payload)?;
    let data: Ingredient = extract_data(body)?;
    print_success(&data);
    Ok(())
}

/// Delete an ingredient by ID.
pub fn delete(client: &ApiClient, id: &str) -> Result<(), CliError> {
    let body = client.delete(&format!("/ingredients/{id}"))?;
    print_success(&body);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_store_section_passes() {
        assert!(validate_store_section("Produce").is_ok());
        assert!(validate_store_section("Dairy & Eggs").is_ok());
        assert!(validate_store_section("Pantry Staples").is_ok());
    }

    #[test]
    fn invalid_store_section_fails() {
        let result = validate_store_section("Aisle 7");
        match result {
            Err(CliError::Deserialize(msg)) => {
                assert!(msg.contains("invalid store_section"));
                assert!(msg.contains("Produce"));
            }
            _ => panic!("expected Deserialize error"),
        }
    }
}
