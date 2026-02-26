import { describe, expect, it } from 'vitest';
import {
  createCyclingActivitySchema,
  createFTPEntrySchema,
  createTrainingBlockSchema,
  createWeightGoalSchema,
  calculateVO2MaxSchema,
  experienceLevelSchema,
  ftpSourceSchema,
  generateScheduleSchema,
  stravaCallbackSchema,
  stravaWebhookEventSchema,
  stravaWebhookSchema,
  stravaWebhookValidationSchema,
  syncStravaTokensSchema,
  trainingGoalSchema,
  type CreateCyclingActivityInput,
  type CreateFTPEntryInput,
  type CreateTrainingBlockInput,
  type CreateWeightGoalInput,
  type GenerateScheduleInput,
  updateCyclingProfileSchema,
  cyclingCoachResponseSchema,
  generateScheduleResponseSchema,
} from './cycling.schema.js';

function buildValidTrainingBlock(
  overrides: Partial<CreateTrainingBlockInput> = {}
): CreateTrainingBlockInput {
  return {
    startDate: '2026-02-01',
    endDate: '2026-03-01',
    goals: ['regain_fitness'],
    ...overrides,
  };
}

function buildValidGenerateSchedule(
  overrides: Partial<GenerateScheduleInput> = {}
): GenerateScheduleInput {
  return {
    sessionsPerWeek: 3,
    preferredDays: [1, 3, 5],
    goals: ['regain_fitness'],
    experienceLevel: 'intermediate',
    weeklyHoursAvailable: 8,
    ...overrides,
  };
}

function buildValidCyclingActivity(
  overrides: Partial<CreateCyclingActivityInput> = {}
): CreateCyclingActivityInput {
  return {
    stravaId: 12345,
    date: '2026-02-10T10:00:00Z',
    durationMinutes: 60,
    avgPower: 200,
    normalizedPower: 205,
    maxPower: 320,
    avgHeartRate: 140,
    maxHeartRate: 175,
    tss: 80,
    intensityFactor: 0.85,
    type: 'threshold',
    source: 'strava',
    ...overrides,
  };
}

function buildValidFTPEntry(overrides: Partial<CreateFTPEntryInput> = {}): CreateFTPEntryInput {
  return {
    value: 250,
    date: '2026-02-26',
    source: 'manual',
    ...overrides,
  };
}

function buildValidWeightGoal(overrides: Partial<CreateWeightGoalInput> = {}): CreateWeightGoalInput {
  return {
    targetWeightLbs: 175,
    targetDate: '2026-02-28',
    startWeightLbs: 185,
    startDate: '2026-01-01',
    ...overrides,
  };
}

describe('cycling.schema', () => {
  describe('trainingGoalSchema', () => {
    it('accepts all training goals', () => {
      const goals = ['regain_fitness', 'maintain_muscle', 'lose_weight'];
      for (const goal of goals) {
        const result = trainingGoalSchema.safeParse(goal);
        expect(result.success).toBe(true);
      }
    });

    it('rejects invalid training goal', () => {
      const result = trainingGoalSchema.safeParse('invalid');
      expect(result.success).toBe(false);
    });
  });

  describe('experienceLevelSchema', () => {
    it('accepts all experience levels', () => {
      const levels = ['beginner', 'intermediate', 'advanced'];
      for (const level of levels) {
        const result = experienceLevelSchema.safeParse(level);
        expect(result.success).toBe(true);
      }
    });

    it('rejects invalid experience level', () => {
      const result = experienceLevelSchema.safeParse('expert');
      expect(result.success).toBe(false);
    });
  });

  describe('ftpSourceSchema', () => {
    it('accepts all ftp sources', () => {
      const sources = ['manual', 'test'];
      for (const source of sources) {
        const result = ftpSourceSchema.safeParse(source);
        expect(result.success).toBe(true);
      }
    });

    it('rejects invalid ftp source', () => {
      const result = ftpSourceSchema.safeParse('external');
      expect(result.success).toBe(false);
    });
  });

  describe('createFTPEntrySchema', () => {
    it('accepts boundary values and valid source', () => {
      const base = buildValidFTPEntry();
      expect(createFTPEntrySchema.safeParse({ ...base, value: 1, source: 'manual' }).success).toBe(true);
      expect(createFTPEntrySchema.safeParse({ ...base, value: 500, source: 'test' }).success).toBe(true);
    });

    it('rejects out-of-range and malformed values', () => {
      const base = buildValidFTPEntry();
      const zero = createFTPEntrySchema.safeParse({ ...base, value: 0 });
      const high = createFTPEntrySchema.safeParse({ ...base, value: 501 });
      const decimal = createFTPEntrySchema.safeParse({ ...base, value: 250.5 });
      const badDate = createFTPEntrySchema.safeParse({ ...base, date: '2026/02/26' });
      const badSource = createFTPEntrySchema.safeParse({ ...base, source: 'external' as 'manual' });

      expect(zero.success).toBe(false);
      expect(high.success).toBe(false);
      expect(decimal.success).toBe(false);
      expect(badDate.success).toBe(false);
      expect(badSource.success).toBe(false);
    });
  });

  describe('createTrainingBlockSchema', () => {
    const validWeekSession = {
      order: 1,
      sessionType: 'base',
      pelotonClassTypes: ['endurance'],
      suggestedDurationMinutes: 45,
      description: 'Steady block',
      preferredDay: 2,
    };

    it('accepts a minimal valid training block', () => {
      const result = createTrainingBlockSchema.safeParse(buildValidTrainingBlock());
      expect(result.success).toBe(true);
    });

    it('accepts optional fields on boundary values', () => {
      const lowBound = createTrainingBlockSchema.safeParse(
        buildValidTrainingBlock({
          daysPerWeek: 2,
          weeklyHoursAvailable: 1,
          preferredDays: [0, 6],
          weeklySessions: [
            {
              ...validWeekSession,
              order: 1,
              preferredDay: 0,
            },
          ],
          experienceLevel: 'advanced',
        })
      );
      const highBound = createTrainingBlockSchema.safeParse(
        buildValidTrainingBlock({
          daysPerWeek: 5,
          weeklyHoursAvailable: 20,
          preferredDays: [0, 6],
          weeklySessions: [
            {
              ...validWeekSession,
              order: 1,
              preferredDay: 6,
            },
          ],
          experienceLevel: 'advanced',
        })
      );

      expect(lowBound.success).toBe(true);
      expect(highBound.success).toBe(true);
    });

    it('rejects empty and excessive goals', () => {
      const emptyGoals = createTrainingBlockSchema.safeParse(buildValidTrainingBlock({ goals: [] }));
      const tooManyGoals = createTrainingBlockSchema.safeParse(
        buildValidTrainingBlock({
          goals: ['regain_fitness', 'maintain_muscle', 'lose_weight', 'regain_fitness'],
        })
      );
      expect(emptyGoals.success).toBe(false);
      expect(tooManyGoals.success).toBe(false);
    });

    it('rejects invalid goals and out-of-range session fields', () => {
      const invalidGoal = createTrainingBlockSchema.safeParse(
        buildValidTrainingBlock({ goals: ['regain_fitness', 'expert'] as Array<string> })
      );
      const outOfRangeDays = createTrainingBlockSchema.safeParse(
        buildValidTrainingBlock({ daysPerWeek: 1, weeklyHoursAvailable: 21 })
      );
      const outOfRangePreferredDay = createTrainingBlockSchema.safeParse(
        buildValidTrainingBlock({
          weeklySessions: [
            {
              ...validWeekSession,
              preferredDay: 7,
            },
          ],
        })
      );
      expect(invalidGoal.success).toBe(false);
      expect(outOfRangeDays.success).toBe(false);
      expect(outOfRangePreferredDay.success).toBe(false);
    });

    it('rejects invalid weekly session shape', () => {
      const emptySessionType = createTrainingBlockSchema.safeParse(
        buildValidTrainingBlock({
          weeklySessions: [
            {
              order: 1,
              sessionType: '',
              pelotonClassTypes: [],
              suggestedDurationMinutes: 30,
              description: '',
            },
          ],
        })
      );
      const nonPositiveOrder = createTrainingBlockSchema.safeParse(
        buildValidTrainingBlock({
          weeklySessions: [
            {
              ...validWeekSession,
              order: 0,
            },
          ],
        })
      );
      const zeroDuration = createTrainingBlockSchema.safeParse(
        buildValidTrainingBlock({
          weeklySessions: [
            {
              ...validWeekSession,
              suggestedDurationMinutes: 0,
            },
          ],
        })
      );

      expect(emptySessionType.success).toBe(false);
      expect(nonPositiveOrder.success).toBe(false);
      expect(zeroDuration.success).toBe(false);
    });
  });

  describe('generateScheduleSchema', () => {
    it('accepts valid request with ftp', () => {
      const withFtp = generateScheduleSchema.safeParse(buildValidGenerateSchedule({ ftp: 275 }));
      const withoutFtp = generateScheduleSchema.safeParse(buildValidGenerateSchedule({ ftp: undefined }));

      expect(withFtp.success).toBe(true);
      expect(withoutFtp.success).toBe(true);
    });

    it('accepts sessionsPerWeek and hourly boundaries', () => {
      const minSessions = generateScheduleSchema.safeParse(
        buildValidGenerateSchedule({ sessionsPerWeek: 2, preferredDays: [1, 2] })
      );
      const maxSessions = generateScheduleSchema.safeParse(
        buildValidGenerateSchedule({ sessionsPerWeek: 5, preferredDays: [1, 2, 3, 4, 5] })
      );
      const minHours = generateScheduleSchema.safeParse(buildValidGenerateSchedule({ weeklyHoursAvailable: 1 }));
      const maxHours = generateScheduleSchema.safeParse(buildValidGenerateSchedule({ weeklyHoursAvailable: 20 }));

      expect(minSessions.success).toBe(true);
      expect(maxSessions.success).toBe(true);
      expect(minHours.success).toBe(true);
      expect(maxHours.success).toBe(true);
    });

    it('rejects goals, experience, and preferred day violations', () => {
      const emptyGoals = generateScheduleSchema.safeParse(buildValidGenerateSchedule({ goals: [] }));
      const tooManyGoals = generateScheduleSchema.safeParse(
        buildValidGenerateSchedule({
          goals: ['regain_fitness', 'maintain_muscle', 'lose_weight', 'maintain_muscle'],
        })
      );
      const invalidExperience = generateScheduleSchema.safeParse(
        buildValidGenerateSchedule({ experienceLevel: 'expert' as 'beginner' })
      );
      const invalidPreferredDay = generateScheduleSchema.safeParse(
        buildValidGenerateSchedule({ preferredDays: [0, 7] })
      );
      expect(emptyGoals.success).toBe(false);
      expect(tooManyGoals.success).toBe(false);
      expect(invalidExperience.success).toBe(false);
      expect(invalidPreferredDay.success).toBe(false);
    });

    it('rejects out-of-range sessionsPerWeek, ftp, and preferred day values', () => {
      const sessionsLow = generateScheduleSchema.safeParse(buildValidGenerateSchedule({ sessionsPerWeek: 1 }));
      const sessionsHigh = generateScheduleSchema.safeParse(buildValidGenerateSchedule({ sessionsPerWeek: 6 }));
      const invalidFtp = generateScheduleSchema.safeParse(buildValidGenerateSchedule({ ftp: 0 }));
      const invalidFtpHigh = generateScheduleSchema.safeParse(buildValidGenerateSchedule({ ftp: 501 }));

      expect(sessionsLow.success).toBe(false);
      expect(sessionsHigh.success).toBe(false);
      expect(invalidFtp.success).toBe(false);
      expect(invalidFtpHigh.success).toBe(false);
    });
  });

  describe('createWeightGoalSchema', () => {
    it('accepts valid weight goal payload', () => {
      const result = createWeightGoalSchema.safeParse(buildValidWeightGoal());
      expect(result.success).toBe(true);
    });

    it('rejects non-positive and overweight targets with bad dates', () => {
      const base = buildValidWeightGoal();
      const nonPositiveStart = createWeightGoalSchema.safeParse({ ...base, startWeightLbs: 0 });
      const overweight = createWeightGoalSchema.safeParse({ ...base, targetWeightLbs: 501 });
      const badStartDate = createWeightGoalSchema.safeParse({ ...base, startDate: '02/01/2026' });
      const badTargetDate = createWeightGoalSchema.safeParse({ ...base, targetDate: '2026-2-30' });

      expect(nonPositiveStart.success).toBe(false);
      expect(overweight.success).toBe(false);
      expect(badStartDate.success).toBe(false);
      expect(badTargetDate.success).toBe(false);
    });
  });

  describe('stravaCallbackSchema', () => {
    it('accepts code and optional state/scope', () => {
      const withOptions = stravaCallbackSchema.safeParse({
        code: 'abc123',
        state: 'client-state',
        scope: 'activity:read',
      });
      const requiredOnly = stravaCallbackSchema.safeParse({ code: 'abc123' });

      expect(withOptions.success).toBe(true);
      expect(requiredOnly.success).toBe(true);
    });

    it('rejects empty or missing code', () => {
      const empty = stravaCallbackSchema.safeParse({ code: '' });
      const missing = stravaCallbackSchema.safeParse({ state: 'x' });
      expect(empty.success).toBe(false);
      expect(missing.success).toBe(false);
    });
  });

  describe('syncStravaTokensSchema', () => {
    const validTokens = {
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresAt: 1700000000,
      athleteId: 12345,
    };

    it('accepts valid token payload', () => {
      expect(syncStravaTokensSchema.safeParse(validTokens).success).toBe(true);
    });

    it('rejects invalid token payloads', () => {
      const emptyAccess = syncStravaTokensSchema.safeParse({ ...validTokens, accessToken: '' });
      const emptyRefresh = syncStravaTokensSchema.safeParse({ ...validTokens, refreshToken: '' });
      const invalidExpires = syncStravaTokensSchema.safeParse({ ...validTokens, expiresAt: 0 });
      const invalidAthlete = syncStravaTokensSchema.safeParse({ ...validTokens, athleteId: -1 });
      const decimalExpires = syncStravaTokensSchema.safeParse({ ...validTokens, expiresAt: 1700000000.5 });

      expect(emptyAccess.success).toBe(false);
      expect(emptyRefresh.success).toBe(false);
      expect(invalidExpires.success).toBe(false);
      expect(invalidAthlete.success).toBe(false);
      expect(decimalExpires.success).toBe(false);
    });
  });

  describe('stravaWebhookValidationSchema', () => {
    it('accepts valid webhook subscribe challenge payload', () => {
      const result = stravaWebhookValidationSchema.safeParse({
        'hub.mode': 'subscribe',
        'hub.challenge': 'challenge-123',
        'hub.verify_token': 'verify-token',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid mode and empty verification strings', () => {
      const wrongMode = stravaWebhookValidationSchema.safeParse({
        'hub.mode': 'unsubscribe',
        'hub.challenge': 'challenge-123',
        'hub.verify_token': 'verify-token',
      });
      const emptyChallenge = stravaWebhookValidationSchema.safeParse({
        'hub.mode': 'subscribe',
        'hub.challenge': '',
        'hub.verify_token': 'verify-token',
      });
      const emptyVerifyToken = stravaWebhookValidationSchema.safeParse({
        'hub.mode': 'subscribe',
        'hub.challenge': 'challenge-123',
        'hub.verify_token': '',
      });

      expect(wrongMode.success).toBe(false);
      expect(emptyChallenge.success).toBe(false);
      expect(emptyVerifyToken.success).toBe(false);
    });
  });

  describe('stravaWebhookEventSchema', () => {
    const validActivityEvent = {
      aspect_type: 'create',
      event_time: 1700000000,
      object_id: 111,
      object_type: 'activity',
      owner_id: 222,
      subscription_id: 333,
    };

    it('accepts activity and athlete events', () => {
      const activity = stravaWebhookEventSchema.safeParse(validActivityEvent);
      const athlete = stravaWebhookEventSchema.safeParse({
        ...validActivityEvent,
        object_type: 'athlete',
        object_id: 111,
      });
      const withUpdates = stravaWebhookEventSchema.safeParse({
        ...validActivityEvent,
        updates: {
          title: 'Morning ride',
          is_kom: true,
          nested: { value: 1 },
          list: ['a', 'b', 3],
        },
      });

      expect(activity.success).toBe(true);
      expect(athlete.success).toBe(true);
      expect(withUpdates.success).toBe(true);
    });

    it('rejects invalid aspect and object types', () => {
      const invalidAspect = stravaWebhookEventSchema.safeParse({ ...validActivityEvent, aspect_type: 'unknown' });
      const invalidObject = stravaWebhookEventSchema.safeParse({ ...validActivityEvent, object_type: 'route' });
      const invalidIds = stravaWebhookEventSchema.safeParse({ ...validActivityEvent, object_id: 0, event_time: 0 });

      expect(invalidAspect.success).toBe(false);
      expect(invalidObject.success).toBe(false);
      expect(invalidIds.success).toBe(false);
    });
  });

  describe('stravaWebhookSchema', () => {
    it('accepts both validation and event payloads', () => {
      const validation = stravaWebhookSchema.safeParse({
        'hub.mode': 'subscribe',
        'hub.challenge': 'challenge-123',
        'hub.verify_token': 'verify-token',
      });
      const event = stravaWebhookSchema.safeParse({
        aspect_type: 'update',
        event_time: 1700000000,
        object_id: 111,
        object_type: 'athlete',
        owner_id: 222,
        subscription_id: 333,
      });

      expect(validation.success).toBe(true);
      expect(event.success).toBe(true);
    });

    it('rejects payloads that match neither webhook branch', () => {
      const invalidWebhook = stravaWebhookSchema.safeParse({
        invalid: true,
      });
      const invalidLiteral = stravaWebhookSchema.safeParse({
        aspect_type: 'create',
        event_time: 1700000000,
        object_id: 111,
        object_type: 'route',
        owner_id: 222,
        subscription_id: 333,
      });
      const invalidHubMode = stravaWebhookSchema.safeParse({
        'hub.mode': 'unsubscribe',
        'hub.challenge': 'challenge-123',
        'hub.verify_token': 'verify-token',
      });

      expect(invalidWebhook.success).toBe(false);
      expect(invalidLiteral.success).toBe(false);
      expect(invalidHubMode.success).toBe(false);
    });
  });

  describe('calculateVO2MaxSchema', () => {
    it('accepts lower and upper boundaries', () => {
      const low = calculateVO2MaxSchema.safeParse({ weightKg: 0.1 });
      const high = calculateVO2MaxSchema.safeParse({ weightKg: 300 });
      const normal = calculateVO2MaxSchema.safeParse({ weightKg: 75 });

      expect(low.success).toBe(true);
      expect(high.success).toBe(true);
      expect(normal.success).toBe(true);
    });

    it('rejects non-positive, negative, and overweight values', () => {
      const zero = calculateVO2MaxSchema.safeParse({ weightKg: 0 });
      const negative = calculateVO2MaxSchema.safeParse({ weightKg: -20 });
      const tooHigh = calculateVO2MaxSchema.safeParse({ weightKg: 301 });
      expect(zero.success).toBe(false);
      expect(negative.success).toBe(false);
      expect(tooHigh.success).toBe(false);
    });
  });

  describe('updateCyclingProfileSchema', () => {
    it('accepts required weight and full profile payload', () => {
      const minimal = updateCyclingProfileSchema.safeParse({ weightKg: 175 });
      const full = updateCyclingProfileSchema.safeParse({
        weightKg: 175,
        maxHR: 192,
        restingHR: 52,
      });

      expect(minimal.success).toBe(true);
      expect(full.success).toBe(true);
    });

    it('rejects non-integer and out-of-range values', () => {
      const nonInteger = updateCyclingProfileSchema.safeParse({ weightKg: 175, maxHR: 150.5 });
      const maxHrTooHigh = updateCyclingProfileSchema.safeParse({ weightKg: 175, maxHR: 251 });
      const restingHrTooHigh = updateCyclingProfileSchema.safeParse({ weightKg: 175, restingHR: 151 });
      const invalidWeight = updateCyclingProfileSchema.safeParse({ weightKg: 0 });

      expect(nonInteger.success).toBe(false);
      expect(maxHrTooHigh.success).toBe(false);
      expect(restingHrTooHigh.success).toBe(false);
      expect(invalidWeight.success).toBe(false);
    });
  });

  describe('createCyclingActivitySchema', () => {
    it('accepts minimal valid payload', () => {
      const result = createCyclingActivitySchema.safeParse(buildValidCyclingActivity());
      expect(result.success).toBe(true);
    });

    it('accepts optional fields and completion metadata', () => {
      const result = createCyclingActivitySchema.safeParse(
        buildValidCyclingActivity({
          ef: 0.78,
          peak5MinPower: 320,
          peak20MinPower: 290,
          hrCompleteness: 0,
          userId: 'user-123',
          createdAt: '2026-02-10T12:00:00.000Z',
        })
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.ef).toBe(0.78);
        expect(result.data.peak5MinPower).toBe(320);
        expect(result.data.peak20MinPower).toBe(290);
        expect(result.data.hrCompleteness).toBe(0);
        expect(result.data.userId).toBe('user-123');
      }
    });

    it('accepts hrCompleteness upper boundary', () => {
      const result = createCyclingActivitySchema.safeParse(buildValidCyclingActivity({ hrCompleteness: 100 }));
      expect(result.success).toBe(true);
    });

    it('rejects invalid enums and constrained numeric values', () => {
      const invalidType = createCyclingActivitySchema.safeParse(
        buildValidCyclingActivity({ type: 'sprint' as 'threshold' })
      );
      const invalidSource = createCyclingActivitySchema.safeParse(
        buildValidCyclingActivity({ source: 'garmin' as 'strava' })
      );
      const nonPositive = createCyclingActivitySchema.safeParse(
        buildValidCyclingActivity({
          durationMinutes: 0,
          avgPower: -1,
          tss: -1,
        })
      );
      const invalidOptionalHrCompleteness = createCyclingActivitySchema.safeParse(
        buildValidCyclingActivity({ hrCompleteness: -1 })
      );
      const overOptionalHrCompleteness = createCyclingActivitySchema.safeParse(
        buildValidCyclingActivity({ hrCompleteness: 101 })
      );

      expect(invalidType.success).toBe(false);
      expect(invalidSource.success).toBe(false);
      expect(nonPositive.success).toBe(false);
      expect(invalidOptionalHrCompleteness.success).toBe(false);
      expect(overOptionalHrCompleteness.success).toBe(false);
    });
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
