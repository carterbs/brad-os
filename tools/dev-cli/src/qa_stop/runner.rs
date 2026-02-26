#[derive(Debug, Clone)]
pub struct CommandCall {
    pub program: String,
    pub args: Vec<String>,
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

        let result = match process.output() {
            Ok(output) => CommandResult {
                status: output.status.code().unwrap_or(1),
                stdout: String::from_utf8_lossy(&output.stdout).to_string(),
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
    pub fn to_vec(self) -> Vec<String> {
        let mut parts = Vec::with_capacity(1 + self.args.len());
        parts.push(self.program);
        parts.extend(self.args);
        parts
    }
}
