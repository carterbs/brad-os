import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type Database from 'better-sqlite3';
import { setupTestApp, teardownTestApp, type TestContext } from '../../test/test-app.js';
import { StretchSessionRepository } from '../../repositories/stretchSession.repository.js';
import type { ApiResult, StretchSessionRecord } from '@brad-os/shared';

describe('Stretch Session Routes', () => {
  let ctx: TestContext;
  let app: Express;
  let db: Database.Database;
  let repository: StretchSessionRepository;

  beforeEach(() => {
    ctx = setupTestApp(false); // no seeds needed
    app = ctx.app;
    db = ctx.db;
    repository = new StretchSessionRepository(db);
  });

  afterEach(() => {
    teardownTestApp(ctx);
  });

  describe('GET /api/stretch-sessions/:id', () => {
    it('should return 200 with session when found', async () => {
      // Create a stretch session
      const session = repository.create({
        completedAt: new Date().toISOString(),
        totalDurationSeconds: 600,
        regionsCompleted: 3,
        regionsSkipped: 1,
        stretches: [
          {
            region: 'neck',
            stretchId: 'neck-forward-tilt',
            stretchName: 'Forward Tilt',
            durationSeconds: 60,
            skippedSegments: 0,
          },
          {
            region: 'shoulders',
            stretchId: 'shoulders-cross-body',
            stretchName: 'Cross-Body Stretch',
            durationSeconds: 120,
            skippedSegments: 1,
          },
        ],
      });

      const response = await request(app).get(`/api/stretch-sessions/${session.id}`);
      const body = response.body as ApiResult<StretchSessionRecord>;

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      if (body.success) {
        expect(body.data.id).toBe(session.id);
        expect(body.data.totalDurationSeconds).toBe(600);
        expect(body.data.regionsCompleted).toBe(3);
        expect(body.data.regionsSkipped).toBe(1);
        expect(body.data.stretches).toHaveLength(2);
        expect(body.data.stretches[0]?.stretchName).toBe('Forward Tilt');
      }
    });

    it('should return 404 when session not found', async () => {
      const response = await request(app).get('/api/stretch-sessions/non-existent-id');
      const body = response.body as ApiResult<StretchSessionRecord>;

      expect(response.status).toBe(404);
      expect(body.success).toBe(false);
      if (!body.success) {
        expect(body.error.code).toBe('NOT_FOUND');
      }
    });

    it('should return full stretch details including skipped segments', async () => {
      const session = repository.create({
        completedAt: new Date().toISOString(),
        totalDurationSeconds: 300,
        regionsCompleted: 1,
        regionsSkipped: 0,
        stretches: [
          {
            region: 'back',
            stretchId: 'back-cat-cow',
            stretchName: 'Cat-Cow',
            durationSeconds: 60,
            skippedSegments: 2, // fully skipped
          },
        ],
      });

      const response = await request(app).get(`/api/stretch-sessions/${session.id}`);
      const body = response.body as ApiResult<StretchSessionRecord>;

      expect(response.status).toBe(200);
      if (body.success) {
        expect(body.data.stretches[0]?.skippedSegments).toBe(2);
      }
    });
  });
});
