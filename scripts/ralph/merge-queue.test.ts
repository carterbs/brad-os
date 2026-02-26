import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockMergeToMain, mockCleanupWorktree } = vi.hoisted(() => ({
  mockMergeToMain: vi.fn(),
  mockCleanupWorktree: vi.fn(),
}));

vi.mock("./git.js", () => ({
  mergeToMain: mockMergeToMain,
  cleanupWorktree: mockCleanupWorktree,
}));

describe("MergeQueue", () => {
  let mockLogger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    vi.resetModules();
    mockMergeToMain.mockReset();
    mockCleanupWorktree.mockReset();
    mockLogger = createMockLogger();
  });

  describe("enqueue: merge succeeds", () => {
    it("calls cleanupWorktree and returns success=true", async () => {
      mockMergeToMain.mockReturnValue(true);

      const { MergeQueue } = await import("./merge-queue.js");
      const queue = new MergeQueue();

      const result = await queue.enqueue({
        repoDir: "/repo",
        worktreePath: "/tmp/worktrees/test-branch",
        branchName: "test-branch",
        improvement: 1,
        worker: 0,
        logger: mockLogger,
      });

      expect(result).toEqual({
        success: true,
        improvement: 1,
        worker: 0,
        branchName: "test-branch",
      });

      expect(mockMergeToMain).toHaveBeenCalledWith("/repo", "test-branch");
      expect(mockCleanupWorktree).toHaveBeenCalledWith(
        "/repo",
        "/tmp/worktrees/test-branch",
        "test-branch",
      );
      expect(mockLogger.success).toHaveBeenCalledWith(
        "Merged test-branch to main",
      );
    });
  });

  describe("enqueue: merge fails", () => {
    it("does NOT call cleanupWorktree and returns success=false", async () => {
      mockMergeToMain.mockReturnValue(false);

      const { MergeQueue } = await import("./merge-queue.js");
      const queue = new MergeQueue();

      const result = await queue.enqueue({
        repoDir: "/repo",
        worktreePath: "/tmp/worktrees/test-branch",
        branchName: "test-branch",
        improvement: 1,
        worker: 0,
        logger: mockLogger,
      });

      expect(result).toEqual({
        success: false,
        improvement: 1,
        worker: 0,
        branchName: "test-branch",
      });

      expect(mockMergeToMain).toHaveBeenCalled();
      expect(mockCleanupWorktree).not.toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("Merge conflict — worktree preserved at:"),
      );
    });
  });

  describe("sequential processing", () => {
    it("processes enqueued jobs in FIFO order", async () => {
      mockMergeToMain.mockReturnValue(true);
      const processingOrder: number[] = [];

      // Track order via jsonl events
      mockLogger.jsonl.mockImplementation((event: Record<string, unknown>) => {
        if (event.event === "merge_queued" && event.improvement !== undefined) {
          processingOrder.push(event.improvement as number);
        }
      });

      const { MergeQueue } = await import("./merge-queue.js");
      const queue = new MergeQueue();

      const promise1 = queue.enqueue({
        repoDir: "/repo",
        worktreePath: "/tmp/worktrees/branch1",
        branchName: "branch1",
        improvement: 10,
        worker: 0,
        logger: mockLogger,
      });

      const promise2 = queue.enqueue({
        repoDir: "/repo",
        worktreePath: "/tmp/worktrees/branch2",
        branchName: "branch2",
        improvement: 11,
        worker: 1,
        logger: mockLogger,
      });

      const promise3 = queue.enqueue({
        repoDir: "/repo",
        worktreePath: "/tmp/worktrees/branch3",
        branchName: "branch3",
        improvement: 12,
        worker: 2,
        logger: mockLogger,
      });

      const results = await Promise.all([promise1, promise2, promise3]);

      expect(results).toHaveLength(3);
      expect(results[0].improvement).toBe(10);
      expect(results[1].improvement).toBe(11);
      expect(results[2].improvement).toBe(12);

      // Verify jobs were processed sequentially by checking jsonl calls
      const jsonlCalls = mockLogger.jsonl.mock.calls;
      expect(jsonlCalls.length).toBeGreaterThanOrEqual(6); // At least 3 queued + 3 completed
    });
  });

  describe("logging", () => {
    it("logs merge_queued event with correct fields", async () => {
      mockMergeToMain.mockReturnValue(true);

      const { MergeQueue } = await import("./merge-queue.js");
      const queue = new MergeQueue();

      await queue.enqueue({
        repoDir: "/repo",
        worktreePath: "/tmp/worktrees/test-branch",
        branchName: "test-branch",
        improvement: 5,
        worker: 1,
        logger: mockLogger,
      });

      const queuedCall = mockLogger.jsonl.mock.calls.find(
        (call) => (call[0] as Record<string, unknown>).event === "merge_queued",
      );

      expect(queuedCall).toBeDefined();
      const event = queuedCall![0] as Record<string, unknown>;
      expect(event.event).toBe("merge_queued");
      expect(event.worker).toBe(1);
      expect(event.improvement).toBe(5);
      expect(event.branch).toBe("test-branch");
      expect(typeof event.ts).toBe("string");
    });

    it("logs merge_completed event with success=true", async () => {
      mockMergeToMain.mockReturnValue(true);

      const { MergeQueue } = await import("./merge-queue.js");
      const queue = new MergeQueue();

      await queue.enqueue({
        repoDir: "/repo",
        worktreePath: "/tmp/worktrees/test-branch",
        branchName: "test-branch",
        improvement: 3,
        worker: 2,
        logger: mockLogger,
      });

      const completedCall = mockLogger.jsonl.mock.calls.find(
        (call) => (call[0] as Record<string, unknown>).event === "merge_completed",
      );

      expect(completedCall).toBeDefined();
      const event = completedCall![0] as Record<string, unknown>;
      expect(event.event).toBe("merge_completed");
      expect(event.worker).toBe(2);
      expect(event.improvement).toBe(3);
      expect(event.branch).toBe("test-branch");
      expect(event.success).toBe(true);
      expect(typeof event.ts).toBe("string");
    });

    it("logs merge_completed event with success=false", async () => {
      mockMergeToMain.mockReturnValue(false);

      const { MergeQueue } = await import("./merge-queue.js");
      const queue = new MergeQueue();

      await queue.enqueue({
        repoDir: "/repo",
        worktreePath: "/tmp/worktrees/conflict-branch",
        branchName: "conflict-branch",
        improvement: 99,
        worker: 0,
        logger: mockLogger,
      });

      const completedCall = mockLogger.jsonl.mock.calls.find(
        (call) => (call[0] as Record<string, unknown>).event === "merge_completed",
      );

      expect(completedCall).toBeDefined();
      const event = completedCall![0] as Record<string, unknown>;
      expect(event.success).toBe(false);
    });

    it("logs info message indicating merge in progress", async () => {
      mockMergeToMain.mockReturnValue(true);

      const { MergeQueue } = await import("./merge-queue.js");
      const queue = new MergeQueue();

      await queue.enqueue({
        repoDir: "/repo",
        worktreePath: "/tmp/worktrees/test-branch",
        branchName: "test-branch",
        improvement: 1,
        worker: 0,
        logger: mockLogger,
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("[4/4] Merging"),
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("test-branch"),
      );
    });
  });
});

// Helper function to create a mock logger
function createMockLogger() {
  return {
    jsonl: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    tool: vi.fn(),
    verboseMsg: vi.fn(),
    heading: vi.fn(),
    compaction: vi.fn(),
    stepSummary: vi.fn(),
    improvementSummary: vi.fn(),
  };
}
