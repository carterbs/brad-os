import { describe, expect, it } from 'vitest';
import {
  calculateVO2MaxSchema,
  createCyclingActivitySchema,
  cyclingActivityDocSchema,
  createFTPEntrySchema,
  createTrainingBlockSchema,
  createWeightGoalSchema,
  cyclingCoachResponseSchema,
  experienceLevelSchema,
  ftpSourceSchema,
  generateScheduleResponseSchema,
  generateScheduleSchema,
  stravaCallbackSchema,
  stravaWebhookEventSchema,
  stravaWebhookSchema,
  stravaWebhookValidationSchema,
  syncStravaTokensSchema,
  trainingGoalSchema,
  updateCyclingProfileSchema,
} from './cycling.schema.js';

const validFTPEntryPayload = {
  value: 250,
  date: '2024-01-01',
  source: 'manual',
};

const validTrainingBlockPayload = {
  startDate: '2024-01-01',
  endDate: '2024-02-01',
  goals: ['regain_fitness'],
};

const validWeeklySession = {
  order: 1,
  sessionType: 'threshold',
  pelotonClassTypes: ['Power Zone'],
  suggestedDurationMinutes: 45,
  description: 'Tempo-focused ride',
  preferredDay: 2,
};

const validGenerateSchedulePayload = {
  sessionsPerWeek: 3,
  preferredDays: [1, 3, 5],
  goals: ['regain_fitness'],
  experienceLevel: 'intermediate',
  weeklyHoursAvailable: 4,
  ftp: 250,
};

const validWeightGoalPayload = {
  targetWeightLbs: 175,
  targetDate: '2026-01-01',
  startWeightLbs: 180,
  startDate: '2025-12-01',
};

const validStravaCallbackPayload = {
  code: 'abc123',
};

const validSyncTokensPayload = {
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  expiresAt: 1700000000,
  athleteId: 12345,
};

const validWebhookValidationPayload = {
  'hub.mode': 'subscribe',
  'hub.challenge': 'challenge-123',
  'hub.verify_token': 'verify-token',
};

const validWebhookEventPayload = {
  aspect_type: 'create',
  event_time: 1700000000,
  object_id: 111,
  object_type: 'activity',
  owner_id: 222,
  subscription_id: 333,
};

const validCalculateVO2MaxPayload = {
  weightKg: 75,
};

const validCyclingProfilePayload = {
  weightKg: 75,
  maxHR: 180,
  restingHR: 50,
};

  const validCyclingActivityPayload = {
  stravaId: 999,
  date: '2026-02-20',
  durationMinutes: 60,
  avgPower: 200,
  normalizedPower: 220,
  maxPower: 300,
  avgHeartRate: 140,
  maxHeartRate: 170,
  tss: 55,
  intensityFactor: 0.8,
  type: 'threshold',
    source: 'strava',
  };

const validCyclingActivityDocPayload = {
  ...validCyclingActivityPayload,
  userId: 'user-1',
  createdAt: '2026-02-20T12:00:00.000Z',
};

describe('cycling.schema', () => {
  describe('trainingGoalSchema', () => {
    it('accepts all valid goal literals', () => {
      const valid = ['regain_fitness', 'maintain_muscle', 'lose_weight'];

      for (const goal of valid) {
        expect(trainingGoalSchema.safeParse(goal).success).toBe(true);
      }
    });

    it('rejects invalid goal literals including case mismatch', () => {
      const invalid = ['gain', 'REGAIN_FITNESS', 'loseWeight', ''];

      for (const goal of invalid) {
        expect(trainingGoalSchema.safeParse(goal).success).toBe(false);
      }
    });
  });

  describe('experienceLevelSchema', () => {
    it('accepts all valid experience levels', () => {
      const valid = ['beginner', 'intermediate', 'advanced'];

      for (const level of valid) {
        expect(experienceLevelSchema.safeParse(level).success).toBe(true);
      }
    });

    it('rejects invalid experience levels including case mismatch', () => {
      const invalid = ['expert', 'Beginner', 'intermediates', ''];

      for (const level of invalid) {
        expect(experienceLevelSchema.safeParse(level).success).toBe(false);
      }
    });
  });

  describe('ftpSourceSchema', () => {
    it('accepts manual and test values', () => {
      const valid = ['manual', 'test'];

      for (const source of valid) {
        expect(ftpSourceSchema.safeParse(source).success).toBe(true);
      }
    });

    it('rejects invalid ftp sources including case mismatch', () => {
      const invalid = ['MANUAL', 'Manual', 'auto', ''];

      for (const source of invalid) {
        expect(ftpSourceSchema.safeParse(source).success).toBe(false);
      }
    });
  });

  describe('createFTPEntrySchema', () => {
    it('accepts value boundaries and valid payload', () => {
      expect(createFTPEntrySchema.safeParse({ ...validFTPEntryPayload, value: 1 }).success).toBe(true);
      expect(createFTPEntrySchema.safeParse({ ...validFTPEntryPayload, value: 500 }).success).toBe(true);
      expect(createFTPEntrySchema.safeParse(validFTPEntryPayload).success).toBe(true);
    });

    it('rejects value, date, and source violations', () => {
      expect(createFTPEntrySchema.safeParse({ ...validFTPEntryPayload, value: 0 }).success).toBe(false);
      expect(createFTPEntrySchema.safeParse({ ...validFTPEntryPayload, value: 501 }).success).toBe(false);
      expect(createFTPEntrySchema.safeParse({ ...validFTPEntryPayload, value: 250.5 }).success).toBe(false);
      expect(createFTPEntrySchema.safeParse({ ...validFTPEntryPayload, date: '2026-2-1' }).success).toBe(false);
      expect(createFTPEntrySchema.safeParse({ ...validFTPEntryPayload, date: 'not-a-date' }).success).toBe(false);
      expect(createFTPEntrySchema.safeParse({ ...validFTPEntryPayload, source: 'manual-ish' }).success).toBe(false);
    });
  });

  describe('createTrainingBlockSchema', () => {
    it('accepts minimal and full payloads', () => {
      expect(createTrainingBlockSchema.safeParse(validTrainingBlockPayload).success).toBe(true);
      expect(
        createTrainingBlockSchema.safeParse({
          ...validTrainingBlockPayload,
          daysPerWeek: 2,
          weeklySessions: [validWeeklySession],
          preferredDays: [0, 2, 4, 6],
          experienceLevel: 'intermediate',
          weeklyHoursAvailable: 4.5,
        }).success
      ).toBe(true);
    });

    it('accepts boundary values', () => {
      expect(
        createTrainingBlockSchema.safeParse({
          ...validTrainingBlockPayload,
          daysPerWeek: 2,
          weeklyHoursAvailable: 1,
          preferredDays: [0],
        }).success
      ).toBe(true);
      expect(
        createTrainingBlockSchema.safeParse({
          ...validTrainingBlockPayload,
          daysPerWeek: 5,
          weeklyHoursAvailable: 20,
          preferredDays: [6],
        }).success
      ).toBe(true);
      expect(
        createTrainingBlockSchema.safeParse({
          ...validTrainingBlockPayload,
          weeklySessions: [{ ...validWeeklySession, preferredDay: 0 }],
        }).success
      ).toBe(true);
      expect(
        createTrainingBlockSchema.safeParse({
          ...validTrainingBlockPayload,
          weeklySessions: [{ ...validWeeklySession, preferredDay: 6 }],
        }).success
      ).toBe(true);
    });

    it('rejects list limits and weekly session boundaries', () => {
      expect(
        createTrainingBlockSchema.safeParse({
          ...validTrainingBlockPayload,
          goals: [],
        }).success
      ).toBe(false);
      expect(
        createTrainingBlockSchema.safeParse({
          ...validTrainingBlockPayload,
          goals: ['regain_fitness', 'maintain_muscle', 'lose_weight', 'regain_fitness'],
        }).success
      ).toBe(false);
      expect(
        createTrainingBlockSchema.safeParse({
          ...validTrainingBlockPayload,
          preferredDays: [0, 7],
        }).success
      ).toBe(false);
      expect(
        createTrainingBlockSchema.safeParse({
          ...validTrainingBlockPayload,
          preferredDays: [1.5],
        }).success
      ).toBe(false);
      expect(
        createTrainingBlockSchema.safeParse({
          ...validTrainingBlockPayload,
          weeklySessions: [{ ...validWeeklySession, order: 1.5 }],
        }).success
      ).toBe(false);
      expect(
        createTrainingBlockSchema.safeParse({
          ...validTrainingBlockPayload,
          weeklySessions: [{ ...validWeeklySession, suggestedDurationMinutes: 0 }],
        }).success
      ).toBe(false);
      expect(
        createTrainingBlockSchema.safeParse({
          ...validTrainingBlockPayload,
          weeklySessions: [{ ...validWeeklySession, sessionType: '' }],
        }).success
      ).toBe(true);
      expect(
        createTrainingBlockSchema.safeParse({
          ...validTrainingBlockPayload,
          weeklySessions: [{ ...validWeeklySession, preferredDay: 7 }],
        }).success
      ).toBe(false);
      expect(
        createTrainingBlockSchema.safeParse({
          ...validTrainingBlockPayload,
          daysPerWeek: 1,
        }).success
      ).toBe(false);
      expect(
        createTrainingBlockSchema.safeParse({
          ...validTrainingBlockPayload,
          daysPerWeek: 6,
        }).success
      ).toBe(false);
      expect(
        createTrainingBlockSchema.safeParse({
          ...validTrainingBlockPayload,
          weeklyHoursAvailable: 0,
        }).success
      ).toBe(false);
      expect(
        createTrainingBlockSchema.safeParse({
          ...validTrainingBlockPayload,
          weeklyHoursAvailable: 21,
        }).success
      ).toBe(false);
    });
  });

  describe('generateScheduleSchema', () => {
    it('accepts valid payload with optional ftp', () => {
      expect(generateScheduleSchema.safeParse(validGenerateSchedulePayload).success).toBe(true);
    });

    it('accepts sessions/week and ftp boundaries', () => {
      expect(
        generateScheduleSchema.safeParse({
          ...validGenerateSchedulePayload,
          sessionsPerWeek: 2,
          ftp: 1,
        }).success
      ).toBe(true);
      expect(
        generateScheduleSchema.safeParse({
          ...validGenerateSchedulePayload,
          sessionsPerWeek: 5,
          ftp: 500,
        }).success
      ).toBe(true);
    });

    it('rejects invalid schedule values', () => {
      expect(
        generateScheduleSchema.safeParse({
          ...validGenerateSchedulePayload,
          sessionsPerWeek: 1,
        }).success
      ).toBe(false);
      expect(
        generateScheduleSchema.safeParse({
          ...validGenerateSchedulePayload,
          sessionsPerWeek: 6,
        }).success
      ).toBe(false);
      expect(
        generateScheduleSchema.safeParse({
          ...validGenerateSchedulePayload,
          goals: ['not_real'],
        }).success
      ).toBe(false);
      expect(
        generateScheduleSchema.safeParse({
          ...validGenerateSchedulePayload,
          experienceLevel: 'guru',
        }).success
      ).toBe(false);
      expect(
        generateScheduleSchema.safeParse({
          ...validGenerateSchedulePayload,
          preferredDays: [-1, 2],
        }).success
      ).toBe(false);
      expect(
        generateScheduleSchema.safeParse({
          ...validGenerateSchedulePayload,
          preferredDays: [0, 8],
        }).success
      ).toBe(false);
      expect(
        generateScheduleSchema.safeParse({
          ...validGenerateSchedulePayload,
          ftp: 0,
        }).success
      ).toBe(false);
      expect(
        generateScheduleSchema.safeParse({
          ...validGenerateSchedulePayload,
          ftp: 501,
        }).success
      ).toBe(false);
    });
  });

  describe('createWeightGoalSchema', () => {
    it('accepts positive weights and valid dates', () => {
      expect(createWeightGoalSchema.safeParse(validWeightGoalPayload).success).toBe(true);
      expect(createWeightGoalSchema.safeParse({ ...validWeightGoalPayload, targetWeightLbs: 175.7 }).success).toBe(true);
      expect(createWeightGoalSchema.safeParse({ ...validWeightGoalPayload, startWeightLbs: 180.9 }).success).toBe(true);
    });

    it('rejects invalid weights and malformed dates', () => {
      expect(
        createWeightGoalSchema.safeParse({
          ...validWeightGoalPayload,
          targetWeightLbs: 0,
        }).success
      ).toBe(false);
      expect(
        createWeightGoalSchema.safeParse({
          ...validWeightGoalPayload,
          startWeightLbs: 501,
        }).success
      ).toBe(false);
      expect(
        createWeightGoalSchema.safeParse({
          ...validWeightGoalPayload,
          targetDate: '01-01-2026',
        }).success
      ).toBe(false);
      expect(
        createWeightGoalSchema.safeParse({
          ...validWeightGoalPayload,
          startDate: 'invalid',
        }).success
      ).toBe(false);
    });
  });

  describe('stravaCallbackSchema', () => {
    it('accepts callback payload with optional state and scope omitted', () => {
      expect(stravaCallbackSchema.safeParse(validStravaCallbackPayload).success).toBe(true);
    });

    it('accepts callback payload with state and scope', () => {
      expect(
        stravaCallbackSchema.safeParse({
          ...validStravaCallbackPayload,
          state: 'abc',
          scope: 'read_all',
        }).success
      ).toBe(true);
    });

    it('rejects missing or empty code', () => {
      expect(stravaCallbackSchema.safeParse({}).success).toBe(false);
      expect(
        stravaCallbackSchema.safeParse({
          ...validStravaCallbackPayload,
          code: '',
        }).success
      ).toBe(false);
    });
  });

  describe('syncStravaTokensSchema', () => {
    it('accepts valid token payload', () => {
      expect(syncStravaTokensSchema.safeParse(validSyncTokensPayload).success).toBe(true);
    });

    it('rejects empty strings and non-positive/non-integer numeric values', () => {
      expect(
        syncStravaTokensSchema.safeParse({
          ...validSyncTokensPayload,
          accessToken: '',
        }).success
      ).toBe(false);
      expect(
        syncStravaTokensSchema.safeParse({
          ...validSyncTokensPayload,
          refreshToken: '',
        }).success
      ).toBe(false);
      expect(
        syncStravaTokensSchema.safeParse({
          ...validSyncTokensPayload,
          expiresAt: 0,
        }).success
      ).toBe(false);
      expect(
        syncStravaTokensSchema.safeParse({
          ...validSyncTokensPayload,
          athleteId: -1,
        }).success
      ).toBe(false);
      expect(
        syncStravaTokensSchema.safeParse({
          ...validSyncTokensPayload,
          athleteId: 0,
        }).success
      ).toBe(false);
      expect(
        syncStravaTokensSchema.safeParse({
          ...validSyncTokensPayload,
          expiresAt: 1.5,
        }).success
      ).toBe(false);
      expect(
        syncStravaTokensSchema.safeParse({
          ...validSyncTokensPayload,
          athleteId: 2.5,
        }).success
      ).toBe(false);
    });
  });

  describe('stravaWebhookValidationSchema', () => {
    it('accepts valid webhook verification payload', () => {
      expect(stravaWebhookValidationSchema.safeParse(validWebhookValidationPayload).success).toBe(true);
    });

    it('rejects invalid mode and missing/empty required keys', () => {
      expect(
        stravaWebhookValidationSchema.safeParse({
          ...validWebhookValidationPayload,
          'hub.mode': 'unsubscribe',
        }).success
      ).toBe(false);
      expect(
        stravaWebhookValidationSchema.safeParse({
          ...validWebhookValidationPayload,
          'hub.challenge': '',
        }).success
      ).toBe(false);
      expect(
        stravaWebhookValidationSchema.safeParse({
          ...validWebhookValidationPayload,
          'hub.verify_token': '',
        }).success
      ).toBe(false);
      expect(stravaWebhookValidationSchema.safeParse({}).success).toBe(false);
    });
  });

  describe('stravaWebhookEventSchema', () => {
    it('accepts event payloads for both object types', () => {
      expect(stravaWebhookEventSchema.safeParse(validWebhookEventPayload).success).toBe(true);
      expect(
        stravaWebhookEventSchema.safeParse({
          ...validWebhookEventPayload,
          object_type: 'athlete',
        }).success
      ).toBe(true);
    });

    it('accepts optional updates map with unknown values', () => {
      expect(
        stravaWebhookEventSchema.safeParse({
          ...validWebhookEventPayload,
          updates: {
            title: 'Morning Ride',
            effort: 7,
            nested: { status: 'ok' },
          },
        }).success
      ).toBe(true);
    });

    it('rejects invalid enums and non-positive/non-integer numeric fields', () => {
      expect(
        stravaWebhookEventSchema.safeParse({
          ...validWebhookEventPayload,
          aspect_type: 'pause',
        }).success
      ).toBe(false);
      expect(
        stravaWebhookEventSchema.safeParse({
          ...validWebhookEventPayload,
          object_type: 'run',
        }).success
      ).toBe(false);
      expect(
        stravaWebhookEventSchema.safeParse({
          ...validWebhookEventPayload,
          event_time: -1,
        }).success
      ).toBe(false);
      expect(
        stravaWebhookEventSchema.safeParse({
          ...validWebhookEventPayload,
          event_time: 12.5,
        }).success
      ).toBe(false);
      expect(
        stravaWebhookEventSchema.safeParse({
          ...validWebhookEventPayload,
          object_id: 0,
        }).success
      ).toBe(false);
      expect(
        stravaWebhookEventSchema.safeParse({
          ...validWebhookEventPayload,
          owner_id: -10,
        }).success
      ).toBe(false);
      expect(
        stravaWebhookEventSchema.safeParse({
          ...validWebhookEventPayload,
          subscription_id: 1.2,
        }).success
      ).toBe(false);
    });
  });

  describe('stravaWebhookSchema', () => {
    it('accepts pure validation payload', () => {
      expect(stravaWebhookSchema.safeParse(validWebhookValidationPayload).success).toBe(true);
    });

    it('accepts pure event payload', () => {
      expect(stravaWebhookSchema.safeParse(validWebhookEventPayload).success).toBe(true);
    });

    it('rejects unrelated payload', () => {
      expect(stravaWebhookSchema.safeParse({ hello: 'world' }).success).toBe(false);
    });

    it('explicitly favors validation branch for mixed payloads with validation keys', () => {
      const mixedPayload = {
        ...validWebhookValidationPayload,
        ...validWebhookEventPayload,
        aspect_type: 'invalid',
      };

      const result = stravaWebhookSchema.safeParse(mixedPayload);
      expect(result.success).toBe(true);
    });
  });

  describe('calculateVO2MaxSchema', () => {
    it('accepts weight bounds', () => {
      expect(calculateVO2MaxSchema.safeParse({ ...validCalculateVO2MaxPayload, weightKg: 1 }).success).toBe(true);
      expect(calculateVO2MaxSchema.safeParse({ ...validCalculateVO2MaxPayload, weightKg: 300 }).success).toBe(true);
    });

    it('rejects non-positive and out-of-range weight values', () => {
      expect(calculateVO2MaxSchema.safeParse({ ...validCalculateVO2MaxPayload, weightKg: 0 }).success).toBe(false);
      expect(calculateVO2MaxSchema.safeParse({ ...validCalculateVO2MaxPayload, weightKg: -1 }).success).toBe(false);
      expect(calculateVO2MaxSchema.safeParse({ ...validCalculateVO2MaxPayload, weightKg: 301 }).success).toBe(false);
    });
  });

  describe('updateCyclingProfileSchema', () => {
    it('accepts required weight with optional HR fields omitted', () => {
      expect(updateCyclingProfileSchema.safeParse({ weightKg: 70 }).success).toBe(true);
      expect(updateCyclingProfileSchema.safeParse(validCyclingProfilePayload).success).toBe(true);
    });

    it('accepts HR boundary values', () => {
      expect(updateCyclingProfileSchema.safeParse({ ...validCyclingProfilePayload, maxHR: 250, restingHR: 150 }).success).toBe(true);
    });

    it('rejects invalid weight and HR inputs', () => {
      expect(updateCyclingProfileSchema.safeParse({ ...validCyclingProfilePayload, weightKg: 0 }).success).toBe(false);
      expect(updateCyclingProfileSchema.safeParse({ ...validCyclingProfilePayload, weightKg: 301 }).success).toBe(false);
      expect(updateCyclingProfileSchema.safeParse({ ...validCyclingProfilePayload, maxHR: 0 }).success).toBe(false);
      expect(updateCyclingProfileSchema.safeParse({ ...validCyclingProfilePayload, maxHR: 1.5 }).success).toBe(false);
      expect(updateCyclingProfileSchema.safeParse({ ...validCyclingProfilePayload, maxHR: 251 }).success).toBe(false);
      expect(updateCyclingProfileSchema.safeParse({ ...validCyclingProfilePayload, restingHR: 0 }).success).toBe(false);
      expect(updateCyclingProfileSchema.safeParse({ ...validCyclingProfilePayload, restingHR: 1.5 }).success).toBe(false);
      expect(updateCyclingProfileSchema.safeParse({ ...validCyclingProfilePayload, restingHR: 151 }).success).toBe(false);
    });
  });

  describe('createCyclingActivitySchema', () => {
    it('accepts valid minimal payload and zero-valued metrics', () => {
      expect(createCyclingActivitySchema.safeParse(validCyclingActivityPayload).success).toBe(true);
      expect(
        createCyclingActivitySchema.safeParse({
          ...validCyclingActivityPayload,
          avgPower: 0,
          normalizedPower: 0,
          maxPower: 0,
          avgHeartRate: 0,
          maxHeartRate: 0,
          tss: 0,
          intensityFactor: 0,
          hrCompleteness: 0,
        }).success
      ).toBe(true);
    });

    it('accepts optional performance fields', () => {
      expect(
        createCyclingActivitySchema.safeParse({
          ...validCyclingActivityPayload,
          ef: 1.2,
          peak5MinPower: 250,
          peak20MinPower: 240,
          hrCompleteness: 100,
          userId: 'user-123',
          createdAt: '2026-03-01T07:00:00.000Z',
        }).success
      ).toBe(true);
    });

    it('rejects invalid enums and non-positive identifiers/duration', () => {
      expect(
        createCyclingActivitySchema.safeParse({
          ...validCyclingActivityPayload,
          type: 'sprint',
        }).success
      ).toBe(false);
      expect(
        createCyclingActivitySchema.safeParse({
          ...validCyclingActivityPayload,
          source: 'manual',
        }).success
      ).toBe(false);
      expect(
        createCyclingActivitySchema.safeParse({
          ...validCyclingActivityPayload,
          stravaId: 0,
        }).success
      ).toBe(false);
      expect(
        createCyclingActivitySchema.safeParse({
          ...validCyclingActivityPayload,
          durationMinutes: 0,
        }).success
      ).toBe(false);
    });

    it('rejects negative metrics and bounded fields', () => {
      expect(
        createCyclingActivitySchema.safeParse({
          ...validCyclingActivityPayload,
          avgPower: -1,
        }).success
      ).toBe(false);
      expect(
        createCyclingActivitySchema.safeParse({
          ...validCyclingActivityPayload,
          tss: -1,
        }).success
      ).toBe(false);
      expect(
        createCyclingActivitySchema.safeParse({
          ...validCyclingActivityPayload,
          hrCompleteness: -1,
        }).success
      ).toBe(false);
      expect(
        createCyclingActivitySchema.safeParse({
          ...validCyclingActivityPayload,
          hrCompleteness: 101,
        }).success
      ).toBe(false);
      expect(
        createCyclingActivitySchema.safeParse({
          ...validCyclingActivityPayload,
          ef: -0.1,
        }).success
      ).toBe(false);
      expect(
        createCyclingActivitySchema.safeParse({
          ...validCyclingActivityPayload,
          peak5MinPower: 0,
        }).success
      ).toBe(false);
      expect(
        createCyclingActivitySchema.safeParse({
          ...validCyclingActivityPayload,
          peak20MinPower: 0,
        }).success
      ).toBe(false);
    });
  });

  describe('cyclingActivityDocSchema', () => {
    it('accepts valid persisted payload with required user and created timestamps', () => {
      const result = cyclingActivityDocSchema.safeParse(validCyclingActivityDocPayload);

      expect(result.success).toBe(true);
    });

    it('rejects payload missing userId', () => {
      const payload = {
        ...validCyclingActivityDocPayload,
      };
      delete payload.userId;

      expect(cyclingActivityDocSchema.safeParse(payload).success).toBe(false);
    });

    it('rejects payload missing createdAt', () => {
      const payload = {
        ...validCyclingActivityDocPayload,
      };
      delete payload.createdAt;

      expect(cyclingActivityDocSchema.safeParse(payload).success).toBe(false);
    });

    it('accepts legacy virtual type and transforms to unknown', () => {
      const result = cyclingActivityDocSchema.safeParse({
        ...validCyclingActivityDocPayload,
        type: 'virtual',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('unknown');
      }
    });
  });

describe('cyclingCoachResponseSchema', () => {
  it('accepts a valid coaching response', () => {
    const payload = {
      session: {
        type: 'threshold',
        durationMinutes: 45,
        pelotonClassTypes: ['Power Zone', 'Sweat Steady'],
        pelotonTip: 'Choose a 45-min steady effort class.',
        targetTSS: { min: 45, max: 65 },
        targetZones: 'Zone 4 with short easy recoveries',
      },
      reasoning: 'Good balance after recovery check.',
      coachingTips: ['Fuel before class', 'Stay hydrated'],
      warnings: [{ type: 'fatigue', message: 'Watch your form today.' }],
      suggestFTPTest: true,
    };

    expect(cyclingCoachResponseSchema.safeParse(payload).success).toBe(true);
  });

  it('rejects invalid session type', () => {
    const payload = {
      session: {
        type: 'cruising',
        durationMinutes: 30,
        pelotonClassTypes: ['Music'],
        pelotonTip: 'Take it easy.',
        targetTSS: { min: 20, max: 30 },
        targetZones: 'Zone 1',
      },
      reasoning: 'Invalid type',
    };

    expect(cyclingCoachResponseSchema.safeParse(payload).success).toBe(false);
  });

  it('rejects coaching tips not as string array', () => {
    const payload = {
      session: {
        type: 'vo2max',
        durationMinutes: 30,
        pelotonClassTypes: ['Power Zone Max'],
        pelotonTip: 'Push hard',
        targetTSS: { min: 30, max: 50 },
        targetZones: 'Zone 5',
      },
      reasoning: 'Test',
      coachingTips: 'this should be an array',
    };

    expect(cyclingCoachResponseSchema.safeParse(payload).success).toBe(false);
  });
});

describe('generateScheduleResponseSchema', () => {
  it('accepts a valid generated schedule response', () => {
    const payload = {
      sessions: [
        {
          order: 1,
          sessionType: 'vo2max',
          pelotonClassTypes: ['Power Zone Max'],
          suggestedDurationMinutes: 30,
          description: 'Hard day',
        },
        {
          order: 2,
          sessionType: 'recovery',
          pelotonClassTypes: ['Recovery Ride'],
          suggestedDurationMinutes: 20,
          description: 'Easy day',
        },
      ],
      weeklyPlan: {
        totalEstimatedHours: 3.5,
        phases: [{ name: 'Build', weeks: '1-2', description: 'Increase volume.' }],
      },
      rationale: 'Balanced workload.',
    };

    expect(generateScheduleResponseSchema.safeParse(payload).success).toBe(true);
  });

  it('rejects schedule responses with invalid sessionType', () => {
    const payload = {
      sessions: [
        {
          order: 1,
          sessionType: 'off',
          pelotonClassTypes: ['Rest'],
          suggestedDurationMinutes: 0,
          description: 'Rest day',
        },
      ],
      weeklyPlan: {
        totalEstimatedHours: 0,
        phases: [],
      },
      rationale: 'Off not valid for schedule.',
    };

    expect(generateScheduleResponseSchema.safeParse(payload).success).toBe(false);
  });

  it('rejects generated schedule responses missing rationale', () => {
    const payload = {
      sessions: [
        {
          order: 1,
          sessionType: 'fun',
          pelotonClassTypes: ['Music'],
          suggestedDurationMinutes: 30,
          description: 'Fun ride',
        },
      ],
      weeklyPlan: {
        totalEstimatedHours: 0.5,
        phases: [],
      },
    };

    expect(generateScheduleResponseSchema.safeParse(payload).success).toBe(false);
  });
});

});
