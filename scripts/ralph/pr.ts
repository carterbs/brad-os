import { execFileSync } from "node:child_process";
import type { PrMergeState } from "./types.js";

export interface PullRequestRef {
  number: number;
  url: string;
}

export interface OpenRalphPullRequest {
  number: number;
  url: string;
  headRefName: string;
}

interface GhPrView {
  number?: number;
  url?: string;
  state?: string;
  mergeable?: string;
  mergeStateStatus?: string;
  mergedAt?: string | null;
}

interface GhPrListItem {
  number?: number;
  url?: string;
  headRefName?: string;
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
    ]);
    const view = readPrView(cwd, prNumber);
    return Boolean(view?.mergedAt);
  } catch {
    return false;
  }
}

export function readPullRequestMergeState(
  cwd: string,
  prNumber: number,
): PrMergeState | undefined {
  const view = readPrView(cwd, prNumber);
  if (!view) return undefined;
  return {
    state: view.state,
    mergedAt: view.mergedAt ?? null,
  };
}

function readPrView(cwd: string, prNumber: number): GhPrView | undefined {
  try {
    const raw = runGh(cwd, [
      "pr",
      "view",
      String(prNumber),
      "--json",
      "number,url,state,mergeable,mergeStateStatus,mergedAt",
    ]);
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return undefined;
    return parsed as GhPrView;
  } catch {
    return undefined;
  }
}

function isConflicting(view: GhPrView | undefined): boolean {
  if (!view) return false;
  return (
    view.mergeable === "CONFLICTING" || view.mergeStateStatus === "DIRTY"
  );
}

export function ensurePullRequestMergeable(
  cwd: string,
  branchName: string,
  prNumber: number,
): boolean {
  const initialView = readPrView(cwd, prNumber);
  if (!isConflicting(initialView)) return true;

  try {
    runGit(cwd, ["fetch", "origin", "main"]);
    runGit(cwd, ["checkout", branchName]);
    runGit(cwd, ["merge", "origin/main", "--no-edit"]);
    runGit(cwd, ["push", "origin", branchName]);
  } catch {
    try {
      runGit(cwd, ["merge", "--abort"]);
    } catch {
      // Best effort cleanup only.
    }
    return false;
  }

  const updatedView = readPrView(cwd, prNumber);
  return !isConflicting(updatedView);
}

export function listOpenRalphPullRequests(
  cwd: string,
  branchPrefix: string,
): OpenRalphPullRequest[] {
  try {
    const raw = runGh(cwd, [
      "pr",
      "list",
      "--state",
      "open",
      "--limit",
      "200",
      "--json",
      "number,url,headRefName",
    ]);
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item) => item as GhPrListItem)
      .filter(
        (item) =>
          typeof item.number === "number" &&
          typeof item.url === "string" &&
          typeof item.headRefName === "string" &&
          item.headRefName.startsWith(`${branchPrefix}-`),
      )
      .map((item) => ({
        number: item.number as number,
        url: item.url as string,
        headRefName: item.headRefName as string,
      }));
  } catch {
    return [];
  }
}
