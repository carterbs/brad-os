import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import type { AgentBackend, AgentConfig, Config } from "./types.js";

const REPO_DIR = "/Users/bradcarter/Documents/Dev/brad-os";
const WORKTREE_DIR = "/tmp/brad-os-ralph-worktrees";

const DEFAULT_MODELS: Record<AgentBackend, { plan: string; exec: string }> = {
  claude: { plan: "claude-opus-4-6", exec: "claude-sonnet-4-6" },
  codex: { plan: "gpt-5.3-codex", exec: "gpt-5.3-codex-spark" },
};

interface RalphConfigFile {
  target?: number;
  branchPrefix?: string;
  parallelism?: number;
  maxTurns?: number;
  maxReviewCycles?: number;
  verbose?: boolean;
  agent?: AgentBackend;
  agents?: Partial<Record<"backlog" | "plan" | "implement" | "review", { backend?: AgentBackend; model?: string }>>;
}

function loadConfigFile(repoDir: string): RalphConfigFile | undefined {
  const configPath = join(repoDir, "ralph.config.json");
  try {
    const raw = readFileSync(configPath, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return undefined;
    return parsed as RalphConfigFile;
  } catch {
    return undefined;
  }
}

export function resolveConfig(): Config {
  const { values } = parseArgs({
    options: {
      target: { type: "string" },
      "branch-prefix": { type: "string" },
      "max-turns": { type: "string" },
      parallelism: { type: "string" },
      verbose: { type: "boolean", default: false },
      task: { type: "string" },
      config: { type: "string" },
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

  // Load config file (CLI --config overrides default location)
  const repoDir = REPO_DIR;
  const configFile = loadConfigFile(
    values.config ? String(values.config) : repoDir,
  );

  // Merge: defaults -> config file -> CLI flags (CLI wins)
  function resolveStep(
    stepName: "backlog" | "plan" | "implement" | "review",
    stepAgent: string | undefined,
    stepModel: string | undefined,
    role: "plan" | "exec",
  ): { backend: AgentBackend; model: string } {
    // CLI step-specific > CLI global > config file step-specific > config file global > default
    const cfgStep = configFile?.agents?.[stepName];
    const backend: AgentBackend =
      (stepAgent as AgentBackend) ??
      (values.agent as AgentBackend) ??
      (cfgStep?.backend as AgentBackend) ??
      configFile?.agent ??
      "claude";
    const baseModel = DEFAULT_MODELS[backend][role];
    const model =
      stepModel ??
      cfgStep?.model ??
      baseModel;
    return { backend, model };
  }

  const agents: AgentConfig = {
    backlog: resolveStep("backlog", values["backlog-agent"] as string | undefined, values["backlog-model"] as string | undefined, "plan"),
    plan: resolveStep("plan", values["plan-agent"] as string | undefined, values["plan-model"] as string | undefined, "plan"),
    implement: resolveStep("implement", values["impl-agent"] as string | undefined, values["impl-model"] as string | undefined, "exec"),
    review: resolveStep("review", values["review-agent"] as string | undefined, values["review-model"] as string | undefined, "exec"),
  };

  const target = values.target !== undefined
    ? parseInt(values.target as string, 10)
    : configFile?.target;

  let parallelism = values.parallelism !== undefined
    ? parseInt(values.parallelism as string, 10)
    : configFile?.parallelism ?? 2;

  // Force parallelism: 1 when --task is set (same task in N workers is pointless)
  if (values.task) {
    parallelism = 1;
  }

  return {
    target,
    parallelism,
    branchPrefix: (values["branch-prefix"] as string) ?? configFile?.branchPrefix ?? "harness-improvement",
    maxTurns: values["max-turns"] !== undefined
      ? parseInt(values["max-turns"] as string, 10)
      : configFile?.maxTurns ?? 100,
    verbose: (values.verbose as boolean) || configFile?.verbose || false,
    task: values.task as string | undefined,
    repoDir,
    worktreeDir: WORKTREE_DIR,
    maxReviewCycles: configFile?.maxReviewCycles ?? 4,
    logFile: `${repoDir}/ralph-loop.jsonl`,
    agents,
  };
}
