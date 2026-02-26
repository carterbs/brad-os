import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockOpenAIChatCreate = vi.hoisted(() => vi.fn());
const mockReadFileSync = vi.hoisted(() => vi.fn());

vi.mock('openai', () => ({
  default: vi.fn(() => ({
    chat: {
      completions: {
        create: mockOpenAIChatCreate,
      },
    },
  })),
}));

vi.mock('node:fs', () => ({
  readFileSync: mockReadFileSync,
}));

vi.mock('firebase-functions/logger', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

import {
  buildSystemPrompt,
  buildScheduleGenerationPrompt,
  isValidScheduleResponse,
  getCyclingRecommendation,
  generateSchedule,
} from './cycling-coach.service.js';

describe('CyclingCoachService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadFileSync.mockReturnValue(`Return exactly sessionsPerWeek sessions. No more, no less.
Power Zone Max
Peloton
sessionType
pelotonClassTypes
suggestedDurationMinutes
rationale`);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

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

    it('should include weight and body composition guidance', () => {
      const prompt = buildSystemPrompt('');

      expect(prompt).toContain('Weight & Body Composition');
      expect(prompt).toContain('currentLbs');
      expect(prompt).toContain('trend7DayLbs');
      expect(prompt).toContain('weight goal');
      expect(prompt).toContain('under-fueling');
    });

    it('should include VO2 max interpretation guidance', () => {
      const prompt = buildSystemPrompt('');

      expect(prompt).toContain('VO2 Max');
      expect(prompt).toContain('overtraining');
      expect(prompt).toContain('recovery week');
    });

    it('should include recovery trend guidance', () => {
      const prompt = buildSystemPrompt('');

      expect(prompt).toContain('Recovery Trend');
      expect(prompt).toContain('recoveryHistory');
      expect(prompt).toContain('consecutive');
      expect(prompt).toContain('accumulated fatigue');
    });

    it('should include athlete profile guidance for experience level and HR', () => {
      const prompt = buildSystemPrompt('');

      expect(prompt).toContain('experienceLevel');
      expect(prompt).toContain('beginners');
      expect(prompt).toContain('maxHR');
      expect(prompt).toContain('restingHR');
    });

    it('should include FTP history plateau detection guidance', () => {
      const prompt = buildSystemPrompt('');

      expect(prompt).toContain('ftpHistory');
      expect(prompt).toContain('plateaued');
      expect(prompt).toContain('training stimulus');
    });

    it('should include EF trend interpretation guidance', () => {
      const prompt = buildSystemPrompt('');

      expect(prompt).toContain('Efficiency Factor');
      expect(prompt).toContain('efTrend');
      expect(prompt).toContain('aerobic fitness');
      expect(prompt).toContain('declining');
    });

    it('should include mesocycle context guidance', () => {
      const prompt = buildSystemPrompt('');

      expect(prompt).toContain('Mesocycle Context');
      expect(prompt).toContain('mesocycleContext');
      expect(prompt).toContain('Deload week');
      expect(prompt).toContain('push harder on the bike');
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

      expect(prompt).toContain('Return exactly');
      expect(prompt).toContain('sessionsPerWeek');
      expect(prompt).toContain('No more, no less');
    });
  });

  describe('OpenAI integration behavior', () => {
    function makeCoachRequest(
      sessionType: 'vo2max' | 'threshold' | 'fun' | 'off' = 'threshold'
    ): Parameters<typeof getCyclingRecommendation>[0] {
      return {
        recovery: {
          date: '2026-02-10',
          hrvMs: 55,
          hrvVsBaseline: 3,
          rhrBpm: 56,
          rhrVsBaseline: -1,
          sleepHours: 7.8,
          sleepEfficiency: 91,
          deepSleepPercent: 21,
          score: 74,
          state: 'ready',
        },
        trainingLoad: {
          recentCyclingWorkouts: [],
          atl: 42,
          ctl: 38,
          tsb: 4,
        },
        recentLiftingWorkouts: [],
        athlete: {
          ftp: 255,
          ftpLastTestedDate: '2026-01-20',
          goals: ['regain_fitness'],
          weekInBlock: 3,
          blockStartDate: '2026-01-01',
        },
        weight: {
          currentLbs: 182,
          trend7DayLbs: -0.3,
          trend30DayLbs: -1.2,
        },
        schedule: {
          dayOfWeek: 'Tuesday',
          sessionType,
          nextSession: null,
          sessionsCompletedThisWeek: 1,
          totalSessionsThisWeek: 3,
          weeklySessionQueue: [],
          liftingSchedule: {
            today: { planned: false },
            tomorrow: { planned: true, isLowerBody: false },
            yesterday: { completed: true, isLowerBody: false },
          },
        },
      };
    }

    function makeScheduleRequest(
      sessionsPerWeek: number
    ): Parameters<typeof generateSchedule>[0] {
      return {
        sessionsPerWeek,
        preferredDays: [2, 4, 6],
        goals: ['regain_fitness'],
        experienceLevel: 'intermediate',
        weeklyHoursAvailable: 4.5,
        ftp: 250,
      };
    }

    const validCoachResponse = {
      session: {
        type: 'threshold',
        durationMinutes: 45,
        pelotonClassTypes: ['Power Zone', 'Sweat Steady'],
        pelotonTip: 'Pick a 45-min Power Zone class and stay steady.',
        targetTSS: { min: 50, max: 70 },
        targetZones: 'Zone 4 sustained, Zone 2 recovery',
      },
      reasoning: 'Recovery and load support threshold work today.',
      coachingTips: ['Fuel pre-ride', 'Keep cadence steady'],
      warnings: null,
      suggestFTPTest: false,
    };

    it('returns parsed recommendation when OpenAI responds with valid JSON', async () => {
      mockOpenAIChatCreate.mockResolvedValue({
        choices: [{ message: { content: JSON.stringify(validCoachResponse) } }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      });

      const result = await getCyclingRecommendation(makeCoachRequest(), 'philosophy', 'test-key');

      expect(result.session.type).toBe('threshold');
      expect(result.coachingTips).toEqual(['Fuel pre-ride', 'Keep cadence steady']);
      expect(mockOpenAIChatCreate).toHaveBeenCalledTimes(1);
    });

    it('retries on transient OpenAI errors and succeeds on a later attempt', async () => {
      vi.useFakeTimers();
      mockOpenAIChatCreate
        .mockRejectedValueOnce(new Error('rate limited'))
        .mockResolvedValueOnce({
          choices: [{ message: { content: JSON.stringify(validCoachResponse) } }],
          usage: { prompt_tokens: 8, completion_tokens: 12, total_tokens: 20 },
        });

      const promise = getCyclingRecommendation(makeCoachRequest(), 'philosophy', 'test-key');
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.session.type).toBe('threshold');
      expect(mockOpenAIChatCreate).toHaveBeenCalledTimes(2);
    });

    it('throws after exhausting all retry attempts', async () => {
      vi.useFakeTimers();
      mockOpenAIChatCreate.mockRejectedValue(new Error('network down'));

      const promise = getCyclingRecommendation(makeCoachRequest(), 'philosophy', 'test-key');
      const assertion = expect(promise).rejects.toThrow('OpenAI API call failed after 3 attempts');
      await vi.runAllTimersAsync();

      await assertion;
      expect(mockOpenAIChatCreate).toHaveBeenCalledTimes(3);
    });

    it('falls back to default recommendation when response JSON is invalid', async () => {
      mockOpenAIChatCreate.mockResolvedValue({
        choices: [{ message: { content: '{"session":' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      });

      const result = await getCyclingRecommendation(makeCoachRequest('threshold'), 'philosophy', 'test-key');

      expect(result.reasoning).toContain('Unable to generate personalized recommendation');
      expect(result.session.type).toBe('threshold');
      expect(result.warnings?.[0]?.type).toBe('fallback');
    });

    it('falls back to fun session when shape is invalid and requested session is unknown to defaults', async () => {
      mockOpenAIChatCreate.mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({ session: { type: 'bad' } }) } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      });

      const result = await getCyclingRecommendation(makeCoachRequest('off'), 'philosophy', 'test-key');

      expect(result.session.type).toBe('fun');
      expect(result.session.pelotonClassTypes).toContain('Music');
    });

    it('uses fallback schedule prompt text when prompt file is unavailable', () => {
      mockReadFileSync.mockImplementationOnce(() => {
        throw new Error('missing prompt file');
      });

      const prompt = buildScheduleGenerationPrompt();
      expect(prompt).toContain('Generate an ordered list of weekly sessions');
      expect(prompt).toContain('"vo2max"|"threshold"');
    });

    it('returns generated schedule when model output is valid', async () => {
      const request = makeScheduleRequest(3);
      mockOpenAIChatCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              sessions: [
                { order: 1, sessionType: 'vo2max', pelotonClassTypes: ['Power Zone Max'], suggestedDurationMinutes: 30, description: 'Hard day' },
                { order: 2, sessionType: 'threshold', pelotonClassTypes: ['Power Zone'], suggestedDurationMinutes: 45, description: 'Steady day' },
                { order: 3, sessionType: 'fun', pelotonClassTypes: ['Music'], suggestedDurationMinutes: 30, description: 'Enjoyment ride' },
              ],
              weeklyPlan: {
                totalEstimatedHours: 1.8,
                phases: [{ name: 'Build', weeks: '1-2', description: 'Increase workload' }],
              },
              rationale: 'Balanced progression.',
            }),
          },
        }],
        usage: { prompt_tokens: 25, completion_tokens: 40, total_tokens: 65 },
      });

      const result = await generateSchedule(request, 'test-key');

      expect(result.sessions).toHaveLength(3);
      expect(result.rationale).toBe('Balanced progression.');
      const calls = mockOpenAIChatCreate.mock.calls as Array<
        [{ response_format?: { type?: string } }]
      >;
      const firstCall = calls[0]?.[0];
      expect(firstCall?.response_format?.type).toBe('json_schema');
    });

    it('returns fallback schedule when AI response shape is invalid', async () => {
      const request = makeScheduleRequest(4);
      mockOpenAIChatCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              sessions: [{ order: 1, sessionType: 'vo2max', pelotonClassTypes: ['Power Zone Max'], suggestedDurationMinutes: 30, description: 'Only one' }],
              weeklyPlan: { totalEstimatedHours: 0.5, phases: [] },
              rationale: 'Invalid count',
            }),
          },
        }],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      });

      const result = await generateSchedule(request, 'test-key');

      expect(result.rationale).toContain('Default schedule generated');
      expect(result.sessions).toHaveLength(4);
      expect(result.sessions[0]?.sessionType).toBe('vo2max');
      expect(result.sessions[3]?.sessionType).toBe('fun');
    });

    it('returns default-order fallback schedule when parsing fails', async () => {
      const request = makeScheduleRequest(6);
      mockOpenAIChatCreate.mockResolvedValue({
        choices: [{ message: { content: '{invalid-json' } }],
        usage: { prompt_tokens: 9, completion_tokens: 4, total_tokens: 13 },
      });

      const result = await generateSchedule(request, 'test-key');

      expect(result.sessions).toHaveLength(3);
      expect(result.sessions.map((s) => s.sessionType)).toEqual(['vo2max', 'threshold', 'fun']);
    });
  });
});
