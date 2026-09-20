import express from 'express';
import { describe, expect, it } from 'vitest';
import { createLiveHttpHarness } from './live/live-http.js';

describe('live evaluation HTTP transport', () => {
  it('reuses bounded connections for many real requests and closes them', async () => {
    const app = express();
    app.use(express.json());
    app.get('/health', (_req, res) => res.json({ status: 'healthy' }));
    app.post('/echo', (req, res) => res.status(201).json(req.body as unknown));
    const http = await createLiveHttpHarness(app);
    try {
      for (let index = 0; index < 250; index++) {
        const response = await http.post('/echo').send({ index });
        expect(response.status).toBe(201);
        expect(response.body).toEqual({ index });
      }
      expect(http.stats().acceptedConnections).toBe(1);
      const responses = await Promise.all(Array.from({ length: 100 }, async () =>
        http.get('/health')));
      expect(responses.every((response) => response.status === 200)).toBe(true);
      expect(http.stats().acceptedConnections).toBeLessThanOrEqual(50);
      expect(http.stats().peakConnections).toBeGreaterThan(1);
      expect(http.stats().peakConnections).toBeLessThanOrEqual(50);
      expect(http.stats().listening).toBe(true);
    } finally {
      await http.close();
    }
    expect(http.stats().openConnections).toBe(0);
    expect(http.stats().listening).toBe(false);
    await http.close();
    expect(() => http.get('/health')).toThrow('closed');
  });

  it('allows handlers to overlap for the existing concurrent-save test', async () => {
    const app = express();
    let arrivals = 0;
    let release: (() => void) | undefined;
    const bothArrived = new Promise<void>((resolve) => { release = resolve; });
    app.post('/concurrent', async (_req, res) => {
      arrivals++;
      if (arrivals === 2) release?.();
      await bothArrived;
      res.json({ arrivals });
    });
    const http = await createLiveHttpHarness(app);
    try {
      const responses = await Promise.all([http.post('/concurrent'), http.post('/concurrent')]);
      expect(responses.map((response) => response.status)).toEqual([200, 200]);
      expect(arrivals).toBe(2);
      expect(http.stats().acceptedConnections).toBe(2);
    } finally {
      await http.close();
    }
  });
});
