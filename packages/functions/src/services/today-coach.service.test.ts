import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock OpenAI before importing the service - expose mockCreate for test control
const mockCreate = vi.fn();
vi.mock('openai', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    })),
  };
});

// Mock firebase-functions/logger
vi.mock('firebase-functions/logger', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

import {
  buildTodayCoachSystemPrompt,
  isValidTodayCoachResponse,
  createFallbackResponse,
  getTodayCoachRecommendation,
} from './today-coach.service.js';
import type { TodayCoachRequest } from '../shared.js';

/**
 * Create a minimal valid TodayCoachRequest for testing.
 */
function createMinimalCoachRequest(
  overrides: Partial<TodayCoachRequest> = {}
): TodayCoachRequest {
  return {
    recovery: {
      date: '2024-01-15',
      hrvMs: 55,
      hrvVsBaseline: 5,
      rhrBpm: 58,
      rhrVsBaseline: -2,
      sleepHours: 7.5,
      sleepEfficiency: 92,
      deepSleepPercent: 22,
      score: 75,
      state: 'ready',
    },
    recoveryHistory: [],
    todaysWorkout: null,
    liftingHistory: [],
    liftingSchedule: { nextWorkoutDay: null, daysPerWeek: 3 },
    mesocycleContext: null,
    cyclingContext: null,
    stretchingContext: {
      lastSessionDate: null,
      daysSinceLastSession: null,
      sessionsThisWeek: 0,
      lastRegions: [],
    },
    meditationContext: {
      lastSessionDate: null,
      daysSinceLastSession: null,
      sessionsThisWeek: 0,
      totalMinutesThisWeek: 0,
      currentStreak: 0,
    },
    weightMetrics: null,
    healthTrends: null,
    timezone: 'America/Chicago',
    currentDate: '2024-01-15',
    timeContext: { timeOfDay: 'morning', currentHour: 9 },
    completedActivities: {
      hasLiftedToday: false,
      liftedAt: null,
      hasCycledToday: false,
      cycledAt: null,
      hasStretchedToday: false,
      stretchedAt: null,
      hasMeditatedToday: false,
      meditatedAt: null,
    },
    ...overrides,
  };
}

describe('Today Coach Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('buildTodayCoachSystemPrompt', () => {
    it('should return a non-empty system prompt string', () => {
      const prompt = buildTodayCoachSystemPrompt();

      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(100);
    });

    it('should include key coaching domains', () => {
      const prompt = buildTodayCoachSystemPrompt();

      expect(prompt).toContain('recovery');
      expect(prompt).toContain('lifting');
      expect(prompt).toContain('cycling');
      expect(prompt).toContain('stretching');
      expect(prompt).toContain('meditation');
    });
  });

  describe('isValidTodayCoachResponse', () => {
    it('should accept a valid response object', () => {
      const validResponse = {
        dailyBriefing: 'Great day for training.',
        sections: {
          recovery: { insight: 'Recovery is good.', status: 'good' },
          lifting: null,
          cycling: null,
          stretching: {
            insight: 'Stretch your back.',
            suggestedRegions: ['back'],
            priority: 'normal',
          },
          meditation: {
            insight: 'Short session today.',
            suggestedDurationMinutes: 10,
            priority: 'normal',
          },
          weight: null,
        },
        warnings: [],
      };

      expect(isValidTodayCoachResponse(validResponse)).toBe(true);
    });

    it('should reject null', () => {
      expect(isValidTodayCoachResponse(null)).toBe(false);
    });

    it('should reject missing dailyBriefing', () => {
      expect(isValidTodayCoachResponse({ sections: {}, warnings: [] })).toBe(false);
    });

    it('should reject invalid recovery status', () => {
      const invalid = {
        dailyBriefing: 'Test',
        sections: {
          recovery: { insight: 'Test', status: 'invalid' },
          stretching: { insight: 'Test', suggestedRegions: [], priority: 'normal' },
          meditation: { insight: 'Test', suggestedDurationMinutes: 10, priority: 'normal' },
        },
        warnings: [],
      };
      expect(isValidTodayCoachResponse(invalid)).toBe(false);
    });
  });

  describe('createFallbackResponse', () => {
    it('should return a valid response structure', () => {
      const request = createMinimalCoachRequest();
      const response = createFallbackResponse(request);

      expect(response.dailyBriefing).toBeDefined();
      expect(typeof response.dailyBriefing).toBe('string');
      expect(response.sections).toBeDefined();
      expect(response.sections.recovery).toBeDefined();
      expect(response.sections.stretching).toBeDefined();
      expect(response.sections.meditation).toBeDefined();
      expect(Array.isArray(response.warnings)).toBe(true);
    });

    it('should include fallback warning', () => {
      const request = createMinimalCoachRequest();
      const response = createFallbackResponse(request);

      const fallbackWarning = response.warnings.find((w) => w.type === 'fallback');
      expect(fallbackWarning).toBeDefined();
    });

    it('should set lifting section to null when no workout scheduled', () => {
      const request = createMinimalCoachRequest({ todaysWorkout: null });
      const response = createFallbackResponse(request);

      expect(response.sections.lifting).toBeNull();
    });

    it('should include lifting section when workout is scheduled', () => {
      const request = createMinimalCoachRequest({
        todaysWorkout: {
          planDayName: 'Push Day',
          weekNumber: 1,
          isDeload: false,
          exerciseCount: 5,
          status: 'pending',
          completedAt: null,
        },
      });
      const response = createFallbackResponse(request);

      expect(response.sections.lifting).not.toBeNull();
      expect(response.sections.lifting?.workout?.planDayName).toBe('Push Day');
    });

    it('should set recovery status based on score', () => {
      const highScoreRequest = createMinimalCoachRequest({
        recovery: {
          date: '2024-01-15',
          hrvMs: 60,
          hrvVsBaseline: 10,
          rhrBpm: 55,
          rhrVsBaseline: -3,
          sleepHours: 8,
          sleepEfficiency: 95,
          deepSleepPercent: 25,
          score: 85,
          state: 'ready',
        },
      });
      const response = createFallbackResponse(highScoreRequest);
      expect(response.sections.recovery.status).toBe('great');

      const lowScoreRequest = createMinimalCoachRequest({
        recovery: {
          date: '2024-01-15',
          hrvMs: 35,
          hrvVsBaseline: -20,
          rhrBpm: 68,
          rhrVsBaseline: 8,
          sleepHours: 5,
          sleepEfficiency: 70,
          deepSleepPercent: 12,
          score: 25,
          state: 'recover',
        },
      });
      const lowResponse = createFallbackResponse(lowScoreRequest);
      expect(lowResponse.sections.recovery.status).toBe('warning');
    });
  });

  describe('isValidTodayCoachResponse - nested field validation', () => {
    it('should reject cycling session with missing required fields', () => {
      const invalidResponse = {
        dailyBriefing: 'Test',
        sections: {
          recovery: { insight: 'Test', status: 'good' },
          lifting: null,
          cycling: {
            insight: 'Test',
            session: {
              type: 'threshold',
              durationMinutes: 60,
              pelotonClassTypes: [],
              pelotonTip: 'Test tip',
              // Missing targetTSS and targetZones
            },
            priority: 'normal',
          },
          stretching: { insight: 'Test', suggestedRegions: [], priority: 'normal' },
          meditation: { insight: 'Test', suggestedDurationMinutes: 10, priority: 'normal' },
          weight: null,
        },
        warnings: [],
      };
      expect(isValidTodayCoachResponse(invalidResponse)).toBe(false);
    });

    it('should reject missing stretching priority', () => {
      const invalidResponse = {
        dailyBriefing: 'Test',
        sections: {
          recovery: { insight: 'Test', status: 'good' },
          lifting: null,
          cycling: null,
          stretching: { insight: 'Test', suggestedRegions: [] },
          meditation: { insight: 'Test', suggestedDurationMinutes: 10, priority: 'normal' },
          weight: null,
        },
        warnings: [],
      };
      expect(isValidTodayCoachResponse(invalidResponse)).toBe(false);
    });

    it('should reject missing meditation priority', () => {
      const invalidResponse = {
        dailyBriefing: 'Test',
        sections: {
          recovery: { insight: 'Test', status: 'good' },
          lifting: null,
          cycling: null,
          stretching: { insight: 'Test', suggestedRegions: [], priority: 'normal' },
          meditation: { insight: 'Test', suggestedDurationMinutes: 10 },
          weight: null,
        },
        warnings: [],
      };
      expect(isValidTodayCoachResponse(invalidResponse)).toBe(false);
    });

    it('should reject invalid warning item (missing message)', () => {
      const invalidResponse = {
        dailyBriefing: 'Test',
        sections: {
          recovery: { insight: 'Test', status: 'good' },
          lifting: null,
          cycling: null,
          stretching: { insight: 'Test', suggestedRegions: [], priority: 'normal' },
          meditation: { insight: 'Test', suggestedDurationMinutes: 10, priority: 'normal' },
          weight: null,
        },
        warnings: [{ type: 'overtraining' }],
      };
      expect(isValidTodayCoachResponse(invalidResponse)).toBe(false);
    });

    it('should reject weight section without insight', () => {
      const invalidResponse = {
        dailyBriefing: 'Test',
        sections: {
          recovery: { insight: 'Test', status: 'good' },
          lifting: null,
          cycling: null,
          stretching: { insight: 'Test', suggestedRegions: [], priority: 'normal' },
          meditation: { insight: 'Test', suggestedDurationMinutes: 10, priority: 'normal' },
          weight: {},
        },
        warnings: [],
      };
      expect(isValidTodayCoachResponse(invalidResponse)).toBe(false);
    });

    it('should accept valid response with complete cycling session', () => {
      const validResponse = {
        dailyBriefing: 'Great day',
        sections: {
          recovery: { insight: 'Recovery is good.', status: 'good' },
          lifting: null,
          cycling: {
            insight: 'Cycling looks good.',
            session: {
              type: 'threshold',
              durationMinutes: 60,
              pelotonClassTypes: ['Power Zone'],
              pelotonTip: 'Take the latest class',
              targetTSS: { min: 100, max: 150 },
              targetZones: 'Zones 3-4',
            },
            priority: 'normal',
          },
          stretching: { insight: 'Stretch well.', suggestedRegions: ['back'], priority: 'normal' },
          meditation: { insight: 'Meditate.', suggestedDurationMinutes: 10, priority: 'normal' },
          weight: { insight: 'Weight is stable.' },
        },
        warnings: [{ type: 'overtraining', message: 'Watch for overtraining' }],
      };
      expect(isValidTodayCoachResponse(validResponse)).toBe(true);
    });
  });

  describe('getTodayCoachRecommendation - fallback scenarios', () => {
    it('should return fallback response when OpenAI returns malformed JSON', async () => {
      const request = createMinimalCoachRequest();

      mockCreate.mockResolvedValue({
        choices: [
          { message: { content: 'this is not valid json at all' } },
        ],
      });

      const result = await getTodayCoachRecommendation(request, 'test-api-key');

      expect(result.sections.recovery).toBeDefined();
      expect(result.sections.stretching).toBeDefined();
      expect(result.sections.meditation).toBeDefined();
      const fallbackWarning = result.warnings.find((w) => w.type === 'fallback');
      expect(fallbackWarning).toBeDefined();
      expect(fallbackWarning?.message).toContain('default recommendation');
    });

    it('should return fallback response when OpenAI JSON is missing meditation.priority', async () => {
      const request = createMinimalCoachRequest();

      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                dailyBriefing: 'Test',
                sections: {
                  recovery: { insight: 'Test', status: 'good' },
                  lifting: null,
                  cycling: null,
                  stretching: { insight: 'Test', suggestedRegions: [], priority: 'normal' },
                  meditation: { insight: 'Test', suggestedDurationMinutes: 10 },
                  weight: null,
                },
                warnings: [],
              }),
            },
          },
        ],
      });

      const result = await getTodayCoachRecommendation(request, 'test-api-key');

      expect(result.sections.recovery).toBeDefined();
      const fallbackWarning = result.warnings.find((w) => w.type === 'fallback');
      expect(fallbackWarning).toBeDefined();
    });

    it('should return fallback response after timeout-like OpenAI errors and retry 3 times', async () => {
      const request = createMinimalCoachRequest();

      mockCreate.mockRejectedValue(new Error('Connection timeout'));

      const result = await getTodayCoachRecommendation(request, 'test-api-key');

      expect(result.sections.recovery).toBeDefined();
      const fallbackWarning = result.warnings.find((w) => w.type === 'fallback');
      expect(fallbackWarning).toBeDefined();
      // Should have retried 3 times
      expect(mockCreate).toHaveBeenCalledTimes(3);
    }, { timeout: 30000 });

    it('should return valid parsed AI response when OpenAI returns valid full JSON', async () => {
      const request = createMinimalCoachRequest();

      const validAIResponse = {
        dailyBriefing: 'Great recovery today. Time for a solid workout.',
        sections: {
          recovery: { insight: 'Recovery score is 75/100.', status: 'good' },
          lifting: null,
          cycling: null,
          stretching: { insight: 'Consider stretching.', suggestedRegions: ['back'], priority: 'normal' },
          meditation: { insight: 'Short session recommended.', suggestedDurationMinutes: 10, priority: 'normal' },
          weight: null,
        },
        warnings: [],
      };

      mockCreate.mockResolvedValue({
        choices: [
          { message: { content: JSON.stringify(validAIResponse) } },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
      });

      const result = await getTodayCoachRecommendation(request, 'test-api-key');

      expect(result.dailyBriefing).toBe(validAIResponse.dailyBriefing);
      expect(result.sections.recovery.status).toBe('good');
      expect(result.warnings.length).toBe(0);
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('should succeed on retry after transient failure', async () => {
      const request = createMinimalCoachRequest();

      const validAIResponse = {
        dailyBriefing: 'Good recovery.',
        sections: {
          recovery: { insight: 'Recovery is good.', status: 'good' },
          lifting: null,
          cycling: null,
          stretching: { insight: 'Stretch.', suggestedRegions: [], priority: 'normal' },
          meditation: { insight: 'Meditate.', suggestedDurationMinutes: 10, priority: 'normal' },
          weight: null,
        },
        warnings: [],
      };

      mockCreate
        .mockRejectedValueOnce(new Error('Connection reset'))
        .mockResolvedValueOnce({
          choices: [{ message: { content: JSON.stringify(validAIResponse) } }],
          usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
        });

      const result = await getTodayCoachRecommendation(request, 'test-api-key');

      expect(result.dailyBriefing).toBe('Good recovery.');
      expect(mockCreate).toHaveBeenCalledTimes(2);
    }, { timeout: 30000 });
  });
});
