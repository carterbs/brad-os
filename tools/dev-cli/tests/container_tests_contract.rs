use dev_cli::container_tests::{execute, ContainerTestConfig};
use dev_cli::runner::{CommandCall, CommandResult, CommandRunner};
use std::cell::RefCell;
use std::collections::VecDeque;

#[derive(Default)]
struct FakeRunner {
    results: RefCell<VecDeque<CommandResult>>,
    calls: RefCell<Vec<CommandCall>>,
}

impl FakeRunner {
    fn with_results(results: Vec<CommandResult>) -> Self {
        Self {
            results: RefCell::new(results.into()),
            calls: RefCell::new(Vec::new()),
        }
    }

    fn calls(&self) -> Vec<CommandCall> {
        self.calls.borrow().clone()
    }
}

impl CommandRunner for FakeRunner {
    fn run(&self, command: CommandCall) -> CommandResult {
        self.calls.borrow_mut().push(command);
        self.results
            .borrow_mut()
            .pop_front()
            .unwrap_or(CommandResult {
                status: 99,
                stdout: "unexpected command".to_string(),
            })
    }
}

fn ok(stdout: &str) -> CommandResult {
    CommandResult {
        status: 0,
        stdout: stdout.to_string(),
    }
}

fn fail(stdout: &str) -> CommandResult {
    CommandResult {
        status: 1,
        stdout: stdout.to_string(),
    }
}

fn config(build_only: bool) -> ContainerTestConfig {
    ContainerTestConfig {
        image: "brad-os-api:test".to_string(),
        container_name: "brad-os-api-test-fixture".to_string(),
        port: 18_981,
        build_only,
    }
}

#[test]
fn build_only_builds_and_verifies_non_root_user() {
    let runner = FakeRunner::with_results(vec![ok("built"), ok("node\n")]);
    let mut output = Vec::new();
    execute(&runner, &mut output, &config(true)).unwrap();
    let calls = runner.calls();
    assert_eq!(calls.len(), 2);
    assert_eq!(calls[0].args[0], "build");
    assert_eq!(calls[1].args[0..2], ["image", "inspect"]);
    assert!(String::from_utf8(output)
        .unwrap()
        .contains("non-root check passed"));
}

#[test]
fn full_run_checks_routes_and_graceful_shutdown() {
    let runner = FakeRunner::with_results(vec![
        ok("built"),
        ok("node"),
        ok("container-id"),
        ok("healthy"),
        ok("dev healthy"),
        ok("prod healthy"),
        ok("stopped"),
        ok("0"),
        ok("removed"),
    ]);
    let mut output = Vec::new();
    execute(&runner, &mut output, &config(false)).unwrap();
    let calls = runner.calls();
    assert_eq!(calls.len(), 9);
    assert_eq!(calls[2].args[0], "run");
    assert!(calls[2].args.contains(&"NODE_ENV=production".to_string()));
    assert!(calls[4]
        .args
        .iter()
        .any(|arg| arg.ends_with("/api/dev/health")));
    assert!(calls[5]
        .args
        .iter()
        .any(|arg| arg.ends_with("/api/prod/health")));
    assert_eq!(calls[6].args[0], "stop");
    assert_eq!(calls[8].args[0], "rm");
    assert!(String::from_utf8(output)
        .unwrap()
        .contains("dev/prod API health"));
}

#[test]
fn assertion_failure_still_stops_and_removes_container() {
    let runner = FakeRunner::with_results(vec![
        ok("built"),
        ok("node"),
        ok("container-id"),
        ok("healthy"),
        fail("dev route failed"),
        ok("stopped"),
        ok("0"),
        ok("removed"),
    ]);
    let error = execute(&runner, &mut Vec::new(), &config(false)).unwrap_err();
    assert!(error.contains("/api/dev/health"));
    let calls = runner.calls();
    assert!(calls
        .iter()
        .any(|call| call.args.first().map(String::as_str) == Some("stop")));
    assert!(calls
        .iter()
        .any(|call| call.args.first().map(String::as_str) == Some("rm")));
}

#[test]
fn wrong_image_user_stops_before_starting_container() {
    let runner = FakeRunner::with_results(vec![ok("built"), ok("root")]);
    let error = execute(&runner, &mut Vec::new(), &config(false)).unwrap_err();
    assert!(error.contains("must run as user 'node'"));
    assert_eq!(runner.calls().len(), 2);
}

#[test]
fn stop_failure_forces_exact_test_container_removal() {
    let runner = FakeRunner::with_results(vec![
        ok("built"),
        ok("node"),
        ok("container-id"),
        ok("healthy"),
        ok("dev healthy"),
        ok("prod healthy"),
        fail("timeout"),
        ok("force removed"),
    ]);
    let error = execute(&runner, &mut Vec::new(), &config(false)).unwrap_err();
    assert!(error.contains("did not stop cleanly"));
    let calls = runner.calls();
    let remove = calls.last().unwrap();
    assert_eq!(
        remove.args,
        vec![
            "rm".to_string(),
            "--force".to_string(),
            "brad-os-api-test-fixture".to_string()
        ]
    );
}
