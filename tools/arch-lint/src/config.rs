use std::collections::HashSet;
use std::path::{Path, PathBuf};

/// Directories that should never be traversed by any check.
/// Individual checks can extend this set with check-specific entries.
pub const GLOBAL_SKIP_DIRS: &[&str] = &[
    "node_modules",
    ".git",
    "dist",
    "target",
    "build",
    ".cache",
    ".firebase",
    ".validate",
    ".claude",
    ".arch-lint-tmp",
    "tmp-lint",
    "emulator-data",
    ".otel",
    ".playwright-mcp",
    "test-results",
    "ios-test-screenshots",
];

/// Build a HashSet from the global skip dirs plus any extra check-specific entries.
pub fn skip_dirs(extra: &[&'static str]) -> HashSet<&'static str> {
    let mut set: HashSet<&'static str> = GLOBAL_SKIP_DIRS.iter().copied().collect();
    for e in extra {
        set.insert(e);
    }
    set
}

pub struct LinterConfig {
    pub root_dir: PathBuf,
    pub functions_src: PathBuf,
}

impl LinterConfig {
    pub fn from_root(root: &Path) -> Self {
        Self {
            root_dir: root.to_path_buf(),
            functions_src: root.join("packages/functions/src"),
        }
    }

    /// Discover repo root by walking up from cwd to find .git directory
    pub fn discover() -> Option<Self> {
        let mut dir = std::env::current_dir().ok()?;
        loop {
            if dir.join(".git").exists() {
                return Some(Self::from_root(&dir));
            }
            if !dir.pop() {
                return None;
            }
        }
    }
}
