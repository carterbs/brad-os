export type StepName =
  | "plan"
  | "implement"
  | "self-review"
  | "agent-review"
  | "merge";

export interface Config {
  target: number;
  branchPrefix: string;
  maxTurns: number;
  verbose: boolean;
  task?: string;
  repoDir: string;
  worktreeDir: string;
  maxReviewCycles: number;
  logFile: string;
}

export type LogEvent =
  | {
      event: "step_start";
      improvement: number;
      step: StepName;
      ts: string;
    }
  | {
      event: "tool_call";
      tool: string;
      summary: string;
      step: StepName;
      ts: string;
    }
  | { event: "tool_result"; tool: string; step: StepName; ts: string }
  | {
      event: "compaction";
      pre_tokens: number;
      step: StepName;
      ts: string;
    }
  | {
      event: "step_end";
      step: StepName;
      turns: number;
      cost_usd: number;
      input_tokens: number;
      output_tokens: number;
      duration_ms: number;
      ts: string;
    }
  | {
      event: "improvement_done";
      improvement: number;
      total_cost_usd: number;
      total_duration_ms: number;
      ts: string;
    }
  | {
      event: "improvement_failed";
      improvement: number;
      reason: string;
      ts: string;
    }
  | { event: "error"; message: string; ts: string };

export interface StepResult {
  success: boolean;
  turns: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  outputText: string;
}

export interface StepSummary {
  step: StepName;
  turns: number;
  costUsd: number;
  tokens: number;
  durationMs: number;
}
