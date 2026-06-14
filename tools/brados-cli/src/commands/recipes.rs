use crate::client::{extract_data, ApiClient};
use crate::error::CliError;
use crate::output::print_success;
use crate::types::Recipe;

pub(crate) fn parse_json_arg(
    arg_name: &str,
    raw_json: &str,
) -> Result<serde_json::Value, CliError> {
    serde_json::from_str(raw_json)
        .map_err(|e| CliError::Deserialize(format!("invalid {arg_name} JSON: {e}")))
}

pub(crate) fn build_create_payload(
    meal_id: &str,
    ingredients_json: &str,
    steps_json: Option<&str>,
) -> Result<serde_json::Value, CliError> {
    let parsed_ingredients = parse_json_arg("ingredients", ingredients_json)?;
    let parsed_steps = match steps_json {
        Some(s) => parse_json_arg("steps", s)?,
        None => serde_json::Value::Null,
    };

    Ok(serde_json::json!({
        "meal_id": meal_id,
        "ingredients": parsed_ingredients,
        "steps": parsed_steps,
    }))
}

/// List all recipes.
pub fn list(client: &ApiClient) -> Result<(), CliError> {
    let body = client.get("/recipes")?;
    let data: Vec<Recipe> = extract_data(body)?;
    print_success(&data);
    Ok(())
}

/// Get a single recipe by ID or by meal ID.
pub fn get(client: &ApiClient, id: Option<&str>, meal_id: Option<&str>) -> Result<(), CliError> {
    let body = match (id, meal_id) {
        (Some(id), _) => client.get(&format!("/recipes/{id}"))?,
        (_, Some(meal_id)) => client.get(&format!("/recipes/by-meal/{meal_id}"))?,
        _ => {
            return Err(CliError::Deserialize(
                "either --id or --meal-id must be provided".to_string(),
            ));
        }
    };
    let data: Recipe = extract_data(body)?;
    print_success(&data);
    Ok(())
}

/// Create a new recipe for a meal.
pub fn create(
    client: &ApiClient,
    meal_id: &str,
    ingredients_json: &str,
    steps_json: Option<&str>,
) -> Result<(), CliError> {
    let payload = build_create_payload(meal_id, ingredients_json, steps_json)?;
    let body = client.post_json("/recipes", &payload)?;
    let data: Recipe = extract_data(body)?;
    print_success(&data);
    Ok(())
}

/// Update an existing recipe.
pub fn update(
    client: &ApiClient,
    id: &str,
    ingredients_json: Option<&str>,
    steps_json: Option<&str>,
    clear_steps: bool,
) -> Result<(), CliError> {
    let mut obj = serde_json::Map::new();

    if let Some(s) = ingredients_json {
        let parsed = parse_json_arg("ingredients", s)?;
        obj.insert("ingredients".to_string(), parsed);
    }

    if clear_steps {
        obj.insert("steps".to_string(), serde_json::Value::Null);
    } else if let Some(s) = steps_json {
        let parsed = parse_json_arg("steps", s)?;
        obj.insert("steps".to_string(), parsed);
    }

    let payload = serde_json::Value::Object(obj);
    let body = client.put_json(&format!("/recipes/{id}"), &payload)?;
    let data: Recipe = extract_data(body)?;
    print_success(&data);
    Ok(())
}

/// Delete a recipe by ID.
pub fn delete(client: &ApiClient, id: &str) -> Result<(), CliError> {
    let body = client.delete(&format!("/recipes/{id}"))?;
    print_success(&body);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn malformed_ingredients_json_produces_clear_error() {
        let bad_json = "not valid json";
        let result = parse_json_arg("ingredients", bad_json);
        match result {
            Err(CliError::Deserialize(msg)) => {
                assert!(msg.contains("invalid ingredients JSON"));
            }
            _ => panic!("expected Deserialize error"),
        }
    }

    #[test]
    fn malformed_steps_json_produces_clear_error() {
        let bad_json = "{not json}";
        let result = parse_json_arg("steps", bad_json);
        match result {
            Err(CliError::Deserialize(msg)) => {
                assert!(msg.contains("invalid steps JSON"));
            }
            _ => panic!("expected Deserialize error"),
        }
    }

    #[test]
    fn build_create_payload_includes_parsed_ingredients_and_steps() {
        let payload = build_create_payload(
            "meal_123",
            r#"[{"ingredient_id":"chicken","quantity":1,"unit":"lb"}]"#,
            Some(r#"[{"step_number":1,"instruction":"Cook chicken"}]"#),
        )
        .unwrap();

        assert_eq!(payload["meal_id"], "meal_123");
        assert_eq!(payload["ingredients"][0]["ingredient_id"], "chicken");
        assert_eq!(payload["steps"][0]["instruction"], "Cook chicken");
    }

    #[test]
    fn build_create_payload_uses_null_steps_when_omitted() {
        let payload =
            build_create_payload("meal_123", r#"[{"ingredient_id":"bread"}]"#, None).unwrap();

        assert_eq!(payload["meal_id"], "meal_123");
        assert!(payload["steps"].is_null());
    }
}
