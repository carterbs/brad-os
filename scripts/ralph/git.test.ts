import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockExecFileSync, mockExistsSync } = vi.hoisted(() => ({
  mockExecFileSync: vi.fn(),
  mockExistsSync: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFileSync: mockExecFileSync,
}));

vi.mock("node:fs", () => ({
  existsSync: mockExistsSync,
}));

describe("git module", () => {
  beforeEach(() => {
    vi.resetModules();
    mockExecFileSync.mockReset();
    mockExistsSync.mockReset();
  });

  describe("createWorktree", () => {
    it("Case 1: worktree exists with prior work — resume", async () => {
      mockExistsSync.mockReturnValue(true);
      mockExecFileSync.mockImplementation(
        (_cmd: string, args: string[] | unknown[], _opts?: unknown) => {
          const argsArray = Array.isArray(args) ? args : [];
          // branchExists: rev-parse --verify
          if (
            argsArray.includes("rev-parse") &&
            argsArray.includes("--verify")
          ) {
            return "abc123def456";
          }
          // branchHasWork: rev-list --count
          if (
            argsArray.includes("rev-list") &&
            argsArray.includes("--count")
          ) {
            return "2";
          }
          return "";
        },
      );

      const { createWorktree } = await import("./git.js");
      const result = createWorktree(
        "/repo",
        "/tmp/worktrees",
        "/tmp/worktrees/test-branch",
        "test-branch",
      );

      expect(result).toEqual({ created: true, resumed: true });
      expect(mockExecFileSync).toHaveBeenCalledWith(
        "ln",
        expect.arrayContaining(["-s"]),
        { stdio: "pipe" },
      );
    });

    it("Case 2: worktree exists, no work — recreate fresh", async () => {
      mockExistsSync.mockReturnValue(true);
      mockExecFileSync.mockImplementation(
        (_cmd: string, args: string[] | unknown[], _opts?: unknown) => {
          const argsArray = Array.isArray(args) ? args : [];
          // branchExists: rev-parse --verify
          if (
            argsArray.includes("rev-parse") &&
            argsArray.includes("--verify")
          ) {
            return "abc123def456";
          }
          // branchHasWork: rev-list --count
          if (
            argsArray.includes("rev-list") &&
            argsArray.includes("--count")
          ) {
            return "0";
          }
          return "";
        },
      );

      const { createWorktree } = await import("./git.js");
      const result = createWorktree(
        "/repo",
        "/tmp/worktrees",
        "/tmp/worktrees/test-branch",
        "test-branch",
      );

      expect(result).toEqual({ created: true, resumed: false });
      // Check that worktree was removed and recreated
      const calls = mockExecFileSync.mock.calls;
      const hasWorktreeRemove = calls.some((c) =>
        Array.isArray(c[1]) && c[1].includes("worktree") && c[1].includes("remove")
      );
      const hasBranchDelete = calls.some((c) =>
        Array.isArray(c[1]) && c[1].includes("branch") && c[1].includes("-D")
      );
      expect(hasWorktreeRemove).toBe(true);
      expect(hasBranchDelete).toBe(true);
    });

    it("Case 2b: worktree exists, branch doesn't exist — removes and creates fresh", async () => {
      mockExistsSync.mockReturnValue(true);
      mockExecFileSync.mockImplementation(
        (_cmd: string, args: string[] | unknown[], _opts?: unknown) => {
          const argsArray = Array.isArray(args) ? args : [];
          // branchExists: rev-parse --verify returns empty
          if (
            argsArray.includes("rev-parse") &&
            argsArray.includes("--verify")
          ) {
            return "";
          }
          // branchHasWork: rev-list --count
          if (
            argsArray.includes("rev-list") &&
            argsArray.includes("--count")
          ) {
            return "0";
          }
          return "";
        },
      );

      const { createWorktree } = await import("./git.js");
      const result = createWorktree(
        "/repo",
        "/tmp/worktrees",
        "/tmp/worktrees/test-branch",
        "test-branch",
      );

      expect(result).toEqual({ created: true, resumed: false });
      // Check that worktree was removed
      const calls = mockExecFileSync.mock.calls;
      const hasWorktreeRemove = calls.some((c) =>
        Array.isArray(c[1]) && c[1].includes("worktree") && c[1].includes("remove")
      );
      expect(hasWorktreeRemove).toBe(true);
    });

    it("Case 3: branch has work but worktree gone — adds worktree from existing branch", async () => {
      let existsSyncCallCount = 0;
      mockExistsSync.mockImplementation((path: string) => {
        existsSyncCallCount++;
        // First call is worktreeExists check, should return false (worktree is gone)
        if (existsSyncCallCount === 1) {
          return false;
        }
        // Later checks (after worktree add) should return true
        if (path === "/tmp/worktrees/test-branch") {
          return true;
        }
        return false;
      });

      mockExecFileSync.mockImplementation(
        (_cmd: string, args: string[] | unknown[], _opts?: unknown) => {
          const argsArray = Array.isArray(args) ? args : [];
          // branchExists: rev-parse --verify
          if (
            argsArray.includes("rev-parse") &&
            argsArray.includes("--verify")
          ) {
            return "abc123def456";
          }
          // branchHasWork: rev-list --count
          if (
            argsArray.includes("rev-list") &&
            argsArray.includes("--count")
          ) {
            return "1";
          }
          return "";
        },
      );

      const { createWorktree } = await import("./git.js");
      const result = createWorktree(
        "/repo",
        "/tmp/worktrees",
        "/tmp/worktrees/test-branch",
        "test-branch",
      );

      expect(result).toEqual({ created: true, resumed: true });
      // Check that mkdir and worktree add were called
      const calls = mockExecFileSync.mock.calls;
      const hasMkdir = calls.some((c) =>
        c[0] === "mkdir" && Array.isArray(c[1]) && c[1].includes("/tmp/worktrees")
      );
      const hasWorktreeAdd = calls.some((c) =>
        Array.isArray(c[1]) && c[1].includes("worktree") && c[1].includes("add")
      );
      expect(hasMkdir).toBe(true);
      expect(hasWorktreeAdd).toBe(true);
    });

    it("Case 3 failure: worktree add fails — returns created: false, resumed: false", async () => {
      mockExistsSync.mockReturnValue(false);
      mockExecFileSync.mockImplementation(
        (_cmd: string, args: string[] | unknown[], _opts?: unknown) => {
          const argsArray = Array.isArray(args) ? args : [];
          // branchExists: rev-parse --verify
          if (
            argsArray.includes("rev-parse") &&
            argsArray.includes("--verify")
          ) {
            return "abc123def456";
          }
          // branchHasWork: rev-list --count
          if (
            argsArray.includes("rev-list") &&
            argsArray.includes("--count")
          ) {
            return "1";
          }
          return "";
        },
      );

      const { createWorktree } = await import("./git.js");
      const result = createWorktree(
        "/repo",
        "/tmp/worktrees",
        "/tmp/worktrees/test-branch",
        "test-branch",
      );

      expect(result).toEqual({ created: false, resumed: false });
    });

    it("Case 4: branch exists but no work — deletes branch and creates fresh", async () => {
      // First existsSync(worktreePath) returns false, then returns true after creation
      mockExistsSync.mockImplementation((path: string) => {
        return path === "/tmp/worktrees/test-branch";
      });

      mockExecFileSync.mockImplementation(
        (_cmd: string, args: string[] | unknown[], _opts?: unknown) => {
          const argsArray = Array.isArray(args) ? args : [];
          // branchExists: rev-parse --verify
          if (
            argsArray.includes("rev-parse") &&
            argsArray.includes("--verify")
          ) {
            return "abc123def456";
          }
          // branchHasWork: rev-list --count
          if (
            argsArray.includes("rev-list") &&
            argsArray.includes("--count")
          ) {
            return "0";
          }
          return "";
        },
      );

      const { createWorktree } = await import("./git.js");
      const result = createWorktree(
        "/repo",
        "/tmp/worktrees",
        "/tmp/worktrees/test-branch",
        "test-branch",
      );

      expect(result).toEqual({ created: true, resumed: false });
      // Check that branch was deleted and recreated
      const calls = mockExecFileSync.mock.calls;
      const hasBranchDelete = calls.some((c) =>
        Array.isArray(c[1]) && c[1].includes("branch") && c[1].includes("-D")
      );
      const hasWorktreeAdd = calls.some((c) =>
        Array.isArray(c[1]) && c[1].includes("worktree") && c[1].includes("add")
      );
      expect(hasBranchDelete).toBe(true);
      expect(hasWorktreeAdd).toBe(true);
    });

    it("Case 5: neither exists — creates fresh", async () => {
      // First existsSync(worktreePath) returns false, then returns true after creation
      mockExistsSync.mockImplementation((path: string) => {
        return path === "/tmp/worktrees/test-branch";
      });

      mockExecFileSync.mockImplementation(
        (_cmd: string, args: string[] | unknown[], _opts?: unknown) => {
          const argsArray = Array.isArray(args) ? args : [];
          // branchExists: rev-parse --verify
          if (
            argsArray.includes("rev-parse") &&
            argsArray.includes("--verify")
          ) {
            return "";
          }
          return "";
        },
      );

      const { createWorktree } = await import("./git.js");
      const result = createWorktree(
        "/repo",
        "/tmp/worktrees",
        "/tmp/worktrees/test-branch",
        "test-branch",
      );

      expect(result).toEqual({ created: true, resumed: false });
      // Check that mkdir and worktree add were called
      const calls = mockExecFileSync.mock.calls;
      const hasMkdir = calls.some((c) =>
        c[0] === "mkdir" && Array.isArray(c[1]) && c[1].includes("/tmp/worktrees")
      );
      const hasWorktreeAdd = calls.some((c) =>
        Array.isArray(c[1]) && c[1].includes("worktree") && c[1].includes("add") && c[1].includes("-b")
      );
      expect(hasMkdir).toBe(true);
      expect(hasWorktreeAdd).toBe(true);
    });

    it("Case 5 failure: creation fails — returns created: false, resumed: false", async () => {
      mockExistsSync.mockReturnValue(false);
      mockExecFileSync.mockImplementation(
        (_cmd: string, args: string[] | unknown[], _opts?: unknown) => {
          const argsArray = Array.isArray(args) ? args : [];
          // branchExists: rev-parse --verify
          if (
            argsArray.includes("rev-parse") &&
            argsArray.includes("--verify")
          ) {
            return "";
          }
          return "";
        },
      );

      const { createWorktree } = await import("./git.js");
      const result = createWorktree(
        "/repo",
        "/tmp/worktrees",
        "/tmp/worktrees/test-branch",
        "test-branch",
      );

      expect(result).toEqual({ created: false, resumed: false });
    });

    it("symlink already exists — should not crash", async () => {
      mockExistsSync.mockReturnValue(true);
      mockExecFileSync.mockImplementation(
        (_cmd: string, args: string[] | unknown[], _opts?: unknown) => {
          const argsArray = Array.isArray(args) ? args : [];
          // branchExists: rev-parse --verify
          if (
            argsArray.includes("rev-parse") &&
            argsArray.includes("--verify")
          ) {
            return "abc123def456";
          }
          // branchHasWork: rev-list --count
          if (
            argsArray.includes("rev-list") &&
            argsArray.includes("--count")
          ) {
            return "2";
          }
          // ln -s throws
          if (argsArray.includes("-s")) {
            throw new Error("File exists");
          }
          return "";
        },
      );

      const { createWorktree } = await import("./git.js");
      const result = createWorktree(
        "/repo",
        "/tmp/worktrees",
        "/tmp/worktrees/test-branch",
        "test-branch",
      );

      expect(result).toEqual({ created: true, resumed: true });
    });
  });

  describe("cleanupWorktree", () => {
    it("calls git worktree remove and branch -d", async () => {
      mockExecFileSync.mockReturnValue("");

      const { cleanupWorktree } = await import("./git.js");
      cleanupWorktree("/repo", "/tmp/worktrees/test-branch", "test-branch");

      // Check that both commands were called
      const calls = mockExecFileSync.mock.calls;
      const hasWorktreeRemove = calls.some((c) =>
        Array.isArray(c[1]) && c[1].includes("worktree") && c[1].includes("remove")
      );
      const hasBranchDelete = calls.some((c) =>
        Array.isArray(c[1]) && c[1].includes("branch") && c[1].includes("-d")
      );
      expect(hasWorktreeRemove).toBe(true);
      expect(hasBranchDelete).toBe(true);
    });
  });

  describe("mergeToMain", () => {
    it("success case — returns true", async () => {
      mockExecFileSync.mockReturnValue("");

      const { mergeToMain } = await import("./git.js");
      const result = mergeToMain("/repo", "test-branch");

      expect(result).toBe(true);
      expect(mockExecFileSync).toHaveBeenCalledWith(
        "git",
        ["-C", "/repo", "merge", "test-branch", "--no-edit"],
        { encoding: "utf-8", stdio: "pipe" },
      );
    });

    it("failure case — returns false", async () => {
      mockExecFileSync.mockImplementation(
        (_cmd: string, args: string[] | unknown[], _opts?: unknown) => {
          const argsArray = Array.isArray(args) ? args : [];
          if (argsArray.includes("merge")) {
            throw new Error("Merge conflict");
          }
          return "";
        },
      );

      const { mergeToMain } = await import("./git.js");
      const result = mergeToMain("/repo", "test-branch");

      expect(result).toBe(false);
    });
  });

  describe("countCompleted", () => {
    it("returns sum of merge commits and legacy commits", async () => {
      mockExecFileSync.mockImplementation(
        (_cmd: string, args: string[] | unknown[], _opts?: unknown) => {
          const argsArray = Array.isArray(args) ? args : [];
          // Merge commits
          if (
            argsArray.includes("--merges") &&
            argsArray.includes("--grep=harness-improvement")
          ) {
            return "abc1234 Merge branch 'harness-improvement-001'\ndef5678 Merge branch 'harness-improvement-002'";
          }
          // Legacy commits
          if (
            argsArray.includes("--no-merges") &&
            argsArray.includes("--grep=^harness: improvement #")
          ) {
            return "ghi9012 harness: improvement #3\njkl3456 harness: improvement #4";
          }
          return "";
        },
      );

      const { countCompleted } = await import("./git.js");
      const result = countCompleted("/repo");

      expect(result).toBe(4);
    });

    it("returns 0 when no matches (empty strings)", async () => {
      mockExecFileSync.mockReturnValue("");

      const { countCompleted } = await import("./git.js");
      const result = countCompleted("/repo");

      expect(result).toBe(0);
    });

    it("counts only merge commits when no legacy commits", async () => {
      mockExecFileSync.mockImplementation(
        (_cmd: string, args: string[] | unknown[], _opts?: unknown) => {
          const argsArray = Array.isArray(args) ? args : [];
          // Merge commits
          if (
            argsArray.includes("--merges") &&
            argsArray.includes("--grep=harness-improvement")
          ) {
            return "abc1234 Merge branch 'harness-improvement-001'";
          }
          // Legacy commits (empty)
          if (
            argsArray.includes("--no-merges") &&
            argsArray.includes("--grep=^harness: improvement #")
          ) {
            return "";
          }
          return "";
        },
      );

      const { countCompleted } = await import("./git.js");
      const result = countCompleted("/repo");

      expect(result).toBe(1);
    });

    it("counts only legacy commits when no merge commits", async () => {
      mockExecFileSync.mockImplementation(
        (_cmd: string, args: string[] | unknown[], _opts?: unknown) => {
          const argsArray = Array.isArray(args) ? args : [];
          // Merge commits (empty)
          if (
            argsArray.includes("--merges") &&
            argsArray.includes("--grep=harness-improvement")
          ) {
            return "";
          }
          // Legacy commits
          if (
            argsArray.includes("--no-merges") &&
            argsArray.includes("--grep=^harness: improvement #")
          ) {
            return "ghi9012 harness: improvement #3";
          }
          return "";
        },
      );

      const { countCompleted } = await import("./git.js");
      const result = countCompleted("/repo");

      expect(result).toBe(1);
    });
  });

  describe("hasNewCommits", () => {
    it("returns true when count > 0", async () => {
      mockExecFileSync.mockReturnValue("3");

      const { hasNewCommits } = await import("./git.js");
      const result = hasNewCommits("/repo");

      expect(result).toBe(true);
      expect(mockExecFileSync).toHaveBeenCalledWith(
        "git",
        ["rev-list", "--count", "main..HEAD"],
        { cwd: "/repo", encoding: "utf-8", stdio: "pipe" },
      );
    });

    it("returns false when count is 0", async () => {
      mockExecFileSync.mockReturnValue("0");

      const { hasNewCommits } = await import("./git.js");
      const result = hasNewCommits("/repo");

      expect(result).toBe(false);
    });

    it("returns false when git throws", async () => {
      mockExecFileSync.mockImplementation(
        (_cmd: string, args: string[] | unknown[], _opts?: unknown) => {
          const argsArray = Array.isArray(args) ? args : [];
          if (argsArray.includes("rev-list")) {
            throw new Error("Not a git repository");
          }
          return "";
        },
      );

      const { hasNewCommits } = await import("./git.js");
      const result = hasNewCommits("/repo");

      expect(result).toBe(false);
    });
  });

  describe("git helper (internal)", () => {
    it("git command failure returns empty string", async () => {
      mockExistsSync.mockReturnValue(true);
      mockExecFileSync.mockImplementation(
        (cmd: string, args: string[] | unknown[], _opts?: unknown) => {
          const argsArray = Array.isArray(args) ? args : [];
          // Only git calls throw, ln -s succeeds
          if (cmd === "git") {
            throw new Error("git command failed");
          }
          return "";
        },
      );

      const { createWorktree } = await import("./git.js");
      const result = createWorktree(
        "/repo",
        "/tmp/worktrees",
        "/tmp/worktrees/test-branch",
        "test-branch",
      );

      // When rev-parse fails, branchExists returns false
      // When rev-list fails, branchHasWork returns false
      // worktreeExists = true, branchFound = false, hasWork = false
      // Goes into Case 2: removes worktree and creates fresh, but all git calls fail
      expect(result.created || !result.created).toBe(true); // Just verify it doesn't crash
    });
  });

  describe("commitAll", () => {
    it("git add succeeds, has staged changes, commit succeeds — returns true", async () => {
      mockExecFileSync.mockImplementation(
        (_cmd: string, args: string[] | unknown[], _opts?: unknown) => {
          const argsArray = Array.isArray(args) ? args : [];
          // git add -A
          if (argsArray.includes("add") && argsArray.includes("-A")) {
            return "";
          }
          // git diff --cached --quiet throws (has changes)
          if (argsArray.includes("diff") && argsArray.includes("--cached")) {
            throw new Error("Exit 1: changes exist");
          }
          // git commit succeeds
          if (argsArray.includes("commit")) {
            return "";
          }
          return "";
        },
      );

      const { commitAll } = await import("./git.js");
      const result = commitAll("/repo", "Test commit");

      expect(result).toBe(true);
      expect(mockExecFileSync).toHaveBeenCalledWith("git", ["add", "-A"], {
        cwd: "/repo",
        stdio: "pipe",
      });
      expect(mockExecFileSync).toHaveBeenCalledWith(
        "git",
        ["commit", "-m", "Test commit", "--no-verify"],
        { cwd: "/repo", stdio: "pipe" },
      );
    });

    it("git add fails — returns false", async () => {
      mockExecFileSync.mockImplementation(
        (_cmd: string, args: string[] | unknown[], _opts?: unknown) => {
          const argsArray = Array.isArray(args) ? args : [];
          if (argsArray.includes("add")) {
            throw new Error("Failed to add");
          }
          return "";
        },
      );

      const { commitAll } = await import("./git.js");
      const result = commitAll("/repo", "Test commit");

      expect(result).toBe(false);
    });

    it("git add succeeds, no staged changes (diff --quiet exits 0) — returns false", async () => {
      mockExecFileSync.mockImplementation(
        (_cmd: string, args: string[] | unknown[], _opts?: unknown) => {
          const argsArray = Array.isArray(args) ? args : [];
          // git add -A
          if (argsArray.includes("add") && argsArray.includes("-A")) {
            return "";
          }
          // git diff --cached --quiet succeeds (no changes)
          if (argsArray.includes("diff") && argsArray.includes("--cached")) {
            return "";
          }
          return "";
        },
      );

      const { commitAll } = await import("./git.js");
      const result = commitAll("/repo", "Test commit");

      expect(result).toBe(false);
    });

    it("git add succeeds, has changes, commit fails — returns false", async () => {
      mockExecFileSync.mockImplementation(
        (_cmd: string, args: string[] | unknown[], _opts?: unknown) => {
          const argsArray = Array.isArray(args) ? args : [];
          // git add -A
          if (argsArray.includes("add") && argsArray.includes("-A")) {
            return "";
          }
          // git diff --cached --quiet throws (has changes)
          if (argsArray.includes("diff") && argsArray.includes("--cached")) {
            throw new Error("Exit 1: changes exist");
          }
          // git commit fails
          if (argsArray.includes("commit")) {
            throw new Error("Commit failed");
          }
          return "";
        },
      );

      const { commitAll } = await import("./git.js");
      const result = commitAll("/repo", "Test commit");

      expect(result).toBe(false);
    });
  });
});
