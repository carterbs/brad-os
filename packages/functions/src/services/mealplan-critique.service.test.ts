import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Meal, MealPlanSession, JevAnswer, JevQuestion } from '../shared.js';
import { createMeal, createMealPlanEntry, createMealPlanSession } from '../__tests__/utils/index.js';

vi.mock('./mealplan-jev.service.js', () => ({ evaluateJev: vi.fn() }));
vi.mock('../runtime/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
import { evaluateJev } from './mealplan-jev.service.js';
import { processCritique } from './mealplan-critique.service.js';
const mockEvaluate = vi.mocked(evaluateJev);

function session(): MealPlanSession {
  return createMealPlanSession({
    plan: [
      createMealPlanEntry({ day_index: 0, meal_id: 'b1', meal_name: 'Oats', meal_type: 'breakfast' }),
      createMealPlanEntry({ day_index: 0, meal_track: 'adult', meal_id: 'ab1', meal_name: 'Protein Oats', meal_type: 'breakfast' }),
      createMealPlanEntry({ day_index: 0, meal_id: 'l1', meal_name: 'Sandwich', meal_type: 'lunch' }),
      createMealPlanEntry({ day_index: 0, meal_id: 'd1', meal_name: 'Pasta', meal_type: 'dinner' }),
      createMealPlanEntry({ day_index: 1, meal_id: 'd4', meal_name: 'Roast Chicken', meal_type: 'dinner' }),
    ],
    meals_snapshot: [
      createMeal({ id: 'b1', name: 'Oats', meal_type: 'breakfast', effort: 1 }),
      createMeal({ id: 'ab1', name: 'Protein Oats', meal_type: 'breakfast', audience: 'adult', effort: 1 }),
      createMeal({ id: 'l1', name: 'Sandwich', meal_type: 'lunch', effort: 1 }),
      createMeal({ id: 'd1', name: 'Pasta', meal_type: 'dinner', effort: 4, prep_ahead: false }),
      createMeal({ id: 'd2', name: 'Steak', meal_type: 'dinner', effort: 5, has_red_meat: true, prep_ahead: false }),
      createMeal({ id: 'd3', name: 'Chicken Soup', meal_type: 'dinner', effort: 3, prep_ahead: false }),
      createMeal({ id: 'd4', name: 'Roast Chicken', meal_type: 'dinner', effort: 5, prep_ahead: false }),
      createMeal({ id: 'ab2', name: 'Eggs', meal_type: 'breakfast', audience: 'adult', effort: 1 }),
    ],
    history: [],
  });
}

function choice(question: JevQuestion, selected: string, confidence = 0.99): JevAnswer {
  if (question.type !== 'choice') throw new Error('Expected Choice');
  const labels = Object.keys(question.criteria);
  return {
    type: 'choice', choice: selected, confidence,
    probabilities: Object.fromEntries(labels.map((label) => [
      label, label === selected ? confidence : (1 - confidence) / (labels.length - 1),
    ])),
  };
}
interface Decisions {
  request?: string;
  actions?: Record<string, string>;
  easier?: string[];
  scores?: Record<string, number>;
  uncertainSlots?: string[];
  confidences?: Record<string, number>;
  easierScores?: Record<string, number>;
}
function decisions(config: Decisions = {}): void {
  mockEvaluate.mockImplementation(async (state, questions) => {
    const answers: Record<string, JevAnswer> = {};
    const evaluations = state['candidate_evaluations'] as
      Record<string, { slot_id: string; candidate: Meal }> | undefined;
    for (const [key, question] of Object.entries(questions)) {
      if (key === 'request') {
        answers[key] = choice(question, config.request ?? 'change');
      } else if (key.startsWith('action_')) {
        const id = key.slice('action_'.length);
        answers[key] = choice(question, config.actions?.[id] ?? 'keep', config.confidences?.[id] ?? (config.uncertainSlots?.includes(id) ? 0.55 : 0.99));
      } else if (key.startsWith('easier_')) {
        const id = key.slice('easier_'.length);
        answers[key] = { type: 'noul', noul: config.easierScores?.[id] ?? (config.easier?.includes(id) ? 0.99 : 0.01) };
      } else {
        const evaluation = evaluations?.[key];
        if (!evaluation) throw new Error('Missing evaluation ' + key);
        answers[key] = { type: 'noul', noul: config.scores?.[evaluation.slot_id + ':' + evaluation.candidate.id] ?? 0.01 };
      }
    }
    return answers;
  });
}

describe('Jev meal-plan critique', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });
  afterEach(() => { vi.unstubAllEnvs(); });

  it('assembles known meal IDs and factual explanations from constrained answers', async () => {
    decisions({ actions: { slot_3: 'replace' }, scores: { 'slot_3:d2': 0.99 } });
    const result = await processCritique(session(), 'Monday dinner to Steak', 'test-key');
    expect(result.operations).toEqual([{ day_index: 0, meal_track: 'family', meal_type: 'dinner', new_meal_id: 'd2' }]);
    expect(result.explanation).toContain('Monday');
    expect(result.explanation).toContain('Steak');
    expect(mockEvaluate).toHaveBeenCalledTimes(2);
    expect(mockEvaluate.mock.calls[0]?.[2]).toBe('test-key');
    expect(mockEvaluate.mock.calls[0]?.[3]).toBe(mockEvaluate.mock.calls[1]?.[3]);
  });
  it('supports compound replace and explicit removal requests', async () => {
    decisions({ actions: { slot_2: 'remove', slot_3: 'replace' }, scores: { 'slot_3:d3': 0.99 } });
    const result = await processCritique(session(), 'Remove Monday lunch and make Monday dinner chicken', 'test-key');
    expect(result.operations).toEqual([
      { day_index: 0, meal_track: 'family', meal_type: 'lunch', new_meal_id: null },
      { day_index: 0, meal_track: 'family', meal_type: 'dinner', new_meal_id: 'd3' },
    ]);
  });
  it('targets Brad breakfast without changing family breakfast', async () => {
    decisions({ actions: { slot_1: 'replace' }, scores: { 'slot_1:ab2': 0.99 } });
    const result = await processCritique(session(), 'My Monday breakfast should be Eggs', 'test-key');
    expect(result.operations).toEqual([{ day_index: 0, meal_track: 'adult', meal_type: 'breakfast', new_meal_id: 'ab2' }]);
    const evaluations = mockEvaluate.mock.calls[1]?.[0]['candidate_evaluations'] as Record<string, { candidate: Meal }>;
    expect(Object.values(evaluations).every(({ candidate }) => candidate.audience === 'adult')).toBe(true);
  });
  it('returns no operations for approval and never finalizes or generates shopping lists', async () => {
    decisions({ request: 'no_change' });
    const result = await processCritique(session(), 'Looks perfect, finalize it', 'test-key');
    expect(result.operations).toEqual([]);
    expect(result.explanation).toContain('unchanged');
    expect(mockEvaluate).toHaveBeenCalledTimes(1);
  });
  it.each(['clarify', 'unsupported'])('leaves the whole plan unchanged for a %s request', async (request) => {
    decisions({ request, actions: { slot_2: 'remove', slot_3: 'replace' } });
    expect((await processCritique(session(), 'Remove lunch and invent a recipe', 'test-key')).operations).toEqual([]);
    expect(mockEvaluate).toHaveBeenCalledTimes(1);
  });
  it('does not apply half a request when another target is ambiguous', async () => {
    decisions({ actions: { slot_2: 'remove', slot_3: 'unclear' } });
    expect((await processCritique(session(), 'Remove Monday lunch and change breakfast', 'test-key')).operations).toEqual([]);
    expect(mockEvaluate).toHaveBeenCalledTimes(1);
  });
  it('does not mutate on low-confidence slot decisions', async () => {
    decisions({ actions: { slot_3: 'replace' }, uncertainSlots: ['slot_3'] });
    expect((await processCritique(session(), 'Make that different', 'test-key')).operations).toEqual([]);
  });
  it('requires stronger certainty for removal than replacement', async () => {
    decisions({ actions: { slot_2: 'remove' }, confidences: { slot_2: 0.9 } });
    const result = await processCritique(session(), 'Remove Monday lunch', 'test-key');
    expect(result.operations).toEqual([]);
    expect(result.explanation).toContain('Do you want me to remove');
  });
  it('clarifies an uncertain effort request before matching candidates', async () => {
    decisions({ actions: { slot_3: 'replace' }, easierScores: { slot_3: 0.5 } });
    const result = await processCritique(session(), 'Change dinner', 'test-key');
    expect(result.operations).toEqual([]);
    expect(result.explanation).toContain('easier');
    expect(mockEvaluate).toHaveBeenCalledTimes(1);
  });
  it('passes history as context without replaying prior operations', async () => {
    const original = session();
    original.history = [
      { role: 'user', content: 'No spaghetti this week; remove Monday lunch' },
      { role: 'assistant', content: 'Removed Monday lunch.' },
    ];
    decisions({ actions: { slot_3: 'replace' }, scores: { 'slot_3:d3': 0.99 } });
    const result = await processCritique(original, 'Monday dinner with chicken', 'test-key');
    expect(result.operations).toHaveLength(1);
    expect(result.operations[0]?.meal_type).toBe('dinner');
    expect(mockEvaluate.mock.calls[1]?.[0]['conversation_history']).toEqual(original.history);
    expect(mockEvaluate.mock.calls[0]?.[1]['action_slot_3']?.instructions).toContain('latest');
  });
  it('enforces easier as a numeric reduction before semantic matching', async () => {
    decisions({ actions: { slot_3: 'replace' }, easier: ['slot_3'], scores: { 'slot_3:d2': 0.99, 'slot_3:d3': 0.99 } });
    const result = await processCritique(session(), 'Monday dinner needs to be easier', 'test-key');
    expect(result.operations[0]?.new_meal_id).toBe('d3');
    const evaluations = mockEvaluate.mock.calls[1]?.[0]['candidate_evaluations'] as Record<string, { candidate: Meal }>;
    expect(Object.values(evaluations).every(({ candidate }) => candidate.effort < 4)).toBe(true);
  });
  it('does not force a replacement when every candidate fails matching', async () => {
    decisions({ actions: { slot_3: 'replace' }, scores: { 'slot_3:d3': 0.65 } });
    const result = await processCritique(session(), 'Use a nonexistent meal', 'test-key');
    expect(result.operations).toEqual([]);
    expect(result.explanation).toContain('match');
  });
  it('filters candidates that would create consecutive red-meat dinners', async () => {
    const original = session();
    const tuesday = original.meals_snapshot.find((meal) => meal.id === 'd4');
    if (!tuesday) throw new Error('Missing fixture meal');
    tuesday.has_red_meat = true;
    decisions({ actions: { slot_3: 'replace' }, scores: { 'slot_3:d2': 0.99 } });
    const result = await processCritique(original, 'Monday dinner to Steak', 'test-key');
    expect(result.operations).toEqual([]);
    const evaluations = mockEvaluate.mock.calls[1]?.[0]['candidate_evaluations'] as Record<string, { candidate: Meal }>;
    expect(Object.values(evaluations).every(({ candidate }) => !candidate.has_red_meat)).toBe(true);
  });
  it('rejects jointly invalid red-meat replacements even when each candidate is individually eligible', async () => {
    const original = session();
    original.meals_snapshot.push(createMeal({ id: 'd5', name: 'Beef Stew', meal_type: 'dinner', effort: 4, has_red_meat: true }));
    decisions({ actions: { slot_3: 'replace', slot_4: 'replace' }, scores: { 'slot_3:d2': 0.99, 'slot_4:d5': 0.99 } });
    const result = await processCritique(original, 'Beef dinners Monday and Tuesday', 'test-key');
    expect(result.operations).toEqual([]);
    expect(result.explanation).toContain('together');
  });
  it('does not add a fourth prep-ahead occurrence', async () => {
    const original = session();
    for (const meal of original.meals_snapshot) {
      meal.prep_ahead = ['b1', 'ab1', 'l1', 'd2'].includes(meal.id);
    }
    decisions({ actions: { slot_3: 'replace' }, scores: { 'slot_3:d2': 0.99 } });
    const result = await processCritique(original, 'Monday dinner to Steak', 'test-key');
    expect(result.operations).toEqual([]);
    const evaluations = mockEvaluate.mock.calls[1]?.[0]['candidate_evaluations'] as Record<string, { candidate: Meal }>;
    expect(Object.values(evaluations).every(({ candidate }) => !candidate.prep_ahead)).toBe(true);
  });
  it('can exchange occupied dinners without intermediate duplicates', async () => {
    decisions({ actions: { slot_3: 'replace', slot_4: 'replace' }, scores: { 'slot_3:d4': 0.99, 'slot_4:d1': 0.99 } });
    expect((await processCritique(session(), 'Swap Monday and Tuesday dinners', 'test-key')).operations.map((op) => op.new_meal_id)).toEqual(['d4', 'd1']);
  });
  it('searches joint alternatives instead of assigning one candidate twice', async () => {
    decisions({ actions: { slot_3: 'replace', slot_4: 'replace' }, scores: { 'slot_3:d3': 0.99, 'slot_4:d3': 0.99, 'slot_3:d2': 0.95 } });
    expect((await processCritique(session(), 'Change both dinners', 'test-key')).operations.map((op) => op.new_meal_id)).toEqual(['d2', 'd3']);
  });
  it('returns no partial removal when a replacement has no legal candidate', async () => {
    const original = session();
    original.meals_snapshot = original.meals_snapshot.filter((meal) => ['b1', 'ab1', 'l1', 'd1', 'd4'].includes(meal.id));
    decisions({ actions: { slot_2: 'remove', slot_3: 'replace' } });
    expect((await processCritique(original, 'Remove lunch and replace dinner', 'test-key')).operations).toEqual([]);
  });
  it('never mutates the supplied session', async () => {
    const original = session();
    const before = structuredClone(original);
    decisions({ actions: { slot_2: 'remove' } });
    await processCritique(original, 'Remove Monday lunch', 'test-key');
    expect(original).toEqual(before);
  });
  it('propagates provider failures rather than returning unverified success', async () => {
    mockEvaluate.mockRejectedValue(new Error('TypeSafe unavailable'));
    await expect(processCritique(session(), 'Change Monday dinner', 'test-key')).rejects.toThrow('TypeSafe unavailable');
  });
  it('rejects invalid timeout configuration before provider calls', async () => {
    vi.stubEnv('JEV_TIMEOUT_MS', 'not-a-number');
    await expect(processCritique(session(), 'Change Monday dinner', 'test-key')).rejects.toThrow('JEV_TIMEOUT_MS');
    expect(mockEvaluate).not.toHaveBeenCalled();
  });
});
