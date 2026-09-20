import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type EvidenceClass =
  | 'historical_raw_user'
  | 'live_doris_forwarded'
  | 'historical_doris_forwarded'
  | 'historical_user_with_documented_edits'
  | 'human_authored_rewrite'
  | 'human_authored_counterfactual'
  | 'historical_intent_adaptation'
  | 'retrospective_calendar_annotation'
  | 'synthetic_regression'
  | 'synthetic_policy_regression'
  | 'human_authored_recovery'
  | 'development_holdout'
  | 'independent_synthetic_confirmation';

export interface ProviderAttemptRecord {
  attempt_index: number;
  provider: 'jev' | 'gpt';
  request_characters: number | null;
  milliseconds: number;
  http_status: number | null;
  status: 'running' | 'success' | 'http_error' | 'transport_error' | 'invalid_usage';
  request_id: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cached_input_tokens?: number | null;
  cost_usd: number | null;
}

export interface InferenceRecord {
  call_index: number;
  question_count: number;
  request_characters: number;
  milliseconds: number;
  status: 'running' | 'success' | 'failure';
  error_code?: string;
  attempts: ProviderAttemptRecord[];
  input_tokens: number | null;
  output_tokens: number | null;
  cached_input_tokens?: number | null;
  cost_usd: number | null;
}

export interface TurnRecord {
  turn_index: number;
  route: 'critique' | 'revise';
  evidence_class: EvidenceClass;
  request_hash: string;
  context_hash: string | null;
  starting_plan_hash: string;
  starting_history_hash: string;
  catalog_hash: string;
  milliseconds: number;
  http_status: number | null;
  outcome: string | null;
  expected_outcome: string | null;
  legacy_outcome_field_unavailable: boolean;
  operation_count: number | null;
  final_plan_hash: string | null;
  saved_history_hash: string | null;
  readback_verified: boolean;
  inference_calls: InferenceRecord[];
}

interface CaseRecord {
  case_id: string;
  case_name: string;
  evidence_class: EvidenceClass;
  seed: number;
  base_seed: number;
  generation_seeds: number[];
  generated_plan_hashes: string[];
  turns: TurnRecord[];
  observations: Record<string, unknown>[];
  result: string;
}

export function hash(value: unknown): string {
  return createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
}

export function evidenceClass(name: string): EvidenceClass {
  if (name.includes('policy:')) return 'synthetic_policy_regression';
  if (name.includes('actualDoris:')) return 'live_doris_forwarded';
  if (name.includes('counterfactual')) return 'human_authored_counterfactual';
  if (name.includes('Human-authored')) return 'human_authored_rewrite';
  if (name.includes('confirmation:')) return 'independent_synthetic_confirmation';
  if (name.includes('held-out:')) return 'development_holdout';
  if (name.includes('voice-note intent')) return 'historical_intent_adaptation';
  if (name.includes('calendar')) return 'retrospective_calendar_annotation';
  if (name.includes('replays May')) return 'historical_user_with_documented_edits';
  if (name.includes('actual May backend') || name.includes('retains family preferences')) return 'historical_doris_forwarded';
  if (name.includes('Remove lunch on Tuesday and Friday and Sunday. New dinner sat and thurs')) return 'historical_raw_user';
  if (name.includes('Remove lunch on Tuesday, Friday, and Sunday. Replace the dinner')) return 'historical_doris_forwarded';
  return 'synthetic_regression';
}

/** Local evaluation artifacts live exclusively in the already-ignored .cache tree. */
export class EvaluationRecorder {
  readonly seed: number;
  readonly frozenGenerationDate: string;
  readonly artifactDirectory: string;
  private readonly rawEnabled: boolean;
  private readonly startedAt = new Date().toISOString();
  private readonly cases: CaseRecord[] = [];
  private currentCase: CaseRecord | undefined;
  private currentTurn: TurnRecord | undefined;
  private readonly sourceHashes: Record<string, string>;
  private readonly gitHead: string;

  constructor(private readonly requestedSeeds: readonly number[] = [Number(process.env['JEV_EVAL_SEED'] ?? '20260920')]) {
    this.seed = requestedSeeds[0] ?? 20260920;
    if (!Number.isSafeInteger(this.seed)) throw new Error('JEV_EVAL_SEED must be an integer');
    this.frozenGenerationDate = process.env['JEV_EVAL_DATE'] ?? '2026-09-20T12:00:00.000Z';
    if (!Number.isFinite(Date.parse(this.frozenGenerationDate))) throw new Error('JEV_EVAL_DATE must be an ISO date');
    this.rawEnabled = process.env['JEV_EVAL_PRIVATE_ARTIFACTS'] === '1';
    const runId = this.startedAt.replace(/[:.]/g, '-') + '-' + process.pid + '-' + this.seed;
    this.artifactDirectory = join(process.cwd(), '.cache', 'jev-eval', runId);
    mkdirSync(this.artifactDirectory, { recursive: true, mode: 0o700 });
    const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '--', 'packages/functions/src', 'packages/functions/tsconfig.jev-live.json', 'vitest.jev-live.config.ts', 'vitest.jev-live.workspace.ts', 'package.json', 'package-lock.json'], { encoding: 'utf8' }).trim().split('\n').filter((file) => /\.(?:ts|json|md)$/.test(file)).sort();
    this.sourceHashes = Object.fromEntries([...new Set(files)].map((file) => [file, createHash('sha256').update(readFileSync(file)).digest('hex')]));
    this.gitHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    this.flush();
  }

  get activeSeed(): number {
    return this.currentCase?.base_seed ?? this.seed;
  }

  get latestTurn(): Readonly<TurnRecord> | undefined {
    return this.currentTurn;
  }

  get hasRecoveryTurn(): boolean {
    return this.currentCase?.turns.some((turn) => turn.evidence_class === 'human_authored_recovery') ?? false;
  }

  startCase(name: string, baseSeed: number = this.seed): void {
    const seed = Number.parseInt(hash(`${baseSeed}:${name}`).slice(0, 8), 16);
    this.currentCase = {
      case_id: hash(`${baseSeed}:${name}`).slice(0, 16), case_name: name, evidence_class: evidenceClass(name), seed, base_seed: baseSeed,
      generation_seeds: [], generated_plan_hashes: [], turns: [], observations: [], result: 'running',
    };
    this.cases.push(this.currentCase);
    this.flush();
  }

  observe(observation: Record<string, unknown>): void {
    this.currentCase?.observations.push(observation);
    this.flush();
  }

  nextGenerationSeed(): number {
    if (this.currentCase === undefined) throw new Error('Generation must occur inside an evaluation case');
    const seed = Number.parseInt(hash(`${this.currentCase.seed}:${this.currentCase.generation_seeds.length}`).slice(0, 8), 16);
    this.currentCase.generation_seeds.push(seed);
    return seed;
  }

  generated(plan: unknown): void {
    this.currentCase?.generated_plan_hashes.push(hash(plan));
    this.raw('generated-' + (this.currentCase?.generation_seeds.length ?? 0), plan);
    this.flush();
  }

  startTurn(route: TurnRecord['route'], text: string, plan: unknown, history: unknown, catalog: unknown, provenance?: EvidenceClass, context?: unknown): TurnRecord {
    if (this.currentCase === undefined) throw new Error('Critique must occur inside an evaluation case');
    const turn: TurnRecord = {
      turn_index: this.currentCase.turns.length + 1, route, evidence_class: provenance ?? this.currentCase.evidence_class,
      request_hash: hash(context === undefined ? text : { critique: text, context }), context_hash: context === undefined ? null : hash(context), starting_plan_hash: hash(plan), starting_history_hash: hash(history), catalog_hash: hash(catalog),
      milliseconds: 0, http_status: null, outcome: null, expected_outcome: null, legacy_outcome_field_unavailable: false, operation_count: null, final_plan_hash: null,
      saved_history_hash: null, readback_verified: false, inference_calls: [],
    };
    this.currentCase.turns.push(turn);
    this.currentTurn = turn;
    this.raw(`turn-${turn.turn_index}-input`, { route, text, context, plan, history, catalog });
    this.flush();
    return turn;
  }

  startInference(state: unknown, questions: Record<string, unknown>): InferenceRecord {
    if (this.currentTurn === undefined) throw new Error('Inference must occur inside a recorded turn');
    const record: InferenceRecord = {
      call_index: this.currentTurn.inference_calls.length + 1,
      question_count: Object.keys(questions).length,
      request_characters: JSON.stringify({ state, questions }).length,
      milliseconds: 0, status: 'running', attempts: [], input_tokens: null, output_tokens: null, cost_usd: null,
    };
    this.currentTurn.inference_calls.push(record);
    this.raw(`turn-${this.currentTurn.turn_index}-call-${record.call_index}-input`, { state, questions });
    return record;
  }

  providerPayload(record: InferenceRecord, attempt: ProviderAttemptRecord, payload: unknown): void {
    this.raw(`turn-${this.currentTurn?.turn_index ?? 0}-call-${record.call_index}-attempt-${attempt.attempt_index}-provider`, payload);
  }

  inferenceAnswers(record: InferenceRecord, answers: unknown): void {
    this.raw(`turn-${this.currentTurn?.turn_index ?? 0}-call-${record.call_index}-answers`, answers);
  }

  turnReadback(turn: TurnRecord, response: unknown, savedSession: unknown): void {
    this.raw(`turn-${turn.turn_index}-result`, { response, saved_session: savedSession });
  }

  finishCase(result: string): void {
    if (this.currentCase !== undefined) this.currentCase.result = result;
    this.currentTurn = undefined;
    this.flush();
  }

  flush(): void {
    const turns = this.cases.flatMap((entry) => entry.turns);
    const calls = turns.flatMap((entry) => entry.inference_calls);
    this.write('manifest.json', {
      format_version: 1, started_at: this.startedAt, git_head: this.gitHead,
      source_tree_sha256: hash(this.sourceHashes), source_sha256: this.sourceHashes,
      provider: process.env['MEALPLAN_CRITIQUE_PROVIDER'] ?? 'jev',
      model: process.env['MEALPLAN_CRITIQUE_PROVIDER'] === 'gpt' ? 'gpt-5.2' : process.env['JEV_MODEL'] ?? 'jev-1.13.0', node_version: process.version,
      base_seed: this.seed, requested_seeds: this.requestedSeeds, frozen_generation_date: this.frozenGenerationDate,
      generation_clock_only: true, provider_and_transport_mocked: false,
      configured_jev_timeout_ms: process.env['JEV_TIMEOUT_MS'] ?? '30000',
      database_project: 'demo-jev-eval', database_host: '127.0.0.1:8080',
      private_raw_artifacts: this.rawEnabled,
      fresh_confirmation_round_two_enabled: process.env['JEV_EVAL_FRESH_CONFIRMATION'] === '1',
      boundary_confirmation_enabled: process.env['JEV_EVAL_BOUNDARY_CONFIRMATION'] === '1',
      acceptance_profile: process.env['JEV_EVAL_BOUNDED_RECOVERY'] === '1' ? 'one_authored_clarification_per_conversation_after_verified_unchanged_refusal' : 'strict_first_attempt',
      imported_doris_request: this.cases.some((entry) => entry.evidence_class === 'live_doris_forwarded'),
      interpreter_measurement_scope: 'Provider usage here is backend-only; imported actual Doris request usage is measured by the separate gateway invocation.',
      comparator: process.env['MEALPLAN_CRITIQUE_PROVIDER'] === 'gpt' ? 'preserved_gpt_5_2_implementation' : null, doris_execution: false, doris_tokens: null, doris_cost_usd: null,
      pricing: {
        checked_on: '2026-09-20', kind: 'usage_based_estimate_not_invoice',
        jev: { model: 'jev-1.13.0', input_usd_per_million: 0.042, output_usd_per_million: 0, source: 'https://docs.typesafe.ai/models' },
        gpt: { model: 'gpt-5.2', input_usd_per_million: 1.75, cached_input_usd_per_million: 0.175, output_usd_per_million: 14, source: 'https://developers.openai.com/api/docs/models/gpt-5.2' },
      },
      cost_usd: calls.every((call) => call.cost_usd !== null) ? calls.reduce((total, call) => total + (call.cost_usd ?? 0), 0) : null,
      known_cost_usd: calls.flatMap((call) => call.attempts).reduce((total, attempt) => total + (attempt.cost_usd ?? 0), 0),
      counts: { cases: this.cases.length, passed: this.cases.filter((entry) => entry.result === 'pass').length,
        cases_with_critique_turns: this.cases.filter((entry) => entry.turns.length > 0).length,
        failed: this.cases.filter((entry) => entry.result === 'fail').length, turns: turns.length, semantic_calls: calls.length,
        physical_attempts: calls.reduce((total, call) => total + call.attempts.length, 0),
        known_input_tokens: calls.flatMap((call) => call.attempts).reduce((total, attempt) => total + (attempt.input_tokens ?? 0), 0),
        known_output_tokens: calls.flatMap((call) => call.attempts).reduce((total, attempt) => total + (attempt.output_tokens ?? 0), 0),
        input_tokens: calls.every((call) => call.input_tokens !== null) ? calls.reduce((total, call) => total + (call.input_tokens ?? 0), 0) : null,
        output_tokens: calls.every((call) => call.output_tokens !== null) ? calls.reduce((total, call) => total + (call.output_tokens ?? 0), 0) : null },
      cases: this.cases,
    });
  }

  private raw(name: string, data: unknown): void {
    if (this.rawEnabled) this.write(`${this.currentCase?.case_id ?? 'setup'}-${name}.private.json`, data);
  }

  private write(name: string, value: unknown): void {
    writeFileSync(join(this.artifactDirectory, name), JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  }
}
