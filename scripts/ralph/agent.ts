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
import { spawn } from "node:child_process";
import { readFileSync, unlinkSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { relative } from "node:path";
import type { AgentBackend, Config, StepName, StepResult } from "./types.js";
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
      let cmd = typeof input.command === "string" ? input.command : "";
      // Strip shell wrapper (e.g. `/bin/zsh -lc "actual command"`)
      const shellMatch = cmd.match(/^\/bin\/(?:zsh|bash|sh)\s+-lc\s+(['"])(.*)\1$/s);
      if (shellMatch?.[2]) cmd = shellMatch[2];
      // Make paths relative to cwd
      if (cwd && cmd.includes(cwd)) cmd = cmd.replaceAll(cwd + "/", "");
      return cmd.length > 80 ? cmd.slice(0, 80) + "…" : cmd;
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
  backend: AgentBackend;
  config: Config;
  logger: Logger;
  abortController: AbortController;
}

function extractTextContent(value: unknown, depth: number = 0): string {
  if (depth > 5 || value == null) return "";
  if (typeof value === "string") return value;

  if (Array.isArray(value)) {
    return value
      .map((v) => extractTextContent(v, depth + 1))
      .filter((v) => v.length > 0)
      .join("\n");
  }

  if (typeof value !== "object") return "";
  const obj = value as Record<string, unknown>;

  const textKeys = [
    "text",
    "output_text",
    "last_agent_message",
    "review_output",
    "message",
    "content",
    "final_answer",
    "summary_text",
  ];

  const parts: string[] = [];
  for (const key of textKeys) {
    const text = extractTextContent(obj[key], depth + 1);
    if (text.length > 0) parts.push(text);
  }

  return parts.join("\n");
}

export async function runStep(options: RunStepOptions): Promise<StepResult> {
  switch (options.backend) {
    case "claude":
      return runStepClaude(options);
    case "codex":
      return runStepCodex(options);
  }
}

async function runStepClaude(options: RunStepOptions): Promise<StepResult> {
  const { prompt, stepName, improvement, cwd, model, config, logger, abortController } =
    options;
  const startTime = Date.now();

  logger.jsonl({
    event: "step_start",
    improvement,
    step: stepName,
    backend: "claude",
    ts: new Date().toISOString(),
  });
  logger.setStep(stepName);

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
        backend: "claude",
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
      backend: "claude",
      turns,
      cost_usd: costUsd,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      duration_ms: durationMs,
      ts: new Date().toISOString(),
    });

    return {
      success: isSuccess,
      backend: "claude",
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
      backend: "claude",
      turns: 0,
      costUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      durationMs,
      outputText: "",
    };
  } finally {
    logger.clearStep();
  }
}

async function runStepCodex(options: RunStepOptions): Promise<StepResult> {
  const { prompt, stepName, improvement, cwd, model, config, logger, abortController } =
    options;
  const startTime = Date.now();

  logger.jsonl({
    event: "step_start",
    improvement,
    step: stepName,
    backend: "codex",
    ts: new Date().toISOString(),
  });
  logger.setStep(stepName);

  const tmpDir = mkdtempSync(join(tmpdir(), "ralph-codex-"));
  const outputFile = join(tmpDir, "output.txt");

  const args = [
    "exec",
    "--dangerously-bypass-approvals-and-sandbox",
    "--json",
    "--model", model,
    "-C", cwd,
    "-o", outputFile,
    "-",  // read prompt from stdin
  ];

  return new Promise<StepResult>((resolve) => {
    const child = spawn("codex", args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stderr = "";
    let stdoutBuf = "";
    let turns = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let lastAgentMessage = "";
    let sawTurnCompleted = false;
    let sawTurnFailed = false;
    let spawnError = "";
    const streamErrors: string[] = [];

    const processJsonLine = (line: string): void => {
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(line) as Record<string, unknown>;
      } catch {
        return;
      }

      const type = event.type as string;
      const item = event.item as Record<string, unknown> | undefined;
      const reviewOutput = extractTextContent(event.review_output);

      if (type === "item.started" && item?.type === "command_execution") {
        const cmd = (item.command as string) ?? "";
        const summary = cmd.length > 60 ? cmd.slice(0, 60) + "..." : cmd;
        logger.tool("Bash", summary);
        logger.jsonl({
          event: "tool_call",
          tool: "Bash",
          summary,
          step: stepName,
          ts: new Date().toISOString(),
        });
      }

      if (type === "item.completed" && item?.type === "command_execution") {
        logger.jsonl({
          event: "tool_result",
          tool: "Bash",
          step: stepName,
          ts: new Date().toISOString(),
        });
      }

      // Capture every agent/review message — last one wins as outputText fallback
      if (
        type === "item.completed" &&
        (item?.type === "agent_message" || item?.type === "review_output")
      ) {
        const text = extractTextContent(item);
        if (text.length > 0) {
          lastAgentMessage = text;
          if (config.verbose) {
            logger.verboseMsg(text.slice(0, 200));
          }
        }
      }

      if (type === "review_output" && reviewOutput.length > 0) {
        lastAgentMessage = reviewOutput;
      }

      if (type === "turn.completed") {
        sawTurnCompleted = true;
        turns++;
        const usage = event.usage as Record<string, number> | undefined;
        if (usage) {
          inputTokens += usage.input_tokens ?? 0;
          outputTokens += usage.output_tokens ?? 0;
        }

        const turnText = extractTextContent(event.last_agent_message);
        if (turnText.length > 0) {
          lastAgentMessage = turnText;
        }
      }

      if (type === "turn.failed") {
        sawTurnFailed = true;
        const turnError = event.error as Record<string, unknown> | undefined;
        const errMsg =
          (typeof turnError?.message === "string" && turnError.message) ||
          (typeof event.message === "string" && event.message) ||
          "turn.failed";
        streamErrors.push(errMsg);
      }

      if (type === "error") {
        const errMsg = event.message as string | undefined;
        if (typeof errMsg === "string" && errMsg.length > 0) {
          streamErrors.push(errMsg);
        }
      }
    };

    // Pipe prompt via stdin to avoid ARG_MAX limits
    child.stdin.write(prompt);
    child.stdin.end();

    // Parse JSONL events from stdout (--json mode)
    child.stdout?.on("data", (data: Buffer) => {
      stdoutBuf += data.toString();
      const lines = stdoutBuf.split("\n");
      stdoutBuf = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim()) processJsonLine(line);
      }
    });

    child.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
      if (config.verbose) {
        const text = data.toString().trim();
        if (text.length > 0) {
          logger.verboseMsg(text.slice(0, 200));
        }
      }
    });

    // Wire abort signal to kill child process
    const onAbort = (): void => {
      child.kill("SIGTERM");
    };
    abortController.signal.addEventListener("abort", onAbort);

    child.on("error", (err: Error) => {
      spawnError = err.message;
      streamErrors.push(err.message);
    });

    child.on("close", (code) => {
      abortController.signal.removeEventListener("abort", onAbort);

      // Process any remaining buffered stdout
      if (stdoutBuf.trim()) processJsonLine(stdoutBuf);

      const durationMs = Date.now() - startTime;
      const success =
        !abortController.signal.aborted &&
        code === 0 &&
        !sawTurnFailed &&
        !spawnError &&
        (sawTurnCompleted || lastAgentMessage.length > 0);

      // Prefer -o file, fall back to last agent_message from JSONL stream
      let outputText = "";
      try {
        outputText = readFileSync(outputFile, "utf-8");
      } catch {
        // Output file may not exist if codex failed early
      }
      if (!outputText.trim() && lastAgentMessage) {
        outputText = lastAgentMessage;
      }

      try {
        unlinkSync(outputFile);
      } catch { /* ignore */ }

      if (!success) {
        const errorLines = stderr
          .split("\n")
          .filter((line) => /^(ERROR|error|Warning|Reconnecting|fatal)/i.test(line.trim()))
          .join("\n");
        const streamed = streamErrors.filter(Boolean).join("\n");
        const fallback = stderr.slice(-500);
        const errorDetail = [streamed, errorLines, fallback]
          .filter((s) => s.length > 0)
          .join("\n");
        logger.error(
          `Step ${stepName} (codex) failed (code=${code}, turn_completed=${sawTurnCompleted}, turn_failed=${sawTurnFailed})`,
        );
        for (const line of errorDetail.split("\n").filter(Boolean)) {
          logger.error(`  ${line}`);
        }
      }

      logger.jsonl({
        event: "step_end",
        step: stepName,
        backend: "codex",
        turns,
        cost_usd: 0,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        duration_ms: durationMs,
        ts: new Date().toISOString(),
      });

      logger.clearStep();
      resolve({
        success,
        backend: "codex",
        turns,
        costUsd: 0,
        inputTokens,
        outputTokens,
        durationMs,
        outputText,
      });
    });
  });
}
