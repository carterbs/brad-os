import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MealPlanSession, MealPlanEntry, ConversationMessage } from '../shared.js';
import type { Meal } from '../shared.js';

// Mock OpenAI before importing the service
const mockCreate = vi.fn();
vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockCreate,
      },
    },
  })),
}));

import { processCritique, buildSystemMessage, buildMessages } from './mealplan-critique.service.js';

function createTestMeal(overrides: Partial<Meal> = {}): Meal {
  return {
    id: 'meal-1',
    name: 'Test Meal',
    meal_type: 'dinner',
    effort: 5,
    has_red_meat: false,
    url: '',
    last_planned: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function createTestPlan(): MealPlanEntry[] {
  return [
    { day_index: 0, meal_type: 'breakfast', meal_id: 'meal-b1', meal_name: 'Oatmeal' },
    { day_index: 0, meal_type: 'lunch', meal_id: 'meal-l1', meal_name: 'Sandwich' },
    { day_index: 0, meal_type: 'dinner', meal_id: 'meal-d1', meal_name: 'Pasta' },
  ];
}

function createTestSession(overrides: Partial<MealPlanSession> = {}): MealPlanSession {
  return {
    id: 'session-1',
    plan: createTestPlan(),
    meals_snapshot: [
      createTestMeal({ id: 'meal-b1', name: 'Oatmeal', meal_type: 'breakfast', effort: 1 }),
      createTestMeal({ id: 'meal-l1', name: 'Sandwich', meal_type: 'lunch', effort: 1 }),
      createTestMeal({ id: 'meal-d1', name: 'Pasta', meal_type: 'dinner', effort: 4 }),
      createTestMeal({ id: 'meal-d2', name: 'Steak', meal_type: 'dinner', effort: 5, has_red_meat: true }),
    ],
    history: [],
    is_finalized: false,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('MealPlan Critique Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('processCritique', () => {
    it('should return parsed CritiqueResponse on successful critique', async () => {
      const session = createTestSession();
      const responseJson = {
        explanation: 'I swapped Monday dinner to Steak.',
        operations: [
          { day_index: 0, meal_type: 'dinner', new_meal_id: 'meal-d2' },
        ],
      };

      mockCreate.mockResolvedValue({
        choices: [
          { message: { content: JSON.stringify(responseJson) } },
        ],
      });

      const result = await processCritique(session, 'Change Monday dinner to Steak', 'test-api-key');

      expect(result.explanation).toBe('I swapped Monday dinner to Steak.');
      expect(result.operations).toHaveLength(1);
      expect(result.operations[0]?.day_index).toBe(0);
      expect(result.operations[0]?.meal_type).toBe('dinner');
      expect(result.operations[0]?.new_meal_id).toBe('meal-d2');
    });

    it('should return fallback response when OpenAI returns malformed JSON', async () => {
      const session = createTestSession();

      mockCreate.mockResolvedValue({
        choices: [
          { message: { content: 'this is not valid json at all' } },
        ],
      });

      const result = await processCritique(session, 'Do something', 'test-api-key');

      expect(result.explanation).toContain("couldn't process");
      expect(result.operations).toEqual([]);
    });

    it('should return fallback response when OpenAI returns JSON with wrong shape', async () => {
      const session = createTestSession();

      mockCreate.mockResolvedValue({
        choices: [
          { message: { content: JSON.stringify({ foo: 'bar' }) } },
        ],
      });

      const result = await processCritique(session, 'Do something', 'test-api-key');

      expect(result.explanation).toContain("couldn't process");
      expect(result.operations).toEqual([]);
    });

    it('should throw descriptive error when OpenAI API call fails', async () => {
      const session = createTestSession();

      mockCreate.mockRejectedValue(new Error('Rate limit exceeded'));

      await expect(
        processCritique(session, 'Do something', 'test-api-key')
      ).rejects.toThrow('OpenAI API call failed: Rate limit exceeded');
    });

    it('should return fallback when response content is empty', async () => {
      const session = createTestSession();

      mockCreate.mockResolvedValue({
        choices: [
          { message: { content: '' } },
        ],
      });

      const result = await processCritique(session, 'Do something', 'test-api-key');

      expect(result.explanation).toContain("couldn't process");
      expect(result.operations).toEqual([]);
    });
  });

  describe('buildSystemMessage', () => {
    it('should contain meal names and IDs from the snapshot', () => {
      const session = createTestSession();
      const systemMessage = buildSystemMessage(session);

      expect(systemMessage).toContain('meal-b1');
      expect(systemMessage).toContain('Oatmeal');
      expect(systemMessage).toContain('meal-d1');
      expect(systemMessage).toContain('Pasta');
      expect(systemMessage).toContain('meal-d2');
      expect(systemMessage).toContain('Steak');
    });

    it('should contain the current plan grid with day names', () => {
      const session = createTestSession();
      const systemMessage = buildSystemMessage(session);

      expect(systemMessage).toContain('Monday');
      expect(systemMessage).toContain('Oatmeal');
      expect(systemMessage).toContain('Sandwich');
      expect(systemMessage).toContain('Pasta');
    });

    it('should contain red meat indicator in meal table', () => {
      const session = createTestSession();
      const systemMessage = buildSystemMessage(session);

      // Steak has red meat
      expect(systemMessage).toContain('Yes');
      // Oatmeal does not
      expect(systemMessage).toContain('No');
    });
  });

  describe('buildMessages', () => {
    it('should include history messages in the correct order', () => {
      const history: ConversationMessage[] = [
        { role: 'user', content: 'Change Monday dinner' },
        { role: 'assistant', content: 'Done, I swapped it.' },
      ];
      const session = createTestSession({ history });

      const messages = buildMessages(session, 'Now change Tuesday lunch');

      // System message + 2 history + 1 new user message = 4
      expect(messages).toHaveLength(4);
      expect(messages[0]?.role).toBe('system');
      expect(messages[1]?.role).toBe('user');
      expect(messages[1]?.content).toBe('Change Monday dinner');
      expect(messages[2]?.role).toBe('assistant');
      expect(messages[2]?.content).toBe('Done, I swapped it.');
      expect(messages[3]?.role).toBe('user');
      expect(messages[3]?.content).toBe('Now change Tuesday lunch');
    });

    it('should have system message as first message', () => {
      const session = createTestSession();
      const messages = buildMessages(session, 'Test critique');

      expect(messages[0]?.role).toBe('system');
      expect(messages[0]?.content).toContain('meal planning assistant');
    });

    it('should append the new critique as last user message', () => {
      const session = createTestSession();
      const messages = buildMessages(session, 'Replace Monday dinner with something lighter');

      const lastMessage = messages[messages.length - 1];
      expect(lastMessage?.role).toBe('user');
      expect(lastMessage?.content).toBe('Replace Monday dinner with something lighter');
    });
  });
});
