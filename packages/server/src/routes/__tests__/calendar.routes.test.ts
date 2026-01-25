import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { setupTestApp, teardownTestApp, type TestContext } from '../../test/test-app.js';
import type { ApiResult, CalendarDataResponse } from '@brad-os/shared';

describe('Calendar Routes', () => {
  let ctx: TestContext;
  let app: Express;

  beforeEach(() => {
    ctx = setupTestApp(false); // no seeds needed for most tests
    app = ctx.app;
  });

  afterEach(() => {
    teardownTestApp(ctx);
  });

  describe('GET /api/calendar/:year/:month', () => {
    it('should return calendar data for valid year and month', async () => {
      const response = await request(app).get('/api/calendar/2024/6');
      const body = response.body as ApiResult<CalendarDataResponse>;

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      if (body.success) {
        expect(body.data.startDate).toBe('2024-06-01');
        expect(body.data.endDate).toBe('2024-06-30');
        expect(body.data.days).toBeDefined();
        expect(typeof body.data.days).toBe('object');
      }
    });

    it('should return calendar data for January (month 1)', async () => {
      const response = await request(app).get('/api/calendar/2024/1');
      const body = response.body as ApiResult<CalendarDataResponse>;

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      if (body.success) {
        expect(body.data.startDate).toBe('2024-01-01');
        expect(body.data.endDate).toBe('2024-01-31');
      }
    });

    it('should return calendar data for December (month 12)', async () => {
      const response = await request(app).get('/api/calendar/2024/12');
      const body = response.body as ApiResult<CalendarDataResponse>;

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      if (body.success) {
        expect(body.data.startDate).toBe('2024-12-01');
        expect(body.data.endDate).toBe('2024-12-31');
      }
    });

    it('should return empty days when no activities exist', async () => {
      const response = await request(app).get('/api/calendar/2024/6');
      const body = response.body as ApiResult<CalendarDataResponse>;

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      if (body.success) {
        expect(Object.keys(body.data.days)).toHaveLength(0);
      }
    });

    describe('invalid month parameter', () => {
      it('should return 400 for month 0', async () => {
        const response = await request(app).get('/api/calendar/2024/0');
        const body = response.body as ApiResult<never>;

        expect(response.status).toBe(400);
        expect(body.success).toBe(false);
        if (!body.success) {
          expect(body.error.code).toBe('VALIDATION_ERROR');
          expect(body.error.message).toContain('month');
        }
      });

      it('should return 400 for month 13', async () => {
        const response = await request(app).get('/api/calendar/2024/13');
        const body = response.body as ApiResult<never>;

        expect(response.status).toBe(400);
        expect(body.success).toBe(false);
        if (!body.success) {
          expect(body.error.code).toBe('VALIDATION_ERROR');
          expect(body.error.message).toContain('month');
        }
      });

      it('should return 400 for negative month', async () => {
        const response = await request(app).get('/api/calendar/2024/-1');
        const body = response.body as ApiResult<never>;

        expect(response.status).toBe(400);
        expect(body.success).toBe(false);
        if (!body.success) {
          expect(body.error.code).toBe('VALIDATION_ERROR');
          expect(body.error.message).toContain('month');
        }
      });

      it('should return 400 for non-numeric month', async () => {
        const response = await request(app).get('/api/calendar/2024/abc');
        const body = response.body as ApiResult<never>;

        expect(response.status).toBe(400);
        expect(body.success).toBe(false);
        if (!body.success) {
          expect(body.error.code).toBe('VALIDATION_ERROR');
          expect(body.error.message).toContain('month');
        }
      });
    });

    describe('invalid year parameter', () => {
      it('should return 400 for non-4-digit year (3 digits)', async () => {
        const response = await request(app).get('/api/calendar/999/6');
        const body = response.body as ApiResult<never>;

        expect(response.status).toBe(400);
        expect(body.success).toBe(false);
        if (!body.success) {
          expect(body.error.code).toBe('VALIDATION_ERROR');
          expect(body.error.message).toContain('year');
        }
      });

      it('should return 400 for non-4-digit year (5 digits)', async () => {
        const response = await request(app).get('/api/calendar/10000/6');
        const body = response.body as ApiResult<never>;

        expect(response.status).toBe(400);
        expect(body.success).toBe(false);
        if (!body.success) {
          expect(body.error.code).toBe('VALIDATION_ERROR');
          expect(body.error.message).toContain('year');
        }
      });

      it('should return 400 for non-numeric year', async () => {
        const response = await request(app).get('/api/calendar/abc/6');
        const body = response.body as ApiResult<never>;

        expect(response.status).toBe(400);
        expect(body.success).toBe(false);
        if (!body.success) {
          expect(body.error.code).toBe('VALIDATION_ERROR');
          expect(body.error.message).toContain('year');
        }
      });

      it('should return 400 for negative year', async () => {
        const response = await request(app).get('/api/calendar/-2024/6');
        const body = response.body as ApiResult<never>;

        expect(response.status).toBe(400);
        expect(body.success).toBe(false);
        if (!body.success) {
          expect(body.error.code).toBe('VALIDATION_ERROR');
          expect(body.error.message).toContain('year');
        }
      });
    });

    describe('edge cases', () => {
      it('should handle February correctly in a leap year', async () => {
        const response = await request(app).get('/api/calendar/2024/2');
        const body = response.body as ApiResult<CalendarDataResponse>;

        expect(response.status).toBe(200);
        expect(body.success).toBe(true);
        if (body.success) {
          expect(body.data.startDate).toBe('2024-02-01');
          expect(body.data.endDate).toBe('2024-02-29'); // 2024 is a leap year
        }
      });

      it('should handle February correctly in a non-leap year', async () => {
        const response = await request(app).get('/api/calendar/2023/2');
        const body = response.body as ApiResult<CalendarDataResponse>;

        expect(response.status).toBe(200);
        expect(body.success).toBe(true);
        if (body.success) {
          expect(body.data.startDate).toBe('2023-02-01');
          expect(body.data.endDate).toBe('2023-02-28'); // 2023 is not a leap year
        }
      });
    });
  });
});
