import { execFileSync } from 'node:child_process';
import { AsyncLocalStorage } from 'node:async_hooks';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { Firestore } from 'firebase-admin/firestore';
import type { Meal, MealPlanSession, MealPlanEntry, CritiqueContext } from '../../shared.js';
import { critiqueOperationSchema, critiqueContextSchema, mealPlanSessionSchema } from '../../schemas/mealplan.schema.js';
import { EvaluationRecorder, hash } from './evaluation-recording.js';
import { registerFreshConfirmations } from './confirmation-round2.js';
import { registerBoundaryConfirmations } from './confirmation-round3.js';
import type { EvidenceClass, InferenceRecord, ProviderAttemptRecord } from './evaluation-recording.js';
import type { ApiResponse } from '../utils/api-types.js';
import { createLiveHttpHarness, type LiveHttpHarness } from './live-http.js';

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL('./fixtures/' + name, import.meta.url), 'utf8')) as unknown;
}
const catalog = mealPlanSessionSchema.shape.meals_snapshot.parse(fixture('meals.json'));
const historicalCatalog = mealPlanSessionSchema.shape.meals_snapshot.parse(fixture('may-catalog.json'));
const mayWeek = z.object({
  created_at: z.string(), plan: mealPlanSessionSchema.shape.plan,
  messages: z.array(z.string()).min(2), after_first_gpt_response: mealPlanSessionSchema.shape.plan,
  backend_followups: z.array(z.string()).length(3), after_second_gpt_response: mealPlanSessionSchema.shape.plan,
}).parse(fixture('may-week.json'));
const calendars = z.object({ weeks: z.array(z.object({
  week_start: z.string(), calendar: z.string(),
  events: z.array(z.object({ requires_easy_dinner: z.boolean(), start: z.object({ dateTime: z.string().optional(), date: z.string().optional() }) })),
})) }).parse(fixture('calendars.json'));
const runSeeds = (process.env['JEV_EVAL_SEEDS'] ?? process.env['JEV_EVAL_SEED'] ?? '20260920').split(',').map(Number);
if (runSeeds.length === 0 || runSeeds.some((seed) => !Number.isSafeInteger(seed)) || new Set(runSeeds).size !== runSeeds.length) {
  throw new Error('JEV_EVAL_SEEDS must contain distinct comma-separated integer seeds');
}
let http: LiveHttpHarness;
let db: Firestore;
let recorder: EvaluationRecorder;
const inferenceContext = new AsyncLocalStorage<InferenceRecord>();
const pendingMeasurements = new WeakMap<InferenceRecord, Set<Promise<void>>>();

async function finishInference(record: InferenceRecord, started: number): Promise<void> {
  await Promise.allSettled([...(pendingMeasurements.get(record) ?? [])]);
  pendingMeasurements.delete(record);
  record.milliseconds = Math.round(performance.now() - started);
  record.input_tokens = record.attempts.every((attempt) => attempt.input_tokens !== null)
    ? record.attempts.reduce((total, attempt) => total + (attempt.input_tokens ?? 0), 0) : null;
  record.output_tokens = record.attempts.every((attempt) => attempt.output_tokens !== null)
    ? record.attempts.reduce((total, attempt) => total + (attempt.output_tokens ?? 0), 0) : null;
  record.cost_usd = record.attempts.every((attempt) => attempt.cost_usd !== null)
    ? record.attempts.reduce((total, attempt) => total + (attempt.cost_usd ?? 0), 0) : null;
  recorder.flush();
}
const createdSessionIds = new Set<string>();
const critiqueResultSchema = z.object({
  errors: z.array(z.string()), plan: mealPlanSessionSchema.shape.plan,
  explanation: z.string(), operations: z.array(critiqueOperationSchema),
  outcome: z.string(), recency_reconciled: z.boolean().optional(),
});

function expectReplacement(before: MealPlanSession, after: MealPlanSession, day: number, type: MealPlanEntry['meal_type'] = 'dinner', track: MealPlanEntry['meal_track'] = 'family'): void {
  const replacement = slotAt(after, day, type, track);
  expect(replacement.meal_id).not.toBeNull();
  expect(replacement.meal_id).not.toBe(slotAt(before, day, type, track).meal_id);
  expect(mealFor(after, replacement).audience).toBe(track);
  expect(mealFor(after, replacement).meal_type).toBe(type);
}

function slotAt(session: MealPlanSession, day: number, type: MealPlanEntry['meal_type'], track: MealPlanEntry['meal_track'] = 'family'): MealPlanEntry {
  const slot = session.plan.find((entry) => entry.day_index === day && entry.meal_type === type && entry.meal_track === track);
  expect(slot).toBeDefined();
  return slot!;
}

function expectPreserved(before: MealPlanSession, after: MealPlanSession, changed: MealPlanEntry[]): void {
  expect(after.plan).toHaveLength(before.plan.length);
  for (const slot of before.plan) {
    if (changed.includes(slot)) continue;
    expect(slotAt(after, slot.day_index, slot.meal_type, slot.meal_track)).toEqual(slot);
  }
}

function mealFor(session: MealPlanSession, slot: MealPlanEntry): Meal {
  const meal = session.meals_snapshot.find((candidate) => candidate.id === slot.meal_id);
  expect(meal).toBeDefined();
  return meal!;
}

async function saved(id: string): Promise<MealPlanSession> {
  const response = await http.get('/api/dev/mealplans/' + id);
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  const session = mealPlanSessionSchema.parse((response.body as ApiResponse<MealPlanSession>).data);
  createdSessionIds.add(id);
  return session;
}

async function generate(): Promise<MealPlanSession> {
  recorder.observe({ event: 'generation_http_started' });
  const response = await http.post('/api/dev/mealplans/generate').send({});
  recorder.observe({ event: 'generation_http_completed', http_status: response.status });
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  const body = response.body as ApiResponse<{ session_id: string }>;
  const id = body.data!.session_id;
  await db.collection('dev_meal_plan_sessions').doc(id).update({
    created_at: recorder.frozenGenerationDate, updated_at: recorder.frozenGenerationDate,
  });
  return saved(id);
}

async function critiqueOnce(
  session: MealPlanSession,
  text: string,
  options: { route?: 'critique' | 'revise'; outcome?: string; provenance?: EvidenceClass; context?: CritiqueContext } = {},
  deferOutcomeAssertion = false,
): Promise<MealPlanSession> {
  const route = options.route ?? 'critique';
  const turn = recorder.startTurn(route, text, session.plan, session.history, session.meals_snapshot, options.provenance, options.context);
  turn.expected_outcome = options.outcome ?? null;
  const start = performance.now();
  try {
    const response = await http.post('/api/dev/mealplans/' + session.id + '/' + route).send({ critique: text, ...(options.context === undefined ? {} : { context: options.context }) });
    turn.http_status = response.status;
    const result = await saved(session.id);
    turn.final_plan_hash = hash(result.plan);
    turn.saved_history_hash = hash(result.history);
    recorder.turnReadback(turn, response.body as unknown, result);
    if (response.status !== 200) {
      expect(result.plan).toEqual(session.plan);
      expect(result.history).toEqual(session.history);
      expect(result.is_finalized).toBe(session.is_finalized);
      turn.readback_verified = true;
    }
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    const body = critiqueResultSchema.parse((response.body as ApiResponse<unknown>).data);
    turn.outcome = body.outcome ?? null;
    turn.operation_count = body.operations.length;
    recorder.turnReadback(turn, body, result);
    if (body.errors.length > 0) {
      expect(result.plan).toEqual(session.plan);
      expect(result.history).toEqual(session.history);
      expect(result.is_finalized).toBe(session.is_finalized);
      turn.readback_verified = true;
    }
    expect(body.errors, body.explanation).toEqual([]);
    expect(result.plan).toEqual(body.plan);
    const previousAssignments = session.plan.filter((slot) => body.operations.some((operation) =>
      operation.day_index === slot.day_index && operation.meal_track === slot.meal_track && operation.meal_type === slot.meal_type && operation.new_meal_id !== slot.meal_id));
    expect(result.history).toEqual([...session.history,
      { role: 'user', content: text, ...(options.context === undefined ? {} : { context: options.context }) },
      { role: 'assistant', content: body.explanation, operations: body.operations,
        ...(previousAssignments.length > 0 ? { previous_assignments: previousAssignments } : {}),
      },
    ]);
    expect(result.is_finalized).toBe(session.is_finalized);
    turn.readback_verified = true;
    if (!deferOutcomeAssertion && options.outcome !== undefined) expect(body.outcome, body.explanation).toBe(options.outcome);
    return result;
  } finally {
    turn.milliseconds = Math.round(performance.now() - start);
    recorder.flush();
    console.log(JSON.stringify({ evaluation_turn: turn.turn_index, route, evidence_class: turn.evidence_class,
      request_hash: turn.request_hash, outcome: turn.outcome, milliseconds: turn.milliseconds,
      inference_calls: turn.inference_calls.length, readback_verified: turn.readback_verified }));
  }
}

async function critique(
  session: MealPlanSession,
  text: string,
  options: { route?: 'critique' | 'revise'; outcome?: string; provenance?: EvidenceClass; context?: CritiqueContext } = {},
): Promise<MealPlanSession> {
  let recovery: string | undefined;
  if (process.env['JEV_EVAL_BOUNDED_RECOVERY'] === '1' && options.outcome === 'applied') {
    const boundary = await import('./confirmation-round3-recovery.js');
    recovery = boundary.boundaryRecoveryRequests[text];
    if (text === 'I take back my objection to the original Monday meal. Put Monday back to what it had before my last message. Wednesday’s new choice is good, so keep that revision and all the other arrangements.') {
      const original = [...session.history].reverse().flatMap((message) => message.previous_assignments ?? [])
        .find((slot) => slot.day_index === 0 && slot.meal_type === 'dinner' && slot.meal_track === 'family');
      expect(original?.meal_name).toBeTruthy();
      recovery = `Restore Monday’s family dinner to exactly ${original!.meal_name}, which was there before my previous change. Keep Wednesday’s accepted replacement and every other saved assignment unchanged.`;
    }
  }
  const first = await critiqueOnce(session, text, options, recovery !== undefined);
  if (recovery === undefined) return first;
  const initialTurn = recorder.latestTurn!;
  const unchanged = hash(first.plan) === hash(session.plan);
  const emptyOperations = (first.history.at(-1)?.operations ?? []).length === 0;
  if (!unchanged || !emptyOperations || initialTurn.outcome === 'applied') {
    expect(initialTurn.outcome).toBe(options.outcome);
    recorder.observe({ event: 'bounded_resolution', initial_turn_index: initialTurn.turn_index,
      initial_outcome: initialTurn.outcome, extra_turn_count: 0, first_attempt_accepted: true });
    return first;
  }
  // Only a successful, fully verified HTTP response with zero saved edits can
  // receive an extra clarification. Transport, provider, history and plan errors
  // have already thrown above; wrong or partial writes remain strict failures.
  expect(first.plan).toEqual(session.plan);
  expect(first.history.slice(0, session.history.length)).toEqual(session.history);
  expect(first.history).toHaveLength(session.history.length + 2);
  expect(first.history.at(-1)?.operations).toEqual([]);
  expect(recorder.hasRecoveryTurn, 'Only one extra clarification is allowed in the entire conversation').toBe(false);
  recorder.observe({ event: 'bounded_recovery_started', initial_turn_index: initialTurn.turn_index,
    initial_outcome: initialTurn.outcome, first_attempt_contract_passed: false,
    recovery_request_hash: hash(recovery), recovery_provenance: text in (await import('./confirmation-round3-recovery.js')).boundaryRecoveryRequests
      ? 'independently_pre_authored_before_first_boundary_trial' : 'exposed_undo_clarification_grounded_in_saved_previous_assignments',
    extra_turn_count: 1 });
  const result = await critiqueOnce(first, recovery, { ...(options.route === undefined ? {} : { route: options.route }), outcome: 'applied', provenance: 'human_authored_recovery' });
  recorder.observe({ event: 'bounded_recovery_completed', initial_turn_index: initialTurn.turn_index,
    initial_outcome: initialTurn.outcome, final_outcome: recorder.latestTurn?.outcome,
    first_attempt_contract_passed: false, extra_turn_count: 1 });
  return result;
}

beforeAll(async () => {
  // Refuse real databases; this suite intentionally seeds disposable records.
  if (process.env['FIRESTORE_EMULATOR_HOST'] !== '127.0.0.1:8080') throw new Error('Start the local Firestore emulator and set FIRESTORE_EMULATOR_HOST=127.0.0.1:8080');
  process.env['GOOGLE_CLOUD_PROJECT'] = 'demo-jev-eval';
  process.env['GCLOUD_PROJECT'] = 'demo-jev-eval';
  process.env['BRAD_LOCAL_DEV_ONLY'] = 'true';
  process.env['APP_CHECK_BYPASS'] = 'true';
  process.env['TYPESAFE_API_KEY'] = execFileSync('gcloud', ['secrets', 'versions', 'access', 'latest', '--secret', 'TYPESAFE_API_KEY_DEV', '--project', 'brad-os', '--quiet'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  recorder = new EvaluationRecorder(runSeeds);
  // Only generation uses a fixed date and per-case PRNG; real network timers are untouched.
  const generation = await import('../../services/mealplan-generation.service.js');
  const originalGenerate = generation.generateMealPlan;
  vi.spyOn(generation, 'generateMealPlan').mockImplementation((meals) => {
    let randomState = recorder.nextGenerationSeed();
    const random = vi.spyOn(Math, 'random').mockImplementation(() => {
      randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
      return randomState / 4294967296;
    });
    try {
      const plan = originalGenerate(meals, new Date(recorder.frozenGenerationDate));
      recorder.generated(plan);
      return plan;
    } finally {
      random.mockRestore();
    }
  });
  const originalFetch = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const provider = url.startsWith('https://api.typesafe.ai/') ? 'jev' : null;
    const record = inferenceContext.getStore();
    if (provider === null || record === undefined) return originalFetch(input, init);
    const started = performance.now();
    const attempt: ProviderAttemptRecord = {
      attempt_index: record.attempts.length + 1, provider,
      request_characters: typeof init?.body === 'string' ? init.body.length : null,
      milliseconds: 0, http_status: null, status: 'running', request_id: null,
      input_tokens: null, output_tokens: null, cost_usd: null,
    };
    record.attempts.push(attempt);
    if (attempt.request_characters !== null) record.request_characters = attempt.request_characters;
    try {
      const response = await originalFetch(input, init);
      attempt.http_status = response.status;
      const requestId = response.headers.get('x-typesafe-request-id');
      attempt.request_id = requestId !== null && /^[a-zA-Z0-9_.:-]{1,128}$/.test(requestId) ? requestId : null;
      attempt.status = response.ok ? 'success' : 'http_error';
      if (response.ok) {
        const measurement = response.clone().json().then((payload: unknown): void => {
          recorder.providerPayload(record, attempt, payload);
          const parsed = z.object({ usage: z.object({
            input_tokens: z.number().int().nonnegative().optional(), output_tokens: z.number().int().nonnegative().optional(),
          }).optional() }).safeParse(payload);
          if (parsed.success) {
            attempt.input_tokens = parsed.data.usage?.input_tokens ?? null;
            attempt.output_tokens = parsed.data.usage?.output_tokens ?? null;
            if (attempt.input_tokens !== null) attempt.cost_usd = attempt.input_tokens * 0.042 / 1_000_000;
          } else attempt.status = 'invalid_usage';
        }).catch((): void => { attempt.status = 'invalid_usage'; }).finally((): void => {
          attempt.milliseconds = Math.round(performance.now() - started);
        });
        const measurements = pendingMeasurements.get(record) ?? new Set<Promise<void>>();
        pendingMeasurements.set(record, measurements);
        measurements.add(measurement);
        void measurement.finally(() => measurements.delete(measurement));
      }
      return response;
    } catch (error: unknown) {
      attempt.status = 'transport_error';
      throw error;
    } finally {
      attempt.milliseconds = Math.round(performance.now() - started);
    }
  });
  const jev = await import('../../services/mealplan-jev.service.js');
  const originalEvaluate = jev.evaluateJev;
  vi.spyOn(jev, 'evaluateJev').mockImplementation(async (state, questions, key, signal) => {
    const record = recorder.startInference(state, questions);
    return inferenceContext.run(record, async () => {
    const started = performance.now();
    try {
      const answers = await originalEvaluate(state, questions, key, signal);
      record.status = 'success';
      recorder.inferenceAnswers(record, answers);
      return answers;
    } catch (error: unknown) {
      record.status = 'failure';
      record.error_code = error !== null && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'unknown';
      throw error;
    } finally {
      await finishInference(record, started);
    }
    });
  });
  console.log(JSON.stringify({ seed: recorder.seed, model: process.env['JEV_MODEL'] ?? 'jev-1.13.0',
    frozen_generation_date: recorder.frozenGenerationDate, fixture_catalog_size: catalog.length,
    artifacts: recorder.artifactDirectory }));
  const { getFirestoreDb } = await import('../../firebase.js');
  const { createCloudRunApp } = await import('../../cloud-run-app.js');
  db = getFirestoreDb();
  http = await createLiveHttpHarness(createCloudRunApp({ developmentOnly: true }));
});


afterAll(async () => {
  try {
    await http?.close();
  } finally {
    vi.restoreAllMocks();
    delete process.env['TYPESAFE_API_KEY'];
    if (db) await db.terminate();
  }
});

describe.each(runSeeds)('real critique conversations through the HTTP API (seed %i)', (caseSeed) => {
beforeEach(async ({ task }) => {
  recorder.startCase(task.name, caseSeed);
  recorder.observe({ event: 'catalog_seed_started' });
  const batch = db.batch();
  for (const meal of catalog) batch.set(db.collection('dev_meals').doc(meal.id), meal);
  await batch.commit();
  recorder.observe({ event: 'catalog_seed_completed' });
});

afterEach(async ({ task }) => {
  recorder.finishCase(task.result?.state ?? 'unknown');
  const batch = db.batch();
  for (const id of createdSessionIds) batch.delete(db.collection('dev_meal_plan_sessions').doc(id));
  await batch.commit();
  createdSessionIds.clear();
});

  it('generates five structurally valid weeks and records best-effort repetitions', async () => {
    for (let iteration = 0; iteration < 5; iteration++) {
      const plan = await generate();
      const selected = plan.plan.filter((slot) => slot.meal_id !== null);
      expect(selected).toHaveLength(27);
      console.log(JSON.stringify({ generated_week: iteration, duplicate_slots: selected.length - new Set(selected.map((slot) => slot.meal_id)).size }));
      const prepAhead = new Set<string>();
      let highEffortBreakfastOrLunch = 0;
      const redMeatDays: number[] = [];
      for (const slot of selected) {
        const meal = mealFor(plan, slot);
        expect(meal.audience).toBe(slot.meal_track);
        expect(meal.meal_type).toBe(slot.meal_type);
        if (slot.meal_type !== 'dinner' && meal.effort > 2) highEffortBreakfastOrLunch++;
        if (meal.prep_ahead) prepAhead.add(meal.id);
        if (slot.meal_type === 'dinner' && meal.has_red_meat) redMeatDays.push(slot.day_index);
      }
      expect(prepAhead.size).toBeLessThanOrEqual(3);
      console.log(JSON.stringify({ generated_week: iteration, higher_effort_breakfast_or_lunch_slots: highEffortBreakfastOrLunch }));
      expect(redMeatDays.length).toBeLessThanOrEqual(2);
      expect(redMeatDays.some((day) => redMeatDays.includes(day + 1))).toBe(false);
    }
  });

  it.each(['2026-05-25', '2026-08-10'])('uses the backfilled calendar week %s without clearing meal slots', async (date) => {
    const initial = await generate();
    const entries = calendars.weeks.filter((week) => week.week_start === date);
    expect(entries).toHaveLength(3);
    const busyDays = [...new Set(entries.flatMap((week) => week.events.filter((event) => event.requires_easy_dinner).map((event) => new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'America/New_York' }).format(new Date(event.start.dateTime!)))))];
    const text = busyDays.length === 0
      ? 'This week has daytime commitments but no evening activities. No dinner changes needed.'
      : 'The family calendar has evening activities on ' + busyDays.join(' and ') + '. Replace dinner on those days with easy effort 1 or 2 meals. Keep all other slots unchanged.';
    const next = await critique(initial, text);
    const changed = initial.plan.filter((slot) => slot.meal_type === 'dinner' && busyDays.includes(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][slot.day_index]!));
    for (const slot of changed) expect(mealFor(next, slotAt(next, slot.day_index, 'dinner')).effort).toBeLessThanOrEqual(2);
    expectPreserved(initial, next, changed);
  });

  it.each([
    'Remove lunch on Tuesday and Friday and Sunday. New dinner sat and thurs',
    'Remove lunch on Tuesday, Friday, and Sunday. Replace the dinner on Thursday and Saturday with new options.',
  ])('generates a full week and applies compound edits: %s', async (text) => {
    const initial = await generate();
    expect(initial.plan).toHaveLength(28);
    expect(initial.plan.filter((slot) => slot.meal_id === null)).toEqual([
      expect.objectContaining({ day_index: 4, meal_type: 'dinner', meal_name: 'Eating out' }),
    ]);
    const next = await critique(initial, text);
    for (const old of initial.plan) {
      const current = next.plan.find((slot) => slot.day_index === old.day_index && slot.meal_type === old.meal_type && slot.meal_track === old.meal_track)!;
      if (old.meal_type === 'lunch' && [1, 4, 6].includes(old.day_index)) expect(current.meal_id).toBeNull();
      else if (old.meal_type === 'dinner' && [3, 5].includes(old.day_index)) {
        expect(current.meal_id).not.toBeNull();
        expect(current.meal_id).not.toBe(old.meal_id);
      } else expect(current).toEqual(old);
    }
  });

  it('backfills evening calendar context, then handles approval without changing or finalizing the draft', async () => {
    const initial = await generate();
    const backfill = calendars.weeks.find((week) => week.week_start === '2026-08-24' && week.calendar === 'Family')!;
    const busyDays = backfill.events.filter((event) => event.requires_easy_dinner).map((event) => new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'America/New_York' }).format(new Date(event.start.dateTime!)));
    expect(busyDays).toEqual(['Monday', 'Wednesday']);
    const next = await critique(initial, 'Monday and Wednesday have an evening activity from 5 to 6 pm. Replace those dinners with genuinely easy meals, effort 1 or 2, with little serving-time work. Keep all meal slots filled and leave everything else unchanged.');
    for (const day of [0, 2]) expect(mealFor(next, slotAt(next, day, 'dinner')).effort).toBeLessThanOrEqual(2);
    expectPreserved(initial, next, [slotAt(initial, 0, 'dinner'), slotAt(initial, 2, 'dinner')]);
    const approved = await critique(next, 'Looks good, finalize it and get me a shopping list', { provenance: 'synthetic_regression' });
    expect(approved.plan).toEqual(next.plan);
    expect(approved.is_finalized).toBe(false);
  });

  it('remembers rejected dinners across follow-up requests without replaying earlier removals', async () => {
    const initial = await generate();
    const first = await critique(initial, 'We do not need Monday meals at all. Replace Tuesday dinner, we had that recently. Leave the other days alone.');
    expect(first.plan.filter((slot) => slot.day_index === 0).every((slot) => slot.meal_id === null)).toBe(true);
    expectReplacement(initial, first, 1, 'dinner');
    expectPreserved(initial, first, [...initial.plan.filter((slot) => slot.day_index === 0), slotAt(initial, 1, 'dinner')]);
    const second = await critique(first, 'Had that recently too. Try again for Tuesday dinner, something we have not had recently.');
    expectReplacement(first, second, 1, 'dinner');
    expectReplacement(initial, second, 1, 'dinner');
    expectPreserved(first, second, [slotAt(first, 1, 'dinner')]);
  });

  it('exchanges occupied dinners and keeps every other slot unchanged', async () => {
    const initial = await generate();
    const next = await critique(initial, 'Swap Wednesday and Thursday dinners.');
    expect(slotAt(next, 2, 'dinner').meal_id).toBe(slotAt(initial, 3, 'dinner').meal_id);
    expect(slotAt(next, 3, 'dinner').meal_id).toBe(slotAt(initial, 2, 'dinner').meal_id);
    expectPreserved(initial, next, [slotAt(initial, 2, 'dinner'), slotAt(initial, 3, 'dinner')]);
  });

  it('handles the August voice-note intent including no-cook Sunday lunch', async () => {
    const initial = await generate();
    // Prove feasibility independently of provider behavior before choosing the expected
    // contract. Earlier unconditional replacement failures remain in retained run artifacts.
    const fixed = initial.plan.filter((slot) => slot.day_index !== 0 && !(slot.meal_type === 'dinner' && [5, 6].includes(slot.day_index)) && !(slot.day_index === 6 && slot.meal_type === 'lunch'));
    const fixedIds = new Set(fixed.map((slot) => slot.meal_id));
    const fixedPrep = fixed.filter((slot) => slot.meal_id !== null && mealFor(initial, slot).prep_ahead).length;
    const alternatives = initial.meals_snapshot.filter((meal) => meal.meal_type === 'lunch' && meal.audience === 'family' && meal.effort === 1 && meal.id !== slotAt(initial, 6, 'lunch').meal_id);
    const feasible = alternatives.filter((meal) => !fixedIds.has(meal.id) && fixedPrep + Number(meal.prep_ahead) <= 3);
    recorder.observe({
      observation: 'historical_effort_one_lunch_assertion_feasibility',
      fixed_prep_slots: fixedPrep,
      candidate_count: alternatives.length,
      structurally_feasible_ids: feasible.map((meal) => meal.id),
      proven_infeasible_under_asserted_effort_and_mandatory_constraints: feasible.length === 0,
      note: 'Effort one alone does not prove no-cook; this is a necessary-condition check for the retained assertion, not recipe verification.',
    });
    const next = await critique(initial, 'We do not need Monday at all, so get rid of all of those meals. We just had Saturday dinner, so get us something different there. Sunday dinner also needs to be swapped out. For Sunday lunch I do not want to cook, so give me something new and no-cook there as well.', {
      outcome: feasible.length === 0 ? 'infeasible' : 'applied',
    });
    if (feasible.length === 0) {
      expect(next.plan).toEqual(initial.plan);
      expect(next.history.at(-1)?.operations).toEqual([]);
      return;
    }
    expect(next.plan.filter((slot) => slot.day_index === 0).every((slot) => slot.meal_id === null)).toBe(true);
    for (const day of [5, 6]) {
      expect(slotAt(next, day, 'dinner').meal_id).not.toBeNull();
      expect(slotAt(next, day, 'dinner').meal_id).not.toBe(slotAt(initial, day, 'dinner').meal_id);
    }
    expect(mealFor(next, slotAt(next, 6, 'lunch')).effort).toBe(1);
    expectReplacement(initial, next, 6, 'lunch');
    expectPreserved(initial, next, [...initial.plan.filter((slot) => slot.day_index === 0), slotAt(initial, 5, 'dinner'), slotAt(initial, 6, 'dinner'), slotAt(initial, 6, 'lunch')]);
  });

  it('distinguishes my breakfasts from the family track', async () => {
    const initial = await generate();
    const next = await critique(initial, 'Swap my Monday and Tuesday breakfasts. Leave the family breakfasts alone.');
    expect(slotAt(next, 0, 'breakfast', 'adult').meal_id).toBe(slotAt(initial, 1, 'breakfast', 'adult').meal_id);
    expect(slotAt(next, 1, 'breakfast', 'adult').meal_id).toBe(slotAt(initial, 0, 'breakfast', 'adult').meal_id);
    expectPreserved(initial, next, [slotAt(initial, 0, 'breakfast', 'adult'), slotAt(initial, 1, 'breakfast', 'adult')]);
    const ambiguous = await critique(next, 'Change Wednesday breakfast.');
    expect(ambiguous.plan).toEqual(next.plan);
  });

  it.each([
    'Do not change anything yet. Just tell me whether Wednesday dinner is easy.',
    'Maybe replace Tuesday dinner, but wait until I decide. Keep this plan for now.',
    'Swap my breakfasts? Actually, leave both tracks alone.',
    'Chicken is not a family favorite, but do not change the current week.',
    'Remove Monday lunch and change breakfast.',
  ])('preserves the plan when permission or target is missing: %s', async (text) => {
    const initial = await generate();
    expect((await critique(initial, text)).plan).toEqual(initial.plan);
  });

  it('does not clear slots from calendar context or partially apply an unsupported request', async () => {
    const initial = await generate();
    const contextOnly = await critique(initial, 'We have evening activities on Wednesday and company on Thursday.');
    expect(contextOnly.plan).toEqual(initial.plan);
    const unsupported = await critique(contextOnly, 'Remove Monday lunch and invent a brand new recipe with precisely 37 grams of protein for Tuesday dinner.');
    expect(unsupported.plan).toEqual(initial.plan);
  });

  it('retains family preferences across May follow-ups and accepts the requested frozen pizza', async () => {
    const id = 'jev-eval-may-family-' + Date.now();
    await db.collection('dev_meal_plan_sessions').doc(id).set({
      plan: mayWeek.after_second_gpt_response, meals_snapshot: historicalCatalog, history: [], is_finalized: false,
      created_at: mayWeek.created_at, updated_at: mayWeek.created_at,
    });
    const initial = await saved(id);
    const first = await critique(initial, mayWeek.backend_followups[1]!);
    expect(slotAt(first, 1, 'dinner').meal_id).not.toBeNull();
    expect(slotAt(first, 1, 'dinner').meal_name?.toLowerCase()).not.toContain('chili');
    expectReplacement(initial, first, 1, 'dinner');
    expectPreserved(initial, first, [slotAt(initial, 1, 'dinner')]);
    const second = await critique(first, mayWeek.backend_followups[2]!);
    expect(slotAt(second, 1, 'dinner').meal_name?.toLowerCase()).not.toMatch(/chili|lasagna/);
    expectReplacement(first, second, 1, 'dinner');
    expectPreserved(first, second, [slotAt(first, 1, 'dinner')]);
    const third = await critique(second, 'Tuesday dinner should be Frozen Pizza.', { provenance: 'synthetic_regression' });
    expect(slotAt(third, 1, 'dinner').meal_name).toBe('Frozen Pizza');
    expectPreserved(second, third, [slotAt(second, 1, 'dinner')]);
  });

  it.each([
    { text: 'We had baked spaghetti last week, so do not use that again.', remove: false },
    { text: 'We had baked spaghetti last week. Leave Tuesday dinner empty; no meal needed.', remove: true },
  ])('distinguishes food rejection from explicit clearing: $text', async ({ text, remove }) => {
    const id = 'jev-eval-rejection-' + Date.now();
    await db.collection('dev_meal_plan_sessions').doc(id).set({
      plan: mayWeek.after_first_gpt_response, meals_snapshot: historicalCatalog, history: [], is_finalized: false,
      created_at: mayWeek.created_at, updated_at: mayWeek.created_at,
    });
    const initial = await saved(id);
    const next = await critique(initial, text);
    const dinner = slotAt(next, 1, 'dinner');
    if (remove) expect(dinner.meal_id).toBeNull();
    else {
      expect(dinner.meal_id).not.toBeNull();
      expect(dinner.meal_id).not.toBe(slotAt(initial, 1, 'dinner').meal_id);
    }
    expectPreserved(initial, next, [slotAt(initial, 1, 'dinner')]);
  });

  it('Human-authored Doris-style rewrite: resolves the May compound request and preserves rejection history across follow-ups', async () => {
    const id = 'jev-eval-doris-may-' + Date.now();
    await db.collection('dev_meal_plan_sessions').doc(id).set({
      plan: mayWeek.plan, meals_snapshot: historicalCatalog, history: [], is_finalized: false,
      created_at: mayWeek.created_at, updated_at: mayWeek.created_at,
    });
    const initial = await saved(id);
    const first = await critique(initial, [
      'REMOVE Monday family breakfast: leave empty.',
      'REMOVE Monday family lunch: leave empty.',
      'REMOVE Monday family dinner: leave empty.',
      'REPLACE Tuesday family lunch, currently Easy Burritos (NYT), with a different family lunch. Keep it filled.',
      'REPLACE Tuesday family dinner, currently Apple Cheddar Chicken Burgers, salad, chips, with a different family dinner. Exclude that current meal because we ate it recently. Keep it filled.',
      'REMOVE Wednesday family dinner: leave empty.',
      'SET Thursday family dinner to exactly Garlic linguine, currently on Wednesday in the pre-edit plan.',
      'Keep every unlisted slot exactly unchanged. Apply all requested changes together.',
    ].join('\n'));
    expect(first.plan.filter((slot) => slot.day_index === 0).every((slot) => slot.meal_id === null)).toBe(true);
    expect(slotAt(first, 2, 'dinner').meal_id).toBeNull();
    expect(slotAt(first, 3, 'dinner').meal_name).toBe('Garlic linguine');
    for (const type of ['lunch', 'dinner'] as const) {
      expect(slotAt(first, 1, type).meal_id).not.toBeNull();
      expect(slotAt(first, 1, type).meal_id).not.toBe(slotAt(initial, 1, type).meal_id);
    }
    expectPreserved(initial, first, [...initial.plan.filter((slot) => slot.day_index === 0), slotAt(initial, 1, 'lunch'), slotAt(initial, 1, 'dinner'), slotAt(initial, 2, 'dinner'), slotAt(initial, 3, 'dinner')]);
    const excluded = [slotAt(initial, 1, 'dinner').meal_name, slotAt(first, 1, 'dinner').meal_name, 'Slow Cooker Chili (NYT)', 'Lasagna'];
    const second = await critique(first, 'REPLACE Tuesday family dinner, currently ' + slotAt(first, 1, 'dinner').meal_name + ', with another family dinner. Exclude these meals: ' + JSON.stringify(excluded) + '. The family does not like chili; Brad liking it does not make it suitable. Keep Tuesday dinner filled and every other slot exactly unchanged.');
    expect(excluded).not.toContain(slotAt(second, 1, 'dinner').meal_name);
    expect(slotAt(second, 1, 'dinner').meal_id).not.toBeNull();
    expectPreserved(first, second, [slotAt(first, 1, 'dinner')]);
    const third = await critique(second, 'SET Tuesday family dinner to exactly Frozen Pizza. Keep every other slot exactly unchanged.');
    expect(slotAt(third, 1, 'dinner').meal_name).toBe('Frozen Pizza');
    expectPreserved(second, third, [slotAt(second, 1, 'dinner')]);
  });

  it('Human-authored counterfactual: selects a no-cook lunch when removing Monday frees prep capacity', async () => {
    const generated = await generate();
    const plan = structuredClone(generated.plan);
    const monday = plan.find((slot) => slot.day_index === 0 && slot.meal_track === 'adult')!;
    const prep = plan.find((slot) => slot.meal_track === 'adult' && mealFor(generated, slot).prep_ahead)!;
    [monday.meal_id, prep.meal_id] = [prep.meal_id, monday.meal_id];
    [monday.meal_name, prep.meal_name] = [prep.meal_name, monday.meal_name];
    await db.collection('dev_meal_plan_sessions').doc(generated.id).update({ plan });
    const initial = await saved(generated.id);
    const text = [
      'REMOVE Monday family breakfast: leave empty.', 'REMOVE Monday Brad breakfast: leave empty.',
      'REMOVE Monday family lunch: leave empty.', 'REMOVE Monday family dinner: leave empty.',
      'REPLACE Saturday family dinner with a different family dinner. Keep the slot filled.',
      'REPLACE Sunday family dinner with a different family dinner. Keep the slot filled.',
      'REPLACE Sunday family lunch with a different effort-1 lunch requiring no cooking at serving time. Preparing a cold meal earlier is acceptable. Keep this slot filled.',
      'Keep every unlisted slot exactly unchanged. Apply all requested changes together.',
    ].join('\n');
    const next = await critique(initial, text, { outcome: 'applied' });
    expect(next.plan.filter((slot) => slot.day_index === 0).every((slot) => slot.meal_id === null)).toBe(true);
    expect(mealFor(next, slotAt(next, 6, 'lunch')).effort).toBe(1);
    for (const day of [5, 6]) expectReplacement(initial, next, day);
    expectPreserved(initial, next, [...initial.plan.filter((slot) => slot.day_index === 0), slotAt(initial, 5, 'dinner'), slotAt(initial, 6, 'dinner'), slotAt(initial, 6, 'lunch')]);
  });

  it('handles the actual May backend corrections and family preferences over three turns', async () => {
    const id = 'jev-eval-may-backend-' + Date.now();
    await db.collection('dev_meal_plan_sessions').doc(id).set({
      plan: mayWeek.after_first_gpt_response, meals_snapshot: historicalCatalog, history: [], is_finalized: false,
      created_at: mayWeek.created_at, updated_at: mayWeek.created_at,
    });
    const initial = await saved(id);
    const first = await critique(initial, mayWeek.backend_followups[0]!);
    expect(first.plan.filter((slot) => slot.day_index === 0).every((slot) => slot.meal_id === null)).toBe(true);
    expect(slotAt(first, 2, 'dinner').meal_id).toBeNull();
    expect(slotAt(first, 1, 'dinner').meal_id).not.toBeNull();
    expectReplacement(initial, first, 1, 'dinner');
    expectPreserved(initial, first, [...initial.plan.filter((slot) => slot.day_index === 0), slotAt(initial, 1, 'dinner'), slotAt(initial, 2, 'dinner')]);
    const second = await critique(first, mayWeek.backend_followups[1]!);
    expect(slotAt(second, 1, 'dinner').meal_name?.toLowerCase()).not.toContain('chili');
    expectReplacement(first, second, 1, 'dinner');
    expectPreserved(first, second, [slotAt(first, 1, 'dinner')]);
    const third = await critique(second, mayWeek.backend_followups[2]!);
    expect(slotAt(third, 1, 'dinner').meal_name?.toLowerCase()).not.toMatch(/chili|lasagna/);
    expectReplacement(second, third, 1, 'dinner');
    expectPreserved(second, third, [slotAt(second, 1, 'dinner')]);
  });

  it('resolves an unnamed follow-up from the last replacement', async () => {
    const initial = await generate();
    const first = await critique(initial, 'Replace Tuesday dinner with something different.');
    expectReplacement(initial, first, 1, 'dinner');
    const second = await critique(first, 'We had that recently too. Try something different again.');
    expectReplacement(first, second, 1, 'dinner');
    expectReplacement(initial, second, 1, 'dinner');
    expectPreserved(first, second, [slotAt(first, 1, 'dinner')]);
  });

  it('replays May’s move-then-remove request and family-preference follow-ups on the retained original plan', async () => {
    const id = 'jev-eval-may-' + Date.now();
    await db.collection('dev_meal_plan_sessions').doc(id).set({
      plan: mayWeek.plan, meals_snapshot: historicalCatalog, history: [], is_finalized: false,
      created_at: mayWeek.created_at, updated_at: mayWeek.created_at,
    });
    const initial = await saved(id);
    const first = await critique(initial, mayWeek.messages[0]!);
    expect(first.plan.filter((slot) => slot.day_index === 0).every((slot) => slot.meal_id === null)).toBe(true);
    expect(slotAt(first, 2, 'dinner').meal_id).toBeNull();
    expect(slotAt(first, 3, 'dinner').meal_name).toBe('Garlic linguine');
    expectReplacement(initial, first, 1, 'dinner');
    expectReplacement(initial, first, 1, 'lunch');
    expect(slotAt(first, 1, 'lunch').meal_id).not.toBeNull();
    expectPreserved(initial, first, [...initial.plan.filter((slot) => slot.day_index === 0), slotAt(initial, 1, 'lunch'), slotAt(initial, 1, 'dinner'), slotAt(initial, 2, 'dinner'), slotAt(initial, 3, 'dinner')]);
    const second = await critique(first, mayWeek.messages[1]!, { provenance: 'historical_raw_user' });
    expect(slotAt(second, 1, 'dinner').meal_name?.toLowerCase()).not.toContain('chili');
    expectReplacement(first, second, 1, 'dinner');
    expectPreserved(first, second, [slotAt(first, 1, 'dinner')]);
    const third = await critique(second, 'Had that recently too. Give Tuesday dinner something different again.', { provenance: 'synthetic_regression' });
    expect(slotAt(third, 1, 'dinner').meal_name?.toLowerCase()).not.toContain('chili');
    expectReplacement(second, third, 1);
    expect([slotAt(initial, 1, 'dinner').meal_id, slotAt(first, 1, 'dinner').meal_id, slotAt(second, 1, 'dinner').meal_id]).not.toContain(slotAt(third, 1, 'dinner').meal_id);
    expectPreserved(second, third, [slotAt(second, 1, 'dinner')]);
  });

  it('held-out: preserves distinct identical rejection turns and never cycles back', async () => {
    const initial = await generate();
    const text = 'Tuesday dinner is too familiar. Give us a different dinner there and keep the rest as it is.';
    const rejected = new Set([slotAt(initial, 1, 'dinner').meal_id]);
    let previous = initial;
    for (let turn = 0; turn < 3; turn++) {
      const next = await critique(previous, text, { outcome: 'applied' });
      expectReplacement(previous, next, 1);
      expect(rejected.has(slotAt(next, 1, 'dinner').meal_id)).toBe(false);
      expectPreserved(previous, next, [slotAt(previous, 1, 'dinner')]);
      rejected.add(slotAt(next, 1, 'dinner').meal_id);
      expect(next.history.filter((message) => message.role === 'user' && message.content === text)).toHaveLength(turn + 1);
      previous = next;
    }
  });

  it('held-out: reports missing ingredient evidence without partially clearing another slot', async () => {
    const initial = await generate();
    const next = await critique(initial,
      'Leave Monday lunch empty and replace Tuesday dinner with a meal verified peanut-free from a complete ingredient list. A dish name or a recipe link alone is not verification. Apply the two changes together.',
      { outcome: 'insufficient_evidence' });
    expect(next.plan).toEqual(initial.plan);
    expect(next.history.at(-1)?.operations).toEqual([]);
  });

  it('held-out: proves catalog infeasibility when the only dinner is explicitly rejected', async () => {
    const onlyDinner = historicalCatalog.find((meal) => meal.meal_type === 'dinner' && !meal.prep_ahead && !meal.has_red_meat)!;
    const id = 'jev-eval-infeasible-' + Date.now();
    const plan = [{ day_index: 1, meal_track: 'family', meal_type: 'dinner', meal_id: onlyDinner.id, meal_name: onlyDinner.name }];
    await db.collection('dev_meal_plan_sessions').doc(id).set({
      plan, meals_snapshot: [onlyDinner], history: [], is_finalized: false,
      created_at: mayWeek.created_at, updated_at: mayWeek.created_at,
    });
    const initial = await saved(id);
    const next = await critique(initial,
      'Replace Tuesday dinner with a different catalog dinner. Do not reuse its current meal, invent a recipe, or leave the slot empty.',
      { outcome: 'infeasible' });
    expect(next.plan).toEqual(initial.plan);
    expect(next.history.at(-1)?.operations).toEqual([]);
  });

  it('held-out: keeps an unavailable named dish separate from a substitute', async () => {
    const initial = await generate();
    const next = await critique(initial,
      'Tuesday dinner must be exactly Purple Moon Noodles with Starfruit. If that exact dish is unavailable in this session, keep the plan and explain that; no substitute.',
      { outcome: 'infeasible' });
    expect(next.plan).toEqual(initial.plan);
    expect(next.history.at(-1)?.operations).toEqual([]);
  });

  it('held-out: verifies draft critique, finalized revise, exact history, and persisted recency', async () => {
    const suffix = 'jev-eval-recency-' + recorder.activeSeed;
    const candidates = historicalCatalog.filter((meal) => meal.meal_type === 'dinner' && !meal.prep_ahead && !meal.has_red_meat && meal.name !== 'Frozen Pizza');
    const old = { ...candidates[0]!, id: suffix + '-old', last_planned: null };
    const retained = { ...candidates[1]!, id: suffix + '-retained', last_planned: null };
    const replacement = { ...historicalCatalog.find((meal) => meal.name === 'Frozen Pizza')!, id: suffix + '-new', last_planned: null };
    const meals = [old, retained, replacement];
    const plan = [
      { day_index: 1, meal_track: 'family', meal_type: 'dinner', meal_id: old.id, meal_name: old.name },
      { day_index: 2, meal_track: 'family', meal_type: 'dinner', meal_id: retained.id, meal_name: retained.name },
    ];
    const batch = db.batch();
    for (const meal of meals) batch.set(db.collection('dev_meals').doc(meal.id), meal);
    batch.set(db.collection('dev_meal_plan_sessions').doc(suffix), {
      plan, meals_snapshot: meals, history: [], is_finalized: false,
      created_at: mayWeek.created_at, updated_at: mayWeek.created_at,
    });
    await batch.commit();
    try {
      const initial = await saved(suffix);
      const draft = await critique(initial, 'Tuesday dinner should be exactly Frozen Pizza. Leave Wednesday alone.', { outcome: 'applied' });
      expect(slotAt(draft, 1, 'dinner').meal_id).toBe(replacement.id);
      expectPreserved(initial, draft, [slotAt(initial, 1, 'dinner')]);
      for (const meal of meals) expect((await db.collection('dev_meals').doc(meal.id).get()).get('last_planned')).toBeNull();

      const response = await http.post('/api/dev/mealplans/' + suffix + '/finalize').send({});
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      const finalized = await saved(suffix);
      expect(finalized.is_finalized).toBe(true);
      expect(finalized.plan).toEqual(draft.plan);
      expect(finalized.history).toEqual(draft.history);
      expect((await db.collection('dev_meals').doc(old.id).get()).get('last_planned')).toBeNull();
      for (const meal of [replacement, retained]) expect((await db.collection('dev_meals').doc(meal.id).get()).get('last_planned')).toEqual(expect.any(String));

      const revised = await critique(finalized, 'Leave Tuesday dinner empty; no dinner is needed that day. Keep Wednesday dinner unchanged.', { route: 'revise', outcome: 'applied' });
      expect(slotAt(revised, 1, 'dinner').meal_id).toBeNull();
      expectPreserved(finalized, revised, [slotAt(finalized, 1, 'dinner')]);
      expect((await db.collection('dev_meals').doc(replacement.id).get()).get('last_planned')).toBeNull();
      const retainedRecency = (await db.collection('dev_meals').doc(retained.id).get()).get('last_planned') as unknown;
      expect(retainedRecency).toBe(revised.updated_at);

      const unchanged = await critique(revised, 'No changes needed. Keep this week as it is.', { route: 'revise', outcome: 'no_change_requested' });
      expect(unchanged.plan).toEqual(revised.plan);
      expect((await db.collection('dev_meals').doc(retained.id).get()).get('last_planned')).toBe(retainedRecency);
    } finally {
      const cleanup = db.batch();
      for (const meal of meals) cleanup.delete(db.collection('dev_meals').doc(meal.id));
      await cleanup.commit();
    }
  });


  it('policy: an ordinary replacement does not introduce another core dish variant', async () => {
    const existing = catalog.find((meal) => meal.name === 'Cheese Quesadilla')!;
    const variant = catalog.find((meal) => meal.name === 'Crispy-Edged Quesadilla (NYT)')!;
    const old = catalog.find((meal) => meal.name === 'Marry Me Chicken, naan, fruit')!;
    const alternative = catalog.find((meal) => meal.name === 'Frozen Pizza')!;
    expect(existing.meal_type).toBe('lunch');
    for (const meal of [variant, old, alternative]) expect(meal.meal_type).toBe('dinner');
    const plan: MealPlanEntry[] = [
      { day_index: 0, meal_track: 'family', meal_type: 'lunch', meal_id: existing.id, meal_name: existing.name },
      { day_index: 1, meal_track: 'family', meal_type: 'dinner', meal_id: old.id, meal_name: old.name },
    ];
    const id = 'jev-eval-core-family-' + recorder.activeSeed;
    await db.collection('dev_meal_plan_sessions').doc(id).set({
      plan, meals_snapshot: [existing, variant, old, alternative], history: [], is_finalized: false,
      created_at: recorder.frozenGenerationDate, updated_at: recorder.frozenGenerationDate,
    });
    const initial = await saved(id);
    const next = await critique(initial,
      'Please pick a different family dinner for Tuesday. Keep every other assignment as saved.',
      { outcome: 'applied', provenance: 'synthetic_policy_regression' });
    expectReplacement(initial, next, 1, 'dinner');
    expect(slotAt(next, 1, 'dinner').meal_id).toBe(alternative.id);
    expect(next.plan.filter((slot) => slot.meal_name?.toLowerCase().includes('quesadilla'))).toHaveLength(1);
    expectPreserved(initial, next, [slotAt(initial, 1, 'dinner')]);
  });

  const savedRecoveryPath = process.env['JEV_EVAL_SAVED_RECOVERY_INPUT'];
  if (savedRecoveryPath !== undefined) {
    it('recovery: one clarification resolves an exact saved safe refusal', async () => {
      const artifact = z.object({ session: mealPlanSessionSchema, expected_plan: mealPlanSessionSchema.shape.plan,
        recovery_request: z.string().min(1), provenance: z.record(z.string(), z.unknown()),
      }).parse(JSON.parse(readFileSync(savedRecoveryPath, 'utf8')) as unknown);
      const { id, ...data } = artifact.session;
      await db.collection('dev_meal_plan_sessions').doc(id).set(data);
      const before = await saved(id);
      expect(before).toEqual(artifact.session);
      expect(before.history.at(-1)?.operations).toEqual([]);
      recorder.observe({ event: 'saved_safe_refusal_recovery', source_sha256: hash(readFileSync(savedRecoveryPath, 'utf8')),
        provenance: artifact.provenance, extra_turn_count: 1, historical_first_attempt_contract_passed: false });
      const after = await critiqueOnce(before, artifact.recovery_request,
        { outcome: 'applied', provenance: 'human_authored_recovery' });
      expect(after.plan).toEqual(artifact.expected_plan);
      expect(after.history.slice(0, before.history.length)).toEqual(before.history);
      expect(after.history).toHaveLength(before.history.length + 2);
    });
  }

  const undoRecoveryPath = process.env['JEV_EVAL_UNDO_RECOVERY_INPUT'];
  if (undoRecoveryPath !== undefined) {
    it('recovery: one explicit restore resolves the reconstructed retained undo refusal', async () => {
      const artifact = z.object({ session: mealPlanSessionSchema, original_plan: mealPlanSessionSchema.shape.plan,
        provenance: z.record(z.string(), z.unknown()),
      }).parse(JSON.parse(readFileSync(undoRecoveryPath, 'utf8')) as unknown);
      const { id, ...data } = artifact.session;
      await db.collection('dev_meal_plan_sessions').doc(id).set(data);
      const before = await saved(id);
      expect(before).toEqual(artifact.session);
      expect(before.history.at(-1)?.operations).toEqual([]);
      const original = artifact.original_plan.find((slot) => slot.day_index === 0 && slot.meal_type === 'dinner' && slot.meal_track === 'family');
      expect(original?.meal_name).toBeTruthy();
      recorder.observe({ event: 'reconstructed_retained_undo_recovery', source_sha256: hash(readFileSync(undoRecoveryPath, 'utf8')),
        provenance: artifact.provenance, extra_turn_count: 1, historical_first_attempt_contract_passed: false });
      const after = await critiqueOnce(before,
        `Restore Monday’s family dinner to exactly ${original!.meal_name}, which was there before my previous change. Keep Wednesday’s accepted replacement and every other saved assignment unchanged.`,
        { outcome: 'applied', provenance: 'human_authored_recovery' });
      expect(slotAt(after, 0, 'dinner')).toEqual(original);
      expectPreserved(before, after, [slotAt(before, 0, 'dinner')]);
      expect(after.history.slice(0, before.history.length)).toEqual(before.history);
      expect(after.history.at(-1)?.previous_assignments).toEqual([slotAt(before, 0, 'dinner')]);
    });
  }

  const dorisArtifactPath = process.env['JEV_EVAL_DORIS_ARTIFACT'];
  if (dorisArtifactPath !== undefined) {
    it('actualDoris: retained May request interpreted by the delivery-disabled gateway', async () => {
      const artifact = readFileSync(dorisArtifactPath, 'utf8');
      const input = z.object({ critique: z.string().min(1), context: critiqueContextSchema }).strict().parse(JSON.parse(artifact) as unknown);
      const evidencePath = process.env['JEV_EVAL_DORIS_EVIDENCE'];
      if (evidencePath === undefined) throw new Error('An actual Doris replay requires JEV_EVAL_DORIS_EVIDENCE from the recorded gateway invocation');
      const evidence = z.object({
        status: z.literal('completed'), model: z.string(), provider: z.string(),
        input_tokens: z.number().nonnegative(), output_tokens: z.number().nonnegative(),
        reasoning_tokens: z.number().nonnegative(), cost_usd: z.number().nonnegative(), elapsed_ms: z.number().nonnegative(),
        started_at: z.string(), tool_calls: z.literal(0), paid_fixture_calls: z.literal(1),
        strict_schema_valid: z.literal(true), original_feedback_preserved: z.literal(true),
        prompt_hash: z.string(), skill_hash: z.string(), output_hash: z.string(), request_hash: z.string(),
        source_may_week_hash: z.string(), source_may_catalog_hash: z.string(),
      }).parse(JSON.parse(readFileSync(evidencePath, 'utf8')) as unknown);
      expect(evidence.request_hash).toBe(hash(artifact));
      expect(evidence.source_may_week_hash).toBe(hash(readFileSync(new URL('./fixtures/may-week.json', import.meta.url), 'utf8')));
      expect(evidence.source_may_catalog_hash).toBe(hash(readFileSync(new URL('./fixtures/may-catalog.json', import.meta.url), 'utf8')));
      recorder.observe({
        upstream_interpreter: 'actual_doris_delivery_disabled_gateway',
        interpreter_executed_in_this_test_process: false,
        imported_request_sha256: hash(artifact), upstream_measurement: evidence,
        cost_accounting: 'One separately executed interpreter call is shared by the paired backend replays; do not double-count it in aggregate spend.',
      });
      const id = 'jev-eval-actual-doris-may-' + recorder.activeSeed;
      await db.collection('dev_meal_plan_sessions').doc(id).set({
        plan: mayWeek.plan, meals_snapshot: historicalCatalog, history: [], is_finalized: false,
        created_at: mayWeek.created_at, updated_at: mayWeek.created_at,
      });
      const initial = await saved(id);
      const next = await critique(initial, input.critique, { context: input.context, provenance: 'live_doris_forwarded', outcome: 'applied' });
      expect(next.plan.filter((slot) => slot.day_index === 0).every((slot) => slot.meal_id === null)).toBe(true);
      expect(slotAt(next, 2, 'dinner').meal_id).toBeNull();
      expect(slotAt(next, 3, 'dinner').meal_name).toBe('Garlic linguine');
      expectReplacement(initial, next, 1, 'dinner');
      expectReplacement(initial, next, 1, 'lunch');
      expectPreserved(initial, next, [...initial.plan.filter((slot) => slot.day_index === 0), slotAt(initial, 1, 'lunch'), slotAt(initial, 1, 'dinner'), slotAt(initial, 2, 'dinner'), slotAt(initial, 3, 'dinner')]);
    });
  }

  it('concurrency: simultaneous live critiques persist exactly one revision', async () => {
    const old = catalog.find((meal) => meal.meal_type === 'dinner' && !meal.has_red_meat && !meal.prep_ahead && meal.name !== 'Frozen Pizza')!;
    const replacement = catalog.find((meal) => meal.name === 'Frozen Pizza')!;
    const id = 'jev-eval-concurrent-' + recorder.activeSeed;
    const entry: MealPlanEntry = { day_index: 1, meal_track: 'family', meal_type: 'dinner', meal_id: old.id, meal_name: old.name };
    await db.collection('dev_meal_plan_sessions').doc(id).set({
      plan: [entry], meals_snapshot: [old, replacement], history: [], is_finalized: false,
      created_at: recorder.frozenGenerationDate, updated_at: recorder.frozenGenerationDate,
    });
    const initial = await saved(id);
    const text = 'Set Tuesday dinner to exactly Frozen Pizza.';
    // One recorded workload intentionally contains two simultaneous identical requests.
    // Async-local inference context keeps their physical provider attempts distinct.
    const turn = recorder.startTurn('critique', text, initial.plan, initial.history, initial.meals_snapshot);
    turn.expected_outcome = 'applied';
    const started = performance.now();
    try {
      const responses = await Promise.all([0, 1].map(async () =>
        http.post('/api/dev/mealplans/' + id + '/critique').send({ critique: text })));
      const final = await saved(id);
      const statuses = responses.map((response) => response.status).sort();
      recorder.observe({ concurrent_requests: 2, statuses });
      recorder.turnReadback(turn, responses.map((response) => ({ status: response.status, body: response.body as unknown })), final);
      turn.final_plan_hash = hash(final.plan);
      turn.saved_history_hash = hash(final.history);
      expect(statuses).toEqual([200, 409]);
      const winner = responses.find((response) => response.status === 200)!;
      const loser = responses.find((response) => response.status === 409)!;
      expect((loser.body as ApiResponse<unknown>).error?.code).toBe('SESSION_CONFLICT');
      const body = critiqueResultSchema.parse((winner.body as ApiResponse<unknown>).data);
      turn.http_status = winner.status;
      turn.outcome = body.outcome ?? null;
      turn.operation_count = body.operations.length;
      expect(body.errors).toEqual([]);
      expect(body.outcome).toBe('applied');
      expect(final.plan).toEqual([{ ...entry, meal_id: replacement.id, meal_name: replacement.name }]);
      expect(final.plan).toEqual(body.plan);
      expect(final.history).toEqual([
        { role: 'user', content: text },
        { role: 'assistant', content: body.explanation, operations: body.operations, previous_assignments: [entry] },
      ]);
      expect(final.is_finalized).toBe(false);
      turn.readback_verified = true;
    } finally {
      turn.milliseconds = Math.round(performance.now() - started);
      recorder.flush();
    }
  });

  if (process.env['JEV_EVAL_BOUNDARY_CONFIRMATION'] === '1') {
    describe('independent history-boundary confirmation', () => {
      registerBoundaryConfirmations({
        catalog, historicalCatalog, generate, critique, slotAt, mealFor,
        expectReplacement, expectPreserved,
        async create(plan, meals): Promise<MealPlanSession> {
          const id = 'jev-boundary-confirmation-' + hash({ seed: recorder.activeSeed, plan, meals }).slice(0, 24);
          await db.collection('dev_meal_plan_sessions').doc(id).set({
            plan, meals_snapshot: meals, history: [], is_finalized: false,
            created_at: recorder.frozenGenerationDate, updated_at: recorder.frozenGenerationDate,
          });
          return saved(id);
        },
      });
    });
  }

  if (process.env['JEV_EVAL_FRESH_CONFIRMATION'] === '1') {
    describe('independent confirmation round two', () => {
      registerFreshConfirmations({
        catalog, historicalCatalog, generate, critique, slotAt, mealFor,
        expectReplacement, expectPreserved,
        async create(plan, meals): Promise<MealPlanSession> {
          const id = 'jev-fresh-confirmation-' + hash({ seed: recorder.activeSeed, plan, meals }).slice(0, 24);
          await db.collection('dev_meal_plan_sessions').doc(id).set({
            plan, meals_snapshot: meals, history: [], is_finalized: false,
            created_at: recorder.frozenGenerationDate, updated_at: recorder.frozenGenerationDate,
          });
          return saved(id);
        },
      });
    });
  }

  describe('independent final confirmation', () => {
    async function isolatedPlan(name: string, plan: MealPlanEntry[], meals: Meal[]): Promise<MealPlanSession> {
      const id = 'jev-confirmation-' + hash(`${recorder.activeSeed}:${name}`).slice(0, 24);
      await db.collection('dev_meal_plan_sessions').doc(id).set({
        plan, meals_snapshot: meals, history: [], is_finalized: false,
        created_at: recorder.frozenGenerationDate, updated_at: recorder.frozenGenerationDate,
      });
      return saved(id);
    }

    function assignment(day: number, meal: Meal): MealPlanEntry {
      return { day_index: day, meal_type: meal.meal_type, meal_track: meal.audience, meal_id: meal.id, meal_name: meal.name };
    }

    it('confirmation: unavailable nutritional evidence is atomic', async () => {
      const initial = await generate();
      const next = await critique(initial,
        'Please arrange a Tuesday dinner with a verified maximum of 400 mg sodium per serving, and take Wednesday lunch off the schedule. Only make these changes together once the nutrition data verifies that limit.',
        { outcome: 'insufficient_evidence' });
      expect(next.plan).toEqual(initial.plan);
      expect(next.history.at(-1)?.operations).toEqual([]);
    });

    it('confirmation: a future preference note preserves the current draft', async () => {
      const initial = await generate();
      const next = await critique(initial,
        'Replace Tuesday dinner with something that has not been served recently.',
        { outcome: 'no_change_requested', context: {
          original_request: 'Tuesday supper is another one we ate lately. This is only a note for next week: leave every assignment in the current draft exactly as saved.',
          interpretation: 'The user rejected Tuesday dinner, so replace that slot now.',
        } });
      expect(next.plan).toEqual(initial.plan);
      expect(next.history.at(-1)?.operations).toEqual([]);
    });

    it('confirmation: unique breakfast names identify the audience', async () => {
      const initial = await generate();
      const first = slotAt(initial, 0, 'breakfast', 'adult');
      const second = initial.plan.find((slot) => slot.meal_type === 'breakfast' && slot.meal_track === 'adult' && slot.meal_id !== first.meal_id)!;
      const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      expect(initial.meals_snapshot.filter((meal) => meal.name === first.meal_name)).toHaveLength(1);
      expect(initial.meals_snapshot.filter((meal) => meal.name === second.meal_name)).toHaveLength(1);
      const next = await critique(initial,
        `By Monday breakfast I mean ${first.meal_name}. Exchange it with ${dayNames[second.day_index]}'s ${second.meal_name}. The names identify the two breakfasts; leave all other breakfasts and meals in place.`,
        { outcome: 'applied' });
      expect(slotAt(next, first.day_index, 'breakfast', 'adult').meal_id).toBe(second.meal_id);
      expect(slotAt(next, second.day_index, 'breakfast', 'adult').meal_id).toBe(first.meal_id);
      expectPreserved(initial, next, [first, second]);
    });

    it('confirmation: a household day away clears every present track', async () => {
      const initial = await generate();
      const next = await critique(initial,
        'Saturday is an all-day family trip. Nobody needs any of the meals assigned to Saturday, including either breakfast. Take that whole day out of this plan; keep the other six days.',
        { outcome: 'applied' });
      const removed = initial.plan.filter((slot) => slot.day_index === 5);
      expect(removed).toHaveLength(4);
      for (const slot of removed) expect(slotAt(next, slot.day_index, slot.meal_type, slot.meal_track)).toEqual({ ...slot, meal_id: null, meal_name: null });
      expectPreserved(initial, next, removed);
    });

    it('confirmation: separate rejections survive a narrower follow-up', async () => {
      const initial = await generate();
      const first = await critique(initial,
        'Tuesday and Thursday suppers are both repeats for us. Give each night a different dinner and leave the other five dinners, breakfasts, and lunches where they are.',
        { outcome: 'applied' });
      const rejected = [slotAt(initial, 1, 'dinner').meal_id, slotAt(initial, 3, 'dinner').meal_id];
      for (const day of [1, 3]) {
        expectReplacement(initial, first, day);
        expect(rejected).not.toContain(slotAt(first, day, 'dinner').meal_id);
      }
      expectPreserved(initial, first, [slotAt(initial, 1, 'dinner'), slotAt(initial, 3, 'dinner')]);
      const second = await critique(first,
        "The new Thursday option is also too recent. Find one more option there. Tuesday's revision is fine; retain it.",
        { outcome: 'applied' });
      expectReplacement(first, second, 3);
      expect([...rejected, slotAt(first, 3, 'dinner').meal_id]).not.toContain(slotAt(second, 3, 'dinner').meal_id);
      expectPreserved(first, second, [slotAt(first, 3, 'dinner')]);
    });

    it('confirmation: three exact dinners rotate from their pre-edit identities', async () => {
      const meals = catalog.filter((meal) => meal.meal_type === 'dinner' && !meal.has_red_meat && !meal.prep_ahead).slice(0, 3);
      expect(meals).toHaveLength(3);
      const [first, second, third] = meals as [Meal, Meal, Meal];
      const initial = await isolatedPlan('three-dinner-rotation', [assignment(1, first), assignment(2, second), assignment(3, third)], meals);
      const next = await critique(initial,
        `Move Tuesday's ${first.name} to Wednesday, Wednesday's ${second.name} to Thursday, and Thursday's ${third.name} to Tuesday. Those three dinners are a rotation, and their pre-edit identities are the ones I mean.`,
        { outcome: 'applied' });
      expect(slotAt(next, 1, 'dinner').meal_id).toBe(third.id);
      expect(slotAt(next, 2, 'dinner').meal_id).toBe(first.id);
      expect(slotAt(next, 3, 'dinner').meal_id).toBe(second.id);
      expect(next.plan).toHaveLength(initial.plan.length);
    });

    it('confirmation: two lunch choices share the remaining prep capacity', async () => {
      const fixed = catalog.filter((meal) => meal.meal_type === 'breakfast' && meal.prep_ahead).slice(0, 2);
      const old = catalog.filter((meal) => meal.meal_type === 'lunch' && !meal.prep_ahead && meal.effort === 2).slice(0, 2);
      const cold = catalog.filter((meal) => meal.meal_type === 'lunch' && meal.prep_ahead && meal.effort === 1).slice(0, 2);
      const sandwich = catalog.find((meal) => meal.name === 'Peanut Butter and Jelly Sandwich and Fruit')!;
      expect(fixed).toHaveLength(2);
      expect(old).toHaveLength(2);
      expect(cold).toHaveLength(2);
      const initial = await isolatedPlan('joint-lunch-capacity', [assignment(0, fixed[0]!), assignment(1, fixed[1]!), assignment(1, old[0]!), assignment(2, old[1]!)], [...fixed, ...old, ...cold, sandwich]);
      const next = await critique(initial,
        `Neither ${old[0]!.name} nor ${old[1]!.name} works for lunch this week. Replace Tuesday and Wednesday lunches with two different alternatives from this catalog. Keep the two breakfasts exactly where they are and observe the weekly prep limit.`,
        { outcome: 'applied' });
      for (const day of [1, 2]) {
        expectReplacement(initial, next, day, 'lunch');
        expect(old.map((meal) => meal.id)).not.toContain(slotAt(next, day, 'lunch').meal_id);
      }
      expect(slotAt(next, 1, 'lunch').meal_id).not.toBe(slotAt(next, 2, 'lunch').meal_id);
      expect(next.plan.filter((slot) => mealFor(next, slot).prep_ahead)).toHaveLength(3);
      expectPreserved(initial, next, [slotAt(initial, 1, 'lunch'), slotAt(initial, 2, 'lunch')]);
    });

    it('confirmation: an exact effort override and clear preserve an empty label', async () => {
      const dinner = catalog.find((meal) => meal.meal_type === 'dinner' && !meal.has_red_meat && meal.effort < 8)!;
      const elaborate = catalog.find((meal) => meal.meal_type === 'dinner' && meal.effort >= 8)!;
      const lunch = catalog.find((meal) => meal.meal_type === 'lunch' && !meal.prep_ahead)!;
      const out: MealPlanEntry = { day_index: 4, meal_type: 'dinner', meal_track: 'family', meal_id: null, meal_name: 'Eating out' };
      const initial = await isolatedPlan('exact-effort-and-label', [assignment(0, dinner), assignment(1, lunch), out], [dinner, elaborate, lunch]);
      const next = await critique(initial,
        `For Monday I want ${elaborate.name} for dinner, even if it takes more effort than usual. We will not need Tuesday lunch after all. Keep Friday's arrangement exactly as written.`,
        { outcome: 'applied' });
      expect(slotAt(next, 0, 'dinner').meal_id).toBe(elaborate.id);
      expect(slotAt(next, 1, 'lunch').meal_id).toBeNull();
      expectPreserved(initial, next, [slotAt(initial, 0, 'dinner'), slotAt(initial, 1, 'lunch')]);
      expect(slotAt(next, 4, 'dinner')).toEqual(out);
    });
  });

});
