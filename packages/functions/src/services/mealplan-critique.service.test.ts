import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JevAnswer, JevQuestion, MealPlanSession } from '../shared.js';
import { createMeal, createMealPlanEntry, createMealPlanSession } from '../__tests__/utils/index.js';
vi.mock('./mealplan-jev.service.js', () => ({ evaluateJev: vi.fn() }));
import { evaluateJev } from './mealplan-jev.service.js';
import { processCritique } from './mealplan-critique.service.js';
const evaluate = vi.mocked(evaluateJev);
function session(): MealPlanSession {
  return createMealPlanSession({ plan: [
    createMealPlanEntry({ day_index: 0, meal_id: 'pasta', meal_name: 'Pasta', meal_type: 'dinner' }),
    createMealPlanEntry({ day_index: 1, meal_id: 'chicken', meal_name: 'Chicken', meal_type: 'dinner' }),
    createMealPlanEntry({ day_index: 4, meal_id: null, meal_name: 'Eating out', meal_type: 'dinner' }),
  ], meals_snapshot: [
    createMeal({ id: 'pasta', name: 'Pasta', meal_type: 'dinner', effort: 4, prep_ahead: false, has_red_meat: false }),
    createMeal({ id: 'chicken', name: 'Chicken', meal_type: 'dinner', effort: 3, prep_ahead: false, has_red_meat: false }),
    createMeal({ id: 'soup', name: 'Soup', meal_type: 'dinner', effort: 1, prep_ahead: false, has_red_meat: false }),
    createMeal({ id: 'steak', name: 'Steak', meal_type: 'dinner', effort: 7, prep_ahead: false, has_red_meat: true }),
    createMeal({ id: 'adult', name: 'Protein oats', meal_type: 'breakfast', audience: 'adult' }),
  ], history: [] });
}
function audienceSession(): MealPlanSession {
  return createMealPlanSession({ plan: [
    createMealPlanEntry({ day_index: 0, meal_track: 'family', meal_type: 'breakfast', meal_id: 'family-original', meal_name: 'Family cereal' }),
    createMealPlanEntry({ day_index: 0, meal_track: 'adult', meal_type: 'breakfast', meal_id: 'adult-original', meal_name: 'Protein oats' }),
    createMealPlanEntry({ day_index: 1, meal_track: 'family', meal_type: 'dinner', meal_id: 'dinner', meal_name: 'Pasta' }),
  ], meals_snapshot: [
    createMeal({ id: 'family-original', name: 'Family cereal', meal_type: 'breakfast', audience: 'family', prep_ahead: false, has_red_meat: false }),
    createMeal({ id: 'adult-original', name: 'Protein oats', meal_type: 'breakfast', audience: 'adult', prep_ahead: false, has_red_meat: false }),
    createMeal({ id: 'family-new', name: 'Family toast', meal_type: 'breakfast', audience: 'family', prep_ahead: false, has_red_meat: false }),
    createMeal({ id: 'adult-new', name: 'Protein smoothie', meal_type: 'breakfast', audience: 'adult', prep_ahead: false, has_red_meat: false }),
    createMeal({ id: 'dinner', name: 'Pasta', meal_type: 'dinner', audience: 'family', prep_ahead: false, has_red_meat: false }),
  ], history: [] });
}
function choice(question: JevQuestion, selected: string, probability = 0.99): JevAnswer {
  if (question.type !== 'choice') throw new Error('Expected choice');
  const options = Object.keys(question.criteria);
  if (!options.includes(selected)) throw new Error('Missing choice ' + selected);
  return { type: 'choice', choice: selected, confidence: probability,
    probabilities: Object.fromEntries(options.map((key) => [key, key === selected ? probability : (1 - probability) / (options.length - 1)])) };
}
function decisions(assignments: Record<string, string>, options: { request?: string; verify?: number; probability?: number; unsuitable?: string[]; rejected?: string[]; scopeReview?: string; audience?: string } = {}): void {
  evaluate.mockImplementation(async (_state, questions) => Object.fromEntries(Object.entries(questions).map(([id, question]) => {
    if (question.type === 'noul') return [id, { type: 'noul', noul: (id.startsWith('fit_') || id === 'scope_complete') ? (options.unsuitable?.includes(id) ? 0.1 : 0.99) : options.verify ?? 0.99 }];
    if (id.startsWith('rejection_')) return [id, choice(question, options.rejected?.includes(id) ? 'rejected' : 'available')];
    if (id.startsWith('fit_')) return [id, choice(question, options.unsuitable?.includes(id) ? 'violates' : 'fits')];
    if (id === 'request') return [id, choice(question, options.request ?? 'edit')];
    if (id === 'scope_review') return [id, choice(question, options.scopeReview ?? 'correct')];
    if (id.startsWith('audience_')) return [id, choice(question, options.audience ?? 'both')];
    if (id === 'requirements') return [id, choice(question, (options.verify ?? 1) < 0.5 ? 'violated' : 'satisfied')];
    if (id === 'repair_target') return [id, choice(question, 'cannot_repair')];
    if (id.startsWith('clear_')) return [id, choice(question, (options.verify ?? 1) < 0.5 ? 'food_rejected' : 'explicitly_unneeded')];
    if (id.startsWith('scope_')) {
      const selected = assignments[id.replace('scope_', 'slot_')] ?? 'preserve';
      return [id, choice(question, selected.startsWith('meal_') ? 'replace' : selected)];
    }
    const selected = Object.values(assignments).find((value) => question.type === 'choice' && Object.hasOwn(question.criteria, value));
    return [id, choice(question, selected ?? Object.keys(question.criteria)[0]!, options.probability)];
  })));
}
function repairDecisions(assignments: Record<string, string>, options: { target?: string; alternative?: string; rejectAgain?: boolean; failedFit?: string; failedClear?: string; failedFamily?: string } = {}): void {
  decisions(assignments);
  const baseline = evaluate.getMockImplementation()!;
  let verifications = 0;
  evaluate.mockImplementation(async (state, questions, key, signal) => {
    const answers = await baseline(state, questions, key, signal);
    if (questions['requirements']) {
      verifications += 1;
      if (verifications === 1 || options.rejectAgain) {
        const id = options.failedFamily ?? options.failedFit ?? 'requirements';
        answers[id] = choice(questions[id]!, options.failedFamily ? 'new_repeat' : options.failedFit ? 'violates' : 'violated');
        if (options.failedClear) answers[options.failedClear] = choice(questions[options.failedClear]!, 'food_rejected');
      }
    }
    if (questions['repair_target']) answers['repair_target'] = choice(questions['repair_target'], options.target ?? 'cannot_repair');
    if (questions['meal'] && state['food_validation_conflicts']) answers['meal'] = choice(questions['meal'], options.alternative ?? 'meal_3');
    return answers;
  });
}
describe('direct JEV critique decisions', () => {
  it('only offers kid breakfasts when adult breakfast is disabled', async () => {
    vi.stubEnv('ADULT_BREAKFAST_ENABLED', 'false');
    evaluate.mockImplementation(async (_state, questions) => ({ request: choice(questions['request']!, 'no_change') }));
    const original = audienceSession();
    await processCritique(original, 'Keep this plan', 'key');
    const [state, questions] = evaluate.mock.calls[0]!;
    expect(state['current_plan']).toEqual(['Monday family breakfast: Family cereal', 'Tuesday family dinner: Pasta']);
    expect(state['catalog_meal_names']).toEqual(['Family cereal', 'Family toast', 'Pasta']);
    expect(state['rules']).toMatchObject({ available_slots: expect.stringContaining('Adult breakfasts are disabled') });
    expect(Object.keys(questions)).not.toContain('audience_0');
    expect(original.plan).toHaveLength(3);
  });
  beforeEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); vi.stubEnv('ADULT_BREAKFAST_ENABLED', 'true'); });
  afterEach(() => vi.unstubAllEnvs());
  it('selects actual meals, verifies the complete proposal, and returns minimal edits', async () => {
    decisions({ slot_0: 'meal_2' });
    const original = session(); const before = structuredClone(original);
    const result = await processCritique(original, 'Monday dinner to Soup', 'key');
    expect(result).toMatchObject({ outcome: 'applied', operations: [{ day_index: 0, meal_track: 'family', meal_type: 'dinner', new_meal_id: 'soup' }] });
    expect(result.explanation).toContain('from Pasta'); expect(original).toEqual(before);
    expect(evaluate).toHaveBeenCalledTimes(6); expect(evaluate.mock.calls[0]?.[3]).toBe(evaluate.mock.calls[1]?.[3]);
  });
  it('provides catalog, applied history, and separately attributed context', async () => {
    const original = session(); original.history = [{ role: 'user', content: 'No tuna' }];
    decisions({ slot_0: 'meal_2' });
    await processCritique(original, 'Monday dinner needs changing', 'key', { original_request: 'that again', interpretation: 'Monday dinner', calendar_context: 'practice 5 pm' });
    expect(evaluate.mock.calls[0]?.[0]).toMatchObject({ context: { original_request: 'that again' }, conversation_history: original.history });
    expect(evaluate.mock.calls[0]?.[0]['catalog_meal_names']).toHaveLength(5);
    expect(evaluate.mock.calls.find(([, questions]) => Object.keys(questions).some((key) => key.startsWith('fit_')))?.[0]['catalog']).toHaveLength(5);
  });
  it('uses original user words throughout semantic decisions instead of a contradictory forwarded critique', async () => {
    const original = session(); const before = structuredClone(original);
    const originalRequest = 'Change Monday dinner to Soup and keep Tuesday dinner unchanged.';
    const forwarded = 'Change Tuesday dinner to Steak and keep Monday dinner unchanged.';
    const context = { original_request: originalRequest, interpretation: 'Clear Monday dinner entirely.' };
    const contextBefore = structuredClone(context);
    decisions({ slot_0: 'meal_2' });
    const result = await processCritique(original, forwarded, 'key', context);
    expect(result).toMatchObject({ outcome: 'applied', operations: [{ day_index: 0, meal_track: 'family', meal_type: 'dinner', new_meal_id: 'soup' }] });
    expect(result.operations).toHaveLength(1);
    expect(original).toEqual(before); expect(context).toEqual(contextBefore);
    for (const [state, questions] of evaluate.mock.calls) {
      expect(state['latest_request']).toBe(originalRequest);
      expect(state['forwarded_critique']).toBe(forwarded);
      expect(state['chronological_exchange']).toEqual([{ role: 'user', content: originalRequest }]);
      for (const [id, question] of Object.entries(questions)) {
        if (id.startsWith('family_')) continue;
        expect(question.instructions).toContain(JSON.stringify(originalRequest));
        expect(question.instructions).not.toContain(JSON.stringify(forwarded));
        expect(question.instructions).not.toContain(context.interpretation);
      }
    }
  });
  it('uses historical original user words for rejection evidence while retaining the forwarded text separately', async () => {
    const original = session();
    const originalWords = 'Tuesday Steak is too familiar. Give us something different.';
    const forwardedWords = 'Keep Steak available and move Tuesday dinner to Chicken.';
    original.history = [
      { role: 'user', content: forwardedWords, context: { original_request: originalWords, interpretation: 'Steak was moved, never rejected.' } },
      { role: 'assistant', content: 'Tuesday changed to Chicken', operations: [{ day_index: 1, meal_track: 'family', meal_type: 'dinner', new_meal_id: 'chicken' }], previous_assignments: [createMealPlanEntry({ day_index: 1, meal_type: 'dinner', meal_id: 'steak', meal_name: 'Steak' })] },
    ];
    const before = structuredClone(original);
    decisions({ slot_0: 'meal_2' }, { rejected: ['rejection_3'] });
    expect((await processCritique(original, 'Change Monday dinner to Soup', 'key')).outcome).toBe('applied');
    expect(original).toEqual(before);
    for (const [state] of evaluate.mock.calls) {
      expect(state['conversation_history']).toEqual([
        { ...before.history[0], content: originalWords, forwarded_content: forwardedWords },
        before.history[1],
      ]);
      expect(state['chronological_exchange']).toEqual([
        { ...before.history[0], content: originalWords, forwarded_content: forwardedWords },
        before.history[1],
        { role: 'user', content: 'Change Monday dinner to Soup' },
      ]);
    }
    const rejection = evaluate.mock.calls.find(([, questions]) => questions['rejection_3'])?.[1]['rejection_3'];
    expect(rejection?.instructions).toContain('"earlier_user_words":' + JSON.stringify(originalWords));
    expect(rejection?.instructions).not.toContain('"earlier_user_words":' + JSON.stringify(forwardedWords));
    expect(evaluate.mock.calls.find(([, questions]) => questions['meal'])?.[1]['meal']?.criteria).not.toHaveProperty('meal_3');
  });
  it.each(['', '  \t  '])('falls back to the forwarded critique when original_request is blank (%j)', async (originalRequest) => {
    decisions({}, { request: 'no_change' });
    const critique = 'Leave this week unchanged.';
    const original = session(); const before = structuredClone(original);
    expect((await processCritique(original, critique, 'key', { original_request: originalRequest })).outcome).toBe('no_change_requested');
    expect(evaluate.mock.calls[0]?.[0]['latest_request']).toBe(critique);
    expect(evaluate.mock.calls[0]?.[1]['request']?.instructions).toContain(JSON.stringify(critique));
    expect(original).toEqual(before);
  });
  it('lets JEV select an exact meal despite historical effort and recency preferences', async () => {
    const original = session(); original.meals_snapshot[3]!.last_planned = new Date().toISOString();
    decisions({ slot_0: 'meal_3' });
    expect((await processCritique(original, 'Monday exactly Steak', 'key')).operations[0]?.new_meal_id).toBe('steak');
  });
  it('offers compatible occupied meals for atomic exchanges', async () => {
    decisions({ slot_0: 'meal_1', slot_1: 'meal_0' });
    expect((await processCritique(session(), 'Swap Monday and Tuesday dinners', 'key')).operations.map((op) => op.new_meal_id)).toEqual(['chicken', 'pasta']);
    const question = evaluate.mock.calls.find(([, questions]) => questions['meal'])?.[1]['meal'];
    expect(question?.criteria).toHaveProperty('meal_1'); expect(question?.criteria).not.toHaveProperty('meal_4'); expect(question?.criteria).not.toHaveProperty('meal_0');
  });
  it('preserves empty labels without emitting no-op operations', async () => {
    decisions({ slot_0: 'meal_2' });
    expect((await processCritique(session(), 'Change Monday dinner', 'key')).operations).toHaveLength(1);
  });
  it('composes removal and replacement', async () => {
    decisions({ slot_0: 'clear', slot_1: 'meal_2' });
    expect((await processCritique(session(), 'Remove Monday and change Tuesday dinner', 'key')).operations.map((op) => op.new_meal_id)).toEqual([null, 'soup']);
  });
  it.each(['no_change', 'clarify', 'insufficient_evidence'])('returns distinct %s without partial edits', async (request) => {
    decisions({ slot_0: 'clear' }, { request });
    const result = await processCritique(session(), 'request', 'key');
    expect(result.operations).toEqual([]);
    expect(result.outcome).toBe({ no_change: 'no_change_requested', clarify: 'clarification_required', insufficient_evidence: 'insufficient_evidence' }[request]);
    expect(evaluate).toHaveBeenCalledTimes(1);
  });
  it('resumes all pending clauses after clarification without rewriting history or replaying completed edits', async () => {
    const original = audienceSession();
    original.history = [
      { role: 'user', content: 'Remove Monday breakfast and Tuesday dinner.' },
      { role: 'assistant', content: 'The plan is unchanged. Which breakfast audience?', operations: [] },
    ];
    const before = structuredClone(original);
    decisions({ slot_1: 'clear', slot_2: 'clear' }, { audience: 'adult' });
    const result = await processCritique(original, 'Only mine. Please carry out both cancellations; keep the family breakfast.', 'key');
    expect(result).toMatchObject({ outcome: 'applied', operations: [
      { day_index: 0, meal_track: 'adult', meal_type: 'breakfast', new_meal_id: null },
      { day_index: 1, meal_track: 'family', meal_type: 'dinner', new_meal_id: null },
    ] });
    expect(result.operations).toHaveLength(2);
    expect(original).toEqual(before);
    for (const [state] of evaluate.mock.calls) {
      expect(state['chronological_exchange']).toEqual([
        ...before.history,
        { role: 'user', content: 'Only mine. Please carry out both cancellations; keep the family breakfast.' },
      ]);
    }
    const review = evaluate.mock.calls.find(([, questions]) => questions['scope_review']);
    expect(review?.[0]['conversation_history']).toEqual(before.history);
    expect(review?.[1]['scope_review']?.instructions).toContain('unfulfilled earlier request');
    expect(review?.[0]['rules']).toMatchObject({ intent: expect.stringContaining('Empty assistant operations mean no assignments changed') });
    const removal = evaluate.mock.calls.find(([, questions]) => questions['clear_2']);
    expect(removal?.[0]['conversation_history']).toEqual(before.history);
    expect(removal?.[1]['clear_2']?.instructions).toContain('unfulfilled earlier request');
  });
  it('does not confuse distributed meal preferences with ambiguous intent', async () => {
    decisions({ slot_0: 'meal_2' }, { probability: 0.4 });
    expect((await processCritique(session(), 'Choose a new Monday dinner', 'key')).operations[0]?.new_meal_id).toBe('soup');
  });
  it('rejects a semantically invalid removal or incomplete compound proposal', async () => {
    decisions({ slot_0: 'clear' }, { probability: 0.4, verify: 0.2 });
    const result = await processCritique(session(), 'I do not want pasta; change Tuesday too', 'key');
    expect(result.operations).toEqual([]); expect(evaluate.mock.calls.length).toBeLessThanOrEqual(4);
  });
  it('prunes duplicate alternatives against fixed assignments before asking JEV', async () => {
    decisions({ slot_0: 'meal_2' });
    expect((await processCritique(session(), 'Change Monday dinner', 'key')).outcome).toBe('applied');
    const selection = evaluate.mock.calls.find(([, questions]) => questions['meal'])?.[1]['meal'];
    expect(selection?.criteria).not.toHaveProperty('meal_1');
  });
  it('returns infeasible without partial changes when no whole-plan completion exists', async () => {
    decisions({ slot_0: 'meal_2', slot_1: 'meal_2' }, { unsuitable: ['fit_0_1', 'fit_0_3', 'fit_1_0', 'fit_1_3'] });
    const result = await processCritique(session(), 'Change both dinners to Soup', 'key');
    expect(result.operations).toEqual([]); expect(result.outcome).toBe('infeasible'); expect(evaluate).toHaveBeenCalledTimes(4);
  });
  it('never reoffers a candidate that JEV rejects against previous feedback', async () => {
    decisions({ slot_0: 'meal_3' }, { unsuitable: ['fit_0_2'] });
    await processCritique(session(), 'Not soup again', 'key');
    expect(evaluate.mock.calls.find(([, questions]) => questions['meal'])?.[1]['meal']?.criteria).not.toHaveProperty('meal_2');
  });
  it('uses the latest stored planning week when follow-up context is omitted', async () => {
    decisions({}, { request: 'no_change' });
    const original = session(); original.history = [{ role: 'user', content: 'first', context: { planning_week_start: '2026-05-25' } }];
    await processCritique(original, 'hello', 'key');
    decisions({ slot_0: 'meal_2' });
    await processCritique(original, 'Change Monday dinner', 'key');
    expect(evaluate.mock.calls.find(([, questions]) => Object.keys(questions).some((key) => key.startsWith('fit_')))?.[0]['planning_date']).toBe('2026-05-25');
  });
  it('rejects a food combination that violates joint semantic requirements', async () => {
    decisions({ slot_0: 'meal_2', slot_1: 'meal_3' }, { verify: 0.2 });
    const result = await processCritique(session(), 'Exactly one chicken dinner and one fish dinner', 'key');
    expect(result.outcome).toBe('validation_failed'); expect(result.operations).toEqual([]);
  });
  it('lets JEV repair one food while preserving every other proposed assignment', async () => {
    repairDecisions({ slot_0: 'meal_2', slot_1: 'meal_3' }, { target: 'slot_1', alternative: 'meal_0' });
    const original = session(); const before = structuredClone(original);
    const result = await processCritique(original, 'Change Monday and Tuesday dinners', 'key');
    expect(result).toMatchObject({ outcome: 'applied', operations: [{ day_index: 0, new_meal_id: 'soup' }, { day_index: 1, new_meal_id: 'pasta' }] });
    expect(original).toEqual(before);
    const repair = evaluate.mock.calls.find(([, questions]) => questions['repair_target']);
    expect(repair?.[0]).toMatchObject({ food_validation_conflicts: [expect.stringContaining('relationship')], proposed_plan: ['Monday family dinner: Soup', 'Tuesday family dinner: Steak', 'Friday family dinner: Eating out'] });
    const replacement = evaluate.mock.calls.filter(([, questions]) => questions['meal']).at(-1);
    expect(replacement?.[1]['meal']?.criteria).toEqual({ meal_0: 'Pasta' });
    expect(replacement?.[0]['assignments_chosen_so_far']).toEqual(['Monday family dinner: Soup', 'Tuesday family dinner: empty', 'Friday family dinner: Eating out']);
    expect(evaluate).toHaveBeenCalledTimes(10);
    expect(new Set(evaluate.mock.calls.map((call) => call[3])).size).toBe(1);
  });
  it('can repair a final per-food suitability rejection', async () => {
    repairDecisions({ slot_0: 'meal_2' }, { target: 'slot_0', alternative: 'meal_3', failedFit: 'fit_0_2' });
    const result = await processCritique(session(), 'Choose a new Monday dinner', 'key');
    expect(result).toMatchObject({ outcome: 'applied', operations: [{ day_index: 0, new_meal_id: 'steak' }] });
    const repair = evaluate.mock.calls.find(([, questions]) => questions['repair_target']);
    expect(repair?.[0]['food_validation_conflicts']).toEqual([expect.stringContaining('Monday family dinner: Soup')]);
    expect(evaluate).toHaveBeenCalledTimes(9);
  });
  it('does not apply a newly introduced core-dish repeat even when both catalog IDs are unique', async () => {
    repairDecisions({ slot_0: 'meal_2' }, { failedFamily: 'family_0' });
    const original = session();
    const result = await processCritique(original, 'Choose a new Monday dinner', 'key');
    expect(result).toMatchObject({ outcome: 'validation_failed', operations: [] });
    const verification = evaluate.mock.calls.find(([, questions]) => questions['family_0']);
    expect(verification?.[1]['family_0']?.instructions).toContain('Soup');
    expect(verification?.[0]).toMatchObject({ current_plan: expect.any(Array), proposed_plan: expect.any(Array) });
    const repair = evaluate.mock.calls.find(([, questions]) => questions['repair_target']);
    expect(repair?.[0]['food_validation_conflicts']).toEqual([expect.stringContaining('core dish')]);
  });
  it('can repair a core-dish repeat through the same single bounded food reconsideration', async () => {
    repairDecisions({ slot_0: 'meal_2' }, { failedFamily: 'family_0', target: 'slot_0', alternative: 'meal_3' });
    const result = await processCritique(session(), 'Choose a new Monday dinner', 'key');
    expect(result).toMatchObject({ outcome: 'applied', operations: [{ day_index: 0, new_meal_id: 'steak' }] });
    expect(evaluate.mock.calls.filter(([, questions]) => questions['repair_target'])).toHaveLength(1);
  });
  it.each(['legacy', 'requested'])('allows a model-verified %s exception to core-dish variety', async (exception) => {
    decisions({ slot_0: 'meal_2' });
    const baseline = evaluate.getMockImplementation()!;
    evaluate.mockImplementation(async (state, questions, key, signal) => {
      const answers = await baseline(state, questions, key, signal);
      if (questions['family_0']) answers['family_0'] = choice(questions['family_0'], exception);
      return answers;
    });
    expect((await processCritique(session(), 'Choose a new Monday dinner', 'key')).outcome).toBe('applied');
    expect(evaluate.mock.calls.some(([, questions]) => questions['family_0'])).toBe(true);
  });
  it('returns unchanged when JEV cannot identify a one-slot repair', async () => {
    repairDecisions({ slot_0: 'meal_2' });
    const result = await processCritique(session(), 'Choose a new Monday dinner', 'key');
    expect(result).toMatchObject({ outcome: 'validation_failed', operations: [] });
    expect(evaluate.mock.calls.filter(([, questions]) => questions['repair_target'])).toHaveLength(1);
    expect(evaluate.mock.calls.filter(([, questions]) => questions['meal'])).toHaveLength(1);
    expect(evaluate).toHaveBeenCalledTimes(7);
  });
  it('does not claim the request is infeasible when a rejected food has no one-slot alternative', async () => {
    repairDecisions({ slot_0: 'meal_2' });
    const original = session(); original.meals_snapshot = original.meals_snapshot.filter((meal) => meal.id !== 'steak');
    const result = await processCritique(original, 'Choose a new Monday dinner', 'key');
    expect(result).toMatchObject({ outcome: 'validation_failed', operations: [] });
    expect(evaluate.mock.calls.some(([, questions]) => questions['repair_target'])).toBe(false);
    expect(evaluate).toHaveBeenCalledTimes(6);
  });
  it('stops after one rejected repair without cycling back to earlier foods', async () => {
    repairDecisions({ slot_0: 'meal_2' }, { target: 'slot_0', alternative: 'meal_3', rejectAgain: true });
    const result = await processCritique(session(), 'Choose a new Monday dinner', 'key');
    expect(result).toMatchObject({ outcome: 'validation_failed', operations: [] });
    expect(evaluate.mock.calls.filter(([, questions]) => questions['repair_target'])).toHaveLength(1);
    expect(evaluate.mock.calls.filter(([, questions]) => questions['meal'])).toHaveLength(2);
    expect(evaluate).toHaveBeenCalledTimes(9);
  });
  it('never repairs food when an explicit removal also fails verification', async () => {
    repairDecisions({ slot_0: 'clear', slot_1: 'meal_2' }, { target: 'slot_1', failedClear: 'clear_0' });
    const result = await processCritique(session(), 'Remove Monday and change Tuesday dinner', 'key');
    expect(result).toMatchObject({ outcome: 'validation_failed', operations: [] });
    expect(evaluate.mock.calls.some(([, questions]) => questions['repair_target'])).toBe(false);
    expect(evaluate).toHaveBeenCalledTimes(6);
  });
  it('returns an explained no-op for an already empty target', async () => {
    const original = session(); original.plan[0] = { ...original.plan[0]!, meal_id: null, meal_name: null };
    decisions({ slot_0: 'clear' });
    const result = await processCritique(original, 'Leave Monday dinner empty', 'key');
    expect(result).toMatchObject({ outcome: 'no_change_requested', operations: [] }); expect(result.explanation.length).toBeGreaterThan(0);
  });
  it('recognizes an exact assignment that is already satisfied', async () => {
    decisions({}, { request: 'already_satisfied' });
    expect((await processCritique(session(), 'Monday should stay Pasta', 'key')).outcome).toBe('no_change_requested');
    expect(evaluate).toHaveBeenCalledTimes(1);
  });
  it('bounds scope reconsideration and never selects food after repeated scope rejection', async () => {
    decisions({ slot_0: 'meal_2' }, { scopeReview: 'incorrect' });
    const result = await processCritique(session(), 'Change both dinners', 'key');
    expect(result).toMatchObject({ outcome: 'validation_failed', operations: [] }); expect(evaluate).toHaveBeenCalledTimes(5);
    expect(evaluate.mock.calls[3]?.[0]['rejected_scope']).toEqual(['Monday family dinner: final slot filled with a different assignment']);
    expect(evaluate.mock.calls.every(([, questions]) => !questions['meal'])).toBe(true);
  });
  it('distinguishes lack of model suitability evidence from structural infeasibility', async () => {
    decisions({ slot_0: 'meal_2' }, { unsuitable: ['fit_0_1', 'fit_0_2', 'fit_0_3'] });
    const result = await processCritique(session(), 'Change Monday dinner', 'key');
    expect(result).toMatchObject({ outcome: 'validation_failed', operations: [] });
  });
  it('clarifies an unresolved audience even when the global classifier says edit', async () => {
    const original = session();
    original.plan = [createMealPlanEntry({ day_index: 0, meal_type: 'breakfast', meal_track: 'family' }), createMealPlanEntry({ day_index: 0, meal_type: 'breakfast', meal_track: 'adult' })];
    decisions({ slot_0: 'clear', slot_1: 'clear' }, { audience: 'ambiguous' });
    expect((await processCritique(original, 'Remove Monday breakfast', 'key')).outcome).toBe('clarification_required');
    expect(evaluate).toHaveBeenCalledTimes(1);
  });
  it('ignores an unrelated ambiguous breakfast audience when both breakfast tracks are preserved', async () => {
    const original = audienceSession();
    original.plan[2] = { ...original.plan[2]!, day_index: 0 };
    original.meals_snapshot.push(createMeal({ id: 'soup', name: 'Soup', meal_type: 'dinner', audience: 'family', prep_ahead: false, has_red_meat: false }));
    const before = structuredClone(original);
    decisions({ slot_2: 'meal_5' }, { audience: 'ambiguous' });
    const result = await processCritique(original, 'Change Monday dinner to Soup. Keep both Monday breakfasts unchanged.', 'key');
    expect(result.outcome).toBe('applied');
    expect(result.operations).toEqual([{ day_index: 0, meal_track: 'family', meal_type: 'dinner', new_meal_id: 'soup' }]);
    expect(original).toEqual(before);
    expect(evaluate.mock.calls.filter(([, questions]) => questions['scope_0'])).toHaveLength(1);
    expect(evaluate.mock.calls.some(([, questions]) => questions['meal'])).toBe(true);
  });
  it.each([
    { audience: 'adult', critique: 'Change only Brad Monday breakfast' },
    { audience: 'family', critique: 'Change only the family Monday breakfast' },
    { audience: 'none', critique: 'Keep Monday breakfast unchanged and change Tuesday dinner' },
  ])('fails closed when the resolved $audience audience contradicts edited slots', async ({ audience, critique }) => {
    decisions({ slot_0: 'meal_2', slot_1: 'meal_3' }, { audience, scopeReview: 'correct' });
    const original = audienceSession(); const before = structuredClone(original);
    const result = await processCritique(original, critique, 'key');
    expect(result).toMatchObject({ outcome: 'validation_failed', operations: [] });
    expect(original).toEqual(before);
    const scopeCalls = evaluate.mock.calls.filter(([, questions]) => questions['scope_0']);
    expect(scopeCalls.length).toBeGreaterThan(0);
    expect(scopeCalls.length).toBeLessThanOrEqual(2);
    expect(evaluate.mock.calls.some(([, questions]) => questions['meal'] || Object.keys(questions).some((id) => id.startsWith('fit_') || id.startsWith('rejection_')))).toBe(false);
  });
  it('uses a corrected second scope decision without silently overriding the first audience conflict', async () => {
    decisions({ slot_1: 'meal_3' }, { audience: 'adult', scopeReview: 'correct' });
    const baseline = evaluate.getMockImplementation()!;
    let scopeRounds = 0;
    evaluate.mockImplementation(async (state, questions, key, signal) => {
      const answers = await baseline(state, questions, key, signal);
      if (questions['scope_0'] && ++scopeRounds === 1) answers['scope_0'] = choice(questions['scope_0'], 'replace');
      return answers;
    });
    const original = audienceSession(); const before = structuredClone(original);
    const result = await processCritique(original, 'Change only Brad Monday breakfast', 'key');
    expect(result).toMatchObject({ outcome: 'applied', operations: [{ day_index: 0, meal_track: 'adult', meal_type: 'breakfast', new_meal_id: 'adult-new' }] });
    expect(result.operations).toHaveLength(1);
    expect(scopeRounds).toBe(2);
    expect(original).toEqual(before);
  });
  it('preserves nonempty family and unrelated slots for a consistent adult-only change', async () => {
    decisions({ slot_1: 'meal_3' }, { audience: 'adult' });
    const original = audienceSession(); const before = structuredClone(original);
    const result = await processCritique(original, 'Change only Brad Monday breakfast', 'key');
    expect(result.operations).toEqual([{ day_index: 0, meal_track: 'adult', meal_type: 'breakfast', new_meal_id: 'adult-new' }]);
    expect(result.outcome).toBe('applied');
    expect(original).toEqual(before);
    expect(evaluate.mock.calls.filter(([, questions]) => questions['scope_0'])).toHaveLength(1);
  });
  it('allows both audiences in a whole-day clear when one slot is already empty', async () => {
    decisions({ slot_0: 'clear', slot_1: 'clear' }, { audience: 'both' });
    const original = audienceSession();
    original.plan[0] = { ...original.plan[0]!, meal_id: null, meal_name: null };
    const before = structuredClone(original);
    const result = await processCritique(original, 'Remove all Monday meals for both audiences', 'key');
    expect(result).toMatchObject({ outcome: 'applied' });
    expect(result.operations).toEqual([{ day_index: 0, meal_track: 'adult', meal_type: 'breakfast', new_meal_id: null }]);
    expect(original).toEqual(before);
    expect(evaluate.mock.calls.filter(([, questions]) => questions['scope_0'])).toHaveLength(1);
    expect(evaluate.mock.calls.some(([, questions]) => questions['meal'])).toBe(false);
  });
  it('keeps a transferred intermediate food while applying a later removal', async () => {
    let reviews = 0;
    evaluate.mockImplementation(async (state, questions) => Object.fromEntries(Object.entries(questions).map(([id, question]) => {
      if (question.type === 'noul') return [id, { type: 'noul', noul: 0.99 }];
      let selected = 'unchanged';
      if (id.startsWith('rejection_')) selected = 'available';
      else if (id.startsWith('fit_')) selected = 'fits';
      else if (id.startsWith('family_')) selected = 'distinct';
      else if (id === 'request') selected = 'edit';
      else if (id === 'scope_review') selected = ++reviews === 1 ? 'incorrect' : 'correct';
      else if (id === 'transfer_pattern') selected = 'ordinary';
      else if (id === 'requirements') selected = 'satisfied';
      else if (id === 'meal') selected = 'meal_1';
      else if (id.startsWith('clear_')) selected = 'explicitly_unneeded';
      else if (id === 'transfer_0') selected = 'source_1';
      else if (id === 'transfer_1') selected = 'source_0';
      else if (id.startsWith('scope_')) selected = id === 'scope_2' ? 'preserve' : state['rejected_scope'] ? (id === 'scope_0' ? 'preserve' : 'clear') : 'replace';
      return [id, choice(question, selected)];
    })));
    const result = await processCritique(session(), 'Swap Monday and Tuesday dinners, then remove Tuesday dinner', 'key');
    expect(result).toMatchObject({ outcome: 'applied', operations: [{ day_index: 0, new_meal_id: 'chicken' }, { day_index: 1, new_meal_id: null }] });
    expect(reviews).toBe(2);
  });
  it('classifies the saved plan once and applies a swap when the transferred preview needs no further changes', async () => {
    decisions({ slot_0: 'meal_1', slot_1: 'meal_0' });
    const baseline = evaluate.getMockImplementation()!;
    evaluate.mockImplementation(async (state, questions, key, signal) => {
      const answers = await baseline(state, questions, key, signal);
      const hasPreview = state['after_requested_transfers_before_removals'] !== undefined;
      if (questions['request']) answers['request'] = choice(questions['request'], hasPreview ? 'already_satisfied' : 'edit');
      if (questions['transfer_pattern']) answers['transfer_pattern'] = choice(questions['transfer_pattern'], 'transfers');
      if (questions['transfer_0']) answers['transfer_0'] = choice(questions['transfer_0'], 'source_1');
      if (questions['transfer_1']) answers['transfer_1'] = choice(questions['transfer_1'], 'source_0');
      // Simulate identity overreach if an unrelated repeated occurrence is offered.
      if (questions['transfer_2']) answers['transfer_2'] = choice(questions['transfer_2'], 'source_0');
      if (hasPreview) {
        for (const [id, question] of Object.entries(questions)) {
          if (id.startsWith('scope_') && id !== 'scope_review') answers[id] = choice(question, 'preserve');
        }
      }
      return answers;
    });
    const original = session();
    original.plan[2] = createMealPlanEntry({ day_index: 6, meal_type: 'dinner', meal_id: 'chicken', meal_name: 'Chicken' });
    const before = structuredClone(original);
    const result = await processCritique(original, 'Swap Monday and Tuesday dinners, with no other changes.', 'key');
    expect(result.outcome).toBe('applied');
    expect(result.operations).toEqual([
      { day_index: 0, meal_track: 'family', meal_type: 'dinner', new_meal_id: 'chicken' },
      { day_index: 1, meal_track: 'family', meal_type: 'dinner', new_meal_id: 'pasta' },
    ]);
    expect(original).toEqual(before);
    const transfer = evaluate.mock.calls.find(([, questions]) => questions['transfer_0']);
    expect(transfer?.[1]).not.toHaveProperty('transfer_2');
    expect(evaluate.mock.calls.filter(([, questions]) => questions['request'])).toHaveLength(1);
    const previewCalls = evaluate.mock.calls.filter(([state]) => state['after_requested_transfers_before_removals'] !== undefined);
    expect(previewCalls.length).toBeGreaterThan(0);
    for (const [, questions] of previewCalls) {
      expect(questions).not.toHaveProperty('request');
      expect(questions).not.toHaveProperty('transfer_pattern');
    }
    const review = evaluate.mock.calls.find(([, questions]) => questions['scope_review']);
    expect(review?.[0]).toMatchObject({
      current_plan: ['Monday family dinner: Pasta', 'Tuesday family dinner: Chicken', 'Sunday family dinner: Chicken'],
      after_requested_transfers_before_removals: ['Monday family dinner: Chicken', 'Tuesday family dinner: Pasta', 'Sunday family dinner: Chicken'],
      requested_actions: ['Monday family dinner: final slot filled with a different assignment', 'Tuesday family dinner: final slot filled with a different assignment'],
    });
  });
  it('enforces resolved rejection history even when a candidate-fit judgment mistakenly accepts the old food', async () => {
    const original = session();
    original.history = [{ role: 'user', content: 'Tuesday dinner is too familiar. Give us something different.' }, { role: 'assistant', content: 'Tuesday changed to Chicken', operations: [{ day_index: 1, meal_track: 'family', meal_type: 'dinner', new_meal_id: 'chicken' }], previous_assignments: [createMealPlanEntry({ day_index: 1, meal_type: 'dinner', meal_id: 'steak', meal_name: 'Steak' })] }];
    decisions({ slot_1: 'meal_2' }, { rejected: ['rejection_3'] });
    const result = await processCritique(original, 'Tuesday dinner is too familiar. Give us something different.', 'key');
    expect(result.operations[0]?.new_meal_id).toBe('soup');
    const selected = evaluate.mock.calls.find(([, questions]) => questions['meal'])?.[1]['meal'];
    expect(selected?.criteria).not.toHaveProperty('meal_3');
    const rejection = evaluate.mock.calls.find(([, questions]) => questions['rejection_3'])?.[1]['rejection_3'];
    expect(rejection?.instructions).toContain('food_before_that_feedback'); expect(rejection?.instructions).toContain('Steak');
  });
  it('propagates JEV service failures', async () => {
    evaluate.mockRejectedValue(new Error('unavailable'));
    await expect(processCritique(session(), 'change Monday', 'key')).rejects.toThrow('unavailable');
  });
  it.each(['NaN', '-1', '999999'])('rejects invalid timeout %s', async (timeout) => {
    vi.stubEnv('JEV_TIMEOUT_MS', timeout);
    await expect(processCritique(session(), 'change Monday', 'key')).rejects.toMatchObject({ code: 'JEV_INVALID_CONFIG' }); expect(evaluate).not.toHaveBeenCalled();
  });
  it.each(['gpt', 'invalid'])('uses JEV even when obsolete provider selection is %s', async (legacyProvider) => {
    vi.stubEnv('MEALPLAN_CRITIQUE_PROVIDER', legacyProvider);
    decisions({}, { request: 'no_change' });
    const result = await processCritique(session(), 'Keep this plan unchanged', 'typesafe-key');
    expect(result.outcome).toBe('no_change_requested');
    expect(evaluate).toHaveBeenCalled();
    expect(evaluate.mock.calls[0]?.[2]).toBe('typesafe-key');
  });
});
