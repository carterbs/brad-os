use std::process::Command;
use std::{
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    thread::{self, JoinHandle},
    time::Duration,
};

fn brados_bin() -> Command {
    Command::new(env!("CARGO_BIN_EXE_brados"))
}

#[derive(Debug)]
struct RecordedRequest {
    method: String,
    path: String,
    body: serde_json::Value,
}

fn spawn_json_server(response_bodies: Vec<String>) -> (String, JoinHandle<Vec<RecordedRequest>>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    let handle = thread::spawn(move || {
        let mut requests = Vec::new();
        for response_body in response_bodies {
            let (mut stream, _) = listener.accept().unwrap();
            requests.push(read_request(&mut stream));
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                response_body.len(),
                response_body
            );
            stream.write_all(response.as_bytes()).unwrap();
        }
        requests
    });

    (format!("http://{addr}"), handle)
}

fn read_request(stream: &mut TcpStream) -> RecordedRequest {
    stream
        .set_read_timeout(Some(Duration::from_secs(2)))
        .unwrap();
    let mut bytes = Vec::new();
    let mut buffer = [0_u8; 1024];
    let header_end = loop {
        let read_count = stream.read(&mut buffer).unwrap();
        assert!(read_count > 0, "client closed connection before headers");
        bytes.extend_from_slice(&buffer[..read_count]);
        if let Some(idx) = bytes.windows(4).position(|window| window == b"\r\n\r\n") {
            break idx + 4;
        }
    };

    let headers = String::from_utf8_lossy(&bytes[..header_end]);
    let mut lines = headers.lines();
    let request_line = lines.next().unwrap();
    let mut request_parts = request_line.split_whitespace();
    let method = request_parts.next().unwrap().to_string();
    let path = request_parts.next().unwrap().to_string();
    let content_length = headers
        .lines()
        .find_map(|line| {
            let (name, value) = line.split_once(':')?;
            name.eq_ignore_ascii_case("content-length")
                .then(|| value.trim().parse::<usize>().unwrap())
        })
        .unwrap_or(0);

    while bytes.len() < header_end + content_length {
        let read_count = stream.read(&mut buffer).unwrap();
        assert!(read_count > 0, "client closed connection before body");
        bytes.extend_from_slice(&buffer[..read_count]);
    }

    let body_bytes = &bytes[header_end..header_end + content_length];
    let body = serde_json::from_slice(body_bytes).unwrap_or(serde_json::Value::Null);

    RecordedRequest { method, path, body }
}

fn meal_response(id: &str) -> String {
    format!(
        r#"{{
            "success": true,
            "data": {{
                "id": "{id}",
                "name": "Chicken Salad Sandwiches",
                "meal_type": "lunch",
                "effort": 2,
                "has_red_meat": false,
                "prep_ahead": true,
                "url": "https://example.com",
                "created_at": "2026-06-14T00:00:00Z",
                "updated_at": "2026-06-14T00:00:00Z"
            }}
        }}"#
    )
}

fn recipe_response(id: &str, meal_id: &str) -> String {
    format!(
        r#"{{
            "success": true,
            "data": {{
                "id": "{id}",
                "meal_id": "{meal_id}",
                "ingredients": [
                    {{"ingredient_id": "chicken", "quantity": 1, "unit": "lb"}}
                ],
                "steps": [
                    {{"step_number": 1, "instruction": "Mix filling"}}
                ],
                "created_at": "2026-06-14T00:00:00Z",
                "updated_at": "2026-06-14T00:00:00Z"
            }}
        }}"#
    )
}

#[test]
fn help_exits_zero() {
    let output = brados_bin().arg("--help").output().unwrap();
    assert!(
        output.status.success(),
        "expected exit 0 for --help, got {:?}",
        output.status
    );
}

#[test]
fn missing_appcheck_token_exits_one_with_json_error() {
    let output = brados_bin()
        .args(["meals", "list"])
        .env_remove("BRADOS_APPCHECK_TOKEN")
        .output()
        .unwrap();

    assert_eq!(
        output.status.code(),
        Some(1),
        "expected exit 1, got {:?}",
        output.status
    );

    let stderr = String::from_utf8_lossy(&output.stderr);
    let parsed: serde_json::Value = serde_json::from_str(stderr.trim())
        .unwrap_or_else(|e| panic!("stderr is not valid JSON: {e}\nstderr was: {stderr}"));

    assert_eq!(parsed["error"]["code"], "MISSING_CONFIG");
}

#[test]
fn recipes_help_exits_zero() {
    let output = brados_bin().args(["recipes", "--help"]).output().unwrap();
    assert!(
        output.status.success(),
        "expected exit 0 for recipes --help, got {:?}",
        output.status
    );
}

#[test]
fn ingredients_help_exits_zero() {
    let output = brados_bin()
        .args(["ingredients", "--help"])
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "expected exit 0 for ingredients --help, got {:?}",
        output.status
    );
}

#[test]
fn meals_create_without_recipe_args_posts_only_meal() {
    let (base_url, server) = spawn_json_server(vec![meal_response("meal_basic")]);
    let output = brados_bin()
        .args([
            "meals",
            "create",
            "--name",
            "Chicken Salad Sandwiches",
            "--meal-type",
            "lunch",
            "--effort",
            "2",
            "--prep-ahead",
            "--url",
            "https://example.com",
        ])
        .env("BRADOS_APPCHECK_TOKEN", "test-token")
        .env("BRADOS_API_URL", base_url)
        .output()
        .unwrap();

    assert!(
        output.status.success(),
        "expected success, stderr was {}",
        String::from_utf8_lossy(&output.stderr)
    );
    let stdout: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(stdout["id"], "meal_basic");

    let requests = server.join().unwrap();
    assert_eq!(requests.len(), 1);
    assert_eq!(requests[0].method, "POST");
    assert_eq!(requests[0].path, "/meals");
    assert_eq!(requests[0].body["name"], "Chicken Salad Sandwiches");
    assert_eq!(requests[0].body["prep_ahead"], true);
}

#[test]
fn meals_create_with_recipe_args_posts_meal_then_recipe_with_returned_meal_id() {
    let (base_url, server) = spawn_json_server(vec![
        meal_response("meal_with_recipe"),
        recipe_response("recipe_1", "meal_with_recipe"),
    ]);
    let output = brados_bin()
        .args([
            "meals",
            "create",
            "--name",
            "Chicken Salad Sandwiches",
            "--meal-type",
            "lunch",
            "--effort",
            "2",
            "--prep-ahead",
            "--url",
            "https://example.com",
            "--ingredients-json",
            r#"[{"ingredient_id":"chicken","quantity":1,"unit":"lb"}]"#,
            "--steps-json",
            r#"[{"step_number":1,"instruction":"Mix filling"}]"#,
        ])
        .env("BRADOS_APPCHECK_TOKEN", "test-token")
        .env("BRADOS_API_URL", base_url)
        .output()
        .unwrap();

    assert!(
        output.status.success(),
        "expected success, stderr was {}",
        String::from_utf8_lossy(&output.stderr)
    );
    let stdout: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(stdout["meal"]["id"], "meal_with_recipe");
    assert_eq!(stdout["recipe_created"], true);
    assert_eq!(stdout["recipe"]["id"], "recipe_1");

    let requests = server.join().unwrap();
    assert_eq!(requests.len(), 2);
    assert_eq!(requests[0].path, "/meals");
    assert_eq!(requests[1].method, "POST");
    assert_eq!(requests[1].path, "/recipes");
    assert_eq!(requests[1].body["meal_id"], "meal_with_recipe");
    assert_eq!(
        requests[1].body["ingredients"][0]["ingredient_id"],
        "chicken"
    );
    assert_eq!(requests[1].body["steps"][0]["instruction"], "Mix filling");
}

#[test]
fn meals_create_rejects_steps_json_without_ingredients_json() {
    let output = brados_bin()
        .args([
            "meals",
            "create",
            "--name",
            "Chicken Salad Sandwiches",
            "--meal-type",
            "lunch",
            "--effort",
            "2",
            "--url",
            "https://example.com",
            "--steps-json",
            r#"[{"step_number":1,"instruction":"Mix filling"}]"#,
        ])
        .env("BRADOS_APPCHECK_TOKEN", "test-token")
        .output()
        .unwrap();

    assert_eq!(output.status.code(), Some(2));
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        stderr.contains("--ingredients-json"),
        "stderr was: {stderr}"
    );
}

#[test]
fn meals_create_rejects_malformed_ingredients_json_with_clear_error() {
    let output = brados_bin()
        .args([
            "meals",
            "create",
            "--name",
            "Chicken Salad Sandwiches",
            "--meal-type",
            "lunch",
            "--effort",
            "2",
            "--url",
            "https://example.com",
            "--ingredients-json",
            "not json",
        ])
        .env("BRADOS_APPCHECK_TOKEN", "test-token")
        .env("BRADOS_API_URL", "http://127.0.0.1:9")
        .output()
        .unwrap();

    assert_eq!(output.status.code(), Some(1));
    let stderr = String::from_utf8_lossy(&output.stderr);
    let parsed: serde_json::Value = serde_json::from_str(stderr.trim())
        .unwrap_or_else(|e| panic!("stderr is not valid JSON: {e}\nstderr was: {stderr}"));
    assert_eq!(parsed["error"]["code"], "DESERIALIZE_ERROR");
    assert!(parsed["error"]["message"]
        .as_str()
        .unwrap()
        .contains("invalid ingredients JSON"));
}

#[test]
fn meals_create_recipe_failure_reports_created_meal_id_and_recovery_path() {
    let recipe_error = r#"{
        "success": false,
        "error": {
            "code": "VALIDATION_ERROR",
            "message": "recipe ingredients are invalid"
        }
    }"#
    .to_string();
    let (base_url, server) = spawn_json_server(vec![meal_response("meal_partial"), recipe_error]);
    let output = brados_bin()
        .args([
            "meals",
            "create",
            "--name",
            "Chicken Salad Sandwiches",
            "--meal-type",
            "lunch",
            "--effort",
            "2",
            "--url",
            "https://example.com",
            "--ingredients-json",
            r#"[{"ingredient_id":"chicken","quantity":1,"unit":"lb"}]"#,
        ])
        .env("BRADOS_APPCHECK_TOKEN", "test-token")
        .env("BRADOS_API_URL", base_url)
        .output()
        .unwrap();

    assert_eq!(output.status.code(), Some(1));
    let stderr = String::from_utf8_lossy(&output.stderr);
    let parsed: serde_json::Value = serde_json::from_str(stderr.trim())
        .unwrap_or_else(|e| panic!("stderr is not valid JSON: {e}\nstderr was: {stderr}"));
    assert_eq!(
        parsed["error"]["code"],
        "RECIPE_CREATE_FAILED_AFTER_MEAL_CREATE"
    );
    let message = parsed["error"]["message"].as_str().unwrap();
    assert!(message.contains("meal_partial"), "message was: {message}");
    assert!(
        message.contains("brados recipes create --meal-id 'meal_partial'"),
        "message was: {message}"
    );

    let requests = server.join().unwrap();
    assert_eq!(requests.len(), 2);
    assert_eq!(requests[0].path, "/meals");
    assert_eq!(requests[1].path, "/recipes");
}

#[test]
fn unknown_subcommand_exits_two() {
    let output = brados_bin().arg("nonexistent").output().unwrap();
    // clap exits with code 2 for usage errors
    assert_eq!(
        output.status.code(),
        Some(2),
        "expected exit 2 for unknown subcommand, got {:?}",
        output.status
    );
}
