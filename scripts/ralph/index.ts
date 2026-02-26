import { existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { Logger } from "./log.js";
import { runStep } from "./agent.js";
import {
  buildBacklogRefillPrompt,
  buildTaskPlanPrompt,
  buildPlanPrompt,
  buildImplPrompt,
  buildMergeConflictResolvePrompt,
  buildOutstandingPrMergePrompt,
  buildAgentMergePrompt,
  buildReviewPrompt,
  buildFixPrompt,
} from "./prompts.js";
import {
  createWorktree,
  cleanupWorktree,
  countCompleted,
  commitAll,
  hasNewCommits,
} from "./git.js";
import {
  ensurePullRequest,
  listOpenRalphPullRequests,
  pushBranch,
  readPullRequestMergeState,
} from "./pr.js";
import {
  readBacklog,
  readTriage,
  addTriageTask,
  removeTask,
  removeTriageTask,
  moveTaskToMergeConflicts,
  readSuppressedTypeScriptEslintRules,
  normalizeBacklogForTypeScriptEslintCleanup,
  writeBacklog,
  backlogPath,
  syncTaskFilesFromLog,
} from "./backlog.js";
import { resolveConfig } from "./config.js";
import type { AgentBackend, Config, StepSummary } from "./types.js";

// ── Worker result returned from runWorker ──

export interface WorkerResult {
  success: boolean;
  improvement: number;
  workerSlot: number;
  branchName: string;
  worktreePath: string;
  taskText?: string;
  taskSource: TaskSource;
  prNumber?: number;
  prUrl?: string;
  reviewCycles?: number;
  planDocPath?: string;
  stepResults: StepSummary[];
  failureReason?: "no_changes" | "review_failed" | "merge_failed";
  mergeHandledByWorker?: boolean;
}

async function runPostMergeRecoveryCycle({
  config,
  logger,
  abortController,
  attemptCycle,
  maxReviewCycles,
  prNumber,
  prUrl,
  worktreePath,
  branchName,
  improvement,
  commitTitle,
  planDocPath,
  stepResults,
  runMergeAttempt,
}: {
  config: Config;
  logger: Logger;
  abortController: AbortController;
  attemptCycle: number;
  maxReviewCycles: number;
  prNumber: number;
  prUrl: string;
  worktreePath: string;
  branchName: string;
  improvement: number;
  commitTitle: string;
  planDocPath: string;
  stepResults: StepSummary[];
  runMergeAttempt: () => Promise<boolean>;
}): Promise<boolean> {
  let cycle = attemptCycle;
  while (cycle <= maxReviewCycles) {
    logger.info(
      `[4/5] Post-merge review/fix cycle ${cycle}/${maxReviewCycles} for PR #${prNumber}...`,
    );
    const reviewResult = await runStep({
      prompt: buildReviewPrompt(prNumber, prUrl, cycle, maxReviewCycles),
      stepName: "review",
      improvement,
      cwd: worktreePath,
      model: config.agents.review.model,
      backend: config.agents.review.backend,
      config,
      logger,
      abortController,
    });
    if (!reviewResult || typeof reviewResult.outputText !== "string") {
      logger.warn(
        `Merge recovery review output was missing on cycle ${cycle}; escalating without extra recovery.`,
      );
      return false;
    }
    const reviewOutput = reviewResult.outputText;

    const reviewSummary: StepSummary = {
      step: "review",
      backend: reviewResult.backend,
      turns: reviewResult.turns,
      costUsd: reviewResult.costUsd,
      tokens: reviewResult.inputTokens + reviewResult.outputTokens,
      durationMs: reviewResult.durationMs,
    };
    stepResults.push(reviewSummary);
    logger.stepSummary("review", reviewSummary);

    let shouldRetryMerge = false;
    if (reviewOutput.includes("REVIEW_PASSED")) {
      shouldRetryMerge = true;
    } else if (reviewOutput.includes("REVIEW_FAILED")) {
      logger.warn("Reviewer still found issues after merge failure — running fix step...");
      const fixResult = await runStep({
        prompt: buildFixPrompt(reviewOutput, planDocPath),
        stepName: "implement",
        improvement,
        cwd: worktreePath,
        model: config.agents.implement.model,
        backend: config.agents.implement.backend,
        config,
        logger,
        abortController,
      });

      enforceMainManagedBacklog(worktreePath, logger);
      const committedFix = commitAll(worktreePath, `${commitTitle} — merge recovery (cycle ${cycle})`);

      const fixSummary: StepSummary = {
        step: "implement",
        backend: fixResult.backend,
        turns: fixResult.turns,
        costUsd: fixResult.costUsd,
        tokens: fixResult.inputTokens + fixResult.outputTokens,
        durationMs: fixResult.durationMs,
      };
      stepResults.push(fixSummary);
      logger.stepSummary("implement", fixSummary);

      const fixLine = fixResult.outputText
        .split("\n")
        .find((l) => l.startsWith("FIXED:"));
      if (fixLine) logger.info(`  ${fixLine}`);

      if (committedFix && !pushBranch(worktreePath, branchName)) {
        logger.error(`Failed to push merge-recovery fixes for cycle ${cycle}`);
        logger.info(`  Worktree preserved at: ${worktreePath}`);
        return false;
      }

      shouldRetryMerge = true;
    } else {
      logger.warn("Ambiguous merge recovery review output...");
      if (runValidation(worktreePath)) {
        shouldRetryMerge = true;
      } else {
        const fixResult = await runStep({
          prompt:
            buildFixPrompt(
              "Review output was ambiguous, but npm run validate failed. " +
                "Run npm run validate, read the error output, and fix all issues.",
              planDocPath,
            ),
          model: config.agents.implement.model,
          backend: config.agents.implement.backend,
          stepName: "implement",
          improvement,
          cwd: worktreePath,
          config,
          logger,
          abortController,
        });

        enforceMainManagedBacklog(worktreePath, logger);
        const committedFix = commitAll(worktreePath, `${commitTitle} — merge recovery validation (cycle ${cycle})`);

        const fixSummary: StepSummary = {
          step: "implement",
          backend: fixResult.backend,
          turns: fixResult.turns,
          costUsd: fixResult.costUsd,
          tokens: fixResult.inputTokens + fixResult.outputTokens,
          durationMs: fixResult.durationMs,
        };
        stepResults.push(fixSummary);
        logger.stepSummary("implement", fixSummary);

        const fixLine = fixResult.outputText
          .split("\n")
          .find((l) => l.startsWith("FIXED:"));
        if (fixLine) logger.info(`  ${fixLine}`);

        if (committedFix && !pushBranch(worktreePath, branchName)) {
          logger.error(
            `Failed to push merge-recovery validation fixes for cycle ${cycle}`,
          );
          logger.info(`  Worktree preserved at: ${worktreePath}`);
          return false;
        }

        shouldRetryMerge = true;
      }
    }

    if (!shouldRetryMerge) return false;
    const merged = await runMergeAttempt();
    if (merged) return true;

    cycle++;
  }

  return false;
}

export type TaskSource = "backlog" | "triage" | "cli";

export const MAIN_NOT_GREEN_TRIAGE_TASK =
  "Restore main to green: run npm run validate on main, fix failures, then rerun validate.";
export const MAIN_NOT_GREEN_RETRY_COOLDOWN_MS = 15 * 60 * 1000;
export const MERGE_CONFLICT_TRIAGE_PREFIX =
  "Resolve merge conflict for improvement #";
export const IMPLEMENT_PLAN_TASK_PREFIX = "Implement Plan ";
const DEFAULT_PLAN_DOC_PATH = "thoughts/shared/plans/active/ralph-improvement.md";
const TITLE_MAX_LENGTH = 72;
const OUTSTANDING_RALPH_PR_TRIAGE_PREFIX = "Resolve outstanding Ralph PR #";

export interface OutstandingRalphPrTriageTaskDetails {
  prNumber: number;
  branchName: string;
  prUrl: string;
}

function normalizeSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function cleanTitleCandidate(value: string): string {
  return normalizeSpaces(value)
    .replace(/^(PLAN|Title)\s*:\s*/i, "")
    .replace(/[.;:,\s]+$/g, "");
}

function isLowSignalTitle(value: string): boolean {
  const normalized = cleanTitleCandidate(value).toLowerCase();
  if (!normalized) return true;
  if (normalized.length < 4) return true;

  const lowSignal = new Set([
    "x",
    "fix",
    "fixes",
    "something",
    "improvement",
    "update",
    "changes",
    "misc",
  ]);
  if (lowSignal.has(normalized)) return true;

  return normalized.split(" ").length < 2;
}

function truncateTitle(value: string): string {
  if (value.length <= TITLE_MAX_LENGTH) return value;
  return `${value.slice(0, TITLE_MAX_LENGTH - 3).trimEnd()}...`;
}

const CONVENTIONAL_PREFIX_RE = /^(feat|fix|chore|refactor|test|docs|ci|perf|style|build)(\(.+?\))?:\s*/i;

function hasConventionalPrefix(value: string): boolean {
  return CONVENTIONAL_PREFIX_RE.test(value);
}

function inferConventionalPrefix(value: string): string {
  const lower = value.toLowerCase();
  if (/\btest(s|ing)?\b/.test(lower)) return "test";
  if (/\bdoc(s|umentation)?\b/.test(lower)) return "docs";
  if (/\b(lint|ci|pipeline|workflow)\b/.test(lower)) return "ci";
  if (/\brefactor\b/.test(lower)) return "refactor";
  if (/\bfix(es|ed)?\b/.test(lower)) return "fix";
  if (/\b(add|implement|create|introduce)\b/.test(lower)) return "feat";
  return "chore";
}

export function buildImprovementTitle(
  improvement: number,
  planSummary: string,
  taskText?: string,
): string {
  const planCandidate = cleanTitleCandidate(planSummary);
  const taskCandidate = cleanTitleCandidate(taskText ?? "");

  const bestCandidate = !isLowSignalTitle(planCandidate)
    ? planCandidate
    : !isLowSignalTitle(taskCandidate)
      ? taskCandidate
      : `improvement #${improvement}`;

  if (hasConventionalPrefix(bestCandidate)) {
    return truncateTitle(bestCandidate);
  }

  const prefix = inferConventionalPrefix(bestCandidate);
  return truncateTitle(`${prefix}: ${bestCandidate}`);
}

// ── Validation helper ──

export function runValidation(cwd: string): boolean {
  try {
    execFileSync("npm", ["run", "validate"], { cwd, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

export function isMergeConflictTriageTask(
  taskText: string | undefined,
  taskSource: TaskSource,
): boolean {
  return (
    taskSource === "triage" &&
    taskText?.startsWith(MERGE_CONFLICT_TRIAGE_PREFIX) === true
  );
}

export function buildOutstandingRalphPrTriageTask(details: {
  prNumber: number;
  branchName: string;
  prUrl: string;
}): string {
  return (
    `Resolve outstanding Ralph PR #${details.prNumber} ` +
    `(${details.branchName}) and merge to main. PR: ${details.prUrl}`
  );
}

export function parseOutstandingRalphPrTriageTask(
  taskText: string | undefined,
  _taskSource: TaskSource,
): OutstandingRalphPrTriageTaskDetails | undefined {
  if (!taskText) return undefined;

  function parseDirectTask(
    value: string,
  ): OutstandingRalphPrTriageTaskDetails | undefined {
    if (!value.startsWith(OUTSTANDING_RALPH_PR_TRIAGE_PREFIX)) return undefined;

    const match = value.match(
      /^Resolve outstanding Ralph PR #(\d+) \(([^)]+)\) and merge to main\. PR: (https:\/\/github\.com\/\S+)$/,
    );
    if (!match) return undefined;

    const prNumber = Number.parseInt(match[1] ?? "", 10);
    const branchName = (match[2] ?? "").trim();
    const prUrl = (match[3] ?? "").trim();
    if (!Number.isFinite(prNumber) || prNumber <= 0) return undefined;
    if (!branchName || !prUrl) return undefined;

    return { prNumber, branchName, prUrl };
  }

  let current = taskText.trim();
  for (let depth = 0; depth < 64; depth++) {
    const direct = parseDirectTask(current);
    if (direct) return direct;

    const escalatedPrefix = "Original task:";
    const markerIndex = current.indexOf(escalatedPrefix);
    if (markerIndex < 0) return undefined;
    current = current.slice(markerIndex + escalatedPrefix.length).trim();
  }
  return undefined;
}

function unwrapEscalatedTask(taskText: string): string {
  let current = taskText.trim();
  for (let depth = 0; depth < 64; depth++) {
    const markerIndex = current.indexOf("Original task:");
    if (markerIndex < 0) return current;
    current = current.slice(markerIndex + "Original task:".length).trim();
  }
  return current;
}

export function extractPlanDocPathFromTask(
  taskText: string | undefined,
): string | undefined {
  if (!taskText) return undefined;

  const trimmedTask = taskText.trim();
  if (
    !trimmedTask
      .toLowerCase()
      .startsWith(IMPLEMENT_PLAN_TASK_PREFIX.toLowerCase())
  ) {
    return undefined;
  }

  const remainder = trimmedTask
    .slice(IMPLEMENT_PLAN_TASK_PREFIX.length)
    .trim()
    .replace(/^`|`$/g, "")
    .replace(/\.$/, "");
  if (!remainder) return undefined;

  const planRef = remainder
    .split(":")[0]
    ?.trim()
    .replace(/[.,]$/, "");
  if (!planRef) return undefined;

  const normalizedFile = planRef.endsWith(".md") ? planRef : `${planRef}.md`;
  if (normalizedFile.includes("/")) {
    return normalizedFile;
  }

  const activePlanDir = "thoughts/shared/plans/active";
  const directPath = `${activePlanDir}/${normalizedFile}`;
  if (existsSync(directPath)) {
    return directPath;
  }

  // Support short slugs in backlog tasks by matching date-prefixed plan files.
  const slug = normalizedFile.replace(/\.md$/, "");
  const suffix = `-${slug}.md`;
  try {
    const matches = readdirSync(activePlanDir)
      .filter((entry) => entry.endsWith(suffix))
      .sort();
    if (matches.length > 0) {
      return `${activePlanDir}/${matches[matches.length - 1]}`;
    }
  } catch {
    // Best effort: fall back to default active path.
  }

  return normalizedFile.includes("/")
    ? normalizedFile
    : `${activePlanDir}/${normalizedFile}`;
}

export function enforceMainManagedBacklog(cwd: string, logger: Logger): void {
  const backlogPath = "scripts/ralph/backlog.md";

  let changed = "";
  try {
    changed = execFileSync(
      "git",
      ["status", "--porcelain", "--", backlogPath],
      { cwd, encoding: "utf-8", stdio: "pipe" },
    ).trim();
  } catch {
    return;
  }

  if (!changed) return;

  try {
    execFileSync(
      "git",
      ["restore", "--staged", "--worktree", "--", backlogPath],
      { cwd, stdio: "pipe" },
    );
    logger.warn(
      "Discarded worktree edits to scripts/ralph/backlog.md (main-managed file).",
    );
    return;
  } catch {
    // Fallback for older git variants.
  }

  try {
    execFileSync("git", ["reset", "HEAD", "--", backlogPath], {
      cwd,
      stdio: "pipe",
    });
    execFileSync("git", ["checkout", "--", backlogPath], {
      cwd,
      stdio: "pipe",
    });
    logger.warn(
      "Discarded worktree edits to scripts/ralph/backlog.md (main-managed file).",
    );
  } catch {
    logger.warn(
      "Failed to enforce backlog main-only rule in worktree; continuing.",
    );
  }
}

// ── Dependency check ──

export function checkDeps(config: Config, logger: Logger): void {
  try {
    execFileSync("which", ["git"], { stdio: "pipe" });
  } catch {
    logger.error("Missing dependency: git");
    process.exit(1);
  }

  try {
    execFileSync("which", ["gh"], { stdio: "pipe" });
  } catch {
    logger.error("Missing dependency: gh (needed for GitHub PR workflow)");
    process.exit(1);
  }

  const backendsInUse = new Set<AgentBackend>([
    config.agents.backlog.backend,
    config.agents.plan.backend,
    config.agents.implement.backend,
    config.agents.review.backend,
  ]);

  if (backendsInUse.has("claude")) {
    try {
      execFileSync("which", ["claude"], { stdio: "pipe" });
    } catch {
      logger.error("Missing dependency: claude (needed for claude backend)");
      process.exit(1);
    }
  }

  if (backendsInUse.has("codex")) {
    try {
      execFileSync("which", ["codex"], { stdio: "pipe" });
    } catch {
      logger.error("Missing dependency: codex (needed for codex backend)");
      process.exit(1);
    }
  }
}

// ── Single worker: plan -> implement -> push/pr -> review ──

export async function runWorker(
  workerSlot: number,
  improvement: number,
  config: Config,
  logger: Logger,
  abortController: AbortController,
  taskText?: string,
  taskSource: TaskSource = "backlog",
): Promise<WorkerResult> {
  const outstandingPrTask = parseOutstandingRalphPrTriageTask(
    taskText,
    taskSource,
  );
  const branchName =
    outstandingPrTask?.branchName ??
    `${config.branchPrefix}-${String(improvement).padStart(3, "0")}`;
  const worktreePath = `${config.worktreeDir}/${branchName}`;

  const targetLabel = config.target !== undefined ? `/${config.target}` : "";
  logger.heading(`\u2501\u2501\u2501 Improvement #${improvement}${targetLabel} \u2501\u2501\u2501`);

  logger.jsonl({
    event: "worker_started",
    worker: workerSlot,
    improvement,
    task: taskText ?? "(ideation)",
    ts: new Date().toISOString(),
  });

  // Create or resume worktree
  const wtResult = createWorktree(
    config.repoDir,
    config.worktreeDir,
    worktreePath,
    branchName,
  );
  if (!wtResult.created) {
    logger.error("Failed to create worktree");
    return { success: false, improvement, workerSlot, branchName, worktreePath, taskText, taskSource, stepResults: [] };
  }

  if (wtResult.resumed) {
    logger.info(`Resuming from existing branch ${branchName}`);
  }

  try {
    const stepResults: StepSummary[] = [];
    const mergeConflictTriageTask = isMergeConflictTriageTask(
      taskText,
      taskSource,
    );
    const taskPlanDocPath = extractPlanDocPathFromTask(taskText);
    const planDocPath = taskPlanDocPath ?? DEFAULT_PLAN_DOC_PATH;

    // ── 1. Planning (skip if resuming) ──
    let planSummary = "";

    if (wtResult.resumed) {
      logger.info("[1/5] Skipping planning (resuming from prior work)");
    } else if (outstandingPrTask) {
      logger.info("[1/5] Skipping planning (outstanding PR triage task)");
    } else if (mergeConflictTriageTask) {
      logger.info(
        "[1/5] Skipping generic planning (merge-conflict triage task)",
      );
    } else if (taskPlanDocPath) {
      logger.info(
        `[1/5] Skipping planning (task already references plan: ${taskPlanDocPath})`,
      );
      if (!existsSync(join(worktreePath, taskPlanDocPath))) {
        logger.error(`Plan file not found: ${taskPlanDocPath}`);
        logger.info(`  Worktree preserved at: ${worktreePath}`);
        return {
          success: false,
          improvement,
          workerSlot,
          branchName,
          worktreePath,
          taskText,
          taskSource,
          stepResults,
        };
      }
    } else if (taskText) {
      logger.info(`[1/5] Planning for task: ${taskText.slice(0, 80)}...`);
      const planResult = await runStep({
        prompt: buildTaskPlanPrompt(taskText),
        stepName: "plan",
        improvement,
        cwd: worktreePath,
        model: config.agents.plan.model,
        backend: config.agents.plan.backend,
        config,
        logger,
        abortController,
      });

      if (!planResult.success) {
        logger.error("Planning step failed");
        logger.info(`  Worktree preserved at: ${worktreePath}`);
        return { success: false, improvement, workerSlot, branchName, worktreePath, taskText, taskSource, stepResults };
      }

      if (
        !existsSync(
          `${worktreePath}/thoughts/shared/plans/active/ralph-improvement.md`,
        )
      ) {
        logger.error("Planning agent failed to create ralph-improvement.md");
        logger.info(`  Worktree preserved at: ${worktreePath}`);
        return { success: false, improvement, workerSlot, branchName, worktreePath, taskText, taskSource, stepResults };
      }

      const planLine = planResult.outputText
        .split("\n")
        .find((l) => l.startsWith("PLAN:"));
      if (planLine) {
        logger.info(`  ${planLine}`);
        planSummary = planLine.replace(/^PLAN:\s*/, "");
      }

      const tokens = planResult.inputTokens + planResult.outputTokens;
      stepResults.push({
        step: "plan",
        backend: planResult.backend,
        turns: planResult.turns,
        costUsd: planResult.costUsd,
        tokens,
        durationMs: planResult.durationMs,
      });
      logger.stepSummary("plan", stepResults[stepResults.length - 1]);
    } else {
      // No task — full ideation planning
      logger.info("[1/5] Planning (full ideation)...");
      const planResult = await runStep({
        prompt: buildPlanPrompt(improvement, config.target ?? 0),
        stepName: "plan",
        improvement,
        cwd: worktreePath,
        model: config.agents.plan.model,
        backend: config.agents.plan.backend,
        config,
        logger,
        abortController,
      });

      if (!planResult.success) {
        logger.error("Planning step failed");
        logger.info(`  Worktree preserved at: ${worktreePath}`);
        return { success: false, improvement, workerSlot, branchName, worktreePath, taskText, taskSource, stepResults };
      }

      if (
        !existsSync(
          `${worktreePath}/thoughts/shared/plans/active/ralph-improvement.md`,
        )
      ) {
        logger.error("Planning agent failed to create ralph-improvement.md");
        logger.info(`  Worktree preserved at: ${worktreePath}`);
        return { success: false, improvement, workerSlot, branchName, worktreePath, taskText, taskSource, stepResults };
      }

      const planLine = planResult.outputText
        .split("\n")
        .find((l) => l.startsWith("PLAN:"));
      if (planLine) {
        logger.info(`  ${planLine}`);
        planSummary = planLine.replace(/^PLAN:\s*/, "");
      }

      const tokens = planResult.inputTokens + planResult.outputTokens;
      stepResults.push({
        step: "plan",
        backend: planResult.backend,
        turns: planResult.turns,
        costUsd: planResult.costUsd,
        tokens,
        durationMs: planResult.durationMs,
      });
      logger.stepSummary("plan", stepResults[stepResults.length - 1]);
    }

    // ── 2. Implementation ──
    logger.info("[2/5] Implementing...");
    const implementPrompt = outstandingPrTask
      ? buildOutstandingPrMergePrompt(
          taskText ?? "",
          outstandingPrTask.prNumber,
          outstandingPrTask.branchName,
        )
      : mergeConflictTriageTask
        ? buildMergeConflictResolvePrompt(taskText ?? "")
        : buildImplPrompt(planDocPath);
    let implResult = await runStep({
      prompt: implementPrompt,
      stepName: "implement",
      improvement,
      cwd: worktreePath,
      model: config.agents.implement.model,
      backend: config.agents.implement.backend,
      config,
      logger,
      abortController,
    });

    if (!implResult.success) {
      logger.warn("Implementation failed, retrying once...");
      implResult = await runStep({
        prompt: implementPrompt,
        stepName: "implement",
        improvement,
        cwd: worktreePath,
        model: config.agents.implement.model,
        backend: config.agents.implement.backend,
        config,
        logger,
        abortController,
      });
      if (!implResult.success) {
        logger.error("Implementation failed on retry");
        logger.info(`  Worktree preserved at: ${worktreePath}`);
        return { success: false, improvement, workerSlot, branchName, worktreePath, taskText, taskSource, stepResults };
      }
    }

    const doneLine = implResult.outputText
      .split("\n")
      .find((l) => l.startsWith("DONE:"));
    const doneSummary = doneLine?.replace(/^DONE:\s*/, "") ?? "";
    if (doneLine) logger.success(`  ${doneLine}`);

    stepResults.push({
      step: "implement",
      backend: implResult.backend,
      turns: implResult.turns,
      costUsd: implResult.costUsd,
      tokens: implResult.inputTokens + implResult.outputTokens,
      durationMs: implResult.durationMs,
    });
    logger.stepSummary("implement", stepResults[stepResults.length - 1]);

    if (outstandingPrTask) {
      logger.info("[3/5] Reusing existing PR for merge...");
      const pr = {
        number: outstandingPrTask.prNumber,
        url: outstandingPrTask.prUrl,
      };
      logger.success(`Reusing PR #${pr.number}: ${pr.url}`);
      logger.info("[4/5] Skipping review (outstanding PR triage task)");

      const attemptMerge = async (): Promise<boolean> => {
        logger.info(`[5/5] Agent handling merge for PR #${pr.number}...`);
        const mergeResult = await runStep({
          prompt: buildAgentMergePrompt(pr.number, branchName),
          stepName: "merge",
          improvement,
          cwd: worktreePath,
          model: config.agents.implement.model,
          backend: config.agents.implement.backend,
          config,
          logger,
          abortController,
        });
        if (!mergeResult.success) {
          logger.error(`Agent merge step failed for PR #${pr.number}`);
          logger.info(`  Worktree preserved at: ${worktreePath}`);
          return false;
        }

        stepResults.push({
          step: "merge",
          backend: mergeResult.backend,
          turns: mergeResult.turns,
          costUsd: mergeResult.costUsd,
          tokens: mergeResult.inputTokens + mergeResult.outputTokens,
          durationMs: mergeResult.durationMs,
        });
        logger.stepSummary("merge", stepResults[stepResults.length - 1]);

        const mergeState = readPullRequestMergeState(worktreePath, pr.number);
        if (!mergeState?.mergedAt) {
          logger.error(
            `PR #${pr.number} is not merged after agent merge step (state=${mergeState?.state ?? "UNKNOWN"}).`,
          );
          logger.info(`  Worktree preserved at: ${worktreePath}`);
          return false;
        }

        return true;
      };

      let merged = await attemptMerge();
      if (!merged) {
        logger.warn(
          `PR #${pr.number} merge attempt failed; running post-merge review/fix cycle before retry...`,
        );
        const recovered = await runPostMergeRecoveryCycle({
          config,
          logger,
          abortController,
          attemptCycle: 1,
          maxReviewCycles: config.maxReviewCycles,
          prNumber: pr.number,
          prUrl: pr.url,
          worktreePath,
          branchName,
          improvement,
          commitTitle: `Merge recovery for PR #${pr.number}`,
          planDocPath,
          stepResults,
          runMergeAttempt: attemptMerge,
        });
        if (!recovered) {
          return {
            success: false,
            improvement,
            workerSlot,
            branchName,
            worktreePath,
            taskText,
            taskSource,
            prNumber: pr.number,
            prUrl: pr.url,
            stepResults,
            planDocPath,
            failureReason: "merge_failed",
          };
        }
        merged = true;
      }

      if (!merged) {
        return {
          success: false,
          improvement,
          workerSlot,
          branchName,
          worktreePath,
          taskText,
          taskSource,
          prNumber: pr.number,
          prUrl: pr.url,
          stepResults,
          planDocPath,
          failureReason: "merge_failed",
        };
      }

      const totalCost = stepResults.reduce((s, r) => s + r.costUsd, 0);
      const totalDuration = stepResults.reduce((s, r) => s + r.durationMs, 0);
      logger.improvementSummary(improvement, stepResults);
      logger.jsonl({
        event: "improvement_done",
        improvement,
        total_cost_usd: totalCost,
        total_duration_ms: totalDuration,
        ts: new Date().toISOString(),
      });

      return {
        success: true,
        improvement,
        workerSlot,
        branchName,
        worktreePath,
        taskText,
        taskSource,
        prNumber: pr.number,
        prUrl: pr.url,
        stepResults,
        mergeHandledByWorker: true,
        planDocPath,
      };
    }

    const commitTitle = buildImprovementTitle(
      improvement,
      planSummary,
      taskText,
    );
    const commitBody = doneSummary ? `\n${doneSummary}` : "";
    const commitMsg = `${commitTitle}${commitBody}`;

    enforceMainManagedBacklog(worktreePath, logger);
    if (!commitAll(worktreePath, commitMsg)) {
      if (!hasNewCommits(worktreePath)) {
        if (taskText === MAIN_NOT_GREEN_TRIAGE_TASK && runValidation(config.repoDir)) {
          logger.success("No changes needed: main is already green");
          logger.improvementSummary(improvement, stepResults);
          return {
            success: true,
            improvement,
            workerSlot,
            branchName,
            worktreePath,
            taskText,
            taskSource,
            stepResults,
            mergeHandledByWorker: true,
          };
        }
        logger.error("No changes produced");
        logger.info(`  Worktree preserved at: ${worktreePath}`);
        return {
          success: false,
          improvement,
          workerSlot,
          branchName,
          worktreePath,
          taskText,
          taskSource,
          stepResults,
          failureReason: "no_changes",
        };
      }
    }

    // ── 3. Push + create PR ──
    logger.info("[3/5] Pushing branch to GitHub...");
    if (!pushBranch(worktreePath, branchName)) {
      logger.error(`Failed to push ${branchName} to origin`);
      logger.info(`  Worktree preserved at: ${worktreePath}`);
      return {
        success: false,
        improvement,
        workerSlot,
        branchName,
        worktreePath,
        taskText,
        taskSource,
        stepResults,
      };
    }

    const pr = outstandingPrTask
      ? {
          number: outstandingPrTask.prNumber,
          url: outstandingPrTask.prUrl,
        }
      : (() => {
          const prTitle = commitTitle;
          const prBody =
            [
              `Improvement #${improvement}`,
              taskText ? `Task: ${taskText}` : undefined,
              "",
              doneSummary || "Automated harness improvement update.",
            ]
              .filter((line) => line !== undefined)
              .join("\n");
          return ensurePullRequest(worktreePath, branchName, prTitle, prBody);
        })();
    if (!pr) {
      logger.error("Failed to create or find GitHub pull request");
      logger.info(`  Worktree preserved at: ${worktreePath}`);
      return {
        success: false,
        improvement,
        workerSlot,
        branchName,
        worktreePath,
        taskText,
        taskSource,
        stepResults,
      };
    }
    if (outstandingPrTask) {
      logger.success(`Reusing PR #${pr.number}: ${pr.url}`);
    } else {
      logger.success(`Opened PR #${pr.number}: ${pr.url}`);
    }

    // ── 4. Review/fix loop on PR ──
    let passed = false;
    let cycle = 0;
    const reviewAccum: StepSummary = {
      step: "review",
      backend: config.agents.review.backend,
      turns: 0,
      costUsd: 0,
      tokens: 0,
      durationMs: 0,
    };

    while (!passed) {
      cycle++;
      if (cycle > config.maxReviewCycles) {
        logger.error(
          `Exceeded ${config.maxReviewCycles} review cycles \u2014 escalating to human`,
        );
        logger.info(`  \u2192 Worktree preserved at: ${worktreePath}`);
        logger.jsonl({
          event: "improvement_failed",
          improvement,
          reason: "exceeded review cycles",
          ts: new Date().toISOString(),
        });
        return {
          success: false,
          improvement,
          workerSlot,
          branchName,
          worktreePath,
          taskText,
          taskSource,
          stepResults,
          reviewCycles: cycle,
          planDocPath,
          failureReason: "review_failed",
        };
      }

      logger.info(`[4/5] Review PR #${pr.number} (cycle ${cycle}/${config.maxReviewCycles})...`);
      const reviewResult = await runStep({
        prompt: buildReviewPrompt(
          pr.number,
          pr.url,
          cycle,
          config.maxReviewCycles,
        ),
        stepName: "review",
        improvement,
        cwd: worktreePath,
        model: config.agents.review.model,
        backend: config.agents.review.backend,
        config,
        logger,
        abortController,
      });
      reviewAccum.turns += reviewResult.turns;
      reviewAccum.costUsd += reviewResult.costUsd;
      reviewAccum.tokens +=
        reviewResult.inputTokens + reviewResult.outputTokens;
      reviewAccum.durationMs += reviewResult.durationMs;

      if (reviewResult.outputText.includes("REVIEW_PASSED")) {
        if (cycle >= config.minReviewCycles) {
          passed = true;
        } else {
          logger.info(
            `Review passed early; running additional cycle to satisfy minimum ${config.minReviewCycles} cycles.`,
          );
        }
      } else if (reviewResult.outputText.includes("REVIEW_FAILED")) {
        logger.warn("Reviewer found issues \u2014 running fix step...");
        const fixResult = await runStep({
          prompt: buildFixPrompt(reviewResult.outputText, planDocPath),
          stepName: "implement",
          improvement,
          cwd: worktreePath,
          model: config.agents.implement.model,
          backend: config.agents.implement.backend,
          config,
          logger,
          abortController,
        });

        enforceMainManagedBacklog(worktreePath, logger);
        const committedFix = commitAll(
          worktreePath,
          `${commitTitle} \u2014 fix from review (cycle ${cycle})`,
        );

        reviewAccum.turns += fixResult.turns;
        reviewAccum.costUsd += fixResult.costUsd;
        reviewAccum.tokens +=
          fixResult.inputTokens + fixResult.outputTokens;
        reviewAccum.durationMs += fixResult.durationMs;

        const fixLine = fixResult.outputText
          .split("\n")
          .find((l) => l.startsWith("FIXED:"));
        if (fixLine) logger.info(`  ${fixLine}`);

        if (committedFix && !pushBranch(worktreePath, branchName)) {
          logger.error(`Failed to push review fixes for cycle ${cycle}`);
          logger.info(`  Worktree preserved at: ${worktreePath}`);
          return {
            success: false,
            improvement,
            workerSlot,
            branchName,
            worktreePath,
            taskText,
            taskSource,
            stepResults,
          };
        }
      } else {
        logger.warn(
          "Ambiguous review output, running validation as fallback...",
        );
        if (runValidation(worktreePath)) {
          passed = true;
        } else {
          logger.warn("Validation failed \u2014 running fix step...");
          const fixResult = await runStep({
            prompt: buildFixPrompt(
              "Review output was ambiguous, but npm run validate failed. " +
                "Run npm run validate, read the error output, and fix all issues.",
              planDocPath,
            ),
            stepName: "implement",
            improvement,
            cwd: worktreePath,
            model: config.agents.implement.model,
            backend: config.agents.implement.backend,
            config,
            logger,
            abortController,
          });

          enforceMainManagedBacklog(worktreePath, logger);
          const committedFix = commitAll(
            worktreePath,
            `${commitTitle} \u2014 fix from validation (cycle ${cycle})`,
          );

          reviewAccum.turns += fixResult.turns;
          reviewAccum.costUsd += fixResult.costUsd;
          reviewAccum.tokens +=
            fixResult.inputTokens + fixResult.outputTokens;
          reviewAccum.durationMs += fixResult.durationMs;

          if (committedFix && !pushBranch(worktreePath, branchName)) {
            logger.error(`Failed to push validation fixes for cycle ${cycle}`);
            logger.info(`  Worktree preserved at: ${worktreePath}`);
            return {
              success: false,
              improvement,
              workerSlot,
              branchName,
              worktreePath,
              taskText,
              taskSource,
              stepResults,
            };
          }
        }
      }
    }

    stepResults.push(reviewAccum);
    logger.stepSummary("review", reviewAccum);

    logger.info(`[5/5] Agent handling merge for PR #${pr.number}...`);
    const attemptMerge = async (): Promise<boolean> => {
      const mergeResult = await runStep({
        prompt: buildAgentMergePrompt(pr.number, branchName),
        stepName: "merge",
        improvement,
        cwd: worktreePath,
        model: config.agents.implement.model,
        backend: config.agents.implement.backend,
        config,
        logger,
        abortController,
      });
      if (!mergeResult.success) {
        logger.error(`Agent merge step failed for PR #${pr.number}`);
        logger.info(`  Worktree preserved at: ${worktreePath}`);
        return false;
      }

      stepResults.push({
        step: "merge",
        backend: mergeResult.backend,
        turns: mergeResult.turns,
        costUsd: mergeResult.costUsd,
        tokens: mergeResult.inputTokens + mergeResult.outputTokens,
        durationMs: mergeResult.durationMs,
      });
      logger.stepSummary("merge", stepResults[stepResults.length - 1]);

      const mergeState = readPullRequestMergeState(worktreePath, pr.number);
      if (!mergeState?.mergedAt) {
        logger.error(
          `PR #${pr.number} is not merged after agent merge step (state=${mergeState?.state ?? "UNKNOWN"}).`,
        );
        logger.info(`  Worktree preserved at: ${worktreePath}`);
        return false;
      }

      return true;
    };

    let merged = await attemptMerge();
    if (!merged) {
      const recoveryAttemptCycle = cycle + 1;
      const recovered = await runPostMergeRecoveryCycle({
        config,
        logger,
        abortController,
        attemptCycle: recoveryAttemptCycle,
        maxReviewCycles: config.maxReviewCycles,
        prNumber: pr.number,
        prUrl: pr.url,
        worktreePath,
        branchName,
        improvement,
        commitTitle: `Merge recovery for PR #${pr.number}`,
        planDocPath,
        stepResults,
        runMergeAttempt: attemptMerge,
      });

      if (!recovered) {
        return {
          success: false,
          improvement,
          workerSlot,
          branchName,
          worktreePath,
          taskText,
          taskSource,
          prNumber: pr.number,
          prUrl: pr.url,
          stepResults,
          planDocPath,
          reviewCycles: recoveryAttemptCycle,
          failureReason: "merge_failed",
        };
      }
      merged = true;
    }

    if (!merged) {
      return {
        success: false,
        improvement,
        workerSlot,
        branchName,
        worktreePath,
        taskText,
        taskSource,
        prNumber: pr.number,
        prUrl: pr.url,
        stepResults,
        planDocPath,
        reviewCycles: cycle,
        failureReason: "merge_failed",
      };
    }

    const totalCost = stepResults.reduce((s, r) => s + r.costUsd, 0);
    const totalDuration = stepResults.reduce((s, r) => s + r.durationMs, 0);
    logger.improvementSummary(improvement, stepResults);
    logger.jsonl({
      event: "improvement_done",
      improvement,
      total_cost_usd: totalCost,
      total_duration_ms: totalDuration,
      ts: new Date().toISOString(),
    });

    return {
      success: true,
      improvement,
      workerSlot,
      branchName,
      worktreePath,
      taskText,
      taskSource,
      prNumber: pr.number,
      prUrl: pr.url,
      stepResults,
      reviewCycles: cycle,
      planDocPath,
      mergeHandledByWorker: true,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error(`Improvement #${improvement} failed: ${errMsg}`);
    logger.info(`  Worktree preserved at: ${worktreePath}`);
    logger.jsonl({
      event: "improvement_failed",
      improvement,
      reason: errMsg,
      ts: new Date().toISOString(),
    });
    return { success: false, improvement, workerSlot, branchName, worktreePath, taskText, taskSource, stepResults: [] };
  }
}

// ── Orchestrator ──

// Track active worktrees for exit cleanup: Map<workerSlot, { path, branch }>
export const activeWorktrees = new Map<number, { path: string; branch: string }>();

export function hasMoreWork(
  completed: number,
  target: number | undefined,
  triageCount: number,
  backlogCount: number,
  inFlightCount: number,
): boolean {
  if (target !== undefined) return completed < target;
  // No target: run until triage+backlog are empty and nothing is in flight
  return triageCount > 0 || backlogCount > 0 || inFlightCount > 0;
}

export async function main(): Promise<void> {
  const config = resolveConfig();
  const orchestratorLogger = new Logger(config.logFile, config.verbose);
  const abortController = new AbortController();

  // Signal handling
  process.on("SIGINT", () => {
    orchestratorLogger.warn("Interrupted \u2014 cleaning up...");
    abortController.abort();
  });
  process.on("SIGTERM", () => {
    abortController.abort();
  });

  // On exit, clean up worktrees
  process.on("exit", () => {
    for (const [, wt] of activeWorktrees) {
      if (hasNewCommits(wt.path)) {
        console.error(`Worktree preserved (has commits): ${wt.path}`);
      } else {
        try {
          cleanupWorktree(config.repoDir, wt.path, wt.branch);
        } catch {
          // Best effort
        }
      }
    }
  });

  checkDeps(config, orchestratorLogger);
  syncBacklog(orchestratorLogger, "startup");

  if (!config.task) {
    const outstandingRalphPrs = listOpenRalphPullRequests(
      config.repoDir,
      config.branchPrefix,
    );
    let addedTriage = 0;
    for (const pr of outstandingRalphPrs) {
      const task = buildOutstandingRalphPrTriageTask({
        prNumber: pr.number,
        branchName: pr.headRefName,
        prUrl: pr.url,
      });
      if (addTriageTask(task)) addedTriage++;
    }
    if (addedTriage > 0) {
      orchestratorLogger.warn(
        `Imported ${addedTriage} outstanding Ralph PR(s) into triage.`,
      );
    }
  }

  const { agents } = config;
  const fmtStep = (s: { backend: AgentBackend; model: string }): string =>
    `${s.backend}/${s.model}`;

  const targetLabel = config.target !== undefined
    ? `${config.target} harness improvements`
    : "until backlog empty";

  orchestratorLogger.info("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
  orchestratorLogger.info(`  Ralph Loop (GitHub PR) \u2014 target: ${targetLabel}`);
  orchestratorLogger.info(`  Parallelism    : ${config.parallelism}`);
  orchestratorLogger.info(`  Branch prefix  : ${config.branchPrefix}`);
  orchestratorLogger.info(`  Repo           : ${config.repoDir}`);
  orchestratorLogger.info(`  Worktrees      : ${config.worktreeDir}`);
  orchestratorLogger.info(`  Max turns/step : ${config.maxTurns}`);
  orchestratorLogger.info(`  Review cycles  : ${config.minReviewCycles}-${config.maxReviewCycles}`);
  orchestratorLogger.info(`  Backlog agent  : ${fmtStep(agents.backlog)}`);
  orchestratorLogger.info(`  Plan agent     : ${fmtStep(agents.plan)}`);
  orchestratorLogger.info(`  Impl agent     : ${fmtStep(agents.implement)}`);
  orchestratorLogger.info(`  Review agent   : ${fmtStep(agents.review)}`);
  if (config.task) orchestratorLogger.info(`  Task           : ${config.task}`);
  orchestratorLogger.info(`  Triage         : ${readTriage().length} tasks`);
  orchestratorLogger.info(`  Backlog        : ${readBacklog().length} tasks`);
  orchestratorLogger.info("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");

  let completed = countCompleted(config.repoDir);
  orchestratorLogger.info(`Already completed: ${completed}${config.target !== undefined ? `/${config.target}` : ""}`);
  orchestratorLogger.info(`Backlog           : ${backlogPath()}`);

  let consecutiveFailures = 0;
  const failureThreshold = Math.max(3, config.parallelism + 2);
  let nextImprovement = completed + 1;
  const tasksInFlight = new Set<string>();
  let mainNotGreenRetryAfter = 0;

  // Active worker promises keyed by worker slot
  const activeWorkers = new Map<number, Promise<WorkerResult>>();

  function makeTaskKey(taskText: string, source: TaskSource): string {
    return `${source}:${taskText}`;
  }

  function syncBacklog(logger: Logger, reason: string): void {
    const sync = syncTaskFilesFromLog(config.logFile);
    const removedCount =
      sync.removedFromBacklog.length + sync.removedFromTriage.length;
    if (removedCount === 0) return;

    logger.warn(
      `Backlog sync (${reason}) removed ${removedCount} completed task(s) ` +
        `(${sync.removedFromBacklog.length} backlog, ${sync.removedFromTriage.length} triage).`,
    );
    for (const task of sync.removedFromBacklog.slice(0, 5)) {
      logger.info(`  - removed from backlog: ${task}`);
    }
    for (const task of sync.removedFromTriage.slice(0, 5)) {
      logger.info(`  - removed from triage: ${task}`);
    }
  }

  /** Find first triage/backlog task not already in flight (triage first). */
  function acquireTask(): { text: string; source: TaskSource } | undefined {
    const now = Date.now();
    let deferredMainNotGreenTask: { text: string; source: TaskSource } | undefined;
    const triage = readTriage();
    for (const t of triage) {
      if (!tasksInFlight.has(makeTaskKey(t, "triage"))) {
        if (
          t === MAIN_NOT_GREEN_TRIAGE_TASK &&
          now < mainNotGreenRetryAfter
        ) {
          deferredMainNotGreenTask = { text: t, source: "triage" };
          continue;
        }
        return { text: t, source: "triage" };
      }
    }

    const backlog = readBacklog();
    for (const t of backlog) {
      if (!tasksInFlight.has(makeTaskKey(t, "backlog"))) {
        return { text: t, source: "backlog" };
      }
    }
    return deferredMainNotGreenTask;
  }

  /** Ensure triage/backlog has tasks, refilling backlog if needed. */
  async function ensureBacklog(): Promise<boolean> {
    const triage = readTriage();
    const triageAvailable = triage.filter(
      (t) => !tasksInFlight.has(makeTaskKey(t, "triage")),
    );
    if (triageAvailable.length > 0) return true;

    const tasks = readBacklog();
    const available = tasks.filter(
      (t) => !tasksInFlight.has(makeTaskKey(t, "backlog")),
    );
    if (available.length > 0) return true;

    // All tasks are in flight or backlog is empty — try refill
    if (tasks.length === 0) {
      orchestratorLogger.heading("Backlog empty \u2014 refilling with 10 tasks...");
      const refillResult = await runStep({
        prompt: buildBacklogRefillPrompt(),
        stepName: "backlog-refill",
        improvement: completed,
        cwd: config.repoDir,
        model: config.agents.backlog.model,
        backend: config.agents.backlog.backend,
        config,
        logger: orchestratorLogger,
        abortController,
      });

      if (!refillResult.success) {
        orchestratorLogger.error("Backlog refill failed");
        return false;
      }

      const rawBacklog = readBacklog();
      const normalization = normalizeBacklogForTypeScriptEslintCleanup(
        rawBacklog,
        readSuppressedTypeScriptEslintRules(join(config.repoDir, ".oxlintrc.json")),
      );

      const tasksHaveChanged =
        rawBacklog.length !== normalization.normalizedTasks.length ||
        rawBacklog.some(
          (task, index) => task !== normalization.normalizedTasks[index],
        );
      const newBacklog =
        tasksHaveChanged ? normalization.normalizedTasks : rawBacklog;

      if (normalization.removedNoiseTasks.length > 0) {
        orchestratorLogger.info(
          `Backlog normalization removed ${normalization.removedNoiseTasks.length} generic suppression task(s) during refill:`,
        );
        for (const task of normalization.removedNoiseTasks) {
          orchestratorLogger.info(`  - removed: ${task}`);
        }
      }

      if (normalization.addedCleanupTasks.length > 0) {
        orchestratorLogger.info(
          `Backlog normalization added ${normalization.addedCleanupTasks.length} canonical suppression cleanup task(s) during refill:`,
        );
        for (const task of normalization.addedCleanupTasks) {
          orchestratorLogger.info(`  - added: ${task}`);
        }
      }

      if (tasksHaveChanged) {
        writeBacklog(newBacklog);
      }

      orchestratorLogger.success(`Backlog refilled: ${newBacklog.length} tasks`);
      for (const t of newBacklog) {
        orchestratorLogger.info(`  - ${t}`);
      }
      syncBacklog(orchestratorLogger, "post-refill");

      if (newBacklog.length === 0) {
        orchestratorLogger.error("Refill produced no tasks \u2014 stopping.");
        return false;
      }
    }

    return true;
  }

  function parkTaskAfterEscalation(result: WorkerResult, logger: Logger): void {
    if (!result.taskText || config.task) return;

    tasksInFlight.delete(makeTaskKey(result.taskText, result.taskSource));
    if (result.taskSource === "backlog") removeTask(result.taskText);
    if (result.taskSource === "triage") removeTriageTask(result.taskText);

    const prLabel = result.prNumber !== undefined ? `PR #${result.prNumber}` : result.branchName;
    const originalTask = unwrapEscalatedTask(result.taskText);
    addTriageTask(
      `Human escalation required for ${prLabel} (improvement #${result.improvement}). Worktree: ${result.worktreePath}. Original task: ${originalTask}`,
    );
    logger.warn(`Escalated to human review (${prLabel}); branch preserved at ${result.worktreePath}`);
  }

  function escalateMergeConflict(result: WorkerResult, logger: Logger): void {
    if (!result.taskText || config.task) return;

    const prLabel =
      result.prNumber !== undefined ? `PR #${result.prNumber}` : result.branchName;
    tasksInFlight.delete(makeTaskKey(result.taskText, result.taskSource));
    if (result.taskSource === "triage") {
      removeTriageTask(result.taskText);
    } else {
      removeTask(result.taskText);
    }
    moveTaskToMergeConflicts(result.taskText, {
      improvement: result.improvement,
      branchName: result.branchName,
      worktreePath: result.worktreePath,
    });
    logger.warn(
      `Escalated to merge-conflict triage (${prLabel}); branch preserved at ${result.worktreePath}`,
    );
  }

  // ── Main orchestration loop ──

  function importOutstandingRalphPrs(): number {
    if (config.task) return 0;

    const outstandingRalphPrs = listOpenRalphPullRequests(
      config.repoDir,
      config.branchPrefix,
    );
    if (outstandingRalphPrs.length === 0) return 0;

    const attachedBranches = new Set(
      [...activeWorktrees.values()].map((worktree) => worktree.branch),
    );
    let added = 0;

    for (const pr of outstandingRalphPrs) {
      if (attachedBranches.has(pr.headRefName)) continue;

      const task = buildOutstandingRalphPrTriageTask({
        prNumber: pr.number,
        branchName: pr.headRefName,
        prUrl: pr.url,
      });
      if (addTriageTask(task)) {
        added++;
      }
    }

    if (added > 0) {
      orchestratorLogger.warn(
        `Imported ${added} outstanding Ralph PR(s) into triage.`,
      );
    }

    return added;
  }

  if (!config.task && !runValidation(config.repoDir)) {
    if (addTriageTask(MAIN_NOT_GREEN_TRIAGE_TASK)) {
      orchestratorLogger.warn(
        "Main is not green; triage task added and will be prioritized.",
      );
    }
  }

  while (true) {
    importOutstandingRalphPrs();
    if (
      !hasMoreWork(
        completed,
        config.target,
        readTriage().length,
        readBacklog().length,
        tasksInFlight.size,
      )
    ) {
      break;
    }
    if (abortController.signal.aborted) break;

    // Check failure threshold BEFORE launching new workers
    if (consecutiveFailures >= failureThreshold) {
      orchestratorLogger.error(
        `${consecutiveFailures} consecutive failures (threshold: ${failureThreshold}) \u2014 stopping.`,
      );
      break;
    }

    // Fill empty worker slots
    const freeSlots: number[] = [];
    for (let i = 0; i < config.parallelism; i++) {
      if (!activeWorkers.has(i)) freeSlots.push(i);
    }

    for (const slot of freeSlots) {
      if (abortController.signal.aborted) break;
      if (config.target !== undefined && completed + tasksInFlight.size >= config.target) break;

      let taskText: string | undefined = config.task;
      let taskSource: TaskSource = config.task ? "cli" : "backlog";

      if (!taskText) {
        // Ensure backlog has available tasks
        const ok = await ensureBacklog();
        if (!ok) {
          if (activeWorkers.size === 0) {
            orchestratorLogger.error("No tasks available and no workers running \u2014 stopping.");
            process.exit(1);
          }
          break; // Let running workers finish
        }

        const acquired = acquireTask();
        if (!acquired) break; // All tasks in flight, wait for workers to finish
        taskText = acquired.text;
        taskSource = acquired.source;
      }

      // Acquire this task
      if (taskText && !config.task) {
        tasksInFlight.add(makeTaskKey(taskText, taskSource));
      }

      const improvement = nextImprovement++;
      const workerLogger = new Logger(config.logFile, config.verbose, slot);

      // Track worktree for exit cleanup
      const branchName = `${config.branchPrefix}-${String(improvement).padStart(3, "0")}`;
      const worktreePath = `${config.worktreeDir}/${branchName}`;
      activeWorktrees.set(slot, { path: worktreePath, branch: branchName });

      const triageRemaining = readTriage().length;
      const backlogRemaining = readBacklog().length;
      workerLogger.info(
        `Starting ${taskSource} task (${triageRemaining} triage, ${backlogRemaining} backlog): ${taskText?.slice(0, 80) ?? "(ideation)"}...`,
      );

      const workerPromise = runWorker(
        slot,
        improvement,
        config,
        workerLogger,
        abortController,
        taskText,
        taskSource,
      );

      activeWorkers.set(slot, workerPromise);
    }

    if (activeWorkers.size === 0) break;

    // Wait for any worker to finish
    const entries = [...activeWorkers.entries()];
    const results = entries.map(([slot, promise]) =>
      promise.then((result) => ({ slot, result })),
    );

    const { slot: finishedSlot, result } = await Promise.race(results);
    activeWorkers.delete(finishedSlot);

    // Log worker completion
    const finishedLogger = new Logger(config.logFile, config.verbose, finishedSlot);
    finishedLogger.jsonl({
      event: "worker_finished",
      worker: finishedSlot,
      improvement: result.improvement,
      success: result.success,
      ts: new Date().toISOString(),
    });

    if (result.success) {
      if (result.mergeHandledByWorker) {
        if (result.taskText && !config.task) {
          if (result.taskSource === "triage") {
            removeTriageTask(result.taskText);
            finishedLogger.info("Task removed from triage after agent-merged PR");
          } else {
            removeTask(result.taskText);
            finishedLogger.info("Task removed from backlog after agent-merged PR");
          }
          tasksInFlight.delete(makeTaskKey(result.taskText, result.taskSource));
        }
        syncBacklog(orchestratorLogger, "post-merge");
        activeWorktrees.delete(finishedSlot);
        completed++;
        consecutiveFailures = 0;
        orchestratorLogger.success(
          `Progress: ${completed}${config.target !== undefined ? `/${config.target}` : ""} \u2713`,
        );
        continue;
      }

      if (result.prNumber === undefined) {
        finishedLogger.error("Missing PR number for successful worker result");
        activeWorktrees.delete(finishedSlot);
        consecutiveFailures++;
        continue;
      }
      finishedLogger.warn(
        `Result for improvement #${result.improvement} was successful but merge was not worker-handled; escalating for visibility`,
      );
      escalateMergeConflict(result, finishedLogger);
      activeWorktrees.delete(finishedSlot);
      consecutiveFailures++;
    } else {
      // Worker failed
      if (
        result.prNumber !== undefined &&
        result.taskText &&
        !config.task
      ) {
        if (result.failureReason === "review_failed") {
          parkTaskAfterEscalation(result, finishedLogger);
        } else {
          escalateMergeConflict(result, finishedLogger);
        }
      }
      if (result.taskText) {
        tasksInFlight.delete(makeTaskKey(result.taskText, result.taskSource));
      }
      if (
        result.failureReason === "no_changes" &&
        result.taskText === MAIN_NOT_GREEN_TRIAGE_TASK
      ) {
        mainNotGreenRetryAfter = Date.now() + MAIN_NOT_GREEN_RETRY_COOLDOWN_MS;
        const retryAt = new Date(mainNotGreenRetryAfter).toLocaleTimeString(
          "en-US",
          { hour12: false },
        );
        orchestratorLogger.warn(
          `Main-green task produced no changes; deferring retries until ${retryAt}.`,
        );
      }
      activeWorktrees.delete(finishedSlot);
      consecutiveFailures++;
      orchestratorLogger.warn(
        `Improvement #${result.improvement} failed (consecutive failures: ${consecutiveFailures})`,
      );
    }

    // Small delay between scheduling rounds
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  // Wait for any remaining workers
  if (activeWorkers.size > 0) {
    orchestratorLogger.info(`Waiting for ${activeWorkers.size} remaining worker(s)...`);
    const remaining = [...activeWorkers.values()];
    const results = await Promise.allSettled(remaining);
    for (const r of results) {
      if (r.status === "fulfilled" && r.value.success) {
        const result = r.value;
        if (result.mergeHandledByWorker) {
          if (result.taskText && !config.task) {
            if (result.taskSource === "triage") {
              removeTriageTask(result.taskText);
            } else {
              removeTask(result.taskText);
            }
            tasksInFlight.delete(makeTaskKey(result.taskText, result.taskSource));
          }
          syncBacklog(orchestratorLogger, "post-merge");
          activeWorktrees.delete(result.workerSlot);
          completed++;
          continue;
        }

        if (result.prNumber === undefined) {
          consecutiveFailures++;
          continue;
        }
        const workerLogger = new Logger(config.logFile, config.verbose, result.workerSlot);
        workerLogger.warn(
          `Result for improvement #${result.improvement} was successful but merge was not worker-handled; escalating for visibility`,
        );
        escalateMergeConflict(result, workerLogger);
        activeWorktrees.delete(result.workerSlot);
        consecutiveFailures++;
      }
      if (r.status === "fulfilled" && !r.value.success) {
        const result = r.value;
        const workerLogger = new Logger(
          config.logFile,
          config.verbose,
          result.workerSlot,
        );
        if (result.prNumber !== undefined && result.taskText && !config.task) {
          if (result.failureReason === "review_failed") {
            parkTaskAfterEscalation(result, workerLogger);
          } else {
            escalateMergeConflict(result, workerLogger);
          }
        }
        if (result.taskText) {
          tasksInFlight.delete(makeTaskKey(result.taskText, result.taskSource));
        }
        activeWorktrees.delete(result.workerSlot);
        consecutiveFailures++;
      }
    }
  }

  orchestratorLogger.info("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
  orchestratorLogger.success(
    `  \u2713 Done! ${completed} harness improvements shipped locally.`,
  );
  orchestratorLogger.info("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
}

if (process.env.VITEST === undefined) {
  main().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
}
