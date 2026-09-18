use crate::runner::{CommandCall, CommandRunner};
use std::io::Write;
use std::thread;
use std::time::Duration;

pub const DEFAULT_IMAGE: &str = "brad-os-api:local-test";
pub const DEFAULT_PORT: u16 = 18_981;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ContainerTestConfig {
    pub image: String,
    pub container_name: String,
    pub port: u16,
    pub build_only: bool,
}

impl Default for ContainerTestConfig {
    fn default() -> Self {
        Self {
            image: DEFAULT_IMAGE.to_string(),
            container_name: format!("brad-os-api-test-{}", std::process::id()),
            port: DEFAULT_PORT,
            build_only: false,
        }
    }
}

pub fn parse_args(args: &[String]) -> Result<ContainerTestConfig, String> {
    let mut config = ContainerTestConfig::default();
    let mut index = 0;
    while index < args.len() {
        match args[index].as_str() {
            "--build-only" => config.build_only = true,
            "--image" => {
                index += 1;
                config.image = required_arg(args, index, "--image")?.to_string();
            }
            "--port" => {
                index += 1;
                let raw = required_arg(args, index, "--port")?;
                config.port = raw
                    .parse::<u16>()
                    .ok()
                    .filter(|port| *port > 0)
                    .ok_or_else(|| format!("Invalid --port '{raw}'."))?;
            }
            value => return Err(format!("Unknown container-test argument '{value}'.")),
        }
        index += 1;
    }
    Ok(config)
}

pub fn execute<R: CommandRunner, W: Write>(
    runner: &R,
    writer: &mut W,
    config: &ContainerTestConfig,
) -> Result<(), String> {
    writeln!(writer, "Building production image {}", config.image)
        .map_err(|error| error.to_string())?;
    checked(
        runner,
        CommandCall {
            program: "docker".to_string(),
            args: vec![
                "build".to_string(),
                "--tag".to_string(),
                config.image.clone(),
                ".".to_string(),
            ],
            current_dir: None,
        },
        "Production Docker build failed",
    )?;

    checked(
        runner,
        CommandCall {
            program: "docker".to_string(),
            args: vec![
                "image".to_string(),
                "inspect".to_string(),
                config.image.clone(),
                "--format={{.Config.User}}".to_string(),
            ],
            current_dir: None,
        },
        "Unable to inspect the production image",
    )
    .and_then(|result| {
        if result.stdout.trim() == "node" {
            Ok(result)
        } else {
            Err(format!(
                "Production image must run as user 'node', found '{}'.",
                result.stdout.trim()
            ))
        }
    })?;

    if config.build_only {
        writeln!(writer, "Production image build and non-root check passed.")
            .map_err(|error| error.to_string())?;
        return Ok(());
    }

    checked(
        runner,
        CommandCall {
            program: "docker".to_string(),
            args: vec![
                "run".to_string(),
                "--detach".to_string(),
                "--name".to_string(),
                config.container_name.clone(),
                "--publish".to_string(),
                format!("127.0.0.1:{}:8080", config.port),
                "--env".to_string(),
                "PORT=8080".to_string(),
                "--env".to_string(),
                "NODE_ENV=production".to_string(),
                "--env".to_string(),
                "GOOGLE_CLOUD_PROJECT=brad-os-container-test".to_string(),
                "--env".to_string(),
                "GCLOUD_PROJECT=brad-os-container-test".to_string(),
                config.image.clone(),
            ],
            current_dir: None,
        },
        "Unable to start the production container",
    )?;

    let test_result = run_container_assertions(runner, config);
    let cleanup_result = stop_and_remove(runner, config);
    test_result?;
    cleanup_result?;

    writeln!(
        writer,
        "Container passed /healthz, dev/prod API health, and SIGTERM checks."
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}

fn run_container_assertions<R: CommandRunner>(
    runner: &R,
    config: &ContainerTestConfig,
) -> Result<(), String> {
    wait_for_health(runner, config, 60)?;
    for path in ["/api/dev/health", "/api/prod/health"] {
        checked(
            runner,
            CommandCall {
                program: "curl".to_string(),
                args: vec![
                    "--fail".to_string(),
                    "--silent".to_string(),
                    "--show-error".to_string(),
                    format!("http://127.0.0.1:{}{path}", config.port),
                ],
                current_dir: None,
            },
            &format!("Container route {path} failed"),
        )?;
    }
    Ok(())
}

fn wait_for_health<R: CommandRunner>(
    runner: &R,
    config: &ContainerTestConfig,
    max_attempts: usize,
) -> Result<(), String> {
    for attempt in 0..max_attempts {
        let result = runner.run(CommandCall {
            program: "curl".to_string(),
            args: vec![
                "--fail".to_string(),
                "--silent".to_string(),
                "--show-error".to_string(),
                format!("http://127.0.0.1:{}/healthz", config.port),
            ],
            current_dir: None,
        });
        if result.success() {
            return Ok(());
        }
        if attempt + 1 < max_attempts {
            thread::sleep(Duration::from_millis(500));
        }
    }
    Err("Production container did not become healthy within 30 seconds.".to_string())
}

fn stop_and_remove<R: CommandRunner>(
    runner: &R,
    config: &ContainerTestConfig,
) -> Result<(), String> {
    let stop = runner.run(CommandCall {
        program: "docker".to_string(),
        args: vec![
            "stop".to_string(),
            "--time=15".to_string(),
            config.container_name.clone(),
        ],
        current_dir: None,
    });
    if !stop.success() {
        let _ = runner.run(CommandCall {
            program: "docker".to_string(),
            args: vec![
                "rm".to_string(),
                "--force".to_string(),
                config.container_name.clone(),
            ],
            current_dir: None,
        });
        return Err(format!(
            "Container did not stop cleanly after SIGTERM: {}",
            stop.stdout.trim()
        ));
    }
    let exit = checked(
        runner,
        CommandCall {
            program: "docker".to_string(),
            args: vec![
                "inspect".to_string(),
                config.container_name.clone(),
                "--format={{.State.ExitCode}}".to_string(),
            ],
            current_dir: None,
        },
        "Unable to inspect the stopped container",
    )?;
    let remove = checked(
        runner,
        CommandCall {
            program: "docker".to_string(),
            args: vec!["rm".to_string(), config.container_name.clone()],
            current_dir: None,
        },
        "Unable to remove the stopped test container",
    );
    if exit.stdout.trim() != "0" {
        return Err(format!(
            "Container exited with status {} after SIGTERM.",
            exit.stdout.trim()
        ));
    }
    remove?;
    Ok(())
}

fn checked<R: CommandRunner>(
    runner: &R,
    command: CommandCall,
    message: &str,
) -> Result<crate::runner::CommandResult, String> {
    let result = runner.run(command);
    if result.success() {
        Ok(result)
    } else {
        Err(format!("{message}: {}", result.stdout.trim()))
    }
}

fn required_arg<'a>(args: &'a [String], index: usize, flag: &str) -> Result<&'a str, String> {
    args.get(index)
        .map(String::as_str)
        .ok_or_else(|| format!("{flag} requires a value."))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_modes_and_rejects_bad_arguments() {
        let config = parse_args(&[
            "--build-only".to_string(),
            "--image".to_string(),
            "test:sha".to_string(),
            "--port".to_string(),
            "18000".to_string(),
        ])
        .unwrap();
        assert!(config.build_only);
        assert_eq!(config.image, "test:sha");
        assert_eq!(config.port, 18_000);
        assert!(parse_args(&["--port".to_string(), "0".to_string()]).is_err());
        assert!(parse_args(&["--image".to_string()]).is_err());
        assert!(parse_args(&["--delete".to_string()]).is_err());
    }
}
