import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

function git(repoDir: string, ...args: string[]): string {
  try {
    return execFileSync("git", ["-C", repoDir, ...args], {
      encoding: "utf-8",
      stdio: "pipe",
    }).trim();
  } catch {
    return "";
  }
}

export function createWorktree(
  repoDir: string,
  worktreeDir: string,
  worktreePath: string,
  branchName: string,
): boolean {
  // Clean up any leftover worktree from a previous failed run
  git(repoDir, "worktree", "remove", worktreePath, "--force");
  git(repoDir, "branch", "-D", branchName);

  // Ensure parent dir exists
  execFileSync("mkdir", ["-p", worktreeDir]);

  // Create worktree
  git(repoDir, "worktree", "add", worktreePath, "-b", branchName);
  if (!existsSync(worktreePath)) return false;

  // Symlink node_modules (worktrees don't get their own)
  try {
    execFileSync(
      "ln",
      ["-s", `${repoDir}/node_modules`, `${worktreePath}/node_modules`],
      { stdio: "pipe" },
    );
  } catch {
    // Already exists — fine
  }

  return true;
}

export function cleanupWorktree(
  repoDir: string,
  worktreePath: string,
  branchName: string,
): void {
  git(repoDir, "worktree", "remove", worktreePath, "--force");
  git(repoDir, "branch", "-d", branchName);
}

export function mergeToMain(repoDir: string, branchName: string): boolean {
  try {
    execFileSync(
      "git",
      ["-C", repoDir, "merge", branchName, "--no-edit"],
      { encoding: "utf-8", stdio: "pipe" },
    );
    return true;
  } catch {
    return false;
  }
}

export function countCompleted(repoDir: string): number {
  // Count merge commits from harness-improvement branches
  const merges = git(
    repoDir,
    "log",
    "--oneline",
    "--merges",
    "--grep=harness-improvement",
    "main",
  );
  const mergeCount = merges ? merges.split("\n").filter(Boolean).length : 0;

  // Also count legacy direct commits (pre-merge workflow)
  const legacy = git(
    repoDir,
    "log",
    "--oneline",
    "--no-merges",
    "--grep=^harness: improvement #",
    "main",
  );
  const legacyCount = legacy ? legacy.split("\n").filter(Boolean).length : 0;

  return mergeCount + legacyCount;
}

/** Check if HEAD in cwd has commits beyond main (i.e. the agent made its own commits). */
export function hasNewCommits(cwd: string): boolean {
  try {
    const count = execFileSync("git", ["rev-list", "--count", "main..HEAD"], {
      cwd,
      encoding: "utf-8",
      stdio: "pipe",
    }).trim();
    return parseInt(count, 10) > 0;
  } catch {
    return false;
  }
}

export function commitAll(cwd: string, message: string): boolean {
  try {
    execFileSync("git", ["add", "-A"], { cwd, stdio: "pipe" });
  } catch {
    return false;
  }

  // Check if there are staged changes
  try {
    execFileSync("git", ["diff", "--cached", "--quiet"], {
      cwd,
      stdio: "pipe",
    });
    // Exit 0 = no changes
    return false;
  } catch {
    // Exit 1 = changes exist, commit them
    try {
      execFileSync("git", ["commit", "-m", message, "--no-verify"], {
        cwd,
        stdio: "pipe",
      });
      return true;
    } catch {
      return false;
    }
  }
}
