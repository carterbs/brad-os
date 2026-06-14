use crate::client::{extract_data, ApiClient};
use crate::commands::recipes;
use crate::error::CliError;
use crate::output::print_success;
use crate::types::{Meal, Recipe};
use serde::Serialize;

#[derive(Debug, Serialize)]
struct MealCreateWithRecipeResult {
    meal: Meal,
    recipe_created: bool,
    recipe: Recipe,
}

pub struct CreateMealRequest<'a> {
    pub name: &'a str,
    pub meal_type: &'a str,
    pub effort: u8,
    pub has_red_meat: bool,
    pub prep_ahead: bool,
    pub url: &'a str,
    pub ingredients_json: Option<&'a str>,
    pub steps_json: Option<&'a str>,
}

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
pub fn create(client: &ApiClient, request: CreateMealRequest<'_>) -> Result<(), CliError> {
    let recipe_payload = match request.ingredients_json {
        Some(ingredients) => Some(recipes::build_create_payload(
            "",
            ingredients,
            request.steps_json,
        )?),
        None if request.steps_json.is_some() => {
            return Err(CliError::Deserialize(
                "--steps-json requires --ingredients-json so shopping-list ingredients can be attached to a recipe".to_string(),
            ));
        }
        None => None,
    };

    let payload = serde_json::json!({
        "name": request.name,
        "meal_type": request.meal_type,
        "effort": request.effort,
        "has_red_meat": request.has_red_meat,
        "prep_ahead": request.prep_ahead,
        "url": request.url,
    });
    let body = client.post_json("/meals", &payload)?;
    let meal: Meal = extract_data(body)?;

    let Some(mut recipe_payload) = recipe_payload else {
        print_success(&meal);
        return Ok(());
    };

    recipe_payload["meal_id"] = serde_json::Value::String(meal.id.clone());
    let recipe_body = client.post_json("/recipes", &recipe_payload).map_err(|err| {
        CliError::Api {
            code: "RECIPE_CREATE_FAILED_AFTER_MEAL_CREATE".to_string(),
            message: format!(
                "Meal was created with id '{}', but recipe creation failed: {}. Recovery: run `brados recipes create --meal-id '{}' --ingredients-json '<ingredients-json>'` and include `--steps-json '<steps-json>'` if needed so shopping lists include this meal.",
                meal.id, err, meal.id
            ),
        }
    })?;
    let recipe: Recipe = extract_data(recipe_body)?;
    let result = MealCreateWithRecipeResult {
        meal,
        recipe_created: true,
        recipe,
    };
    print_success(&result);
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
        let payload = build_update_payload(
            Some("X"),
            Some("lunch"),
            Some(2),
            Some(true),
            Some(false),
            Some("http://x"),
        );
        let obj = payload.as_object().unwrap();
        assert_eq!(obj.len(), 6);
    }

    #[test]
    fn meal_create_recipe_payload_rejects_malformed_ingredients_before_posting() {
        let result = recipes::build_create_payload("", "not json", None);

        match result {
            Err(CliError::Deserialize(msg)) => {
                assert!(msg.contains("invalid ingredients JSON"));
            }
            _ => panic!("expected Deserialize error"),
        }
    }

    #[test]
    fn meal_create_recipe_payload_allows_steps_with_ingredients() {
        let result = recipes::build_create_payload(
            "",
            r#"[{"ingredient_id":"chicken","quantity":1,"unit":"lb"}]"#,
            Some(r#"[{"step_number":1,"instruction":"Cook"}]"#),
        )
        .unwrap();

        assert_eq!(result["ingredients"][0]["ingredient_id"], "chicken");
        assert_eq!(result["steps"][0]["step_number"], 1);
    }
}
