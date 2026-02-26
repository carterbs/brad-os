use std::fs;
use std::io;
use std::path::Path;

pub fn release_lock_dir(lock_dir: &str, _owner_session: &str) -> bool {
    let lock_path = Path::new(lock_dir);

    if !lock_path.is_dir() {
        return false;
    }

    let _ = fs::remove_file(lock_path.join("session"));
    let _ = fs::remove_dir(lock_path);

    true
}

pub fn release_matching_locks(lock_dir: &str, owner_session: &str) -> io::Result<Vec<String>> {
    let base_dir = Path::new(lock_dir);
    if !base_dir.is_dir() {
        return Ok(Vec::new());
    }

    let mut released = Vec::new();
    for entry in fs::read_dir(base_dir)? {
        let entry = entry?;
        let path = entry.path();
        let is_lock = path
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext == "lock")
            .unwrap_or(false);
        if !is_lock {
            continue;
        }

        let session_file = path.join("session");
        if !session_file.is_file() {
            continue;
        }

        let current_owner = match read_owner(&session_file) {
            Ok(owner) => owner,
            Err(_) => continue,
        };
        if current_owner != owner_session {
            continue;
        }

        let _ = fs::remove_file(&session_file);
        let _ = fs::remove_dir(&path);
        released.push(format!("Simulator lease released: {}", path.display()));
    }

    Ok(released)
}

pub fn is_owner_of_lock(session_file: &Path, expected_owner: &str) -> io::Result<bool> {
    let owner = read_owner(session_file)?;
    Ok(owner == expected_owner)
}


fn read_owner(session_file: &Path) -> io::Result<String> {
    let contents = fs::read_to_string(session_file)?;
    Ok(contents.trim().to_string())
}
