import { cleanupWorktree } from "./git.js";
import { Logger } from "./log.js";
import { ensurePullRequestMergeable, mergePullRequest } from "./pr.js";

export interface MergeJob {
  repoDir: string;
  worktreePath: string;
  branchName: string;
  prNumber: number;
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
 * This serializes final PR decisions to avoid noisy concurrent merge actions.
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
    const { repoDir, worktreePath, branchName, prNumber, improvement, worker, logger } = job;

    logger.jsonl({
      event: "merge_queued",
      worker,
      improvement,
      branch: branchName,
      ts: new Date().toISOString(),
    });

    logger.info(
      `[5/5] Ensuring mergeability + deciding merge for PR #${prNumber} (${branchName})...`,
    );

    const mergeable = ensurePullRequestMergeable(
      worktreePath,
      branchName,
      prNumber,
    );
    const success = mergeable && mergePullRequest(repoDir, prNumber);

    if (success) {
      cleanupWorktree(repoDir, worktreePath, branchName);
      logger.success(`Merge decision: merged PR #${prNumber}`);
    } else if (!mergeable) {
      logger.error(
        `Merge decision: PR #${prNumber} is still not mergeable after syncing with main; worktree preserved at: ${worktreePath}`,
      );
    } else {
      logger.error(
        `Merge decision: escalated to human review (PR #${prNumber}); worktree preserved at: ${worktreePath}`,
      );
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
