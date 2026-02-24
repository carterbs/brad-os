export type StepName =
  | "backlog-refill"
  | "plan"
  | "implement"
  | "review"
  | "merge";

export type AgentBackend = "claude" | "codex";

export interface StepAgentConfig {
  backend: AgentBackend;
  model: string;
}

export interface AgentConfig {
  backlog: StepAgentConfig;
  plan: StepAgentConfig;
  implement: StepAgentConfig;
  review: StepAgentConfig;
}

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
  agents: AgentConfig;
}

export type LogEvent =
  | {
      event: "step_start";
      improvement: number;
      step: StepName;
      backend: AgentBackend;
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
      backend: AgentBackend;
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
  backend: AgentBackend;
  turns: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  outputText: string;
}

export interface StepSummary {
  step: StepName;
  backend: AgentBackend;
  turns: number;
  costUsd: number;
  tokens: number;
  durationMs: number;
}
