import { query } from "@anthropic-ai/claude-agent-sdk";
import type {
  HookCallback,
  SDKMessage,
  SDKResultSuccess,
  SDKResultError,
  SDKCompactBoundaryMessage,
  SDKAssistantMessage,
  PreToolUseHookInput,
  PostToolUseHookInput,
} from "@anthropic-ai/claude-agent-sdk";
import { relative } from "node:path";
import type { Config, StepName, StepResult } from "./types.js";
import type { Logger } from "./log.js";

function summarizeToolInput(
  toolName: string,
  input: Record<string, unknown>,
  cwd: string,
): string {
  switch (toolName) {
    case "Read":
    case "Write":
    case "Edit":
      return typeof input.file_path === "string"
        ? relative(cwd, input.file_path)
        : "";
    case "Grep": {
      const pattern = typeof input.pattern === "string" ? input.pattern : "";
      const path =
        typeof input.path === "string" ? relative(cwd, input.path) : ".";
      return `"${pattern}" in ${path}`;
    }
    case "Glob":
      return typeof input.pattern === "string" ? input.pattern : "";
    case "Bash": {
      const cmd = typeof input.command === "string" ? input.command : "";
      return cmd.length > 60 ? cmd.slice(0, 60) + "..." : cmd;
    }
    case "Task":
      return typeof input.description === "string" ? input.description : "";
    default:
      return "";
  }
}

export interface RunStepOptions {
  prompt: string;
  stepName: StepName;
  improvement: number;
  cwd: string;
  model: string;
  config: Config;
  logger: Logger;
  abortController: AbortController;
}

export async function runStep(options: RunStepOptions): Promise<StepResult> {
  const { prompt, stepName, improvement, cwd, model, config, logger, abortController } =
    options;
  const startTime = Date.now();

  logger.jsonl({
    event: "step_start",
    improvement,
    step: stepName,
    ts: new Date().toISOString(),
  });

  const preToolHook: HookCallback = async (input) => {
    const hook = input as PreToolUseHookInput;
    const toolName = hook.tool_name ?? "unknown";
    const toolInput = (hook.tool_input as Record<string, unknown>) ?? {};
    const summary = summarizeToolInput(toolName, toolInput, cwd);
    logger.tool(toolName, summary);
    logger.jsonl({
      event: "tool_call",
      tool: toolName,
      summary,
      step: stepName,
      ts: new Date().toISOString(),
    });
    return {};
  };

  const postToolHook: HookCallback = async (input) => {
    const hook = input as PostToolUseHookInput;
    const toolName = hook.tool_name ?? "unknown";
    logger.jsonl({
      event: "tool_result",
      tool: toolName,
      step: stepName,
      ts: new Date().toISOString(),
    });
    return {};
  };

  try {
    let resultMessage: SDKResultSuccess | SDKResultError | undefined;

    for await (const message of query({
      prompt,
      options: {
        model,
        maxTurns: config.maxTurns,
        cwd,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        disallowedTools: ["WebSearch", "WebFetch"],
        settingSources: ["project"],
        abortController,
        persistSession: false,
        sandbox: {
          enabled: true,
          autoAllowBashIfSandboxed: true,
          allowUnsandboxedCommands: false,
          network: { allowedDomains: [] },
        },
        hooks: {
          PreToolUse: [{ hooks: [preToolHook] }],
          PostToolUse: [{ hooks: [postToolHook] }],
        },
      },
    })) {
      const msg = message as SDKMessage;

      // Result message — final output
      if (msg.type === "result") {
        resultMessage = msg as SDKResultSuccess | SDKResultError;
      }

      // Compaction warning
      if (
        msg.type === "system" &&
        (msg as SDKCompactBoundaryMessage).subtype === "compact_boundary"
      ) {
        const compact = msg as SDKCompactBoundaryMessage;
        logger.compaction(compact.compact_metadata.pre_tokens);
        logger.jsonl({
          event: "compaction",
          pre_tokens: compact.compact_metadata.pre_tokens,
          step: stepName,
          ts: new Date().toISOString(),
        });
      }

      // Verbose: show assistant reasoning
      if (msg.type === "assistant" && config.verbose) {
        const assistantMsg = msg as SDKAssistantMessage;
        const textBlock = assistantMsg.message?.content?.find(
          (b: { type: string }) => b.type === "text",
        );
        if (textBlock && "text" in textBlock) {
          const text = textBlock.text as string;
          if (text.length > 0) {
            logger.verboseMsg(text.slice(0, 200));
          }
        }
      }
    }

    const durationMs = Date.now() - startTime;

    if (!resultMessage) {
      logger.error(`Step ${stepName}: no result message received`);
      return {
        success: false,
        turns: 0,
        costUsd: 0,
        inputTokens: 0,
        outputTokens: 0,
        durationMs,
        outputText: "",
      };
    }

    const isSuccess = resultMessage.subtype === "success";
    const turns = resultMessage.num_turns;
    const costUsd = resultMessage.total_cost_usd;
    const inputTokens = resultMessage.usage.input_tokens;
    const outputTokens = resultMessage.usage.output_tokens;
    const outputText =
      isSuccess ? (resultMessage as SDKResultSuccess).result : "";

    if (!isSuccess) {
      const errorResult = resultMessage as SDKResultError;
      logger.error(
        `Step ${stepName} ended with ${errorResult.subtype}: ${errorResult.errors.join(", ")}`,
      );
    }

    logger.jsonl({
      event: "step_end",
      step: stepName,
      turns,
      cost_usd: costUsd,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      duration_ms: durationMs,
      ts: new Date().toISOString(),
    });

    return {
      success: isSuccess,
      turns,
      costUsd,
      inputTokens,
      outputTokens,
      durationMs,
      outputText,
    };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error(`Step ${stepName} threw: ${errMsg}`);
    logger.jsonl({
      event: "error",
      message: errMsg,
      ts: new Date().toISOString(),
    });
    return {
      success: false,
      turns: 0,
      costUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      durationMs,
      outputText: "",
    };
  }
}
