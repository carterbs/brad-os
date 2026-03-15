use crate::client::{extract_data, ApiClient};
use crate::error::CliError;
use crate::output::print_success;
use crate::types::{MealPlanSession, ShoppingList};

/// Generate a shopping list.
///
/// If `session_id` is None, fetches the latest meal plan session first.
pub fn generate(client: &ApiClient, session_id: Option<&str>) -> Result<(), CliError> {
    let sid = match session_id {
        Some(id) => id.to_string(),
        None => {
            let body = client.get("/mealplans/latest")?;
            let session: Option<MealPlanSession> = extract_data(body)?;
            match session {
                Some(s) => s.id,
                None => {
                    return Err(CliError::Api {
                        code: "NO_SESSION".to_string(),
                        message: "no meal plan session found; generate one first".to_string(),
                    });
                }
            }
        }
    };

    let body = client.get(&format!("/mealplans/{sid}/shopping-list"))?;
    let data: ShoppingList = extract_data(body)?;
    print_success(&data);
    Ok(())
}
