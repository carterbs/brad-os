#[derive(Debug, Clone)]
pub struct CommandCall {
    pub program: String,
    pub args: Vec<String>,
    pub current_dir: Option<std::path::PathBuf>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommandResult {
    pub status: i32,
    pub stdout: String,
}

impl CommandResult {
    pub fn success(&self) -> bool {
        self.status == 0
    }
}

pub trait CommandRunner {
    fn run(&self, command: CommandCall) -> CommandResult;
}

#[derive(Default)]
pub struct RealCommandRunner;

impl CommandRunner for RealCommandRunner {
    fn run(&self, command: CommandCall) -> CommandResult {
        let mut process = std::process::Command::new(&command.program);
        process.args(&command.args);
        if let Some(current_dir) = command.current_dir.as_deref() {
            process.current_dir(current_dir);
        }

        let result = match process.output() {
            Ok(output) => CommandResult {
                status: output.status.code().unwrap_or(1),
                stdout: {
                    let mut merged = String::new();
                    merged.push_str(&String::from_utf8_lossy(&output.stdout));
                    merged.push_str(&String::from_utf8_lossy(&output.stderr));
                    merged
                },
            },
            Err(_) => CommandResult {
                status: 1,
                stdout: String::new(),
            },
        };

        result
    }
}

impl CommandCall {
    pub fn new(program: impl Into<String>, args: Vec<String>) -> Self {
        Self {
            program: program.into(),
            args,
            current_dir: None,
        }
    }

    pub fn to_vec(self) -> Vec<String> {
        let mut parts = Vec::with_capacity(1 + self.args.len());
        parts.push(self.program);
        parts.extend(self.args);
        parts
    }
}
