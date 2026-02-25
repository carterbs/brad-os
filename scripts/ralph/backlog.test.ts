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
});
