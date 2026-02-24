import { appendFileSync } from "node:fs";
import type { AgentBackend, LogEvent, StepName, StepSummary } from "./types.js";

const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const BOLD = "\x1b[1m";

function ts(): string {
  return new Date().toLocaleTimeString("en-US", { hour12: false });
}

function formatCost(backend: AgentBackend, costUsd: number, tokens: number): string {
  if (backend === "codex") return "N/A";
  return `$${costUsd.toFixed(2)}, ${Math.round(tokens / 1000)}k tok`;
}

export class Logger {
  constructor(
    private readonly jsonlPath: string,
    private readonly verbose: boolean = false,
  ) {}

  info(msg: string): void {
    console.log(`${DIM}[${ts()}]${RESET} ${msg}`);
  }

  warn(msg: string): void {
    console.log(`${DIM}[${ts()}]${RESET} ${YELLOW}${msg}${RESET}`);
  }

  error(msg: string): void {
    console.error(`${DIM}[${ts()}]${RESET} ${RED}${msg}${RESET}`);
  }

  success(msg: string): void {
    console.log(`${DIM}[${ts()}]${RESET} ${GREEN}${msg}${RESET}`);
  }

  tool(name: string, summary: string): void {
    console.log(
      `${DIM}[${ts()}]${RESET}   ${CYAN}${name.padEnd(6)}${RESET} ${summary}`,
    );
  }

  verboseMsg(msg: string): void {
    if (this.verbose) {
      console.log(`${DIM}[${ts()}]   ${msg}${RESET}`);
    }
  }

  heading(msg: string): void {
    console.log(`${DIM}[${ts()}]${RESET} ${BOLD}${msg}${RESET}`);
  }

  compaction(preTokens: number): void {
    const k = Math.round(preTokens / 1000);
    this.warn(`  \u26A0 Context compacted (${k}k tokens)`);
  }

  jsonl(event: LogEvent): void {
    appendFileSync(this.jsonlPath, JSON.stringify(event) + "\n");
  }

  stepSummary(
    step: StepName,
    r: { backend: AgentBackend; turns: number; costUsd: number; tokens: number; durationMs: number },
  ): void {
    const secs = Math.round(r.durationMs / 1000);
    const cost = formatCost(r.backend, r.costUsd, r.tokens);
    this.info(
      `  \u2713 ${step} done (${secs}s, ${r.turns} turns, ${cost})`,
    );
  }

  improvementSummary(n: number, steps: StepSummary[]): void {
    const totalTurns = steps.reduce((s, r) => s + r.turns, 0);
    const totalCost = steps.reduce((s, r) => s + r.costUsd, 0);
    const totalTokens = steps.reduce((s, r) => s + r.tokens, 0);
    const totalDuration = steps.reduce((s, r) => s + r.durationMs, 0);
    const hasAnyCost = steps.some((s) => s.backend === "claude");

    const line = (msg: string): void => {
      console.log(`${DIM}[${ts()}]${RESET} ${msg}`);
    };

    line("\u250F\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501");
    line(`\u2503 ${BOLD}Improvement #${n} complete${RESET}`);

    for (const s of steps) {
      const secs = Math.round(s.durationMs / 1000);
      const label = (s.step + ":").padEnd(15);
      if (s.backend === "codex") {
        line(
          `\u2503 ${label} ${String(secs).padStart(4)}s ${String(s.turns).padStart(4)} turns  ${" N/A".padStart(6)}  ${"N/A".padStart(8)}  [codex]`,
        );
      } else {
        const tok = Math.round(s.tokens / 1000);
        line(
          `\u2503 ${label} ${String(secs).padStart(4)}s ${String(s.turns).padStart(4)} turns  $${s.costUsd.toFixed(2).padStart(5)}  ${String(tok).padStart(4)}k tok`,
        );
      }
    }

    const totalSecs = Math.round(totalDuration / 1000);
    if (hasAnyCost) {
      const totalTok = Math.round(totalTokens / 1000);
      line(
        `\u2503 ${"Total:".padEnd(15)} ${String(totalSecs).padStart(4)}s ${String(totalTurns).padStart(4)} turns  $${totalCost.toFixed(2).padStart(5)}  ${String(totalTok).padStart(4)}k tok`,
      );
    } else {
      line(
        `\u2503 ${"Total:".padEnd(15)} ${String(totalSecs).padStart(4)}s ${String(totalTurns).padStart(4)} turns`,
      );
    }
    line("\u2517\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501");
  }
}
