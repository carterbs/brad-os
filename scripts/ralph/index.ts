import { parseArgs } from "node:util";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { Logger } from "./log.js";
import { runStep } from "./agent.js";
import {
  buildPlanPrompt,
  buildImplPrompt,
  buildSelfReviewPrompt,
  buildAgentReviewPrompt,
} from "./prompts.js";
import {
  createWorktree,
  cleanupWorktree,
  mergeToMain,
  countCompleted,
  commitAll,
} from "./git.js";
import type { Config, StepSummary } from "./types.js";

const REPO_DIR = "/Users/bradcarter/Documents/Dev/brad-os";
const WORKTREE_DIR = "/tmp/brad-os-ralph-worktrees";

function parseCliArgs(): Config {
  const { values } = parseArgs({
    options: {
      target: { type: "string", default: "15" },
      "branch-prefix": { type: "string", default: "harness-improvement" },
      "max-turns": { type: "string", default: "50" },
      verbose: { type: "boolean", default: false },
      task: { type: "string" },
    },
    strict: false,
  });

  return {
    target: parseInt(values.target as string, 10),
    branchPrefix: values["branch-prefix"] as string,
    maxTurns: parseInt(values["max-turns"] as string, 10),
    verbose: values.verbose as boolean,
    task: values.task as string | undefined,
    repoDir: REPO_DIR,
    worktreeDir: WORKTREE_DIR,
    maxReviewCycles: 3,
    logFile: `${REPO_DIR}/ralph-loop.jsonl`,
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

function checkDeps(logger: Logger): void {
  for (const cmd of ["claude", "git"]) {
    try {
      execFileSync("which", [cmd], { stdio: "pipe" });
    } catch {
      logger.error(`Missing dependency: ${cmd}`);
      process.exit(1);
    }
  }
}

async function ralphLoopSingle(
  n: number,
  config: Config,
  logger: Logger,
  abortController: AbortController,
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
    if (config.task) {
      logger.info("[1/5] Writing task plan (user-directed)...");
      const planDir = `${worktreePath}/thoughts/shared/plans/active`;
      mkdirSync(planDir, { recursive: true });
      writeFileSync(
        `${planDir}/ralph-improvement.md`,
        `# Task\n\n${config.task}\n`,
      );
      stepResults.push({
        step: "plan",
        turns: 0,
        costUsd: 0,
        tokens: 0,
        durationMs: 0,
      });
    } else {
      logger.info("[1/5] Planning...");
      const planResult = await runStep({
        prompt: buildPlanPrompt(n, config.target),
        stepName: "plan",
        improvement: n,
        cwd: worktreePath,
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

      // Extract plan title
      const planLine = planResult.outputText
        .split("\n")
        .find((l) => l.startsWith("PLAN:"));
      if (planLine) logger.info(`  ${planLine}`);

      const tokens = planResult.inputTokens + planResult.outputTokens;
      stepResults.push({
        step: "plan",
        turns: planResult.turns,
        costUsd: planResult.costUsd,
        tokens,
        durationMs: planResult.durationMs,
      });
      logger.stepSummary("plan", stepResults[stepResults.length - 1]);
    }

    // ── 2. Implementation ──
    logger.info("[2/5] Implementing...");
    let implResult = await runStep({
      prompt: buildImplPrompt(),
      stepName: "implement",
      improvement: n,
      cwd: worktreePath,
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

    // ── 3. Self-review ──
    logger.info("[3/5] Self-review...");
    const selfReviewResult = await runStep({
      prompt: buildSelfReviewPrompt(),
      stepName: "self-review",
      improvement: n,
      cwd: worktreePath,
      config,
      logger,
      abortController,
    });

    stepResults.push({
      step: "self-review",
      turns: selfReviewResult.turns,
      costUsd: selfReviewResult.costUsd,
      tokens: selfReviewResult.inputTokens + selfReviewResult.outputTokens,
      durationMs: selfReviewResult.durationMs,
    });
    logger.stepSummary("self-review", stepResults[stepResults.length - 1]);

    // Commit self-review fixes
    commitAll(worktreePath, `harness: improvement #${n} \u2014 self-review fixes`);

    // ── 4. Agent review loop ──
    let passed = false;
    let cycle = 0;
    const reviewAccum: StepSummary = {
      step: "agent-review",
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
        `[4/5] Agent review (cycle ${cycle}/${config.maxReviewCycles})...`,
      );
      const reviewResult = await runStep({
        prompt: buildAgentReviewPrompt(),
        stepName: "agent-review",
        improvement: n,
        cwd: worktreePath,
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
    logger.stepSummary("agent-review", reviewAccum);

    // ── 5. Merge to main ──
    logger.info("[5/5] Merging to main...");
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

  checkDeps(logger);

  logger.info("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
  logger.info(
    `  Ralph Loop (local) \u2014 target: ${config.target} harness improvements`,
  );
  logger.info(`  Branch prefix  : ${config.branchPrefix}`);
  logger.info(`  Repo           : ${config.repoDir}`);
  logger.info(`  Worktrees      : ${config.worktreeDir}`);
  logger.info(`  Max turns/step : ${config.maxTurns}`);
  logger.info(`  Max review cyc : ${config.maxReviewCycles}`);
  logger.info(`  Model          : claude-opus-4-6`);
  if (config.task) logger.info(`  Task           : ${config.task}`);
  logger.info("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");

  let completed = countCompleted(config.repoDir);
  logger.info(`Already completed: ${completed}/${config.target}`);

  let consecutiveFailures = 0;

  while (completed < config.target) {
    if (abortController.signal.aborted) break;

    const next = completed + 1;
    const success = await ralphLoopSingle(
      next,
      config,
      logger,
      abortController,
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
