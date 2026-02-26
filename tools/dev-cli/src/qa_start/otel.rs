use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct OTelConfig {
    pub collector_port: u16,
    pub output_dir: PathBuf,
}
