import { appendFileSync } from "node:fs";
import type { AgentBackend, LogEvent, StepName, StepSummary } from "./types.js";

// ── ANSI escape codes ──

const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const BOLD = "\x1b[1m";
const MAGENTA = "\x1b[35m";
const BLUE = "\x1b[34m";
const CLEAR_LINE = "\x1b[2K\r";

// Worker slot colors — each worker gets a distinct color
const WORKER_COLORS = [GREEN, CYAN, MAGENTA, YELLOW, BLUE];

// Short labels for step names in the prefix
const STEP_LABELS: Record<StepName, string> = {
  "backlog-refill": "refill",
  plan: "plan",
  implement: "impl",
  review: "review",
  merge: "merge",
};

function ts(): string {
  return new Date().toLocaleTimeString("en-US", { hour12: false });
}

function formatCost(backend: AgentBackend, costUsd: number, tokens: number): string {
  if (backend === "codex") return "N/A";
  return `$${costUsd.toFixed(2)}, ${Math.round(tokens / 1000)}k tok`;
}

function formatElapsed(ms: number): string {
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  return `${mins}m${String(remSecs).padStart(2, "0")}s`;
}

// ── Status Bar (singleton) ──

interface WorkerState {
  step?: StepName;
  toolCalls: number;
  startTime?: number;
}

class StatusBar {
  private workers = new Map<number, WorkerState>();
  private enabled = process.stdout.isTTY ?? false;
  private timer?: NodeJS.Timeout;
  private statusVisible = false;

  start(): void {
    if (!this.enabled) return;
    this.timer = setInterval(() => this.redraw(), 1000);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    this.clearStatus();
  }

  updateWorker(slot: number, state: Partial<WorkerState>): void {
    const existing = this.workers.get(slot) ?? { toolCalls: 0 };
    this.workers.set(slot, { ...existing, ...state });
    if (this.enabled) this.redraw();
  }

  removeWorker(slot: number): void {
    this.workers.delete(slot);
    if (this.enabled) this.redraw();
  }

  /** Write a log line, clearing and redrawing the status bar around it. */
  writeLine(line: string): void {
    if (this.enabled && this.statusVisible) {
      process.stdout.write(CLEAR_LINE);
      this.statusVisible = false;
    }
    console.log(line);
    if (this.enabled) this.drawStatus();
  }

  /** Write an error line (same visual treatment, just goes through stderr). */
  writeError(line: string): void {
    if (this.enabled && this.statusVisible) {
      process.stdout.write(CLEAR_LINE);
      this.statusVisible = false;
    }
    console.error(line);
    if (this.enabled) this.drawStatus();
  }

  private clearStatus(): void {
    if (this.statusVisible) {
      process.stdout.write(CLEAR_LINE);
      this.statusVisible = false;
    }
  }

  private redraw(): void {
    if (!this.enabled || this.workers.size === 0) return;
    this.clearStatus();
    this.drawStatus();
  }

  private drawStatus(): void {
    if (this.workers.size === 0) return;

    const now = Date.now();
    const parts: string[] = [];

    const sortedSlots = [...this.workers.keys()].sort();
    for (const slot of sortedSlots) {
      const w = this.workers.get(slot)!;
      const color = WORKER_COLORS[slot % WORKER_COLORS.length];
      const step = w.step ? STEP_LABELS[w.step] : "idle";
      const elapsed = w.startTime ? formatElapsed(now - w.startTime) : "\u2014";
      const tools = w.toolCalls > 0 ? ` ${w.toolCalls}t` : "";
      parts.push(`${color}W${slot}${RESET} ${step} ${DIM}${elapsed}${tools}${RESET}`);
    }

    const line = `${DIM}\u2500\u2500${RESET} ${parts.join(`${DIM} \u2502 ${RESET}`)}`;
    process.stdout.write(line);
    this.statusVisible = true;
  }
}

export const statusBar = new StatusBar();

// ── Tool call grouping ──

interface PendingToolGroup {
  name: string;
  summaries: string[];
  firstTs: number;
}

// ── Logger ──

export class Logger {
  private readonly workerSlot?: number;
  private step?: StepName;
  private pendingGroup: PendingToolGroup | null = null;
  private flushTimer?: ReturnType<typeof setTimeout>;
  private toolCalls = 0;
  private stepStartTime?: number;

  constructor(
    private readonly jsonlPath: string,
    private readonly verbose: boolean = false,
    workerSlot?: number,
  ) {
    this.workerSlot = workerSlot;
  }

  // ── Step tracking ──

  setStep(step: StepName): void {
    this.step = step;
    this.toolCalls = 0;
    this.stepStartTime = Date.now();
    if (this.workerSlot !== undefined) {
      statusBar.updateWorker(this.workerSlot, { step, toolCalls: 0, startTime: Date.now() });
    }
  }

  clearStep(): void {
    this.step = undefined;
    this.stepStartTime = undefined;
    if (this.workerSlot !== undefined) {
      statusBar.updateWorker(this.workerSlot, { step: undefined, toolCalls: 0, startTime: undefined });
    }
  }

  incrementToolCalls(): void {
    this.toolCalls++;
    if (this.workerSlot !== undefined) {
      statusBar.updateWorker(this.workerSlot, { toolCalls: this.toolCalls });
    }
  }

  // ── Prefix rendering ──

  private get prefix(): string {
    if (this.workerSlot === undefined) return "";
    const color = WORKER_COLORS[this.workerSlot % WORKER_COLORS.length];
    const stepLabel = this.step ? `:${STEP_LABELS[this.step]}` : "";
    return `${color}[W${this.workerSlot}${stepLabel}]${RESET} `;
  }

  // ── Log methods ──

  info(msg: string): void {
    this.flushPendingTools();
    statusBar.writeLine(`${DIM}[${ts()}]${RESET} ${this.prefix}${msg}`);
  }

  warn(msg: string): void {
    this.flushPendingTools();
    statusBar.writeLine(`${DIM}[${ts()}]${RESET} ${this.prefix}${YELLOW}${msg}${RESET}`);
  }

  error(msg: string): void {
    this.flushPendingTools();
    statusBar.writeError(`${DIM}[${ts()}]${RESET} ${this.prefix}${RED}${msg}${RESET}`);
  }

  success(msg: string): void {
    this.flushPendingTools();
    statusBar.writeLine(`${DIM}[${ts()}]${RESET} ${this.prefix}${GREEN}${msg}${RESET}`);
  }

  tool(name: string, summary: string): void {
    this.incrementToolCalls();
    const now = Date.now();

    // If same tool type within 300ms, batch it
    if (
      this.pendingGroup &&
      this.pendingGroup.name === name &&
      now - this.pendingGroup.firstTs < 300
    ) {
      this.pendingGroup.summaries.push(summary);
      if (this.flushTimer) clearTimeout(this.flushTimer);
      this.flushTimer = setTimeout(() => this.flushPendingTools(), 200);
      this.flushTimer.unref?.();
      return;
    }

    // Flush existing group, start a new one
    this.flushPendingTools();
    this.pendingGroup = { name, summaries: [summary], firstTs: now };
    this.flushTimer = setTimeout(() => this.flushPendingTools(), 200);
    this.flushTimer.unref?.();
  }

  /** Flush any batched tool-call output immediately. */
  flush(): void {
    this.flushPendingTools();
  }

  private flushPendingTools(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }

    if (!this.pendingGroup) return;

    const { name, summaries } = this.pendingGroup;
    this.pendingGroup = null;

    if (summaries.length === 1) {
      statusBar.writeLine(
        `${DIM}[${ts()}]${RESET} ${this.prefix}  ${CYAN}${name.padEnd(6)}${RESET} ${DIM}${summaries[0]}${RESET}`,
      );
    } else {
      // Grouped: show count + first summary truncated
      const first = summaries[0] ?? "";
      const truncated = first.length > 60 ? first.slice(0, 60) + "\u2026" : first;
      statusBar.writeLine(
        `${DIM}[${ts()}]${RESET} ${this.prefix}  ${CYAN}${name.padEnd(6)}${RESET} ${DIM}\u00d7${summaries.length} ${truncated} \u2026${RESET}`,
      );
    }
  }

  verboseMsg(msg: string): void {
    if (this.verbose) {
      this.flushPendingTools();
      statusBar.writeLine(`${DIM}[${ts()}]${RESET} ${this.prefix}${DIM}${msg}${RESET}`);
    }
  }

  heading(msg: string): void {
    this.flushPendingTools();
    statusBar.writeLine(`${DIM}[${ts()}]${RESET} ${this.prefix}${BOLD}${msg}${RESET}`);
  }

  compaction(preTokens: number): void {
    const k = Math.round(preTokens / 1000);
    this.warn(`  \u26A0 Context compacted (${k}k tokens)`);
  }

  jsonl(event: LogEvent): void {
    const enriched = this.workerSlot !== undefined && !("worker" in event)
      ? { ...event, worker: this.workerSlot }
      : event;
    appendFileSync(this.jsonlPath, JSON.stringify(enriched) + "\n");
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
      statusBar.writeLine(`${DIM}[${ts()}]${RESET} ${this.prefix}${msg}`);
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
