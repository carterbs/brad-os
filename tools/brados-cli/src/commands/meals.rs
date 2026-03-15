use crate::client::{extract_data, ApiClient};
use crate::error::CliError;
use crate::output::print_success;
use crate::types::Meal;

/// List all meals.
pub fn list(client: &ApiClient) -> Result<(), CliError> {
    let body = client.get("/meals")?;
    let data: Vec<Meal> = extract_data(body)?;
    print_success(&data);
    Ok(())
}

/// Get a single meal by ID.
pub fn get(client: &ApiClient, id: &str) -> Result<(), CliError> {
    let body = client.get(&format!("/meals/{id}"))?;
    let data: Meal = extract_data(body)?;
    print_success(&data);
    Ok(())
}

/// Create a new meal.
pub fn create(
    client: &ApiClient,
    name: &str,
    meal_type: &str,
    effort: u8,
    has_red_meat: bool,
    prep_ahead: bool,
    url: &str,
) -> Result<(), CliError> {
    let payload = serde_json::json!({
        "name": name,
        "meal_type": meal_type,
        "effort": effort,
        "has_red_meat": has_red_meat,
        "prep_ahead": prep_ahead,
        "url": url,
    });
    let body = client.post_json("/meals", &payload)?;
    let data: Meal = extract_data(body)?;
    print_success(&data);
    Ok(())
}

/// Build update payload from optional fields.
pub fn build_update_payload(
    name: Option<&str>,
    meal_type: Option<&str>,
    effort: Option<u8>,
    has_red_meat: Option<bool>,
    prep_ahead: Option<bool>,
    url: Option<&str>,
) -> serde_json::Value {
    let mut obj = serde_json::Map::new();
    if let Some(v) = name {
        obj.insert("name".to_string(), serde_json::Value::String(v.to_string()));
    }
    if let Some(v) = meal_type {
        obj.insert(
            "meal_type".to_string(),
            serde_json::Value::String(v.to_string()),
        );
    }
    if let Some(v) = effort {
        obj.insert("effort".to_string(), serde_json::json!(v));
    }
    if let Some(v) = has_red_meat {
        obj.insert("has_red_meat".to_string(), serde_json::json!(v));
    }
    if let Some(v) = prep_ahead {
        obj.insert("prep_ahead".to_string(), serde_json::json!(v));
    }
    if let Some(v) = url {
        obj.insert("url".to_string(), serde_json::Value::String(v.to_string()));
    }
    serde_json::Value::Object(obj)
}

/// Update an existing meal.
#[allow(clippy::too_many_arguments)]
pub fn update(
    client: &ApiClient,
    id: &str,
    name: Option<&str>,
    meal_type: Option<&str>,
    effort: Option<u8>,
    has_red_meat: Option<bool>,
    prep_ahead: Option<bool>,
    url: Option<&str>,
) -> Result<(), CliError> {
    let payload = build_update_payload(name, meal_type, effort, has_red_meat, prep_ahead, url);
    let body = client.put_json(&format!("/meals/{id}"), &payload)?;
    let data: Meal = extract_data(body)?;
    print_success(&data);
    Ok(())
}

/// Delete a meal by ID.
pub fn delete(client: &ApiClient, id: &str) -> Result<(), CliError> {
    let body = client.delete(&format!("/meals/{id}"))?;
    // The API returns {success: true, data: {}} or similar
    print_success(&body);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_update_payload_only_includes_provided_fields() {
        let payload = build_update_payload(Some("New Name"), None, Some(4), None, None, None);
        let obj = payload.as_object().unwrap();
        assert_eq!(obj.len(), 2);
        assert_eq!(obj["name"], "New Name");
        assert_eq!(obj["effort"], 4);
        assert!(!obj.contains_key("meal_type"));
        assert!(!obj.contains_key("has_red_meat"));
    }

    #[test]
    fn build_update_payload_empty_when_no_fields() {
        let payload = build_update_payload(None, None, None, None, None, None);
        let obj = payload.as_object().unwrap();
        assert!(obj.is_empty());
    }

    #[test]
    fn build_update_payload_all_fields() {
        let payload =
            build_update_payload(Some("X"), Some("lunch"), Some(2), Some(true), Some(false), Some("http://x"));
        let obj = payload.as_object().unwrap();
        assert_eq!(obj.len(), 6);
    }
}
