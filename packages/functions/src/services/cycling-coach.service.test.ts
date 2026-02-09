import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, buildScheduleGenerationPrompt, isValidScheduleResponse } from './cycling-coach.service.js';

describe('CyclingCoachService', () => {
  describe('buildSystemPrompt', () => {
    it('should include training philosophy in system prompt', () => {
      const philosophy = 'Test philosophy content';
      const prompt = buildSystemPrompt(philosophy);

      expect(prompt).toContain('Test philosophy content');
      expect(prompt).toContain('cycling coach');
    });

    it('should reference Peloton class types', () => {
      const prompt = buildSystemPrompt('');

      expect(prompt).toContain('Power Zone Max');
      expect(prompt).toContain('HIIT & Hills');
      expect(prompt).toContain('Sweat Steady');
      expect(prompt).toContain('Power Zone Endurance');
      expect(prompt).toContain('Recovery Ride');
    });

    it('should include expanded session types in response format', () => {
      const prompt = buildSystemPrompt('');

      expect(prompt).toContain('"vo2max"');
      expect(prompt).toContain('"threshold"');
      expect(prompt).toContain('"endurance"');
      expect(prompt).toContain('"tempo"');
      expect(prompt).toContain('"fun"');
      expect(prompt).toContain('"recovery"');
      expect(prompt).toContain('"off"');
    });

    it('should include Peloton-aware response format', () => {
      const prompt = buildSystemPrompt('');

      expect(prompt).toContain('pelotonClassTypes');
      expect(prompt).toContain('pelotonTip');
      expect(prompt).not.toContain('"intervals"');
    });

    it('should include decision framework', () => {
      const prompt = buildSystemPrompt('');

      expect(prompt).toContain('Decision Framework');
      expect(prompt).toContain('next session');
      expect(prompt).toContain('recovery state');
    });

    it('should include JSON response format instructions', () => {
      const prompt = buildSystemPrompt('');

      expect(prompt).toContain('JSON object');
      expect(prompt).toContain('session');
      expect(prompt).toContain('reasoning');
      expect(prompt).toContain('coachingTips');
      expect(prompt).toContain('warnings');
      expect(prompt).toContain('suggestFTPTest');
    });

    it('should include recovery-based Peloton adjustments', () => {
      const prompt = buildSystemPrompt('');

      expect(prompt).toContain('Recovery-Based Adjustments');
      expect(prompt).toContain('Low Impact');
      expect(prompt).toContain('Recovery Ride');
    });

    it('should not reference specific interval protocols', () => {
      const prompt = buildSystemPrompt('');

      expect(prompt).not.toContain('30/30 Billat');
      expect(prompt).not.toContain('30/120 intervals');
      expect(prompt).not.toContain('40/20 intervals');
    });

    it('should reference lifting interference with Peloton class swaps', () => {
      const prompt = buildSystemPrompt('');

      expect(prompt).toContain('lifting');
      expect(prompt).toContain('Low Impact');
    });
  });

  describe('isValidScheduleResponse', () => {
    function makeValidSession(overrides: Record<string, unknown> = {}): Record<string, unknown> {
      return {
        order: 1,
        sessionType: 'vo2max',
        pelotonClassTypes: ['Power Zone Max', 'HIIT & Hills'],
        suggestedDurationMinutes: 30,
        description: 'High-intensity session',
        ...overrides,
      };
    }

    function makeValidResponse(sessionCount: number): Record<string, unknown> {
      const sessions = Array.from({ length: sessionCount }, (_, i) =>
        makeValidSession({ order: i + 1, sessionType: ['vo2max', 'threshold', 'endurance', 'fun'][i % 4] }),
      );
      return {
        sessions,
        weeklyPlan: {
          totalEstimatedHours: 2.5,
          phases: [{ name: 'Adaptation', weeks: '1-2', description: 'Start easy' }],
        },
        rationale: 'A well-balanced plan.',
      };
    }

    it('should accept a valid response with correct session count', () => {
      expect(isValidScheduleResponse(makeValidResponse(3), 3)).toBe(true);
    });

    it('should accept all valid session types', () => {
      const validTypes = ['vo2max', 'threshold', 'endurance', 'tempo', 'fun', 'recovery'];
      for (const sessionType of validTypes) {
        const response = {
          ...makeValidResponse(1),
          sessions: [makeValidSession({ sessionType })],
        };
        expect(isValidScheduleResponse(response, 1)).toBe(true);
      }
    });

    it('should reject when session count does not match expected', () => {
      // AI returns 3 sessions but expected 2
      expect(isValidScheduleResponse(makeValidResponse(3), 2)).toBe(false);
    });

    it('should reject when AI returns more sessions than requested', () => {
      // Selected 2 sessions but AI generated 3
      expect(isValidScheduleResponse(makeValidResponse(3), 2)).toBe(false);
    });

    it('should reject when AI returns fewer sessions than requested', () => {
      expect(isValidScheduleResponse(makeValidResponse(2), 4)).toBe(false);
    });

    it('should reject invalid sessionType values', () => {
      const response = {
        ...makeValidResponse(1),
        sessions: [makeValidSession({ sessionType: 'intervals' })],
      };
      expect(isValidScheduleResponse(response, 1)).toBe(false);
    });

    it('should reject "off" as a sessionType (not valid for schedule generation)', () => {
      const response = {
        ...makeValidResponse(1),
        sessions: [makeValidSession({ sessionType: 'off' })],
      };
      expect(isValidScheduleResponse(response, 1)).toBe(false);
    });

    it('should reject non-object data', () => {
      expect(isValidScheduleResponse(null, 2)).toBe(false);
      expect(isValidScheduleResponse('string', 2)).toBe(false);
      expect(isValidScheduleResponse(42, 2)).toBe(false);
    });

    it('should reject missing sessions array', () => {
      const response = makeValidResponse(2);
      delete response['sessions'];
      expect(isValidScheduleResponse(response, 2)).toBe(false);
    });

    it('should reject missing rationale', () => {
      const response = makeValidResponse(2);
      delete response['rationale'];
      expect(isValidScheduleResponse(response, 2)).toBe(false);
    });

    it('should reject missing weeklyPlan', () => {
      const response = makeValidResponse(2);
      delete response['weeklyPlan'];
      expect(isValidScheduleResponse(response, 2)).toBe(false);
    });

    it('should reject session with missing order', () => {
      const response = {
        ...makeValidResponse(1),
        sessions: [makeValidSession({ order: undefined })],
      };
      // Remove the key entirely since undefined won't serialize
      delete (response['sessions'])[0]['order'];
      expect(isValidScheduleResponse(response, 1)).toBe(false);
    });

    it('should reject session with non-number suggestedDurationMinutes', () => {
      const response = {
        ...makeValidResponse(1),
        sessions: [makeValidSession({ suggestedDurationMinutes: '30' })],
      };
      expect(isValidScheduleResponse(response, 1)).toBe(false);
    });

    it('should reject session with non-array pelotonClassTypes', () => {
      const response = {
        ...makeValidResponse(1),
        sessions: [makeValidSession({ pelotonClassTypes: 'Power Zone Max' })],
      };
      expect(isValidScheduleResponse(response, 1)).toBe(false);
    });

    it('should work with 4 sessions for advanced config', () => {
      const response = makeValidResponse(4);
      expect(isValidScheduleResponse(response, 4)).toBe(true);
    });

    it('should work with 2 sessions for beginner config', () => {
      const response = {
        ...makeValidResponse(2),
        sessions: [
          makeValidSession({ order: 1, sessionType: 'vo2max' }),
          makeValidSession({ order: 2, sessionType: 'fun' }),
        ],
      };
      expect(isValidScheduleResponse(response, 2)).toBe(true);
    });
  });

  describe('buildScheduleGenerationPrompt', () => {
    it('should return a non-empty string', () => {
      const prompt = buildScheduleGenerationPrompt();
      expect(prompt.length).toBeGreaterThan(100);
    });

    it('should reference Peloton class types', () => {
      const prompt = buildScheduleGenerationPrompt();

      expect(prompt).toContain('Power Zone Max');
      expect(prompt).toContain('Peloton');
      expect(prompt).toContain('sessions');
    });

    it('should include response format with required fields', () => {
      const prompt = buildScheduleGenerationPrompt();

      expect(prompt).toContain('sessionType');
      expect(prompt).toContain('pelotonClassTypes');
      expect(prompt).toContain('suggestedDurationMinutes');
      expect(prompt).toContain('rationale');
    });

    it('should include explicit session count instruction', () => {
      const prompt = buildScheduleGenerationPrompt();

      expect(prompt).toContain('MUST return exactly');
      expect(prompt).toContain('sessionsPerWeek');
      expect(prompt).toContain('No more, no less');
    });
  });
});
