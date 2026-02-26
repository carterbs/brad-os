import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAppendFileSync,
  mockReadFileSync,
  mockWriteFileSync,
  mockExecFileSync,
} = vi.hoisted(() => ({
  mockAppendFileSync: vi.fn(),
  mockReadFileSync: vi.fn(),
  mockWriteFileSync: vi.fn(),
  mockExecFileSync: vi.fn(),
}));

vi.mock("node:fs", () => ({
  appendFileSync: mockAppendFileSync,
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
}));

vi.mock("node:child_process", () => ({
  execFileSync: mockExecFileSync,
}));

describe("syncTaskFilesFromLog", () => {
  beforeEach(() => {
    vi.resetModules();
    mockAppendFileSync.mockReset();
    mockReadFileSync.mockReset();
    mockWriteFileSync.mockReset();
    mockExecFileSync.mockReset();
  });

  it("removes an exact merged task from backlog", async () => {
    mockExecFileSync.mockReturnValue("");
    mockReadFileSync.mockImplementation((path: string) => {
      if (path.endsWith("ralph-loop.jsonl")) {
        return [
          JSON.stringify({
            event: "worker_started",
            improvement: 12,
            task: "Task A",
          }),
          JSON.stringify({
            event: "merge_completed",
            improvement: 12,
            success: true,
          }),
        ].join("\n");
      }
      if (path.endsWith("scripts/ralph/backlog.md")) {
        return "- Task A\n- Task B\n";
      }
      if (path.endsWith("scripts/ralph/triage.md")) {
        return "- Triage Task\n";
      }
      return "";
    });

    const { syncTaskFilesFromLog } = await import("./backlog.js");
    const result = syncTaskFilesFromLog("/repo/ralph-loop.jsonl");

    expect(result.removedFromBacklog).toEqual(["Task A"]);
    expect(result.removedFromTriage).toEqual([]);
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining("scripts/ralph/backlog.md"),
      "- Task B\n",
    );
  });

  it("removes semantically equivalent task using merged branch history", async () => {
    mockExecFileSync.mockImplementation(
      (_cmd: string, args: string[]) => {
        if (args.includes("--pretty=format:%s")) {
          return "Merge branch 'harness-improvement-041'";
        }
        return "";
      },
    );
    mockReadFileSync.mockImplementation((path: string) => {
      if (path.endsWith("ralph-loop.jsonl")) {
        return JSON.stringify({
          event: "worker_started",
          improvement: 41,
          task: "Add a Cycling integration test suite for core `/cycling` read/write flows plus one validation failure path.",
        });
      }
      if (path.endsWith("scripts/ralph/backlog.md")) {
        return [
          "- Add a Cycling integration test suite (`packages/functions/src/__tests__/integration/cycling.integration.test.ts`) covering core `/cycling` read/write flows and one failure path.",
          "- Keep this task",
        ].join("\n");
      }
      if (path.endsWith("scripts/ralph/triage.md")) {
        return "";
      }
      return "";
    });

    const { syncTaskFilesFromLog } = await import("./backlog.js");
    const result = syncTaskFilesFromLog("/repo/ralph-loop.jsonl");

    expect(result.removedFromBacklog).toEqual([
      "Add a Cycling integration test suite (`packages/functions/src/__tests__/integration/cycling.integration.test.ts`) covering core `/cycling` read/write flows and one failure path.",
    ]);
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining("scripts/ralph/backlog.md"),
      "- Keep this task\n",
    );
  });

  it("returns empty result when log file doesn't exist", async () => {
    mockReadFileSync.mockImplementation((path: string) => {
      if (path.endsWith("ralph-loop.jsonl")) {
        throw new Error("ENOENT");
      }
      return "";
    });

    const { syncTaskFilesFromLog } = await import("./backlog.js");
    const result = syncTaskFilesFromLog("/repo/ralph-loop.jsonl");

    expect(result.mergedTasksSeen).toBe(0);
    expect(result.removedFromBacklog).toEqual([]);
    expect(result.removedFromTriage).toEqual([]);
  });

  it("handles blank and malformed lines in log", async () => {
    mockExecFileSync.mockReturnValue("");
    mockReadFileSync.mockImplementation((path: string) => {
      if (path.endsWith("ralph-loop.jsonl")) {
        return [
          "",
          "not json at all",
          JSON.stringify({
            event: "worker_started",
            improvement: 10,
            task: "Valid Task",
          }),
          "   ",
          JSON.stringify({ invalid: "object without event field" }),
          JSON.stringify({
            event: "merge_completed",
            improvement: 10,
            success: true,
          }),
          "{}",
        ].join("\n");
      }
      if (path.endsWith("scripts/ralph/backlog.md")) {
        return "- Valid Task\n- Other Task\n";
      }
      if (path.endsWith("scripts/ralph/triage.md")) {
        return "";
      }
      return "";
    });

    const { syncTaskFilesFromLog } = await import("./backlog.js");
    const result = syncTaskFilesFromLog("/repo/ralph-loop.jsonl");

    expect(result.removedFromBacklog).toEqual(["Valid Task"]);
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining("scripts/ralph/backlog.md"),
      "- Other Task\n",
    );
  });

  it("removes from both backlog and triage when merged task found in both", async () => {
    mockExecFileSync.mockReturnValue("");
    mockReadFileSync.mockImplementation((path: string) => {
      if (path.endsWith("ralph-loop.jsonl")) {
        return [
          JSON.stringify({
            event: "worker_started",
            improvement: 5,
            task: "Shared Task",
          }),
          JSON.stringify({
            event: "merge_completed",
            improvement: 5,
            success: true,
          }),
        ].join("\n");
      }
      if (path.endsWith("scripts/ralph/backlog.md")) {
        return "- Shared Task\n- Backlog Only\n";
      }
      if (path.endsWith("scripts/ralph/triage.md")) {
        return "- Shared Task\n- Triage Only\n";
      }
      return "";
    });

    const { syncTaskFilesFromLog } = await import("./backlog.js");
    const result = syncTaskFilesFromLog("/repo/ralph-loop.jsonl");

    expect(result.removedFromBacklog).toContain("Shared Task");
    expect(result.removedFromTriage).toContain("Shared Task");
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining("scripts/ralph/backlog.md"),
      "- Backlog Only\n",
    );
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining("scripts/ralph/triage.md"),
      "- Triage Only\n",
    );
  });

  it("no removals when no merged tasks in log", async () => {
    mockExecFileSync.mockReturnValue("");
    mockReadFileSync.mockImplementation((path: string) => {
      if (path.endsWith("ralph-loop.jsonl")) {
        return [
          JSON.stringify({
            event: "worker_started",
            improvement: 1,
            task: "Some Task",
          }),
        ].join("\n");
      }
      if (path.endsWith("scripts/ralph/backlog.md")) {
        return "- Some Task\n";
      }
      if (path.endsWith("scripts/ralph/triage.md")) {
        return "";
      }
      return "";
    });

    const { syncTaskFilesFromLog } = await import("./backlog.js");
    const result = syncTaskFilesFromLog("/repo/ralph-loop.jsonl");

    expect(result.removedFromBacklog).toEqual([]);
    expect(result.removedFromTriage).toEqual([]);
    expect(mockWriteFileSync).not.toHaveBeenCalledWith(
      expect.stringContaining("scripts/ralph/backlog.md"),
      expect.anything(),
    );
  });

  it("overlap matching with token sets (6+ tokens, 60%+ overlap)", async () => {
    mockExecFileSync.mockReturnValue("");
    mockReadFileSync.mockImplementation((path: string) => {
      if (path.endsWith("ralph-loop.jsonl")) {
        return [
          JSON.stringify({
            event: "worker_started",
            improvement: 99,
            task: "Add integration test suite for cycling covering core read write flows and one failure",
          }),
          JSON.stringify({
            event: "merge_completed",
            improvement: 99,
            success: true,
          }),
        ].join("\n");
      }
      if (path.endsWith("scripts/ralph/backlog.md")) {
        return [
          "- Add integration test suite for cycling covering core flows and one failure path",
          "- Keep this completely different task",
        ].join("\n");
      }
      if (path.endsWith("scripts/ralph/triage.md")) {
        return "";
      }
      return "";
    });

    const { syncTaskFilesFromLog } = await import("./backlog.js");
    const result = syncTaskFilesFromLog("/repo/ralph-loop.jsonl");

    expect(result.removedFromBacklog).toContain(
      "Add integration test suite for cycling covering core flows and one failure path",
    );
    expect(result.removedFromBacklog).not.toContain(
      "Keep this completely different task",
    );
  });

  it("gracefully handles git command failure", async () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error("git not available");
    });
    mockReadFileSync.mockImplementation((path: string) => {
      if (path.endsWith("ralph-loop.jsonl")) {
        return JSON.stringify({
          event: "merge_completed",
          improvement: 10,
          success: true,
        });
      }
      if (path.endsWith("scripts/ralph/backlog.md")) {
        return "- Task\n";
      }
      if (path.endsWith("scripts/ralph/triage.md")) {
        return "";
      }
      return "";
    });

    const { syncTaskFilesFromLog } = await import("./backlog.js");
    const result = syncTaskFilesFromLog("/repo/ralph-loop.jsonl");

    expect(result.mergedTasksSeen).toBe(0);
    expect(result.removedFromBacklog).toEqual([]);
  });

  it("handles task with only short tokens (less than 4 chars) - no overlap", async () => {
    mockExecFileSync.mockReturnValue("");
    mockReadFileSync.mockImplementation((path: string) => {
      if (path.endsWith("ralph-loop.jsonl")) {
        return [
          JSON.stringify({
            event: "worker_started",
            improvement: 77,
            task: "a bb cc",
          }),
          JSON.stringify({
            event: "merge_completed",
            improvement: 77,
            success: true,
          }),
        ].join("\n");
      }
      if (path.endsWith("scripts/ralph/backlog.md")) {
        return "- Different Task\n- Proper Task\n";
      }
      if (path.endsWith("scripts/ralph/triage.md")) {
        return "";
      }
      return "";
    });

    const { syncTaskFilesFromLog } = await import("./backlog.js");
    const result = syncTaskFilesFromLog("/repo/ralph-loop.jsonl");

    expect(result.removedFromBacklog).toEqual([]);
  });

  it("skips worker_started with invalid improvement/task types", async () => {
    mockExecFileSync.mockReturnValue("");
    mockReadFileSync.mockImplementation((path: string) => {
      if (path.endsWith("ralph-loop.jsonl")) {
        return [
          JSON.stringify({
            event: "worker_started",
            improvement: "not a number",
            task: 123,
          }),
          JSON.stringify({
            event: "worker_started",
            improvement: 20,
            task: "Valid Task",
          }),
          JSON.stringify({
            event: "merge_completed",
            improvement: 20,
            success: true,
          }),
        ].join("\n");
      }
      if (path.endsWith("scripts/ralph/backlog.md")) {
        return "- Valid Task\n";
      }
      if (path.endsWith("scripts/ralph/triage.md")) {
        return "";
      }
      return "";
    });

    const { syncTaskFilesFromLog } = await import("./backlog.js");
    const result = syncTaskFilesFromLog("/repo/ralph-loop.jsonl");

    expect(result.removedFromBacklog).toEqual(["Valid Task"]);
  });

  it("skips merge_completed with success=false or invalid improvement type", async () => {
    mockExecFileSync.mockReturnValue("");
    mockReadFileSync.mockImplementation((path: string) => {
      if (path.endsWith("ralph-loop.jsonl")) {
        return [
          JSON.stringify({
            event: "worker_started",
            improvement: 30,
            task: "Task for Failed Merge",
          }),
          JSON.stringify({
            event: "merge_completed",
            improvement: 30,
            success: false,
          }),
          JSON.stringify({
            event: "merge_completed",
            improvement: "not a number",
            success: true,
          }),
          JSON.stringify({
            event: "merge_completed",
            improvement: 31,
            success: true,
          }),
        ].join("\n");
      }
      if (path.endsWith("scripts/ralph/backlog.md")) {
        return "- Task for Failed Merge\n";
      }
      if (path.endsWith("scripts/ralph/triage.md")) {
        return "";
      }
      return "";
    });

    const { syncTaskFilesFromLog } = await import("./backlog.js");
    const result = syncTaskFilesFromLog("/repo/ralph-loop.jsonl");

    expect(result.removedFromBacklog).toEqual([]);
  });

  it("skips JSON that parses to non-object or null", async () => {
    mockExecFileSync.mockReturnValue("");
    mockReadFileSync.mockImplementation((path: string) => {
      if (path.endsWith("ralph-loop.jsonl")) {
        return [
          "123",
          "true",
          "null",
          JSON.stringify({
            event: "worker_started",
            improvement: 50,
            task: "Task",
          }),
          JSON.stringify({
            event: "merge_completed",
            improvement: 50,
            success: true,
          }),
        ].join("\n");
      }
      if (path.endsWith("scripts/ralph/backlog.md")) {
        return "- Task\n";
      }
      if (path.endsWith("scripts/ralph/triage.md")) {
        return "";
      }
      return "";
    });

    const { syncTaskFilesFromLog } = await import("./backlog.js");
    const result = syncTaskFilesFromLog("/repo/ralph-loop.jsonl");

    expect(result.removedFromBacklog).toEqual(["Task"]);
  });

  it("does not match task with no tokens (all short) against merged task", async () => {
    mockExecFileSync.mockReturnValue("");
    mockReadFileSync.mockImplementation((path: string) => {
      if (path.endsWith("ralph-loop.jsonl")) {
        return [
          JSON.stringify({
            event: "worker_started",
            improvement: 88,
            task: "long task name",
          }),
          JSON.stringify({
            event: "merge_completed",
            improvement: 88,
            success: true,
          }),
        ].join("\n");
      }
      if (path.endsWith("scripts/ralph/backlog.md")) {
        return "- a bc d\n- Keep this\n";
      }
      if (path.endsWith("scripts/ralph/triage.md")) {
        return "";
      }
      return "";
    });

    const { syncTaskFilesFromLog } = await import("./backlog.js");
    const result = syncTaskFilesFromLog("/repo/ralph-loop.jsonl");

    expect(result.removedFromBacklog).toEqual([]);
  });
});

describe("readBacklog", () => {
  beforeEach(() => {
    vi.resetModules();
    mockAppendFileSync.mockReset();
    mockReadFileSync.mockReset();
    mockWriteFileSync.mockReset();
    mockExecFileSync.mockReset();
  });

  it("parses backlog.md into task array", async () => {
    mockReadFileSync.mockReturnValue("- Task A\n- Task B\n- Task C\n");

    const { readBacklog } = await import("./backlog.js");
    const tasks = readBacklog();

    expect(tasks).toEqual(["Task A", "Task B", "Task C"]);
  });

  it("returns empty array when file doesn't exist", async () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });

    const { readBacklog } = await import("./backlog.js");
    const tasks = readBacklog();

    expect(tasks).toEqual([]);
  });

  it("handles empty file", async () => {
    mockReadFileSync.mockReturnValue("");

    const { readBacklog } = await import("./backlog.js");
    const tasks = readBacklog();

    expect(tasks).toEqual([]);
  });

  it("filters out empty lines", async () => {
    mockReadFileSync.mockReturnValue("- Task A\n\n- Task B\n");

    const { readBacklog } = await import("./backlog.js");
    const tasks = readBacklog();

    expect(tasks).toEqual(["Task A", "Task B"]);
  });
});

describe("peekTask", () => {
  beforeEach(() => {
    vi.resetModules();
    mockAppendFileSync.mockReset();
    mockReadFileSync.mockReset();
    mockWriteFileSync.mockReset();
    mockExecFileSync.mockReset();
  });

  it("returns first task without removing it", async () => {
    mockReadFileSync.mockReturnValue("- First Task\n- Second Task\n");

    const { peekTask } = await import("./backlog.js");
    const task = peekTask();

    expect(task).toBe("First Task");
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it("returns undefined when backlog is empty", async () => {
    mockReadFileSync.mockReturnValue("");

    const { peekTask } = await import("./backlog.js");
    const task = peekTask();

    expect(task).toBeUndefined();
  });

  it("returns undefined when file doesn't exist", async () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });

    const { peekTask } = await import("./backlog.js");
    const task = peekTask();

    expect(task).toBeUndefined();
  });
});

describe("popTask", () => {
  beforeEach(() => {
    vi.resetModules();
    mockAppendFileSync.mockReset();
    mockReadFileSync.mockReset();
    mockWriteFileSync.mockReset();
    mockExecFileSync.mockReset();
  });

  it("removes and returns first task", async () => {
    mockReadFileSync.mockReturnValue("- First\n- Second\n- Third\n");

    const { popTask } = await import("./backlog.js");
    const task = popTask();

    expect(task).toBe("First");
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining("scripts/ralph/backlog.md"),
      "- Second\n- Third\n",
    );
  });

  it("returns undefined when backlog is empty", async () => {
    mockReadFileSync.mockReturnValue("");

    const { popTask } = await import("./backlog.js");
    const task = popTask();

    expect(task).toBeUndefined();
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it("returns undefined when file doesn't exist", async () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });

    const { popTask } = await import("./backlog.js");
    const task = popTask();

    expect(task).toBeUndefined();
  });

  it("handles single task", async () => {
    mockReadFileSync.mockReturnValue("- Only Task\n");

    const { popTask } = await import("./backlog.js");
    const task = popTask();

    expect(task).toBe("Only Task");
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining("scripts/ralph/backlog.md"),
      "\n",
    );
  });
});

describe("removeTask", () => {
  beforeEach(() => {
    vi.resetModules();
    mockAppendFileSync.mockReset();
    mockReadFileSync.mockReset();
    mockWriteFileSync.mockReset();
    mockExecFileSync.mockReset();
  });

  it("removes task by exact text match", async () => {
    mockReadFileSync.mockReturnValue("- Task A\n- Task B\n- Task C\n");

    const { removeTask } = await import("./backlog.js");
    const removed = removeTask("Task B");

    expect(removed).toBe(true);
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining("scripts/ralph/backlog.md"),
      "- Task A\n- Task C\n",
    );
  });

  it("returns false when task not found", async () => {
    mockReadFileSync.mockReturnValue("- Task A\n- Task B\n");

    const { removeTask } = await import("./backlog.js");
    const removed = removeTask("Nonexistent");

    expect(removed).toBe(false);
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it("handles partial matches (no removal)", async () => {
    mockReadFileSync.mockReturnValue("- Task ABC\n");

    const { removeTask } = await import("./backlog.js");
    const removed = removeTask("Task AB");

    expect(removed).toBe(false);
  });

  it("removes first occurrence when duplicates exist", async () => {
    mockReadFileSync.mockReturnValue("- Duplicate\n- Duplicate\n- Other\n");

    const { removeTask } = await import("./backlog.js");
    const removed = removeTask("Duplicate");

    expect(removed).toBe(true);
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining("scripts/ralph/backlog.md"),
      "- Duplicate\n- Other\n",
    );
  });
});

describe("readTriage", () => {
  beforeEach(() => {
    vi.resetModules();
    mockAppendFileSync.mockReset();
    mockReadFileSync.mockReset();
    mockWriteFileSync.mockReset();
    mockExecFileSync.mockReset();
  });

  it("parses triage.md into task array", async () => {
    mockReadFileSync.mockReturnValue("- Triage A\n- Triage B\n");

    const { readTriage } = await import("./backlog.js");
    const tasks = readTriage();

    expect(tasks).toEqual(["Triage A", "Triage B"]);
  });

  it("returns empty array when file doesn't exist", async () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });

    const { readTriage } = await import("./backlog.js");
    const tasks = readTriage();

    expect(tasks).toEqual([]);
  });

  it("handles empty file", async () => {
    mockReadFileSync.mockReturnValue("");

    const { readTriage } = await import("./backlog.js");
    const tasks = readTriage();

    expect(tasks).toEqual([]);
  });
});

describe("addTriageTask", () => {
  beforeEach(() => {
    vi.resetModules();
    mockAppendFileSync.mockReset();
    mockReadFileSync.mockReset();
    mockWriteFileSync.mockReset();
    mockExecFileSync.mockReset();
  });

  it("adds new task to triage", async () => {
    mockReadFileSync.mockReturnValue("- Existing\n");

    const { addTriageTask } = await import("./backlog.js");
    const added = addTriageTask("New Task");

    expect(added).toBe(true);
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining("scripts/ralph/triage.md"),
      "- Existing\n- New Task\n",
    );
  });

  it("returns false when task already exists", async () => {
    mockReadFileSync.mockReturnValue("- Existing\n");

    const { addTriageTask } = await import("./backlog.js");
    const added = addTriageTask("Existing");

    expect(added).toBe(false);
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it("adds to empty triage file", async () => {
    mockReadFileSync.mockReturnValue("");

    const { addTriageTask } = await import("./backlog.js");
    const added = addTriageTask("First Task");

    expect(added).toBe(true);
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining("scripts/ralph/triage.md"),
      "- First Task\n",
    );
  });

  it("is case-sensitive for duplicates", async () => {
    mockReadFileSync.mockReturnValue("- Task\n");

    const { addTriageTask } = await import("./backlog.js");
    const added = addTriageTask("task");

    expect(added).toBe(true);
  });
});

describe("removeTriageTask", () => {
  beforeEach(() => {
    vi.resetModules();
    mockAppendFileSync.mockReset();
    mockReadFileSync.mockReset();
    mockWriteFileSync.mockReset();
    mockExecFileSync.mockReset();
  });

  it("removes task from triage", async () => {
    mockReadFileSync.mockReturnValue("- Task A\n- Task B\n");

    const { removeTriageTask } = await import("./backlog.js");
    const removed = removeTriageTask("Task A");

    expect(removed).toBe(true);
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining("scripts/ralph/triage.md"),
      "- Task B\n",
    );
  });

  it("returns false when task not found", async () => {
    mockReadFileSync.mockReturnValue("- Task A\n");

    const { removeTriageTask } = await import("./backlog.js");
    const removed = removeTriageTask("Nonexistent");

    expect(removed).toBe(false);
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });
});

describe("moveTaskToMergeConflicts", () => {
  beforeEach(() => {
    vi.resetModules();
    mockAppendFileSync.mockReset();
    mockReadFileSync.mockReset();
    mockWriteFileSync.mockReset();
    mockExecFileSync.mockReset();
  });

  it("removes from backlog, adds to triage, appends to merge-conflicts.md", async () => {
    mockReadFileSync.mockImplementation((path: string) => {
      if (path.endsWith("scripts/ralph/backlog.md")) {
        return "- Conflicted Task\n- Other Task\n";
      }
      if (path.endsWith("scripts/ralph/triage.md")) {
        return "- Existing Triage\n";
      }
      if (path.endsWith("merge-conflicts.md")) {
        throw new Error("ENOENT");
      }
      return "";
    });

    const { moveTaskToMergeConflicts } = await import("./backlog.js");
    moveTaskToMergeConflicts("Conflicted Task", {
      improvement: 42,
      branchName: "harness-improvement-042",
      worktreePath: "/tmp/worktree-042",
    });

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining("scripts/ralph/backlog.md"),
      "- Other Task\n",
    );
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining("scripts/ralph/triage.md"),
      expect.stringContaining(
        "Resolve merge conflict for improvement #42 (harness-improvement-042)",
      ),
    );
    expect(mockAppendFileSync).toHaveBeenCalledWith(
      expect.stringContaining("merge-conflicts.md"),
      expect.stringContaining("improvement=42"),
    );
  });

  it("skips duplicate entries in merge-conflicts.md", async () => {
    mockReadFileSync.mockImplementation((path: string) => {
      if (path.endsWith("scripts/ralph/backlog.md")) {
        return "- Task\n";
      }
      if (path.endsWith("scripts/ralph/triage.md")) {
        return "";
      }
      if (path.endsWith("merge-conflicts.md")) {
        return "- [2026-02-25T12:00:00.000Z] Task | improvement=5 branch=harness-improvement-005 | worktree=/tmp/worktree-005 | ...\n";
      }
      return "";
    });

    const { moveTaskToMergeConflicts } = await import("./backlog.js");
    moveTaskToMergeConflicts("Task", {
      improvement: 5,
      branchName: "harness-improvement-005",
      worktreePath: "/tmp/worktree-005",
    });

    expect(mockAppendFileSync).not.toHaveBeenCalled();
  });

  it("creates merge-conflicts.md if it doesn't exist", async () => {
    mockReadFileSync.mockImplementation((path: string) => {
      if (path.endsWith("scripts/ralph/backlog.md")) {
        return "- Task\n";
      }
      if (path.endsWith("scripts/ralph/triage.md")) {
        return "";
      }
      if (path.endsWith("merge-conflicts.md")) {
        throw new Error("ENOENT");
      }
      return "";
    });

    const { moveTaskToMergeConflicts } = await import("./backlog.js");
    moveTaskToMergeConflicts("New Task", {
      improvement: 10,
      branchName: "harness-improvement-010",
      worktreePath: "/tmp/worktree-010",
    });

    expect(mockAppendFileSync).toHaveBeenCalled();
  });
});

describe("writeBacklog", () => {
  beforeEach(() => {
    vi.resetModules();
    mockAppendFileSync.mockReset();
    mockReadFileSync.mockReset();
    mockWriteFileSync.mockReset();
    mockExecFileSync.mockReset();
  });

  it("writes tasks to backlog.md", async () => {
    const { writeBacklog } = await import("./backlog.js");
    writeBacklog(["Task A", "Task B"]);

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining("scripts/ralph/backlog.md"),
      "- Task A\n- Task B\n",
    );
  });

  it("writes empty array as newline only", async () => {
    const { writeBacklog } = await import("./backlog.js");
    writeBacklog([]);

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining("scripts/ralph/backlog.md"),
      "\n",
    );
  });

  it("formats multiple tasks correctly", async () => {
    const { writeBacklog } = await import("./backlog.js");
    writeBacklog(["First", "Second", "Third"]);

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining("scripts/ralph/backlog.md"),
      "- First\n- Second\n- Third\n",
    );
  });
});

describe("backlogPath", () => {
  beforeEach(() => {
    vi.resetModules();
    mockAppendFileSync.mockReset();
    mockReadFileSync.mockReset();
    mockWriteFileSync.mockReset();
    mockExecFileSync.mockReset();
  });

  it("returns path to backlog.md", async () => {
    const { backlogPath } = await import("./backlog.js");
    const path = backlogPath();

    expect(path).toMatch(/scripts\/ralph\/backlog\.md$/);
  });

  it("returns consistent path", async () => {
    const { backlogPath } = await import("./backlog.js");
    const path1 = backlogPath();
    const path2 = backlogPath();

    expect(path1).toBe(path2);
  });
});
