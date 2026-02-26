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

export interface WorktreeResult {
  created: boolean;
  resumed: boolean;
}

/** Check if a branch exists (locally). */
function branchExists(repoDir: string, branchName: string): boolean {
  return git(repoDir, "rev-parse", "--verify", branchName) !== "";
}

/** Check if a branch has commits beyond main. */
function branchHasWork(repoDir: string, branchName: string): boolean {
  const count = git(
    repoDir,
    "rev-list",
    "--count",
    `main..${branchName}`,
  );
  return parseInt(count, 10) > 0;
}

function ensureNodeModulesSymlink(
  repoDir: string,
  worktreePath: string,
): void {
  try {
    execFileSync(
      "ln",
      ["-s", `${repoDir}/node_modules`, `${worktreePath}/node_modules`],
      { stdio: "pipe" },
    );
  } catch {
    // Already exists — fine
  }
}

export function createWorktree(
  repoDir: string,
  worktreeDir: string,
  worktreePath: string,
  branchName: string,
): WorktreeResult {
  const worktreeExists = existsSync(worktreePath);
  const branchFound = branchExists(repoDir, branchName);
  const hasWork = branchFound && branchHasWork(repoDir, branchName);

  // Case 1: Worktree exists with prior work — resume from it
  if (worktreeExists && hasWork) {
    ensureNodeModulesSymlink(repoDir, worktreePath);
    return { created: true, resumed: true };
  }

  // Case 2: Worktree exists but branch has no new commits — recreate fresh
  if (worktreeExists) {
    git(repoDir, "worktree", "remove", worktreePath, "--force");
    git(repoDir, "branch", "-D", branchName);
  }

  // Case 3: Branch exists (with work) but worktree is gone — re-add worktree from existing branch
  if (!worktreeExists && hasWork) {
    execFileSync("mkdir", ["-p", worktreeDir]);
    git(repoDir, "worktree", "add", worktreePath, branchName);
    if (!existsSync(worktreePath)) return { created: false, resumed: false };
    ensureNodeModulesSymlink(repoDir, worktreePath);
    return { created: true, resumed: true };
  }

  // Case 4: Branch exists but no work — clean it up and create fresh
  if (branchFound && !hasWork) {
    git(repoDir, "branch", "-D", branchName);
  }

  // Case 5: Neither exists (or cleaned up above) — create fresh
  execFileSync("mkdir", ["-p", worktreeDir]);
  git(repoDir, "worktree", "add", worktreePath, "-b", branchName);
  if (!existsSync(worktreePath)) return { created: false, resumed: false };
  ensureNodeModulesSymlink(repoDir, worktreePath);
  return { created: true, resumed: false };
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
  // Count merge commits from change-NNN branches (current prefix)
  const merges = git(
    repoDir,
    "log",
    "--oneline",
    "--merges",
    "--grep=change-[0-9]",
    "main",
  );
  const mergeCount = merges ? merges.split("\n").filter(Boolean).length : 0;

  // Count legacy merge commits from harness-improvement-NNN branches
  const legacyMerges = git(
    repoDir,
    "log",
    "--oneline",
    "--merges",
    "--grep=harness-improvement-",
    "main",
  );
  const legacyMergeCount = legacyMerges ? legacyMerges.split("\n").filter(Boolean).length : 0;

  // Count legacy direct commits (pre-merge workflow)
  const legacyDirect = git(
    repoDir,
    "log",
    "--oneline",
    "--no-merges",
    "--grep=^harness: improvement #",
    "main",
  );
  const legacyDirectCount = legacyDirect ? legacyDirect.split("\n").filter(Boolean).length : 0;

  return mergeCount + legacyMergeCount + legacyDirectCount;
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
