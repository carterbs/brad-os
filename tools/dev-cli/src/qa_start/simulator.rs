use regex::Regex;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SimulatorCandidate {
    pub name: String,
    pub udid: String,
}

fn ios_section_re() -> io::Result<Regex> {
    Regex::new(r"^\s*(.+?)\s+\(([A-Fa-f0-9-]+)\)").map_err(|error| {
        io::Error::new(io::ErrorKind::InvalidInput, format!("invalid simulator regex: {error}"))
    })
}

pub fn parse_available_simulators(raw: &str) -> Vec<SimulatorCandidate> {
    let mut candidates = Vec::new();
    let mut in_ios = false;
    let mut saw_ios_header = false;

    let re = match ios_section_re() {
        Ok(re) => re,
        Err(_) => return candidates,
    };

    for line in raw.lines() {
        if line.starts_with("-- iOS") {
            if !saw_ios_header {
                saw_ios_header = true;
                in_ios = true;
            } else {
                in_ios = false;
            }
            continue;
        }

        if line.starts_with("--") {
            in_ios = false;
            continue;
        }

        if !in_ios {
            continue;
        }

        if !line.contains('(') {
            continue;
        }

        if let Some(captures) = re.captures(line) {
            let name: Option<String> = captures.get(1).map(|m: regex::Match<'_>| {
                m.as_str().trim().to_string()
            });
            let udid: Option<String> = captures.get(2).map(|m: regex::Match<'_>| m.as_str().to_string());
            if let (Some(name), Some(udid)) = (name, udid) {
                if !name.is_empty() && !udid.is_empty() {
                    candidates.push(SimulatorCandidate { name, udid });
                }
            }
        }
    }

    candidates
}

pub fn claim_or_reuse_lock(
    device_locks_dir: &Path,
    udid: &str,
    sanitized_session: &str,
) -> io::Result<Option<String>> {
    let lock_dir = device_locks_dir.join(format!("{}.lock", udid));
    let session_file = lock_dir.join("session");

    match fs::create_dir(&lock_dir) {
        Ok(()) => {
            fs::write(session_file, format!("{sanitized_session}\n"))?;
            return Ok(Some(lock_dir.to_string_lossy().to_string()));
        }
        Err(err) if err.kind() == io::ErrorKind::AlreadyExists => {
            let current_owner = fs::read_to_string(&session_file).unwrap_or_default();
            if current_owner.trim() == sanitized_session {
                return Ok(Some(lock_dir.to_string_lossy().to_string()));
            }
            return Ok(None);
        }
        Err(err) => return Err(err),
    }
}

pub fn choose_simulator(
    device_request: Option<&str>,
    candidate_output: &str,
    device_locks_dir: &Path,
    sanitized_session: &str,
) -> io::Result<(String, String, String)> {
    let mut candidates = parse_available_simulators(candidate_output);

    if let Some(request) = device_request {
        candidates.retain(|candidate| candidate.udid == request || candidate.name.contains(request));
    }

    if candidates.is_empty() {
        return Err(io::Error::new(
            io::ErrorKind::NotFound,
            format!(
                "No matching iOS simulators found for request: {}",
                device_request.unwrap_or("<auto>")
            ),
        ));
    }

    let (iphones, ipads): (Vec<_>, Vec<_>) = candidates.into_iter().partition(|entry| {
        entry.name.starts_with("iPhone")
    });

    for candidate in iphones.into_iter().chain(ipads.into_iter()) {
        if let Some(lock_path) = claim_or_reuse_lock(device_locks_dir, &candidate.udid, sanitized_session)?
        {
            return Ok((candidate.name, candidate.udid, lock_path));
        }
    }

    let mut locked: Vec<String> = Vec::new();
    if device_locks_dir.exists() {
        for entry in fs::read_dir(device_locks_dir)? {
            let entry = entry?;
            if !entry.file_type()?.is_dir() {
                continue;
            }
            let file_name = entry.file_name();
            let lock_name = file_name.to_string_lossy();
            let udid = lock_name.trim_end_matches(".lock").to_string();
            let owner = fs::read_to_string(entry.path().join("session"))
                .unwrap_or_else(|_| "unknown".to_string());
            locked.push(format!("  {} -> {}", udid, owner.trim()));
        }
    }

    Err(io::Error::new(
        io::ErrorKind::Other,
        format!(
            "No unlocked simulator is available for session '{}'.\nLocked devices:\n{}",
            sanitized_session,
            locked.join("\n"),
        ),
    ))
}

pub fn name_for_udid(candidate_output: &str, udid: &str) -> Option<String> {
    parse_available_simulators(candidate_output)
        .into_iter()
        .find(|entry| entry.udid == udid)
        .map(|entry| entry.name)
}

pub fn claim_lock_dir_exists(lock_dir: &Path) -> bool {
    if !lock_dir.exists() {
        return false;
    }

    if !lock_dir.is_dir() {
        return false;
    }

    lock_dir.join("session").is_file()
}

pub fn is_simulator_running_candidate(candidate_output: &str, udid: &str) -> bool {
    name_for_udid(candidate_output, udid).is_some()
}

pub fn unlock_lock(lock_dir: &Path) -> io::Result<()> {
    if lock_dir.exists() {
        let _ = fs::remove_file(lock_dir.join("session"));
        let _ = fs::remove_dir(lock_dir);
    }
    Ok(())
}

pub fn unlock_lock_by_session(
    device_locks_dir: &Path,
    session: &str,
) -> io::Result<Vec<PathBuf>> {
    let mut released = Vec::new();
    if !device_locks_dir.exists() {
        return Ok(released);
    }

    for entry in fs::read_dir(device_locks_dir)? {
        let entry = entry?;
        if !entry.file_type()?.is_dir() {
            continue;
        }
        let lock_dir = entry.path();
        let owner = fs::read_to_string(lock_dir.join("session"))
            .unwrap_or_default()
            .trim()
            .to_string();
        if owner == session {
            let _ = fs::remove_file(lock_dir.join("session"));
            let _ = fs::remove_dir(&lock_dir);
            released.push(lock_dir);
        }
    }

    Ok(released)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    const SAMPLE: &str = r#"
-- iOS 26.0 --
    iPhone 15 (00000000-AAAA-AAAA-AAAA-AAAAAAAAAAAA) (Shutdown)
    iPad Pro (00000000-BBBB-BBBB-BBBB-BBBBBBBBBBBB) (Shutdown)
-- tvOS 26.0 --
    Apple TV (CCCCCCCC-DDDD-DDDD-DDDD-DDDDDDDDDDDD) (Shutdown)
"#;

    #[test]
    fn parse_simulators() {
        let parsed = parse_available_simulators(SAMPLE);
        assert_eq!(parsed.len(), 2);
        assert_eq!(parsed[0].name, "iPhone 15");
        assert_eq!(parsed[0].udid, "00000000-AAAA-AAAA-AAAA-AAAAAAAAAAAA");
    }

    #[test]
    fn choose_prefers_iphone() {
        let dir = tempdir().expect("tmp");
        let result = choose_simulator(Some("iPad"), SAMPLE, dir.path(), "alpha")
            .expect("choose");
        assert_eq!(result.0, "iPad Pro");
        assert_eq!(result.1, "00000000-BBBB-BBBB-BBBB-BBBBBBBBBBBB");
    }

    #[test]
    fn no_available_simulator_returns_error() {
        let dir = tempdir().expect("tmp");
        let lock = dir.path().join("00000000-AAAA-AAAA-AAAA-AAAAAAAAAAAA.lock");
        let second = dir.path().join("00000000-BBBB-BBBB-BBBB-BBBBBBBBBBBB.lock");
        fs::create_dir_all(&lock).expect("dir");
        fs::write(lock.join("session"), "other\n").expect("owner");
        fs::create_dir_all(&second).expect("dir2");
        fs::write(second.join("session"), "other\n").expect("owner2");

        let err = choose_simulator(None, SAMPLE, dir.path(), "beta").expect_err("locked");
        assert!(err.to_string().contains("No unlocked simulator is available"));
    }

    #[test]
    fn claim_or_reuse_lock_reuses_owner() {
        let dir = tempdir().expect("tmp");
        let candidate = dir
            .path()
            .join("00000000-AAAA-AAAA-AAAA-AAAAAAAAAAAA.lock");
        let _ = fs::create_dir_all(&candidate);
        fs::write(candidate.join("session"), "owner\n").expect("owner");
        assert!(claim_or_reuse_lock(dir.path(), "00000000-AAAA-AAAA-AAAA-AAAAAAAAAAAA", "owner")
            .expect("lock")
            .is_some());
        assert!(claim_or_reuse_lock(dir.path(), "00000000-AAAA-AAAA-AAAA-AAAAAAAAAAAA", "other")
            .expect("lock")
            .is_none());
    }
}
