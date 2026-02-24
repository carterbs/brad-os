import { parseArgs } from "node:util";
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
} from "./prompts.js";
import {
  createWorktree,
  cleanupWorktree,
  mergeToMain,
  countCompleted,
  commitAll,
} from "./git.js";
import { readBacklog, popTask, backlogPath } from "./backlog.js";
import type { AgentBackend, AgentConfig, Config, StepSummary } from "./types.js";

const REPO_DIR = "/Users/bradcarter/Documents/Dev/brad-os";
const WORKTREE_DIR = "/tmp/brad-os-ralph-worktrees";

const DEFAULT_MODELS: Record<AgentBackend, { plan: string; exec: string }> = {
  claude: { plan: "claude-opus-4-6", exec: "claude-sonnet-4-6" },
  codex: { plan: "gpt-5.3-codex-high", exec: "gpt-5.3-codex-spark" },
};

function parseCliArgs(): Config {
  const { values } = parseArgs({
    options: {
      target: { type: "string", default: "15" },
      "branch-prefix": { type: "string", default: "harness-improvement" },
      "max-turns": { type: "string", default: "100" },
      verbose: { type: "boolean", default: false },
      task: { type: "string" },
      // Backend selection
      agent: { type: "string" },
      "backlog-agent": { type: "string" },
      "plan-agent": { type: "string" },
      "impl-agent": { type: "string" },
      "review-agent": { type: "string" },
      // Model overrides
      "backlog-model": { type: "string" },
      "plan-model": { type: "string" },
      "impl-model": { type: "string" },
      "review-model": { type: "string" },
    },
    strict: false,
  });

  const defaultBackend = (values.agent as AgentBackend) ?? "claude";

  function resolveStep(
    stepAgent: string | undefined,
    stepModel: string | undefined,
    role: "plan" | "exec",
  ): { backend: AgentBackend; model: string } {
    const backend = (stepAgent as AgentBackend) ?? defaultBackend;
    const baseModel = DEFAULT_MODELS[backend][role];
    return { backend, model: stepModel ?? baseModel };
  }

  const agents: AgentConfig = {
    backlog: resolveStep(values["backlog-agent"] as string | undefined, values["backlog-model"] as string | undefined, "plan"),
    plan: resolveStep(values["plan-agent"] as string | undefined, values["plan-model"] as string | undefined, "plan"),
    implement: resolveStep(values["impl-agent"] as string | undefined, values["impl-model"] as string | undefined, "exec"),
    review: resolveStep(values["review-agent"] as string | undefined, values["review-model"] as string | undefined, "exec"),
  };

  return {
    target: parseInt(values.target as string, 10),
    branchPrefix: values["branch-prefix"] as string,
    maxTurns: parseInt(values["max-turns"] as string, 10),
    verbose: values.verbose as boolean,
    task: values.task as string | undefined,
    repoDir: REPO_DIR,
    worktreeDir: WORKTREE_DIR,
    maxReviewCycles: 4,
    logFile: `${REPO_DIR}/ralph-loop.jsonl`,
    agents,
  };
}

function runValidation(cwd: string): boolean {
  try {
    execFileSync("npm", ["run", "validate"], { cwd, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function checkDeps(config: Config, logger: Logger): void {
  // Always need git
  try {
    execFileSync("which", ["git"], { stdio: "pipe" });
  } catch {
    logger.error("Missing dependency: git");
    process.exit(1);
  }

  // Check for backends actually in use
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

async function ralphLoopSingle(
  n: number,
  config: Config,
  logger: Logger,
  abortController: AbortController,
  currentTask?: string,
): Promise<boolean> {
  const branchName = `${config.branchPrefix}-${String(n).padStart(3, "0")}`;
  const worktreePath = `${config.worktreeDir}/${branchName}`;

  logger.heading(`\u2501\u2501\u2501 Improvement #${n}/${config.target} \u2501\u2501\u2501`);

  // Create worktree
  if (
    !createWorktree(config.repoDir, config.worktreeDir, worktreePath, branchName)
  ) {
    logger.error("Failed to create worktree");
    return false;
  }

  // Track current worktree for exit cleanup
  currentWorktree = worktreePath;
  currentBranch = branchName;

  const cleanup = (): void => {
    cleanupWorktree(config.repoDir, worktreePath, branchName);
    currentWorktree = undefined;
    currentBranch = undefined;
  };

  try {
    const stepResults: StepSummary[] = [];

    // ── 1. Planning ──
    // Resolve the task: --task flag > backlog > full ideation
    const taskText = config.task ?? currentTask;

    if (taskText) {
      // Task is known — plan the implementation (skip ideation)
      logger.info(`[1/4] Planning for task: ${taskText.slice(0, 80)}...`);
      const planResult = await runStep({
        prompt: buildTaskPlanPrompt(taskText),
        stepName: "plan",
        improvement: n,
        cwd: worktreePath,
        model: config.agents.plan.model,
        backend: config.agents.plan.backend,
        config,
        logger,
        abortController,
      });

      if (!planResult.success) {
        logger.error("Planning step failed");
        cleanup();
        return false;
      }

      if (
        !existsSync(
          `${worktreePath}/thoughts/shared/plans/active/ralph-improvement.md`,
        )
      ) {
        logger.error("Planning agent failed to create ralph-improvement.md");
        cleanup();
        return false;
      }

      const planLine = planResult.outputText
        .split("\n")
        .find((l) => l.startsWith("PLAN:"));
      if (planLine) logger.info(`  ${planLine}`);

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
      // No task — full ideation planning (scan codebase for gaps)
      logger.info("[1/4] Planning (full ideation)...");
      const planResult = await runStep({
        prompt: buildPlanPrompt(n, config.target),
        stepName: "plan",
        improvement: n,
        cwd: worktreePath,
        model: config.agents.plan.model,
        backend: config.agents.plan.backend,
        config,
        logger,
        abortController,
      });

      if (!planResult.success) {
        logger.error("Planning step failed");
        cleanup();
        return false;
      }

      if (
        !existsSync(
          `${worktreePath}/thoughts/shared/plans/active/ralph-improvement.md`,
        )
      ) {
        logger.error("Planning agent failed to create ralph-improvement.md");
        cleanup();
        return false;
      }

      const planLine = planResult.outputText
        .split("\n")
        .find((l) => l.startsWith("PLAN:"));
      if (planLine) logger.info(`  ${planLine}`);

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
      improvement: n,
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
        improvement: n,
        cwd: worktreePath,
        model: config.agents.implement.model,
        backend: config.agents.implement.backend,
        config,
        logger,
        abortController,
      });
      if (!implResult.success) {
        logger.error("Implementation failed on retry");
        cleanup();
        return false;
      }
    }

    const doneLine = implResult.outputText
      .split("\n")
      .find((l) => l.startsWith("DONE:"));
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

    // Commit implementation
    if (!commitAll(worktreePath, `harness: improvement #${n}`)) {
      logger.error("No changes produced");
      cleanup();
      return false;
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
          improvement: n,
          reason: "exceeded review cycles",
          ts: new Date().toISOString(),
        });
        return false;
      }

      logger.info(
        `[3/4] Review (cycle ${cycle}/${config.maxReviewCycles})...`,
      );
      const reviewResult = await runStep({
        prompt: buildReviewPrompt(),
        stepName: "review",
        improvement: n,
        cwd: worktreePath,
        model: config.agents.review.model,
        backend: config.agents.review.backend,
        config,
        logger,
        abortController,
      });

      // Commit review fixes
      commitAll(
        worktreePath,
        `harness: improvement #${n} \u2014 review fixes (cycle ${cycle})`,
      );

      // Accumulate review stats across cycles
      reviewAccum.turns += reviewResult.turns;
      reviewAccum.costUsd += reviewResult.costUsd;
      reviewAccum.tokens +=
        reviewResult.inputTokens + reviewResult.outputTokens;
      reviewAccum.durationMs += reviewResult.durationMs;

      if (reviewResult.outputText.includes("REVIEW_PASSED")) {
        passed = true;
      } else if (reviewResult.outputText.includes("REVIEW_FAILED")) {
        logger.warn("Reviewer found unfixable issues, retrying...");
      } else {
        // Ambiguous — fall back to running validation directly
        logger.warn(
          "Ambiguous review output, running validation as fallback...",
        );
        if (runValidation(worktreePath)) {
          passed = true;
        }
      }
    }

    stepResults.push(reviewAccum);
    logger.stepSummary("review", reviewAccum);

    // ── 4. Merge to main ──
    logger.info("[4/4] Merging to main...");
    if (!mergeToMain(config.repoDir, branchName)) {
      logger.error(
        `Merge conflict \u2014 worktree preserved at: ${worktreePath}`,
      );
      logger.jsonl({
        event: "improvement_failed",
        improvement: n,
        reason: "merge conflict",
        ts: new Date().toISOString(),
      });
      return false;
    }

    // Cleanup worktree
    cleanup();

    // Summary
    const totalCost = stepResults.reduce((s, r) => s + r.costUsd, 0);
    const totalDuration = stepResults.reduce((s, r) => s + r.durationMs, 0);
    logger.improvementSummary(n, stepResults);
    logger.jsonl({
      event: "improvement_done",
      improvement: n,
      total_cost_usd: totalCost,
      total_duration_ms: totalDuration,
      ts: new Date().toISOString(),
    });

    logger.success(`Improvement #${n} merged locally`);
    return true;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error(`Improvement #${n} failed: ${errMsg}`);
    logger.jsonl({
      event: "improvement_failed",
      improvement: n,
      reason: errMsg,
      ts: new Date().toISOString(),
    });
    cleanup();
    return false;
  }
}

// Track current worktree for exit cleanup
let currentWorktree: string | undefined;
let currentBranch: string | undefined;

async function main(): Promise<void> {
  const config = parseCliArgs();
  const logger = new Logger(config.logFile, config.verbose);
  const abortController = new AbortController();

  // Signal handling
  process.on("SIGINT", () => {
    logger.warn("Interrupted \u2014 cleaning up...");
    abortController.abort();
  });
  process.on("SIGTERM", () => {
    abortController.abort();
  });

  // Cleanup leftover worktree on exit
  process.on("exit", () => {
    if (currentWorktree && currentBranch) {
      try {
        cleanupWorktree(config.repoDir, currentWorktree, currentBranch);
      } catch {
        // Best effort
      }
    }
  });

  checkDeps(config, logger);

  const { agents } = config;
  const fmtStep = (s: { backend: AgentBackend; model: string }): string =>
    `${s.backend}/${s.model}`;

  logger.info("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
  logger.info(
    `  Ralph Loop (local) \u2014 target: ${config.target} harness improvements`,
  );
  logger.info(`  Branch prefix  : ${config.branchPrefix}`);
  logger.info(`  Repo           : ${config.repoDir}`);
  logger.info(`  Worktrees      : ${config.worktreeDir}`);
  logger.info(`  Max turns/step : ${config.maxTurns}`);
  logger.info(`  Max review cyc : ${config.maxReviewCycles}`);
  logger.info(`  Backlog agent  : ${fmtStep(agents.backlog)}`);
  logger.info(`  Plan agent     : ${fmtStep(agents.plan)}`);
  logger.info(`  Impl agent     : ${fmtStep(agents.implement)}`);
  logger.info(`  Review agent   : ${fmtStep(agents.review)}`);
  if (config.task) logger.info(`  Task           : ${config.task}`);
  logger.info(`  Backlog        : ${readBacklog().length} tasks`);
  logger.info("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");

  let completed = countCompleted(config.repoDir);
  logger.info(`Already completed: ${completed}/${config.target}`);
  logger.info(`Backlog           : ${backlogPath()}`);

  let consecutiveFailures = 0;

  while (completed < config.target) {
    if (abortController.signal.aborted) break;

    // ── Resolve task for this iteration ──
    // Priority: --task flag > backlog > refill backlog then pop
    let task: string | undefined = config.task;

    if (!task) {
      const backlog = readBacklog();
      if (backlog.length === 0) {
        // Backlog is empty — run refill session
        logger.heading("Backlog empty — refilling with 10 tasks...");
        const refillResult = await runStep({
          prompt: buildBacklogRefillPrompt(),
          stepName: "backlog-refill",
          improvement: completed,
          cwd: config.repoDir,
          model: config.agents.backlog.model,
          backend: config.agents.backlog.backend,
          config,
          logger,
          abortController,
        });

        if (!refillResult.success) {
          logger.error("Backlog refill failed");
          process.exit(1);
        }

        const newBacklog = readBacklog();
        logger.success(`Backlog refilled: ${newBacklog.length} tasks`);
        for (const t of newBacklog) {
          logger.info(`  - ${t}`);
        }

        if (newBacklog.length === 0) {
          logger.error("Refill produced no tasks — stopping.");
          process.exit(1);
        }
      }

      task = popTask();
      if (task) {
        const remaining = readBacklog().length;
        logger.info(`Popped task from backlog (${remaining} remaining): ${task}`);
      }
    }

    const next = completed + 1;
    const success = await ralphLoopSingle(
      next,
      config,
      logger,
      abortController,
      task,
    );

    if (success) {
      completed++;
      consecutiveFailures = 0;
      logger.success(`Progress: ${completed}/${config.target} \u2713`);
    } else {
      consecutiveFailures++;
      logger.warn(
        `Improvement #${next} failed (consecutive failures: ${consecutiveFailures})`,
      );
      if (consecutiveFailures >= 3) {
        logger.error("3 consecutive failures \u2014 stopping.");
        process.exit(1);
      }
      logger.info("Continuing to next improvement...");
    }

    // Small delay between improvements
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  logger.info("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
  logger.success(
    `  \u2713 Done! ${config.target} harness improvements shipped locally.`,
  );
  logger.info("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
