import { mergeToMain, cleanupWorktree } from "./git.js";
import { Logger } from "./log.js";

export interface MergeJob {
  repoDir: string;
  worktreePath: string;
  branchName: string;
  improvement: number;
  worker: number;
  logger: Logger;
}

export interface MergeResult {
  success: boolean;
  improvement: number;
  worker: number;
  branchName: string;
}

/**
 * Sequential merge queue using chained promises.
 * Each enqueue() call chains onto the previous, ensuring FIFO order.
 * This prevents merge conflicts from concurrent merges to main.
 */
export class MergeQueue {
  private chain: Promise<void> = Promise.resolve();

  enqueue(job: MergeJob): Promise<MergeResult> {
    return new Promise<MergeResult>((resolve) => {
      this.chain = this.chain.then(async () => {
        const result = await this.processJob(job);
        resolve(result);
      });
    });
  }

  private async processJob(job: MergeJob): Promise<MergeResult> {
    const { repoDir, worktreePath, branchName, improvement, worker, logger } = job;

    logger.jsonl({
      event: "merge_queued",
      worker,
      improvement,
      branch: branchName,
      ts: new Date().toISOString(),
    });

    logger.info(`[4/4] Merging ${branchName} to main...`);

    const success = mergeToMain(repoDir, branchName);

    if (success) {
      cleanupWorktree(repoDir, worktreePath, branchName);
      logger.success(`Merged ${branchName} to main`);
    } else {
      logger.error(`Merge conflict \u2014 worktree preserved at: ${worktreePath}`);
    }

    logger.jsonl({
      event: "merge_completed",
      worker,
      improvement,
      branch: branchName,
      success,
      ts: new Date().toISOString(),
    });

    return { success, improvement, worker, branchName };
  }
}
