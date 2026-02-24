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
  buildFixPrompt,
} from "./prompts.js";
import {
  createWorktree,
  cleanupWorktree,
  mergeToMain,
  countCompleted,
  commitAll,
  hasNewCommits,
} from "./git.js";
import { readBacklog, peekTask, popTask, backlogPath } from "./backlog.js";
import type { AgentBackend, AgentConfig, Config, StepSummary } from "./types.js";

const REPO_DIR = "/Users/bradcarter/Documents/Dev/brad-os";
const WORKTREE_DIR = "/tmp/brad-os-ralph-worktrees";

const DEFAULT_MODELS: Record<AgentBackend, { plan: string; exec: string }> = {
  claude: { plan: "claude-opus-4-6", exec: "claude-sonnet-4-6" },
  codex: { plan: "gpt-5.3-codex", exec: "gpt-5.3-codex-spark" },
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

  // Create or resume worktree
  const wtResult = createWorktree(
    config.repoDir,
    config.worktreeDir,
    worktreePath,
    branchName,
  );
  if (!wtResult.created) {
    logger.error("Failed to create worktree");
    return false;
  }

  if (wtResult.resumed) {
    logger.info(`Resuming from existing branch ${branchName}`);
  }

  // Track current worktree for exit cleanup
  currentWorktree = worktreePath;
  currentBranch = branchName;

  const cleanupFull = (): void => {
    cleanupWorktree(config.repoDir, worktreePath, branchName);
    currentWorktree = undefined;
    currentBranch = undefined;
  };

  const clearTracking = (): void => {
    currentWorktree = undefined;
    currentBranch = undefined;
  };

  try {
    const stepResults: StepSummary[] = [];

    // ── 1. Planning (skip if resuming — plan already exists) ──
    const taskText = config.task ?? currentTask;
    let planSummary = "";

    if (wtResult.resumed) {
      logger.info("[1/4] Skipping planning (resuming from prior work)");
    } else if (taskText) {
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
        logger.info(`  Worktree preserved at: ${worktreePath}`);
        clearTracking();
        return false;
      }

      if (
        !existsSync(
          `${worktreePath}/thoughts/shared/plans/active/ralph-improvement.md`,
        )
      ) {
        logger.error("Planning agent failed to create ralph-improvement.md");
        logger.info(`  Worktree preserved at: ${worktreePath}`);
        clearTracking();
        return false;
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
        logger.info(`  Worktree preserved at: ${worktreePath}`);
        clearTracking();
        return false;
      }

      if (
        !existsSync(
          `${worktreePath}/thoughts/shared/plans/active/ralph-improvement.md`,
        )
      ) {
        logger.error("Planning agent failed to create ralph-improvement.md");
        logger.info(`  Worktree preserved at: ${worktreePath}`);
        clearTracking();
        return false;
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
        logger.info(`  Worktree preserved at: ${worktreePath}`);
        clearTracking();
        return false;
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

    // Build descriptive commit message from plan + implementation output
    const commitTitle = planSummary || `harness: improvement #${n}`;
    const commitBody = doneSummary ? `\n${doneSummary}` : "";
    const commitMsg = `${commitTitle}${commitBody}`;

    // Commit implementation (codex may have already committed its own changes)
    if (!commitAll(worktreePath, commitMsg)) {
      // Check if the agent already made commits on this branch
      if (!hasNewCommits(worktreePath)) {
        logger.error("No changes produced");
        logger.info(`  Worktree preserved at: ${worktreePath}`);
        clearTracking();
        return false;
      }
    }

    // ── 3. Review loop (review → fix → re-review) ──
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
        clearTracking();
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

      // Commit any direct review fixes
      commitAll(
        worktreePath,
        `${commitTitle} \u2014 review fixes (cycle ${cycle})`,
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
        // Feed review findings back to a fix agent before retrying review
        logger.warn("Reviewer found issues — running fix step...");
        const fixResult = await runStep({
          prompt: buildFixPrompt(reviewResult.outputText),
          stepName: "implement",
          improvement: n,
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

        // Accumulate fix stats into review totals
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
        // Ambiguous — fall back to running validation directly
        logger.warn(
          "Ambiguous review output, running validation as fallback...",
        );
        if (runValidation(worktreePath)) {
          passed = true;
        } else {
          // Validation failed with no review text — run fix with validation error context
          logger.warn("Validation failed — running fix step...");
          const fixResult = await runStep({
            prompt: buildFixPrompt(
              "Review output was ambiguous, but npm run validate failed. " +
                "Run npm run validate, read the error output, and fix all issues.",
            ),
            stepName: "implement",
            improvement: n,
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
      clearTracking();
      return false;
    }

    // Cleanup worktree (only after successful merge)
    cleanupFull();

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
    logger.info(`  Worktree preserved at: ${worktreePath}`);
    logger.jsonl({
      event: "improvement_failed",
      improvement: n,
      reason: errMsg,
      ts: new Date().toISOString(),
    });
    // Preserve worktree — don't clean up, next attempt will resume
    clearTracking();
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

  // On exit, only clean up worktrees with no commits (nothing to preserve)
  process.on("exit", () => {
    if (currentWorktree && currentBranch) {
      if (hasNewCommits(currentWorktree)) {
        console.error(
          `Worktree preserved (has commits): ${currentWorktree}`,
        );
      } else {
        try {
          cleanupWorktree(config.repoDir, currentWorktree, currentBranch);
        } catch {
          // Best effort
        }
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

      task = peekTask();
      if (task) {
        const remaining = readBacklog().length;
        logger.info(`Next task from backlog (${remaining} total): ${task}`);
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
      // Pop task from backlog only after successful merge
      if (!config.task && task) {
        popTask();
        logger.info(`Task removed from backlog after successful merge`);
      }
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
