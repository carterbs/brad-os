use crc32fast::Hasher;
use std::io;
use std::path::Path;

#[derive(Debug, Clone, Copy)]
pub struct Ports {
    pub api: u16,
    pub otel: u16,
}

pub fn sanitize_id(raw: &str) -> String {
    raw.to_ascii_lowercase()
        .chars()
        .map(|c| {
            if c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' {
                c
            } else {
                '-'
            }
        })
        .collect()
}

pub fn checksum_seed(seed: &str) -> io::Result<u32> {
    let mut hasher = Hasher::new();
    hasher.update(seed.as_bytes());
    Ok(hasher.finalize())
}

pub fn pick_ports_from_hash(seed: &str) -> io::Result<u16> {
    let hash = checksum_seed(seed)?;
    let slot = hash % 200;
    Ok((15000 + slot * 20) as u16)
}

impl Ports {
    pub fn derive(seed: &str) -> io::Result<Self> {
        let base = pick_ports_from_hash(seed)?;
        Ok(Self {
            api: base,
            otel: base + 1,
        })
    }
}

pub fn default_session_id(root_dir: &Path) -> io::Result<String> {
    let worktree = root_dir
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("worktree")
        .to_string();
    let hash = checksum_seed(&root_dir.to_string_lossy())?;
    Ok(format!("{}-{}", sanitize_id(&worktree), hash % 10000))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn sanitize_id_replaces_invalids() {
        assert_eq!(sanitize_id("My Session/Name"), "my-session-name");
    }

    #[test]
    fn ports_are_offset_from_base() {
        let ports = Ports::derive("demo").expect("derive ports");
        assert_eq!(ports.otel, ports.api + 1);
    }

    #[test]
    fn default_session_is_stable() {
        let tmp = tempdir().expect("tmp");
        let id = default_session_id(tmp.path()).expect("session id");
        let parts: Vec<_> = id.rsplitn(2, '-').collect();
        assert_eq!(parts.len(), 2);
        let hash_part = parts[0];
        assert!(hash_part.chars().all(|char| char.is_ascii_digit()));
        assert_eq!(parts[1], sanitize_id(parts[1]));
    }
}
