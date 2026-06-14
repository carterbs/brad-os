use crate::client::{extract_data, ApiClient};
use crate::error::CliError;
use crate::output::print_success;
use crate::types::{
    CritiqueResult, DeleteMealPlanResult, FinalizeResult, GenerateResult, MealPlanSession,
    ReviseResult,
};

fn critique_path(session_id: &str) -> String {
    format!("/mealplans/{session_id}/critique")
}

fn revise_path(session_id: &str) -> String {
    format!("/mealplans/{session_id}/revise")
}

fn add_finalized_critique_guidance(error: CliError) -> CliError {
    match error {
        CliError::Api { code, message }
            if code == "SESSION_FINALIZED" && !message.contains("mealplan revise") =>
        {
            CliError::Api {
                code,
                message: format!("{message}. Use brados mealplan revise for finalized meal plans."),
            }
        }
        other => other,
    }
}

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
    let body = client
        .post_json(&critique_path(session_id), &payload)
        .map_err(add_finalized_critique_guidance)?;
    let data: CritiqueResult = extract_data(body)?;
    print_success(&data);
    Ok(())
}

/// Revise a finalized meal plan with a message.
pub fn revise(client: &ApiClient, session_id: &str, message: &str) -> Result<(), CliError> {
    let payload = serde_json::json!({ "critique": message });
    let body = client.post_json(&revise_path(session_id), &payload)?;
    let data: ReviseResult = extract_data(body)?;
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

/// Delete a meal plan session by ID.
pub fn delete(client: &ApiClient, session_id: &str) -> Result<(), CliError> {
    let body = client.delete(&format!("/mealplans/{session_id}"))?;
    let data: DeleteMealPlanResult = extract_data(body)?;
    print_success(&data);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::thread;

    fn spawn_json_server(body: &'static str) -> (String, thread::JoinHandle<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let base_url = format!("http://{}", listener.local_addr().unwrap());
        let handle = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut buffer = [0_u8; 4096];
            let bytes_read = stream.read(&mut buffer).unwrap();
            let request = String::from_utf8_lossy(&buffer[..bytes_read]).to_string();
            let response = format!(
                "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            stream.write_all(response.as_bytes()).unwrap();
            request
        });
        (base_url, handle)
    }

    #[test]
    fn revise_uses_finalized_revision_endpoint() {
        assert_eq!(revise_path("sess_1"), "/mealplans/sess_1/revise");
    }

    #[test]
    fn critique_uses_draft_critique_endpoint() {
        assert_eq!(critique_path("sess_1"), "/mealplans/sess_1/critique");
    }

    #[test]
    fn finalized_critique_error_suggests_revise() {
        let error = add_finalized_critique_guidance(CliError::Api {
            code: "SESSION_FINALIZED".to_string(),
            message: "Session is already finalized".to_string(),
        });

        match error {
            CliError::Api { code, message } => {
                assert_eq!(code, "SESSION_FINALIZED");
                assert!(message.contains("brados mealplan revise"));
            }
            other => panic!("expected API error, got: {other}"),
        }
    }

    #[test]
    fn delete_issues_delete_request_for_session() {
        let (base_url, handle) = spawn_json_server(
            r#"{"success":true,"data":{"deleted":true,"was_finalized":true,"recency_reconciled":true}}"#,
        );
        let client = ApiClient::new_for_tests(&base_url, "test-token");

        delete(&client, "sess_1").unwrap();

        let request = handle.join().unwrap();
        assert!(request.starts_with("DELETE /mealplans/sess_1 HTTP/1.1"));
        assert!(request.contains("x-firebase-appcheck: test-token"));
    }
}
