use crate::client::{extract_data, ApiClient};
use crate::error::CliError;
use crate::output::print_success;
use crate::types::{CritiqueResult, FinalizeResult, GenerateResult, MealPlanSession};

/// Generate a new meal plan.
pub fn generate(client: &ApiClient) -> Result<(), CliError> {
    let body = client.post_empty("/mealplans/generate")?;
    let data: GenerateResult = extract_data(body)?;
    print_success(&data);
    Ok(())
}

/// Get the latest meal plan session.
pub fn latest(client: &ApiClient) -> Result<(), CliError> {
    let body = client.get("/mealplans/latest")?;
    let data: Option<MealPlanSession> = extract_data(body)?;
    print_success(&data);
    Ok(())
}

/// Get a specific meal plan session by ID.
pub fn get(client: &ApiClient, session_id: &str) -> Result<(), CliError> {
    let body = client.get(&format!("/mealplans/{session_id}"))?;
    let data: MealPlanSession = extract_data(body)?;
    print_success(&data);
    Ok(())
}

/// Critique a meal plan with a message.
pub fn critique(client: &ApiClient, session_id: &str, message: &str) -> Result<(), CliError> {
    let payload = serde_json::json!({ "critique": message });
    let body = client.post_json(&format!("/mealplans/{session_id}/critique"), &payload)?;
    let data: CritiqueResult = extract_data(body)?;
    print_success(&data);
    Ok(())
}

/// Finalize a meal plan session.
pub fn finalize(client: &ApiClient, session_id: &str) -> Result<(), CliError> {
    let body = client.post_empty(&format!("/mealplans/{session_id}/finalize"))?;
    let data: FinalizeResult = extract_data(body)?;
    print_success(&data);
    Ok(())
}
