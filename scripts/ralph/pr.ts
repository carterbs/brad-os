import { execFileSync } from "node:child_process";

export interface PullRequestRef {
  number: number;
  url: string;
}

interface GhPrView {
  number?: number;
  url?: string;
  state?: string;
}

function runGit(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf-8",
    stdio: "pipe",
  }).trim();
}

function runGh(cwd: string, args: string[]): string {
  return execFileSync("gh", args, {
    cwd,
    encoding: "utf-8",
    stdio: "pipe",
  }).trim();
}

export function pushBranch(cwd: string, branchName: string): boolean {
  try {
    runGit(cwd, ["push", "--set-upstream", "origin", branchName]);
    return true;
  } catch {
    return false;
  }
}

export function findOpenPullRequest(
  cwd: string,
  branchName: string,
): PullRequestRef | undefined {
  try {
    const raw = runGh(cwd, [
      "pr",
      "view",
      branchName,
      "--json",
      "number,url,state",
    ]);
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return undefined;

    const view = parsed as GhPrView;
    if (
      typeof view.number !== "number" ||
      typeof view.url !== "string" ||
      view.state !== "OPEN"
    ) {
      return undefined;
    }

    return { number: view.number, url: view.url };
  } catch {
    return undefined;
  }
}

export function createPullRequest(
  cwd: string,
  branchName: string,
  title: string,
  body: string,
): PullRequestRef | undefined {
  try {
    const createOutput = runGh(cwd, [
      "pr",
      "create",
      "--base",
      "main",
      "--head",
      branchName,
      "--title",
      title,
      "--body",
      body,
    ]);

    const fallbackUrlMatch = createOutput.match(/https:\/\/github\.com\/\S+/);
    const fallbackUrl = fallbackUrlMatch?.[0];

    const pr = findOpenPullRequest(cwd, branchName);
    if (pr) return pr;

    if (!fallbackUrl) return undefined;
    const fallbackNumber = fallbackUrl.match(/\/pull\/(\d+)/)?.[1];
    if (!fallbackNumber) return undefined;

    return { number: parseInt(fallbackNumber, 10), url: fallbackUrl };
  } catch {
    return undefined;
  }
}

export function ensurePullRequest(
  cwd: string,
  branchName: string,
  title: string,
  body: string,
): PullRequestRef | undefined {
  return (
    findOpenPullRequest(cwd, branchName) ??
    createPullRequest(cwd, branchName, title, body)
  );
}

export function mergePullRequest(cwd: string, prNumber: number): boolean {
  try {
    runGh(cwd, [
      "pr",
      "merge",
      String(prNumber),
      "--squash",
      "--delete-branch",
      "--auto",
    ]);
    return true;
  } catch {
    return false;
  }
}
