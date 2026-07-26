use std::collections::HashMap;
use std::fs::File;
use std::io::{self, Read, Write};
use std::path::Path;

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct QaState {
    pub qa_state_root: Option<String>,
    pub worktree_root: Option<String>,
    pub session_id: Option<String>,
    pub project_id: Option<String>,
    pub api_port: Option<u16>,
    pub otel_port: Option<u16>,
    pub simulator_udid: Option<String>,
    pub simulator_name: Option<String>,
    pub simulator_lock_dir: Option<String>,
    pub api_log: Option<String>,
    pub otel_log: Option<String>,
    pub api_pid_file: Option<String>,
    pub otel_pid_file: Option<String>,
}

impl QaState {
    pub fn from_file(path: &Path) -> io::Result<Self> {
        let mut file = File::open(path)?;
        let mut raw = String::new();
        file.read_to_string(&mut raw)?;
        let values = raw
            .lines()
            .filter_map(|line| line.split_once('='))
            .map(|(k, v)| (k.to_string(), trim_quotes(v).to_string()))
            .collect::<HashMap<String, String>>();

        Ok(Self {
            qa_state_root: values.get("QA_STATE_ROOT").cloned(),
            worktree_root: values.get("WORKTREE_ROOT").cloned(),
            session_id: values.get("SESSION_ID").cloned(),
            project_id: values.get("PROJECT_ID").cloned(),
            api_port: parse_u16(values.get("API_PORT")),
            otel_port: parse_u16(values.get("OTEL_PORT")),
            simulator_udid: values
                .get("SIMULATOR_UDID")
                .filter(|value| !value.is_empty())
                .cloned(),
            simulator_name: values
                .get("SIMULATOR_NAME")
                .filter(|value| !value.is_empty())
                .cloned(),
            simulator_lock_dir: values
                .get("SIMULATOR_LOCK_DIR")
                .filter(|value| !value.is_empty())
                .cloned(),
            api_log: values.get("API_LOG").cloned(),
            otel_log: values.get("OTEL_LOG").cloned(),
            api_pid_file: values.get("API_PID_FILE").cloned(),
            otel_pid_file: values.get("OTEL_PID_FILE").cloned(),
        })
    }

    pub fn write_to_file(&self, path: &Path) -> io::Result<()> {
        let mut file = File::create(path)?;
        file.write_all(render_state(self).as_bytes())?;
        file.sync_all()?;
        Ok(())
    }
}

fn trim_quotes(value: &str) -> String {
    let mut owned = value.to_string();
    if owned.starts_with('"') && owned.ends_with('"') && owned.len() >= 2 {
        owned = owned[1..owned.len() - 1].to_string();
    }
    owned
}

fn parse_u16(value: Option<&String>) -> Option<u16> {
    value.and_then(|raw| raw.parse::<u16>().ok())
}

fn render_state(state: &QaState) -> String {
    let lines = vec![
        kv(
            "QA_STATE_ROOT",
            state.qa_state_root.as_deref().unwrap_or(""),
        ),
        kv(
            "WORKTREE_ROOT",
            state.worktree_root.as_deref().unwrap_or(""),
        ),
        kv("SESSION_ID", state.session_id.as_deref().unwrap_or("")),
        kv("PROJECT_ID", state.project_id.as_deref().unwrap_or("")),
        kv(
            "API_PORT",
            &state.api_port.map(|v| v.to_string()).unwrap_or_default(),
        ),
        kv(
            "OTEL_PORT",
            &state.otel_port.map(|v| v.to_string()).unwrap_or_default(),
        ),
        kv(
            "SIMULATOR_UDID",
            state.simulator_udid.as_deref().unwrap_or(""),
        ),
        kv(
            "SIMULATOR_NAME",
            state.simulator_name.as_deref().unwrap_or(""),
        ),
        kv(
            "SIMULATOR_LOCK_DIR",
            state.simulator_lock_dir.as_deref().unwrap_or(""),
        ),
        kv("API_LOG", state.api_log.as_deref().unwrap_or("")),
        kv("OTEL_LOG", state.otel_log.as_deref().unwrap_or("")),
        kv("API_PID_FILE", state.api_pid_file.as_deref().unwrap_or("")),
        kv(
            "OTEL_PID_FILE",
            state.otel_pid_file.as_deref().unwrap_or(""),
        ),
    ];
    lines.join("\n") + "\n"
}

fn kv(key: &str, value: &str) -> String {
    format!("{}=\"{}\"", key, value)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_and_roundtrip_state_file() {
        let fixture = "QA_STATE_ROOT=\"/tmp/state\"\n".to_string()
            + &kv("WORKTREE_ROOT", "/tmp/root")
            + "\n"
            + &kv("SESSION_ID", "id")
            + "\n"
            + &kv("PROJECT_ID", "project")
            + "\n"
            + &kv("API_PORT", "15000")
            + "\n"
            + &kv("OTEL_PORT", "15001")
            + "\n"
            + &kv("SIMULATOR_UDID", "")
            + "\n"
            + &kv("SIMULATOR_NAME", "")
            + "\n"
            + &kv("SIMULATOR_LOCK_DIR", "")
            + "\n"
            + &kv("API_LOG", "/tmp/api.log")
            + "\n"
            + &kv("OTEL_LOG", "/tmp/otel.log")
            + "\n"
            + &kv("API_PID_FILE", "/tmp/api.pid")
            + "\n"
            + &kv("OTEL_PID_FILE", "/tmp/otel.pid")
            + "\n";

        let temp = tempfile::NamedTempFile::new().expect("temp");
        std::fs::write(temp.path(), fixture).expect("write");
        let parsed = QaState::from_file(temp.path()).expect("load");
        assert_eq!(parsed.api_port, Some(15000));
        assert_eq!(parsed.simulator_udid, None);

        let roundtrip = tempfile::NamedTempFile::new().expect("rt");
        parsed
            .write_to_file(roundtrip.path())
            .expect("roundtrip write");
        let reloaded = QaState::from_file(roundtrip.path()).expect("reload");
        assert_eq!(parsed, reloaded);
    }
}
