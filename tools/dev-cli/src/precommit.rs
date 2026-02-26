use std::path::PathBuf;

/// Whether a commit on this branch should be blocked.
/// Returns Some(error_message) if blocked, None if allowed.
pub fn check_branch_gate(
    branch: &str,
    has_merge_head: bool,
    allow_main_commit: bool,
) -> Option<String> {
    if branch != "main" && branch != "master" {
        return None;
    }
    if has_merge_head {
        return None;
    }
    if allow_main_commit {
        return None;
    }
    Some(
        "\nERROR: Direct commits to main are not allowed.\n\n\
         All changes must be made in git worktrees:\n  \
         git worktree add ../lifting-worktrees/<branch-name> -b <branch-name>\n\n\
         See AGENTS.md for the full worktree workflow.\n\n\
         To override (merge commits, etc): ALLOW_MAIN_COMMIT=1 git commit ...\n"
            .to_string(),
    )
}

/// Scope classification for a staged file.
#[derive(Debug, PartialEq)]
pub enum FileScope {
    Functions,
    Scripts,
    Unknown,
}

/// Classify a staged file path into its scope.
pub fn classify_file(path: &str) -> FileScope {
    if path.starts_with("packages/functions/src/") {
        FileScope::Functions
    } else if path.starts_with("scripts/") {
        FileScope::Scripts
    } else {
        FileScope::Unknown
    }
}

/// Determine the validate mode based on scope analysis results.
pub fn determine_mode(
    has_unknown_scope: bool,
    scoped_test_files_empty: bool,
    scoped_test_projects_empty: bool,
) -> &'static str {
    if has_unknown_scope || (scoped_test_files_empty && scoped_test_projects_empty) {
        "full_fallback"
    } else {
        "scoped"
    }
}

/// Resolve test file for a changed file. Returns true if a test was found.
/// Pure logic variant that takes an `exists` predicate for testability.
pub fn resolve_test_file<F>(file: &str, test_files: &mut Vec<String>, exists: F) -> bool
where
    F: Fn(&str) -> bool,
{
    if file.ends_with(".test.ts") {
        add_unique(test_files, file);
        return true;
    }

    if !file.ends_with(".ts") {
        return false;
    }

    let candidate = format!("{}.test.ts", &file[..file.len() - 3]);
    if exists(&candidate) {
        add_unique(test_files, &candidate);
        return true;
    }

    false
}

/// Resolve test file using the filesystem.
pub fn resolve_test_file_fs(file: &str, test_files: &mut Vec<String>) -> bool {
    resolve_test_file(file, test_files, |path| PathBuf::from(path).exists())
}

/// Add an item to a list if not already present.
pub fn add_unique(list: &mut Vec<String>, item: &str) {
    if !list.iter().any(|existing| existing == item) {
        list.push(item.to_string());
    }
}

/// Route staged files into scoped test files/projects.
/// Returns whether any file had unknown scope.
pub fn route_staged_files<F>(
    staged_files: &[String],
    scoped_test_files: &mut Vec<String>,
    scoped_test_projects: &mut Vec<String>,
    file_exists: F,
) -> bool
where
    F: Fn(&str) -> bool,
{
    let mut unknown_scope = false;

    for file in staged_files {
        let scope = classify_file(file);
        let project_name = match scope {
            FileScope::Functions => Some("functions"),
            FileScope::Scripts => Some("scripts"),
            FileScope::Unknown => None,
        };

        if let Some(project) = project_name {
            if !resolve_test_file(file, scoped_test_files, &file_exists) {
                add_unique(scoped_test_projects, project);
            }
        } else {
            unknown_scope = true;
        }
    }

    unknown_scope
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- check_branch_gate ---

    #[test]
    fn feature_branch_allowed() {
        assert_eq!(check_branch_gate("feature/foo", false, false), None);
    }

    #[test]
    fn main_blocked_without_override() {
        assert!(check_branch_gate("main", false, false).is_some());
    }

    #[test]
    fn master_blocked_without_override() {
        assert!(check_branch_gate("master", false, false).is_some());
    }

    #[test]
    fn main_allowed_with_merge_head() {
        assert_eq!(check_branch_gate("main", true, false), None);
    }

    #[test]
    fn main_allowed_with_override() {
        assert_eq!(check_branch_gate("main", false, true), None);
    }

    #[test]
    fn block_message_mentions_worktree() {
        let msg = check_branch_gate("main", false, false).unwrap();
        assert!(msg.contains("worktree"));
        assert!(msg.contains("ALLOW_MAIN_COMMIT"));
    }

    // --- classify_file ---

    #[test]
    fn classify_functions_src() {
        assert_eq!(
            classify_file("packages/functions/src/handlers/foo.ts"),
            FileScope::Functions
        );
    }

    #[test]
    fn classify_scripts() {
        assert_eq!(classify_file("scripts/validate.sh"), FileScope::Scripts);
    }

    #[test]
    fn classify_unknown() {
        assert_eq!(classify_file("Cargo.toml"), FileScope::Unknown);
        assert_eq!(classify_file("ios/BradOS/foo.swift"), FileScope::Unknown);
    }

    // --- determine_mode ---

    #[test]
    fn mode_full_fallback_on_unknown_scope() {
        assert_eq!(determine_mode(true, false, false), "full_fallback");
    }

    #[test]
    fn mode_full_fallback_on_no_scoped_items() {
        assert_eq!(determine_mode(false, true, true), "full_fallback");
    }

    #[test]
    fn mode_scoped_with_test_files() {
        assert_eq!(determine_mode(false, false, true), "scoped");
    }

    #[test]
    fn mode_scoped_with_test_projects() {
        assert_eq!(determine_mode(false, true, false), "scoped");
    }

    // --- resolve_test_file ---

    #[test]
    fn direct_test_file_added() {
        let mut files = vec![];
        let found = resolve_test_file("src/foo.test.ts", &mut files, |_| false);
        assert!(found);
        assert_eq!(files, vec!["src/foo.test.ts"]);
    }

    #[test]
    fn ts_file_with_existing_test() {
        let mut files = vec![];
        let found = resolve_test_file("src/foo.ts", &mut files, |p| p == "src/foo.test.ts");
        assert!(found);
        assert_eq!(files, vec!["src/foo.test.ts"]);
    }

    #[test]
    fn ts_file_without_test() {
        let mut files = vec![];
        let found = resolve_test_file("src/foo.ts", &mut files, |_| false);
        assert!(!found);
        assert!(files.is_empty());
    }

    #[test]
    fn non_ts_file_returns_false() {
        let mut files = vec![];
        let found = resolve_test_file("src/foo.json", &mut files, |_| true);
        assert!(!found);
    }

    #[test]
    fn dedup_test_files() {
        let mut files = vec![];
        resolve_test_file("src/foo.test.ts", &mut files, |_| false);
        resolve_test_file("src/foo.test.ts", &mut files, |_| false);
        assert_eq!(files.len(), 1);
    }

    // --- add_unique ---

    #[test]
    fn add_unique_no_duplicates() {
        let mut list = vec!["a".to_string()];
        add_unique(&mut list, "a");
        add_unique(&mut list, "b");
        assert_eq!(list, vec!["a", "b"]);
    }

    // --- route_staged_files ---

    #[test]
    fn route_functions_with_test() {
        let staged = vec!["packages/functions/src/services/foo.ts".to_string()];
        let mut test_files = vec![];
        let mut test_projects = vec![];
        let unknown = route_staged_files(&staged, &mut test_files, &mut test_projects, |p| {
            p == "packages/functions/src/services/foo.test.ts"
        });
        assert!(!unknown);
        assert_eq!(
            test_files,
            vec!["packages/functions/src/services/foo.test.ts"]
        );
        assert!(test_projects.is_empty());
    }

    #[test]
    fn route_functions_without_test_adds_project() {
        let staged = vec!["packages/functions/src/services/bar.ts".to_string()];
        let mut test_files = vec![];
        let mut test_projects = vec![];
        let unknown = route_staged_files(&staged, &mut test_files, &mut test_projects, |_| false);
        assert!(!unknown);
        assert!(test_files.is_empty());
        assert_eq!(test_projects, vec!["functions"]);
    }

    #[test]
    fn route_scripts_without_test_adds_project() {
        let staged = vec!["scripts/validate.sh".to_string()];
        let mut test_files = vec![];
        let mut test_projects = vec![];
        let unknown = route_staged_files(&staged, &mut test_files, &mut test_projects, |_| false);
        assert!(!unknown);
        assert_eq!(test_projects, vec!["scripts"]);
    }

    #[test]
    fn route_unknown_file_sets_flag() {
        let staged = vec!["Cargo.toml".to_string()];
        let mut test_files = vec![];
        let mut test_projects = vec![];
        let unknown = route_staged_files(&staged, &mut test_files, &mut test_projects, |_| false);
        assert!(unknown);
    }

    #[test]
    fn route_mixed_files() {
        let staged = vec![
            "packages/functions/src/handlers/foo.test.ts".to_string(),
            "scripts/validate.sh".to_string(),
            "README.md".to_string(),
        ];
        let mut test_files = vec![];
        let mut test_projects = vec![];
        let unknown = route_staged_files(&staged, &mut test_files, &mut test_projects, |_| false);
        assert!(unknown); // README.md is unknown
        assert_eq!(
            test_files,
            vec!["packages/functions/src/handlers/foo.test.ts"]
        );
        assert_eq!(test_projects, vec!["scripts"]);
    }

    #[test]
    fn route_deduplicates_projects() {
        let staged = vec![
            "packages/functions/src/a.json".to_string(),
            "packages/functions/src/b.json".to_string(),
        ];
        let mut test_files = vec![];
        let mut test_projects = vec![];
        route_staged_files(&staged, &mut test_files, &mut test_projects, |_| false);
        assert_eq!(test_projects, vec!["functions"]);
    }

    // --- resolve_test_file_fs ---

    #[test]
    fn resolve_test_file_fs_finds_existing_test() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("foo.ts");
        let test = dir.path().join("foo.test.ts");
        std::fs::write(&src, "").unwrap();
        std::fs::write(&test, "").unwrap();

        let mut files = vec![];
        let found = resolve_test_file_fs(src.to_str().unwrap(), &mut files);
        assert!(found);
        assert_eq!(files.len(), 1);
        assert!(files[0].ends_with("foo.test.ts"));
    }

    #[test]
    fn resolve_test_file_fs_returns_false_when_no_test() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("bar.ts");
        std::fs::write(&src, "").unwrap();

        let mut files = vec![];
        let found = resolve_test_file_fs(src.to_str().unwrap(), &mut files);
        assert!(!found);
        assert!(files.is_empty());
    }
}
