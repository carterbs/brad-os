use serde_json::{json, Map, Value};
use std::fs;
use std::io;
use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct FirebaseConfig {
    pub template_path: PathBuf,
    pub output_path: PathBuf,
    pub data_dir: PathBuf,
    pub functions_port: u16,
    pub hosting_port: u16,
    pub firestore_port: u16,
    pub ui_port: u16,
    pub hub_port: u16,
    pub logging_port: u16,
}

pub fn write_firebase_config(config: &FirebaseConfig) -> io::Result<()> {
    let template = fs::read_to_string(&config.template_path)?;
    let mut json: Value = serde_json::from_str(&template).unwrap_or_else(|_| json!({}));
    let root = json
        .as_object_mut()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "firebase.json must be an object"))?;

    let emulators = root
        .entry("emulators")
        .or_insert_with(|| Value::Object(Map::new()))
        .as_object_mut()
        .ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::InvalidData,
                "firebase.json emulators field must be an object",
            )
        })?;

    emulators.insert("functions".to_string(), json!({ "port": config.functions_port }));
    emulators.insert("firestore".to_string(), json!({ "port": config.firestore_port }));
    emulators.insert(
        "hosting".to_string(),
        json!({ "enabled": true, "port": config.hosting_port }),
    );
    emulators.insert("hub".to_string(), json!({ "port": config.hub_port }));
    emulators.insert("logging".to_string(), json!({ "port": config.logging_port }));
    emulators.insert("ui".to_string(), json!({ "enabled": true, "port": config.ui_port }));
    emulators.insert(
        "import".to_string(),
        json!(config.data_dir.to_string_lossy().to_string()),
    );
    emulators.insert(
        "export_on_exit".to_string(),
        json!(config.data_dir.to_string_lossy().to_string()),
    );
    emulators.insert("singleProjectMode".to_string(), json!(true));

    root.entry("functions")
        .or_insert_with(|| json!({"source": "packages/functions"}));
    if let Some(functions) = root.get_mut("functions").and_then(Value::as_object_mut) {
        functions.insert("source".to_string(), json!("worktree-root/packages/functions"));
    }

    root.entry("hosting")
        .or_insert_with(|| Value::Object(Map::new()));
    if let Some(hosting) = root.get_mut("hosting").and_then(Value::as_object_mut) {
        hosting.insert("public".to_string(), json!("worktree-root/public"));
    }

    let rendered = serde_json::to_string_pretty(&json)
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error.to_string()))?;
    fs::write(&config.output_path, format!("{}\n", rendered))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn generate_from_template() {
        let root = tempdir().expect("tmp");
        let template_path = root.path().join("firebase.json");
        let output_path = root.path().join("session").join("firebase.json");
        std::fs::create_dir_all(output_path.parent().unwrap()).expect("mkd");
        std::fs::write(
            &template_path,
            "{\"functions\": {},\"emulators\": {},\"hosting\": {}}",
        )
        .expect("write");

        write_firebase_config(&FirebaseConfig {
            template_path: template_path.clone(),
            output_path: output_path.clone(),
            data_dir: root.path().join("data"),
            functions_port: 15000,
            hosting_port: 15001,
            firestore_port: 15002,
            ui_port: 15003,
            hub_port: 15005,
            logging_port: 15006,
        })
        .expect("write");

        let content = std::fs::read_to_string(&output_path).expect("read");
        assert!(content.contains("\"port\": 15000"));
        assert!(content.contains("\"public\": \"worktree-root/public\""));
        assert!(content.contains("\"enabled\": true"));
    }
}
