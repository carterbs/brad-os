import { describe, expect, it } from 'vitest';
import {
  calculateVO2MaxSchema,
  createCyclingActivitySchema,
  createFTPEntrySchema,
  createWeightGoalSchema,
  cyclingActivityDocSchema,
  ftpSourceSchema,
  stravaCallbackSchema,
  stravaWebhookEventSchema,
  stravaWebhookSchema,
  stravaWebhookValidationSchema,
  syncStravaTokensSchema,
  updateCyclingProfileSchema,
} from './cycling.schema.js';

const validActivity = {
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

describe('cycling schemas', () => {
  it('validates FTP entries', () => {
    expect(ftpSourceSchema.safeParse('manual').success).toBe(true);
    expect(ftpSourceSchema.safeParse('test').success).toBe(true);
    expect(ftpSourceSchema.safeParse('auto').success).toBe(false);

    const valid = { value: 250, date: '2026-02-20', source: 'manual' };
    expect(createFTPEntrySchema.safeParse(valid).success).toBe(true);
    expect(createFTPEntrySchema.safeParse({ ...valid, value: 0 }).success).toBe(false);
    expect(createFTPEntrySchema.safeParse({ ...valid, value: 501 }).success).toBe(false);
    expect(createFTPEntrySchema.safeParse({ ...valid, date: '02/20/2026' }).success).toBe(false);
  });

  it('validates weight goals', () => {
    const valid = {
      targetWeightLbs: 175,
      targetDate: '2026-06-01',
      startWeightLbs: 185,
      startDate: '2026-02-20',
    };
    expect(createWeightGoalSchema.safeParse(valid).success).toBe(true);
    expect(createWeightGoalSchema.safeParse({ ...valid, targetWeightLbs: 0 }).success).toBe(false);
    expect(createWeightGoalSchema.safeParse({ ...valid, targetDate: 'June 1' }).success).toBe(false);
  });

  it('validates Strava OAuth and token sync payloads', () => {
    expect(stravaCallbackSchema.safeParse({ code: 'abc', state: 'state' }).success).toBe(true);
    expect(stravaCallbackSchema.safeParse({ code: '' }).success).toBe(false);

    const tokens = {
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresAt: 1_700_000_000,
      athleteId: 12345,
    };
    expect(syncStravaTokensSchema.safeParse(tokens).success).toBe(true);
    expect(syncStravaTokensSchema.safeParse({ ...tokens, accessToken: '' }).success).toBe(false);
    expect(syncStravaTokensSchema.safeParse({ ...tokens, athleteId: 0 }).success).toBe(false);
  });

  it('validates Strava webhook verification and activity events', () => {
    const validation = {
      'hub.mode': 'subscribe',
      'hub.challenge': 'challenge',
      'hub.verify_token': 'verify',
    };
    const event = {
      aspect_type: 'create',
      event_time: 1_700_000_000,
      object_id: 111,
      object_type: 'activity',
      owner_id: 222,
      subscription_id: 333,
    };
    expect(stravaWebhookValidationSchema.safeParse(validation).success).toBe(true);
    expect(stravaWebhookEventSchema.safeParse(event).success).toBe(true);
    expect(stravaWebhookSchema.safeParse(validation).success).toBe(true);
    expect(stravaWebhookSchema.safeParse(event).success).toBe(true);
    expect(stravaWebhookEventSchema.safeParse({ ...event, aspect_type: 'rename' }).success).toBe(false);
    expect(stravaWebhookEventSchema.safeParse({ ...event, object_type: 'segment' }).success).toBe(false);
  });

  it('validates retained ride-analysis inputs', () => {
    expect(calculateVO2MaxSchema.safeParse({ weightKg: 75 }).success).toBe(true);
    expect(calculateVO2MaxSchema.safeParse({ weightKg: 0 }).success).toBe(false);
    expect(
      updateCyclingProfileSchema.safeParse({ weightKg: 75, maxHR: 185, restingHR: 50 }).success
    ).toBe(true);
    expect(updateCyclingProfileSchema.safeParse({ weightKg: 75, maxHR: 251 }).success).toBe(false);
  });

  it('validates stored Strava activities and optional stream-derived metrics', () => {
    expect(createCyclingActivitySchema.safeParse(validActivity).success).toBe(true);
    expect(
      createCyclingActivitySchema.safeParse({
        ...validActivity,
        ef: 1.55,
        peak5MinPower: 320,
        peak20MinPower: 270,
        hrCompleteness: 98,
      }).success
    ).toBe(true);
    expect(createCyclingActivitySchema.safeParse({ ...validActivity, source: 'peloton' }).success)
      .toBe(false);
    expect(createCyclingActivitySchema.safeParse({ ...validActivity, hrCompleteness: 101 }).success)
      .toBe(false);
  });

  it('requires persistence fields for stored activity documents', () => {
    expect(
      cyclingActivityDocSchema.safeParse({
        ...validActivity,
        userId: 'user-1',
        createdAt: '2026-02-20T12:00:00.000Z',
      }).success
    ).toBe(true);
    expect(
      cyclingActivityDocSchema.safeParse({
        ...validActivity,
        createdAt: '2026-02-20T12:00:00.000Z',
      }).success
    ).toBe(false);
  });
});
