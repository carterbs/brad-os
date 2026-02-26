import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z, ZodError } from 'zod';
import { validate, validateParams, validateQuery } from './validate.js';
import { errorHandler } from './error-handler.js';

describe('validate middleware', () => {
  describe('validate (body)', () => {
    it('should assign validated payload to req.body', async () => {
      const app = express();
      app.use(express.json());
      app.post(
        '/',
        validate(z.object({ limit: z.coerce.number().min(1).max(10) })),
        (req, res) => {
          res.json({ limit: req.body.limit });
        }
      );
      app.use(errorHandler);

      const response = await request(app).post('/').send({ limit: '5' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ limit: 5 });
    });

    it('should reject invalid body payload as validation error', async () => {
      const app = express();
      app.use(express.json());
      app.post(
        '/',
        validate(z.object({ limit: z.coerce.number().min(1) })),
        (_req, res) => {
          res.status(201).json({});
        }
      );
      app.use(errorHandler);

      const response = await request(app).post('/').send({ limit: 'not-a-number' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should throw ZodError for invalid payload in middleware', () => {
      const middleware = validate(z.object({ limit: z.coerce.number().min(1) }));
      const req = { body: { limit: 'not-a-number' } };
      const next = vi.fn();

      expect(() => {
        middleware(req, {}, next);
      }).toThrow(ZodError);
    });
  });

  describe('validateParams', () => {
    it('should assign parsed params to req.params', async () => {
      const app = express();
      app.get(
        '/:week',
        validateParams(z.object({ week: z.coerce.number().min(1) })),
        (req, res) => {
          res.json({ week: req.params.week });
        }
      );
      app.use(errorHandler);

      const response = await request(app).get('/3');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ week: 3 });
    });

    it('should reject invalid params payload as validation error', async () => {
      const app = express();
      app.get(
        '/:week',
        validateParams(z.object({ week: z.coerce.number().min(1) })),
        (_req, res) => {
          res.json({});
        }
      );
      app.use(errorHandler);

      const response = await request(app).get('/zero');

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should throw ZodError when params payload fails schema validation', () => {
      const middleware = validateParams(z.object({ week: z.coerce.number().min(1) }));
      const req = { params: { week: 'zero' } };
      const next = vi.fn();

      expect(() => {
        middleware(req, {}, next);
      }).toThrow(ZodError);
    });
  });

  describe('validateQuery', () => {
    it('should assign parsed query to req.query', async () => {
      const app = express();
      app.get(
        '/',
        validateQuery(z.object({ userId: z.string().min(1) })),
        (req, res) => {
          res.json({ userId: req.query.userId });
        }
      );
      app.use(errorHandler);

      const response = await request(app).get('/?userId=abc');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ userId: 'abc' });
    });

    it('should reject invalid query payload as validation error', async () => {
      const app = express();
      app.get(
        '/',
        validateQuery(z.object({ userId: z.string().min(3) })),
        (_req, res) => {
          res.json({});
        }
      );
      app.use(errorHandler);

      const response = await request(app).get('/?userId=ab');

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should throw ZodError when query payload fails schema validation', () => {
      const middleware = validateQuery(z.object({ userId: z.string().min(3) }));
      const req = { query: { userId: 'ab' } };
      const next = vi.fn();

      expect(() => {
        middleware(req, {}, next);
      }).toThrow(ZodError);
    });
  });
});
