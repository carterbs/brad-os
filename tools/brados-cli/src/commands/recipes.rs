use crate::client::{extract_data, ApiClient};
use crate::error::CliError;
use crate::output::print_success;
use crate::types::Recipe;

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
    let parsed_ingredients: serde_json::Value = serde_json::from_str(ingredients_json)
        .map_err(|e| CliError::Deserialize(format!("invalid ingredients JSON: {e}")))?;

    let parsed_steps = match steps_json {
        Some(s) => serde_json::from_str::<serde_json::Value>(s)
            .map_err(|e| CliError::Deserialize(format!("invalid steps JSON: {e}")))?,
        None => serde_json::Value::Null,
    };

    let payload = serde_json::json!({
        "meal_id": meal_id,
        "ingredients": parsed_ingredients,
        "steps": parsed_steps,
    });

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
        let parsed: serde_json::Value = serde_json::from_str(s)
            .map_err(|e| CliError::Deserialize(format!("invalid ingredients JSON: {e}")))?;
        obj.insert("ingredients".to_string(), parsed);
    }

    if clear_steps {
        obj.insert("steps".to_string(), serde_json::Value::Null);
    } else if let Some(s) = steps_json {
        let parsed: serde_json::Value = serde_json::from_str(s)
            .map_err(|e| CliError::Deserialize(format!("invalid steps JSON: {e}")))?;
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
    use crate::error::CliError;

    #[test]
    fn malformed_ingredients_json_produces_clear_error() {
        let bad_json = "not valid json";
        let result: Result<serde_json::Value, CliError> = serde_json::from_str(bad_json)
            .map_err(|e| CliError::Deserialize(format!("invalid ingredients JSON: {e}")));
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
        let result: Result<serde_json::Value, CliError> = serde_json::from_str(bad_json)
            .map_err(|e| CliError::Deserialize(format!("invalid steps JSON: {e}")));
        match result {
            Err(CliError::Deserialize(msg)) => {
                assert!(msg.contains("invalid steps JSON"));
            }
            _ => panic!("expected Deserialize error"),
        }
    }
}
