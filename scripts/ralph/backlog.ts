import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKLOG_PATH = join(__dirname, "backlog.md");

/** Parse backlog.md into an array of task strings. */
export function readBacklog(): string[] {
  let content: string;
  try {
    content = readFileSync(BACKLOG_PATH, "utf-8");
  } catch {
    return [];
  }

  return content
    .split("\n")
    .map((line) => line.replace(/^- /, "").trim())
    .filter(Boolean);
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

/** Write tasks to backlog.md (overwrites). */
export function writeBacklog(tasks: string[]): void {
  const content = tasks.map((t) => `- ${t}`).join("\n") + "\n";
  writeFileSync(BACKLOG_PATH, content);
}

/** Return the path to backlog.md (for logging). */
export function backlogPath(): string {
  return BACKLOG_PATH;
}
