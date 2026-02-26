use crate::config;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

/// Recursively collect files with a given extension, skipping specified directories
pub fn collect_files(dir: &Path, extension: &str, skip_dirs: &HashSet<&str>) -> Vec<PathBuf> {
    let mut results = Vec::new();
    collect_files_inner(dir, extension, skip_dirs, &mut results);
    results
}

fn collect_files_inner(
    dir: &Path,
    extension: &str,
    skip_dirs: &HashSet<&str>,
    results: &mut Vec<PathBuf>,
) {
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            if path.is_dir() {
                if !skip_dirs.contains(name) {
                    collect_files_inner(&path, extension, skip_dirs, results);
                }
            } else if path.is_file() && name.ends_with(extension) {
                results.push(path);
            }
        }
    }
}

/// Collect .ts files excluding test files, skipping specified directories
pub fn collect_ts_files(dir: &Path, skip_dirs: &HashSet<&str>) -> Vec<PathBuf> {
    let mut results = Vec::new();
    collect_ts_files_inner(dir, skip_dirs, &mut results);
    results
}

fn collect_ts_files_inner(dir: &Path, skip_dirs: &HashSet<&str>, results: &mut Vec<PathBuf>) {
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            if path.is_dir() {
                if !skip_dirs.contains(name) {
                    collect_ts_files_inner(&path, skip_dirs, results);
                }
            } else if path.is_file()
                && name.ends_with(".ts")
                && !name.ends_with(".test.ts")
                && !name.ends_with(".spec.ts")
                && !name.contains("__tests__")
            {
                results.push(path);
            }
        }
    }
}

/// Collect test files (.test.ts and .spec.ts)
pub fn collect_test_files(dir: &Path) -> Vec<PathBuf> {
    let skip = config::skip_dirs(&["ios", "public"]);
    let mut results = Vec::new();
    collect_test_files_inner(dir, &skip, &mut results);
    results
}

fn collect_test_files_inner(dir: &Path, skip: &HashSet<&str>, results: &mut Vec<PathBuf>) {
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            if path.is_dir() {
                if skip.contains(name) || name.starts_with('.') {
                    continue;
                }
                collect_test_files_inner(&path, skip, results);
            } else if path.is_file()
                && (name.ends_with(".test.ts") || name.ends_with(".spec.ts"))
            {
                results.push(path);
            }
        }
    }
}

/// Collect .swift files recursively
pub fn collect_swift_files(dir: &Path) -> Vec<PathBuf> {
    let mut results = Vec::new();
    collect_swift_files_inner(dir, &mut results);
    results.sort();
    results
}

fn collect_swift_files_inner(dir: &Path, results: &mut Vec<PathBuf>) {
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_swift_files_inner(&path, results);
        } else if path.is_file() {
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                if name.ends_with(".swift") {
                    results.push(path);
                }
            }
        }
    }
}

/// Collect .md files recursively, skipping specified directories
pub fn collect_markdown_files(dir: &Path, skip_dirs: &HashSet<&str>) -> Vec<PathBuf> {
    let mut results = Vec::new();
    collect_md_inner(dir, skip_dirs, &mut results);
    results
}

fn collect_md_inner(dir: &Path, skip_dirs: &HashSet<&str>, results: &mut Vec<PathBuf>) {
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            if path.is_dir() {
                if !skip_dirs.contains(name) {
                    collect_md_inner(&path, skip_dirs, results);
                }
            } else if path.is_file() && name.ends_with(".md") {
                results.push(path);
            }
        }
    }
}
