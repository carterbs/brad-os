import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKLOG_PATH = join(__dirname, "backlog.md");
const TRIAGE_PATH = join(__dirname, "triage.md");
const MERGE_CONFLICTS_PATH = join(__dirname, "merge-conflicts.md");

function normalizeTaskText(task: string): string {
  return task
    .replace(/[`*_]/g, "")
    .replace(/[.,:;()]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function tokenSet(task: string): Set<string> {
  return new Set(
    normalizeTaskText(task)
      .split(" ")
      .map((t) => t.trim())
      .filter((t) => t.length >= 4),
  );
}

function overlapsMergedTask(
  task: string,
  mergedTaskKeys: Set<string>,
  mergedTokenSets: Set<string>[],
): boolean {
  const normalized = normalizeTaskText(task);
  if (mergedTaskKeys.has(normalized)) return true;

  const taskTokens = tokenSet(task);
  if (taskTokens.size === 0) return false;

  for (const mergedTokens of mergedTokenSets) {
    let overlap = 0;
    for (const token of taskTokens) {
      if (mergedTokens.has(token)) overlap++;
    }
    const minSize = Math.min(taskTokens.size, mergedTokens.size);
    if (overlap >= 6 && minSize > 0 && overlap / minSize >= 0.6) {
      return true;
    }
  }

  return false;
}

function readMergedImprovementNumbersFromGit(repoDir: string): Set<number> {
  const merged = new Set<number>();
  try {
    const output = execFileSync(
      "git",
      ["-C", repoDir, "log", "--merges", "--pretty=format:%s"],
      { encoding: "utf-8", stdio: "pipe" },
    );
    for (const line of output.split("\n")) {
      const match = line.match(/(?:harness-improvement|change)-(\d+)/);
      if (!match?.[1]) continue;
      const n = parseInt(match[1], 10);
      if (!Number.isNaN(n)) merged.add(n);
    }
  } catch {
    // Best effort; keep sync resilient if git is unavailable.
  }
  return merged;
}

function readTaskFile(path: string): string[] {
  let content: string;
  try {
    content = readFileSync(path, "utf-8");
  } catch {
    return [];
  }

  return content
    .split("\n")
    .map((line) => line.replace(/^- /, "").trim())
    .filter(Boolean);
}

function writeTaskFile(path: string, tasks: string[]): void {
  const content = tasks.map((t) => `- ${t}`).join("\n") + "\n";
  writeFileSync(path, content);
}

/** Parse backlog.md into an array of task strings. */
export function readBacklog(): string[] {
  return readTaskFile(BACKLOG_PATH);
}

/** Return the first task from backlog.md without removing it. */
export function peekTask(): string | undefined {
  const tasks = readBacklog();
  return tasks[0];
}

/** Remove and return the first task from backlog.md. Returns undefined if empty. */
export function popTask(): string | undefined {
  const tasks = readBacklog();
  if (tasks.length === 0) return undefined;

  const [task, ...remaining] = tasks;
  writeBacklog(remaining);
  return task;
}

/**
 * Remove a specific task by text (not positional). For parallel use where
 * the finished task may not be first in the file.
 * Returns true if the task was found and removed.
 */
export function removeTask(taskText: string): boolean {
  const tasks = readBacklog();
  const idx = tasks.findIndex((t) => t === taskText);
  if (idx === -1) return false;

  tasks.splice(idx, 1);
  writeBacklog(tasks);
  return true;
}

/** Parse triage.md into an array of task strings. */
export function readTriage(): string[] {
  return readTaskFile(TRIAGE_PATH);
}

/** Add a triage task if it is not already present. */
export function addTriageTask(taskText: string): boolean {
  const tasks = readTriage();
  if (tasks.includes(taskText)) return false;
  tasks.push(taskText);
  writeTaskFile(TRIAGE_PATH, tasks);
  return true;
}

/** Remove a specific triage task by text. */
export function removeTriageTask(taskText: string): boolean {
  const tasks = readTriage();
  const idx = tasks.findIndex((t) => t === taskText);
  if (idx === -1) return false;
  tasks.splice(idx, 1);
  writeTaskFile(TRIAGE_PATH, tasks);
  return true;
}

/**
 * Move a task from the active backlog to merge-conflicts.md so it is not
 * re-run automatically when a branch is complete but cannot merge cleanly.
 */
export function moveTaskToMergeConflicts(
  taskText: string,
  details: {
    improvement: number;
    branchName: string;
    worktreePath: string;
  },
): void {
  removeTask(taskText);
  addTriageTask(
    `Resolve merge conflict for improvement #${details.improvement} (${details.branchName}) and merge to main. Worktree: ${details.worktreePath}. Original task: ${taskText}`,
  );
  const marker = `improvement=${details.improvement} branch=${details.branchName}`;
  let existing = "";
  try {
    existing = readFileSync(MERGE_CONFLICTS_PATH, "utf-8");
  } catch {
    existing = "";
  }

  if (existing.includes(marker)) {
    return;
  }

  const line =
    `- [${new Date().toISOString()}] ${taskText} ` +
    `| improvement=${details.improvement} ` +
    `| branch=${details.branchName} ` +
    `| worktree=${details.worktreePath}`;
  appendFileSync(MERGE_CONFLICTS_PATH, `${line}\n`);
}

/** Write tasks to backlog.md (overwrites). */
export function writeBacklog(tasks: string[]): void {
  const content = tasks.map((t) => `- ${t}`).join("\n") + "\n";
  writeFileSync(BACKLOG_PATH, content);
}

/** Return the path to backlog.md (for logging). */
export function backlogPath(): string {
  return BACKLOG_PATH;
}

export interface BacklogSyncResult {
  mergedTasksSeen: number;
  removedFromBacklog: string[];
  removedFromTriage: string[];
}

/**
 * Remove backlog/triage tasks that have already been merged to main.
 *
 * Source of truth: ralph-loop.jsonl.
 * - worker_started gives { improvement -> task text }
 * - merge_completed(success=true) marks that improvement as shipped
 */
export function syncTaskFilesFromLog(logFilePath: string): BacklogSyncResult {
  const repoDir = dirname(logFilePath);
  let raw = "";
  try {
    raw = readFileSync(logFilePath, "utf-8");
  } catch {
    return {
      mergedTasksSeen: 0,
      removedFromBacklog: [],
      removedFromTriage: [],
    };
  }

  const taskByImprovement = new Map<number, string>();
  const mergedImprovements = readMergedImprovementNumbersFromGit(repoDir);
  const mergedTaskKeys = new Set<string>();

  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;

    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }

    if (typeof event !== "object" || event === null) continue;
    const e = event as Record<string, unknown>;
    const eventName = e.event;
    if (typeof eventName !== "string") continue;

    if (eventName === "worker_started") {
      const improvement = e.improvement;
      const task = e.task;
      if (typeof improvement === "number" && typeof task === "string") {
        taskByImprovement.set(improvement, task);
      }
      continue;
    }

    if (eventName === "merge_completed") {
      const improvement = e.improvement;
      const success = e.success;
      if (typeof improvement !== "number" || success !== true) continue;
      mergedImprovements.add(improvement);
    }
  }

  for (const improvement of mergedImprovements) {
    const task = taskByImprovement.get(improvement);
    if (!task) continue;
    mergedTaskKeys.add(normalizeTaskText(task));
  }

  if (mergedTaskKeys.size === 0) {
    return {
      mergedTasksSeen: 0,
      removedFromBacklog: [],
      removedFromTriage: [],
    };
  }

  const backlog = readBacklog();
  const triage = readTriage();
  const mergedTokenSets = [...mergedTaskKeys].map((task) => tokenSet(task));

  const removedFromBacklog = backlog.filter((task) =>
    overlapsMergedTask(task, mergedTaskKeys, mergedTokenSets),
  );
  const removedFromTriage = triage.filter((task) =>
    overlapsMergedTask(task, mergedTaskKeys, mergedTokenSets),
  );

  if (removedFromBacklog.length > 0) {
    const keptBacklog = backlog.filter((task) =>
      !overlapsMergedTask(task, mergedTaskKeys, mergedTokenSets),
    );
    writeBacklog(keptBacklog);
  }

  if (removedFromTriage.length > 0) {
    const keptTriage = triage.filter((task) =>
      !overlapsMergedTask(task, mergedTaskKeys, mergedTokenSets),
    );
    writeTaskFile(TRIAGE_PATH, keptTriage);
  }

  return {
    mergedTasksSeen: mergedTaskKeys.size,
    removedFromBacklog,
    removedFromTriage,
  };
}
