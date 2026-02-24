import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { Logger } from "./log.js";
import { runStep } from "./agent.js";
import {
  buildBacklogRefillPrompt,
  buildTaskPlanPrompt,
  buildPlanPrompt,
  buildImplPrompt,
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
  readBacklog,
  readTriage,
  addTriageTask,
  removeTask,
  removeTriageTask,
  backlogPath,
  moveTaskToMergeConflicts,
} from "./backlog.js";
import { resolveConfig } from "./config.js";
import { MergeQueue } from "./merge-queue.js";
import type { AgentBackend, Config, StepSummary } from "./types.js";

// ── Worker result returned from runWorker ──

interface WorkerResult {
  success: boolean;
  improvement: number;
  workerSlot: number;
  branchName: string;
  worktreePath: string;
  taskText?: string;
  taskSource: TaskSource;
  stepResults: StepSummary[];
}

type TaskSource = "backlog" | "triage" | "cli";

// ── Validation helper ──

function runValidation(cwd: string): boolean {
  try {
    execFileSync("npm", ["run", "validate"], { cwd, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

// ── Dependency check ──

function checkDeps(config: Config, logger: Logger): void {
  try {
    execFileSync("which", ["git"], { stdio: "pipe" });
  } catch {
    logger.error("Missing dependency: git");
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

// ── Single worker: plan -> implement -> review (no merge) ──

async function runWorker(
  workerSlot: number,
  improvement: number,
  config: Config,
  logger: Logger,
  abortController: AbortController,
  taskText?: string,
  taskSource: TaskSource = "backlog",
): Promise<WorkerResult> {
  const branchName = `${config.branchPrefix}-${String(improvement).padStart(3, "0")}`;
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

    // ── 1. Planning (skip if resuming) ──
    let planSummary = "";

    if (wtResult.resumed) {
      logger.info("[1/4] Skipping planning (resuming from prior work)");
    } else if (taskText) {
      logger.info(`[1/4] Planning for task: ${taskText.slice(0, 80)}...`);
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
      logger.info("[1/4] Planning (full ideation)...");
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
    logger.info("[2/4] Implementing...");
    let implResult = await runStep({
      prompt: buildImplPrompt(),
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
        prompt: buildImplPrompt(),
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

    const commitTitle = planSummary || `harness: improvement #${improvement}`;
    const commitBody = doneSummary ? `\n${doneSummary}` : "";
    const commitMsg = `${commitTitle}${commitBody}`;

    if (!commitAll(worktreePath, commitMsg)) {
      if (!hasNewCommits(worktreePath)) {
        logger.error("No changes produced");
        logger.info(`  Worktree preserved at: ${worktreePath}`);
        return { success: false, improvement, workerSlot, branchName, worktreePath, taskText, taskSource, stepResults };
      }
    }

    // ── 3. Review loop ──
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
        return { success: false, improvement, workerSlot, branchName, worktreePath, taskText, taskSource, stepResults };
      }

      logger.info(
        `[3/4] Review (cycle ${cycle}/${config.maxReviewCycles})...`,
      );
      const reviewResult = await runStep({
        prompt: buildReviewPrompt(),
        stepName: "review",
        improvement,
        cwd: worktreePath,
        model: config.agents.review.model,
        backend: config.agents.review.backend,
        config,
        logger,
        abortController,
      });

      commitAll(
        worktreePath,
        `${commitTitle} \u2014 review fixes (cycle ${cycle})`,
      );

      reviewAccum.turns += reviewResult.turns;
      reviewAccum.costUsd += reviewResult.costUsd;
      reviewAccum.tokens +=
        reviewResult.inputTokens + reviewResult.outputTokens;
      reviewAccum.durationMs += reviewResult.durationMs;

      if (reviewResult.outputText.includes("REVIEW_PASSED")) {
        passed = true;
      } else if (reviewResult.outputText.includes("REVIEW_FAILED")) {
        logger.warn("Reviewer found issues \u2014 running fix step...");
        const fixResult = await runStep({
          prompt: buildFixPrompt(reviewResult.outputText),
          stepName: "implement",
          improvement,
          cwd: worktreePath,
          model: config.agents.implement.model,
          backend: config.agents.implement.backend,
          config,
          logger,
          abortController,
        });

        commitAll(
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

          commitAll(
            worktreePath,
            `${commitTitle} \u2014 fix from validation (cycle ${cycle})`,
          );

          reviewAccum.turns += fixResult.turns;
          reviewAccum.costUsd += fixResult.costUsd;
          reviewAccum.tokens +=
            fixResult.inputTokens + fixResult.outputTokens;
          reviewAccum.durationMs += fixResult.durationMs;
        }
      }
    }

    stepResults.push(reviewAccum);
    logger.stepSummary("review", reviewAccum);

    // Worker done — merge is handled by the orchestrator via MergeQueue
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

    return { success: true, improvement, workerSlot, branchName, worktreePath, taskText, taskSource, stepResults };
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
const activeWorktrees = new Map<number, { path: string; branch: string }>();

function hasMoreWork(
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

async function main(): Promise<void> {
  const config = resolveConfig();
  const orchestratorLogger = new Logger(config.logFile, config.verbose);
  const abortController = new AbortController();
  const mergeQueue = new MergeQueue();

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

  const { agents } = config;
  const fmtStep = (s: { backend: AgentBackend; model: string }): string =>
    `${s.backend}/${s.model}`;

  const targetLabel = config.target !== undefined
    ? `${config.target} harness improvements`
    : "until backlog empty";

  orchestratorLogger.info("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
  orchestratorLogger.info(`  Ralph Loop (local) \u2014 target: ${targetLabel}`);
  orchestratorLogger.info(`  Parallelism    : ${config.parallelism}`);
  orchestratorLogger.info(`  Branch prefix  : ${config.branchPrefix}`);
  orchestratorLogger.info(`  Repo           : ${config.repoDir}`);
  orchestratorLogger.info(`  Worktrees      : ${config.worktreeDir}`);
  orchestratorLogger.info(`  Max turns/step : ${config.maxTurns}`);
  orchestratorLogger.info(`  Max review cyc : ${config.maxReviewCycles}`);
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
  const MAIN_NOT_GREEN_TRIAGE_TASK =
    "Restore main to green: run npm run validate on main, fix failures, then rerun validate.";

  // Active worker promises keyed by worker slot
  const activeWorkers = new Map<number, Promise<WorkerResult>>();

  function makeTaskKey(taskText: string, source: TaskSource): string {
    return `${source}:${taskText}`;
  }

  /** Find first triage/backlog task not already in flight (triage first). */
  function acquireTask(): { text: string; source: TaskSource } | undefined {
    const triage = readTriage();
    for (const t of triage) {
      if (!tasksInFlight.has(makeTaskKey(t, "triage"))) {
        return { text: t, source: "triage" };
      }
    }

    const backlog = readBacklog();
    for (const t of backlog) {
      if (!tasksInFlight.has(makeTaskKey(t, "backlog"))) {
        return { text: t, source: "backlog" };
      }
    }
    return undefined;
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

      const newBacklog = readBacklog();
      orchestratorLogger.success(`Backlog refilled: ${newBacklog.length} tasks`);
      for (const t of newBacklog) {
        orchestratorLogger.info(`  - ${t}`);
      }

      if (newBacklog.length === 0) {
        orchestratorLogger.error("Refill produced no tasks \u2014 stopping.");
        return false;
      }
    }

    return true;
  }

  function parkTaskAfterMergeConflict(result: WorkerResult, logger: Logger): void {
    if (!result.taskText || config.task) return;

    tasksInFlight.delete(makeTaskKey(result.taskText, result.taskSource));
    if (result.taskSource === "backlog") {
      moveTaskToMergeConflicts(result.taskText, {
        improvement: result.improvement,
        branchName: result.branchName,
        worktreePath: result.worktreePath,
      });
      logger.warn(
        `Backlog task moved to triage after merge conflict (branch preserved at ${result.worktreePath})`,
      );
      return;
    }

    addTriageTask(result.taskText);
    logger.warn(
      `Triage task still unresolved after merge conflict (branch preserved at ${result.worktreePath})`,
    );
  }

  // ── Main orchestration loop ──

  if (!config.task && !runValidation(config.repoDir)) {
    if (addTriageTask(MAIN_NOT_GREEN_TRIAGE_TASK)) {
      orchestratorLogger.warn(
        "Main is not green; triage task added and will be prioritized.",
      );
    }
  }

  while (
    hasMoreWork(
      completed,
      config.target,
      readTriage().length,
      readBacklog().length,
      tasksInFlight.size,
    )
  ) {
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
      // Enqueue to merge queue
      const mergeResult = await mergeQueue.enqueue({
        repoDir: config.repoDir,
        worktreePath: result.worktreePath,
        branchName: result.branchName,
        improvement: result.improvement,
        worker: finishedSlot,
        logger: finishedLogger,
      });

      if (mergeResult.success) {
        // Remove task from backlog and in-flight set
        if (result.taskText && !config.task) {
          if (result.taskSource === "triage") {
            removeTriageTask(result.taskText);
            finishedLogger.info("Task removed from triage after successful merge");
          } else {
            removeTask(result.taskText);
            finishedLogger.info("Task removed from backlog after successful merge");
          }
          tasksInFlight.delete(makeTaskKey(result.taskText, result.taskSource));
        }
        activeWorktrees.delete(finishedSlot);
        completed++;
        consecutiveFailures = 0;
        orchestratorLogger.success(
          `Progress: ${completed}${config.target !== undefined ? `/${config.target}` : ""} \u2713`,
        );
      } else {
        // Merge failed (conflict) — treat as failure
        parkTaskAfterMergeConflict(result, finishedLogger);
        activeWorktrees.delete(finishedSlot);
        consecutiveFailures++;
        orchestratorLogger.warn(
          `Merge failed for improvement #${result.improvement} (consecutive failures: ${consecutiveFailures})`,
        );
      }
    } else {
      // Worker failed
      if (result.taskText) {
        tasksInFlight.delete(makeTaskKey(result.taskText, result.taskSource));
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
        const workerLogger = new Logger(config.logFile, config.verbose, result.workerSlot);
        const mergeResult = await mergeQueue.enqueue({
          repoDir: config.repoDir,
          worktreePath: result.worktreePath,
          branchName: result.branchName,
          improvement: result.improvement,
          worker: result.workerSlot,
          logger: workerLogger,
        });
        if (mergeResult.success) {
          if (result.taskText && !config.task) {
            if (result.taskSource === "triage") {
              removeTriageTask(result.taskText);
            } else {
              removeTask(result.taskText);
            }
            tasksInFlight.delete(makeTaskKey(result.taskText, result.taskSource));
          }
          activeWorktrees.delete(result.workerSlot);
          completed++;
        } else {
          parkTaskAfterMergeConflict(result, workerLogger);
          activeWorktrees.delete(result.workerSlot);
          consecutiveFailures++;
        }
      }
    }
  }

  orchestratorLogger.info("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
  orchestratorLogger.success(
    `  \u2713 Done! ${completed} harness improvements shipped locally.`,
  );
  orchestratorLogger.info("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
