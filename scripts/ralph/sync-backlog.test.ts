import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockResolveConfig = vi.fn();
const mockSyncTaskFilesFromLog = vi.fn();
let consoleLogSpy: ReturnType<typeof vi.spyOn>;

vi.mock("./config.js", () => ({
  resolveConfig: mockResolveConfig,
}));

vi.mock("./backlog.js", () => ({
  syncTaskFilesFromLog: mockSyncTaskFilesFromLog,
}));

describe("sync-backlog script", () => {
  beforeEach(() => {
    vi.resetModules();
    mockResolveConfig.mockReset();
    mockSyncTaskFilesFromLog.mockReset();
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    if (consoleLogSpy) {
      consoleLogSpy.mockRestore();
    }
  });

  describe("logs sync results with removals", () => {
    it("displays correct summary when tasks are removed", async () => {
      mockResolveConfig.mockReturnValue({
        logFile: "/repo/ralph-loop.jsonl",
      });

      mockSyncTaskFilesFromLog.mockReturnValue({
        mergedTasksSeen: 3,
        removedFromBacklog: ["Task A", "Task B"],
        removedFromTriage: ["Triage Task 1"],
      });

      // Import the module to trigger main()
      await import("./sync-backlog.js");

      // Verify console.log was called with correct output
      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);

      expect(calls).toContainEqual("Merged tasks seen: 3");
      expect(calls).toContainEqual("Removed tasks   : 3");
      expect(calls).toContainEqual("  - backlog     : 2");
      expect(calls).toContainEqual("  - triage      : 1");
    });

    it("lists all removed backlog tasks", async () => {
      mockResolveConfig.mockReturnValue({
        logFile: "/repo/ralph-loop.jsonl",
      });

      mockSyncTaskFilesFromLog.mockReturnValue({
        mergedTasksSeen: 1,
        removedFromBacklog: ["Test task 1", "Test task 2", "Test task 3"],
        removedFromTriage: [],
      });

      await import("./sync-backlog.js");

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);

      expect(calls).toContainEqual("  backlog: Test task 1");
      expect(calls).toContainEqual("  backlog: Test task 2");
      expect(calls).toContainEqual("  backlog: Test task 3");
    });

    it("lists all removed triage tasks", async () => {
      mockResolveConfig.mockReturnValue({
        logFile: "/repo/ralph-loop.jsonl",
      });

      mockSyncTaskFilesFromLog.mockReturnValue({
        mergedTasksSeen: 2,
        removedFromBacklog: [],
        removedFromTriage: ["Triage item 1", "Triage item 2"],
      });

      await import("./sync-backlog.js");

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);

      expect(calls).toContainEqual("  triage: Triage item 1");
      expect(calls).toContainEqual("  triage: Triage item 2");
    });
  });

  describe("logs sync results with zero removals", () => {
    it("displays zero counts when no tasks are removed", async () => {
      mockResolveConfig.mockReturnValue({
        logFile: "/repo/ralph-loop.jsonl",
      });

      mockSyncTaskFilesFromLog.mockReturnValue({
        mergedTasksSeen: 0,
        removedFromBacklog: [],
        removedFromTriage: [],
      });

      await import("./sync-backlog.js");

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);

      expect(calls).toContainEqual("Merged tasks seen: 0");
      expect(calls).toContainEqual("Removed tasks   : 0");
      expect(calls).toContainEqual("  - backlog     : 0");
      expect(calls).toContainEqual("  - triage      : 0");
    });

    it("does NOT list any tasks when arrays are empty", async () => {
      mockResolveConfig.mockReturnValue({
        logFile: "/repo/ralph-loop.jsonl",
      });

      mockSyncTaskFilesFromLog.mockReturnValue({
        mergedTasksSeen: 5,
        removedFromBacklog: [],
        removedFromTriage: [],
      });

      await import("./sync-backlog.js");

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);

      // Verify no task lines are logged (only the summary lines)
      const taskLines = calls.filter((c) => c.includes("  backlog:") || c.includes("  triage:"));
      expect(taskLines).toHaveLength(0);
    });
  });

  describe("integration", () => {
    it("calls resolveConfig from config module", async () => {
      mockResolveConfig.mockReturnValue({
        logFile: "/test/log.jsonl",
      });

      mockSyncTaskFilesFromLog.mockReturnValue({
        mergedTasksSeen: 0,
        removedFromBacklog: [],
        removedFromTriage: [],
      });

      await import("./sync-backlog.js");

      expect(mockResolveConfig).toHaveBeenCalled();
    });

    it("calls syncTaskFilesFromLog with logFile from config", async () => {
      const testLogFile = "/custom/path/ralph-loop.jsonl";
      mockResolveConfig.mockReturnValue({
        logFile: testLogFile,
      });

      mockSyncTaskFilesFromLog.mockReturnValue({
        mergedTasksSeen: 1,
        removedFromBacklog: [],
        removedFromTriage: [],
      });

      await import("./sync-backlog.js");

      expect(mockSyncTaskFilesFromLog).toHaveBeenCalledWith(testLogFile);
    });

    it("calculates total removed count correctly", async () => {
      mockResolveConfig.mockReturnValue({
        logFile: "/repo/ralph-loop.jsonl",
      });

      mockSyncTaskFilesFromLog.mockReturnValue({
        mergedTasksSeen: 10,
        removedFromBacklog: ["A", "B", "C"],
        removedFromTriage: ["X", "Y"],
      });

      await import("./sync-backlog.js");

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);

      // Should show 5 total removed (3 backlog + 2 triage)
      expect(calls).toContainEqual("Removed tasks   : 5");
    });
  });

  describe("output format", () => {
    it("displays merged tasks seen line first", async () => {
      mockResolveConfig.mockReturnValue({
        logFile: "/repo/ralph-loop.jsonl",
      });

      mockSyncTaskFilesFromLog.mockReturnValue({
        mergedTasksSeen: 2,
        removedFromBacklog: [],
        removedFromTriage: [],
      });

      await import("./sync-backlog.js");

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      const mergedIndex = calls.findIndex((c) => c.includes("Merged tasks seen"));
      const removedIndex = calls.findIndex((c) => c.includes("Removed tasks"));

      expect(mergedIndex).toBeGreaterThanOrEqual(0);
      expect(removedIndex).toBeGreaterThan(mergedIndex);
    });

    it("properly indents task listings", async () => {
      mockResolveConfig.mockReturnValue({
        logFile: "/repo/ralph-loop.jsonl",
      });

      mockSyncTaskFilesFromLog.mockReturnValue({
        mergedTasksSeen: 1,
        removedFromBacklog: ["Task"],
        removedFromTriage: [],
      });

      await import("./sync-backlog.js");

      const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
      const taskLine = calls.find((c) => c.includes("  backlog:"));

      expect(taskLine).toBeDefined();
      expect(taskLine).toMatch(/^  backlog:/);
    });
  });
});
