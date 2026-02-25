import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

const mockRecoveryService = vi.hoisted(() => ({
  addWeightEntries: vi.fn(),
}));

vi.mock('../firebase.js', () => ({
  getFirestoreDb: vi.fn(),
  getCollectionName: vi.fn((name: string) => name),
}));

vi.mock('../middleware/app-check.js', () => ({
  requireAppCheck: (_req: unknown, _res: unknown, next: () => void): void => {
    next();
  },
}));

vi.mock('../services/firestore-recovery.service.js', () => mockRecoveryService);

import { healthSyncApp } from './health-sync.js';

/**
 * Smoke tests verifying the test infrastructure (mocking, app initialization)
 * works for health-sync. These act as a canary: if mocking firebase/app-check
 * or importing the handler breaks, these fail loudly before deeper tests run.
 */
describe('health-sync app initialization smoke tests', () => {
  it('should initialize the Express app', () => {
    expect(healthSyncApp).toBeDefined();
    expect(healthSyncApp).not.toBeNull();
  });

  it('should accept a POST /weight/bulk request and return success', async () => {
    mockRecoveryService.addWeightEntries.mockResolvedValue(1);

    const response = await request(healthSyncApp)
      .post('/weight/bulk')
      .send({ weights: [{ weightLbs: 180, date: '2026-02-07' }] });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true });
    expect(mockRecoveryService.addWeightEntries).toHaveBeenCalledOnce();
  });
});
